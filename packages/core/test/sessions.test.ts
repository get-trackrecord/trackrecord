import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { discoverFiles, readRecords } from "../src/reader.js";
import { classifyRecord } from "../src/classify.js";
import { SessionEngine, isHumanPrompt } from "../src/sessions.js";
import { WarningCollector } from "../src/warnings.js";
import { corpus, NOW_FOR_TESTS } from "../../../fixtures/manifest.js";

const FIXTURES = resolve(__dirname, "../../../fixtures/projects");

async function runEngine() {
  const warnings = new WarningCollector();
  const engine = new SessionEngine();
  for (const file of await discoverFiles(FIXTURES)) {
    engine.startFile(file);
    for await (const raw of readRecords(file.path, warnings)) {
      const record = classifyRecord(raw, warnings);
      if (record) engine.addRecord(record);
    }
  }
  engine.finishFile();
  return engine;
}

describe("isHumanPrompt", () => {
  const base = { type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } };
  it("accepts plain human text, rejects tool results / meta / compact / sidechain", () => {
    expect(isHumanPrompt(base)).toBe(true);
    expect(isHumanPrompt({ ...base, toolUseResult: { ok: true } })).toBe(false);
    expect(isHumanPrompt({ ...base, isMeta: true })).toBe(false);
    expect(isHumanPrompt({ ...base, isCompactSummary: true })).toBe(false);
    expect(isHumanPrompt({ ...base, isSidechain: true })).toBe(false);
    expect(isHumanPrompt({ type: "assistant" })).toBe(false);
  });
});

describe("SessionEngine over the fixture corpus", () => {
  it("matches the manifest activity expectations", async () => {
    const engine = await runEngine();
    const activity = engine.result(new Date(NOW_FOR_TESTS));
    expect(activity).toEqual({
      sessions: corpus.activity.sessions,
      subagentRuns: corpus.activity.subagentRuns,
      projects: corpus.activity.projects,
      activeDays: corpus.activity.activeDays,
      longestStreak: corpus.activity.longestStreak,
      currentStreak: corpus.activity.currentStreak,
      humanPrompts: corpus.activity.humanPrompts,
      assistantTurns: corpus.activity.assistantTurns,
      firstSession: corpus.activity.firstSession,
      byEntrypoint: corpus.activity.byEntrypoint,
      compactions: corpus.activity.compactions,
    });
  });

  it("keys sessions by filename: reused sessionIds produce no duplicates", async () => {
    const engine = await runEngine();
    const byProject = engine.projectSessions();
    expect(byProject.get("demo-app")).toBe(6);
    expect(byProject.get("other-proj")).toBe(1);
  });

  it("excludes a <5-record main file with no human prompt from the session count", () => {
    const engine = new SessionEngine();
    engine.startFile({ path: "stub.jsonl", basename: "stub.jsonl", isAgent: false });
    // 3 records, no human prompt (the user record is isMeta), no assistant turn.
    engine.addRecord({ type: "ai-title", sessionId: "s", aiTitle: "x" });
    engine.addRecord({
      type: "user",
      isMeta: true,
      message: { role: "user", content: [{ type: "text", text: "meta, not a prompt" }] },
    });
    engine.addRecord({ type: "last-prompt", sessionId: "s", lastPrompt: "x" });
    engine.finishFile();
    expect(engine.result(new Date(NOW_FOR_TESTS)).sessions).toBe(0);
  });

  it("counts a small (4-record) file that DOES satisfy the rule — exclusion is by rule, not size", () => {
    const engine = new SessionEngine();
    engine.startFile({ path: "real.jsonl", basename: "real.jsonl", isAgent: false });
    engine.addRecord({
      type: "user",
      timestamp: "2026-06-08T10:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "do a thing" }] },
    });
    engine.addRecord({ type: "assistant", requestId: "r1", message: { role: "assistant", content: [] } });
    engine.addRecord({
      type: "user",
      toolUseResult: { ok: true },
      message: { role: "user", content: [{ type: "tool_result", content: "done" }] },
    });
    engine.addRecord({ type: "assistant", requestId: "r2", message: { role: "assistant", content: [] } });
    engine.finishFile();
    expect(engine.result(new Date(NOW_FOR_TESTS)).sessions).toBe(1);
  });

  it("currentStreak drops to 0 when now is far past the last active day", async () => {
    const engine = await runEngine();
    const activity = engine.result(new Date("2026-07-01T00:00:00.000Z"));
    expect(activity.currentStreak).toBe(0);
    expect(activity.longestStreak).toBe(corpus.activity.longestStreak);
  });
});
