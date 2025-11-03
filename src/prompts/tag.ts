export type TagPromptLanguage = 'ko' | 'en';

export const generateTagPrompt = (
  tagName: string,
  customInstructions = '',
  language: TagPromptLanguage = 'ko'
): string => {
  const summaryInstruction = language === 'ko'
    ? 'Begin with a short summary sentence (in Korean) that captures the overall impact of the release using plain text only.'
    : 'Begin with a short summary sentence (in English) that captures the overall impact of the release using plain text only.';

  const listInstruction = language === 'ko'
    ? 'After the summary, write one line per category — 사용자 기능, 버그 수정, 유지 보수 — using the format "사용자 기능: 변경1; 변경2" with plain text only (no bullets, numbers, or markdown symbols).'
    : 'After the summary, write one line per category — User Features, Bug Fixes, Maintenance — using the format "User Features: Change 1; Change 2" with plain text only (no bullets, numbers, or markdown symbols).';

  const emptyCategoryInstruction = language === 'ko'
    ? 'If a category has no changes, write "사용자 기능: 해당 사항 없음." (or the matching category label) using the same plain text format.'
    : 'If a category has no changes, write "User Features: None." (or the matching category label) using the same plain text format.';

  const noChangesInstruction = language === 'ko'
    ? 'If no changes exist at all, state "변경 사항 없음" plainly.'
    : 'If no changes exist at all, state "No changes to report." plainly.';

  const outputLanguageLine = language === 'ko'
    ? 'Write the release notes in Korean using concise plain text without markdown syntax.'
    : 'Write the release notes in English using concise plain text without markdown syntax.';

  return `You are an experienced release manager. Produce clear, user-facing release notes that describe the differences between the previous tag and ${tagName}.

## Objective
Summarize the meaningful changes that occurred between the prior release tag and ${tagName}. Treat the commit log provided by the user message as the complete history of changes since the previous tag.

## Input Context
- Target tag to publish: ${tagName}
- Commit history between the previous tag and ${tagName} will be supplied in the user message (most recent first).

${customInstructions}

## Output Requirements
- ${outputLanguageLine}
- ${summaryInstruction}
- ${listInstruction}
- Use short phrases for each change and include scope/component names when helpful, without copying commit messages verbatim.
- ${emptyCategoryInstruction}
- ${noChangesInstruction}
- Do not invent work beyond what appears in the commit log.
- Do not use markdown syntax such as headings (#), bullets (-), emphasis (**), underscores (_), or backticks (\`).
- Separate lines using newline characters only; do not use numbering, bullet prefixes, tables, or code blocks.
- Return only the release notes content with no surrounding commentary.`;
};
