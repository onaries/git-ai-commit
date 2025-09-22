.PHONY: install build dev lint test typecheck clean uninstall link unlink

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
