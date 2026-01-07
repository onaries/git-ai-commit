import { Command } from 'commander';

export class CompletionCommand {
  private program: Command;

  constructor() {
    this.program = new Command('completion')
      .description('Generate shell completion scripts')
      .argument('<shell>', 'Shell type (bash or zsh)')
      .action(this.handleCompletion.bind(this));
  }

  private handleCompletion(shell: string): void {
    const normalized = shell.toLowerCase().trim();

    if (normalized === 'bash') {
      console.log(this.generateBashCompletion());
    } else if (normalized === 'zsh') {
      console.log(this.generateZshCompletion());
    } else {
      console.error(`Unsupported shell: ${shell}`);
      console.error('Supported shells: bash, zsh');
      process.exit(1);
    }
  }

  private generateBashCompletion(): string {
    return `# git-ai-commit bash completion
# Add to ~/.bashrc or ~/.bash_profile:
#   eval "$(git-ai-commit completion bash)"

_git_ai_commit() {
    local cur prev words cword
    _init_completion || return

    local commands="commit config pr tag history completion"
    
    # Global options
    local global_opts="-v --version -h --help"

    # Command-specific options
    local commit_opts="-k --api-key -b --base-url --model -m --message-only -p --push --prompt --no-verify"
    local config_opts="-s --show -l --language --auto-push --no-auto-push -k --api-key -b --base-url -m --model --mode"
    local pr_opts="--base --compare -k --api-key -b --base-url --model"
    local tag_opts="-k --api-key --base-url -m --model --message -t --base-tag --prompt"
    local history_opts="-l --limit --json --clear"
    local completion_opts=""

    case "\${cword}" in
        1)
            COMPREPLY=( \$(compgen -W "\${commands} \${global_opts}" -- "\${cur}") )
            return
            ;;
    esac

    local cmd="\${words[1]}"
    
    case "\${cmd}" in
        commit)
            case "\${prev}" in
                -k|--api-key|-b|--base-url|--model|--prompt)
                    return
                    ;;
            esac
            COMPREPLY=( \$(compgen -W "\${commit_opts}" -- "\${cur}") )
            ;;
        config)
            case "\${prev}" in
                -l|--language)
                    COMPREPLY=( \$(compgen -W "ko en" -- "\${cur}") )
                    return
                    ;;
                --mode)
                    COMPREPLY=( \$(compgen -W "custom openai" -- "\${cur}") )
                    return
                    ;;
                -k|--api-key|-b|--base-url|-m|--model)
                    return
                    ;;
            esac
            COMPREPLY=( \$(compgen -W "\${config_opts}" -- "\${cur}") )
            ;;
        pr)
            case "\${prev}" in
                --base|--compare)
                    # Complete with git branches
                    local branches=\$(git branch --format='%(refname:short)' 2>/dev/null)
                    COMPREPLY=( \$(compgen -W "\${branches}" -- "\${cur}") )
                    return
                    ;;
                -k|--api-key|-b|--base-url|--model)
                    return
                    ;;
            esac
            COMPREPLY=( \$(compgen -W "\${pr_opts}" -- "\${cur}") )
            ;;
        tag)
            case "\${prev}" in
                -t|--base-tag)
                    # Complete with git tags
                    local tags=\$(git tag 2>/dev/null)
                    COMPREPLY=( \$(compgen -W "\${tags}" -- "\${cur}") )
                    return
                    ;;
                -k|--api-key|--base-url|-m|--model|--message|--prompt)
                    return
                    ;;
            esac
            COMPREPLY=( \$(compgen -W "\${tag_opts}" -- "\${cur}") )
            ;;
        history)
            case "\${prev}" in
                -l|--limit)
                    return
                    ;;
            esac
            COMPREPLY=( \$(compgen -W "\${history_opts}" -- "\${cur}") )
            ;;
        completion)
            COMPREPLY=( \$(compgen -W "bash zsh" -- "\${cur}") )
            ;;
    esac
}

complete -F _git_ai_commit git-ai-commit
`;
  }

