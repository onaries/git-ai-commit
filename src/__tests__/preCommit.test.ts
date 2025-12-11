import { CommitCommand } from '../commands/commit';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('fs');
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('../commands/git', () => ({
  GitService: {
    getStagedDiff: jest.fn().mockResolvedValue({ success: true, diff: 'diff' }),
    createCommit: jest.fn().mockResolvedValue(true),
    push: jest.fn().mockResolvedValue(true)
  }
}));

jest.mock('../commands/ai', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generateCommitMessage: jest.fn().mockResolvedValue({ success: true, message: 'test commit' })
  }))
}));

jest.mock('../commands/config', () => ({
  ConfigService: {
    getConfig: jest.fn().mockReturnValue({ apiKey: 'key', language: 'en' }),
    validateConfig: jest.fn()
  }
}));

jest.mock('../commands/log', () => ({
  LogService: {
    append: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('Pre-commit Hook Tests', () => {
  let command: CommitCommand;
  let mockSpawn: jest.Mock;
  let mockFsExists: jest.Mock;
  let mockFsRead: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    command = new CommitCommand();
    
    mockSpawn = spawn as unknown as jest.Mock;
    mockFsExists = fs.existsSync as unknown as jest.Mock;
    mockFsRead = fs.readFileSync as unknown as jest.Mock;
    
    // Default: no hooks found
    mockFsExists.mockReturnValue(false);
    
    // Default spawn behavior: succeed immediately
    mockSpawn.mockImplementation((cmd, args) => {
      console.log(`Mock spawn called: ${cmd} ${args}`);
      const child = new EventEmitter();
      (child as any).stdout = new EventEmitter();
      (child as any).stderr = new EventEmitter();
      setTimeout(() => {
        child.emit('close', 0);
      }, 10);
      return child;
    });
  });

  it('should run npm pre-commit script if present', async () => {
    mockFsExists.mockImplementation((p: string) => p.endsWith('package.json'));
    mockFsRead.mockReturnValue(JSON.stringify({
      scripts: {
        'pre-commit': 'echo test'
      }
    }));

    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'pre-commit'], expect.anything());
  });

  it('should run pre-commit hooks if .pre-commit-config.yaml is present', async () => {
    mockFsExists.mockImplementation((p: string) => p.endsWith('.pre-commit-config.yaml'));

    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(mockSpawn).toHaveBeenCalledWith('pre-commit', ['run'], expect.anything());
  });

  it('should fail commit if npm pre-commit script fails', async () => {
    mockFsExists.mockImplementation((p: string) => p.endsWith('package.json'));
    mockFsRead.mockReturnValue(JSON.stringify({
      scripts: { 'pre-commit': 'fail' }
    }));

    mockSpawn.mockImplementation(() => {
      const child = new EventEmitter();
      setTimeout(() => child.emit('close', 1), 10);
      return child;
    });

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await (command as any).handleCommit({});

    expect(mockSpawn).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should fail commit if pre-commit hooks fail', async () => {
    mockFsExists.mockImplementation((p: string) => p.endsWith('.pre-commit-config.yaml'));

    mockSpawn.mockImplementation(() => {
      const child = new EventEmitter();
      setTimeout(() => child.emit('close', 1), 10);
      return child;
    });

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await (command as any).handleCommit({});

    expect(mockSpawn).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should run both hooks if both exist', async () => {
    mockFsExists.mockReturnValue(true); 
    mockFsRead.mockReturnValue(JSON.stringify({
      scripts: { 'pre-commit': 'test' }
    }));

    jest.spyOn(command as any, 'confirmCommit').mockResolvedValue(true);

    await (command as any).handleCommit({});

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['run', 'pre-commit'], expect.anything());
    expect(mockSpawn).toHaveBeenCalledWith('pre-commit', ['run'], expect.anything());
  });
});
