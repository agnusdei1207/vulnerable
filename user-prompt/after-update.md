# Post-Update Audit Prompt

Use this immediately after completing a task.

## Objective

Prove the change is complete, internally consistent, and not partially migrated.

## Required Actions

1. Re-open the changed files and inspect the final state.
2. Re-check affected call chains, imports/exports, and data contracts.
3. Verify related tests, types, mocks, configs, and docs are in sync.
4. Confirm obsolete references, dead paths, and half-migrations are removed.
5. Run the most relevant validation available:
   - tests
   - build
   - lint
   - typecheck
   - targeted manual verification

## Minimum Checklist

- no stale references found
- no orphaned consumer or producer path remains
- imports and exports still resolve coherently
- changed contracts reflected in tests and types
- docs/comments updated where necessary
- verification results recorded

## Output Format

Return a short post-work note with:

- Confirmed changes
- Verification performed
- Remaining risk or unverified area

## Prohibitions

Do not declare completion without explicit verification.
Do not omit adjacent sync work caused by the change.
