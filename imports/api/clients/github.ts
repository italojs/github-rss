import fetch from 'node-fetch';
import { Meteor } from 'meteor/meteor';
import { Log } from 'meteor/logging';
import { FeedType } from '../types';

interface GitHubSettings {
  token?: string;
  apiUrl: string;
  perPage: number;
}

class GitHubService {
  private readonly settings: GitHubSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): GitHubSettings {
    const token = Meteor.settings?.private?.github?.token;
    const apiUrl = Meteor.settings?.private?.github?.apiUrl ?? 'https://api.github.com';
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

  async fetchFeed(owner: string, repo: string, feedType: FeedType): Promise<any[]> {
    const endpoint = this.buildEndpoint(owner, repo, feedType);
    if (!endpoint) {
      return [];
    }

    try {
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
    } catch (error: any) {
      Log.error(
        `GitHubService.fetchFeed failed for ${owner}/${repo} (${feedType}): ${error?.message ?? error}`
      );
      return [];
    }
  }
}

export default GitHubService;
