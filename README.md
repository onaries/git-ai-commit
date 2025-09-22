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
# generate a commit message from staged changes
git-ai-commit commit

# generate and automatically create the commit
git-ai-commit commit --commit

# override API settings
git-ai-commit commit --api-key <key> --base-url <url> --model <model>
```

During development you can run the CLI without building by using the dev script:

```bash
npm run dev -- commit
```

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
