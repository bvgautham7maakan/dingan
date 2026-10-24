# 0001 – Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-24
- **Deciders:** Gautham

## Context

Decisions on the KEM platform and supporting setup are spread across prompts, chats and commit messages. Later it is hard to see *why* something was chosen.

## Decision

Keep Architecture Decision Records (ADRs) in `docs/adr/`, one Markdown file per significant decision, using `template.md` (MADR-style). No tooling required.

## Rules

| Rule | Detail |
|---|---|
| File name | `NNNN-short-title.md`, numbered in order |
| Scope | Significant choices only (stack, data model, hosting, security). Not a changelog. |
| Changes | Never rewrite an accepted ADR. Add a new one and mark the old one `Superseded by NNNN`. |
| Index | Add every ADR to `README.md` in this folder. |

## Consequences

| Type | Effect |
|---|---|
| Good | Reasoning lives next to the code and its history is visible in git |
| Cost | A few minutes per decision |
