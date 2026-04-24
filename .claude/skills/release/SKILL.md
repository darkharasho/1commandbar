# Release Skill

Use this skill whenever the user asks to cut a release, bump the version, or ship a new build.

## First-time setup (do once, not on every release)

Before the first release, check whether `src-tauri/tauri.conf.json` contains a real pubkey under `plugins.updater.pubkey`.

If the value is still the placeholder `"REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE"`:

1. Tell the user to run this in the repo root and save both outputs:
   ```
   npm run tauri signer generate -- --password ""
   ```
   - Copy the **public key** into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
   - Add the **private key** as a GitHub Actions secret named `TAURI_SIGNING_PRIVATE_KEY`
   - Leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret empty (or set to `""`)
2. Commit the tauri.conf.json change before proceeding.

---

## Release checklist

Work through these steps in order. Mark each done before moving on.

### 1. Confirm clean working tree

```bash
git status
git diff
```

If there are uncommitted changes, ask the user whether to stash or commit them first.

### 2. Determine the new version

Read the current version:
```bash
node -p "require('./package.json').version"
```

Ask the user for the bump type (patch / minor / major) if they didn't specify it.
Compute `NEW_VERSION` following semver (see `docs/release-notes-style.md`).

### 3. Write release notes

Read `docs/release-notes-style.md` for format and tone rules.

Show the user the commits since the last tag:
```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
```

Draft release notes following the style guide. Show the draft to the user and wait for approval or edits before continuing.

Save the approved notes to `/tmp/release-notes.md` for use in step 7.

### 4. Bump version in all three files

Edit these three files to replace the old version string with `NEW_VERSION`:

| File | Field |
|------|-------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version` under `[package]` |

Verify after editing:
```bash
grep -E '"version"|^version' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml | grep -v "tauri-plugin\|^Binary\|workspace"
```

All three should show `NEW_VERSION`.

### 5. Commit the version bump

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: release v$NEW_VERSION"
```

### 6. Tag

```bash
git tag "v$NEW_VERSION"
```

### 7. Push

```bash
git push origin main
git push origin "v$NEW_VERSION"
```

This triggers `.github/workflows/release.yml`, which:
- Builds and signs the AppImage
- Generates `latest.json` for the auto-updater
- Creates and publishes a GitHub release with all artifacts

### 8. Post-push

Tell the user:
- The release workflow is running at `https://github.com/darkharasho/1commandbar/actions`
- Once complete, the release will be live at `https://github.com/darkharasho/1commandbar/releases`
- Existing installs will be notified of the update via the Settings → "Check for updates" button
