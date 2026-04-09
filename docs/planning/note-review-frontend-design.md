# Note Review Frontend Design

**Date:** 2026-04-09  
**Status:** Draft for review  
**Scope:** Minimal operator review workflow for a Windows Tkinter client now and an Obsidian plugin later

## Goal

Provide two thin review frontends over one governed backend workflow:

- a Windows-only Tkinter reviewer now
- an Obsidian plugin later

Both frontends must stay thin operator shells. They should present a simple review experience:

- `Previous`
- `Next`
- `Accept`
- `Reject`

The frontends must not implement multi-step note workflow logic, must not move files directly, and must not become competing authorities over note state.

## Product Decision

The orchestrator is the single authority for review workflow, file movement, state transitions, indexing, and verification.

Frontends only do three things:

1. list notes in the active review queue
2. display one note and its review metadata
3. submit operator intent with `Accept` or `Reject`

This keeps the human workflow minimal while preserving the governed backend model already in the runtime.

## Shared Responsibility Split

### Frontend responsibility

Both Tkinter and the future Obsidian plugin are operator shells.

They may:

- request the active review queue
- request one note’s review payload
- submit `Accept`
- submit `Reject`
- show progress, warnings, and results

They must not:

- call low-level review and promotion steps one-by-one
- move or archive files directly
- inspect raw staging and canonical folders to decide queue state
- invent their own verification rules
- define their own meaning of “accepted”

### Orchestrator responsibility

The orchestrator owns the full governed workflow.

It must:

- decide what is in the active review queue
- return a complete review payload for one note
- execute the entire accept flow
- execute the entire reject flow
- persist review state and audit trail
- move notes between active and archived/rejected storage
- perform canonical promotion
- perform indexing and context regeneration
- report verification status back to the frontend

## Why Accept Must Not Be A Frontend Macro

`Accept` must not mean that Tkinter or Obsidian manually calls:

1. `approve_draft`
2. `set_promotion_ready`
3. `promote-note`

That would make each frontend responsible for backend semantics, partial-failure handling, and workflow ordering.

If the frontends became macros over low-level commands, they would each need to decide:

- when an item is still reviewable
- how to handle partial success
- which failure state to show
- how to recover from revision mismatch
- when verification is “good enough”

That would create two competing workflow implementations on top of the orchestrator. Over time, Tkinter and Obsidian would drift.

The correct shape is:

- frontend sends `Accept`
- orchestrator executes the governed accept flow
- frontend shows backend progress and result

## Why Generic Context Commands Are Too Weak

Generic commands such as `list-context-tree` and `read-context-node` are namespace and discovery surfaces, not review surfaces.

They are too weak for a real reviewer because they do not define:

- which notes belong in the active queue
- which notes are hidden because they are rejected or archived
- what review metadata should appear beside the note content
- what warnings or queue-specific status should be shown
- what exact note body and revision the operator is reviewing

For a real reviewer, the backend needs a dedicated review payload that combines:

- note identity
- note metadata
- review metadata
- queue status
- note body
- warnings relevant to review

Without that, the frontend would have to compose its own review model from generic primitives, which breaks the thin-shell requirement.

## Required Backend Review Contract

The backend should expose a first-class review contract for both frontends.

### `list-review-queue`

Returns the active review queue.

Each item should include enough information to populate a queue or note header:

- `draftNoteId`
- `title`
- `targetCorpus`
- `scope`
- `noteType`
- `updatedAt`
- `reviewState`
- `authorityRisk`
- optional warning summary

This command defines queue membership once, in one place.

### `read-review-note`

Returns the full review payload for one note.

It should include:

- note identity and file path
- current review metadata
- provenance summary
- duplicate/merge warning summary if present
- current draft body as Markdown text
- any relevant warnings for operator review

This command gives the frontend one authoritative payload instead of making it stitch together raw node data and file reads.

### `accept-note`

Accept means:

> “I reviewed this note and want the system to move it into long-term memory now.”

`accept-note` must be a single orchestrated command.

Internally, the orchestrator may perform:

- reviewability checks
- `approve_draft`
- `set_promotion_ready`
- `promote-note`
- canonical-write verification
- indexing and representation regeneration
- optional retrieval verification

But those are backend details. The frontend should only know that `Accept` was requested and whether it succeeded, partially succeeded, or failed.

### `reject-note`

Reject means:

> “This note must not be promoted and should leave the active review queue.”

`reject-note` must be a single orchestrated command.

Internally, the orchestrator must:

- validate that the note is still rejectable
- record rejection metadata and audit trail
- remove it from the active queue
- archive or otherwise preserve the note in historical storage

The frontend should not move files or simulate rejection semantics on its own.

## Why Reject And Archive Should Be Merged In V1

For the minimal v1, separate `Reject` and `Archive` create extra state and extra operator decisions without adding much value.

If both actions exist immediately, the system must explain:

- when to reject instead of archive
- whether archive is neutral or judgmental
- how archive affects review history
- how queue visibility differs between the two

That is unnecessary complexity for the first version.

For v1, `Reject` should include archive/hide behavior:

