.PHONY: install build dev lint test typecheck clean uninstall link unlink version publish install-package install-completion uninstall-completion

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

install-completion: ## Install shell completion for current shell (bash/zsh)
	@CURRENT_SHELL=$$(basename "$$SHELL"); \
	if [ "$$CURRENT_SHELL" = "zsh" ]; then \
		COMP_DIR="$$HOME/.zsh/completions"; \
		COMP_FILE="$$COMP_DIR/_git-ai-commit"; \
		RCFILE="$$HOME/.zshrc"; \
		mkdir -p "$$COMP_DIR"; \
		git-ai-commit completion zsh > "$$COMP_FILE"; \
		echo "Completion file created: $$COMP_FILE"; \
		if ! grep -q 'fpath=.*\.zsh/completions' "$$RCFILE" 2>/dev/null; then \
			if grep -q 'autoload.*compinit' "$$RCFILE" 2>/dev/null; then \
				sed -i.bak '/autoload.*compinit/i\
fpath=(~/.zsh/completions $$fpath)  # git-ai-commit completion\
' "$$RCFILE" && rm -f "$$RCFILE.bak"; \
				echo "Added fpath before compinit in $$RCFILE"; \
			else \
				echo "" >> "$$RCFILE"; \
				echo "# git-ai-commit shell completion" >> "$$RCFILE"; \
				echo 'fpath=(~/.zsh/completions $$fpath)' >> "$$RCFILE"; \
				echo 'autoload -Uz compinit && compinit' >> "$$RCFILE"; \
				echo "Added fpath and compinit to $$RCFILE"; \
			fi; \
		fi; \
		echo "Restart your shell or run: exec zsh"; \
	elif [ "$$CURRENT_SHELL" = "bash" ]; then \
		if [ -f "$$HOME/.bash_profile" ]; then \
			RCFILE="$$HOME/.bash_profile"; \
		else \
			RCFILE="$$HOME/.bashrc"; \
		fi; \
		COMPLETION_LINE='eval "$$(git-ai-commit completion bash)"'; \
		if grep -q "git-ai-commit completion" "$$RCFILE" 2>/dev/null; then \
			echo "Completion already installed in $$RCFILE"; \
		else \
			echo "" >> "$$RCFILE"; \
			echo "# git-ai-commit shell completion" >> "$$RCFILE"; \
			echo "$$COMPLETION_LINE" >> "$$RCFILE"; \
			echo "Completion installed in $$RCFILE"; \
			echo "Run 'source $$RCFILE' or restart your shell to enable"; \
		fi; \
	else \
		echo "Unsupported shell: $$CURRENT_SHELL (only bash and zsh are supported)"; \
		exit 1; \
	fi

uninstall-completion: ## Remove shell completion from current shell config
	@CURRENT_SHELL=$$(basename "$$SHELL"); \
	if [ "$$CURRENT_SHELL" = "zsh" ]; then \
		COMP_FILE="$$HOME/.zsh/completions/_git-ai-commit"; \
		RCFILE="$$HOME/.zshrc"; \
		if [ -f "$$COMP_FILE" ]; then \
			rm -f "$$COMP_FILE"; \
			echo "Removed $$COMP_FILE"; \
		fi; \
		if grep -q "git-ai-commit completion" "$$RCFILE" 2>/dev/null; then \
			sed -i.bak '/git-ai-commit completion/d' "$$RCFILE"; \
			rm -f "$$RCFILE.bak"; \
			echo "Removed fpath from $$RCFILE"; \
		fi; \
	elif [ "$$CURRENT_SHELL" = "bash" ]; then \
		if [ -f "$$HOME/.bash_profile" ]; then \
			RCFILE="$$HOME/.bash_profile"; \
		else \
			RCFILE="$$HOME/.bashrc"; \
		fi; \
		if grep -q "git-ai-commit completion" "$$RCFILE" 2>/dev/null; then \
			sed -i.bak '/# git-ai-commit shell completion/d' "$$RCFILE"; \
			sed -i.bak '/git-ai-commit completion/d' "$$RCFILE"; \
			rm -f "$$RCFILE.bak"; \
			echo "Completion removed from $$RCFILE"; \
		else \
			echo "No completion found in $$RCFILE"; \
		fi; \
	else \
		echo "Unsupported shell: $$CURRENT_SHELL"; \
		exit 1; \
	fi
