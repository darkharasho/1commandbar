# Release Notes Style Guide

## Format

Start with a one-sentence summary of the release. Then list changes in three optional sections:

```
One-line summary of what's new or fixed.

### What's new
- Feature additions, improvements users will notice.

### Bug fixes
- Regressions, crashes, incorrect behaviour that was corrected.

### Under the hood
- Dependency updates, refactors, CI changes — include only if non-trivial.
```

Omit any section that has no entries.

## Tone

- Write for end users, not developers.
- Use present tense ("Fixes window not centering on first open").
- Skip ticket numbers, PR numbers, and commit hashes.
- Capitalise the first word of each bullet; no trailing period.

## Version scheme

`MAJOR.MINOR.PATCH` (semantic versioning):

| Change | Bump |
|--------|------|
| Breaking change to config or IPC | MAJOR |
| New feature visible to users | MINOR |
| Bug fix or internal refactor | PATCH |

Current version lives in three places — keep them in sync:
- `package.json` → `"version"`
- `src-tauri/tauri.conf.json` → `"version"`
- `src-tauri/Cargo.toml` → `version` in `[package]`
