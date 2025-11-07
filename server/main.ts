import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import '/imports/api/repositories/collection';
import '/imports/api/repositories/methods';

Meteor.startup(async () => {
  const settings = Meteor.settings.private;
  const githubToken = settings?.github?.token;
  
  if (githubToken) {
    process.env.GITHUB_TOKEN = githubToken;
  }
  
  if (settings?.aws) {
    process.env.AWS_ACCESS_KEY_ID = settings.aws.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = settings.aws.secretAccessKey;
    process.env.AWS_REGION = settings.aws.region;
    process.env.S3_BUCKET = settings.aws.s3Bucket;
  }

  if (!githubToken) {
    throw new Error('GitHub token not configured in Meteor.settings.private.github.token');
  }

  if (!settings?.aws?.accessKeyId) {
    throw new Error('AWS credentials not configured in Meteor.settings.private.aws');
  }

  WebApp.connectHandlers.use('/api/rss', (req: any, res: any, next: any) => {
    if (req.method !== 'GET' || !req.url.endsWith('.xml')) {
      return next();
    }
    
    const urlParts = req.url.split('/');
    if (urlParts.length !== 2) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Invalid RSS URL format. Expected: /owner-repo/feedType.xml');
      return;
    }
    
    const repositoryName = urlParts[0];
    const feedType = urlParts[1].replace('.xml', '');
    
    res.writeHead(302, { 
      'Location': `/?redirect=rss&repo=${repositoryName}&feed=${feedType}`,
      'Content-Type': 'text/plain'
    });
    res.end(`Redirecting to RSS feed for ${repositoryName}/${feedType}`);
  });
});
