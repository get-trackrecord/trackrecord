import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { analyze } from "@trackrecord/core";

const run = promisify(execFile);
const BIN = resolve(__dirname, "../dist/index.js");
const FIXTURES = resolve(__dirname, "../../../fixtures/projects");

async function cli(...args: string[]) {
  try {
    const r = await run(process.execPath, [BIN, ...args]);
    return { code: 0, ...r };
  } catch (e) {
    const err = e as { code?: number; stdout: string; stderr: string };
    return { code: err.code ?? 1, stdout: err.stdout, stderr: err.stderr };
  }
}

describe("--dir handling", () => {
  it("nonexistent dir: graceful one-line error, exit 1, no stack trace", async () => {
    const r = await cli("--dir", "C:\\definitely\\not\\a\\real\\dir");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("directory not found");
    expect(r.stderr).not.toMatch(/\n\s+at /); // no stack frames
    expect(r.stdout).toBe("");
  });

  it("doctor and card also refuse a nonexistent dir gracefully", async () => {
    for (const cmd of [["doctor"], ["card"]]) {
      const r = await cli(...cmd, "--dir", "C:\\nope\\nope");
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("directory not found");
    }
  });

  it("empty dir: valid empty corpus, zeros, exit 0", async () => {
    const empty = mkdtempSync(join(tmpdir(), "trackrecord-empty-"));
    try {
      const r = await cli("--json", "--dir", empty);
      expect(r.code).toBe(0);
      const m = JSON.parse(r.stdout);
      expect(m.source.files).toBe(0);
      expect(m.activity.sessions).toBe(0);
      expect(m.source.dateRange).toEqual([null, null]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("path shapes", () => {
  let dir: string;
  beforeAll(() => {
    // unicode + spaces + emoji in the project DIRECTORY name
    dir = mkdtempSync(join(tmpdir(), "trackrecord-uni-"));
    const weird = join(dir, "C--Users-ü ser-проект files 🚀");
    mkdirSync(weird, { recursive: true });
    cpSync(
      join(FIXTURES, "C--dev-demo-app", "0a000001-0000-4000-8000-000000000001.jsonl"),
      join(weird, "0a000001-0000-4000-8000-000000000001.jsonl"),
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("handles unicode, spaces, and emoji in project directory names", async () => {
    const m = await analyze({ dir, now: new Date("2026-06-09T00:00:00.000Z") });
    expect(m.activity.sessions).toBe(1);
    expect(m.output.linesAdded.code).toBe(4); // 3-line write + 1-line edit add
  });

  it("backslash and forward-slash file_paths land in the same buckets", async () => {
    // the LOC engine normalizes; covered at unit level in buckets.test.ts —
    // here verify end-to-end equivalence through analyze on generated records
    const mixed = mkdtempSync(join(tmpdir(), "trackrecord-slash-"));
    try {
      const proj = join(mixed, "C--x-slash");
      mkdirSync(proj, { recursive: true });
      const rec = (id: string, path: string) =>
        JSON.stringify({
          type: "assistant", uuid: id, sessionId: "s1", requestId: id,
          timestamp: "2026-06-01T00:00:00.000Z", cwd: "C:/x/slash",
          message: { role: "assistant", content: [
            { type: "tool_use", id, name: "Write", input: { file_path: path, content: "a\nb" } },
          ] },
        });
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        join(proj, "0a00aaaa-0000-4000-8000-000000000001.jsonl"),
        `${rec("w1", "C:\\x\\slash\\src\\one.ts")}\n${rec("w2", "C:/x/slash/src/two.ts")}\n`,
      );
      const m = await analyze({ dir: mixed });
      expect(m.output.linesAdded.code).toBe(4);
      expect(m.output.filesCreated).toBe(2);
      const ts = m.output.byLanguage.find((l) => l.lang === "ts");
      expect(ts?.files).toBe(2);
    } finally {
      rmSync(mixed, { recursive: true, force: true });
    }
  });
});
