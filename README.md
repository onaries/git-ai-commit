# Git AI Commit

AI-powered CLI that generates conventional commit messages based on your staged Git diff.

## Installation

```bash
# clone and enter the repository
git clone https://github.com/onaries/git-ai-commit.git
cd git-ai-commit

# install dependencies and compile TypeScript
npm install
npm run build

# optional: link globally to use the CLI anywhere
npm link
```

If the package is published to npm, it can be installed directly in another project:

```bash
npm install git-ai-commit
```

## Usage

After linking globally (`npm link`) or installing via npm, run:

```bash
# generate a commit message from staged changes and confirm before committing
git-ai-commit commit

# print only the generated message without touching git
git-ai-commit commit --message-only

# override API settings for a single run
git-ai-commit commit --api-key <key> --base-url <url> --model <model>

# create and push the commit in one flow (will prompt for confirmation first)
git-ai-commit commit --push
```

The command previews the AI-generated message, then asks `Proceed with git commit? (y/n)` before creating the commit. Use `--push` to push after a successful commit, or set auto push through the config command (see below).

During development you can run the CLI without building by using the dev script:

```bash
npm run dev -- commit
```

## Configuration

Persist defaults without exporting environment variables through the interactive config command:

```bash
git-ai-commit config --show              # display merged configuration
git-ai-commit config --language en       # set default AI output language
git-ai-commit config --auto-push         # push automatically after confirmed commits
git-ai-commit config --no-auto-push      # disable automatic pushing
git-ai-commit config -k sk-...           # store API key securely on disk
git-ai-commit config -b https://api.test # set a custom API base URL
git-ai-commit config --model gpt-4o-mini # set preferred model
git-ai-commit config --mode openai       # prefer OPENAI_* environment variables
```

The stored configuration works alongside environment variables—CLI flags override config values, which in turn override `.env` settings.

Configuration is written to `~/.git-ai-commit/config.json` by default. Set `GIT_AI_COMMIT_CONFIG_PATH=/custom/path.json` to use a different location.

## Environment Variables

Set the following variables (e.g., in a local `.env` file) before using the CLI:

- `AI_MODE` controls which provider defaults to: `openai` prioritises `OPENAI_*` vars; any other value (or unset) uses the `AI_*` vars first before falling back to OpenAI then Chutes.
- Credentials: `AI_API_KEY`, `OPENAI_API_KEY`, or `CHUTES_API_TOKEN` (checked in that order when `AI_MODE` is not `openai`).
- Base URLs: `AI_BASE_URL` or `OPENAI_BASE_URL` (priority matches the selected mode).
- Models: `AI_MODEL` or `OPENAI_MODEL` (priority matches the selected mode).

## Development Commands

```bash
npm run lint         # run ESLint with the repository rules
npm run test         # execute the Jest suite
npm run test:watch   # watch mode for tests
npm run typecheck    # TypeScript type checking without emit
```
