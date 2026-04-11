# brain-cli

CLI adapter over the shared runtime container.

## Entrypoint

- `apps/brain-cli/src/main.ts`

## Commands

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

## Input behavior

- payload-bearing commands accept exactly one of `--stdin`, `--input <path>`, or `--json <payload>`
- `version` and `auth-status` do not require payloads
- `auth-issued-tokens`, `freshness-status`, and `create-refresh-drafts` accept optional payloads
- output is always JSON

## Run

```bash
corepack pnpm cli -- version
corepack pnpm cli -- auth-status
corepack pnpm cli -- list-review-queue --json "{}"
```

Preferred note-authoring path for other workspaces:

```bash
corepack pnpm cli -- capture-note --input request.json
```

Use `capture-note` when the caller wants the orchestrator to classify and stage
the note in one step. Use `classify-note-ingress` only when you need the
governed classification result without creating a draft, and use `draft-note`
only when you are deliberately working with the lower-level staging contract.

## Canonical docs

- `docs/reference/interfaces.md`
- `docs/setup/development-workflow.md`

## Evidence status

### Verified facts

- This README is based on `apps/brain-cli/src/main.ts`

### Assumptions

- None

### TODO gaps

- If commands change, update this file and `docs/reference/interfaces.md` together
