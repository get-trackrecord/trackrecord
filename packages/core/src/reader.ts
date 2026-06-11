import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import type { RawRecord, SourceFile } from "./types.js";
import type { WarningCollector } from "./warnings.js";

/**
 * Privacy posture: file-history-snapshot records may contain full file
 * contents. We detect them with a raw substring check BEFORE JSON.parse and
 * emit a `{ type }` stub without ever materializing the body. Inside JSON
 * strings quotes are escaped (`\"`), so this unescaped key-value sequence can
 * only occur at object level.
 */
const SNAPSHOT_MARKER = '"type":"file-history-snapshot"';

/** Recursively find every .jsonl transcript under a projects directory. */
export async function discoverFiles(dir: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip, never throw
    }
    for (const entry of entries) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.name.endsWith(".jsonl")) {
        out.push({ path: p, basename: basename(p), isAgent: entry.name.startsWith("agent-") });
      }
    }
  }
  await walk(dir);
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Stream a transcript line-by-line (files can be hundreds of MB — never load
 * whole files). Unparseable lines are tallied, never thrown.
 */
export async function* readRecords(
  filePath: string,
  warnings: WarningCollector,
): AsyncGenerator<RawRecord> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const file = basename(filePath);
  for await (const line of rl) {
    if (line.trim().length === 0) continue;
    if (line.includes(SNAPSHOT_MARKER)) {
      yield { type: "file-history-snapshot" };
      continue;
    }
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      warnings.tally("unparseableLine", { file });
      continue;
    }
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      warnings.tally("unparseableLine", { file });
      continue;
    }
    yield record as RawRecord;
  }
}
