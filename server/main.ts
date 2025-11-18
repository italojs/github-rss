import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import '../imports/api/repository';
import '../imports/api/methods';

Meteor.startup(async () => {
  const settings = Meteor.settings.private;
  const githubToken = settings?.github?.token;

  if (!githubToken) {
    throw new Error('GitHub token not configured in Meteor.settings.private.github.token');
  }

  if (!settings?.aws?.accessKeyId) {
    throw new Error('AWS credentials not configured in Meteor.settings.private.aws');
  }

  WebApp.connectHandlers.use('/api/rss', async (req: any, res: any, next: any) => {
    if (req.method !== 'GET' || !req.url.endsWith('.xml')) {
      return next();
    }
    
    const urlParts = req.url.split('/').filter(Boolean);
    
    if (urlParts.length !== 2) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid RSS URL format. Expected: /owner-repo/feedType.xml');
      return;
    }
    
    const repositoryName = urlParts[0];
    const feedType = urlParts[1].replace('.xml', '');
    
    // Try to get the XML directly from S3
    try {
      const awsSettings = Meteor.settings.private?.aws;
      
      if (!awsSettings?.s3Bucket || !awsSettings?.region) {
        throw new Error('S3 configuration missing');
      }
      
      const s3Url = `https://${awsSettings.s3Bucket}.s3.${awsSettings.region}.amazonaws.com/rss/${repositoryName}/${feedType}.xml`;
      
      const response = await fetch(s3Url);
      
      if (response.ok) {
        const xmlContent = await response.text();
        res.writeHead(200, { 
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300'
        });
        res.end(xmlContent);
      } else {
        // Fallback to redirect if S3 file not found
        res.writeHead(302, { 
          'Location': `/?redirect=rss&repo=${repositoryName}&feed=${feedType}`,
          'Content-Type': 'text/plain'
        });
        res.end(`XML not found in S3, redirecting to generate feed for ${repositoryName}/${feedType}`);
      }
    } catch (error: any) {
      // Fallback to redirect on error
      res.writeHead(302, { 
        'Location': `/?redirect=rss&repo=${repositoryName}&feed=${feedType}`,
        'Content-Type': 'text/plain'
      });
      res.end(`Error accessing S3, redirecting to generate feed for ${repositoryName}/${feedType}`);
    }
  });
});
