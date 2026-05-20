# Post-write hook

After every file write or edit, the `file-hook` plugin runs automatically:
- Prettier — formats the file (uses `node_modules/.bin/prettier` if installed, falls back to `npx prettier`)
- ESLint — lints the file (uses `node_modules/.bin/eslint` if installed, falls back to `npx eslint`)
- TypeScript — type-checks the entire project (uses `node_modules/.bin/tsc` if installed, falls back to `npx tsc`)

The hook uses the locally installed binary from `node_modules/.bin/` first to ensure the project's exact dependency versions (and their plugins) are used. When the local binary is not found, it falls back to `npx`.

The hook does **not** block the write — it only logs issues found. When the plugin is unavailable, manually run these checks before committing:
```bash
npx prettier --write <file>
npx eslint <file>
npx tsc --noEmit
```
