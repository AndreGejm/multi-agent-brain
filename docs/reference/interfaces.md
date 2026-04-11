# Interfaces

This document lists the externally reachable interfaces that are implemented in tracked code.

## HTTP API

Source of truth: `apps/brain-api/src/server.ts`

### Health and system

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health/live` | liveness and degraded-state health |
| `GET` | `/health/ready` | readiness health |
| `GET` | `/v1/system/auth` | auth registry summary plus issued-token summary |
| `GET` | `/v1/system/auth/issued-tokens` | issued-token listing |
| `POST` | `/v1/system/auth/issue-token` | centrally issue actor tokens |
| `POST` | `/v1/system/auth/introspect-token` | inspect token validity and authorization |
| `POST` | `/v1/system/auth/revoke-token` | revoke issued tokens |
| `GET` | `/v1/system/freshness` | temporal validity report |
| `GET` | `/v1/system/version` | release metadata |

### Retrieval and context

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/context/search` | bounded retrieval |
| `POST` | `/v1/context/tree` | namespace tree listing |
| `POST` | `/v1/context/node` | namespace node read |
| `POST` | `/v1/context/packet` | direct context-packet assembly |
| `POST` | `/v1/context/decision-summary` | decision-focused packet |

### Memory and governance

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/notes/capture` | classify and stage a note candidate through the orchestrator in one step |
| `POST` | `/v1/notes/classify-ingress` | classify a note candidate against the governed ingress contract, including note-type-aware provenance checks |
| `POST` | `/v1/notes/drafts` | create staging drafts; rejects placeholder-only required sections, persists structured provenance (including chunk-level refs), normalizes governed scope/summary metadata, blocks governed duplicate drafts, and rechecks ingress server-side |
| `POST` | `/v1/notes/drafts/review` | record explicit review state, reviewed revision, and promotion eligibility for a staging draft |
| `POST` | `/v1/review/queue` | list the thin-frontend review queue |
| `POST` | `/v1/review/note` | read one staged review payload including body and governed metadata |
| `POST` | `/v1/review/accept` | accept a staged review note through the orchestrator-owned review and promotion flow |
| `POST` | `/v1/review/reject` | reject and archive a staged review note through the orchestrator-owned review flow |
| `POST` | `/v1/system/freshness/refresh-draft` | create one governed refresh draft |
| `POST` | `/v1/system/freshness/refresh-drafts` | create a bounded refresh-draft batch |
| `POST` | `/v1/notes/validate` | deterministic validation |
| `POST` | `/v1/notes/promote` | promote a staging draft that is already `promotion_ready` and still matches the reviewed revision |
| `POST` | `/v1/maintenance/import-resource` | record an import job |
| `POST` | `/v1/history/query` | bounded audit history query |
| `POST` | `/v1/history/session-archives` | create session archives |

### Coding

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/coding/execute` | execute a coding-domain task through the Python bridge |

## CLI

Source of truth: `apps/brain-cli/src/main.ts`

### Commands

