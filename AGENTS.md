# AGENTS.md

## 1. SCOPE AND AUTHORITY
- Follow higher-priority instructions, the user's requested outcome, and the nearest repository-specific `AGENTS.md` that applies to the files being changed.
- Stay within the requested scope. Do not turn a review, audit, explanation, or diagnosis into a mutation unless implementation was requested.
- Execute safe, reversible actions directly implied by the task. Ask before irreversible, externally visible, security-sensitive, or materially scope-expanding actions.
- Make routine implementation choices autonomously. Ask only when ambiguity would materially change the result or requires a genuine user preference.

## 2. WORKFLOW
- **Task Loop**: Understand -> plan when useful -> implement or investigate -> verify -> review -> fix any concrete in-scope gap.
- Diagnose failures end-to-end and retry reasonable fixes before escalating.
- Continue while review identifies a concrete, in-scope gap against the requested outcome or acceptance criteria. Passing the relevant checks with no such gap is completion.
- Treat rejected experiments as evidence: record the constraint they reveal when durable, then pursue the strongest remaining lead.
- If evidence is weak, tighten the question or gather a better signal. Do not present an unvalidated best-so-far result as final.

## 3. PLANS AND NOTES
- Use `PLAN.md` for non-trivial work with meaningful sequencing, architectural decisions, or complex verification. Simple one- or two-step tasks may skip it.
- Plans must state the goal, acceptance criteria, constraints, and checkable steps. Rewrite them when scope changes and remove stale or unrelated completed plans before reuse.
- Do not generate a new plan merely because the current one is exhausted. Create another pass only when review finds a concrete in-scope gap.
- For non-trivial ongoing work, use the nearest repository-level `NOTES.md`; create it only when persistent task memory is useful. Simple read-only tasks may skip notes.
- Record only concise, durable facts needed by future work: `[Topic] outcome — why/impact`. Do not record routine commands, transient observations, secrets, or facts already captured in code, tests, commits, or documentation.
- Mark unknowns as **pending**, replace them with actual results, and keep notes free of contradictions. Before completion, resolve pending items and prune stale or superseded material.

## 4. CHANGE DISCIPLINE AND SAFETY
- Inspect surrounding code, configuration, and project guidance before editing. Prefer the smallest structurally correct root-cause fix.
- Preserve existing user changes and dirty worktrees. Never discard, overwrite, or reformat unrelated work.
- Avoid destructive Git operations, force pushes, data deletion, credential changes, and external messages unless explicitly authorized.
- Do not expose secrets in commands, logs, notes, patches, or responses.
- Avoid unrelated cleanup, speculative refactoring, defensive bloat, new files, or dependencies. Refactor only when it materially improves the requested change or is necessary for correctness.
- Anticipate knock-on effects across callers, scripts, data flows, interfaces, and deployment paths.

## 5. VERIFICATION
- Verification must be proportional to risk and use the project's documented or native checks.
- Test the changed behavior, inspect the final diff, and distinguish failures introduced by the change from pre-existing failures. Do not repair unrelated failures unless they prevent verification of the requested outcome.
- Add or update tests when they provide meaningful regression protection; not every change requires an end-to-end test.
- For Python, follow the project's configured lint workflow. Run Ruff on the changed scope when available; apply `--fix` only for safe, relevant findings, then rerun the non-mutating check.
- Never claim completion without evidence. If a check cannot run, state exactly why, what was verified instead, and the remaining risk.

## 6. SUBAGENTS
- Use subagents for independent parallel research, heavy discovery, or ambiguity reduction; do not spawn them for trivial work.
- Give each subagent one bounded task and one owner per file. Never allow parallel writes to the same file.
- Pass only the context needed. Require concise summaries of findings, decisions, risks, and file paths rather than raw logs.

## 7. COMMUNICATION
- Lead with the outcome and use concise Markdown.
- Avoid narrating routine steps or parking at milestones. For long-running work, provide a brief update when assumptions change, meaningful risk appears, or the user would otherwise wait without useful context.
- When blocked, report the exact blocker, evidence, attempted remedies, and the user action needed.
- When asked what changed, describe the resulting behavior and verification rather than a command-by-command process log.

## 8. DEFINITION OF DONE
A task is complete when the requested outcome and acceptance criteria are satisfied, relevant checks pass or documented limitations are explained, the final diff contains no unintended changes, and review finds no remaining concrete in-scope action.
