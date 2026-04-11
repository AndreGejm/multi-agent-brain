# scripts

This directory contains tracked local helper utilities that sit on top of the
main runtime without becoming new authorities.

## Tracked scripts

### `launch-brain-cli.mjs`

Stable Node launcher for the tracked CLI adapter.

What it does:

- resolves the repo root from the script location
- ensures `apps/brain-cli/dist/main.js` exists
- runs `corepack pnpm build` only when the built CLI entrypoint is missing
- launches the built CLI with Node

Typical use:

- local fallback when MCP is unavailable
- backing the `mab` and `multiagentbrain` Windows launchers
- exposing `multiagentbrain doctor --json` without requiring repo-relative commands

### `launch-brain-mcp.mjs`

Stable Node launcher for the tracked MCP adapter.

What it does:

- resolves the repo root from the script location
- ensures `apps/brain-mcp/dist/main.js` exists
- runs `corepack pnpm build` only when the built MCP entrypoint is missing
- launches the built MCP server with Node

Typical use:

- backing the default Codex MCP configuration
- local command-based MCP setup without repo-relative `cwd` assumptions

### `install-default-codex-mcp.mjs`

Windows-oriented installer for the current user's Codex MCP config.

What it does:

- reads `%USERPROFILE%\\.codex\\config.toml`
- upserts an `mcp_servers.multiagentbrain` entry
- points that entry at `scripts/launch-brain-mcp.mjs`
- creates a timestamped backup before writing

Useful flags:

- `--dry-run`
- `--config <path>`
- `--manifest <path>`
- `--server-name <name>`

### `install-multiagentbrain-launchers.mjs`

Windows-oriented installer for global CLI launchers.

What it does:

- writes `multiagentbrain.cmd` and `mab.cmd`
- defaults to `%APPDATA%\\npm`
- points both launchers at `scripts/launch-brain-cli.mjs`

Useful flags:

- `--dry-run`
- `--bin-dir <path>`
- `--manifest <path>`

### `doctor-default-access.mjs`

Machine-readable detectability probe for default MultiAgentBrain access.

What it does:

- checks whether the tracked CLI and MCP wrappers exist
- checks whether the built CLI and MCP entrypoints exist
- checks whether the configured Codex MCP server is present
- checks whether the launcher shims exist and whether their bin directory is on `PATH`
- checks whether the fixed install manifest exists and is valid

Useful flags:

- `--json`
- `--repo-root <path>`
- `--config <path>`
- `--bin-dir <path>`
- `--manifest <path>`
- `--server-name <name>`

### `install-default-access.mjs`

Unified installer/repair path for the default-access contract.

What it does:

- upserts the Codex MCP server config
- installs the Windows launcher shims
- writes the fixed install manifest
- prints the resulting detectability report

Useful flags:

- `--dry-run`
- `--repo-root <path>`
- `--config <path>`
- `--bin-dir <path>`
- `--manifest <path>`
- `--server-name <name>`

### `review-note-gui.py`

Windows-only local Tkinter reviewer for the governed note review queue.

What it does:

- lists the governed review queue
- reads one review note at a time with body, warnings, and provenance
- sends `Accept`
- sends `Reject`
- refreshes and repositions the queue after actions

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

Operational notes:

- the queue shown by this GUI is the same governed queue exposed by `list-review-queue`
- the status bar reports canonical or archived paths when the backend returns them
- drafts moved to `_promoted` or `_rejected` history are no longer part of the default active queue view

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
