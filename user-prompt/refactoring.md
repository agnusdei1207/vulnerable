# Refactoring Prompt

Use this for behavior-preserving code cleanup and structural improvement.

## Objective

Improve readability, maintainability, and structure while preserving intended behavior.

## Refactoring Rules

- No hidden feature additions.
- No unverified behavioral change.
- Prefer small, reviewable steps.
- Keep naming, control flow, and boundaries clearer after the change than before.

## Required Actions

1. Confirm the current behavior from code, tests, or runtime evidence.
2. Identify the specific refactoring target:
   - duplication
   - oversized function or class
   - weak naming
   - mixed responsibilities
   - poor boundaries
   - dead or obsolete code
3. State what must remain behaviorally identical.
4. Implement in small steps.
5. Re-verify affected call sites, types, and tests.
6. Remove dead code only after confirming no live path depends on it.

## Refactoring Checklist

- current behavior understood
- target smell or structural issue named
- scope bounded
- public API impact checked
- consumer impact checked
- tests and type boundaries checked
- dead code decision justified

## Output Format

Return:

- Refactoring target
- Behavior preserved
- Main structural improvements
- Verification performed
- Residual risk

## Prohibitions

Do not use refactoring as cover for speculative redesign.
Do not combine cleanup and product behavior change without stating both clearly.
