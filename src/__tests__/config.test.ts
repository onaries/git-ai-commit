import { ConfigService } from '../commands/config';

describe('ConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvConfig', () => {
    it('should return config with CHUTES_API_TOKEN', () => {
      process.env.CHUTES_API_TOKEN = 'chutes-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'chutes-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      });
    });

    it('should return config with OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'test-api-key';
      process.env.OPENAI_BASE_URL = 'https://api.test.com';
      process.env.OPENAI_MODEL = 'gpt-4';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'test-api-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      });
    });

    it('should return config with AI_API_KEY fallback', () => {
      process.env.AI_API_KEY = 'fallback-api-key';
      process.env.AI_BASE_URL = 'https://fallback.test.com';
      process.env.AI_MODEL = 'claude-3';

      const config = ConfigService.getEnvConfig();

      expect(config).toEqual({
        apiKey: 'fallback-api-key',
        baseURL: 'https://fallback.test.com',
        model: 'claude-3'
      });
    });

    it('should use CHUTES_API_TOKEN over other variables when all exist', () => {
      process.env.CHUTES_API_TOKEN = 'chutes-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.AI_API_KEY = 'ai-key';

      const config = ConfigService.getEnvConfig();

      expect(config.apiKey).toBe('chutes-key');
    });

    it('should use OPENAI variables over AI variables when both exist', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.AI_API_KEY = 'ai-key';
      process.env.OPENAI_BASE_URL = 'openai-url';
      process.env.AI_BASE_URL = 'ai-url';

      const config = ConfigService.getEnvConfig();

      expect(config.apiKey).toBe('openai-key');
      expect(config.baseURL).toBe('openai-url');
    });

    it('should use default model when not specified', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.OPENAI_MODEL;
      delete process.env.AI_MODEL;

      const config = ConfigService.getEnvConfig();

      expect(config.model).toBe('zai-org/GLM-4.5-FP8');
    });

    it('should throw error when no API key is provided', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.AI_API_KEY;

      expect(() => ConfigService.getEnvConfig()).toThrow('API key is required');
    });
  });

  describe('validateConfig', () => {
    it('should not throw for valid config', () => {
      const config = {
        apiKey: 'test-key',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      };

      expect(() => ConfigService.validateConfig(config)).not.toThrow();
    });

    it('should throw error when API key is missing', () => {
      const config = {
        apiKey: '',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      };

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });

    it('should throw error when API key is undefined', () => {
      const config = {
        apiKey: '',
        baseURL: 'https://api.test.com',
        model: 'gpt-4'
      } as any;

      expect(() => ConfigService.validateConfig(config)).toThrow('API key is required');
    });
  });
});
