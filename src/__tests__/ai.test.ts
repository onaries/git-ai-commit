/* eslint-disable @typescript-eslint/no-require-imports */
import { AIService } from '../commands/ai';
import { generateCommitPrompt } from '../prompts/commit';
import { generatePullRequestPrompt } from '../prompts/pr';
import { generateTagPrompt } from '../prompts/tag';
import OpenAI from 'openai';

jest.mock('openai');
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContentStream: jest.fn() }
  }))
}));
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

function createMockStream(content: string | null) {
  const chunks = content
    ? content.split('').map(ch => ({
        choices: [{ delta: { content: ch } }]
      }))
    : [];

  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}

function createGeminiMockStream(chunks: Array<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
}

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
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('feat: add new feature')
      );

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
        max_completion_tokens: 3000,
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should return error when API returns no message', async () => {
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream(null)
      );

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

    it('should retry with max_tokens when max_completion_tokens is unsupported', async () => {
      const error = Object.assign(
        new Error('Unsupported parameter: \'max_completion_tokens\' is not supported with this model. Use \'max_tokens\' instead.'),
        {
          error: {
            message:
              'Unsupported parameter: \'max_completion_tokens\' is not supported with this model. Use \'max_tokens\' instead.',
            type: 'invalid_request_error',
            param: 'max_completion_tokens',
            code: 'unsupported_parameter'
          },
          code: 'unsupported_parameter',
          param: 'max_completion_tokens',
          type: 'invalid_request_error'
        }
      );

      (mockOpenai.chat.completions.create as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(createMockStream('feat: add retry fallback'));

      const diff = 'diff --git a/file.txt b/file.txt\nnew file mode 100644';
      const result = await aiService.generateCommitMessage(diff);

      expect(result).toEqual({
        success: true,
        message: 'feat: add retry fallback'
      });

      expect(mockOpenai.chat.completions.create).toHaveBeenNthCalledWith(1, {
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
        max_completion_tokens: 3000,
        stream: true,
        stream_options: { include_usage: true }
      });

      expect(mockOpenai.chat.completions.create).toHaveBeenNthCalledWith(2, {
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
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should strip markdown formatting from commit header', async () => {
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('**chore(track_object): 불필요한 줄바꿈 제거하여 가독성 개선**')
      );

      const result = await aiService.generateCommitMessage('diff --git a/file b/file');

      expect(result).toEqual({
        success: true,
        message: 'chore(track_object): 불필요한 줄바꿈 제거하여 가독성 개선'
      });
    });

    it('should keep only the first commit header when multiple are returned', async () => {
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('feat: add payment API\nchore: update dependencies')
      );

      const result = await aiService.generateCommitMessage('diff --git a/file b/file');

      expect(result).toEqual({
        success: true,
        message: 'feat: add payment API'
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
      const prContent = 'Add caching layer\n\n## Summary\n- cache expensive queries to reduce latency\n\n## Testing\n- npm run test';

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream(prContent)
      );

      const diff = 'diff --git a/app.ts b/app.ts\nindex 123..456 100644';
      const result = await aiService.generatePullRequestMessage('main', 'feature/cache', diff);

      expect(result).toEqual({
        success: true,
        message: prContent
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
        max_completion_tokens: 4000,
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should return error when API returns no content', async () => {
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream(null)
      );

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

  describe('private helper methods', () => {
    it('isUnsupportedTokenParamError should return false for null/non-object', () => {
      expect((aiService as any).isUnsupportedTokenParamError(null, 'max_tokens')).toBe(false);
      expect((aiService as any).isUnsupportedTokenParamError('oops', 'max_tokens')).toBe(false);
    });

    it('isUnsupportedTokenParamError should match by code and param', () => {
      const error = { code: 'unsupported_parameter', param: 'max_completion_tokens' };
      expect((aiService as any).isUnsupportedTokenParamError(error, 'max_completion_tokens')).toBe(true);
    });

    it('isUnsupportedTokenParamError should match by message string', () => {
      const error = { message: 'Unsupported parameter: max_tokens is not supported' };
      expect((aiService as any).isUnsupportedTokenParamError(error, 'max_tokens')).toBe(true);
    });

    it('isUnsupportedValueError should return false for null', () => {
      expect((aiService as any).isUnsupportedValueError(null, 'temperature')).toBe(false);
    });

    it('isUnsupportedValueError should match by code and param', () => {
      const error = { code: 'unsupported_value', param: 'temperature' };
      expect((aiService as any).isUnsupportedValueError(error, 'temperature')).toBe(true);
    });

    it('isUnsupportedValueError should match by message string', () => {
      const error = { message: 'Unsupported value for temperature' };
      expect((aiService as any).isUnsupportedValueError(error, 'temperature')).toBe(true);
    });

    it('swapTokenParam should return rest when no token value exists', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'hello' }],
        temperature: 0.3
      };
      expect((aiService as any).swapTokenParam(request, 'max_tokens')).toEqual(request);
    });

    it('swapTokenParam should swap to max_completion_tokens', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'hello' }],
        max_tokens: 123
      };
      expect((aiService as any).swapTokenParam(request, 'max_completion_tokens')).toEqual({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
        max_completion_tokens: 123
      });
    });

    it('removeTemperature should remove temperature from request', () => {
      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'hello' }],
        temperature: 0.9,
        max_completion_tokens: 222
      };
      expect((aiService as any).removeTemperature(request)).toEqual({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
        max_completion_tokens: 222
      });
    });
  });

  describe('commit message cleanup edge cases', () => {
    it('should prefix chore for version/update messages', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('version update release process'));

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'chore: version update release process' });
    });

    it('should prefix feat for feature/add messages', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('add payment webhook support'));

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'feat: add payment webhook support' });
    });

    it('should prefix fix for fix/bug messages', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('bug in retry handler'));

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'fix: bug in retry handler' });
    });

    it('should normalize output when model returns type-only line before header', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('chore:\n\nfeat(scope): real header\n\nbody text')
      );

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'chore: chore:' });
    });

    it('should find the first header when non-header text comes first', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('This is not a header\nfix: handle edge case')
      );

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'fix: This is not a header' });
    });

    it('should collapse multiple blank lines between header and body', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('docs: update usage\n\n\n\nline 1\nline 2')
      );

      const result = await quietService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'docs: update usage\n\nline 1\nline 2' });
    });
  });

  describe('retry and reasoning paths', () => {
    it('should retry without temperature when unsupported value error occurs', async () => {
      const quietService = new AIService({
        apiKey: 'test-api-key',
        model: 'gpt-4',
        verbose: false
      });

      const error = {
        code: 'unsupported_value',
        param: 'temperature',
        message: 'Unsupported value: temperature'
      };

      (mockOpenai.chat.completions.create as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(createMockStream('feat: fallback without temperature'));

      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'test' }],
        max_completion_tokens: 100,
        temperature: 0.7
      };

      const result = await (quietService as any).createStreamingCompletion(request);
      expect(result).toBe('feat: fallback without temperature');

      expect(mockOpenai.chat.completions.create).toHaveBeenNthCalledWith(2, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 100,
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should retry with max_completion_tokens when max_tokens is unsupported', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });

      const error = {
        code: 'unsupported_parameter',
        param: 'max_tokens',
        message: 'Unsupported parameter: max_tokens'
      };

      (mockOpenai.chat.completions.create as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(createMockStream('feat: retried with max completion tokens'));

      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'test' }],
        max_tokens: 101
      };

      const result = await (quietService as any).createStreamingCompletion(request);
      expect(result).toBe('feat: retried with max completion tokens');

      expect(mockOpenai.chat.completions.create).toHaveBeenNthCalledWith(2, {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 101,
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should retry with fallback model on 429 rate limit', async () => {
      const quietService = new AIService({
        apiKey: 'test-api-key',
        model: 'gpt-4',
        fallbackModel: 'gpt-3.5',
        verbose: false
      });

      const error = { status: 429, message: 'Rate limit' };

      (mockOpenai.chat.completions.create as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(createMockStream('chore: fallback model used'));

      const request = {
        model: 'gpt-4',
        messages: [{ role: 'user' as const, content: 'test' }],
        max_completion_tokens: 100
      };

      const result = await (quietService as any).createStreamingCompletion(request);
      expect(result).toBe('chore: fallback model used');

      expect(mockOpenai.chat.completions.create).toHaveBeenNthCalledWith(2, {
        model: 'gpt-3.5',
        messages: [{ role: 'user', content: 'test' }],
        max_completion_tokens: 100,
        stream: true,
        stream_options: { include_usage: true }
      });
    });

    it('should handle reasoning chunks in stream and still return content', async () => {
      const stream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { reasoning_content: 'thinking...' } }] };
          yield { choices: [{ delta: { content: 'feat: ' } }] };
          yield { choices: [{ delta: { content: 'final message' } }] };
        }
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(stream);

      const result = await aiService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'feat: final message' });
    });

    it('should include reasoning token stats when usage has reasoning tokens', async () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      const stream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'feat: done' } }] };
          yield {
            choices: [{ delta: {} }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 30,
              completion_tokens_details: { reasoning_tokens: 12 }
            }
          };
        }
      };

      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(stream);

      const result = await aiService.generateCommitMessage('diff');
      expect(result).toEqual({ success: true, message: 'feat: done' });
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('thinking: 12'));

      writeSpy.mockRestore();
    });
  });

  describe('generateTagNotes', () => {
    it('should return success with notes', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(
        createMockStream('## Changes\n- Added feature')
      );

      const result = await quietService.generateTagNotes('v1.0.0', 'abc123 feat: add feature');
      expect(result).toEqual({ success: true, notes: '## Changes\n- Added feature' });
    });

    it('should return error when response is empty', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream(null));

      const result = await quietService.generateTagNotes('v1.0.0', 'abc123 feat: add feature');
      expect(result).toEqual({ success: false, error: 'No tag notes generated' });
    });

    it('should return error when API fails', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockRejectedValue(new Error('tag API failed'));

      const result = await quietService.generateTagNotes('v1.0.0', 'abc123 feat: add feature');
      expect(result).toEqual({ success: false, error: 'tag API failed' });
    });

    it('should include style reference in user content when previous message is not provided', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('notes'));

      await quietService.generateTagNotes('v1.2.0', 'log', undefined, null, 'Style sample text');

      expect(mockOpenai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: generateTagPrompt('v1.2.0', '', 'ko', false, true)
            },
            {
              role: 'user',
              content: expect.stringContaining('Style reference (follow this format):\nStyle sample text')
            }
          ]
        })
      );
    });

    it('should include previous message in user content', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('notes'));

      await quietService.generateTagNotes('v1.2.0', 'log', undefined, 'Previous release notes', 'Style sample text');

      expect(mockOpenai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: generateTagPrompt('v1.2.0', '', 'ko', true, true)
            },
            {
              role: 'user',
              content: expect.stringContaining('Previous release notes for this tag (improve upon this):\nPrevious release notes')
            }
          ]
        })
      );
    });

    it('should include extra instructions in the system prompt', async () => {
      const quietService = new AIService({ apiKey: 'test-api-key', model: 'gpt-4', verbose: false });
      (mockOpenai.chat.completions.create as jest.Mock).mockResolvedValue(createMockStream('notes'));

      await quietService.generateTagNotes('v2.0.0', 'log', 'Keep it short');

      expect(mockOpenai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: 'system',
              content: generateTagPrompt('v2.0.0', 'Keep it short', 'ko', false, false)
            },
            expect.any(Object)
          ]
        })
      );
    });
  });

  describe('Gemini mode', () => {
    it('constructor should initialize Gemini client when mode is gemini', () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      GoogleGenAI.mockClear();

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', model: 'gemini-3-flash-preview', verbose: false });

      expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'gem-key' });
      expect((geminiService as any).gemini).toBeTruthy();
      expect((geminiService as any).model).toBe('gemini-3-flash-preview');
    });

    it('should stream content successfully in gemini mode', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockResolvedValue(
        createGeminiMockStream([{ text: 'feat: ' }, { text: 'add gemini support' }])
      );
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', model: 'gem-model', verbose: false });
      const result = await geminiService.generateCommitMessage('diff --git a/a b/a');

      expect(result).toEqual({ success: true, message: 'feat: add gemini support' });
    });

    it('should handle empty gemini response', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockResolvedValue(createGeminiMockStream([]));
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', verbose: false });
      const result = await geminiService.generateCommitMessage('diff');

      expect(result).toEqual({ success: false, error: 'No commit message generated' });
    });

    it('should handle gemini stream error', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockRejectedValue(new Error('gemini failed'));
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', verbose: false });
      const result = await geminiService.generateCommitMessage('diff');

      expect(result).toEqual({ success: false, error: 'gemini failed' });
    });

    it('should pass system message and user messages to gemini stream request', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockResolvedValue(createGeminiMockStream([{ text: 'ok' }]));
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', model: 'gem-model', verbose: false });
      await geminiService.generateCommitMessage('my-diff');

      expect(generateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gem-model',
          contents: [{ role: 'user', parts: [{ text: 'Git diff:\nmy-diff' }] }],
          config: expect.objectContaining({
            systemInstruction: expect.stringContaining('Git diff will be provided separately in the user message.'),
            maxOutputTokens: 3000
          })
        })
      );
    });

    it('should consume usage metadata when available in gemini stream', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockResolvedValue(
        createGeminiMockStream([
          { text: 'feat: done', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 } }
        ])
      );
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', verbose: false });
      const result = await geminiService.generateCommitMessage('diff');

      expect(result).toEqual({ success: true, message: 'feat: done' });
      expect(generateContentStream).toHaveBeenCalledTimes(1);
    });

    it('createStreamingCompletion should dispatch to gemini implementation', async () => {
      const { GoogleGenAI } = require('@google/genai') as { GoogleGenAI: jest.Mock };
      const generateContentStream = jest.fn().mockResolvedValue(createGeminiMockStream([{ text: 'ok' }]));
      GoogleGenAI.mockImplementation(() => ({ models: { generateContentStream } }));

      const geminiService = new AIService({ apiKey: 'gem-key', mode: 'gemini', verbose: false });
      const geminiSpy = jest.spyOn(geminiService as any, 'createGeminiStreamingCompletion').mockResolvedValue('gemini-result');

      const result = await (geminiService as any).createStreamingCompletion({
        model: 'gemini-3-flash-preview',
        messages: [{ role: 'user', content: 'hello' }],
        max_completion_tokens: 123
      });

      expect(result).toBe('gemini-result');
      expect(geminiSpy).toHaveBeenCalled();
      geminiSpy.mockRestore();
    });
  });
});
