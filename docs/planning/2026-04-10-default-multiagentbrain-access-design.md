# Default MultiAgentBrain Access Design

## Problem

MultiAgentBrain exists as a real shared memory runtime, but agents in other
workspaces do not discover it by default. They often fall back to repo hunting,
incorrect local orchestrators, or "memory unavailable" behavior because:

- no machine-wide MultiAgentBrain MCP server is mounted by default
- no stable global launcher command exists
- the fallback path is not explicit in the Superpowers memory skills

This creates avoidable memory misses and reduces note submission quality.

## Goals

- make MultiAgentBrain visible by default in Codex threads on this machine
- provide a stable fallback launcher that does not require repo-path recall
- document and encode an explicit fallback locator in Superpowers skills
- keep the runtime source of truth inside the existing MultiAgentBrain repo
- avoid duplicating orchestration logic in frontends or wrappers

## Non-goals

- redesigning the MultiAgentBrain runtime itself
- adding a second memory store
- making every external agent client auto-configure itself beyond supported
  local installer surfaces
- silently mutating machine-wide config during normal repo builds

## Chosen Design

Implement three layers, in priority order:

1. Codex machine-wide default MCP installer
2. global CLI launcher installer
3. explicit fallback locator in the Superpowers memory protocol

### 1. Codex machine-wide default MCP installer

Add a tracked installer that updates the current user's Codex config file at:

- `C:\Users\<user>\.codex\config.toml`

It should upsert a `multiagentbrain` MCP server entry that launches a tracked
repo wrapper script instead of embedding fragile repo-relative command logic
directly in the config file.

The Codex MCP entry should call a stable wrapper inside the repo, not `pnpm mcp`
with an implicit working directory.

### 2. Stable launcher wrappers

Add tracked Node-based wrapper scripts inside `scripts/`:

- one for CLI access
- one for MCP server access

These wrappers should:

- resolve the repo root from the script location
- ensure the relevant built entrypoint exists
- run `corepack pnpm build` only when the required built entrypoint is missing
- launch the correct built file with `node`

Add a launcher installer that writes global Windows command wrappers into a
user-level bin directory already suited for command shims.

The launcher goal is:

- `multiagentbrain ...`
- `mab ...`

Both should delegate to the same tracked CLI wrapper.

### 3. Superpowers fallback locator

Update the Superpowers memory protocol so that when no visible MultiAgentBrain
capability exists, the fallback is deterministic rather than vague.

The skill should explicitly provide:

- canonical repo path:
  - `F:\Dev\scripts\MultiagentBrain\multi-agent-brain`
- preferred default access path:
  - machine-wide Codex MCP server named `multiagentbrain`
- fallback launcher commands:
  - `multiagentbrain`
  - `mab`
- last-resort repo-local command shape:
  - `corepack pnpm cli -- <command>` from the repo root

## File Responsibilities

### MultiAgentBrain repo

- `scripts/launch-brain-cli.mjs`
  - stable CLI wrapper
- `scripts/launch-brain-mcp.mjs`
  - stable MCP wrapper
- `scripts/install-default-codex-mcp.mjs`
  - upsert Codex MCP config
- `scripts/install-multiagentbrain-launchers.mjs`
  - install `mab` and `multiagentbrain` shims
- `scripts/lib/default-access.mjs`
  - shared path, wrapper, and config rendering helpers
- `tests/e2e/default-access-scripts.test.mjs`
  - verifies config patching and launcher rendering
- docs
  - install, running, troubleshooting, repo map, and README updates

### Superpowers repo

- `skills/multiagentbrain-memory-protocol/SKILL.md`
  - explicit deterministic fallback locator
- optionally `skills/using-superpowers/SKILL.md`
  - one-line reminder that the default access path is machine-wide MCP first,
    launcher second

## Expected User Experience

### Best case

In a new Codex thread, MultiAgentBrain is already visible through the machine
MCP config and the availability gate succeeds immediately.

### Fallback case

If the machine-wide MCP server is missing or broken, an agent can still call:

- `multiagentbrain`
- `mab`

without remembering the repo path.

### Last resort

If both are missing, the skill text tells the agent exactly where the runtime
lives and how to access it from the repo root.

## Risks

- Codex config patching must be idempotent and preserve unrelated MCP server
  entries
- wrappers must not rebuild on every call
- launcher installation must not assume a user PATH directory that is absent
- docs must be explicit that installer scripts are opt-in and machine-scoped
- skill fallback text must not claim machine-wide availability if installation
  has not happened

## Verification

- unit-style tests for config upsert and launcher wrapper rendering
- manual smoke test of the CLI wrapper
- manual smoke test of the MCP wrapper
- manual smoke test of the Codex config installer in dry-run or print mode
- documentation updates for install and troubleshooting

## Rollout

1. land tracked wrappers, installers, tests, and docs in the repo
2. update the Superpowers skill fallback text
3. optionally run the installer locally to enable default access in this
   environment
