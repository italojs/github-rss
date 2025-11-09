import { Meteor } from 'meteor/meteor';
import { Log } from 'meteor/logging';
import { check } from 'meteor/check';
import { Repositories } from './collection';
import { Repository, FeedType, SearchResult } from '../types';
import S3Service from '../clients/s3';
import GitHubService from '../clients/github';

const githubService = new GitHubService();

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
  // Generate feed URLs (will point to S3 presigned URLs)
  const baseUrl = Meteor.absoluteUrl();
  const repoPath = `${repository.owner}-${repository.repo}`;
  const feeds: Record<FeedType, string> = {
    issues: `${baseUrl}api/rss/${repoPath}/issues.xml`,
    pullRequests: `${baseUrl}api/rss/${repoPath}/pullRequests.xml`,
    discussions: `${baseUrl}api/rss/${repoPath}/discussions.xml`,
    releases: `${baseUrl}api/rss/${repoPath}/releases.xml`
  };
  
  
  const feedTypes: FeedType[] = ['issues', 'pullRequests', 'releases', 'discussions'];
  const rssContents: Record<string, string> = {};
  
  for (const feedType of feedTypes) {
    try {
      const githubData = await githubService.fetchFeed(repository.owner, repository.repo, feedType);
      const rssContent = generateRSSWithGitHubData(repository, feedType, githubData);
      rssContents[feedType] = rssContent;
    } catch (error: any) {
      Log.error(`Failed to generate ${feedType} feed for ${repository.owner}/${repository.repo}: ${error?.message ?? error}`);
    }
  }

  try {
    const s3 = new S3Service();
    await s3.uploadAllRSSToS3(repoPath, rssContents);
  } catch (error: any) {
    Log.error(`Failed to upload RSS feeds to S3 for ${repository.owner}/${repository.repo}: ${error?.message ?? error}`);
  }

  return feeds;
}

Meteor.methods({
  async 'repositories.search'(githubUrl: string): Promise<SearchResult> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
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
        await generateRSSAndUpdateRepository(repositoryId);
      } catch (error: any) {
        Log.error(`Deferred RSS generation failed for ${owner}/${repo}: ${error?.message ?? error}`);
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

  async 'repositories.getPresignedRSSUrls'(repositoryId: string): Promise<Record<FeedType, string | null>> {
    check(repositoryId, String);
    
    const repository = await findRepositoryById(repositoryId);
    if (!repository) {
      throw new Meteor.Error('not-found', 'Repository not found');
    }

    const repoPath = `${repository.owner}-${repository.repo}`;
    const feedTypes: FeedType[] = ['issues', 'pullRequests', 'discussions', 'releases'];
    
    const presignedUrls: Record<FeedType, string | null> = {
      issues: null,
      pullRequests: null,
      discussions: null,
      releases: null
    };

    const s3 = new S3Service();
    for (const feedType of feedTypes) {
      try {
        const presignedUrl = await s3.getPresignedRSSUrl(repoPath, feedType);
        presignedUrls[feedType] = presignedUrl;
      } catch (error: any) {
        presignedUrls[feedType] = null;
      }
    }
    
    return presignedUrls;
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

  // Force RSS generation for a specific repository with real GitHub API data
  async 'repositories.generateRSS'(repositoryId: string) {
    check(repositoryId, String);
    return await generateRSSAndUpdateRepository(repositoryId);
  }
});

async function generateRSSAndUpdateRepository(repositoryId: string) {
  const repository = await findRepositoryById(repositoryId);
  if (!repository) {
    throw new Meteor.Error('repository-not-found', 'Repository not found');
  }
  try {
    // Update status to generating
    await updateRepositoryStatus(repositoryId, 'generating');
    // Generate RSS feeds and save files
    const feeds = await generateRSSFeeds(repository);
    // Update repository with feed URLs
    await updateRepositoryStatus(repositoryId, 'ready', { feeds });
    return feeds;
  } catch (error: any) {
    // Update status to error
    Log.error(`RSS generation failed for repository ${repository.owner}/${repository.repo}: ${error?.message ?? error}`);
    await updateRepositoryStatus(repositoryId, 'error', { error: error.message });
    throw error;
  }
}

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