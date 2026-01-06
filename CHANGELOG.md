# Changelog

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
