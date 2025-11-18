import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import {
  findRepositoryById,
  findRepositoryByOwnerAndRepo,
  insertRepository,
  updateRepositoryStatus
} from './repository';
import { GithubRepo, FeedType, SearchResult } from './types';
import S3Client from './clients/s3';
import GitHubClient from './clients/github';

// Create service singletons lazily to defer expensive setup until first use
let s3Client: S3Client = new S3Client();
let gitHubClient: GitHubClient = new GitHubClient();

async function generateRSS(
  repositoryId: string,
  repository?: GithubRepo
): Promise<GithubRepo['feeds']> {
  const targetRepository = repository ?? (await findRepositoryById(repositoryId));
  if (!targetRepository) {
    throw new Meteor.Error('repository-not-found', 'Repository not found');
  }

  await updateRepositoryStatus(repositoryId, 'generating');
  // Generate feed URLs (will point to S3 direct public URLs)
  const repoPath = `${targetRepository.owner}-${targetRepository.repo}`;
  
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
  const rssContents = Object.fromEntries(
    await Promise.all(
      feedTypes.map(async feedType => {
        const githubData = await gitHubClient.fetchFeed(targetRepository.owner, targetRepository.repo, feedType);
        const rssContent = generateRSSWithGitHubData(targetRepository, feedType, githubData);
        return [feedType, rssContent] as const;
      })
    )
  ) as Record<string, string>;

  rssContents['discussions'] = generateRSSWithGitHubData(targetRepository, 'discussions', []);

  await s3Client.uploadAllRSSToS3(repoPath, rssContents);

  await updateRepositoryStatus(repositoryId, 'ready', { feeds, lastUpdate: new Date() });

  return feeds;
}

// Helper function to check if GitHub repository exists
function gitHubRepositoryExists(owner: string, repo: string): Promise<boolean> {
  return gitHubClient.repositoryExists(owner, repo).catch(() => false);
}

async function createRepository(
  owner: string,
  repo: string,
  fullUrl: string
): Promise<GithubRepo> {
  const repository: GithubRepo = {
    url: fullUrl,
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    createdAt: new Date(),
    lastUpdate: new Date(),
    feeds: { 
      issues: undefined, 
      pullRequests: undefined,
      discussions: undefined,
      releases: undefined 
    },
    status: 'pending',
    error: undefined
  };
  
  const repositoryId = await insertRepository(repository);
  const repositoryWithId: GithubRepo = { ...repository, _id: repositoryId };
  
  await generateRSS(repositoryId, repositoryWithId);

  const refreshedRepository = await findRepositoryById(repositoryId);
  if (!refreshedRepository) {
    throw new Meteor.Error('repository-not-found', 'Repository not found after creation');
  }

  return refreshedRepository;
}

function repositoryNeedsRefresh(repository: GithubRepo): boolean {
  if (!repository._id) return false;
  if (repository.status !== 'ready') return false;
  
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const lastUpdate = repository.lastUpdate;
  
  return !lastUpdate || lastUpdate <= thirtyMinutesAgo;
}

Meteor.methods({
  async 'repositories.search'(githubUrl: string): Promise<SearchResult> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
    
    // Check if repository exists on GitHub
    const exists = await gitHubRepositoryExists(owner, repo);
    if (!exists) {
      throw new Meteor.Error('repository-not-found', `Repository ${owner}/${repo} not found on GitHub`);
    }
    
    let repository = await findRepositoryByOwnerAndRepo(owner, repo);

    if (!repository) {
      repository = await createRepository(owner, repo, fullUrl);
    } else if (repositoryNeedsRefresh(repository)) {
      await generateRSS(repository._id!, repository);
      const updatedRepository = await findRepositoryById(repository._id!);
      repository = updatedRepository ?? repository;
    }

    return {
      found: !!repository,
      repository,
      parsedUrl: { owner, repo, fullUrl },
      directUrls: repository.feeds
    };
  },
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

function generateRSSWithGitHubData(repository: GithubRepo, feedType: FeedType, githubData: any[]): string {
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