- `version`
- `auth-status`
- `auth-issued-tokens`
- `auth-introspect-token`
- `freshness-status`
- `issue-auth-token`
- `revoke-auth-token`
- `execute-coding-task`
- `search-context`
- `list-context-tree`
- `read-context-node`
- `get-context-packet`
- `fetch-decision-summary`
- `capture-note`
- `classify-note-ingress`
- `draft-note`
- `review-draft-note`
- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`
- `create-refresh-draft`
- `create-refresh-drafts`
- `validate-note`
- `promote-note`
- `import-resource`
- `query-history`
- `create-session-archive`

### Payload sources

Commands read JSON from exactly one of:

- `--stdin`
- `--input <path>`
- `--json <payload>`

Commands with no required payload:

- `version`
- `auth-status`

Commands with optional payload:

- `auth-issued-tokens`
- `freshness-status`
- `create-refresh-drafts`

From the workspace root, the verified invocation form is `corepack pnpm cli -- <command>`.

### Preferred authoring workflow

For ordinary note creation from another workspace:

1. `capture-note`
2. if `staged: true`, use `list-review-queue` and `read-review-note`
3. finish through `accept-note` or `reject-note`

Lower-level workflow for deliberate debugging:

1. `classify-note-ingress`
2. `draft-note`
3. `review-draft-note`
4. `promote-note`

The lower-level sequence is still implemented, but it is not the preferred
frontend contract.

## MCP

Source of truth:

- `apps/brain-mcp/src/tool-definitions.ts`
- `apps/brain-mcp/src/main.ts`

### Implemented methods

- `initialize`
- `tools/list`
- `tools/call`

### Implemented tools

- `execute_coding_task`
- `search_context`
- `list_context_tree`
- `read_context_node`
- `get_context_packet`
- `capture_note`
- `classify_note_ingress`
- `create_refresh_draft`
- `create_refresh_drafts`
- `import_resource`
- `draft_note`
- `review_draft_note`
- `list_review_queue`
- `read_review_note`
- `accept_note`
- `reject_note`
- `fetch_decision_summary`
- `validate_note`
- `promote_note`
- `query_history`
- `create_session_archive`

Current ingress contract nuance:

- `capture-note` is the preferred authoring surface for other workspaces; it keeps classification and staging inside one orchestrator-owned call
- `classify_note_ingress` is the authoritative preflight surface for note creation
- `classify_note_ingress` may infer `noteType` and `targetCorpus` from strong candidate signals, but caller-provided values remain hints that the runtime can override or downgrade
- `capture-note` can carry an explicit markdown `body`, so callers do not have to patch staged files when a drafting provider is unavailable
- `draft_note` still reclassifies server-side and may return governed `session_only`, `rewrite_required`, `merge_candidate`, or `reject` outcomes even when a caller skips preflight
- `draft_note` still requires an explicit governed draft request in beta; inference is limited to the classification surface so write semantics do not widen accidentally
- low-information session residue and transcript-like captures are intentionally blocked from becoming durable staging drafts
- thin review frontends should use `list_review_queue`, `read_review_note`, `accept_note`, and `reject_note` instead of stitching together low-level review and promotion commands themselves
- `list_review_queue` is a governed queue view rather than a raw staging directory listing; by default it excludes promoted, superseded, and rejected drafts

## Internal integration surfaces

### Filesystem

- canonical note repository
- staging note repository

### SQLite

- metadata control store
- audit log
- issued token store
- revocation store
- import job store
- session archive store
- context namespace store
- context representation store
- lexical FTS index

### External services

- Qdrant over HTTP
- Docker/Ollama-compatible model endpoint(s) over HTTP
- optional paid OpenAI-compatible endpoint over HTTP

### Local subprocess boundary

- Python subprocess launched by `PythonCodingControllerBridge`

## Known interface consistency risks

- `packages/contracts/src/retrieval/glob-context.contract.ts` and `packages/contracts/src/retrieval/grep-context.contract.ts` exist, but the tracked transport adapters do not expose matching runtime commands or routes

## What is not present

- no tracked webhook receiver
- no tracked queue consumer or producer
- no tracked socket server
- no tracked REST deployment API beyond the local HTTP adapter

## Evidence status

### Verified facts

- Every interface listed here is grounded in tracked adapter code or tracked contracts
- `draft-note` is no longer a purely structural ingress surface; it recomputes the governed note-ingress contract before staging a draft, persists structured provenance for source basis plus supporting note refs (including `chunkId` when present), normalizes the admitted scope, prefers `candidateSummary` for stored summary metadata, and returns `merge_candidate` ingress failures when a duplicate draft identity already exists in the same corpus
- draft review is now explicit runtime metadata, staged draft governance identity is immutable after admission, and `promote-note` only accepts drafts that have been marked `promotion_ready` for the latest reviewed revision
- the first-class review contract now includes queue, read, accept, and reject/archive flows so thin frontends do not need to macro `review-draft-note` plus `promote-note`

### Assumptions

- None

### TODO gaps

- If the retrieval-only contract placeholders become live transport surfaces, update this file and the adapter docs together
