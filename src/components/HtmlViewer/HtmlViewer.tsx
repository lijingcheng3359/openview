import { Component, createMemo } from "solid-js";
import { convertFileSrc } from "@tauri-apps/api/core";
import "./HtmlViewer.css";

interface HtmlViewerProps {
  path: string;
  content: string;
}

// Skip absolute URLs, protocol-relative URLs, absolute paths, and anchors.
const NON_RELATIVE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

// WKWebView refuses to navigate iframes to the asset: protocol, and
// convertFileSrc percent-encodes the whole path into a single URL segment,
// which breaks <base>-relative resolution — so we render via srcdoc and
// rewrite relative src/href attributes to absolute asset URLs instead.
export function rewriteRelativeUrls(html: string, dir: string): string {
  return html.replace(
    /(src|href)=(["'])([^"']+)\2/gi,
    (match, attr: string, quote: string, url: string) => {
      if (NON_RELATIVE_URL.test(url)) return match;
      const suffixStart = url.search(/[?#]/);
      const path = suffixStart === -1 ? url : url.slice(0, suffixStart);
      const suffix = suffixStart === -1 ? "" : url.slice(suffixStart);
      return `${attr}=${quote}${convertFileSrc(`${dir}/${path}`)}${suffix}${quote}`;
    },
  );
}

const HtmlViewer: Component<HtmlViewerProps> = (props) => {
  const doc = createMemo(() => {
    const dir = props.path.slice(0, props.path.lastIndexOf("/"));
    return rewriteRelativeUrls(props.content, dir);
  });

  return (
    <div class="html-viewer">
      <iframe class="html-viewer-frame" srcdoc={doc()} title={props.path} sandbox="allow-scripts" />
    </div>
  );
};

export default HtmlViewer;