  private generateZshCompletion(): string {
    return `#compdef git-ai-commit
# git-ai-commit zsh completion
# Installation:
#   mkdir -p ~/.zsh/completions
#   git-ai-commit completion zsh > ~/.zsh/completions/_git-ai-commit
#   # Add to ~/.zshrc (before compinit): fpath=(~/.zsh/completions \$fpath)
#   # Then restart shell or run: autoload -Uz compinit && compinit

_git-ai-commit() {
    local curcontext="\$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        '-v[output the version number]' \\
        '--version[output the version number]' \\
        '-h[display help]' \\
        '--help[display help]' \\
        '1: :->command' \\
        '*:: :->args' && return

    case \$state in
        command)
            local -a commands
            commands=(
                'commit:Generate AI-powered commit message'
                'config:Manage git-ai-commit configuration'
                'pr:Generate a pull request title and summary'
                'tag:Create an annotated git tag with AI-generated notes'
                'history:Manage git-ai-commit command history'
                'completion:Generate shell completion scripts'
            )
            _describe -t commands 'git-ai-commit commands' commands
            ;;
        args)
            case \$line[1] in
                commit)
                    _arguments \\
                        '-k[OpenAI API key]:key:' \\
                        '--api-key[OpenAI API key]:key:' \\
                        '-b[Custom API base URL]:url:' \\
                        '--base-url[Custom API base URL]:url:' \\
                        '--model[Model to use]:model:' \\
                        '-m[Output only the generated commit message]' \\
                        '--message-only[Output only the generated commit message]' \\
                        '-p[Push after creating the commit]' \\
                        '--push[Push after creating the commit]' \\
                        '--prompt[Additional AI prompt instructions]:text:' \\
                        '--no-verify[Skip pre-commit hooks]'
                    ;;
                config)
                    _arguments \\
                        '-s[Show current configuration]' \\
                        '--show[Show current configuration]' \\
                        '-l[Set default language]:language:(ko en)' \\
                        '--language[Set default language]:language:(ko en)' \\
                        '--auto-push[Enable automatic git push]' \\
                        '--no-auto-push[Disable automatic git push]' \\
                        '-k[Persist API key]:key:' \\
                        '--api-key[Persist API key]:key:' \\
                        '-b[Persist API base URL]:url:' \\
                        '--base-url[Persist API base URL]:url:' \\
                        '-m[Persist default AI model]:model:' \\
                        '--model[Persist default AI model]:model:' \\
                        '--mode[Persist AI mode]:mode:(custom openai)'
                    ;;
                pr)
                    _arguments \\
                        '--base[Base branch to diff against]:branch:->branches' \\
                        '--compare[Compare branch to describe]:branch:->branches' \\
                        '-k[Override API key]:key:' \\
                        '--api-key[Override API key]:key:' \\
                        '-b[Override API base URL]:url:' \\
                        '--base-url[Override API base URL]:url:' \\
                        '--model[Override AI model]:model:'
                    [[ \$state == branches ]] && {
                        local -a branches
                        branches=(\${(f)"\$(git branch --format='%(refname:short)' 2>/dev/null)"})
                        _describe -t branches 'branches' branches
                    }
                    ;;
                tag)
                    _arguments \\
                        '1:tag name:' \\
                        '-k[OpenAI API key]:key:' \\
                        '--api-key[OpenAI API key]:key:' \\
                        '--base-url[Custom API base URL]:url:' \\
                        '-m[Model to use]:model:' \\
                        '--model[Model to use]:model:' \\
                        '--message[Tag message to use directly]:message:' \\
                        '-t[Existing tag to diff against]:tag:->tags' \\
                        '--base-tag[Existing tag to diff against]:tag:->tags' \\
                        '--prompt[Additional AI prompt instructions]:text:'
                    [[ \$state == tags ]] && {
                        local -a tags
                        tags=(\${(f)"\$(git tag 2>/dev/null)"})
                        _describe -t tags 'tags' tags
                    }
                    ;;
                history)
                    _arguments \\
                        '-l[Limit number of entries]:number:' \\
                        '--limit[Limit number of entries]:number:' \\
                        '--json[Output in JSON format]' \\
                        '--clear[Clear all stored history]'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:(bash zsh)'
                    ;;
            esac
            ;;
    esac
}
`;
  }

  getCommand(): Command {
    return this.program;
  }
}
