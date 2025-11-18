import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Repositories } from './collection';
import { Repository, FeedType, SearchResult } from '../types';
import S3Service from '../clients/s3';

// Create S3Service instance
let s3Service: S3Service;

function getS3Service(): S3Service {
  if (!s3Service) {
    s3Service = new S3Service();
  }
  return s3Service;
}

async function findRepositoryById(repositoryId: string): Promise<Repository | undefined> {
  return await Repositories.findOneAsync({ _id: repositoryId });
}

async function findRepositoryByOwnerRepo(owner: string, repo: string): Promise<Repository | undefined> {
  return await Repositories.findOneAsync({ 
    owner: owner.toLowerCase(), 
    repo: repo.toLowerCase() 
  });
}

async function updateRepositoryStatus(
  repositoryId: string, 
  status: Repository['status'], 
  additionalFields: Partial<Repository> = {}
): Promise<number> {
  const updateData = {
    status,
    lastUpdate: new Date(),
    ...additionalFields
  };
  
  return await Repositories.updateAsync(repositoryId, { $set: updateData });
}

async function generateRSSFeeds(repository: Repository): Promise<Record<FeedType, string>> {
  // Generate feed URLs (will point to S3 direct public URLs)
  const repoPath = `${repository.owner}-${repository.repo}`;
  
  // Get S3 settings to generate direct URLs
  const awsSettings = Meteor.settings.private?.aws;
  if (!awsSettings?.s3Bucket || !awsSettings?.region) {
    throw new Error('S3 configuration not available');
  }
  
  const s3BaseUrl = `https://${awsSettings.s3Bucket}.s3.${awsSettings.region}.amazonaws.com/rss/${repoPath}`;
  
  const feeds: Record<FeedType, string> = {
    issues: `${s3BaseUrl}/issues.xml`,
    pullRequests: `${s3BaseUrl}/pullRequests.xml`,
    discussions: `${s3BaseUrl}/discussions.xml`,
    releases: `${s3BaseUrl}/releases.xml`
  };
  
  
  const feedTypes: FeedType[] = ['issues', 'pullRequests', 'releases'];
  const rssContents: Record<string, string> = {};
  
  for (const feedType of feedTypes) {
    const githubData = await fetchGitHubData(repository.owner, repository.repo, feedType);
    const rssContent = generateRSSWithGitHubData(repository, feedType, githubData);
    
    rssContents[feedType] = rssContent;
  }
  
  const emptyDiscussionsRss = generateRSSWithGitHubData(repository, 'discussions', []);
  rssContents['discussions'] = emptyDiscussionsRss;

  const s3 = getS3Service();
  await s3.uploadAllRSSToS3(repoPath, rssContents);

  return feeds;
}

