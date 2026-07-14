# 08 — Demo & README

Package the work into a runnable live demo and the leave-behind README, including
the explicit "deliberate scope cuts" section.

## Purpose

Presentation is part of the grade, not an afterthought. The demo is where the
whole thesis lands in one sitting: the same registry serves an autonomous auditor
built from scratch *and* an off-the-shelf coding agent. The README is the backup
and leave-behind — and its scope-cuts section is where the "mentor the team"
judgment gets demonstrated: naming what is synthetic or simplified, and what real
production scale would require differently.

This item builds nothing new; it assembles Work Items 01–07 into something a
stranger can run and understand.

## Scope

**This item covers:**
- A runnable live-demo script: the compliance agent auditing a snippet with
  planted ambiguous cases, walking through its reasoning / tool calls / verdicts,
  then an off-the-shelf coding agent (Claude Code) querying the same MCP tools.
- A README covering what the project is, how to run it, and an explicit
  "deliberate scope cuts" section naming what is synthetic/simplified and what
  production scale would demand.

**This item explicitly does not cover:**
- Any new capability — it packages 01–07 only.
- Remote deployment — that is the Work Item 09 stretch.

## Outcomes

- Someone can clone the repo, run the demo, and see both the from-scratch agent
  and the off-the-shelf agent using the same source of truth.
- The README explains the project and states its deliberate scope cuts and known
  gaps (including auth/identity, named not built).

## Dependencies

- Work Items 01–07.

## Definition of done

- [ ] The demo script runs the agent on a planted snippet end-to-end.
- [ ] The demo shows Claude Code calling the same MCP tools.
- [ ] The README includes a "deliberate scope cuts" section naming synthetic
      simplifications and production-scale differences.
