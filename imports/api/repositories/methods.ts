import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Repositories } from './collection';
import { Repository, FeedType, SearchResult } from '../types';

Meteor.methods({
  // Search for a repository by GitHub URL
  async 'repositories.search'(githubUrl: string): Promise<SearchResult> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
    
    const existingRepo = await Repositories.findOneAsync({ 
      owner: owner.toLowerCase(), 
      repo: repo.toLowerCase() 
    });
    
    return {
      found: !!existingRepo,
      repository: existingRepo,
      parsedUrl: { owner, repo, fullUrl }
    };
  },

  // Create a new repository entry (when user clicks "Generate RSS")
  async 'repositories.create'(githubUrl: string): Promise<string> {
    check(githubUrl, String);
    
    const { owner, repo, fullUrl } = parseGitHubUrl(githubUrl);
    
    // Check if repository already exists
    const existingRepo = await Repositories.findOneAsync({ 
      owner: owner.toLowerCase(), 
      repo: repo.toLowerCase() 
    });
    
    if (existingRepo) {
      throw new Meteor.Error('already-exists', 'Repository already exists in database');
    }
    
    // Create new repository document
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
    
    // Automatically start RSS generation
    Meteor.defer(async () => {
      try {
        await Meteor.callAsync('repositories.generateRSS', repositoryId);
      } catch (error: any) {
        console.error(`Auto RSS generation failed for ${owner}/${repo}:`, error.message);
      }
    });
    
    return repositoryId;
  },

  // Get repository feeds by ID
  async 'repositories.getFeeds'(repositoryId: string): Promise<Repository['feeds']> {
    check(repositoryId, String);
    
    const repository = await Repositories.findOneAsync(repositoryId);
    if (!repository) {
      throw new Meteor.Error('not-found', 'Repository not found');
    }
    
    return repository.feeds;
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
    
    const updateData: any = {
      status,
      lastUpdate: new Date()
    };
    
    if (feeds) updateData.feeds = feeds;
    if (error) updateData.error = error;
    
    return await Repositories.updateAsync(repositoryId, { $set: updateData });
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
    
    const repository = await Repositories.findOneAsync({ _id: repositoryId });
    if (!repository) {
      throw new Meteor.Error('repository-not-found', 'Repository not found');
    }
    
    try {
      // Update status to generating
      await Repositories.updateAsync(repositoryId, {
        $set: { 
          status: 'generating',
          lastUpdate: new Date()
        }
      });
      
      // Generate RSS feeds
      const baseUrl = Meteor.absoluteUrl();
      const repoPath = `${repository.owner}-${repository.repo}`;
      const feeds: Record<FeedType, string> = {
        issues: `${baseUrl}rss/${repoPath}/issues.xml`,
        pullRequests: `${baseUrl}rss/${repoPath}/pullRequests.xml`,
        discussions: `${baseUrl}rss/${repoPath}/discussions.xml`,
        releases: `${baseUrl}rss/${repoPath}/releases.xml`
      };
      
      // Create RSS files
      const fs = require('fs');
      const path = require('path');
      
      // TODO: Future enhancement - migrate to S3 storage
      // Save locally to public/rss directory
      const publicPath = path.join(process.cwd(), 'public');
      
      // Use owner-repo format to avoid conflicts (e.g., facebook-react, microsoft-react)
      const repoFolder = `${repository.owner}-${repository.repo}`;
      const rssDir = path.join(publicPath, 'rss', repoFolder);
      
      // Create directory
      fs.mkdirSync(rssDir, { recursive: true });
      
      // Generate each feed type (skip discussions for now due to API complexity)
      const feedTypes: FeedType[] = ['issues', 'pullRequests', 'releases'];
      
      for (const feedType of feedTypes) {
        try {
          const githubData = await fetchGitHubData(repository.owner, repository.repo, feedType);
          const rssContent = generateRSSWithGitHubData(repository, feedType, githubData);
          
          // Save RSS file locally
          const filepath = path.join(rssDir, `${feedType}.xml`);
          fs.writeFileSync(filepath, rssContent);
          
          console.log(`✅ Saved ${feedType} RSS to: ${filepath}`);
        } catch (error: any) {
          console.error(`Error generating ${feedType} feed:`, error.message);
        }
      }
      
      // Create empty discussions feed for compatibility
      try {
        const emptyDiscussionsRss = generateRSSWithGitHubData(repository, 'discussions', []);
        const discussionsPath = path.join(rssDir, 'discussions.xml');
        
        fs.writeFileSync(discussionsPath, emptyDiscussionsRss);
        
        console.log(`✅ Saved empty discussions RSS to: ${discussionsPath}`);
      } catch (error: any) {
        console.error('Error generating empty discussions feed:', error.message);
      }
      
      // Update repository with feed URLs
      await Repositories.updateAsync(repositoryId, {
        $set: {
          status: 'ready',
          feeds,
          lastUpdate: new Date()
        }
      });
      
      return feeds;
      
    } catch (error: any) {
      // Update status to error
      await Repositories.updateAsync(repositoryId, {
        $set: {
          status: 'error',
          error: error.message,
          lastUpdate: new Date()
        }
      });
      throw error;
    }
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
    headers['Authorization'] = `token ${githubToken}`;
  }
  
  const endpoints: Record<FeedType, string> = {
    issues: `https://api.github.com/repos/${owner}/${repo}/issues?state=all&sort=created&direction=desc&per_page=50`,
    pullRequests: `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=50`,
    releases: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`,
    discussions: `https://api.github.com/repos/${owner}/${repo}/discussions?per_page=50`
  };
  
  const url = endpoints[feedType];
  if (!url) return [];
  
  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error: any) {
    console.error(`Error fetching ${feedType}:`, error.message);
    return [];
  }
}

// Helper function to generate RSS content
function generateRSSWithGitHubData(repository: Repository, feedType: FeedType, githubData: any[]): string {
  const title = `${repository.owner}/${repository.repo} - ${feedType.charAt(0).toUpperCase() + feedType.slice(1)}`;
  const description = `RSS feed for ${feedType} in ${repository.owner}/${repository.repo}`;
  
  const rssItems = githubData.slice(0, 20).map(item => {
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
        return '';
    }
    
    // Clean up description
    const cleanDescription = itemDescription
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_]/g, '')
      .substring(0, 500);
    
    const finalDescription = cleanDescription.length < itemDescription.length 
      ? cleanDescription + '...' 
      : cleanDescription;
    
    return `
    <item>
      <title><![CDATA[${itemTitle}]]></title>
      <link>${itemLink}</link>
      <description><![CDATA[${finalDescription}]]></description>
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