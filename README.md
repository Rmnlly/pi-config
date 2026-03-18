# pi-config

Personal [pi](https://github.com/mariozechner/pi) coding agent configuration — custom extensions, skills, and review agents.

## What's Included

### Extensions (`extensions/`)

| Extension | Description |
|-----------|-------------|
| **orbit/** | TUI dashboard showing all pi sessions, worktrees, explorations, and tasks. Commands: `/orbit`, `/tasks` |
| **exploration-tracker/** | Track discovery sessions with multiple options. Mark choices, store others for follow-up |
| **caffeinate.ts** | Keep your Mac awake while pi is running. Toggle with `/caffeinate` |
| **multi-choice.ts** | Present options to the user and let them pick (or type custom). Used as a tool by the LLM |
| **post-edit-typecheck.ts** | Auto-run TypeScript type checking after file edits |

### Skills (`skills/`)

| Skill | Description |
|-------|-------------|
| **pr-review/** | Full PR review orchestrator — dispatches specialist reviewers in parallel, synthesizes findings |
| **pr-review-architecture/** | Architecture-focused reviewer (outside-in analysis) |
| **pr-review-correctness/** | Correctness reviewer (bugs, edge cases, race conditions) |
| **pr-review-security/** | Security reviewer (vulnerabilities, auth, data exposure) |
| **pr-review-simplicity/** | Simplicity reviewer (overengineering, proportionality) |
| **pr-review-testing/** | Testing reviewer (coverage gaps, quality, anti-patterns) |
| **trace-flow/** | Trace code execution paths through a codebase |
| **logseq-notes/** | Access and search a personal Logseq notes repository |
| **learnings/** | Extract session learnings and append to Logseq journal |

### Agents (`agents/`)

Subagent personas used by the PR review system. Each is a specialist reviewer with defined output format and expertise.

## Installation

### Quick Install (symlink)

```bash
./install.sh
```

This creates symlinks from `~/.pi/agent/` to this repo, so changes here are immediately reflected.

### Manual Install

Copy or symlink the directories you want:

```bash
# All extensions
ln -sf $(pwd)/extensions/* ~/.pi/agent/extensions/

# All skills
for skill in skills/*/; do
  ln -sf $(pwd)/$skill ~/.pi/agent/skills/$(basename $skill)
done

# All agents
ln -sf $(pwd)/agents/* ~/.pi/agent/agents/
```

## Configuration

Some files need paths configured for your setup:

### Orbit Extension
Set your worktree root via environment variable:
```bash
export ORBIT_TREES_DIR="$HOME/my-worktrees"
```
Or edit `extensions/orbit/scanner.ts` directly (defaults to `~/worktrees`).

### Logseq Skills (`logseq-notes`, `learnings`)
Search for `LOGSEQ_PATH` in the skill files and replace with your Logseq notes directory:
```
LOGSEQ_PATH → ~/Documents/my-logseq-notes
```

### PR Review
The review system uses `gh` CLI for PR access and dispatches subagents. Ensure:
- `gh` is installed and authenticated (`gh auth login`)
- The `agents/review-*.md` files are in `~/.pi/agent/agents/`

## License

MIT
