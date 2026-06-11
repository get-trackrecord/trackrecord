import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { discoverFiles, readRecords } from "../src/reader.js";
import { WarningCollector } from "../src/warnings.js";
import { corpus } from "../../../fixtures/manifest.js";

const FIXTURES = resolve(__dirname, "../../../fixtures/projects");
const DEMO = resolve(FIXTURES, "C--dev-demo-app");

async function readAll(file: string, warnings = new WarningCollector()) {
  const records = [];
  for await (const r of readRecords(file, warnings)) records.push(r);
  return { records, warnings };
}

describe("discoverFiles", () => {
  it("finds every .jsonl and flags agent files", async () => {
    const files = await discoverFiles(FIXTURES);
    expect(files).toHaveLength(corpus.files);
    expect(files.filter((f) => f.isAgent)).toHaveLength(corpus.agentFiles);
    expect(files.every((f) => f.basename.endsWith(".jsonl"))).toBe(true);
  });
});

describe("readRecords", () => {
  it("yields one record per line of a clean file", async () => {
    const { records } = await readAll(resolve(DEMO, "0a000001-0000-4000-8000-000000000001.jsonl"));
    expect(records).toHaveLength(7);
    expect(records[0]?.type).toBe("user");
  });

  it("tallies unparseable lines instead of throwing", async () => {
    const { records, warnings } = await readAll(
      resolve(DEMO, "0a000001-0000-4000-8000-000000000005.jsonl"),
    );
    expect(records).toHaveLength(12); // 13 lines, 1 deliberately bad
    const w = warnings.get("unparseableLine");
    expect(w).toHaveLength(1);
    expect(w[0]?.count).toBe(1);
    expect(w[0]?.file).toBe("0a000001-0000-4000-8000-000000000005.jsonl");
  });

  it("never reads file-history-snapshot past the type field", async () => {
    const { records } = await readAll(resolve(DEMO, "0a000001-0000-4000-8000-000000000002.jsonl"));
    const snap = records.find((r) => r.type === "file-history-snapshot");
    expect(snap).toBeDefined();
    expect(Object.keys(snap!)).toEqual(["type"]);
    expect(JSON.stringify(records)).not.toContain(corpus.snapshotSentinel);
  });
});
