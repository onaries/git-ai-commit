# Changelog

## 1.1.3 - 2026-01-07

### New Features
- Auto-increment patch version when tag name is omitted
- Use previous tag message as style reference for consistent formatting
- Improve existing tag notes when recreating the same tag

### Bug Fixes
- Fix force push prompt showing unnecessarily after remote tag deletion

## 1.1.2 - 2026-01-07

### New Features
- Add project info (name, path, git remote) to history entries
- Add model info to history entries
- Display project and model in `history` command output

## 1.1.1 - 2026-01-07

### Bug Fixes
- Fix zsh completion not working due to fpath added after compinit
- Fix install-completion to insert fpath before compinit in zshrc
- Fix uninstall-completion to properly remove fpath line

## 1.1.0 - 2026-01-06

### New Features
- Add `completion` command for bash/zsh shell auto-completion
- Add `make install-completion` and `make uninstall-completion` targets

### Improvements
- Change tag message format to GitHub Release style (title + categorized notes)

## 1.0.11 - 2025-12-29
- Default to `max_completion_tokens` and retry with `max_tokens` if unsupported.
- Remove `temperature` from API requests to rely on model defaults.
- Add request fallback handling for unsupported parameters.
