# Multi-Agent-Brain Review Queue Obsidian Plugin

Thin local Obsidian review shell for the governed Multi-Agent-Brain note review workflow.

## What It Does

- lists the active review queue
- reads one review note at a time
- sends `Accept`
- sends `Reject`

The plugin does **not**:

- call low-level review or promotion steps directly
- move files directly
- implement its own publication workflow

All note state changes remain orchestrator-owned.

## Backend Commands Used

- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`

## Install Locally

1. Build the Multi-Agent-Brain repo:

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
corepack pnpm build
```

2. Copy this folder into your Obsidian vault plugin directory:

```text
.obsidian/plugins/multi-agent-brain-review
```

3. Enable the plugin in Obsidian.

4. Open plugin settings and set:

- `Repo root` (required; no default machine-specific path is baked in)
- `Node executable` if `node` is not already on your PATH

## Operator Flow

- open the review queue from the ribbon icon or command palette
- click `Refresh` whenever you want to reload the active queue without leaving the view
- read the current note
- click `Accept` or `Reject`
- the backend performs the governed workflow

## Notes

- desktop-only
- expects a built local `brain-cli`
- intended to stay as thin as the Tkinter reviewer
