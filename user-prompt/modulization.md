# Modulization Prompt

Use this when splitting, isolating, or restructuring modules.

## Objective

Improve boundaries and cohesion without introducing hidden behavior changes.

## Strategy

Move one cohesive responsibility at a time.
Prefer small, reversible migrations over large rewrites.

## Required Actions

1. Define the current structure:
   - where the responsibility lives now
   - who depends on it
   - what pain it causes
2. Define the target structure:
   - new module boundary
   - ownership
   - public API
   - migration order
3. Create a step-by-step migration plan.
4. Add or preserve checks that capture current behavior.
5. Migrate consumers incrementally.
6. Verify each step.
7. Remove the old path once migration is complete.

## Minimum Checklist

- current boundary confirmed
- target boundary explicit
- consumers identified
- migration order explicit
- deletion order explicit
- compatibility risk checked
- tests and imports synchronized

## Output Format

Return:

- As-is summary
- To-be summary
- Migration steps
- Verification steps
- Deletion steps

## Prohibitions

Do not move multiple unrelated responsibilities at once.
Do not leave the old and new structure overlapping indefinitely without a stated reason.
Do not mix architecture cleanup with unrelated feature work unless explicitly requested.
