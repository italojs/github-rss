import AWS from 'aws-sdk';
import { Meteor } from 'meteor/meteor';

interface AWSSettings {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

class S3Service {
  private s3Client: AWS.S3;
  private awsSettings: AWSSettings;

  constructor() {
    this.awsSettings = this.getAWSSettings();
    AWS.config.update({
      accessKeyId: this.awsSettings.accessKeyId,
      secretAccessKey: this.awsSettings.secretAccessKey,
      region: this.awsSettings.region
    });
    this.s3Client = new AWS.S3();
  }

  private getAWSSettings(): AWSSettings {
  const settings = Meteor.settings?.private?.aws;
    if (!settings?.accessKeyId || !settings?.secretAccessKey || !settings?.region || !settings?.s3Bucket) {
      throw new Error('AWS credentials or S3 bucket not configured in Meteor.settings');
    }
    return {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      region: settings.region,
      bucket: settings.s3Bucket
    };
  }

  async uploadRSSToS3(
    repositoryName: string,
    feedType: string,
    rssContent: string
  ): Promise<string | null> {
    try {
      const key = `rss/${repositoryName}/${feedType}.xml`;
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.awsSettings.bucket,
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
      const result = await this.s3Client.upload(params).promise();
      return result.Location;
    } catch (error: any) {
      throw new Error(`Failed to upload ${feedType} RSS for ${repositoryName} to S3: ${error.message}`);
    }
  }

  async uploadAllRSSToS3(
    repositoryName: string,
    feeds: Record<string, string>
  ): Promise<Record<string, string | null>> {
    const uploadPromises = Object.entries(feeds).map(async ([feedType, rssContent]) => {
      const url = await this.uploadRSSToS3(repositoryName, feedType, rssContent);
      return [feedType, url] as [string, string | null];
    });
    const results = await Promise.all(uploadPromises);
    return Object.fromEntries(results);
  }

  getS3RSSUrl(repositoryName: string, feedType: string): string {
    // Return direct public URL since bucket is now public
    return `https://${this.awsSettings.bucket}.s3.${this.awsSettings.region}.amazonaws.com/rss/${repositoryName}/${feedType}.xml`;
  }
}

export default S3Service;
