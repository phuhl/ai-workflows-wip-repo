# Git safety

Never stage or commit files from `.ai-workflows/`, `.opencode/skills/`, or `.opencode/plugins/`. The `git-guard` plugin automatically unstages any such files. Always use `git add <specific-files>`, never `git add .` or `git add -A`.
