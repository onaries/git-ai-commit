import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUGGESTED_COMMAND_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Leading tokens we trust enough to surface as a runnable fix.
 * A remote pre-push hook often rejects a push and prints a hint command
 * (e.g. `make release-tag TAG=v1.2.3`). We only ever propose commands that
 * start with one of these well-known build/release tools, and we always ask
 * the user before running anything.
 */
const ALLOWED_COMMANDS = new Set([
  'make',
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'poetry',
  'uv',
  'hatch',
  'pip',
  'pip3',
  'python',
  'python3',
  'node',
  'cargo',
  'go',
  'just',
  'task',
  'rake',
  'bundle',
]);

export interface SuggestedCommandRunResult {
  success: boolean;
  output: string;
}

/** Keyword that, when followed by a colon, introduces an inline suggested command. */
const INLINE_MARKER = /\b(?:run|use|fix|execute|try)\b[^:`\n]*:\s*(.+)$/i;

/**
 * Normalize a raw command candidate and return it only if its leading token is
 * in the allowlist. Strips surrounding backticks, shell-prompt/bullet prefixes,
 * and trailing sentence punctuation. Returns null otherwise.
 */
function normalizeCandidate(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^[`$>\s]+/, '') // leading backtick / prompt / bullet whitespace
    .replace(/[`\s]+$/, '') // trailing backtick / whitespace
    .replace(/[.!)]+$/, '') // trailing sentence punctuation
    .trim();

  if (!cleaned) {
    return null;
  }

  const token = cleaned.split(/\s+/)[0];
  return ALLOWED_COMMANDS.has(token) ? cleaned : null;
}

/**
 * Scan command output (typically the stderr of a rejected `git push`) for a
 * suggested fix command. Returns the first match whose leading token is in the
 * allowlist, or null if none is found. Three patterns are recognized:
 *
 *   1. An indented command line:        `  make release-tag TAG=v1.0.0`
 *   2. An inline marker with a colon:   `Please run: make release`
 *   3. A backtick-wrapped command:      `` Fix with `make release` ``
 *
 * The allowlist gate keeps prose like "make sure the version is correct" from
 * being treated as a runnable command, and every result is still confirmed by
 * the user before execution.
 */
export function parseSuggestedCommand(output: string | undefined | null): string | null {
  if (!output) {
    return null;
  }

  const lines = output.split('\n');

  // Pattern 1 (highest priority): an indented standalone command line.
  for (const rawLine of lines) {
    if (/^\s+\S/.test(rawLine)) {
      const candidate = normalizeCandidate(rawLine);
      if (candidate) {
        return candidate;
      }
    }
  }

  // Pattern 2: an inline marker ("run/use/fix/execute/try ...: <cmd>").
  for (const rawLine of lines) {
    const marker = rawLine.match(INLINE_MARKER);
    if (marker) {
      const candidate = normalizeCandidate(marker[1]);
      if (candidate) {
        return candidate;
      }
    }
  }

  // Pattern 3 (lowest priority): a backtick-wrapped command.
  for (const rawLine of lines) {
    const backticks = rawLine.match(/`([^`]+)`/g);
    if (backticks) {
      for (const segment of backticks) {
        const candidate = normalizeCandidate(segment);
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  return null;
}

/**
 * Run a (previously confirmed) suggested command via the shell and capture its
 * combined output. The command must already have passed parseSuggestedCommand
 * and explicit user confirmation before reaching here.
 */
export async function runSuggestedCommand(command: string): Promise<SuggestedCommandRunResult> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: SUGGESTED_COMMAND_MAX_BUFFER,
    });
    const output = [stdout, stderr]
      .map(part => (part == null ? '' : String(part).trim()))
      .filter(part => part.length > 0)
      .join('\n');
    return { success: true, output };
  } catch (error) {
    const e = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const output =
      [e.stdout, e.stderr]
        .map(part => (part == null ? '' : String(part).trim()))
        .filter(part => part.length > 0)
        .join('\n') ||
      (typeof e.message === 'string' ? e.message : String(error));
    return { success: false, output };
  }
}
