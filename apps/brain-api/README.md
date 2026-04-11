# brain-api

HTTP adapter over the shared runtime container.

## Entrypoints

- `apps/brain-api/src/main.ts`
- `apps/brain-api/src/server.ts`

## Routes

### Health and system

- `GET /health/live`
- `GET /health/ready`
- `GET /v1/system/auth`
- `GET /v1/system/auth/issued-tokens`
- `POST /v1/system/auth/issue-token`
- `POST /v1/system/auth/introspect-token`
- `POST /v1/system/auth/revoke-token`
- `GET /v1/system/freshness`
- `GET /v1/system/version`

### Retrieval and context

- `POST /v1/context/search`
- `POST /v1/context/tree`
- `POST /v1/context/node`
- `POST /v1/context/packet`
- `POST /v1/context/decision-summary`

### Memory and governance

- `POST /v1/notes/capture`
- `POST /v1/notes/classify-ingress`
- `POST /v1/notes/drafts`
- `POST /v1/notes/drafts/review`
- `POST /v1/review/queue`
- `POST /v1/review/note`
- `POST /v1/review/accept`
- `POST /v1/review/reject`
- `POST /v1/system/freshness/refresh-draft`
- `POST /v1/system/freshness/refresh-drafts`
- `POST /v1/notes/validate`
- `POST /v1/notes/promote`
- `POST /v1/maintenance/import-resource`
- `POST /v1/history/query`
- `POST /v1/history/session-archives`

### Coding

- `POST /v1/coding/execute`

## Behavior

- validates JSON request bodies through shared transport validation
- injects actor defaults from body and `x-brain-*` headers
- delegates into the shared orchestrator or shared services
- exposes liveness and readiness health reports
- maps service/auth/validation failures to HTTP status codes

Preferred note-authoring route for other workspaces:

- `POST /v1/notes/capture`

That route lets the orchestrator classify and stage the note in one request.
Use `POST /v1/notes/classify-ingress` only when classification must be observed
without staging, and keep `POST /v1/notes/drafts` for deliberate low-level
draft contract work.

## Run

```bash
corepack pnpm api
```

## Canonical docs

- `docs/reference/interfaces.md`
- `docs/operations/running.md`
- `docs/operations/troubleshooting.md`

## Evidence status

### Verified facts

- This README is based on `apps/brain-api/src/server.ts`

### Assumptions

- None

### TODO gaps

- If routes change, update this file and `docs/reference/interfaces.md` together
