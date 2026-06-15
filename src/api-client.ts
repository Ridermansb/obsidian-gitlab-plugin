import { Plugin, requestUrl } from "obsidian";
import AuthService from "./auth-service";
import { AuthMethod } from "./settings";

type GitLabAPIClientOptions = {
  baseURL: string;
  plugin: Plugin;
  authMethod: AuthMethod;
  clientId?: string;
  clientSecret?: string;
};

export class GitLabApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string) {
    super(`GitLab API error ${status}: ${path}`);
    this.status = status;
    this.path = path;
  }
}

export class GitLabAPIClient {
  private instanceBaseURL: string;
  private baseURL: string;
  private plugin: Plugin;
  private authMethod: AuthMethod;
  private authService: AuthService | null = null;

  constructor(options: GitLabAPIClientOptions) {
    this.instanceBaseURL = options.baseURL;
    this.baseURL = options.baseURL + "/api";
    this.plugin = options.plugin;
    this.authMethod = options.authMethod;

    if (options.authMethod === AuthMethod.OAuth && options.clientId) {
      this.authService = new AuthService(
        options.plugin,
        options.baseURL,
        options.clientId,
        options.clientSecret,
      );
    }
  }

  private getPatStorageKey(): string {
    const sanitizedUrl = this.instanceBaseURL
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");
    return `pat-${sanitizedUrl}`;
  }

  getPat(): string | null {
    const token = this.plugin.app.secretStorage.getSecret(
      this.getPatStorageKey(),
    );
    return token && token.length > 0 ? token : null;
  }

  setPat(token: string): void {
    this.plugin.app.secretStorage.setSecret(this.getPatStorageKey(), token);
  }

  clearPat(): void {
    this.plugin.app.secretStorage.setSecret(this.getPatStorageKey(), "");
  }

  hasPat(): boolean {
    return this.getPat() !== null;
  }

  async authorize() {
    if (!this.authService) {
      throw new Error("clientId not configured");
    }
    const url = await this.authService.getAuthorizeUrl();
    window.location.href = url;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    if (!this.authService) {
      throw new Error("clientId not configured");
    }
    await this.authService.handleCallback(code, state);
  }

  async getValidToken(): Promise<string | null> {
    if (!this.authService) return null;
    return await this.authService.getValidToken();
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.authService) return false;
    return await this.authService.isAuthenticated();
  }

  async logout(): Promise<void> {
    if (!this.authService) {
      throw new Error("clientId not configured");
    }
    await this.authService.logout();
  }

  private async resolveAuthHeaders(): Promise<Record<string, string>> {
    if (this.authMethod === AuthMethod.Pat) {
      const pat = this.getPat();
      if (pat) {
        return { "PRIVATE-TOKEN": pat };
      }
      return {};
    }

    if (this.authMethod === AuthMethod.OAuth) {
      const oauth = await this.getValidToken();
      if (oauth) {
        return { Authorization: `Bearer ${oauth}` };
      }
    }

    return {};
  }

  private async request<T>(path: string, method = "GET"): Promise<T> {
    const response = await requestUrl({
      url: `${this.baseURL}/v4/${path}`,
      method,
      headers: {
        ...(await this.resolveAuthHeaders()),
        "Content-Type": "application/json",
      },
      throw: false,
    });

    if (response.status >= 400) {
      throw new GitLabApiError(response.status, path);
    }

    return response.json as T;
  }

  async testConnection(): Promise<string> {
    const user = await this.request<{ username: string }>("user");
    return user.username;
  }

  /**
   * Get a single project issue.
   *
   * @param id - The ID of the project.
   * @param issueIid - The internal ID of a project issue.
   * @returns A single project issue.
   * @throws
   */
  async getProjectIssue(id: string, issueIid: string) {
    const data = await this.request<_APIIssue>(
      `projects/${id}/issues/${issueIid}`,
    );
    return issueMapper(data);
  }

  async getProjectMergeRequest(id: string, mergeRequestIid: string) {
    const data = await this.request<_APIMergeRequest>(
      `projects/${id}/merge_requests/${mergeRequestIid}`,
    );
    return mergeRequestMapper(data);
  }
}

type _APIIssue = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closed_by: string | null;
  labels: string[];
  author: {
    id: number;
    username: string;
    public_email: string;
    name: string;
    state: string;
    locked: boolean;
    avatar_url: string;
    web_url: string;
  };
  type: string;
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  confidential: boolean;
  web_url: string;
};

export type Issue = {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | undefined;
  closedBy: string | undefined;
  labels: string[];
  author: {
    id: number;
    publicEmail: string;
    username: string;
    name: string;
    state: string;
    locked: boolean;
    avatarUrl: string;
    webUrl: string;
  };
  type: string;
  userNotesCount: number;
  upvotes: number;
  downvotes: number;
  confidential: boolean;
  webUrl: string;
};

function issueMapper(data: _APIIssue): Issue {
  return {
    id: data.id,
    iid: data.iid,
    projectId: data.project_id,
    title: data.title,
    description: data.description,
    state: data.state,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    closedAt: data.closed_at || undefined,
    closedBy: data.closed_by || undefined,
    labels: data.labels,
    author: {
      id: data.author.id,
      publicEmail: data.author.public_email,
      username: data.author.username,
      name: data.author.name,
      state: data.author.state,
      locked: data.author.locked,
      avatarUrl: data.author.avatar_url,
      webUrl: data.author.web_url,
    },
    type: data.type,
    userNotesCount: data.user_notes_count,
    upvotes: data.upvotes,
    downvotes: data.downvotes,
    confidential: data.confidential,
    webUrl: data.web_url,
  };
}

type _APIMergeRequest = {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  source_branch: string;
  target_branch: string;
  labels: string[];
  author: {
    id: number;
    username: string;
    public_email: string;
    name: string;
    state: string;
    locked: boolean;
    avatar_url: string;
    web_url: string;
  };
  web_url: string;
};

export type MergeRequest = {
  id: number;
  iid: number;
  projectId: number;
  title: string;
  description: string;
  state: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | undefined;
  closedAt: string | undefined;
  sourceBranch: string;
  targetBranch: string;
  labels: string[];
  author: {
    id: number;
    publicEmail: string;
    username: string;
    name: string;
    state: string;
    locked: boolean;
    avatarUrl: string;
    webUrl: string;
  };
  webUrl: string;
};

function mergeRequestMapper(data: _APIMergeRequest): MergeRequest {
  return {
    id: data.id,
    iid: data.iid,
    projectId: data.project_id,
    title: data.title,
    description: data.description,
    state: data.state,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mergedAt: data.merged_at || undefined,
    closedAt: data.closed_at || undefined,
    sourceBranch: data.source_branch,
    targetBranch: data.target_branch,
    labels: data.labels,
    author: {
      id: data.author.id,
      publicEmail: data.author.public_email,
      username: data.author.username,
      name: data.author.name,
      state: data.author.state,
      locked: data.author.locked,
      avatarUrl: data.author.avatar_url,
      webUrl: data.author.web_url,
    },
    webUrl: data.web_url,
  };
}
