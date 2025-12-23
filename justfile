# Install dependencies and build the project
LEVEL := "patch"

install:
  npm install
  npm run build

# Compile TypeScript sources
build:
  npm run build

# Run the CLI via ts-node in dev mode
dev:
  npm run dev -- commit

# Run ESLint
lint:
  npm run lint

# Run Jest test suite
test:
  npm run test

# Run TypeScript type checking
typecheck:
  npm run typecheck

# Remove build and coverage artifacts
clean:
  rm -rf dist coverage

# Remove installed dependencies and build outputs
uninstall:
  rm -rf node_modules package-lock.json dist coverage

# Link the CLI globally
link:
  npm link

# Unlink the globally installed CLI
unlink:
  npm unlink -g git-ai-commit

# Bump package.json version one step (default: patch)
version:
  npm version {{LEVEL}} --no-git-tag-version

# Publish the package to npm (ensure you're logged in)
publish: build
  npm publish

# Install this package globally via npm
install-package:
  npm i -g @ksw8954/git-ai-commit
