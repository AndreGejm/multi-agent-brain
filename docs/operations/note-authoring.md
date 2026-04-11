# Note Authoring

This document describes the supported way to create, review, and store notes in
MultiAgentBrain from this repo or from other workspaces on the same machine.

The source of truth for the available surfaces is still:

- `apps/brain-cli/src/main.ts`
- `apps/brain-api/src/server.ts`
- `apps/brain-mcp/src/tool-definitions.ts`

This file explains how those surfaces are intended to be used together.

## Default rule

For ordinary note creation, use the highest-level orchestrator-owned surface:

- `capture-note`

Do not default to:

- `classify-note-ingress` plus `draft-note`
- manual duplicate-search before submission
- reading MAB contracts just to discover payload shapes
- editing staged markdown directly from another workspace as the normal path

Those lower-level surfaces still exist, but they are for inspection,
troubleshooting, or deliberate contract-level work.

## Workflow summary

For a normal cross-workspace memory write, the supported flow is:

1. detect MultiAgentBrain through a mounted capability, `multiagentbrain doctor --json`, or `mab doctor --json`
2. gather durable content plus real supporting sources
3. submit the candidate through `capture-note`
4. if a draft is staged, inspect it through `read-review-note`
5. finish through `accept-note` or `reject-note`

That keeps note-worthiness, duplicate handling, review state, archival,
promotion, and verification inside the orchestrator.

## Surface matrix

| Surface | Use it for | Do not treat it as |
| --- | --- | --- |
| `capture-note` | ordinary note submission from other workspaces, tools, or plugins | a thin wrapper over manual preflight plus direct draft patching |
| `classify-note-ingress` | preflight classification without staging | the default write path |
| `draft-note` | low-level staging or contract debugging | the normal note submission command |
| `list-review-queue` | loading the governed review queue | a raw directory listing of every markdown file in staging |
| `read-review-note` | reading a staged draft with review metadata and provenance | a generic file read replacement |
| `accept-note` | governed publish flow | a simple alias for `promote-note` |
| `reject-note` | governed reject-plus-archive flow | local file deletion |
| `review-draft-note` | low-level review state changes | the preferred frontend button contract |
| `promote-note` | lower-level operator/debugging flow after review metadata exists | the default accept button target |

## Detect MultiAgentBrain first

Preferred discovery order from another workspace:

1. mounted MCP/tool/app capability for MultiAgentBrain
2. `multiagentbrain doctor --json`
3. `mab doctor --json`
4. `%USERPROFILE%\.multiagentbrain\installation.json`
5. repo-local fallback in `F:\Dev\scripts\MultiagentBrain\multi-agent-brain`

If the launcher probe reports `healthy` or `degraded`, treat MultiAgentBrain as
available and use the stable launcher or mounted capability instead of inventing
another repo-local path.

## Supported authoring flow

### 1. Gather durable content

Before submission, gather:

- the durable fact, workflow, or decision
- the likely corpus and scope
- real supporting sources
- source basis such as `repo_inspection`, `direct_observation`, or `retrieved_note`

Do not invent provenance.

### 2. Submit through `capture-note`

Preferred CLI form:

```bash
multiagentbrain capture-note --input request.json
```

Equivalent repo-local fallback:

```bash
corepack pnpm cli -- capture-note --input request.json
```

Preferred request shape:

- `title`
- `sourcePrompt`
- `supportingSources`
- `targetCorpus` when you already know it
- `noteType` when you already know it
- `scopeHint`
- `candidateSummary`
- `sourceBasis`
- `body` when you already know the durable markdown content
- `bodyHints` only when you need drafting help

Why `body` matters:

- it avoids low-quality provider fallback text
- it keeps note quality under caller control
- it removes the need to patch staged markdown afterward

Example request payload for the CLI:

