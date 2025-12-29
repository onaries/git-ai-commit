import OpenAI from 'openai';
import { generateCommitPrompt } from '../prompts/commit';
import { generateTagPrompt } from '../prompts/tag';
import { generatePullRequestPrompt } from '../prompts/pr';
import { SupportedLanguage } from './config';

export interface AIServiceConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  language?: SupportedLanguage;
  verbose?: boolean;
}

export interface CommitGenerationResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface TagGenerationResult {
  success: boolean;
  notes?: string;
  error?: string;
}

export interface PullRequestGenerationResult {
  success: boolean;
  message?: string;
  error?: string;
}

export class AIService {
  private openai: OpenAI;
  private model: string;
  private language: SupportedLanguage;
  private verbose: boolean;

  constructor(config: AIServiceConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    this.model = config.model || 'zai-org/GLM-4.5-FP8';
    this.language = config.language || 'ko';
    this.verbose = config.verbose ?? true;
  }

  private debugLog(...args: unknown[]): void {
    if (this.verbose) {
      console.log(...args);
    }
  }

  private isUnsupportedTokenParamError(
    error: unknown,
    param: 'max_tokens' | 'max_completion_tokens'
  ): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorObj = error as {
      error?: { message?: string; param?: string; code?: string };
      message?: string;
      param?: string;
      code?: string;
    };

    const message = errorObj.error?.message ?? errorObj.message;
    const code = errorObj.error?.code ?? errorObj.code;
    const errorParam = errorObj.error?.param ?? errorObj.param;

    if (code === 'unsupported_parameter' && errorParam === param) {
      return true;
    }

    if (typeof message === 'string') {
      return message.includes('Unsupported parameter') && message.includes(param);
    }

