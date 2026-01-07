import { Command } from 'commander';
import readline from 'readline';
import { LogService } from './log';

export interface HistoryOptions {
  limit?: string;
  json?: boolean;
  clear?: boolean;
}

export class HistoryCommand {
  private program: Command;

  constructor() {
    this.program = new Command('history')
      .description('Manage git-ai-commit command history')
      .option('-l, --limit <n>', 'Limit number of entries to show (most recent first)')
      .option('--json', 'Output in JSON format')
      .option('--clear', 'Clear all stored history (requires confirmation)')
      .action(this.handleHistory.bind(this));
  }

  private async confirmClear(): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer: string = await new Promise(resolve => {
      rl.question('This will remove all stored history. Continue? (y/n): ', resolve);
    });
    rl.close();
    const normalized = answer.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  }

  private parseLimit(value?: string): number | undefined {
    if (!value) return undefined;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  }

  private formatLine(e: any): string {
    const ts = new Date(e.timestamp).toISOString();
    const projectName = e.project?.name || 'unknown';
    const model = e.model || 'default';
    const duration = e.durationMs ? ` (${e.durationMs}ms)` : '';
    const details = e.details ? `\n    > ${e.details}` : '';
    
    return `${ts}  [${projectName}]  ${e.command}  ${e.status}${duration}  model=${model}${details}`;
  }

  private async handleHistory(options: HistoryOptions) {
    if (options.clear) {
      const confirmed = await this.confirmClear();
      if (!confirmed) {
        console.log('History clear cancelled.');
        return;
      }
      await LogService.clear();
      console.log('History cleared.');
      return;
    }

    const limit = this.parseLimit(options.limit);
    const entries = await LogService.read(limit);

    if (options.json) {
      const output = limit ? entries.slice(-limit) : entries;
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    if (entries.length === 0) {
      console.log('No history entries.');
      return;
    }

    for (const e of entries) {
      console.log(this.formatLine(e));
    }
  }

  getCommand(): Command {
    return this.program;
  }
}