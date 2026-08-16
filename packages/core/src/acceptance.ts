import type { RawRecord } from "./types.js";

/** The edit-family tools whose proposals a user can accept or reject. */
export const EDIT_TOOLS = ["Edit", "MultiEdit", "Write", "NotebookEdit"] as const;
export type EditTool = (typeof EDIT_TOOLS)[number];

export interface EditActionCounts {
  accepted: number;
  rejected: number;
}

export interface EditAcceptanceMetrics {
  byTool: Record<EditTool, EditActionCounts>;
  accepted: number;
  rejected: number;
  /** accepted / (accepted + rejected); null when no edit action was resolved. */
  acceptanceRate: number | null;
}

const EDIT_TOOL_SET = new Set<string>(EDIT_TOOLS);

/**
 * Sentinels Claude Code writes into a tool_result when the human DECLINES a
 * proposed edit (or interrupts it mid-flight). A genuine tool failure — e.g.
 * "String to replace not found" — is NOT a rejection: the user accepted the
 * action, the tool merely failed, so it counts as accepted. Matching the
 * human-decline language (not `is_error` alone) keeps that distinction honest.
 */
const REJECTION_PATTERNS = [
  /user doesn't want to proceed/i,
  /user doesn't want to take this action/i,
  /tool use was rejected/i,
  /user rejected/i,
  /request interrupted by user/i,
];

function messageBlocks(record: RawRecord): Record<string, unknown>[] {
  const message = record.message;
  if (typeof message !== "object" || message === null) return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b): b is Record<string, unknown> => typeof b === "object" && b !== null,
  );
}

/** Flatten a tool_result's content (string, or an array of text blocks) to text. */
function resultText(block: Record<string, unknown>): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const b of content) {
    if (typeof b === "string") parts.push(b);
    else if (typeof b === "object" && b !== null && typeof (b as Record<string, unknown>).text === "string") {
      parts.push((b as Record<string, unknown>).text as string);
    }
  }
  return parts.join("\n");
}

function isRejection(text: string): boolean {
  return REJECTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Pairs each edit-family tool_use with its tool_result to measure how often the
 * user accepts a proposed edit — mirroring the tool acceptance metrics in
 * Anthropic's Claude Code Analytics API, but computed locally with zero network.
 *
 * Records are fed in transcript order: a tool_use registers its id as pending;
 * the later tool_result resolves it. A tool_use that never gets a result (a
 * truncated session) stays pending and is counted as neither — an unresolved
 * proposal must not inflate the acceptance rate in either direction.
 */
export class AcceptanceEngine {
  private pending = new Map<string, EditTool>();
  private counts: Record<EditTool, EditActionCounts> = {
    Edit: { accepted: 0, rejected: 0 },
    MultiEdit: { accepted: 0, rejected: 0 },
    Write: { accepted: 0, rejected: 0 },
    NotebookEdit: { accepted: 0, rejected: 0 },
  };

  addRecord(record: RawRecord): void {
    if (record.type === "assistant") this.registerUses(record);
    else if (record.type === "user") this.resolveResults(record);
  }

  private registerUses(record: RawRecord): void {
    for (const block of messageBlocks(record)) {
      if (
        block.type === "tool_use" &&
        typeof block.id === "string" &&
        typeof block.name === "string" &&
        EDIT_TOOL_SET.has(block.name)
      ) {
        this.pending.set(block.id, block.name as EditTool);
      }
    }
  }

  private resolveResults(record: RawRecord): void {
    for (const block of messageBlocks(record)) {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
      const tool = this.pending.get(block.tool_use_id);
      if (tool === undefined) continue;
      this.pending.delete(block.tool_use_id);
      if (isRejection(resultText(block))) this.counts[tool].rejected += 1;
      else this.counts[tool].accepted += 1;
    }
  }

  result(): EditAcceptanceMetrics {
    let accepted = 0;
    let rejected = 0;
    for (const tool of EDIT_TOOLS) {
      accepted += this.counts[tool].accepted;
      rejected += this.counts[tool].rejected;
    }
    const resolved = accepted + rejected;
    return {
      byTool: {
        Edit: { ...this.counts.Edit },
        MultiEdit: { ...this.counts.MultiEdit },
        Write: { ...this.counts.Write },
        NotebookEdit: { ...this.counts.NotebookEdit },
      },
      accepted,
      rejected,
      acceptanceRate: resolved === 0 ? null : Math.round((accepted / resolved) * 1000) / 1000,
    };
  }
}
