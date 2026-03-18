---
name: pr-review-simplicity
description: "Run only the simplicity reviewer on a PR. Assesses overengineering, unnecessary complexity, and proportionality of solution to problem. Invoke with a PR URL or number: '/skill:pr-review-simplicity 12345'."
argument-hint: "[pr-url-or-number]"
---

# Simplicity Review (Single Reviewer)

Run only the `review-simplicity` agent against a PR or the current branch diff.

## Step 1: Gather the Diff

### If a PR URL or number was provided ($ARGUMENTS):

```bash
gh pr view $ARGUMENTS --json title,body,files,additions,deletions,author
```

```bash
gh pr diff $ARGUMENTS
```

### If no arguments:

```bash
git diff origin/main..HEAD
```

## Step 2: Compose the Task

Read the following references and include their FULL contents in the task:
- [references/reviewer-persona.md](../pr-review/references/reviewer-persona.md)
- [references/simplicity-principles.md](../pr-review/references/simplicity-principles.md)

Structure the task as:

```
<review-standards>
[full contents of reviewer-persona.md]
</review-standards>

<simplicity-principles>
[full contents of simplicity-principles.md]
</simplicity-principles>

<code-changes>
[the diff]
</code-changes>
```

## Step 3: Dispatch

Use the `subagent` tool in **single mode**:

```json
{
  "agent": "review-simplicity",
  "task": "<composed task>"
}
```

## Step 4: Present

Output the agent's findings directly. No synthesis needed — this is a single-reviewer run.
