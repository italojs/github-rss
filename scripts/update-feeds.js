const { MongoClient } = require('mongodb');
const cron = require('node-cron');

// ATENÇÃO: Este script não roda dentro do contexto Meteor, portanto Meteor.settings não está disponível.
// Use variáveis de ambiente para passar configurações sensíveis (ex: MONGO_URL, GITHUB_TOKEN).

// Configuration
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:3001/meteor';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// GitHub API headers
const githubHeaders = {
  'User-Agent': 'GitHub-RSS-Generator/1.0',
  'Accept': 'application/vnd.github.v3+json',
  ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
};

class GitHubRSSGenerator {
  constructor() {
    this.db = null;
    this.client = null;
  }

  async connect() {
    try {
      console.log('🔌 Connecting to MongoDB...');
      this.client = new MongoClient(MONGO_URL);
      await this.client.connect();
      this.db = this.client.db();
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }

  async getPendingRepositories() {
    const repositories = this.db.collection('repositories');
    return await repositories.find({
      status: { $in: ['pending', 'generating'] }
    }).toArray();
  }

  async updateRepositoryStatus(id, status, feeds = null, error = null) {
    const repositories = this.db.collection('repositories');
    const updateData = {
      status,
      lastUpdate: new Date()
    };

    if (feeds) updateData.feeds = feeds;
    if (error) updateData.error = error;

    const result = await repositories.updateOne(
      { _id: id },
      { $set: updateData }
    );
    
    return result.modifiedCount > 0;
  }

  async fetchGitHubData(owner, repo, type) {
    const endpoints = {
      issues: `https://api.github.com/repos/${owner}/${repo}/issues?state=all&sort=created&direction=desc&per_page=50`,
      pullRequests: `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=50`,
      discussions: `https://api.github.com/repos/${owner}/${repo}/discussions?per_page=50`,
      releases: `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`
    };

    const url = endpoints[type];
    if (!url) throw new Error(`Unknown feed type: ${type}`);

    console.log(`📡 Fetching ${type} for ${owner}/${repo}...`);

    try {
      const response = await fetch(url, { headers: githubHeaders });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`⚠️ ${type} not found for ${owner}/${repo} (likely private or doesn't exist)`);
          return [];
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Found ${data.length} ${type} for ${owner}/${repo}`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`❌ Error fetching ${type}:`, error.message);
      return [];
    }
  }

  generateRSSXML(items, feedInfo) {
    const { title, description, link, type } = feedInfo;
    
    const rssItems = items.map(item => {
      let itemTitle, itemLink, itemDescription, itemDate;

      switch (type) {
        case 'issues':
          itemTitle = `Issue #${item.number}: ${item.title}`;
          itemLink = item.html_url;
          itemDescription = item.body || 'No description';
          itemDate = item.created_at;
          break;
        case 'pullRequests':
          itemTitle = `PR #${item.number}: ${item.title}`;
          itemLink = item.html_url;
          itemDescription = item.body || 'No description';
          itemDate = item.created_at;
          break;
        case 'discussions':
          itemTitle = item.title;
          itemLink = item.html_url;
          itemDescription = item.body || 'No description';
          itemDate = item.created_at;
          break;
        case 'releases':
          itemTitle = `Release ${item.tag_name}: ${item.name || item.tag_name}`;
          itemLink = item.html_url;
          itemDescription = item.body || 'No description';
          itemDate = item.created_at;
          break;
        default:
          return '';
      }

      return `
    <item>
      <title><![CDATA[${itemTitle}]]></title>
      <link>${itemLink}</link>
      <description><![CDATA[${itemDescription.substring(0, 500)}${itemDescription.length > 500 ? '...' : ''}]]></description>
      <pubDate>${new Date(itemDate).toUTCString()}</pubDate>
      <guid>${itemLink}</guid>
    </item>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[${description}]]></description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>GitHub RSS Generator v1.0</generator>${rssItems}
  </channel>
</rss>`;
  }

