---
name: stacked-prs
description: How to split work into a stack of small single-purpose PRs in this repo. Use when a change touches more than one concern or exceeds ~400 changed lines.
---

# Stacked PRs

- Plan the stack before coding: list each PR as one sentence ("Add travel schema and repository", "Add admin travel editor", ...). Typical order: schema/data → server/API → UI → cleanup/removal.
- Each PR must build, lint, typecheck and pass its own E2E specs on its own (run `verify-change` per PR, not only on the top).
- Branch from the previous PR's branch; set the PR base to that branch. Name branches `<area>/<step>`.
- PR description includes `## Stack` with "N of M" and the base branch (see PR #45/#46 for the format).
- When a lower PR changes, rebase the ones above and re-run their checks.
- Never put dependency bumps, formatting churn or unrelated fixes into a stack PR; open a separate PR.
