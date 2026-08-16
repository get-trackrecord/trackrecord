import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { discoverFiles, readRecords } from "../src/reader.js";
import { classifyRecord } from "../src/classify.js";
import { DeliveryEngine } from "../src/delivery.js";
import { AcceptanceEngine } from "../src/acceptance.js";
import { ToolsEngine } from "../src/tools.js";
import { TokensEngine, rateFor } from "../src/tokens.js";
import { WarningCollector } from "../src/warnings.js";
import { corpus } from "../../../fixtures/manifest.js";

const FIXTURES = resolve(__dirname, "../../../fixtures/projects");

async function runAll() {
  const warnings = new WarningCollector();
  const delivery = new DeliveryEngine();
  const tools = new ToolsEngine();
  const tokens = new TokensEngine();
  for (const file of await discoverFiles(FIXTURES)) {
    for await (const raw of readRecords(file.path, warnings)) {
      const record = classifyRecord(raw, warnings);
      if (!record) continue;
      delivery.addRecord(record, file.isAgent);
      tokens.addAssistant(record);
      if (record.type === "assistant") {
        const msg = record.message as {
          content?: { type: string; name?: string; input?: unknown }[];
        };
        for (const block of msg?.content ?? []) {
          if (block.type === "tool_use" && block.name) {
            tools.addToolUse(block.name);
            delivery.addToolUse(block.name, block.input);
          }
        }
      }
    }
  }
  return { delivery: delivery.result(), tools: tools.result(), tokens: tokens.result() };
}

describe("DeliveryEngine", () => {
  it("dedupes prUrls and counts branches from main files only", async () => {
    const { delivery } = await runAll();
    expect(delivery).toEqual(corpus.delivery);
  });

  it("counts git commits from Bash commands, ignoring non-commit git usage", () => {
    const eng = new DeliveryEngine();
    eng.addToolUse("Bash", { command: "git commit -m 'first'" });
    eng.addToolUse("Bash", { command: "git add -A && git commit -m 'second'" });
    eng.addToolUse("Bash", { command: "git -C /repo commit --amend --no-edit" });
    eng.addToolUse("Bash", { command: "git log --oneline -5" }); // not a commit
    eng.addToolUse("Bash", { command: "echo 'git commit' >> notes.txt" }); // word in a string, not a segment
    eng.addToolUse("Write", { file_path: "x", content: "git commit" }); // not Bash
    expect(eng.result().commits).toBe(3);
  });

  it("excludes --dry-run and --help commit invocations", () => {
    const eng = new DeliveryEngine();
    eng.addToolUse("Bash", { command: "git commit --dry-run" });
    eng.addToolUse("Bash", { command: "git commit --help" });
    eng.addToolUse("Bash", { command: "git commit -m real" });
    expect(eng.result().commits).toBe(1);
  });
});

describe("AcceptanceEngine", () => {
  const use = (id: string, name: string) => ({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", id, name, input: {} }] },
  });
  const result = (id: string, content: unknown, isError = false) => ({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, is_error: isError, content }],
    },
  });

  it("pairs edit tool_use with tool_result and derives the acceptance rate", () => {
    const eng = new AcceptanceEngine();
    eng.addRecord(use("t1", "Edit"));
    eng.addRecord(result("t1", "Edit applied"));
    eng.addRecord(use("t2", "Write"));
    eng.addRecord(result("t2", "File created successfully"));
    eng.addRecord(use("t3", "Edit"));
    eng.addRecord(
      result("t3", "The user doesn't want to proceed with this tool use.", true),
    );
    const r = eng.result();
    expect(r.accepted).toBe(2);
    expect(r.rejected).toBe(1);
    expect(r.acceptanceRate).toBeCloseTo(0.667, 3);
    expect(r.byTool.Edit).toEqual({ accepted: 1, rejected: 1 });
    expect(r.byTool.Write).toEqual({ accepted: 1, rejected: 0 });
  });

  it("counts a failed edit (not a user decline) as accepted", () => {
    const eng = new AcceptanceEngine();
    eng.addRecord(use("t1", "Edit"));
    eng.addRecord(result("t1", "Error: String to replace not found in file", true));
    const r = eng.result();
    expect(r.accepted).toBe(1);
    expect(r.rejected).toBe(0);
  });

  it("leaves an unresolved tool_use uncounted and rate null when empty", () => {
    const eng = new AcceptanceEngine();
    eng.addRecord(use("t1", "Edit")); // truncated — no result ever arrives
    eng.addRecord(use("t2", "Read")); // non-edit tool is ignored entirely
    const r = eng.result();
    expect(r.accepted).toBe(0);
    expect(r.rejected).toBe(0);
    expect(r.acceptanceRate).toBeNull();
  });
});

