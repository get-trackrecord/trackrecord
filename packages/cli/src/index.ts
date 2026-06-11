import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { analyze, survey } from "@trackrecord/core";
import { renderDoctor } from "./doctor.js";
import { renderSummary, suspectWriterWarnings } from "./summary.js";
import { retentionNotice } from "./retention.js";

const DEFAULT_DIR = join(homedir(), ".claude", "projects");

const program = new Command();

program
  .name("trackrecord")
  .description("Your Claude Code track record — local, honest, free. Zero network calls.")
  .option("--json", "emit the full schema object to stdout")
  .option("--dir <path>", "override the projects directory", DEFAULT_DIR)
  .action(async (opts: { json?: boolean; dir: string }) => {
    const metrics = await analyze({ dir: opts.dir });
    const notice = retentionNotice(metrics);
    if (opts.json) {
      // stdout carries ONLY the schema object; notices go to stderr
      process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
      if (notice) process.stderr.write(`${notice}\n`);
      return;
    }
    process.stdout.write(`${renderSummary(metrics)}\n`);
    for (const warning of suspectWriterWarnings(metrics)) {
      process.stdout.write(`${warning}\n`);
    }
    if (notice) process.stdout.write(`\n${notice}\n`);
  });

program
  .command("card")
  .description("render the shareable ship card PNG")
  .option("--dir <path>", "override the projects directory", DEFAULT_DIR)
  .option("--since <date>", "only count activity since YYYY-MM-DD")
  .option("--range <range>", "only count activity in YYYY-MM-DD..YYYY-MM-DD")
  .option("--out <path>", "output path", "./trackrecord-card.png")
  .action(async (opts: { dir: string; since?: string; range?: string; out: string }) => {
    const { parseDateOptions, renderCardPng } = await import("./card.js");
    const { writeFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const metrics = await analyze({ dir: opts.dir, ...parseDateOptions(opts) });
    const png = await renderCardPng(metrics);
    const out = resolve(opts.out);
    await writeFile(out, png);
    process.stdout.write(`${out}\n`);
    const notice = retentionNotice(metrics);
    if (notice) process.stderr.write(`${notice}\n`);
  });

program
  .command("doctor")
  .description("anonymized corpus structure survey — paste into a GitHub issue")
  .option("--dir <path>", "override the projects directory", DEFAULT_DIR)
  .action(async (opts: { dir: string }) => {
    const s = await survey(opts.dir);
    process.stdout.write(`${renderDoctor(s)}\n`);
  });

program.parseAsync().catch((err: unknown) => {
  process.stderr.write(`trackrecord: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
