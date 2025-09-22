import { loadEnv } from '../commands/loadEnv';

// Load environment variables from .env file before tests
loadEnv();

import { AIService } from '../commands/ai';
import { GitService } from '../commands/git';
import { ConfigService } from '../commands/config';

const hasApiKey = Boolean(
  process.env.CHUTES_API_TOKEN ||
  process.env.OPENAI_API_KEY ||
  process.env.AI_API_KEY
);

describe('Integration Tests with Real API', () => {
  let aiService: AIService;

  beforeEach(() => {
    if (!hasApiKey) {
      return;
    }

    const config = ConfigService.getEnvConfig();
    aiService = new AIService(config);
  });

  const describeIfApiKey = hasApiKey ? describe : describe.skip;

  describeIfApiKey('Real API Integration', () => {
    it('should generate commit message using real API', async () => {
      // Sample git diff for testing
      const sampleDiff = `diff --git a/package.json b/package.json
index 1a2b3c4..5d6e7f8 100644
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "test-project",
-  "version": "1.0.0",
+  "version": "1.1.0",
   "description": "Test project",
   "main": "index.js"
 }
diff --git a/src/index.ts b/src/index.ts
index abc123..def456 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,8 @@
 console.log('Hello World');
+
+// Add new feature
+console.log('New feature added');
`;

      console.log('Testing with real API...');
      console.log('Sample diff:', sampleDiff);

      const result = await aiService.generateCommitMessage(sampleDiff);

      console.log('API Response:', result);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message!.length).toBeGreaterThan(0);
      
      // Check if the message follows conventional commit format
      expect(result.message).toMatch(/^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?!?: .+/);
    }, 30000); // 30 second timeout for real API call

    it('should handle API errors gracefully', async () => {
      // Test with empty diff to potentially trigger API error
      const emptyDiff = '';

      const result = await aiService.generateCommitMessage(emptyDiff);

      console.log('Empty diff test result:', result);

      // The API might still return a message, but if it fails, it should handle gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error!.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Git Service Integration', () => {
    it('should get actual git diff if available', async () => {
      const result = await GitService.getStagedDiff();

      console.log('Git diff result:', result);

      // If there are staged changes, success should be true
      // If no staged changes, success should be false with appropriate error
      if (result.success) {
        expect(result.diff).toBeDefined();
        expect(result.diff!.length).toBeGreaterThan(0);
      } else {
        expect(result.error).toBeDefined();
        expect(result.error).toContain('No staged changes');
      }
    });
  });

  describe('Configuration Integration', () => {
    const itIfApiKey = hasApiKey ? it : it.skip;

    itIfApiKey('should load configuration from environment', () => {
      const config = ConfigService.getEnvConfig();

      console.log('Loaded config:', {
        apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...${config.apiKey.slice(-4)}` : 'undefined',
        baseURL: config.baseURL || 'undefined',
        model: config.model || 'undefined'
      });

      expect(config.apiKey).toBeDefined();
      expect(config.apiKey.length).toBeGreaterThan(0);
      
      // Should have model from .env or default
      expect(config.model).toBeDefined();
    });

    itIfApiKey('should validate configuration successfully', () => {
      const config = ConfigService.getEnvConfig();
      
      expect(() => ConfigService.validateConfig(config)).not.toThrow();
    });
  });
});
