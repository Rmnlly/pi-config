---
name: trace-flow
description: Trace and follow code execution paths through a codebase. Use when the user asks to trace, follow, or track code execution, understand data flow, debug rendering issues, or find where a value originates. Supports render traces (component hierarchy), data traces (origin to usage), event traces (trigger to effect), and import traces (leaf to root).
---

# Trace Code Flow

Use this skill when the user asks to "trace", "follow", or "track" code execution, understand data flow, debug rendering issues, or find where a value originates.

## Approach

1. **Start specific** - Begin with the exact file/component mentioned
2. **Follow the implementation** - Trace that specific code path, not abstractions
3. **Stay focused** - Do NOT jump to shared utilities or base classes until asked
4. **Be precise** - Include file paths and line numbers for every step

## Trace Types

| Type | Direction | Follow |
|------|-----------|--------|
| **Render** | Top-down | Component hierarchy, props passed down |
| **Data** | Origin to usage | Where values come from, how they transform |
| **Event** | Trigger to effect | Handler → action → state change → re-render |
| **Import** | Leaf to root | Module dependencies and re-exports |

## Tools Strategy

- **Grep** - Find usages, imports, function calls
- **Read** - Examine implementations at specific lines
- **Glob** - Locate related files by naming patterns

## Output Format

Present as a numbered execution sequence:

```
1. `src/sections/Feature/Component.tsx:42` - Entry: Component receives props
2. `src/sections/Feature/useFeature.ts:15` - Hook initializes state
3. `src/sections/Feature/utils.ts:8` - Helper transforms data
4. `src/sections/Feature/Component.tsx:58` - Rendered with transformed value
```

## Stopping Conditions

Stop the trace when reaching:
- External library boundaries (node_modules)
- Framework internals (React, Preact core)
- The answer to the user's question
- 5+ levels deep without finding relevant code (ask user to clarify)
