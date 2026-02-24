import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const HOOK_NAME = 'prepare-commit-msg';
const HOOK_SIGNATURE = '# installed by git-ai-commit';

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_SIGNATURE}

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip if message was provided via -m, merge, squash, or amend
if [ -n "$COMMIT_SOURCE" ]; then
  exit 0
fi

# Skip if no staged changes
if ! git diff --cached --quiet --exit-code 2>/dev/null; then
  # Generate AI commit message
  AI_MSG=$(git-ai-commit commit --message-only 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$AI_MSG" ]; then
    # Prepend AI message, keep original commented lines below
    ORIGINAL=$(cat "$COMMIT_MSG_FILE")
    printf '%s\n\n%s' "$AI_MSG" "$ORIGINAL" > "$COMMIT_MSG_FILE"
  fi
fi
`;

export class HookCommand {
  private program: Command;

  constructor() {
    this.program = new Command('hook')
      .description('Manage git-ai-commit prepare-commit-msg hook');

    this.program
      .command('install')
      .description('Install prepare-commit-msg hook in the current repository')
      .action(this.handleInstall.bind(this));

    this.program
      .command('uninstall')
      .description('Remove prepare-commit-msg hook from the current repository')
      .action(this.handleUninstall.bind(this));

    this.program
      .command('status')
      .description('Show hook installation status')
      .action(this.handleStatus.bind(this));
  }

  private getGitRoot(): string | null {
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
      }).trim();
    } catch {
      return null;
    }
  }

  private getHooksDir(): string | null {
    try {
      const hooksPath = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
        encoding: 'utf-8',
      }).trim();
      // git rev-parse --git-path returns relative path; resolve it
      const gitRoot = this.getGitRoot();
      if (!gitRoot) return null;
      return path.resolve(gitRoot, hooksPath);
    } catch {
      return null;
    }
  }

  private getHookPath(): string | null {
    const hooksDir = this.getHooksDir();
    if (!hooksDir) return null;
    return path.join(hooksDir, HOOK_NAME);
  }

  private isOurHook(hookPath: string): boolean {
    try {
      const content = fs.readFileSync(hookPath, 'utf-8');
      return content.includes(HOOK_SIGNATURE);
    } catch {
      return false;
    }
  }

  private handleInstall(): void {
    const gitRoot = this.getGitRoot();
    if (!gitRoot) {
      console.error('Error: Not a git repository.');
      process.exit(1);
    }

    const hookPath = this.getHookPath();
    if (!hookPath) {
      console.error('Error: Could not determine git hooks directory.');
      process.exit(1);
    }

    // Check if hook already exists
    if (fs.existsSync(hookPath)) {
      if (this.isOurHook(hookPath)) {
        console.log('Hook is already installed. Use "git-ai-commit hook uninstall" to remove it.');
        return;
      }
      console.error(`Error: ${HOOK_NAME} hook already exists and was not installed by git-ai-commit.`);
      console.error(`Path: ${hookPath}`);
      console.error('Remove or rename the existing hook first, then try again.');
      process.exit(1);
    }

    // Create hooks directory if it doesn't exist
    const hooksDir = path.dirname(hookPath);
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    fs.writeFileSync(hookPath, HOOK_SCRIPT, { mode: 0o755 });
    console.log(`Installed ${HOOK_NAME} hook.`);
    console.log(`Path: ${hookPath}`);
    console.log('');
    console.log('Now "git commit" will auto-generate an AI commit message.');
    console.log('The message will be pre-filled in your editor for review.');
    console.log('Use "git commit -m ..." to skip AI generation.');
  }

  private handleUninstall(): void {
    const gitRoot = this.getGitRoot();
    if (!gitRoot) {
      console.error('Error: Not a git repository.');
      process.exit(1);
    }

    const hookPath = this.getHookPath();
    if (!hookPath) {
      console.error('Error: Could not determine git hooks directory.');
      process.exit(1);
    }

    if (!fs.existsSync(hookPath)) {
      console.log('No hook installed.');
      return;
    }

    if (!this.isOurHook(hookPath)) {
      console.error(`Error: ${HOOK_NAME} hook exists but was not installed by git-ai-commit.`);
      console.error('Will not remove hooks installed by other tools.');
      process.exit(1);
    }

    fs.unlinkSync(hookPath);
    console.log(`Removed ${HOOK_NAME} hook.`);
  }

  private handleStatus(): void {
    const gitRoot = this.getGitRoot();
    if (!gitRoot) {
      console.error('Error: Not a git repository.');
      process.exit(1);
    }

    const hookPath = this.getHookPath();
    if (!hookPath) {
      console.error('Error: Could not determine git hooks directory.');
      process.exit(1);
    }

    if (!fs.existsSync(hookPath)) {
      console.log('Not installed.');
      console.log('Run "git-ai-commit hook install" to set up the prepare-commit-msg hook.');
      return;
    }

    if (this.isOurHook(hookPath)) {
      console.log('Installed.');
      console.log(`Path: ${hookPath}`);
    } else {
      console.log(`A ${HOOK_NAME} hook exists but was not installed by git-ai-commit.`);
      console.log(`Path: ${hookPath}`);
    }
  }

  getCommand(): Command {
    return this.program;
  }
}
