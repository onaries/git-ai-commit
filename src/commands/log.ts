import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export type LogStatus = 'success' | 'failure' | 'cancelled';

export interface HistoryEntry {
  id: string;
  timestamp: string; // ISO
  command: string;
  args: Record<string, unknown>;
  status: LogStatus;
  details?: string;
  durationMs?: number;
}

function getStorageDir(): string {
  const override = process.env.GIT_AI_COMMIT_CONFIG_PATH;
  return override ? path.dirname(path.resolve(override)) : path.join(os.homedir(), '.git-ai-commit');
}

function getHistoryPath(): string {
  return path.join(getStorageDir(), 'history.jsonl');
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class LogService {
  static async append(entry: Omit<HistoryEntry, 'id' | 'timestamp'> & { timestamp?: string; id?: string }): Promise<void> {
    const file = getHistoryPath();
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });

    const finalized: HistoryEntry = {
      id: entry.id || genId(),
      timestamp: entry.timestamp || new Date().toISOString(),
      command: entry.command,
      args: entry.args,
      status: entry.status,
      details: entry.details,
      durationMs: entry.durationMs
    };

    const line = JSON.stringify(finalized) + '\n';
    await fs.appendFile(file, line, 'utf-8');
  }

  static async read(limit?: number): Promise<HistoryEntry[]> {
    const file = getHistoryPath();
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const lines = raw.split('\n').filter(Boolean);
      const parsed = lines.map(l => {
        try { return JSON.parse(l) as HistoryEntry; } catch { return undefined; }
      }).filter((e): e is HistoryEntry => Boolean(e));
      const result = limit && limit > 0 ? parsed.slice(-limit) : parsed;
      return result;
    } catch (e) {
      return [];
    }
  }

  static async clear(): Promise<void> {
    const file = getHistoryPath();
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, '', 'utf-8');
  }
}