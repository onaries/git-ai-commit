export type TagPromptLanguage = 'ko' | 'en';

export const generateTagPrompt = (
  tagName: string,
  customInstructions = '',
  language: TagPromptLanguage = 'ko'
): string => {
  const summaryInstruction = language === 'ko'
    ? 'Begin with a short summary sentence (in Korean) that captures the overall impact of the release.'
    : 'Begin with a short summary sentence (in English) that captures the overall impact of the release.';

  const listInstruction = language === 'ko'
    ? 'After the summary, list every change as a markdown bullet (-) grouped by category: 사용자 기능, 버그 수정, 유지 보수.'
    : 'After the summary, list every change as a markdown bullet (-) grouped by category: User Features, Bug Fixes, Maintenance.';

  const emptyCategoryInstruction = language === 'ko'
    ? 'If a category has no changes, include a bullet stating - 해당 사항 없음.'
    : 'If a category has no changes, include a bullet stating - None.';

  const noChangesInstruction = language === 'ko'
    ? 'If no changes exist at all, state "변경 사항 없음" plainly.'
    : 'If no changes exist at all, state "No changes to report." plainly.';

  const outputLanguageLine = language === 'ko'
    ? 'Write the release notes in Korean using concise markdown.'
    : 'Write the release notes in English using concise markdown.';

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
- Use short phrases for each bullet and include scope/component names when helpful, without copying commit messages verbatim.
- ${emptyCategoryInstruction}
- ${noChangesInstruction}
- Do not invent work beyond what appears in the commit log.
- Return only the release notes content with no surrounding commentary.`;
};
