import OpenAI from 'openai';
import { generateCommitPrompt } from '../prompts/commit';
import { generateTagPrompt } from '../prompts/tag';
import { SupportedLanguage } from './config';

export interface AIServiceConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  language?: SupportedLanguage;
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

export class AIService {
  private openai: OpenAI;
  private model: string;
  private language: SupportedLanguage;

  constructor(config: AIServiceConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL
    });
    this.model = config.model || 'zai-org/GLM-4.5-FP8';
    this.language = config.language || 'ko';
  }

  async generateCommitMessage(diff: string): Promise<CommitGenerationResult> {
    try {
      console.log('Sending request to AI API...');
      console.log('Model:', this.model);
      console.log('Base URL:', this.openai.baseURL);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: generateCommitPrompt(
              '',
              'Git diff will be provided separately in the user message.',
              this.language
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

      console.log('API Response received:', JSON.stringify(response, null, 2));

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
        console.log('No message found in response');
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

  async generateTagNotes(tagName: string, commitLog: string): Promise<TagGenerationResult> {
    try {
      console.log('Sending request to AI API for tag notes...');
      console.log('Model:', this.model);
      console.log('Base URL:', this.openai.baseURL);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: generateTagPrompt(tagName, '', this.language)
          },
          {
            role: 'user',
            content: `Commit log:\n${commitLog}`
          }
        ],
        max_tokens: 3000,
        temperature: 0.2
      });

      const choice = response.choices[0];
      const message = choice?.message?.content?.trim();

      const messageAny = choice?.message as any;
      const reasoningMessage = messageAny?.reasoning_content?.trim();

      const finalNotes = message || reasoningMessage;

      if (!finalNotes) {
        console.log('No notes found in response');
        return {
          success: false,
          error: 'No tag notes generated'
        };
      }

      return {
        success: true,
        notes: finalNotes.trim()
      };
    } catch (error) {
      console.error('API Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate tag notes'
      };
    }
  }
}
