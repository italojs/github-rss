import AWS from 'aws-sdk';
import { Meteor } from 'meteor/meteor';

function getAWSSettings() {
  const settings = Meteor.settings.private?.aws;
  
  if (!settings?.accessKeyId || !settings?.secretAccessKey || !settings?.region) {
    return null;
  }
  
  return {
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    region: settings.region,
    bucket: settings.s3Bucket
  };
}

export function configureS3() {
  const awsSettings = getAWSSettings();
  
  if (!awsSettings) {
    throw new Error('AWS credentials not configured in Meteor.settings');
  }

  AWS.config.update({
    accessKeyId: awsSettings.accessKeyId,
    secretAccessKey: awsSettings.secretAccessKey,
    region: awsSettings.region
  });
  
  return new AWS.S3();
}

export async function uploadRSSToS3(
  s3Client: AWS.S3,
  repositoryName: string,
  feedType: string,
  rssContent: string
): Promise<string | null> {
  try {
    const awsSettings = getAWSSettings();
    if (!awsSettings?.bucket) {
      throw new Error('S3 bucket not configured in Meteor.settings');
    }

    const key = `rss/${repositoryName}/${feedType}.xml`;
    
    const params: AWS.S3.PutObjectRequest = {
      Bucket: awsSettings.bucket,
      Key: key,
      Body: rssContent,
      ContentType: 'application/rss+xml',
      CacheControl: 'public, max-age=300',
      Metadata: {
        'generated-at': new Date().toISOString(),
        'repository': repositoryName,
        'feed-type': feedType
      }
    };

    const result = await s3Client.upload(params).promise();
    
    return result.Location;
  } catch (error: any) {
    throw new Error(`Failed to upload ${feedType} RSS for ${repositoryName} to S3: ${error.message}`);
  }
}

export async function uploadAllRSSToS3(
  repositoryName: string,
  feeds: Record<string, string>
): Promise<Record<string, string | null>> {
  const s3Client = configureS3();

  const uploadPromises = Object.entries(feeds).map(async ([feedType, rssContent]) => {
    try {
      const url = await uploadRSSToS3(s3Client, repositoryName, feedType, rssContent);
      return [feedType, url] as [string, string | null];
    } catch (error) {
      return [feedType, null] as [string, string | null];
    }
  });

  const results = await Promise.all(uploadPromises);
  return Object.fromEntries(results);
}

export function getS3RSSUrl(repositoryName: string, feedType: string): string {
  const awsSettings = getAWSSettings();
  
  if (!awsSettings?.bucket || !awsSettings?.region) {
    throw new Error('S3 bucket or region not configured in Meteor.settings');
  }

  return `https://${awsSettings.bucket}.s3.${awsSettings.region}.amazonaws.com/rss/${repositoryName}/${feedType}.xml`;
}

export async function getPresignedRSSUrl(
  repositoryName: string, 
  feedType: string
): Promise<string | null> {
  try {
    const s3Client = configureS3();
    const awsSettings = getAWSSettings();
    
    if (!awsSettings?.bucket) {
      throw new Error('S3 bucket not configured in Meteor.settings');
    }

    const key = `rss/${repositoryName}/${feedType}.xml`;
    
    const params = {
      Bucket: awsSettings.bucket,
      Key: key,
      Expires: 3600,
      ResponseContentType: 'application/rss+xml'
    };

    const presignedUrl = await s3Client.getSignedUrlPromise('getObject', params);
    return presignedUrl;
  } catch (error: any) {
    throw new Error(`Failed to generate presigned URL for ${repositoryName}/${feedType}: ${error.message}`);
  }
}