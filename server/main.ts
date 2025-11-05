// Load environment variables FIRST, before any imports
// Set GitHub token from environment variable
// Load environment variables FIRST, before any imports
// Set GitHub token from environment variable
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'your_github_token_here';

import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import '/imports/api/repositories/collection';
import '/imports/api/repositories/methods';

Meteor.startup(async () => {
  console.log('🚀 GitHub RSS Generator Server Starting...');
  
  // Simple check for GitHub token
  console.log(`🔑 GitHub Token: ${process.env.GITHUB_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  
  // Configure static file serving for RSS feeds
  const fs = require('fs');
  const path = require('path');
  
  WebApp.connectHandlers.use('/rss', (req: any, res: any, next: any) => {
    console.log(`📡 RSS request: ${req.method} ${req.url}`);
    
    // Only handle GET requests for XML files
    if (req.method !== 'GET' || !req.url.endsWith('.xml')) {
      return next();
    }
    
    const rssPath = path.join(process.cwd(), 'public', 'rss', req.url);
    console.log(`📂 Looking for RSS file at: ${rssPath}`);
    
    // Check if file exists
    fs.access(rssPath, fs.constants.F_OK, (err: any) => {
      if (err) {
        console.log(`❌ RSS file not found: ${rssPath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('RSS feed not found');
        return;
      }
      
      // Read and serve the file with correct headers
      fs.readFile(rssPath, 'utf8', (err: any, data: string) => {
        if (err) {
          console.log(`❌ Error reading RSS file: ${err.message}`);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error reading RSS feed');
          return;
        }
        
        console.log(`✅ Serving RSS file: ${rssPath} (${data.length} chars)`);
        
        // Set correct headers for XML/RSS
        res.writeHead(200, {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(data, 'utf8'),
          'Cache-Control': 'public, max-age=300', // 5 minutes cache
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
        
        res.end(data);
      });
    });
  });
  
  console.log('✅ Server ready - GitHub RSS Generator is running!');
  console.log('📡 Visit http://localhost:3000 to start generating RSS feeds');
});
