import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

export function editCommitMessage(message: string): { message: string; draftPath: string } {
  const editor = execFileSync('git', ['var', 'GIT_EDITOR'], {
    encoding: 'utf-8', env: process.env
  }).trim();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'git-ai-commit-edit-'));
  const filename = path.join(directory, 'COMMIT_EDITMSG');
  fs.writeFileSync(filename, `${message}\n`, { mode: 0o600 });
  // A shell alias uses Git's quoting rules and preserves the editor's exit status.
  const result = spawnSync('git', ['-c', `alias.gac-edit=!${editor}`, 'gac-edit', filename], {
    stdio: 'inherit',
    env: process.env
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Editor failed. Draft saved at ${filename}`);
  }
  const edited = fs.readFileSync(filename, 'utf-8').trim();
  if (!edited) throw new Error(`Edited message is empty. Draft saved at ${filename}`);
  return { message: edited, draftPath: filename };
}
