## Code Review: [PR Title/Number]

### Executive Summary
[One paragraph: overall assessment, simplicity verdict first, then key concerns and recommendation]

### Simplicity Assessment
[✅/⚠️/🚨 verdict line first]
[Is the approach proportionate to the problem? Is there overengineering? Could this be simpler?]

### Critical Issues (MUST FIX)
[Merged from all reviewers, ordered by impact]
1. **[Issue Title]** ([source: simplicity/architecture/security/etc.])
   - **Severity:** CRITICAL
   - **Location:** `file:lines`
   - **Problem:** [description]
   - **Fix:** [concrete solution]
   - **Impact:** [what goes wrong if unfixed]

### Major Issues (SHOULD FIX)
[HIGH severity findings]

### Improvements (CONSIDER)
[MEDIUM and LOW findings, grouped]

### Architecture & Design
[✅/⚠️/🚨 verdict line first]
[Outside-in analysis: does the solution fit the problem? Does it work with the system's grain?]
[Only included for Medium/Large changes]

### Correctness & Logic
[✅/⚠️/🚨 verdict line first]
[Bugs, edge cases, error handling, data integrity]

### Security
[✅/⚠️/🚨 verdict line first]
[Vulnerabilities, auth, input validation, data exposure]

### Testing & Quality
[✅/⚠️/🚨 verdict line first]
[Coverage gaps, test quality, missing scenarios]
[Only included for Medium/Large changes]

### Behavioral Completeness
[✅/⚠️/🚨 verdict line first]
[Are all code paths that implement this behavior updated consistently? Any sibling files missed?]
[Omit if no cross-cutting behavior was identified]

### Positive Highlights
[Good patterns, clever-but-clear solutions, well-structured code]

### Simplification Opportunities
[Specific, actionable ways the code could be made simpler — even if not blocking]

### Decision
**Verdict:** [READY FOR MERGE / NEEDS CHANGES / NEEDS DISCUSSION / BLOCK]
**Confidence Level:** [High/Medium/Low]
**Follow-up Required:** [Yes/No — specify what]
