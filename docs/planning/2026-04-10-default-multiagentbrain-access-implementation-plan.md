# Default MultiAgentBrain Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MultiAgentBrain discoverable by default through a machine-wide Codex MCP installer, stable launcher wrappers, and explicit skill fallback guidance.

**Architecture:** Add thin tracked wrapper scripts inside the MultiAgentBrain repo, shared helper logic for config and launcher installation, and a deterministic fallback path in the Superpowers memory skill. Keep runtime authority in the existing CLI and MCP entrypoints.

**Tech Stack:** Node 22, pnpm, plain `.mjs` scripts, Windows command shims, existing CLI/MCP adapters, Markdown docs, Superpowers skills.

---

### Task 1: Add Shared Default-Access Helpers

**Files:**
- Create: `multi-agent-brain/scripts/lib/default-access.mjs`
- Test: `multi-agent-brain/tests/e2e/default-access-scripts.test.mjs`

- [ ] Add path helpers for repo root, built entrypoints, Codex config path, and user npm bin path.
- [ ] Add pure helper functions for:
  - rendering the Codex MCP block
  - upserting the `multiagentbrain` MCP server entry into TOML text
  - rendering `mab.cmd` and `multiagentbrain.cmd`
- [ ] Write tests that prove:
  - inserting a missing MCP server works
  - updating an existing MCP server is idempotent
  - unrelated MCP servers are preserved
  - launcher wrappers render with the expected target script path

### Task 2: Add Stable CLI And MCP Wrapper Scripts

**Files:**
- Create: `multi-agent-brain/scripts/launch-brain-cli.mjs`
- Create: `multi-agent-brain/scripts/launch-brain-mcp.mjs`
- Modify: `multi-agent-brain/scripts/README.md`
- Test: `multi-agent-brain/tests/e2e/default-access-scripts.test.mjs`

- [ ] Implement a CLI wrapper that:
  - resolves repo root from script location
  - checks for `apps/brain-cli/dist/main.js`
  - runs `corepack pnpm build` only if that file is missing
  - launches the built CLI with `node`
- [ ] Implement an MCP wrapper with the same behavior for `apps/brain-mcp/dist/main.js`.
- [ ] Document these wrappers in `scripts/README.md`.
- [ ] Add smoke-oriented tests for helper behavior where practical.

### Task 3: Add Installer Scripts

**Files:**
- Create: `multi-agent-brain/scripts/install-default-codex-mcp.mjs`
- Create: `multi-agent-brain/scripts/install-multiagentbrain-launchers.mjs`
- Modify: `multi-agent-brain/scripts/README.md`
- Test: `multi-agent-brain/tests/e2e/default-access-scripts.test.mjs`

- [ ] Implement a Codex installer script that:
  - reads `C:\Users\<user>\.codex\config.toml`
  - upserts `[mcp_servers.multiagentbrain]`
  - points it at the tracked MCP wrapper script
  - supports a safe preview mode
  - writes a backup before mutating the config file
- [ ] Implement a launcher installer script that:
  - writes `mab.cmd` and `multiagentbrain.cmd`
  - targets the tracked CLI wrapper
  - defaults to `%APPDATA%\\npm`
  - supports a preview mode
- [ ] Document both installers and their expected Windows scope.

### Task 4: Update Documentation

**Files:**
- Modify: `multi-agent-brain/README.md`
- Modify: `multi-agent-brain/docs/setup/installation.md`
- Modify: `multi-agent-brain/docs/operations/running.md`
- Modify: `multi-agent-brain/docs/operations/troubleshooting.md`
- Modify: `multi-agent-brain/docs/reference/repo-map.md`

- [ ] Add a "default access" section to the main README.
- [ ] Document:
  - machine-wide Codex MCP install
  - global launcher install
  - fallback repo-local command shape
- [ ] Add troubleshooting for:
  - missing Node
  - missing built entrypoints
  - stale or malformed Codex config
  - launcher directory not on PATH

### Task 5: Update Superpowers Fallback Instructions

**Files:**
- Modify: `F:/Dev/scripts/Superpowers/skills/multiagentbrain-memory-protocol/SKILL.md`
- Possibly modify: `F:/Dev/scripts/Superpowers/skills/using-superpowers/SKILL.md`

- [ ] Add explicit fallback locator text covering:
  - the canonical repo path
  - the preferred machine-wide MCP server name
  - the launcher commands
  - the repo-local `corepack pnpm cli -- <command>` fallback
- [ ] Keep the visible-capability rule intact while making fallback deterministic.

### Task 6: Verify And Summarize

**Files:**
- Modify if needed: the docs or script files above

- [ ] Run the new test file.
- [ ] Run the existing transport-oriented repo suite if the wrapper/docs changes touch shared assumptions.
- [ ] Read back the changed docs and scripts for consistency.
- [ ] Summarize what is implemented vs what still requires a local installer run.
