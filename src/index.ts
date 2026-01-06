#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { CommitCommand } from './commands/commit';
import { ConfigCommand } from './commands/configCommand';
import { PullRequestCommand } from './commands/prCommand';
import { TagCommand } from './commands/tag';
import { HistoryCommand } from './commands/history';
import { CompletionCommand } from './commands/completion';

function getPackageVersion(): string {
  try {
    // When compiled, __dirname will be dist/; package.json is one level up
    const pkgPath = path.resolve(__dirname, '../package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const program = new Command();

program
  .name('git-ai-commit')
  .description('AI-powered git commit message generator')
  // Expose -v, --version instead of default -V
  .version(getPackageVersion(), '-v, --version', 'output the version number');

const commitCommand = new CommitCommand();
const configCommand = new ConfigCommand();
const pullRequestCommand = new PullRequestCommand();
const tagCommand = new TagCommand();
const historyCommand = new HistoryCommand();
const completionCommand = new CompletionCommand();

program.addCommand(commitCommand.getCommand());
program.addCommand(configCommand.getCommand());
program.addCommand(pullRequestCommand.getCommand());
program.addCommand(tagCommand.getCommand());
program.addCommand(historyCommand.getCommand());
program.addCommand(completionCommand.getCommand());

program.parse();
