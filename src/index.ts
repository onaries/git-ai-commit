#!/usr/bin/env node

import { Command } from 'commander';
import { CommitCommand } from './commands/commit';
import { ConfigCommand } from './commands/configCommand';
import { TagCommand } from './commands/tag';

const program = new Command();

program
  .name('git-ai-commit')
  .description('AI-powered git commit message generator')
  .version('1.0.0');

const commitCommand = new CommitCommand();
const configCommand = new ConfigCommand();
const tagCommand = new TagCommand();

program.addCommand(commitCommand.getCommand());
program.addCommand(configCommand.getCommand());
program.addCommand(tagCommand.getCommand());

program.parse();
