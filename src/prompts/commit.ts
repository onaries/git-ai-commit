export const generateCommitPrompt = (diff: string): string => `
You are an expert developer who writes clear, concise, and meaningful git commit messages.

Based on the following git diff of staged changes, generate a commit message that:
1. Follows conventional commit format (type: description)
2. Is concise but descriptive
3. Captures the essence of the changes
4. Uses imperative mood (e.g., "Add feature" not "Added feature")

Git diff:
${diff}

Commit message:
`;