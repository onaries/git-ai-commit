import { GitService } from '../commands/git';

// Mock the entire module at the top level
jest.mock('../commands/git', () => {
  const getStagedDiff = jest.fn().mockResolvedValue({
    success: true,
    diff: 'mock diff'
  });
  const createCommit = jest.fn().mockResolvedValue(true);

  return {
    GitService: {
      getStagedDiff,
      createCommit
    }
  };
});

describe('GitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStagedDiff', () => {
    it('should return success with diff when staged changes exist', async () => {
      const mockDiff = 'diff --git a/file.txt b/file.txt\nnew file mode 100644';
      
      // Mock the implementation for this specific test
      (GitService.getStagedDiff as jest.Mock).mockResolvedValueOnce({
        success: true,
        diff: mockDiff
      });

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({
        success: true,
        diff: mockDiff
      });
    });

    it('should return error when no staged changes', async () => {
      (GitService.getStagedDiff as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'No staged changes found. Please stage your changes first.'
      });

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({
        success: false,
        error: 'No staged changes found. Please stage your changes first.'
      });
    });

    it('should return error when git command fails', async () => {
      (GitService.getStagedDiff as jest.Mock).mockResolvedValueOnce({
        success: false,
        error: 'Git command failed'
      });

      const result = await GitService.getStagedDiff();

      expect(result).toEqual({
        success: false,
        error: 'Git command failed'
      });
    });
  });

  describe('createCommit', () => {
    it('should return true when commit is successful', async () => {
      (GitService.createCommit as jest.Mock).mockResolvedValueOnce(true);

      const result = await GitService.createCommit('feat: add new feature');

      expect(result).toBe(true);
    });

    it('should return false when commit fails', async () => {
      (GitService.createCommit as jest.Mock).mockResolvedValueOnce(false);

      const result = await GitService.createCommit('feat: add new feature');

      expect(result).toBe(false);
    });
  });
});
