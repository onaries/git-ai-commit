# Changelog

## 1.0.11 - 2025-12-29
- Default to `max_completion_tokens` and retry with `max_tokens` if unsupported.
- Remove `temperature` from API requests to rely on model defaults.
- Add request fallback handling for unsupported parameters.
