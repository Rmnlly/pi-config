# Simplicity Principles

Every reviewer must evaluate their findings through a simplicity lens. These principles apply across all review domains.

## The Simplicity Test

For every piece of new code, ask:

1. **Does this need to exist?** — Is the problem real? Is it being solved at the right layer?
2. **Is this the simplest approach?** — Could the same outcome be achieved with less code, fewer abstractions, or existing tools?
3. **Is the complexity proportionate?** — Does the solution's complexity match the problem's complexity? A 200-line abstraction for a 10-line problem is a smell.
4. **Will a new team member understand this in 6 months?** — Cleverness that requires tribal knowledge is a liability.

## Red Flags for Overengineering

- **Premature abstraction** — Generalizing before there are 3+ concrete use cases
- **Abstraction layers without value** — Wrappers that add indirection but no behavior
- **Config-driven complexity** — Making something configurable when there's only one configuration
- **Future-proofing** — Building for hypothetical requirements that may never arrive
- **Pattern worship** — Applying design patterns because they're "correct" rather than because they solve a real problem
- **Unnecessary indirection** — More files, more layers, more hops than the problem demands
- **Gold plating** — Edge case handling for scenarios that are extremely unlikely or already handled elsewhere

## When Complexity Is Justified

Complexity is acceptable when:
- It directly addresses a known, documented requirement
- It prevents a concrete, likely failure mode (not hypothetical)
- It measurably improves performance for a real bottleneck
- It's the established pattern in the codebase (consistency > local perfection)
- It enables required extensibility with 2+ existing consumers

## The Outside-In Test (for larger changes)

Before examining implementation details, ask:

1. **What problem does this solve?** — Can you state it in one sentence?
2. **Who benefits?** — Is the user/developer impact clear?
3. **Is the approach proportionate to the problem?** — Would a senior engineer look at this and say "yeah, that's about right" or "why is this so complicated?"
4. **Does the solution fit the system's existing grain?** — Or does it fight against established patterns without clear justification?
5. **What's the simplest thing that could work?** — Even if the PR isn't that, how far is it from that baseline?
