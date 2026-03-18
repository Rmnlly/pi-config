---
name: learnings
description: Document session learnings into Logseq journal notes. Extracts noteworthy insights, gotchas, patterns, and corrections from the current session, groups related items by topic, and appends them to today's Logseq journal. Use when the user says "learnings", "document learnings", "save learnings", or "what did we learn". Optional arguments focus on specific areas. NOTE — Update LOGSEQ_PATH below to your Logseq notes directory.
---

# Session Learnings

Document learnings from the current session into your Logseq journal. Optional focus hints: `$ARGUMENTS`

> **Configuration:** Set `LOGSEQ_PATH` below to your Logseq notes directory (e.g., `~/Documents/my-notes`).

## Your Task

Review the ENTIRE conversation history from this session and extract noteworthy learnings. Focus on:

1. **System/area worked in** — which part of the codebase, infrastructure, or tooling
2. **Code flows & architecture** — how things connect, data flow, key files
3. **Edge cases & gotchas** — things that tripped us up or were non-obvious
4. **Corrections** — mistakes made during the session and what the fix was
5. **Useful patterns** — reusable knowledge for similar future work
6. **Commands/debugging tricks** — anything that helped resolve an issue

If the user provided hints via arguments, use them to focus on specific areas. If no arguments, extract ALL noteworthy learnings from the session.

## Step 1: Gather Existing Tags

Search the journals directory for existing tags to maintain consistency:

```bash
grep -ohr '#[a-zA-Z][a-zA-Z0-9_/-]*' LOGSEQ_PATH/journals/ 2>/dev/null | sort -u
```

Use the existing tags from your journal to maintain consistency.

Always reuse existing tags when they fit. Create new tags only when no existing tag covers the topic. Keep tags lowercase-ish and short (1-2 words, use `/` for subtopics like `#ruby/testing`).

## Step 2: Extract Raw Learnings

Go through the full conversation and pull out every noteworthy learning as a flat list. Don't worry about structure yet — just capture everything.

## Step 3: Group by Topic

**This is critical.** Review the raw learnings and group related items together under shared topic headings. Look for:

- Multiple learnings about the same system, file, or concept → merge under one topic bullet
- A main insight with supporting details → make the main insight the topic bullet, details as sub-bullets
- Standalone learnings that don't relate to anything else → keep as individual topic bullets

The goal is a **hierarchical, scannable list** — NOT a flat dump of one-liner bullets. Each top-level item under `📝 Learnings` should be a **topic or theme**, with specifics nested underneath.

### Good (grouped):
```
- 📝 Learnings
	- Pi skills system — creating and structuring custom skills #pi
		- Skills live in `~/.pi/agent/skills/<name>/SKILL.md` with YAML frontmatter
		- Name must match parent directory, lowercase with hyphens only
		- Description determines when the agent auto-loads the skill
		- Invoke manually with `/skill:name` command
	- Logseq journal format gotchas #logseq
		- Must use real tabs, not spaces, for indentation
		- Every line starts with `-` including nested content
```

### Bad (flat):
```
- 📝 Learnings
	- Pi skills live in `~/.pi/agent/skills/<name>/SKILL.md` #pi
	- Skill names must match parent directory #pi
	- Skill names must be lowercase with hyphens #pi
	- Description determines when agent loads the skill #pi
	- You can invoke skills with `/skill:name` #pi
	- Logseq uses real tabs not spaces #logseq
	- Every Logseq line starts with `-` #logseq
```

## Step 4: Format as Logseq Markdown

Use Logseq markdown format with these rules:
- Tab-based indentation (real tabs, not spaces)
- Every line starts with `-`
- The section header is `- 📝 Learnings` at root level (no tabs)
- Each learning **topic/group** gets one tab indent under the header, with a `#tag` at the END of the line
- Supporting details and individual points get two tab indents
- Code snippets use triple backticks at appropriate indent level
- Keep entries SUCCINCT — favor clarity over completeness
- Only include code snippets when they capture a non-obvious pattern or fix

## Step 5: Write to Journal

1. Determine today's date and construct the filename: `YYYY_MM_DD.md`
2. Read today's journal file at `LOGSEQ_PATH/journals/YYYY_MM_DD.md`
3. Check if a `📝 Learnings` section already exists:
   - **If it exists:** Append your new learnings as additional tab-indented bullets under the existing `- 📝 Learnings` line
   - **If it doesn't exist:** Append `- 📝 Learnings` followed by your indented learnings to the END of the file
   - **If the file doesn't exist:** Create it with just the learnings section

## Critical Rules

- **Group related items.** Never output a flat list of one-liners when items share a topic.
- **Be succinct.** Each learning should be 1-2 lines max for the main point. Sub-bullets only for essential context.
- **No fluff.** Skip things like "we worked on X" — only capture the actual insight/gotcha/pattern.
- **Skip trivial things.** Don't document obvious actions like "ran tests" or "fixed a typo".
- **Reuse tags.** Always prefer existing tags from the journals over creating new ones.
- **Preserve existing content.** NEVER modify or delete existing journal content. Only append.
- **Show the user what you wrote** before or after writing it, so they can verify.
