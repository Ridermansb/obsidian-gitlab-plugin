import { Notice, Plugin } from "obsidian";
import {
  AuthMethod,
  DEFAULT_SETTINGS,
  GitLabPluginSettings,
  GitLabSettingTab,
  normalizeBaseUrl,
} from "./settings";
import {
  GitLabAPIClient,
  GitLabApiError,
  Issue,
  MergeRequest,
} from "./api-client";

enum GitLabResource {
  ISSUE = "issues",
  MERGE_REQUEST = "merge_requests",
}

type BaseEmbedOptions = {
  href: string;
  clses: string | string[];
};

// Key-value pairs where the keys are baseURLs and the value is the API client
// for that URL. This ensures that client lookup can be done quickly per URL
// encountered.
type GitLabAPIClientRecord = Record<string, GitLabAPIClient>;

export default class GitLabPlugin extends Plugin {
  settings: GitLabPluginSettings;
  clients: GitLabAPIClientRecord = {};

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new GitLabSettingTab(this.app, this));
    this.reloadClients();

    // Register OAuth callback handler
    this.registerObsidianProtocolHandler("gitlab-embeds", async (data) => {
      const code = data.code as string;
      const state = data.state as string;

      // Find the instance that initiated this OAuth flow
      const instance = this.settings.instances.find(
        (i) => i.authMethod === AuthMethod.OAuth && i.clientId,
      );
      const baseUrl = instance?.baseUrl;
      const client = baseUrl ? this.clients[baseUrl] : undefined;
      if (client && code && state) {
        await client.handleCallback(code, state);
        new Notice("Successfully connected to GitLab!", 5000);
      }
    });

    this.registerMarkdownPostProcessor(async (element, context) => {
      // Query all the anchor tags in the document and process them.
      const anchorElements = Array.from(element.querySelectorAll("a"));
      await Promise.all(
        anchorElements.map((anchorElement) =>
          this.processAnchor(anchorElement),
        ),
      );
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<GitLabPluginSettings>,
    );
    this.settings.instances = this.settings.instances.map((instance) => {
      const baseUrl = normalizeBaseUrl(instance.baseUrl);
      let authMethod = instance.authMethod;

      if (!authMethod) {
        const patKey = `pat-${baseUrl.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        const pat = this.app.secretStorage.getSecret(patKey);
        if (pat && pat.length > 0) {
          authMethod = AuthMethod.Pat;
        } else if (instance.clientId) {
          authMethod = AuthMethod.OAuth;
        } else {
          authMethod = AuthMethod.None;
        }
      }

      return {
        ...instance,
        baseUrl,
        authMethod,
      };
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  reloadClients() {
    this.clients = {};
    this.settings.instances.forEach(
      (instance) =>
        (this.clients[instance.baseUrl] = new GitLabAPIClient({
          baseURL: instance.baseUrl,
          plugin: this,
          authMethod: instance.authMethod ?? AuthMethod.None,
          clientId: instance.clientId,
          clientSecret: instance.clientSecret,
        })),
    );
  }

  private async processAnchor(anchorElement: HTMLAnchorElement): Promise<void> {
    let url: GitLabURL;
    try {
      const baseUrls = this.settings.instances.map((i) => i.baseUrl);
      url = new GitLabURL(anchorElement.href, baseUrls);
    } catch {
      // This anchor does not need to be processed further since it is not a
      // GitLab URL.
      return;
    }
    const client = this.getRelevantAPIClient(url.baseURL);
    if (!client) return;

    try {
      switch (url.resource) {
        case GitLabResource.ISSUE: {
          const issue = await client.getProjectIssue(
            url.getProjectId(),
            url.id,
          );
          this.renderIssueEmbed(anchorElement, issue);
          break;
        }
        case GitLabResource.MERGE_REQUEST: {
          const mergeRequest = await client.getProjectMergeRequest(
            url.getProjectId(),
            url.id,
          );
          this.renderMergeRequestEmbed(anchorElement, mergeRequest);
          break;
        }
      }
    } catch (e) {
      if (
        e instanceof GitLabApiError &&
        (e.status === 401 || e.status === 403)
      ) {
        new Notice(
          "GitLab embed: configure authentication (PAT or OAuth) in settings.",
          8000,
        );
      }
    }
  }

  /**
   * Retrieve the API client relevant to the given base URL.
   *
   * This assumes that a valid baseURL has been given. Otherwise, it will error.
   *
   * @param baseURL The base URL of a GitLab instance
   * @throws
   */
  private getRelevantAPIClient(baseURL: string) {
    return this.clients[baseURL];
  }

  /**
   * Renders the base of an embed. All embeds are built upon this.
   * @param container - The parent element
   * @param options - Options
   * @returns The base embed.
   */
  private renderBaseEmbed(
    container: HTMLElement,
    options: BaseEmbedOptions,
  ): HTMLElement {
    const embedElement = container.createEl("a");
    embedElement.classList.add("gitlab-embed");

    embedElement.setAttribute("href", options.href);
    embedElement.setAttribute("target", "_blank");
    embedElement.setAttribute("rel", "noopener nofollow");

    embedElement.addClass("gitlab-embed");
    embedElement.addClasses(
      Array.isArray(options.clses) ? options.clses : [options.clses],
    );

    return embedElement;
  }

  /**
   * Renders an issue embed, replacing the original markdown link.
   */
  private renderIssueEmbed(
    anchorElement: HTMLAnchorElement,
    issue: Issue,
  ): void {
    const container = document.createElement("div");
    const embedElement = this.buildIssueEmbed(container, issue);
    anchorElement.replaceWith(embedElement);
  }

  /**
   * Renders a merge request embed, replacing the original markdown link.
   */
  private renderMergeRequestEmbed(
    anchorElement: HTMLAnchorElement,
    mergeRequest: MergeRequest,
  ): void {
    const container = document.createElement("div");
    const embedElement = this.buildMergeRequestEmbed(container, mergeRequest);
    anchorElement.replaceWith(embedElement);
  }

  private buildIssueEmbed(container: HTMLElement, issue: Issue): HTMLElement {
    const embedElement = this.renderBaseEmbed(container, {
      href: issue.webUrl,
      clses: ["gitlab-issue"],
    });

    const baseUrls = this.settings.instances.map((i) => i.baseUrl);
    const { group, project } = new GitLabURL(issue.webUrl, baseUrls);
    const repoElement = embedElement.createEl("div", {
      text: `${group}/${project}`,
    });
    repoElement.classList.add("gitlab-repo");

    const headingElement = embedElement.createEl("div", {
      cls: "gitlab-heading",
    });

    // Identifier element
    headingElement.createEl("span", {
      text: "#" + issue.iid + " ",
      cls: "gitlab-identifier",
    });
    headingElement.appendText(issue.title);

    const detailsElement = embedElement.createDiv({ cls: "gitlab-details" });

    const authorElement = detailsElement.createEl("div", {
      cls: "gitlab-author",
    });
    const authorAvatarElement = authorElement.createEl("img", {
      cls: "gitlab-author-avatar",
    });
    authorAvatarElement.src = issue.author.avatarUrl;
    authorElement.appendText(issue.author.username);

    // Date element
    detailsElement.createEl("div", {
      text: formatDate(issue.createdAt),
      cls: "gitlab-date",
    });

    const labelsElement = detailsElement.createEl("div", {
      cls: "gitlab-labels",
    });

    issue.labels.slice(0, 3).forEach((label) =>
      labelsElement.createEl("div", {
        text: ellipsize(label, 20),
        cls: "gitlab-label",
      }),
    );

    return embedElement;
  }

  private buildMergeRequestEmbed(
    container: HTMLElement,
    mergeRequest: MergeRequest,
  ): HTMLElement {
    const embedElement = this.renderBaseEmbed(container, {
      href: mergeRequest.webUrl,
      clses: ["gitlab-merge-request"],
    });

    const baseUrls = this.settings.instances.map((i) => i.baseUrl);
    const { group, project } = new GitLabURL(mergeRequest.webUrl, baseUrls);
    embedElement.createEl("div", {
      text: `${group}/${project}`,
      cls: "gitlab-repo",
    });

    const headingElement = embedElement.createEl("div", {
      cls: "gitlab-heading",
    });
    headingElement.createEl("span", {
      text: "!" + mergeRequest.iid + " ",
      cls: "gitlab-identifier",
    });
    headingElement.appendText(mergeRequest.title);

    const detailsElement = embedElement.createDiv({ cls: "gitlab-details" });

    const authorElement = detailsElement.createEl("div", {
      cls: "gitlab-author",
    });
    const authorAvatarElement = authorElement.createEl("img", {
      cls: "gitlab-author-avatar",
    });
    authorAvatarElement.src = mergeRequest.author.avatarUrl;
    authorElement.appendText(mergeRequest.author.username);

    detailsElement.createEl("div", {
      text: `${mergeRequest.sourceBranch} → ${mergeRequest.targetBranch}`,
      cls: "gitlab-date",
    });

    detailsElement.createEl("div", {
      text: formatDate(mergeRequest.createdAt),
      cls: "gitlab-date",
    });

    const labelsElement = detailsElement.createEl("div", {
      cls: "gitlab-labels",
    });

    mergeRequest.labels.slice(0, 3).forEach((label) =>
      labelsElement.createEl("div", {
        text: ellipsize(label, 20),
        cls: "gitlab-label",
      }),
    );

    return embedElement;
  }
}

/**
 * Truncates text and appends ellipses if the character count exceeds
 * threshold.
 * @param str - the text to truncate
 * @param count - the threshold
 * @returns truncated text with ellipses or the full text if the text is
 * smaller in length than threshold.
 */
const ellipsize = (str: string, count: number): string => {
  if (str.length <= count) {
    return str;
  }

  const ellipses = "...";

  return str.slice(0, count - ellipses.length).trimEnd() + ellipses;
};

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

class GitLabURL {
  url: string;
  baseURL: string;
  group: string;
  project: string;
  resource: GitLabResource;
  id: string;

  constructor(url: string, validBaseURLs: string[]) {
    const normalizedValidBaseURLs = validBaseURLs.map(normalizeBaseUrl);
    const baseURL = normalizedValidBaseURLs.find((b) =>
      normalizeBaseUrl(url).startsWith(b),
    );
    if (!baseURL)
      throw new TypeError(
        "URL does not match any configured GitLab instances: " + url,
      );

    const pathToMatch = url.substring(baseURL.length);

    const pattern = /^\/(.+?)\/([^/]+)\/-\/([^/]+)\/(\d+)/;
    const match = pattern.exec(pathToMatch);

    if (match === null) throw new TypeError(`Invalid GitLab URL: ${url}`);
    if (match.length !== 5)
      throw new TypeError(`Wrong format GitLab URL: ${url}`);

    this.url = url;
    this.baseURL = baseURL;
    this.group = match[1] as string;
    this.project = match[2] as string;
    this.resource = match[3] as GitLabResource;
    this.id = match[4] as string;
  }

  getProjectId() {
    return `${this.group}%2f${this.project}`;
  }
}