    return false;
  }

  private isUnsupportedValueError(error: unknown, param: string): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const errorObj = error as {
      error?: { message?: string; param?: string; code?: string };
      message?: string;
      param?: string;
      code?: string;
    };

    const message = errorObj.error?.message ?? errorObj.message;
    const code = errorObj.error?.code ?? errorObj.code;
    const errorParam = errorObj.error?.param ?? errorObj.param;

    if (code === 'unsupported_value' && errorParam === param) {
      return true;
    }

    if (typeof message === 'string') {
      return message.includes('Unsupported value') && message.includes(param);
    }

    return false;
  }

  private swapTokenParam(
    request: OpenAI.ChatCompletionCreateParamsNonStreaming,
    targetParam: 'max_tokens' | 'max_completion_tokens'
  ): OpenAI.ChatCompletionCreateParamsNonStreaming {
    const { max_tokens, max_completion_tokens, ...rest } = request;
    const tokenValue = max_completion_tokens ?? max_tokens;

    if (tokenValue === undefined || tokenValue === null) {
      return { ...rest };
    }

    if (targetParam === 'max_tokens') {
      return { ...rest, max_tokens: tokenValue };
    }

    return { ...rest, max_completion_tokens: tokenValue };
  }

  private removeTemperature(
    request: OpenAI.ChatCompletionCreateParamsNonStreaming
  ): OpenAI.ChatCompletionCreateParamsNonStreaming {
    const { temperature, ...rest } = request;
    return { ...rest };
  }

  private async createChatCompletion(
    request: OpenAI.ChatCompletionCreateParamsNonStreaming,
    attempt = 0
  ): Promise<OpenAI.ChatCompletion> {
    try {
      return await this.openai.chat.completions.create(request);
    } catch (error) {
      if (attempt < 3 && this.isUnsupportedValueError(error, 'temperature')) {
        const fallbackRequest = this.removeTemperature(request);
        this.debugLog('Retrying without temperature due to unsupported value error.');
        return await this.createChatCompletion(fallbackRequest, attempt + 1);
      }

      if (this.isUnsupportedTokenParamError(error, 'max_completion_tokens')) {
        const fallbackRequest = this.swapTokenParam(request, 'max_tokens');
        this.debugLog('Retrying with max_tokens due to unsupported max_completion_tokens error.');
        return await this.createChatCompletion(fallbackRequest, attempt + 1);
      }

      if (this.isUnsupportedTokenParamError(error, 'max_tokens')) {
        const fallbackRequest = this.swapTokenParam(request, 'max_completion_tokens');
        this.debugLog('Retrying with max_completion_tokens due to unsupported max_tokens error.');
        return await this.createChatCompletion(fallbackRequest, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Remove think/thinking tags and other XML-style tags from AI response
   */
  private cleanMessage(message: string): string {
    if (!message) return message;

    let cleaned = message;

    // Remove <think>...</think> (including namespaced <antml:think>) and <thinking>...</thinking>
    const thinkBlock = /<\s*(?:antml:)?think\b[^>]*>[\s\S]*?<\s*\/\s*(?:antml:)?think\s*>/gi;
    const thinkingBlock = /<\s*thinking\b[^>]*>[\s\S]*?<\s*\/\s*thinking\s*>/gi;
    cleaned = cleaned.replace(thinkBlock, '').replace(thinkingBlock, '');

    // Also remove stray opening/closing think tags if any slipped through
    cleaned = cleaned.replace(/<\/?\s*(?:antml:)?think\b[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/?\s*thinking\b[^>]*>/gi, '');

    // Remove any remaining XML/HTML-like tags
    cleaned = cleaned.replace(/<[^>]+>/g, '');

    // Strip common Markdown emphasis so headers remain plain text
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1');
    cleaned = cleaned.replace(/__(.*?)__/g, '$1');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // Normalize whitespace
    cleaned = cleaned.replace(/[\t\r]+/g, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  async generateCommitMessage(diff: string, extraInstructions?: string): Promise<CommitGenerationResult> {
    try {
      this.debugLog('Sending request to AI API...');
      this.debugLog('Model:', this.model);
      this.debugLog('Base URL:', this.openai.baseURL);
      
      const customInstructions = extraInstructions && extraInstructions.trim().length > 0
        ? `Git diff will be provided separately in the user message.\n\n## Additional User Instructions\n${extraInstructions.trim()}`
        : 'Git diff will be provided separately in the user message.';
      
      const response = await this.createChatCompletion({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: generateCommitPrompt(
              '',
              customInstructions,
              this.language
            )
          },
          {
            role: 'user',
            content: `Git diff:\n${diff}`
          }
        ],
        max_completion_tokens: 3000
      });

      this.debugLog('API Response received:', JSON.stringify(response, null, 2));

      const choice = response.choices[0];
      const message = choice?.message?.content?.trim();
      
      // Handle reasoning content if available (type assertion for custom API response)
      const messageAny = choice?.message as any;
      const reasoningMessage = messageAny?.reasoning_content?.trim();
      
      // Try to extract commit message from reasoning content if regular content is null
      let finalMessage = message;
      if (!finalMessage && reasoningMessage) {
        // Look for commit message pattern in reasoning content
        const commitMatch = reasoningMessage.match(/(?:feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert): .+/);
        if (commitMatch) {
          finalMessage = commitMatch[0].trim();
        } else {
          // Look for any line that starts with conventional commit types
          const typeMatch = reasoningMessage.match(/(?:feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)[^:]*: .+/);
          if (typeMatch) {
            finalMessage = typeMatch[0].trim();
          } else {
            // Try to find a short descriptive line
            const lines = reasoningMessage.split('\n').filter((line: string) => line.trim().length > 0);
            const shortLine = lines.find((line: string) => line.length < 100 && line.includes('version'));
            finalMessage = shortLine ? `chore: ${shortLine.trim()}` : `chore: update files`;
          }
        }
      }
      
      if (!finalMessage) {
        this.debugLog('No message found in response');
        return {
          success: false,
          error: 'No commit message generated'
        };
      }

      // Clean up the message
      finalMessage = finalMessage.replace(/^(The commit message is:|Commit message:|Message:)\s*/, '');
      
      // Ensure it follows conventional commit format
      if (!finalMessage.match(/^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?: .+/)) {
        // If it doesn't match the format, try to fix it
        if (finalMessage.includes('version') || finalMessage.includes('update')) {
          finalMessage = `chore: ${finalMessage}`;
        } else if (finalMessage.includes('feature') || finalMessage.includes('add')) {
          finalMessage = `feat: ${finalMessage}`;
        } else if (finalMessage.includes('fix') || finalMessage.includes('bug')) {
          finalMessage = `fix: ${finalMessage}`;
        } else {
          finalMessage = `chore: ${finalMessage}`;
        }
      }

      // Clean and normalize formatting/artifacts that sometimes appear
      finalMessage = this.cleanMessage(finalMessage);

      // If the model produced a stray type-only line (e.g., "chore:" on its own), drop it
      let lines = finalMessage.split('\n').map(l => l.replace(/[\s\t]+$/,'')).filter(l => l !== undefined) as string[];
      const headerPattern = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s+.+/;
      const typeOnlyPattern = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s*$/;

      // Remove Markdown code fences and trim surrounding whitespace
      lines = lines.filter(l => !/^```/.test(l));

      // Trim leading blank lines
      while (lines.length && lines[0].trim() === '') lines.shift();

      // Remove any leading type-only lines until we hit a real header or content
      while (lines.length && typeOnlyPattern.test(lines[0])) {
        lines.shift();
        while (lines.length && lines[0].trim() === '') lines.shift();
      }

      // If the first non-empty line is not a header, but a header exists later, start from that header
      const firstHeaderIdx = lines.findIndex(l => headerPattern.test(l));
      if (firstHeaderIdx > 0) {
        lines = lines.slice(firstHeaderIdx);
      }

      // If the first line has a duplicated type prefix like "chore: docs(scope): ...", trim the outer prefix
      if (lines.length > 0) {
        const dupTypePrefix = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert):\s+(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?:\s+(.+)/;
        const m = lines[0].match(dupTypePrefix);
        if (m) {
          // Keep the inner proper header
          const innerType = m[2];
          // Rebuild as `${innerType}${scope}: ${desc}`
          lines[0] = `${innerType}${m[3] ?? ''}: ${m[4]}`;
        }
      }

      // Ensure only a single blank line between header and body if body exists
      if (lines.length > 1 && lines[0].trim().length > 0) {
        // Collapse multiple blank lines immediately after header to one
        let i = 1;
        let blankCount = 0;
        while (i < lines.length && lines[i].trim() === '') {
          blankCount++;
          i++;
        }
        if (blankCount > 1) {
          // Keep exactly one blank line
          lines.splice(1, blankCount - 1);
        }
      }

      // Drop additional commit headers to enforce a single conventional commit
      if (lines.length > 0) {
        const nextHeaderIdx = lines.slice(1).findIndex(l => headerPattern.test(l));
        if (nextHeaderIdx >= 0) {
          lines = lines.slice(0, nextHeaderIdx + 1);
        }
      }

      finalMessage = lines.join('\n').trim();

      return {
        success: true,
        message: finalMessage
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate commit message'
      };
    }
  }

  async generateTagNotes(tagName: string, commitLog: string, extraInstructions?: string): Promise<TagGenerationResult> {
    try {
      this.debugLog('Sending request to AI API for tag notes...');
      this.debugLog('Model:', this.model);
      this.debugLog('Base URL:', this.openai.baseURL);

      const customInstructions = extraInstructions && extraInstructions.trim().length > 0
        ? `${extraInstructions.trim()}`
        : '';

      const response = await this.createChatCompletion({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: generateTagPrompt(tagName, customInstructions, this.language)
          },
          {
            role: 'user',
            content: `Commit log:\n${commitLog}`
          }
        ],
        max_completion_tokens: 3000
      });

      const choice = response.choices[0];
      const message = choice?.message?.content?.trim();

      const messageAny = choice?.message as any;
      const reasoningMessage = messageAny?.reasoning_content?.trim();

      const finalNotes = message || reasoningMessage;

      if (!finalNotes) {
        this.debugLog('No notes found in response');
        return {
          success: false,
          error: 'No tag notes generated'
        };
      }

      return {
        success: true,
        notes: this.cleanMessage(finalNotes.trim())
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate tag notes'
      };
    }
  }

  async generatePullRequestMessage(
    baseBranch: string,
    compareBranch: string,
    diff: string
  ): Promise<PullRequestGenerationResult> {
    try {
      this.debugLog('Sending request to AI API for pull request message...');
      this.debugLog('Model:', this.model);
      this.debugLog('Base URL:', this.openai.baseURL);

      const response = await this.createChatCompletion({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: generatePullRequestPrompt(
              baseBranch,
              compareBranch,
              '',
              this.language
            )
          },
          {
            role: 'user',
            content: `Git diff between ${baseBranch} and ${compareBranch}:\n${diff}`
          }
        ],
        max_completion_tokens: 4000
      });

      const choice = response.choices[0];
      const message = choice?.message?.content?.trim();

      const messageAny = choice?.message as any;
      const reasoningMessage = messageAny?.reasoning_content?.trim();

      const finalMessage = message || reasoningMessage;

      if (!finalMessage) {
        return {
          success: false,
          error: 'No pull request message generated'
        };
      }

      return {
        success: true,
        message: this.cleanMessage(finalMessage.trim())
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate pull request message'
      };
    }
  }
}
