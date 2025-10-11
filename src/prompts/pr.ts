export type PullRequestPromptLanguage = 'ko' | 'en';

export const generatePullRequestPrompt = (
  baseBranch: string,
  compareBranch: string,
  customInstructions = '',
  language: PullRequestPromptLanguage = 'ko'
): string => {
  const languageRequirement = language === 'ko'
    ? 'Write the entire pull request title and body in Korean.'
    : 'Write the entire pull request title and body in English.';

  const titleGuidelines = language === 'ko'
    ? `### 제목 작성 규칙
- 한 줄짜리 명령형 문장으로 작성합니다 (예: "Refactor validator 로직 정리").
- 접두사는 사용하지 않습니다 (예: "Feat:" 금지).
- 72자를 넘지 않도록 합니다.`
    : `### Title Guidelines
- Use a single imperative sentence (e.g., "Refactor validator handling").
- Do not prefix with labels like "Feat:".
- Keep the title under 72 characters.`;

  const summaryGuidelines = language === 'ko'
    ? `### 본문 구성
- "## Summary" 헤딩 아래에 핵심 변경 사항을 강조하는 불릿 리스트를 작성합니다.
- 각 불릿은 "무엇을"과 "왜"를 포함하고, 한국어로 1줄 내로 작성합니다.
- 영향이 큰 변경은 별도의 불릿으로 구분합니다.`
    : `### Body Structure
- Under a "## Summary" heading, add bullet points that explain what changed and why.
- Keep each bullet to a single concise English sentence.
- Separate large areas of impact into individual bullets.`;

  const testingGuidelines = language === 'ko'
    ? `### 테스트 정보
- "## Testing" 헤딩 아래에 검증 방법을 불릿으로 정리합니다.
- 수동 테스트, 자동 테스트, 혹은 "테스트 필요 없음"을 명시합니다.`
    : `### Testing Details
- Under a "## Testing" heading, list how the changes were verified.
- Call out manual steps, automated checks, or "Not tested" when applicable.`;

  return `You are an expert software engineer preparing a pull request description.
Compare the git history and code changes between the base branch "${baseBranch}" and the compare branch "${compareBranch}" and summarise the meaningful differences in a PR-friendly format.

${customInstructions}

## Output Contract
- Return ONLY markdown suitable for pasting into a pull request form.
- First line MUST be the pull request title, adhering to the title guidelines below.
- After one blank line, include the sections exactly as shown:
  - "## Summary"
  - "## Testing"
- If a section has no content, provide a single bullet: "- 없음" in Korean or "- None" in English (use language-appropriate wording).
- Do not invent changes that are not present in the provided diff.

${languageRequirement}

${titleGuidelines}

${summaryGuidelines}

${testingGuidelines}

Focus on user-facing impact, breaking changes, and notable refactors. Avoid raw diff dumps.`;
};
