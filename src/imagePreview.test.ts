import { describe, expect, it } from "vitest";
import { prepareMarkdownImages, withAssetRevision } from "./imagePreview";

describe("withAssetRevision", () => {
  it("adds a revision to an asset URL", () => {
    expect(withAssetRevision("asset://localhost/image.svg", "tab-1"))
      .toBe("asset://localhost/image.svg?openview-revision=tab-1");
  });

  it("preserves existing query parameters and fragments", () => {
    expect(withAssetRevision("asset://localhost/image.svg?size=large#preview", "tab-2"))
      .toBe("asset://localhost/image.svg?size=large&openview-revision=tab-2#preview");
  });

  it("replaces an existing revision and encodes the new token", () => {
    expect(withAssetRevision(
      "asset://localhost/image.svg?openview-revision=old&size=large",
      "tab id/3",
    )).toBe("asset://localhost/image.svg?openview-revision=tab+id%2F3&size=large");
  });
});

describe("prepareMarkdownImages", () => {
  it("revises local images and reports unique decoded paths", () => {
    const result = prepareMarkdownImages(`
      <p><img src="asset://localhost/Users/me/project/assets/chart%201.png?size=large#preview"></p>
      <img src="asset://localhost/Users/me/project/assets/chart%201.png">
    `, "tab-4");
    const template = document.createElement("template");
    template.innerHTML = result.html;
    const sources = [...template.content.querySelectorAll("img")].map((image) => image.getAttribute("src"));

    expect(sources).toEqual([
      "asset://localhost/Users/me/project/assets/chart%201.png?size=large&openview-revision=tab-4#preview",
      "asset://localhost/Users/me/project/assets/chart%201.png?openview-revision=tab-4",
    ]);
    expect(result.localImagePaths).toEqual(["/Users/me/project/assets/chart 1.png"]);
  });

  it("normalizes the double leading slash emitted for absolute paths", () => {
    const result = prepareMarkdownImages(
      '<img src="asset://localhost//Users/me/project/assets/chart.png">',
      "tab-5",
    );

    expect(result.localImagePaths).toEqual(["/Users/me/project/assets/chart.png"]);
    expect(result.html).toContain("asset://localhost//Users/me/project/assets/chart.png?openview-revision=tab-5");
  });

  it("leaves non-local images unchanged and untracked", () => {
    const html = `
      <img src="https://example.com/image.png">
      <img src="data:image/png;base64,abc">
      <img src="asset://remote/image.png">
    `;

    expect(prepareMarkdownImages(html, "tab-5")).toEqual({
      html,
      localImagePaths: [],
    });
  });

  it("replaces an existing Markdown image revision", () => {
    const result = prepareMarkdownImages(
      '<img src="asset://localhost/Users/me/image.png?openview-revision=old">',
      "new",
    );

    expect(result.html).toContain("openview-revision=new");
    expect(result.html).not.toContain("openview-revision=old");
  });
});
