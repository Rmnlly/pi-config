---
name: logseq-notes
description: Access and search a Logseq notes repository. Use when the user asks to find, read, search, or create notes, journal entries, or documentation. Provides search patterns and Logseq markdown formatting rules. NOTE — Set LOGSEQ_PATH below to your Logseq notes directory.
---

# Logseq Notes Skill

Use this skill to access Logseq notes repository.

## Location & Structure

**Path:** `LOGSEQ_PATH`

| Directory | Contents | Naming |
|-----------|----------|--------|
| `pages/` | ~100 named topic pages | Topic names with spaces replaced by `___` or spaces (e.g., `Intent Notes.md`) |
| `journals/` | ~700 daily journal entries | `YYYY_MM_DD.md` format (e.g., `2025_01_30.md`) |

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
