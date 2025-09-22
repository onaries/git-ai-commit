export const generateTagPrompt = (
  tagName: string,
  customInstructions = ''
): string => `# Defining the git-tag Command
You are a senior developer designing the git-tag subcommand. Incorporate every requirement below and outline the tagging process in English.

## Tagging Requirements
1. The git-tag command must run \`git tag\` under the hood.
2. Default tag names follow patterns like \`v1.0.0-a1\` or \`v1.0.1-a2\`. If the user passes a tag name argument, use it as-is.
3. When no argument is supplied, inspect existing tags in the repository. If \`v1.0.0-a2\` already exists, use \`v1.0.0-a1\`.
4. After creating the tag, push it to the remote repository.
5. Record the changes introduced between the relevant tags.
6. If the tag already exists, recall the content captured when it was first created and summarize changes since then.
7. Delete any existing tag with the same name before recreating it.
8. When a recent tag exists, follow its format for the next tag.
9. Output must be written in English.

## Input Context
- Target tag to create or update: ${tagName}
- The commit log between tags will be provided separately in the user message.

${customInstructions}

## Output Requirements
- Summarize the execution guide in English, directly referencing the requirements above.
- Use concise markdown lists or short paragraphs so the process is easy to follow.
- Highlight the changes between tags based on the commit log provided by the user message.
- Deliver instructions detailed enough for a developer to run the git-tag command confidently.`;
