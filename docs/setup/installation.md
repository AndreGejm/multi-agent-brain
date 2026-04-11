# Installation

This repository is a Node.js monorepo with a vendored Python runtime. Installation is mostly dependency setup plus choosing a runtime profile.

## Prerequisites

### Required

- Node `>=22.0.0`
- `pnpm@10.7.0` (the root `package.json` declares this package manager version)

### Optional, depending on what you want to run

- Python 3 for the vendored coding runtime (`MAB_CODING_RUNTIME_PYTHON_EXECUTABLE` defaults to `py` on Windows and `python3` elsewhere)
- Qdrant if you want the vector index to be reachable
- Docker Model Runner / Ollama-compatible endpoints if you want model-backed drafting, reasoning, reranking, embeddings, or coding flows
- Docker if you want to use `docker/compose.local.yml`

The repo does not include a tracked Python lockfile or packaging manifest. The vendored runtime README lists `fastmcp`, `httpx`, and `pytest` as suggested dependencies.

## Install workspace dependencies

```bash
corepack enable
corepack pnpm install
corepack pnpm build
```

The root package scripts remain the supported installation/build entrypoints.
Tracked helper scripts in `scripts/` are optional operator and default-access
tools, not a required bootstrap layer.

If `corepack enable` cannot install a global `pnpm` shim, run every workspace
command as `corepack pnpm ...` directly.

## Optional default-access installers

If you want MultiAgentBrain to be easier to discover from other workspaces on
this Windows machine, the repo now includes an opt-in unified installer:

```bash
node scripts/install-default-access.mjs
```

What they do:

- `install-default-access.mjs`
  - upserts a `multiagentbrain` MCP server in `%USERPROFILE%\\.codex\\config.toml`
  - installs `multiagentbrain.cmd` and `mab.cmd`
  - defaults launcher installation to `%APPDATA%\\npm`
  - writes a fixed installation manifest to `%USERPROFILE%\\.multiagentbrain\\installation.json`
  - prints a machine-readable detectability report after writing
- `install-default-codex-mcp.mjs`
  - upserts a `multiagentbrain` MCP server in `%USERPROFILE%\\.codex\\config.toml`
  - points it at the tracked `scripts/launch-brain-mcp.mjs` wrapper
- `install-multiagentbrain-launchers.mjs`
  - installs `multiagentbrain.cmd` and `mab.cmd`
  - defaults to `%APPDATA%\\npm`
  - points both launchers at the tracked `scripts/launch-brain-cli.mjs` wrapper
- `doctor-default-access.mjs`
  - checks whether the wrappers, built entrypoints, Codex MCP config, launcher shims, PATH wiring, and fixed manifest are all present
  - returns JSON with `healthy`, `degraded`, or `unavailable` status

Preview without writing:

```bash
node scripts/install-default-access.mjs --dry-run
node scripts/install-default-codex-mcp.mjs --dry-run
node scripts/install-multiagentbrain-launchers.mjs --dry-run
node scripts/doctor-default-access.mjs --json
```

## Choose a configuration profile

## Minimal repo-local profile

If you want the runtime state to stay inside the repository and you do not want model-backed providers yet, set these environment variables before starting a process:

```dotenv
MAB_NODE_ENV=development
MAB_VAULT_ROOT=./vault/canonical
MAB_STAGING_ROOT=./vault/staging
MAB_SQLITE_PATH=./state/multi-agent-brain.sqlite
MAB_QDRANT_URL=http://127.0.0.1:6333
MAB_QDRANT_COLLECTION=context_brain_chunks
MAB_EMBEDDING_PROVIDER=hash
MAB_REASONING_PROVIDER=heuristic
MAB_DRAFTING_PROVIDER=disabled
MAB_RERANKER_PROVIDER=local
MAB_API_HOST=127.0.0.1
MAB_API_PORT=8080
MAB_LOG_LEVEL=info
```

Why this works:

- `packages/application/src/services/staging-draft-service.ts` falls back to a deterministic draft body when no drafting provider is configured
- draft validation rejects placeholder-only required sections, so the fallback must still produce reviewable draft content
- `packages/infrastructure/src/vector/qdrant-vector-index.ts` uses `softFail: true` by default, so missing Qdrant degrades vector search instead of crashing the service
- the end-to-end tests repeatedly use the `hash` / `heuristic` / `disabled` / `local` provider profile

Important:

- `.env.example` is reference material only; the Node applications do not load `.env` files automatically
- on Windows, if `MAB_VAULT_ROOT` is unset, the code defaults to `F:\Dev\AI Context Brain`

## Containerized model-backed profile

The tracked container profile lives in `docker/compose.local.yml`:

```bash
docker compose -f docker/compose.local.yml up --build
```

That profile:

- builds the monorepo using `docker/brain-api.Dockerfile`
- runs the HTTP adapter
- starts Qdrant
- points the app at `http://model-runner.docker.internal:12434`
- sets embedding, reasoning, drafting, and reranking providers to the Docker/Ollama-compatible stack

This compose profile is a deliberate runtime profile, not a restatement of the generic defaults in `packages/infrastructure/src/config/env.ts`.

## Verify the installation

After setting environment variables, run one or more of:

```bash
corepack pnpm cli -- version
corepack pnpm api
corepack pnpm mcp
corepack pnpm test:transport
corepack pnpm test
```

For Python runtime checks:

```bash
py -3 -m pytest runtimes/local_experts/tests/test_safety_gate.py -v   # Windows
python3 -m pytest runtimes/local_experts/tests/test_safety_gate.py -v # macOS/Linux
```

## What is not installed by default

- no `.env` loader
- no tracked migration runner
- no automatic machine-wide installation; the default-access installers are opt-in

## Evidence status

### Verified facts

- Prerequisites and scripts come from `package.json`, app `package.json` files, `docker/brain-api.Dockerfile`, and `runtimes/local_experts/README.md`
- Runtime defaults come from `packages/infrastructure/src/config/env.ts`
- Provider fallback behavior comes from `packages/application/src/services/staging-draft-service.ts` and `packages/infrastructure/src/vector/qdrant-vector-index.ts`

### Assumptions

- None

### TODO gaps

- If the repo gains a tracked `.env` loader or Python packaging metadata, update this file immediately
