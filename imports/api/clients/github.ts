import { Meteor } from 'meteor/meteor';
import { FeedType } from '../types';

interface GitHubSettings {
  token?: string;
  apiUrl: string;
  perPage: number;
}

class GitHubClient {
  private readonly settings: GitHubSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): GitHubSettings {
    const token = Meteor.settings?.private?.github?.token ?? process.env.GITHUB_TOKEN;
    const apiUrl = Meteor.settings?.private?.github?.apiUrl ?? process.env.GITHUB_API_URL ?? 'https://api.github.com';
    const perPage = Meteor.settings?.private?.github?.perPage ?? 50;

    return {
      token,
      apiUrl,
      perPage
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'GitHub-RSS-Generator/1.0',
      'Accept': 'application/vnd.github.v3+json, application/vnd.github.echo-preview+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (this.settings.token) {
      headers['Authorization'] = `Bearer ${this.settings.token}`;
    }

    return headers;
  }

  private buildEndpoint(owner: string, repo: string, feedType: FeedType): string | null {
    const base = `${this.settings.apiUrl}/repos/${owner}/${repo}`;
    const perPageParam = `per_page=${this.settings.perPage}`;

    const endpoints: Record<FeedType, string | null> = {
      issues: `${base}/issues?state=all&sort=created&direction=desc&${perPageParam}`,
      pullRequests: `${base}/pulls?state=all&sort=created&direction=desc&${perPageParam}`,
      releases: `${base}/releases?${perPageParam}`,
      discussions: `${base}/discussions?${perPageParam}`
    };

    return endpoints[feedType] ?? null;
  }

  private buildRepositoryUrl(owner: string, repo: string): string {
    return `${this.settings.apiUrl}/repos/${owner}/${repo}`;
  }

  async repositoryExists(owner: string, repo: string): Promise<boolean> {
    const response = await fetch(this.buildRepositoryUrl(owner, repo), {
      headers: this.buildHeaders()
    });

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => undefined);
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    return true;
  }

  async fetchFeed(owner: string, repo: string, feedType: FeedType): Promise<any[]> {
    const endpoint = this.buildEndpoint(owner, repo, feedType);
    if (!endpoint) {
      return [];
    }

    const response = await fetch(endpoint, {
      headers: this.buildHeaders()
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }

      const errorBody = await response.text().catch(() => undefined);
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      );
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }
}

export default GitHubClient;