// Helper function to check if GitHub repository exists
async function checkGitHubRepositoryExists(owner: string, repo: string): Promise<boolean> {
  const fetch = require('node-fetch');
  
  const githubToken = process.env.GITHUB_TOKEN;
  
  const headers: any = {
    'User-Agent': 'GitHub-RSS-Generator/1.0',
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  
  try {
    const response = await fetch(url, { headers });
    return response.ok;
  } catch (error) {
    return false;
  }
}

Meteor.methods({
  async 'repositories.search'(githubUrl: string): Promise<SearchResult> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
    
    // Check if repository exists on GitHub
    const githubExists = await checkGitHubRepositoryExists(owner, repo);
    if (!githubExists) {
      throw new Meteor.Error('repository-not-found', `Repository ${owner}/${repo} not found on GitHub`);
    }
    
    const existingRepo = await findRepositoryByOwnerRepo(owner, repo);
    
    return {
      found: !!existingRepo,
      repository: existingRepo ?? undefined,
      parsedUrl: { owner, repo, fullUrl }
    };
  },

  async 'repositories.create'(githubUrl: string): Promise<string> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
    
    const existingRepo = await findRepositoryByOwnerRepo(owner, repo);
    if (existingRepo) {
      throw new Meteor.Error('already-exists', 'Repository already exists in database');
    }
    
    const repositoryId = await Repositories.insertAsync({
      url: fullUrl,
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      createdAt: new Date(),
      lastUpdate: undefined,
      feeds: {},
      status: 'pending',
      error: undefined
    });
    
    Meteor.defer(async () => {
      try {
        await Meteor.callAsync('repositories.generateRSS', repositoryId);
      } catch (error: any) {
        console.error(`Auto RSS generation failed for ${owner}/${repo}:`, error.message);
      }
    });
    
    return repositoryId;
  },

  async 'repositories.getFeeds'(repositoryId: string): Promise<Repository['feeds']> {
    check(repositoryId, String);
    
    const repository = await findRepositoryById(repositoryId);
    if (!repository) {
      throw new Meteor.Error('not-found', 'Repository not found');
    }
    
    return repository.feeds;
  },

    // Get feeds with 30-minute cache
  async getFeedsWithCache(repositoryId: string) {
    check(repositoryId, String);
    
    const repository = await findRepositoryById(repositoryId);
    if (!repository) {
      throw new Meteor.Error('repository-not-found', 'Repository not found');
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const lastUpdate = repository.lastUpdate;
    
    if (!lastUpdate || lastUpdate <= thirtyMinutesAgo || !repository.feeds) {
      return await Meteor.callAsync('repositories.generateRSS', repositoryId);
    }
    
    return repository.feeds;
  },

  async 'repositories.getDirectRSSUrls'(repositoryId: string): Promise<Record<FeedType, string | null>> {
    check(repositoryId, String);
    
    const repository = await findRepositoryById(repositoryId);
    if (!repository) {
      throw new Meteor.Error('not-found', 'Repository not found');
    }

    const repoPath = `${repository.owner}-${repository.repo}`;
    const feedTypes: FeedType[] = ['issues', 'pullRequests', 'discussions', 'releases'];
    
    const directUrls: Record<FeedType, string | null> = {
      issues: null,
      pullRequests: null,
      discussions: null,
      releases: null
    };

    const s3 = getS3Service();
    
    for (const feedType of feedTypes) {
      const directUrl = s3.getS3RSSUrl(repoPath, feedType);
      directUrls[feedType] = directUrl;
    }
    
    return directUrls;
  },

  // Update repository status (used by cron job)
  async 'repositories.updateStatus'(
    repositoryId: string, 
    status: Repository['status'], 
    feeds?: Repository['feeds'], 
    error?: string
  ): Promise<number> {
    check(repositoryId, String);
    check(status, String);
    
    const additionalFields: Partial<Repository> = {};
    if (feeds) additionalFields.feeds = feeds;
    if (error) additionalFields.error = error;
    
    return await updateRepositoryStatus(repositoryId, status, additionalFields);
  },

  // Get all repositories that need RSS generation (for cron job)
  async 'repositories.getPending'(): Promise<Repository[]> {
    return await Repositories.find({
      status: { $in: ['pending', 'generating'] }
    }, {
      sort: { createdAt: 1 }
    }).fetchAsync();
  },

  // Get all repositories (for stats/admin)
  async 'repositories.getAll'(): Promise<Repository[]> {
    return await Repositories.find({}, {
      sort: { createdAt: -1 }
    }).fetchAsync();
  },

  // Force RSS generation
  async 'repositories.generateRSS'(repositoryId: string) {
    check(repositoryId, String);
    
    const repository = await findRepositoryById(repositoryId);
    if (!repository) {
      throw new Meteor.Error('repository-not-found', 'Repository not found');
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const lastUpdate = repository.lastUpdate;
    
    if (lastUpdate && lastUpdate > thirtyMinutesAgo && repository.status === 'ready') {
      return repository.feeds;
    }
    
    await updateRepositoryStatus(repositoryId, 'generating');
    const feeds = await generateRSSFeeds(repository);
    await updateRepositoryStatus(repositoryId, 'ready', { feeds, lastUpdate: new Date() });
    
    return feeds;
  }
});

// Helper function to parse GitHub URL
function parseGitHubUrl(githubUrl: string): { owner: string; repo: string; fullUrl: string } {
  const urlMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!urlMatch) {
    throw new Meteor.Error('invalid-url', 'Invalid GitHub URL format');
  }
  
  const [, owner, repo] = urlMatch;
  const cleanRepo = repo.replace(/\.git$/, '');
  
  return {
    owner,
    repo: cleanRepo,
    fullUrl: `https://github.com/${owner}/${cleanRepo}`
  };
}