```json
{
  "title": "orchestrator-owned note review keeps frontends thin",
  "sourcePrompt": "Record that ordinary workspaces and local review UIs should submit durable note candidates through capture-note and finish review through queue/read/accept/reject rather than stitching together low-level review commands.",
  "supportingSources": [
    {
      "noteId": "source-note-authoring-doc",
      "notePath": "F:/Dev/scripts/MultiagentBrain/multi-agent-brain/docs/operations/note-authoring.md",
      "headingPath": ["Review flow"],
      "excerpt": "Once a draft exists, the preferred review surfaces are list-review-queue, read-review-note, accept-note, and reject-note."
    }
  ],
  "targetCorpus": "general_notes",
  "noteType": "policy",
  "scopeHint": "machine/cross-workspace-memory",
  "candidateSummary": "Thin frontends should submit and review notes through the orchestrator-owned capture and review surfaces.",
  "sourceBasis": ["repo_inspection", "direct_observation"],
  "body": "## Context\nOperators and other workspaces need a stable write path that does not require low-level review choreography.\n\n## Decision\nUse capture-note for ordinary note submission and use list-review-queue, read-review-note, accept-note, and reject-note for review.\n\n## Implications\nFrontends stay thin and the orchestrator remains the only authority for state transitions, archival, promotion, and verification."
}
```

Run it with either:

```bash
multiagentbrain capture-note --input request.json
```

or:

```bash
corepack pnpm cli -- capture-note --input request.json
```

### 3. Interpret the result

`capture-note` classifies the candidate and only stages a draft when the
governed ingress result is `draft_candidate`.

Normal outcomes:

- `staged: false` with classification such as `reject`, `session_only`, `merge_candidate`, or `rewrite_required`
- `staged: true` with a `draft` payload

Do not force a note when the ingress decision says not to.

Typical non-staging result shape:

```json
{
  "classification": {
    "contractVersion": "note-ingress.v1",
    "action": "rewrite_required",
    "noteType": "policy",
    "targetCorpus": "general_notes",
    "scope": "machine/cross-workspace-memory",
    "durability": "durable",
    "reviewRequired": true,
    "promotionEligible": false,
    "rejectionReasons": [],
    "mergeHints": []
  },
  "staged": false
}
```

Typical staged result shape:

```json
{
  "classification": {
    "contractVersion": "note-ingress.v1",
    "action": "draft_candidate",
    "noteType": "policy",
    "targetCorpus": "general_notes",
    "scope": "machine/cross-workspace-memory",
    "durability": "durable",
    "reviewRequired": true,
    "promotionEligible": false
  },
  "staged": true,
  "draft": {
    "draftNoteId": "12345678-1234-1234-1234-123456789abc",
    "lifecycleState": "draft",
    "draftPath": "F:/Dev/scripts/MultiagentBrain/multi-agent-brain/vault/staging/general_notes/example-note.md",
    "frontmatter": {
      "title": "orchestrator-owned note review keeps frontends thin"
    },
    "warnings": []
  }
}
```

The exact `classification` object is the governed ingress response. The exact
`draft` object is the normal `draft-note` response shape reused by
`capture-note`.

## Review flow

Once a draft exists, the preferred review surfaces are:

- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`

These keep the UI or calling workspace thin while the orchestrator owns:

- review state transitions
- archive movement
- promotion
- canonical write verification
- retrieval verification reporting

CLI queue example:

```bash
multiagentbrain list-review-queue --json "{}"
```

Queue items include:

- `draftNoteId`
- `title`
- `targetCorpus`
- `scope`
- `noteType`
- `updatedAt`
- `reviewState`
- `authorityRisk`
- `warningSummary`

Read one staged draft:

```bash
multiagentbrain read-review-note --json "{\"draftNoteId\":\"<draft-note-id>\"}"
```

The read response includes:

- `draftPath`
- `body`
- `provenance`
- `warnings`
- `reviewState`
- `promotionEligible`

This is why generic namespace or file reads are not enough for a real reviewer.
The review surface carries review metadata, warnings, and governed provenance in
one response.

### Accept

`accept-note` performs the governed happy path:

1. reviewability check
2. approval if needed
3. promotion-ready transition if needed
4. promotion
5. canonical write verification
6. retrieval verification reporting

CLI example:

```bash
multiagentbrain accept-note --json "{\"draftNoteId\":\"<draft-note-id>\"}"
```

Important response fields:

- `accepted`
- `finalReviewState`
- `promotedNoteId`
- `canonicalPath`
- `archivedDraftPath`
- `steps`
- `retrievalWarning`

### Reject

`reject-note` is the preferred non-publish path. It records rejection through
the orchestrator-owned workflow and archives the draft out of the active queue.

CLI example:

```bash
multiagentbrain reject-note --json "{\"draftNoteId\":\"<draft-note-id>\",\"reviewNotes\":\"Duplicate of an existing canonical note.\"}"
```

Important response fields:

- `finalReviewState`
- `archivedPath`
- `steps`

### Queue visibility

The review queue is intentionally narrower than "all markdown files under
staging".

By default it excludes:

- promoted drafts
- superseded drafts
- rejected drafts that have already been archived under `_rejected`

If you want to inspect rejected items through the queue contract, request them
explicitly:

```bash
multiagentbrain list-review-queue --json "{\"includeRejected\":true}"
```

## When to use lower-level surfaces

Use `classify-note-ingress` separately only when:

- you explicitly need the governed classification result without staging a draft
- you are testing ingress behavior
- you are debugging note-worthiness or provenance behavior

Use `draft-note` separately only when:

- you are deliberately exercising the lower-level governed draft contract
- you are debugging server-side reclassification, validation, or staging behavior

Do not teach ordinary workspaces to use those lower-level calls as the default
authoring path.

Use `review-draft-note` plus `promote-note` separately only when:

- you are debugging review-state transitions
- you are testing policy behavior around `approve_draft` or `set_promotion_ready`
- you are operating below the thin-frontend contract on purpose

That is a lower-level workflow, not the recommended UI contract.

## Canonical and staging locations

On this Windows machine, the default canonical root is:

- `F:\Dev\AI Context Brain`

Important subpaths:

- canonical general notes: `F:\Dev\AI Context Brain\general_notes`
- repo-local staging drafts: `F:\Dev\scripts\MultiagentBrain\multi-agent-brain\vault\staging`
- promoted staging history: `F:\Dev\scripts\MultiagentBrain\multi-agent-brain\vault\staging\<corpus>\_promoted`
- rejected staging history: `F:\Dev\scripts\MultiagentBrain\multi-agent-brain\vault\staging\<corpus>\_rejected`

If `MAB_VAULT_ROOT` is overridden, canonical paths will follow that root instead.

Operationally:

- a newly staged draft first lives in the active staging corpus folder
- `accept-note` promotes the note into canonical storage and may also archive the staging draft under `_promoted`
- `reject-note` archives the staging draft under `_rejected`

If a note "disappears" from the queue after accept or reject, that is usually
the expected result of the governed archive or promotion flow rather than a lost
file.

## Thin review frontends

The supported thin frontends in this repo are:

- Windows Tkinter reviewer: `scripts/review-note-gui.py`
- local Obsidian plugin: `integrations/obsidian/multi-agent-brain-review`

Both frontends intentionally use the same backend contract:

- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`

They do not:

- move files directly
- compute their own promotion state machine
- write canonical memory without the orchestrator

## Anti-patterns

Avoid these behaviors:

- manual duplicate-search as a prerequisite for note submission
- reading MAB source contracts during ordinary note capture to reverse-engineer payload shapes
- patching staged markdown directly from another workspace as the normal workflow
- treating CLI transport as "not the orchestrator"
- using `promote-note` directly from ordinary review UIs instead of `accept-note`
- treating `list-context-tree` or `read-context-node` as substitutes for the review contract
- assuming the presence of markdown files under staging means they must be shown in the active review queue

## Related docs

- `docs/reference/interfaces.md`
- `docs/operations/running.md`
- `docs/operations/troubleshooting.md`
- `docs/reference/env-vars.md`

## Evidence status

### Verified facts

- This document is grounded in the tracked CLI, HTTP, and MCP adapters plus the
  orchestrator-owned review workflow currently implemented in code.

### Assumptions

- None

### TODO gaps

- If a new high-level authoring surface replaces `capture-note`, update this
  file and `docs/reference/interfaces.md` together.
