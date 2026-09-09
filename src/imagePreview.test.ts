import { describe, expect, it } from "vitest";
import { withAssetRevision } from "./imagePreview";

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
