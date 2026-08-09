import { describe, it, expect } from "vitest";

const { parseJsonOrJsonl } = await import("./JsonViewer");

describe("parseJsonOrJsonl", () => {
  it("parses plain json", () => {
    const r = parseJsonOrJsonl(`{"a": 1}`);
    expect(r).toEqual({ ok: true, data: { a: 1 }, jsonl: false, records: 1 });
  });

  it("parses jsonl into an array of records", () => {
    const r = parseJsonOrJsonl(`{"a":1}\n{"a":2}\n\n{"a":3}\n`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jsonl).toBe(true);
    expect(r.records).toBe(3);
    expect(r.data).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("reports the offending line number for broken jsonl", () => {
    const r = parseJsonOrJsonl(`{"a":1}\n\nnot json\n`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Line 3");
  });

  it("keeps the json error for single-line invalid content", () => {
    const r = parseJsonOrJsonl(`{"a": }`);
    expect(r.ok).toBe(false);
  });
});
