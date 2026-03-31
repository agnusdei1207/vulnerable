# Pre-Work Survey Prompt

Use this before any non-trivial task.

## Objective

Understand the current system well enough to make a safe, justified change.

## Required Actions

1. Identify the exact target files, entry points, and affected modules.
2. Read the relevant implementation directly, not just search hits.
3. Trace the flow from input or trigger to output or side effect.
4. Confirm public API boundaries, types, configs, and dynamic wiring if involved.
5. Define:
   - target
   - reason
   - scope
   - expected impact
   - rollback path

## Minimum Checklist

- entry points enumerated
- producer and consumer chain traced
- imports and exports checked
- state, schema, or type shape checked
- related tests and docs identified
- main risks and unknowns written down

## Output Format

Return a short pre-work note with:

- Confirmed context
- Planned change
- Risks
- Verification plan

## Prohibitions

Do not start implementation if the current flow is still unclear.
Do not present assumptions as confirmed facts.
