import DOMPurify from "dompurify";
import { Inflate } from "pako";

const MAX_SOURCE_LENGTH = 20 * 1024 * 1024;
const MAX_PAGE_COUNT = 100;
const MAX_MODEL_LENGTH = 20 * 1024 * 1024;
const MAX_CELL_COUNT = 100_000;

const LABEL_TAGS = [
  "b",
  "br",
  "div",
  "em",
  "font",
  "i",
  "p",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
];

const BLOCKED_STYLE_KEYS = new Set([
  "backgroundimage",
  "image",
  "indicatorimage",
]);

export interface DrawioPage {
  id: string;
  name: string;
  modelXml: string;
}

function parseXml(source: string, message: string): XMLDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("Draw.io files with document type or entity declarations are not supported");
  }

  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error(message);
  }
  return document;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Invalid compressed Draw.io page");
  }

  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("Invalid compressed Draw.io page");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeDiagramPayload(payload: string): string {
  const inflator = new Inflate({ raw: true, chunkSize: 64 * 1024 });
  const chunks: Uint8Array[] = [];
  let outputLength = 0;

  inflator.onData = (chunk) => {
    outputLength += chunk.length;
    if (outputLength > MAX_MODEL_LENGTH) {
      throw new Error("Draw.io page is too large to preview");
    }
    chunks.push(chunk);
  };

  try {
    inflator.push(decodeBase64(payload), true);
  } catch (error) {
    if (error instanceof Error && error.message === "Draw.io page is too large to preview") {
      throw error;
    }
    throw new Error("Invalid compressed Draw.io page");
  }

  if (inflator.err) {
    throw new Error("Invalid compressed Draw.io page");
  }

  const output = new Uint8Array(outputLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  try {
    return decodeURIComponent(new TextDecoder("utf-8", { fatal: true }).decode(output));
  } catch {
    throw new Error("Invalid compressed Draw.io page");
  }
}

function sanitizeLabel(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: LABEL_TAGS,
    ALLOWED_ATTR: ["color"],
    ALLOW_DATA_ATTR: false,
  });
}

function sanitizeStyle(style: string): string {
  return style
    .split(";")
    .filter(Boolean)
    .filter((entry) => {
      const separator = entry.indexOf("=");
      const key = (separator === -1 ? entry : entry.slice(0, separator)).trim().toLowerCase();
      const value = separator === -1 ? "" : entry.slice(separator + 1).trim().toLowerCase();
      if (BLOCKED_STYLE_KEYS.has(key)) return false;
      if (key === "shape" && (value === "image" || value === "label")) return false;
      return !/(?:javascript|https?|file|asset|data):|url\s*\(/i.test(value);
    })
    .join(";");
}

export function sanitizeGraphModel(source: string): string {
  if (source.length > MAX_MODEL_LENGTH) {
    throw new Error("Draw.io page is too large to preview");
  }

  const document = parseXml(source, "Invalid Draw.io page data");
  const root = document.documentElement;
  if (root.localName !== "mxGraphModel") {
    throw new Error("Draw.io page does not contain a graph model");
  }

  const cells = root.getElementsByTagName("mxCell");
  if (cells.length > MAX_CELL_COUNT) {
    throw new Error("Draw.io page has too many cells to preview");
  }

  for (const element of Array.from(root.getElementsByTagName("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "href" || name === "link" || name === "src") {
        element.removeAttribute(attribute.name);
      }
    }

    for (const attributeName of ["label", "value"]) {
      if (element.hasAttribute(attributeName)) {
        element.setAttribute(attributeName, sanitizeLabel(element.getAttribute(attributeName) ?? ""));
      }
    }

    if (element.hasAttribute("style")) {
      element.setAttribute("style", sanitizeStyle(element.getAttribute("style") ?? ""));
    }
  }

  return new XMLSerializer().serializeToString(root);
}

function modelFromDiagram(diagram: Element): string {
  const nestedModel = Array.from(diagram.children).find((child) => child.localName === "mxGraphModel");
  if (nestedModel) {
    return new XMLSerializer().serializeToString(nestedModel);
  }

  const payload = diagram.textContent?.trim() ?? "";
  if (!payload) {
    throw new Error("Draw.io page does not contain a graph model");
  }
  return decodeDiagramPayload(payload);
}

export function parseDrawioFile(content: string): DrawioPage[] {
  if (!content.trim()) {
    throw new Error("Draw.io file is empty");
  }
  if (content.length > MAX_SOURCE_LENGTH) {
    throw new Error("Draw.io file is too large to preview");
  }

  const document = parseXml(content, "Invalid Draw.io file");
  const root = document.documentElement;

  if (root.localName === "mxGraphModel") {
    return [{ id: "page-1", name: "Page 1", modelXml: sanitizeGraphModel(content) }];
  }
  if (root.localName !== "mxfile") {
    throw new Error("File is not a Draw.io diagram");
  }

  const diagrams = Array.from(root.children).filter((child) => child.localName === "diagram");
  if (!diagrams.length) {
    throw new Error("Draw.io file does not contain any pages");
  }
  if (diagrams.length > MAX_PAGE_COUNT) {
    throw new Error("Draw.io file has too many pages to preview");
  }

  const usedIds = new Set<string>();
  return diagrams.map((diagram, index) => {
    const originalId = diagram.getAttribute("id")?.trim() || `page-${index + 1}`;
    let id = originalId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${originalId}-${suffix++}`;
    usedIds.add(id);

    return {
      id,
      name: diagram.getAttribute("name")?.trim() || `Page ${index + 1}`,
      modelXml: sanitizeGraphModel(modelFromDiagram(diagram)),
    };
  });
}
