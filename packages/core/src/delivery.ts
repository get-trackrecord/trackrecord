import type { RawRecord } from "./types.js";

export interface DeliveryMetrics {
  pullRequests: number;
  repositories: number;
  branches: number;
  claudeBranches: number;
  commits: number;
}

/** Command separators that end one shell segment and begin the next. */
const SEGMENT_SEP = /&&|\|\||;|\||\n/;

/**
 * Git global options that consume the FOLLOWING token as their argument (so the
 * next token is not the subcommand). `--opt=value` forms are self-contained and
 * not listed here.
 */
const GIT_ARG_OPTS = new Set(["-C", "-c", "--namespace", "--git-dir", "--work-tree", "--exec-path"]);

/**
 * True when a single shell segment invokes `git commit`. Walks past git's global
 * options (and their arguments) to find the real subcommand, so `git -C repo
 * commit` counts while `git log`, `git commit-graph write`, or a `commit` word
 * inside an `echo`/message body does not. `--dry-run` and `--help` are excluded:
 * they propose nothing and write no commit.
 *
 * Conservative-by-design like the rest of the parser: an amend or a failed
 * commit still counts once (the log records the attempt, not the exit code).
 */
function isGitCommit(segment: string): boolean {
  const tokens = segment.trim().split(/\s+/).filter(Boolean);
  if (tokens[0] !== "git") return false;
  let i = 1;
  while (i < tokens.length) {
    const tok = tokens[i] as string;
    if (!tok.startsWith("-")) break; // first non-option token is the subcommand
    if (GIT_ARG_OPTS.has(tok)) i += 1; // skip the option's separate argument
    i += 1;
  }
  if (tokens[i] !== "commit") return false;
  return !tokens.slice(i + 1).some((t) => t === "--dry-run" || t === "--help");
}

/** pr-link dedupe by prUrl; branches from main session files only; commits from git. */
export class DeliveryEngine {
  private prUrls = new Set<string>();
  private repos = new Set<string>();
  private branches = new Set<string>();
  private commits = 0;

  addRecord(record: RawRecord, isAgentFile: boolean): void {
    if (record.type === "pr-link") {
      if (typeof record.prUrl === "string" && record.prUrl.length > 0) {
        this.prUrls.add(record.prUrl);
      }
      if (typeof record.prRepository === "string" && record.prRepository.length > 0) {
        this.repos.add(record.prRepository);
      }
      return;
    }
    if (!isAgentFile && typeof record.gitBranch === "string" && record.gitBranch.length > 0) {
      this.branches.add(record.gitBranch);
    }
  }

  /**
   * Count git commits made through Claude Code, detected from Bash commands.
   * Fed from the same tool-use pass assemble already walks. `--dry-run` and
   * `--help` invocations are excluded — they propose nothing and write no commit.
   */
  addToolUse(name: string, input: unknown): void {
    if (name !== "Bash" || typeof input !== "object" || input === null) return;
    const command = (input as Record<string, unknown>).command;
    if (typeof command !== "string" || command.length === 0) return;
    for (const segment of command.split(SEGMENT_SEP)) {
      if (isGitCommit(segment)) this.commits += 1;
    }
  }

  result(): DeliveryMetrics {
    return {
      pullRequests: this.prUrls.size,
      repositories: this.repos.size,
      branches: this.branches.size,
      claudeBranches: [...this.branches].filter((b) => /^claude\//.test(b)).length,
      commits: this.commits,
    };
  }
}
