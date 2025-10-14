# Project Commands
- `npm run build` - Build TypeScript project
- `npm run dev` - Run in development mode
- `npm run test` - Run all tests
- `npm run test:file <path>` - Run single test file
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm link` - Install globally for CLI usage

# Environment Variables
- `OPENAI_API_KEY` or `AI_API_KEY` - API key for AI service
- `OPENAI_BASE_URL` or `AI_BASE_URL` - Custom API base URL (optional)
- `OPENAI_MODEL` or `AI_MODEL` - Model to use (optional, default: zai-org/GLM-4.5-FP8)

# Code Style Guidelines
- Use TypeScript with strict mode
- Follow ESLint configuration
- Use async/await for API calls
- Error handling with try/catch blocks
- Import style: use named imports for utilities, default for main exports
- Function naming: camelCase for functions, PascalCase for classes
- Use interfaces for type definitions
- CLI commands should be in src/commands/
- Prompts should be in src/prompts/
- Use proper TypeScript types for all function parameters and return values
- Class names should represent their purpose clearly
- Error messages should be descriptive and user-friendly
- Environment variable handling should be centralized in ConfigService