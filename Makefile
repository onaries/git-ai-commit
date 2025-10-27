.PHONY: install build dev lint test typecheck clean uninstall link unlink version publish install-package

install: ## Install dependencies and build the project
	npm install
	npm run build

build: ## Compile TypeScript sources
	npm run build

dev: ## Run the CLI via ts-node in dev mode
	npm run dev -- commit

lint: ## Run ESLint
	npm run lint

test: ## Run Jest test suite
	npm run test

typecheck: ## Run TypeScript type checking
	npm run typecheck

clean: ## Remove build and coverage artifacts
	rm -rf dist coverage

uninstall: ## Remove installed dependencies and build outputs
	rm -rf node_modules package-lock.json dist coverage

link: ## Link the CLI globally
	npm link

unlink: ## Unlink the globally installed CLI
	npm unlink -g git-ai-commit

# Version bump target
# Usage: make version [LEVEL=patch]  (LEVEL can be patch, minor, major)
LEVEL ?= patch
version: ## Bump package.json version one step (default: patch)
	npm version $(LEVEL) --no-git-tag-version

publish: build ## Publish the package to npm (ensure you're logged in)
	npm publish

install-package: ## Install this package globally via npm
	npm i -g @ksw8954/git-ai-commit
