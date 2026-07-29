import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}));

const { rewriteRelativeUrls } = await import("./HtmlViewer");

const DIR = "/proj/site";

describe("rewriteRelativeUrls", () => {
  it("rewrites relative src and href to asset urls", () => {
    const out = rewriteRelativeUrls(`<img src="a.png"><link href='css/b.css'>`, DIR);
    expect(out).toContain(`src="asset://`);
    expect(out).toContain(encodeURIComponent(`${DIR}/a.png`));
    expect(out).toContain(encodeURIComponent(`${DIR}/css/b.css`));
  });

  it("preserves query and fragment suffixes outside the asset path", () => {
    const out = rewriteRelativeUrls(`<link href="b.css?v=2#x">`, DIR);
    expect(out).toContain(`${encodeURIComponent(`${DIR}/b.css`)}?v=2#x"`);
  });

  it("skips absolute urls, protocol-relative, absolute paths, and anchors", () => {
    const html = [
      `<a href="https://example.com/x">`,
      `<a href="//cdn.example.com/y">`,
      `<a href="/abs.png">`,
      `<a href="#top">`,
      `<a href="mailto:a@b.c">`,
      `<img src="data:image/png;base64,AA">`,
    ].join("");
    expect(rewriteRelativeUrls(html, DIR)).toBe(html);
  });

  it("returns html without src/href untouched", () => {
    const html = `<p>src= href= nothing quoted</p>`;
    expect(rewriteRelativeUrls(html, DIR)).toBe(html);
  });
});