- note is marked rejected
- note leaves the active queue
- note body and history are preserved
- note remains visible in historical storage or future rejected views

This gives the operator exactly two meaningful actions:

- `Accept`
- `Reject`

A separate neutral `Archive` action can be added later if real operator use shows the need.

## Why Retrieval Verification Should Be Backend Reporting

Promotion already owns the real publication work:

- canonical write
- chunking
- lexical/vector index updates
- context representation regeneration

Because the backend already performs those steps, the backend is also the right place to report whether publication completed cleanly.

The frontend should not run its own custom follow-up retrieval checks because that would create inconsistent definitions of success across Tkinter and Obsidian.

Instead:

- backend executes consistent verification
- backend returns structured result and warnings
- frontend shows the result

For v1, canonical-write verification is required.
Retrieval verification may be included as backend warning/reporting, but it should not become frontend-owned logic.

## Minimal V1 User Experience

### Main window

The Tkinter client should show:

- current note title
- draft note id
- short metadata strip
- main Markdown/plain-text content pane
- queue position indicator
- buttons:
  - `Previous`
  - `Next`
  - `Accept`
  - `Reject`
- small status/progress area

The future Obsidian plugin should expose the same actions and same backend contract, but can choose a more native Obsidian presentation later.

### Operator behavior

The operator flow is intentionally simple:

1. open next note
2. read it
3. click `Accept` or `Reject`
4. see progress and result
5. move to the next note automatically on success

No inline editing is required in v1.
No direct file manipulation is allowed in v1.

## Functional Requirements

### FR1. Queue listing

The backend shall expose `list-review-queue`.

The frontend shall use that command, not filesystem scanning, to determine what is reviewable.

### FR2. Note detail payload

The backend shall expose `read-review-note`.

The frontend shall use that command to load the note body plus review metadata in one request.

### FR3. Single-action accept

The backend shall expose `accept-note`.

The frontend shall send a single accept intent and shall not manually sequence low-level review and promotion commands.

### FR4. Single-action reject

The backend shall expose `reject-note`.

The frontend shall send a single reject intent and shall not move files directly.

### FR5. Reject removes from active queue and preserves history

`reject-note` shall remove the note from the active queue while preserving the note body, note id, and review history in backend-controlled storage.

### FR6. Honest progress reporting

Both `accept-note` and `reject-note` shall return structured progress and result information suitable for UI display.

### FR7. Navigation

The frontend shall provide `Previous` and `Next` without altering note state.

### FR8. Thin frontend

Neither Tkinter nor the future Obsidian plugin shall implement backend workflow semantics, file moves, or publication verification logic.

## Non-Functional Requirements

### NFR1. Windows-first v1

The initial implementation only needs to support Windows for the Tkinter client.

### NFR2. Shared contract

The same backend review contract must support both frontends.

### NFR3. No competing authorities

The orchestrator remains the single authority for review workflow, archival, promotion, and verification.

### NFR4. Safe partial failure reporting

If `accept-note` partially succeeds, the backend must report which internal stage failed and what final note state remains.

### NFR5. No direct frontend file operations

Frontends must not move staged notes, create canonical notes, or archive rejected notes directly.

## Backend Result Shape

The exact transport schema can be designed later, but the backend responses must distinguish:

- `success`
- `partial_success`
- `failure`

### `accept-note` result should report

- note id
- final review state
- whether canonical write succeeded
- whether indexing/regeneration succeeded
- whether retrieval verification produced a warning
- canonical path when successful
- error details when unsuccessful

### `reject-note` result should report

- note id
- final review state
- whether archival/hide completed
- historical location or status marker
- error details when unsuccessful

## Archive Model For V1

Archive is not a separate operator action in v1.

Instead, rejection implies archival preservation:

- preserve note markdown
- preserve note id
- preserve review metadata
- remove from active queue
- keep historically discoverable under backend control

The exact archive folder or storage implementation is a backend detail and should not be owned by the UI.

## Out Of Scope

These are out of scope for v1:

- separate neutral `Archive` button
- inline note editing
- multi-user review coordination
- browser-hosted remote UI
- GUI-managed filesystem operations
- frontend-owned verification logic
- truth/fact checking beyond current governed backend behavior

## Success Criteria

This design is successful when:

1. Tkinter can review one note at a time with `Previous`, `Next`, `Accept`, and `Reject`
2. `Accept` is one frontend action and one backend command
3. `Reject` is one frontend action and one backend command
4. rejected notes leave the active queue but remain preserved historically
5. frontends do not move files or implement low-level workflow logic
6. the same backend contract can later support an Obsidian plugin without semantic drift

## Implementation Recommendation

Implement this in three layers:

1. add the backend review contract first
2. build the Tkinter client as the first thin frontend over that contract
3. build the Obsidian plugin later on the same contract

The backend contract should be stabilized before frontend behavior grows beyond the minimal review flow.

## Questions For Review

1. Is `Reject = reject and preserve historically` the right v1 meaning?
2. Do you want the Tkinter client to show a queue list plus current note, or just one current note with a queue position indicator in v1?
3. Is canonical-write success enough for the default success message, with retrieval verification shown only as backend warning detail?