  saveRSSFile(content, owner, repo, feedType) {
    try {
      console.log(`💾 Saving ${feedType} RSS file locally...`);
      
      const fs = require('fs');
      const path = require('path');
      
      // Create public directory structure
      const publicDir = path.join(__dirname, '..', 'public', 'rss', owner, repo);
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      
      // Save RSS file
      const filename = `${feedType}.xml`;
      const filePath = path.join(publicDir, filename);
      fs.writeFileSync(filePath, content);
      
      // Return local URL
      const localUrl = `http://localhost:3000/rss/${owner}/${repo}/${filename}`;
      console.log(`✅ Saved ${feedType} RSS file: ${localUrl}`);
      
      return localUrl;
      
    } catch (error) {
      console.error(`❌ Failed to save ${feedType} RSS file:`, error);
      throw error;
    }
  }

  async generateFeedsForRepository(repository) {
    const { _id, owner, repo, url } = repository;
    
    console.log(`\n🔄 Processing ${owner}/${repo}...`);
    
    try {
      // Update status to generating
      await this.updateRepositoryStatus(_id, 'generating');

      const feedTypes = ['issues', 'pullRequests', 'discussions', 'releases'];
      const feeds = {};

      for (const type of feedTypes) {
        try {
          // Fetch data from GitHub
          const items = await this.fetchGitHubData(owner, repo, type);
          
          // Generate RSS XML
          const feedInfo = {
            title: `${owner}/${repo} - ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            description: `RSS feed for ${type} in ${owner}/${repo}`,
            link: url,
            type
          };
          
          const rssXML = this.generateRSSXML(items, feedInfo);
          
          // Save RSS file locally (S3 disabled)
          const feedUrl = this.saveRSSFile(rssXML, owner, repo, type);
          
          feeds[type] = feedUrl;
          
          // Small delay between requests to be nice to GitHub API
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Failed to generate ${type} feed:`, error.message);
          feeds[type] = null;
        }
      }

      // Update repository with results
      await this.updateRepositoryStatus(_id, 'ready', feeds);
      console.log(`✅ Completed processing ${owner}/${repo}`);

    } catch (error) {
      console.error(`❌ Failed to process ${owner}/${repo}:`, error);
      await this.updateRepositoryStatus(_id, 'error', null, error.message);
    }
  }

  async processAllPendingRepositories() {
    try {
      console.log('\n🚀 Starting RSS generation job...');
      
      await this.connect();
      
      const pendingRepos = await this.getPendingRepositories();
      console.log(`📋 Found ${pendingRepos.length} repositories to process`);
      
      if (pendingRepos.length === 0) {
        console.log('✨ No repositories to process');
        return;
      }

      for (const repo of pendingRepos) {
        await this.generateFeedsForRepository(repo);
      }
      
      console.log('\n🎉 RSS generation job completed!');
      
    } catch (error) {
      console.error('❌ RSS generation job failed:', error);
    } finally {
      await this.disconnect();
    }
  }
}

// Main execution
async function main() {
  const generator = new GitHubRSSGenerator();
  
  if (process.argv.includes('--run-once')) {
    // Run once for testing
    await generator.processAllPendingRepositories();
    process.exit(0);
  } else {
    // Set up cron job - runs every 5 minutes
    console.log('⏰ Setting up cron job to run every 5 minutes...');
    
    cron.schedule('*/5 * * * *', async () => {
      console.log('\n⏰ Cron job triggered:', new Date().toISOString());
      await generator.processAllPendingRepositories();
    });
    
    console.log('🎯 Cron job scheduled! RSS feeds will be generated automatically.');
    console.log('🔧 Use --run-once flag to run immediately for testing');
    
    // Run once on startup
    await generator.processAllPendingRepositories();
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the application
main().catch(error => {
  console.error('💥 Application failed to start:', error);
  process.exit(1);
});
