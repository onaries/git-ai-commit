import { AIService } from '../commands/ai';
import { generateCommitPrompt } from '../prompts/commit';
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
              'Git diff will be provided separately in the user message.'
            )
          },
          {
            role: 'user',
            content: `Git diff:\n${diff}`
          }
        ],
        max_tokens: 120,
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
});