// Helper function to fetch data from GitHub API
async function fetchGitHubData(owner: string, repo: string, feedType: FeedType): Promise<any[]> {
  const fetch = require('node-fetch');
  
  const githubToken = process.env.GITHUB_TOKEN;
  
  const headers: any = {
    'User-Agent': 'GitHub-RSS-Generator/1.0',
    'Accept': 'application/vnd.github.v3+json',
  };
  
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  
  const endpoints: Record<FeedType, string> = {
    issues: `https://api.github.com/repos/${owner}/${repo}/issues?state=all&sort=created&direction=desc&per_page=50`,
    pullRequests: `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=50`,
    releases: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`,
    discussions: `https://api.github.com/repos/${owner}/${repo}/discussions?per_page=50`
  };
  
  const url = endpoints[feedType];
  if (!url) return [];
  
  const response = await fetch(url, { headers });
  
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function processRSSItem(item: any, feedType: FeedType): { title: string; link: string; description: string; date: string } {
  let itemTitle = '';
  let itemLink = '';
  let itemDescription = '';
  let itemDate = '';
  
  switch (feedType) {
    case 'issues':
      itemTitle = `Issue #${item.number}: ${item.title}`;
      itemLink = item.html_url;
      itemDescription = item.body || 'No description provided';
      itemDate = item.created_at;
      break;
    case 'pullRequests':
      itemTitle = `Pull Request #${item.number}: ${item.title}`;
      itemLink = item.html_url;
      itemDescription = item.body || 'No description provided';
      itemDate = item.created_at;
      break;
    case 'discussions':
      itemTitle = item.title || `Discussion #${item.number}`;
      itemLink = item.html_url;
      itemDescription = item.body || 'No description provided';
      itemDate = item.created_at;
      break;
    case 'releases':
      itemTitle = `Release ${item.tag_name}: ${item.name || item.tag_name}`;
      itemLink = item.html_url;
      itemDescription = item.body || 'No release notes provided';
      itemDate = item.published_at || item.created_at;
      break;
    default:
      throw new Error(`Unknown feed type: ${feedType}`);
  }
  
  return { title: itemTitle, link: itemLink, description: itemDescription, date: itemDate };
}

function cleanDescription(description: string): string {
  const cleaned = description
    .replace(/```[\s\S]*?```/g, '[code block]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_]/g, '')
    .substring(0, 500);
  
  return cleaned.length < description.length ? cleaned + '...' : cleaned;
}

function generateRSSWithGitHubData(repository: Repository, feedType: FeedType, githubData: any[]): string {
  const title = `${repository.owner}/${repository.repo} - ${feedType.charAt(0).toUpperCase() + feedType.slice(1)}`;
  const description = `RSS feed for ${feedType} in ${repository.owner}/${repository.repo}`;
  
  const rssItems = githubData.slice(0, 20).map(item => {
    const { title: itemTitle, link: itemLink, description: itemDescription, date: itemDate } = processRSSItem(item, feedType);
    const cleanedDescription = cleanDescription(itemDescription);
    
    return `
    <item>
      <title><![CDATA[${itemTitle}]]></title>
      <link>${itemLink}</link>
      <description><![CDATA[${cleanedDescription}]]></description>
      <pubDate>${new Date(itemDate).toUTCString()}</pubDate>
      <guid>${itemLink}</guid>
    </item>`;
  }).join('');
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${repository.url}</link>
    <description><![CDATA[${description}]]></description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>GitHub RSS Generator v1.0</generator>
    <language>en-us</language>${rssItems}
  </channel>
</rss>`;
}