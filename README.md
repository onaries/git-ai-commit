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
# local install
npm install @ksw8954/git-ai-commit

# or install globally to use the CLI everywhere
npm install -g @ksw8954/git-ai-commit
```

## Usage

After linking globally (`npm link`) or installing via npm, run:

### Commit Messages

```bash
# generate a commit message from staged changes and confirm before committing
git-ai-commit commit

# print only the generated message without touching git
git-ai-commit commit --message-only

# pass extra instructions to guide the AI (appended to the system prompt)
git-ai-commit commit --prompt "docs 변경은 docs 타입으로, 패키지명은 scope로 포함해줘"

# override API settings for a single run
git-ai-commit commit --api-key <key> --base-url <url> --model <model>

# create and push the commit in one flow (will prompt for confirmation first)
git-ai-commit commit --push

# combine with message-only to preview with custom guidance
git-ai-commit commit --message-only --prompt "스코프는 패키지 디렉터리명으로 설정"
```

The command previews the AI-generated message, then asks `Proceed with git commit? (y/n)` before creating the commit. Use `--push` to push after a successful commit, or set auto push through the config command (see below). You can also provide additional instructions for this run using `--prompt "<text>"`; the text is appended to the AI's system prompt to guide the style/content.

During development you can run the CLI without building by using the dev script:

```bash
npm run dev -- commit
```

### Pull Request Messages

```bash
# create a PR title and body by diffing two branches
git-ai-commit pr --base main --compare feature/add-cache

# override API settings for the PR run only
git-ai-commit pr --base release --compare hotfix/urgent --api-key <key>
```

The PR command compares the Git diff from the base branch to the compare branch and prints a ready-to-paste pull request title with `## Summary` and `## Testing` sections in your configured language.

### Tags

```bash
# create an annotated tag with a manual message (skips AI)
git-ai-commit tag v1.2.3 --message "Release notes"

# generate release notes from commit history since a base tag
git-ai-commit tag v1.3.0 --base-tag v1.2.3

# guide the AI with additional instructions for this tag
git-ai-commit tag v1.4.0 --prompt "사용자 기능/버그 수정/유지 보수로 묶고 한국어로 간결히"

# you can combine both
git-ai-commit tag v1.5.0 --base-tag v1.4.0 --prompt "docs는 별도 섹션, breaking change 강조"
```

When AI generation is used, the CLI previews the tag message and asks for confirmation before creating the tag:
- `Create annotated tag <name>? (y/n)`
- After creation, it asks whether to push: `Push tag <name> to remote? (y/n)`

Providing `--message` uses your text verbatim but still asks for tag creation confirmation.

## Git Hook

Install a `prepare-commit-msg` hook so that `git commit` automatically generates an AI message:

```bash
git-ai-commit hook install    # install the hook in the current repo
git-ai-commit hook uninstall  # remove the hook
git-ai-commit hook status     # check installation status
```

Once installed, running `git commit` (without `-m`) will:
1. Generate an AI commit message from your staged changes
2. Pre-fill it in your editor for review and editing
3. Proceed with the commit when you save and close the editor

The hook is skipped when using `git commit -m "..."`, merge commits, or `--amend`.
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
git-ai-commit config --mode gemini       # use Google Gemini native SDK
git-ai-commit config --co-author "Name <email>"  # add Co-authored-by trailer to commits
git-ai-commit config --no-co-author      # remove Co-authored-by trailer
```

The stored configuration works alongside environment variables—CLI flags override config values, which in turn override `.env` settings.

Configuration is written to `~/.git-ai-commit/config.json` by default. Set `GIT_AI_COMMIT_CONFIG_PATH=/custom/path.json` to use a different location.

## Environment Variables
Set the following variables (e.g., in a local `.env` file) before using the CLI:

- `AI_MODE` controls which provider to use:
  - `custom` (default): uses `AI_*` vars first, falls back to `OPENAI_*`. Requests go through the OpenAI-compatible API.
  - `openai`: prioritises `OPENAI_*` vars. Requests go through the OpenAI-compatible API.
  - `gemini`: uses the Google Gemini native SDK (`@google/genai`) directly. Reads `GEMINI_API_KEY` (or `AI_API_KEY`). Default model: `gemini-2.0-flash`.
- Credentials: `AI_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` (priority depends on the selected mode).
- Base URLs: `AI_BASE_URL` or `OPENAI_BASE_URL` (not used in `gemini` mode).
- Models: `AI_MODEL` or `OPENAI_MODEL` (priority matches the selected mode).

## Development Commands

```bash
npm run lint         # run ESLint with the repository rules
npm run test         # execute the Jest suite
npm run test:watch   # watch mode for tests
npm run typecheck    # TypeScript type checking without emit
```

### History

```bash
# show all history (most recent last)
git-ai-commit history

# show last N entries
git-ai-commit history --limit 20

# output as JSON
git-ai-commit history --json --limit 10

# clear all history (asks for confirmation)
git-ai-commit history --clear
```
