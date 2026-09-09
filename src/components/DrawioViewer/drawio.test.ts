import { deflateRaw } from "pako";
import { describe, expect, it } from "vitest";
import { decodeDiagramPayload, parseDrawioFile, sanitizeGraphModel } from "./drawio";

const MODEL = `
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="你好&lt;br&gt;&lt;font color=&quot;#168F58&quot;&gt;世界&lt;/font&gt;" style="rounded=1;fillColor=#fff;" vertex="1" parent="1">
      <mxGeometry x="10" y="20" width="100" height="50" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>`;

function compressModel(model: string): string {
  const compressed = deflateRaw(encodeURIComponent(model));
  let binary = "";
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("parseDrawioFile", () => {
  it("parses ordered uncompressed pages with Unicode names", () => {
    const content = `<mxfile>
      <diagram id="first" name="布丁驱动流程">${MODEL}</diagram>
      <diagram id="second" name="平台能力与边界">${MODEL.replace("你好", "第二页")}</diagram>
    </mxfile>`;

    const pages = parseDrawioFile(content);

    expect(pages.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "first", name: "布丁驱动流程" },
      { id: "second", name: "平台能力与边界" },
    ]);
    expect(pages[0].modelXml).toContain("mxGraphModel");
    expect(pages[0].modelXml).toContain("你好");
    expect(pages[1].modelXml).toContain("第二页");
  });

  it("decodes a compressed Draw.io page", () => {
    const payload = compressModel(MODEL);
    const pages = parseDrawioFile(`<mxfile><diagram id="compressed">${payload}</diagram></mxfile>`);

    expect(decodeDiagramPayload(payload)).toContain("你好");
    expect(pages).toHaveLength(1);
    expect(pages[0].modelXml).toContain("mxGeometry");
  });

  it("accepts a bare graph model", () => {
    const pages = parseDrawioFile(MODEL);

    expect(pages).toHaveLength(1);
    expect(pages[0].name).toBe("Page 1");
  });

  it("creates unique IDs and fallback names", () => {
    const pages = parseDrawioFile(`<mxfile>
      <diagram id="same">${MODEL}</diagram>
      <diagram id="same">${MODEL}</diagram>
    </mxfile>`);

    expect(pages.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "same", name: "Page 1" },
      { id: "same-2", name: "Page 2" },
    ]);
  });

  it("rejects malformed and unsupported XML", () => {
    expect(() => parseDrawioFile("")).toThrow("empty");
    expect(() => parseDrawioFile("<mxfile>")).toThrow("Invalid Draw.io file");
    expect(() => parseDrawioFile("<!DOCTYPE x><mxfile/>")).toThrow("document type");
    expect(() => parseDrawioFile("<document/>")).toThrow("not a Draw.io diagram");
    expect(() => parseDrawioFile("<mxfile/>")).toThrow("does not contain any pages");
    expect(() => parseDrawioFile("<mxfile><diagram>not-base64</diagram></mxfile>"))
      .toThrow("Invalid compressed Draw.io page");
  });

  it("rejects files with too many pages", () => {
    const diagrams = Array.from(
      { length: 101 },
      (_, index) => `<diagram id="page-${index}">${MODEL}</diagram>`,
    ).join("");

    expect(() => parseDrawioFile(`<mxfile>${diagrams}</mxfile>`)).toThrow("too many pages");
  });

  it("rejects source and decompressed page data over 20 MiB", () => {
    expect(() => parseDrawioFile(`<mxfile>${"x".repeat(20 * 1024 * 1024)}</mxfile>`))
      .toThrow("file is too large");

    const oversizedModel = `<mxGraphModel>${"x".repeat(20 * 1024 * 1024)}</mxGraphModel>`;
    expect(() => decodeDiagramPayload(compressModel(oversizedModel)))
      .toThrow("page is too large");
  });
});

describe("sanitizeGraphModel", () => {
  it("keeps safe formatting and removes executable or remote content", () => {
    const unsafe = `<mxGraphModel><root>
      <mxCell id="0"/>
      <mxCell id="1" parent="0"/>
      <mxCell id="2" link="https://example.com" onclick="alert(1)"
        value="&lt;b&gt;Safe&lt;/b&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;a href='https://example.com'&gt;link&lt;/a&gt;"
        style="shape=image;image=https://example.com/x.png;fillColor=#fff;strokeColor=#000;" vertex="1" parent="1"/>
    </root></mxGraphModel>`;

    const sanitized = sanitizeGraphModel(unsafe);
    const document = new DOMParser().parseFromString(sanitized, "application/xml");
    const cell = document.querySelector('mxCell[id="2"]')!;

    expect(cell.hasAttribute("link")).toBe(false);
    expect(cell.hasAttribute("onclick")).toBe(false);
    expect(cell.getAttribute("value")).toContain("<b>Safe</b>");
    expect(cell.getAttribute("value")).not.toContain("script");
    expect(cell.getAttribute("value")).not.toContain("href");
    expect(cell.getAttribute("style")).toBe("fillColor=#fff;strokeColor=#000");
  });

  it("rejects graph models with too many cells", () => {
    const cells = "<mxCell/>".repeat(100_001);

    expect(() => sanitizeGraphModel(`<mxGraphModel><root>${cells}</root></mxGraphModel>`))
      .toThrow("too many cells");
  });
});
