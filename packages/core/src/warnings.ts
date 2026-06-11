export type WarningKind =
  | "unknownRecordType"
  | "suspectedWriteTool"
  | "unparseableLine"
  | "unknownExtension"
  | "skippedMalformedRecord";

export interface ParserWarning {
  kind: WarningKind;
  /** Discriminating detail: record type, tool name, file basename, or extension. */
  type?: string;
  tool?: string;
  file?: string;
  ext?: string;
  count: number;
}

/** Aggregates parser anomalies. Never throws — tallying is the whole error policy. */
export class WarningCollector {
  private counts = new Map<string, ParserWarning>();

  tally(kind: WarningKind, detail: Partial<Omit<ParserWarning, "kind" | "count">> = {}): void {
    const key = `${kind}|${detail.type ?? ""}|${detail.tool ?? ""}|${detail.file ?? ""}|${detail.ext ?? ""}`;
    const existing = this.counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      this.counts.set(key, { kind, ...detail, count: 1 });
    }
  }

  get(kind: WarningKind): ParserWarning[] {
    return this.toJSON().filter((w) => w.kind === kind);
  }

  toJSON(): ParserWarning[] {
    return [...this.counts.values()];
  }
}
