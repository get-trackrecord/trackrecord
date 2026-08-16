import pricingTable from "../pricing/2026-06.json" with { type: "json" };
import { safeModelName } from "./sanitize.js";
import type { RawRecord } from "./types.js";

/** Per-model usage, mirroring the Claude Code Analytics API's model_breakdown. */
export interface ModelTokenUsage {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  apiEquivalentUsd: number;
}

export interface TokenMetrics {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  apiEquivalentUsd: number;
  pricingTableVersion: string;
  /**
   * Usage split by model, ranked by total tokens. Every counted token lands in
   * exactly one entry (records with no model id bucket as "(unknown)"), so the
   * per-model sums always reconcile with the totals above.
   */
  byModel: ModelTokenUsage[];
}

interface ModelRate {
  input: number;
  output: number;
}

const RATES: Record<string, ModelRate> = pricingTable.models;

/** Longest-prefix match so dated ids (claude-haiku-4-5-20251001) still price. */
export function rateFor(model: string): ModelRate | null {
  let best: ModelRate | null = null;
  let bestLen = 0;
  for (const [prefix, rate] of Object.entries(RATES)) {
    if (model.startsWith(prefix) && prefix.length > bestLen) {
      best = rate;
      bestLen = prefix.length;
    }
  }
  return best;
}

function num(v: unknown): number {
  // negatives are as corrupt as strings: a bad record must never SUBTRACT from totals
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Sums usage on assistant records deduped by requestId (streaming partials
 * must not double-count). All usage fields are optional - older records
 * degrade to zero, never to wrong numbers.
 */
export class TokensEngine {
  private seen = new Set<string>();
  private totals = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  private usd = 0;
  private byModel = new Map<string, Omit<ModelTokenUsage, "model">>();

  addAssistant(record: RawRecord): void {
    if (record.type !== "assistant") return;
    const requestId = record.requestId;
    const key = typeof requestId === "string" && requestId.length > 0
      ? requestId
      : `uuid:${String(record.uuid ?? "")}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);

    const message = record.message;
    if (typeof message !== "object" || message === null) return;
    const msg = message as Record<string, unknown>;
    const usage = msg.usage;
    if (typeof usage !== "object" || usage === null) return;
    const u = usage as Record<string, unknown>;

    const input = num(u.input_tokens);
    const output = num(u.output_tokens);
    const cacheRead = num(u.cache_read_input_tokens);
    const cacheCreation = num(u.cache_creation_input_tokens);
    this.totals.input += input;
    this.totals.output += output;
    this.totals.cacheRead += cacheRead;
    this.totals.cacheCreation += cacheCreation;

    const model = typeof msg.model === "string" && msg.model.length > 0 ? msg.model : "";
    const rate = rateFor(model);
    let usd = 0;
    if (rate) {
      usd =
        (input * rate.input +
          output * rate.output +
          cacheRead * rate.input * pricingTable.cacheReadMultiplier +
          cacheCreation * rate.input * pricingTable.cacheWriteMultiplier) /
        1_000_000;
      this.usd += usd;
    }

    // sanitized: a corrupt model value would otherwise surface verbatim in --json
    const label = safeModelName(model === "" ? "(unknown)" : model);
    const entry =
      this.byModel.get(label) ??
      { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, apiEquivalentUsd: 0 };
    entry.input += input;
    entry.output += output;
    entry.cacheRead += cacheRead;
    entry.cacheCreation += cacheCreation;
    entry.apiEquivalentUsd += usd;
    this.byModel.set(label, entry);
  }

  result(): TokenMetrics {
    return {
      ...this.totals,
      apiEquivalentUsd: Math.round(this.usd * 100) / 100,
      pricingTableVersion: pricingTable.version,
      byModel: [...this.byModel.entries()]
        .map(([model, e]) => ({
          model,
          input: e.input,
          output: e.output,
          cacheRead: e.cacheRead,
          cacheCreation: e.cacheCreation,
          apiEquivalentUsd: Math.round(e.apiEquivalentUsd * 100) / 100,
        }))
        .sort(
          (a, b) =>
            b.input + b.output + b.cacheRead + b.cacheCreation -
              (a.input + a.output + a.cacheRead + a.cacheCreation) ||
            (a.model < b.model ? -1 : 1),
        ),
    };
  }
}
