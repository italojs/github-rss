// Simple RSS generator test
require('dotenv').config();

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function generateRSSForRepo() {
  try {
    console.log('🚀 Starting RSS generation...');
    
    // Connect to MongoDB
    const client = new MongoClient(process.env.MONGO_URL || 'mongodb://localhost:3001/meteor');
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    const repositories = db.collection('repositories');
    
    // Find queued repositories
    const queuedRepos = await repositories.find({ 
      status: { $in: ['pending', 'generating'] } 
    }).toArray();
    
    console.log(`📊 Found ${queuedRepos.length} repositories to process`);
    
    if (queuedRepos.length === 0) {
      console.log('🎉 No repositories in queue');
      await client.close();
      return;
    }
    
    for (const repo of queuedRepos) {
      console.log(`\n🔄 Processing ${repo.owner}/${repo.repo}...`);
      
      // Update status to generating
      await repositories.updateOne(
        { _id: repo._id },
        { $set: { status: 'generating', lastUpdate: new Date() } }
      );
      
      // Generate mock RSS feeds (for testing)
      const feeds = {
        issues: generateMockRSSFile(repo, 'issues'),
        pullRequests: generateMockRSSFile(repo, 'pullRequests'),
        discussions: generateMockRSSFile(repo, 'discussions'),
        releases: generateMockRSSFile(repo, 'releases')
      };
      
      // Update repository with feeds
      await repositories.updateOne(
        { _id: repo._id },
        { 
          $set: { 
            status: 'ready', 
            feeds: feeds,
            lastUpdate: new Date() 
          } 
        }
      );
      
      console.log(`✅ Generated RSS feeds for ${repo.owner}/${repo.repo}`);
    }
    
    await client.close();
    console.log('\n🎉 RSS generation completed!');
    
  } catch (error) {
    console.error('❌ RSS generation failed:', error);
  }
}

function generateMockRSSFile(repo, feedType) {
  try {
    // Create public directory if it doesn't exist
    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Generate mock RSS content
    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[${repo.owner}/${repo.repo} - ${feedType}]]></title>
    <link>${repo.url}</link>
    <description><![CDATA[RSS feed for ${feedType} in ${repo.owner}/${repo.repo}]]></description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>GitHub RSS Generator v1.0</generator>
    <item>
      <title><![CDATA[Sample ${feedType} item]]></title>
      <link>${repo.url}</link>
      <description><![CDATA[This is a sample RSS feed item for testing purposes.]]></description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid>${repo.url}#sample</guid>
    </item>
  </channel>
</rss>`;
    
    // Save RSS file
    const filename = `${repo.owner}_${repo.repo}_${feedType}.xml`;
    const filepath = path.join(publicDir, filename);
    fs.writeFileSync(filepath, rssContent);
    
    // Return local URL
    return `http://localhost:3000/${filename}`;
    
  } catch (error) {
    console.error(`❌ Failed to generate ${feedType} RSS file:`, error);
    return null;
  }
}

// Run the generator
generateRSSForRepo();