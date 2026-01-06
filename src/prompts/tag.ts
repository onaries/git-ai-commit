export type TagPromptLanguage = 'ko' | 'en';

export const generateTagPrompt = (
  tagName: string,
  customInstructions = '',
  language: TagPromptLanguage = 'ko'
): string => {
  const titleInstruction = language === 'ko'
    ? `첫 줄에 버전 "${tagName}"을 제목으로 작성하세요.`
    : `Write the version "${tagName}" as the title on the first line.`;

  const summaryInstruction = language === 'ko'
    ? '제목 다음 줄에 이번 릴리즈의 전체적인 영향을 요약하는 한 문장을 작성하세요.'
    : 'On the line after the title, write a one-sentence summary capturing the overall impact of this release.';

  const listInstruction = language === 'ko'
    ? '요약 후 빈 줄을 두고, 각 카테고리별로 변경사항을 나열하세요: 새로운 기능, 버그 수정, 개선사항. 각 항목은 "- " 로 시작합니다.'
    : 'After the summary, leave a blank line, then list changes by category: New Features, Bug Fixes, Improvements. Each item starts with "- ".';

  const categoryFormat = language === 'ko'
    ? `카테고리 형식:
### 새로운 기능
- 변경사항 1
- 변경사항 2

### 버그 수정
- 수정사항 1

### 개선사항
- 개선사항 1`
    : `Category format:
### New Features
- Change 1
- Change 2

### Bug Fixes
- Fix 1

### Improvements
- Improvement 1`;

  const emptyCategoryInstruction = language === 'ko'
    ? '변경사항이 없는 카테고리는 생략하세요.'
    : 'Omit categories with no changes.';

  const noChangesInstruction = language === 'ko'
    ? '변경사항이 전혀 없으면 "변경 사항 없음"이라고 작성하세요.'
    : 'If no changes exist at all, state "No changes to report."';

  const outputLanguageLine = language === 'ko'
    ? '릴리즈 노트를 한국어로 작성하세요.'
    : 'Write the release notes in English.';

  return `You are an experienced release manager. Produce clear, user-facing release notes in GitHub Release style.

## Objective
Create release notes for ${tagName} that describe the meaningful changes since the previous release.

## Input Context
- Target tag to publish: ${tagName}
- Commit history between the previous tag and ${tagName} will be supplied in the user message.

${customInstructions ? `## Additional Instructions\n${customInstructions}\n` : ''}
## Output Format (GitHub Release Style)
${titleInstruction}
${summaryInstruction}
${listInstruction}

${categoryFormat}

## Rules
- ${outputLanguageLine}
- ${emptyCategoryInstruction}
- ${noChangesInstruction}
- Use concise descriptions; do not copy commit messages verbatim.
- Do not invent changes beyond what appears in the commit log.
- Use markdown formatting (###, -, etc.) as shown in the category format.
- Return only the release notes content with no surrounding commentary.`;
};
