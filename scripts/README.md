# scripts

This directory contains tracked local helper utilities that sit on top of the
main runtime without becoming new authorities.

## Tracked scripts

### `review-note-gui.py`

Windows-only local Tkinter reviewer for the governed note review queue.

What it does:

- lists the governed review queue
- reads one review note at a time
- sends `Accept`
- sends `Reject`

What it does not do:

- it does not call low-level review or promotion commands directly
- it does not move files directly
- it does not write canonical memory by itself

Backend contract used:

- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`

Runtime expectations:

- a built `brain-cli` at `apps/brain-cli/dist/main.js`
- a working Node executable
- Python with Tkinter available

Supported scope:

- documented and tested as a Windows-local operator tool

Optional environment overrides:

- `MAB_REVIEW_REPO_ROOT`
- `MAB_REVIEW_NODE_EXECUTABLE`

Launch example:

```bash
py -3 scripts/review-note-gui.py
```

## What is not here

- no tracked bootstrap script
- no tracked reindex script
- no tracked release automation script

## Evidence status

### Verified facts

- This file is based on the tracked contents of `scripts/`

### Assumptions

- None

### TODO gaps

- If more helper scripts are added, document who should run them, their expected
  inputs, and whether they mutate staging, canonical data, SQLite state, or
  external services
