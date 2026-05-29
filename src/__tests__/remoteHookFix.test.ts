import { parseSuggestedCommand, runSuggestedCommand } from '../commands/remoteHookFix';

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import { exec } from 'child_process';

const mockExec = exec as unknown as jest.Mock;

describe('parseSuggestedCommand', () => {
  it('extracts an indented make command from rejected push output', () => {
    const output = [
      'Tag/version mismatch for v0.1.4-a1 on commit 925c9d8.',
      'Expected pyproject.toml and __version__ to be: 0.1.4-a1',
      'Found pyproject.toml=0.1.3-a1, __version__=0.1.3-a1',
      '',
      'Create release tags with:',
      '  make release-tag TAG=v0.1.4-a1',
      "error: failed to push some refs to 'github.com:safemotion/safemotion-docsearch.git'",
    ].join('\n');

    expect(parseSuggestedCommand(output)).toBe('make release-tag TAG=v0.1.4-a1');
  });

  it('returns null for empty or missing output', () => {
    expect(parseSuggestedCommand('')).toBeNull();
    expect(parseSuggestedCommand(undefined)).toBeNull();
    expect(parseSuggestedCommand(null)).toBeNull();
  });

  it('ignores commands that are not in the allowlist', () => {
    const output = ['Run this to fix:', '  rm -rf /', '  sudo reboot'].join('\n');
    expect(parseSuggestedCommand(output)).toBeNull();
  });

  it('ignores allowlisted tokens that appear inline (non-indented prose)', () => {
    const output = 'make sure the version in pyproject.toml is correct before pushing';
    expect(parseSuggestedCommand(output)).toBeNull();
  });

  it('strips a leading shell prompt before the command', () => {
    const output = ['Try:', '  $ npm run release'].join('\n');
    expect(parseSuggestedCommand(output)).toBe('npm run release');
  });

  it('returns the first allowlisted command when several are present', () => {
    const output = ['Options:', '  make release-tag TAG=v1.0.0', '  poetry version patch'].join('\n');
    expect(parseSuggestedCommand(output)).toBe('make release-tag TAG=v1.0.0');
  });

  it('extracts an inline command after a marker keyword and colon', () => {
    expect(parseSuggestedCommand('Please run: make release')).toBe('make release');
    expect(parseSuggestedCommand('To fix, execute: npm run release')).toBe('npm run release');
    expect(parseSuggestedCommand('Use this: poetry version patch')).toBe('poetry version patch');
  });

  it('strips trailing sentence punctuation from an inline command', () => {
    expect(parseSuggestedCommand('Please run: make release-tag TAG=v1.0.0.')).toBe(
      'make release-tag TAG=v1.0.0'
    );
  });

  it('does not treat a marker without an allowlisted command as a match', () => {
    expect(parseSuggestedCommand('Use the latest version: see the docs')).toBeNull();
  });

  it('extracts a backtick-wrapped command from surrounding prose', () => {
    expect(parseSuggestedCommand('Fix with `make release` and try again')).toBe('make release');
  });

  it('skips backtick spans that are not allowlisted commands', () => {
    expect(parseSuggestedCommand('Check the `pyproject.toml` version field')).toBeNull();
  });

  it('prefers the indented command line over later patterns', () => {
    const output = ['Run `npm run other` or:', '  make release-tag TAG=v2.0.0'].join('\n');
    expect(parseSuggestedCommand(output)).toBe('make release-tag TAG=v2.0.0');
  });
});

describe('runSuggestedCommand', () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it('resolves success with combined output', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
      cb(null, { stdout: 'done\n', stderr: '' });
    });

    await expect(runSuggestedCommand('make release-tag TAG=v1.0.0')).resolves.toEqual({
      success: true,
      output: 'done',
    });
  });

  it('resolves failure and captures error output', async () => {
    mockExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => {
      const err: any = new Error('command failed');
      err.stdout = '';
      err.stderr = 'make: *** No rule to make target';
      cb(err, { stdout: '', stderr: '' });
    });

    await expect(runSuggestedCommand('make broken')).resolves.toEqual({
      success: false,
      output: 'make: *** No rule to make target',
    });
  });
});
