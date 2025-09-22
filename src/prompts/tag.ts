export const generateTagPrompt = (tagName: string, commitLog: string): string => `
You are preparing release notes for the tag ${tagName}.

Summarize the following commit subjects into clear, user-friendly release notes.
- Group related changes when they share a theme.
- Highlight user-facing improvements first, then fixes, then internal maintenance.
- Use concise markdown bullet points.

Commit subjects:
${commitLog}

Release notes:
`;