describe("ToolsEngine", () => {
  it("counts builtin tools and aggregates mcp without raw names", async () => {
    const { tools } = await runAll();
    const byName = Object.fromEntries(tools.builtin.map((t) => [t.name, t.count]));
    expect(byName).toEqual(corpus.tools.builtin);
    expect(tools.mcp).toEqual(corpus.tools.mcp);
  });

  it("redacts mcp server identity to counts", () => {
    const eng = new ToolsEngine();
    eng.addToolUse("mcp__a1b2c3d4-uuid__do_thing");
    eng.addToolUse("mcp__a1b2c3d4-uuid__other_thing");
    eng.addToolUse("mcp__second-server__do_thing");
    const r = eng.result();
    expect(r.mcp).toEqual({ totalCalls: 3, servers: 2 });
    expect(JSON.stringify(r.builtin)).not.toContain("mcp__");
  });
});

describe("TokensEngine", () => {
  it("sums usage deduped by requestId (streaming partials count once)", async () => {
    const { tokens } = await runAll();
    expect(tokens.input).toBe(corpus.tokens.input);
    expect(tokens.output).toBe(corpus.tokens.output);
    expect(tokens.cacheRead).toBe(corpus.tokens.cacheRead);
    expect(tokens.cacheCreation).toBe(corpus.tokens.cacheCreation);
    expect(tokens.pricingTableVersion).toBe("2026-06");
  });

  it("prices via longest-prefix model match, unknown models contribute zero", () => {
    expect(rateFor("claude-haiku-4-5-20251001")).toEqual({ input: 1, output: 5 });
    expect(rateFor("claude-fable-5")).toEqual({ input: 10, output: 50 });
    expect(rateFor("totally-unknown-model")).toBeNull();
  });

  it("computes apiEquivalentUsd from the fixture corpus", async () => {
    const { tokens } = await runAll();
    // fable-5 rates: (629*10 + 299*50 + 35*10*0.1 + 17*10*1.25)/1e6, rounded to cents
    const expected =
      Math.round(((629 * 10 + 299 * 50 + 35 * 1 + 17 * 12.5) / 1_000_000) * 100) / 100;
    expect(tokens.apiEquivalentUsd).toBe(expected);
  });

  it("splits usage by model, ranked by total tokens", () => {
    const eng = new TokensEngine();
    eng.addAssistant({
      type: "assistant",
      requestId: "r1",
      message: { model: "claude-fable-5", usage: { input_tokens: 100, output_tokens: 50 } },
    });
    eng.addAssistant({
      type: "assistant",
      requestId: "r2",
      message: { model: "claude-haiku-4-5-20251001", usage: { input_tokens: 10, output_tokens: 5 } },
    });
    eng.addAssistant({
      type: "assistant",
      requestId: "r3",
      message: { model: "claude-fable-5", usage: { input_tokens: 1, cache_read_input_tokens: 4 } },
    });
    const r = eng.result();
    expect(r.byModel.map((m) => m.model)).toEqual([
      "claude-fable-5",
      "claude-haiku-4-5-20251001",
    ]);
    expect(r.byModel[0]).toMatchObject({ input: 101, output: 50, cacheRead: 4 });
    expect(r.byModel[1]).toMatchObject({ input: 10, output: 5 });
  });

  it("keeps per-model sums reconciled with the totals", async () => {
    const { tokens } = await runAll();
    const sum = (k: "input" | "output" | "cacheRead" | "cacheCreation") =>
      tokens.byModel.reduce((n, m) => n + m[k], 0);
    expect(sum("input")).toBe(tokens.input);
    expect(sum("output")).toBe(tokens.output);
    expect(sum("cacheRead")).toBe(tokens.cacheRead);
    expect(sum("cacheCreation")).toBe(tokens.cacheCreation);
  });

  it("buckets missing model ids as (unknown) and sanitizes hostile ones", () => {
    const eng = new TokensEngine();
    eng.addAssistant({ type: "assistant", requestId: "r1", message: { usage: { input_tokens: 7 } } });
    eng.addAssistant({
      type: "assistant",
      requestId: "r2",
      message: { model: "C:/secret/path model", usage: { input_tokens: 3 } },
    });
    const models = eng.result().byModel.map((m) => m.model);
    expect(models).toContain("(unknown)");
    expect(models).toContain("<invalid-model>");
    expect(JSON.stringify(models)).not.toContain("secret");
  });

  it("treats missing usage fields as zero, never wrong numbers", () => {
    const eng = new TokensEngine();
    eng.addAssistant({
      type: "assistant",
      requestId: "r1",
      message: { model: "claude-fable-5", usage: { input_tokens: 5 } },
    });
    const r = eng.result();
    expect(r).toMatchObject({ input: 5, output: 0, cacheRead: 0, cacheCreation: 0 });
  });
});
