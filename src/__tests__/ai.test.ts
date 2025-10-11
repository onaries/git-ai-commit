import { AIService } from '../commands/ai';
import { generateCommitPrompt } from '../prompts/commit';
import { generatePullRequestPrompt } from '../prompts/pr';
import OpenAI from 'openai';

jest.mock('openai');
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('AIService', () => {
  let aiService: AIService;
  let mockOpenai: jest.Mocked<OpenAI>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOpenai = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    } as any;

    MockedOpenAI.mockImplementation(() => mockOpenai);

    aiService = new AIService({
      apiKey: 'test-api-key',
      baseURL: 'https://api.test.com',
      model: 'gpt-4'
    });
  });

  describe('generateCommitMessage', () => {
    it('should return success with commit message when API call succeeds', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'feat: add new feature'
          }
        }]
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const diff = 'diff --git a/file.txt b/file.txt\nnew file mode 100644';
      const result = await aiService.generateCommitMessage(diff);

      expect(result).toEqual({
        success: true,
        message: 'feat: add new feature'
      });

      expect(mockOpenai.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: generateCommitPrompt(
              '',
              'Git diff will be provided separately in the user message.',
              'ko'
            )
          },
          {
            role: 'user',
            content: `Git diff:\n${diff}`
          }
        ],
        max_tokens: 3000,
        temperature: 0.1
      });
    });

    it('should return error when API returns no message', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: null
          }
        }]
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const diff = 'diff --git a/file.txt b/file.txt\nnew file mode 100644';
      const result = await aiService.generateCommitMessage(diff);

      expect(result).toEqual({
        success: false,
        error: 'No commit message generated'
      });
    });

    it('should return error when API call fails', async () => {
      const error = new Error('API call failed');
      (mockOpenai.chat.completions.create as jest.Mock).mockRejectedValue(error);

      const diff = 'diff --git a/file.txt b/file.txt\nnew file mode 100644';
      const result = await aiService.generateCommitMessage(diff);

      expect(result).toEqual({
        success: false,
        error: 'API call failed'
      });
    });

    it('should use default model when not specified', () => {
      const aiServiceWithDefaults = new AIService({
        apiKey: 'test-api-key'
      });

      expect((aiServiceWithDefaults as any).model).toBe('zai-org/GLM-4.5-FP8');
    });
  });

  describe('generatePullRequestMessage', () => {
    it('should return success with PR message when API call succeeds', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Add caching layer\n\n## Summary\n- cache expensive queries to reduce latency\n\n## Testing\n- npm run test'
          }
        }]
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const diff = 'diff --git a/app.ts b/app.ts\nindex 123..456 100644';
      const result = await aiService.generatePullRequestMessage('main', 'feature/cache', diff);

      expect(result).toEqual({
        success: true,
        message: mockResponse.choices[0].message.content
      });

      expect(mockOpenai.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: generatePullRequestPrompt('main', 'feature/cache', '', 'ko')
          },
          {
            role: 'user',
            content: `Git diff between main and feature/cache:\n${diff}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.2
      });
    });

    it('should return error when API returns no content', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '',
            reasoning_content: ''
          }
        }]
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const result = await aiService.generatePullRequestMessage('main', 'feature/cache', 'diff');

      expect(result).toEqual({
        success: false,
        error: 'No pull request message generated'
      });
    });

    it('should return error when API call fails', async () => {
      const error = new Error('API failure');
      (mockOpenai.chat.completions.create as jest.Mock).mockRejectedValue(error);

      const result = await aiService.generatePullRequestMessage('main', 'feature/cache', 'diff');

      expect(result).toEqual({
        success: false,
        error: 'API failure'
      });
    });
  });
});
