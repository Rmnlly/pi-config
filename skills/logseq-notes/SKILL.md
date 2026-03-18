---
name: logseq-notes
description: Access and search Logseq notes repository at ~/Documents/logs-notes. Use when the user asks to find, read, search, or create notes, journal entries, or documentation. Covers topics like intents, technical learnings, cheatsheets, reviews, and project notes. Provides topic index, search patterns, and Logseq markdown formatting rules.
---

# Logseq Notes Skill

Use this skill to access Logseq notes repository.

## Location & Structure

**Path:** `LOGSEQ_PATH`

| Directory | Contents | Naming |
|-----------|----------|--------|
| `pages/` | ~100 named topic pages | Topic names with spaces replaced by `___` or spaces (e.g., `Intent Notes.md`) |
| `journals/` | ~700 daily journal entries | `YYYY_MM_DD.md` format (e.g., `2025_01_30.md`) |

## Topic Index

### Intents & Search
- `intent-invoke-flows.md` - Intent invocation flow documentation
- `Intent Invocation Flows.md` - Detailed intent flows
- `Intent Notes.md` - General intent notes
- `Intent Overview Notes.md` - Intent system overview
- `Search Intent Service.md` - Search intent service docs
- `intents.md` - Intents main page
- `intents___extensibility-host.md` - Intents + extensibility host
- `intents___intentActivityStack.md` - Intent activity stack
- `intents___intentRequest.md` - Intent requests
- `intents___mimeTypes.md` - MIME types for intents
- `intents___useRouteForm.md` - useRouteForm with intents

### Technical Learnings
- `ElasticSearch Learnings.md` - ElasticSearch notes
- `Ruby Learnings.md` - Ruby language notes
- `TypeScript Learnings.md` - TypeScript notes
- `LLM Notes.md` - LLM/AI notes
- `Ruby Testing Notes.md` - Ruby testing patterns

### Cheatsheets & Config
- `Spin Cheatsheet.md` - Spin commands
- `Web Commands ___ Hacks.md` - Web dev commands
- `current zshrc.md` - Current shell config
- `Worktree Workflow.md` - Git worktree workflow
- `vscode config.md` - VS Code configuration
- `logseq cheatsheet.md` - Logseq shortcuts

### Reviews & Feedback
- `March 2025 Review.md` - Latest review
- `Review 2024 - May.md` - May 2024 review
- `Peer Feedback.md` - Peer feedback collection
- `Reviews + Outcomes.md` - Review outcomes summary
- `2025 Quarter 1 review update.md` - Q1 2025 update

### Project Notes
- `Eval Project Notes.md` - Eval project documentation
- `GSD Project Management Notes.md` - GSD/project management
- `view model burst notes.md` - View model work notes
- `claudes plan for anchor handling.md` - Anchor handling plan

## How to Search

### Search all notes for content
```
Grep pattern="your search term" path="LOGSEQ_PATH"
```

### Search only pages (exclude journals)
```
Grep pattern="your search term" path="LOGSEQ_PATH/pages"
```

### Search only journals
```
Grep pattern="your search term" path="LOGSEQ_PATH/journals"
```

### Find pages by filename pattern
```
Glob pattern="**/*intent*.md" path="LOGSEQ_PATH"
```

### Read a specific page
```
Read file_path="LOGSEQ_PATH/pages/Intent Notes.md"
```

### Read today's journal
```
Read file_path="LOGSEQ_PATH/journals/2025_02_02.md"
```

## Logseq Markdown Format

When creating or formatting content for Logseq:

- Use **tab-based indentation** (not spaces)
- Start each line with `-` for bullets
- Nest content by adding tabs before the `-`
- Headings use `#` at appropriate indentation
- Code blocks respect indentation

### Example Structure
```
- # Top Level Heading
	- **Bold text** for emphasis
	- Regular bullet point
		- Nested bullet (one more tab)
			- Double nested (two more tabs)
	- ### Sub-heading
		- Content under sub-heading
	- Code example:
		- ```typescript
		  const example = "code";
		  ```
```

## Common Tasks

| Task | Action |
|------|--------|
| Find notes about X | `Grep pattern="X" path="LOGSEQ_PATH"` |
| Read a specific page | `Read file_path="LOGSEQ_PATH/pages/Page Name.md"` |
| List recent journals | `Glob pattern="journals/2025_01_*.md" path="LOGSEQ_PATH"` |
| Create Logseq-formatted content | Use tab-based indentation with `-` bullets |
