import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { editCommitMessage } from '../commands/editor';

describe('Commit message editor', () => {
  let directory: string;
  const originalTmpdir = process.env.TMPDIR;
  const originalEditor = process.env.GIT_EDITOR;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "gac editor's "));
    process.env.TMPDIR = directory;
    jest.spyOn(os, 'tmpdir').mockReturnValue(directory);
  });

  afterEach(() => {
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
    if (originalEditor === undefined) delete process.env.GIT_EDITOR;
    else process.env.GIT_EDITOR = originalEditor;
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('uses the Git editor command with arguments and safely handles spaces and quotes in the draft path', () => {
    const script = path.join(directory, 'editor.js');
    fs.writeFileSync(script, `require('fs').writeFileSync(process.argv[2], 'fix(api): edited message\\n');`);
    process.env.GIT_EDITOR = `"${process.execPath}" "${script}"`;
    const edited = editCommitMessage('feat: original');
    expect(edited.message).toBe('fix(api): edited message');
    expect(fs.existsSync(edited.draftPath)).toBe(true);
    expect(edited.draftPath.startsWith(directory)).toBe(true);
  });

  it.each(['failed', 'empty'])('preserves the draft and rejects an %s editor result', mode => {
    const script = path.join(directory, 'editor.js');
    fs.writeFileSync(script, `require('fs').writeFileSync(process.argv[2], ${JSON.stringify(mode === 'empty' ? '' : 'fix: recover this draft')}); process.exitCode = ${mode === 'failed' ? 1 : 0};`);
    process.env.GIT_EDITOR = `"${process.execPath}" "${script}"`;
    expect(() => editCommitMessage('feat: original')).toThrow(/Draft saved at/);
    const draftDirectory = fs.readdirSync(directory).find(name => name.startsWith('git-ai-commit-edit-'))!;
    expect(fs.existsSync(path.join(directory, draftDirectory, 'COMMIT_EDITMSG'))).toBe(true);
  });

  it('honors repository core.editor through Git without a GIT_EDITOR override', () => {
    const originalCwd = process.cwd();
    execFileSync('git', ['init', '--quiet', directory]);
    const script = path.join(directory, 'editor.js');
    fs.writeFileSync(script, `require('fs').writeFileSync(process.argv[2], 'fix: repository editor\\n');`);
    execFileSync('git', ['-C', directory, 'config', 'core.editor', `"${process.execPath}" "${script}"`]);
    delete process.env.GIT_EDITOR;
    process.chdir(directory);
    try {
      expect(editCommitMessage('feat: original').message).toBe('fix: repository editor');
    } finally { process.chdir(originalCwd); }
  });
});
