// Types for GitHub RSS Generator

export interface Repository {
  _id?: string;
  url: string;
  owner: string;
  repo: string;
  createdAt: Date;
  lastUpdate?: Date;
  feeds: {
    issues?: string;
    pullRequests?: string;
    discussions?: string;
    releases?: string;
  };
  status: 'pending' | 'generating' | 'ready' | 'error';
  error?: string;
}

export interface SearchResult {
  found: boolean;
  repository?: Repository;
  parsedUrl: {
    owner: string;
    repo: string;
    fullUrl: string;
  };
}

export type FeedType = 'issues' | 'pullRequests' | 'discussions' | 'releases';