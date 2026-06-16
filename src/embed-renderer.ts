import { Issue, MergeRequest } from "./api-client";
import { GitLabURL } from "./gitlab-url";

const ellipsize = (str: string, count: number): string => {
  if (str.length <= count) {
    return str;
  }

  const ellipses = "...";

  return str.slice(0, count - ellipses.length).trimEnd() + ellipses;
};

const pipelineStatusEmojis: Record<string, string> = {
  success: "✅",
  failed: "❌",
  running: "🔄",
  pending: "⏳",
  canceled: "🚫",
  cancelled: "🚫",
  skipped: "⏭️",
};

const pipelineStatusLabels: Record<string, string> = {
  success: "Passed",
  failed: "Failed",
  running: "Running",
  pending: "Pending",
  canceled: "Canceled",
  cancelled: "Canceled",
  skipped: "Skipped",
};

const formatPipelineStatus = (status: string): string => {
  return pipelineStatusLabels[status] ?? status;
};

const formatPipelineEmoji = (status: string): string => {
  return pipelineStatusEmojis[status] ?? "⚙️";
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
};

const formatPipelineMeta = (
  pipeline: NonNullable<MergeRequest["headPipeline"]>,
): string => {
  const parts: string[] = [];

  if (pipeline.iid !== undefined) {
    parts.push(`#${pipeline.iid}`);
  }

  if (pipeline.duration !== undefined) {
    parts.push(formatDuration(pipeline.duration));
  }

  if (pipeline.finishedAt) {
    parts.push(formatDate(pipeline.finishedAt));
  }

  return parts.join(" · ");
};

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const mergeStateEmojis: Record<string, string> = {
  opened: "🟢",
  merged: "🔀",
  closed: "🔒",
  locked: "🔒",
};

const mergeStateLabels: Record<string, string> = {
  opened: "Open",
  merged: "Merged",
  closed: "Closed",
  locked: "Locked",
};

const formatMergeStateEmoji = (state: string): string => {
  return mergeStateEmojis[state] ?? "📋";
};

const formatMergeStateLabel = (state: string): string => {
  return mergeStateLabels[state] ?? state;
};

const formatMergeStateMeta = (mergeRequest: MergeRequest): string => {
  if (mergeRequest.state === "merged" && mergeRequest.mergedAt) {
    return formatDate(mergeRequest.mergedAt);
  }

  if (mergeRequest.state === "closed" && mergeRequest.closedAt) {
    return formatDate(mergeRequest.closedAt);
  }

  if (mergeRequest.state === "opened") {
    return formatDate(mergeRequest.createdAt);
  }

  return "";
};

function renderStatusBlock(
  parent: HTMLElement,
  options: {
    modifier: string;
    emoji: string;
    label: string;
    meta?: string;
    title?: string;
  },
): void {
  const block = parent.createDiv({
    cls: `gitlab-status-block gitlab-status-block--${options.modifier}`,
  });

  const statusRow = block.createDiv({ cls: "gitlab-status-block-row" });
  statusRow.createEl("span", {
    text: options.emoji,
    cls: "gitlab-status-block-emoji",
  });
  statusRow.createEl("span", {
    text: options.label,
    cls: "gitlab-status-block-label",
  });

  if (options.meta) {
    block.createEl("div", {
      text: options.meta,
      cls: "gitlab-status-block-meta",
    });
  }

  if (options.title) {
    block.setAttr("title", options.title);
  }
}

function setupEmbedElement(
  embedElement: HTMLElement,
  href: string,
  cls: string,
): void {
  embedElement.classList.add("gitlab-embed", cls);
  embedElement.setAttribute("href", href);
  embedElement.setAttribute("target", "_blank");
  embedElement.setAttribute("rel", "noopener nofollow");
}

function populateIssueEmbed(
  embedElement: HTMLElement,
  issue: Issue,
  baseUrls: string[],
): void {
  setupEmbedElement(embedElement, issue.webUrl, "gitlab-issue");

  const { group, project } = new GitLabURL(issue.webUrl, baseUrls);
  embedElement.createEl("div", {
    text: `${group}/${project}`,
    cls: "gitlab-repo",
  });

  const headingElement = embedElement.createEl("div", {
    cls: "gitlab-heading",
  });

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
}

function populateMergeRequestEmbed(
  embedElement: HTMLElement,
  mergeRequest: MergeRequest,
  baseUrls: string[],
): void {
  setupEmbedElement(embedElement, mergeRequest.webUrl, "gitlab-merge-request");

  const bodyElement = embedElement.createDiv({ cls: "gitlab-embed-body" });
  const mainElement = bodyElement.createDiv({ cls: "gitlab-embed-main" });

  const { group, project } = new GitLabURL(mergeRequest.webUrl, baseUrls);
  mainElement.createEl("div", {
    text: `${group}/${project}`,
    cls: "gitlab-repo",
  });

  const headingElement = mainElement.createEl("div", {
    cls: "gitlab-heading",
  });
  headingElement.createEl("span", {
    text: "!" + mergeRequest.iid + " ",
    cls: "gitlab-identifier",
  });
  headingElement.appendText(mergeRequest.title);

  const detailsElement = mainElement.createDiv({ cls: "gitlab-details" });

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

  const asideElement = bodyElement.createDiv({ cls: "gitlab-embed-aside" });

  renderStatusBlock(asideElement, {
    modifier: mergeRequest.state,
    emoji: formatMergeStateEmoji(mergeRequest.state),
    label: formatMergeStateLabel(mergeRequest.state),
    meta: formatMergeStateMeta(mergeRequest),
  });

  if (mergeRequest.headPipeline) {
    const pipeline = mergeRequest.headPipeline;
    const { status } = pipeline;
    const meta = formatPipelineMeta(pipeline);

    renderStatusBlock(asideElement, {
      modifier: status,
      emoji: formatPipelineEmoji(status),
      label: formatPipelineStatus(status),
      meta: meta || undefined,
      title: pipeline.webUrl
        ? `Pipeline ${meta || formatPipelineStatus(status)}`
        : undefined,
    });
  }
}

export type EmbedData = Issue | MergeRequest;

export function renderEmbedInto(
  embedElement: HTMLElement,
  baseUrls: string[],
  data: EmbedData,
): void {
  embedElement.empty();
  embedElement.removeClass("gitlab-embed-loading");

  if ("sourceBranch" in data) {
    populateMergeRequestEmbed(embedElement, data, baseUrls);
    return;
  }

  populateIssueEmbed(embedElement, data, baseUrls);
}

export function renderEmbedElement(
  baseUrls: string[],
  data: EmbedData,
): HTMLElement {
  const embedElement = document.createElement("a");
  renderEmbedInto(embedElement, baseUrls, data);
  return embedElement;
}
