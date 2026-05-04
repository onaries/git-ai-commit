import { CompletionCommand } from '../commands/completion';

interface CompletionScriptGenerator {
  generateBashCompletion: () => string;
  generateZshCompletion: () => string;
}

describe('CompletionCommand', () => {
  const createGenerator = (): CompletionScriptGenerator => (
    new CompletionCommand() as unknown as CompletionScriptGenerator
  );

  it('includes commit cache options in bash completion', () => {
    const script = createGenerator().generateBashCompletion();

    expect(script).toContain('--no-cache');
    expect(script).toContain('--refresh');
  });

  it('includes commit cache options in zsh completion', () => {
    const script = createGenerator().generateZshCompletion();

    expect(script).toContain('--no-cache[Disable commit message cache for this run]');
    expect(script).toContain('--refresh[Ignore cached commit message and generate a fresh one]');
  });
});
