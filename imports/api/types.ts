// Types for GitHub RSS Generator

export interface GithubRepo {
  _id?: string;
  url: string;
  owner: string;
  repo: string;
  createdAt: Date;
  lastUpdate?: Date;
  feeds: {
    issues: string | undefined;
    pullRequests: string | undefined;
    discussions: string | undefined;
    releases: string | undefined;
  };
  status: 'pending' | 'generating' | 'ready' | 'error';
  error?: string;
}

export interface SearchResult {
  found: boolean;
  repository?: GithubRepo;
  parsedUrl: {
    owner: string;
    repo: string;
    fullUrl: string;
  };
  directUrls: Record<FeedType, string | undefined>;
}

export type FeedType = 'issues' | 'pullRequests' | 'discussions' | 'releases';
