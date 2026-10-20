import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { ConfigService } from '../commands/config';

describe('Project commit rules', () => {
  const originalCwd = process.cwd();
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gac-project-'));
    execFileSync('git', ['init', '--quiet', directory]);
    fs.mkdirSync(path.join(directory, 'nested'));
    process.chdir(path.join(directory, 'nested'));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reads root rules when run in a subdirectory', () => {
    fs.writeFileSync(path.join(directory, '.git-ai-commit.md'), '\nWrite in English; use scope api\n');
    expect(ConfigService.getProjectInstructions()).toBe('Write in English; use scope api');
  });

  it('allows a repository without rules', () => {
    expect(ConfigService.getProjectInstructions()).toBe('');
  });

  it('reports unreadable rules instead of silently ignoring them', () => {
    fs.mkdirSync(path.join(directory, '.git-ai-commit.md'));
    expect(() => ConfigService.getProjectInstructions()).toThrow('Failed to read project commit rules');
  });
});
