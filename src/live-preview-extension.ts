/* eslint-disable import/no-extraneous-dependencies -- CodeMirror modules are provided by Obsidian at runtime */
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginSpec,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { SyntaxNode } from "@lezer/common";
import { editorLivePreviewField } from "obsidian";
import {
  fetchEmbed,
  getBaseUrls,
  getUnconfiguredInstanceMessage,
  GitLabEmbedHost,
  isGitLabEmbedUrl,
  looksLikeGitLabEmbedUrl,
} from "./embed-service";
import { renderEmbedInto } from "./embed-renderer";

type EmbedCandidate = {
  from: number;
  to: number;
  href: string;
};

const BARE_URL_PATTERN = /https?:\/\/[^\s)\]<>]+/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/;

function selectionOverlapsRange(
  view: EditorView,
  from: number,
  to: number,
): boolean {
  return view.state.selection.ranges.some(
    (range) => range.from <= to && range.to >= from,
  );
}

function isInsideCodeBlock(view: EditorView, pos: number): boolean {
  const tree = syntaxTree(view.state);
  const node = tree.resolveInner(pos, 1);
  for (
    let current: SyntaxNode | null = node;
    current;
    current = current.parent
  ) {
    const name = current.type.name;
    if (name === "FencedCode" || name === "InlineCode") {
      return true;
    }
  }
  return false;
}

function isVisibleLine(
  lineFrom: number,
  lineTo: number,
  visibleFrom: number,
  visibleTo: number,
): boolean {
  return lineTo >= visibleFrom && lineFrom <= visibleTo;
}

function collectEmbedCandidates(view: EditorView): EmbedCandidate[] {
  const candidates: EmbedCandidate[] = [];
  const visibleFrom = view.visibleRanges[0]?.from ?? 0;
  const visibleTo =
    view.visibleRanges[view.visibleRanges.length - 1]?.to ??
    view.state.doc.length;

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
    const line = view.state.doc.line(lineNumber);
    if (!isVisibleLine(line.from, line.to, visibleFrom, visibleTo)) {
      continue;
    }

    ensureSyntaxTree(view.state, line.to, 500);

    const markdownLinkMatch = line.text.match(MARKDOWN_LINK_PATTERN);
    if (markdownLinkMatch) {
      const fullMatch = markdownLinkMatch[0];
      const href = markdownLinkMatch[2] ?? "";
      if (
        looksLikeGitLabEmbedUrl(href) &&
        !isInsideCodeBlock(view, line.from)
      ) {
        const start = line.from + line.text.indexOf(fullMatch);
        const end = start + fullMatch.length;
        if (!selectionOverlapsRange(view, start, end)) {
          candidates.push({ from: start, to: end, href });
        }
      }
      continue;
    }

    BARE_URL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BARE_URL_PATTERN.exec(line.text)) !== null) {
      const href = match[0];
      if (!looksLikeGitLabEmbedUrl(href)) {
        continue;
      }

      const start = line.from + match.index;
      const end = start + href.length;
      if (isInsideCodeBlock(view, start)) {
        continue;
      }
      if (selectionOverlapsRange(view, start, end)) {
        continue;
      }

      candidates.push({ from: start, to: end, href });
    }
  }

  return candidates.sort((a, b) => a.from - b.from);
}

class GitLabEmbedWidget extends WidgetType {
  private loadVersion = 0;

  constructor(
    private href: string,
    private host: GitLabEmbedHost,
  ) {
    super();
  }

  eq(other: GitLabEmbedWidget): boolean {
    return other.href === this.href;
  }

  toDOM(): HTMLElement {
    const embedElement = document.createElement("a");
    embedElement.classList.add("gitlab-embed", "gitlab-embed-loading");
    embedElement.setAttribute("href", this.href);
    embedElement.setAttribute("target", "_blank");
    embedElement.setAttribute("rel", "noopener nofollow");

    const baseUrls = getBaseUrls(this.host);
    if (!isGitLabEmbedUrl(this.href, baseUrls)) {
      const message =
        getUnconfiguredInstanceMessage(this.href) ?? "Unsupported GitLab URL.";
      embedElement.setText(message);
      embedElement.removeClass("gitlab-embed-loading");
      return embedElement;
    }

    embedElement.setText("Loading GitLab embed…");
    void this.loadEmbed(embedElement);
    return embedElement;
  }

  private async loadEmbed(embedElement: HTMLElement): Promise<void> {
    const version = ++this.loadVersion;
    const data = await fetchEmbed(this.host, this.href);
    if (version !== this.loadVersion || !data) {
      if (version === this.loadVersion && embedElement.isConnected) {
        embedElement.empty();
        embedElement.setText("Unable to load GitLab embed.");
        embedElement.removeClass("gitlab-embed-loading");
      }
      return;
    }

    if (!embedElement.isConnected) {
      return;
    }

    renderEmbedInto(embedElement, getBaseUrls(this.host), data);
  }
}

function createGitLabLivePreviewPlugin(host: GitLabEmbedHost) {
  class GitLabLivePreviewPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    destroy() {}

    private buildDecorations(view: EditorView): DecorationSet {
      if (!view.state.field(editorLivePreviewField)) {
        return Decoration.none;
      }

      const builder = new RangeSetBuilder<Decoration>();
      const candidates = collectEmbedCandidates(view);

      for (const candidate of candidates) {
        builder.add(
          candidate.from,
          candidate.to,
          Decoration.replace({
            widget: new GitLabEmbedWidget(candidate.href, host),
          }),
        );
      }

      return builder.finish();
    }
  }

  const pluginSpec: PluginSpec<GitLabLivePreviewPlugin> = {
    decorations: (value: GitLabLivePreviewPlugin) => value.decorations,
  };

  return ViewPlugin.fromClass(GitLabLivePreviewPlugin, pluginSpec);
}

export function createGitLabLivePreviewExtension(host: GitLabEmbedHost) {
  return createGitLabLivePreviewPlugin(host);
}
