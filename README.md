# Multi Agent Brain

Local-first TypeScript monorepo for governed note memory, bounded retrieval, auth-gated transport adapters, and a vendored Python coding runtime.

## Current state

The tracked repository currently implements:

- a layered workspace with `packages/domain`, `packages/contracts`, `packages/application`, `packages/orchestration`, and `packages/infrastructure`
- three transport adapters over the same shared runtime: HTTP (`apps/brain-api`), CLI (`apps/brain-cli`), and stdio MCP (`apps/brain-mcp`)
- filesystem-backed canonical and staging note stores
- SQLite-backed metadata, audit, issued-token, revocation, session-archive, import-job, namespace, and representation stores
- SQLite FTS lexical retrieval plus a Qdrant-backed vector adapter
- governed drafting, validation, promotion, refresh-draft creation, import-job recording, history queries, and session-archive creation
- bounded retrieval, direct context-packet assembly, decision-summary generation, namespace tree listing, and namespace node reads
- actor-registry authorization with static credentials, centrally issued tokens, revocation support, and operator auth-control surfaces
- a vendored Python runtime in `runtimes/local_experts` that handles coding tasks through a Node-to-Python bridge
- two thin operator review frontends over the governed review contract:
  - a Windows Tkinter reviewer in `scripts/review-note-gui.py`
  - a local Obsidian plugin in `integrations/obsidian/multi-agent-brain-review`

The tracked repository does not currently include:

- GitHub Actions or other tracked CI/CD definitions
- Kubernetes, Helm, Terraform, or deployment descriptors beyond the tracked local Docker profiles
- a tracked migration system for SQLite
- a tracked dotenv loader for Node processes

## Architecture snapshot

```text
HTTP / CLI / MCP
        |
        v
buildServiceContainer()
        |
        +--> ActorAuthorizationPolicy
        +--> MultiAgentOrchestrator
        |       +--> BrainDomainController
        |       \--> CodingDomainController
        |
        +--> Application services
        |       +--> retrieval / packet / summary
        |       +--> staging / validation / promotion / refresh
        |       +--> import / history / session archive / namespace
        |
        \--> Infrastructure adapters
                +--> filesystem vault repositories
                +--> SQLite stores + FTS
                +--> Qdrant vector index
                +--> local / paid model providers
                \--> Python coding bridge
```

See `docs/architecture/overview.md` for the package-level map and `docs/architecture/runtime-flow.md` for request and promotion flow details.

## Prerequisites

### Required

- Node `>=22.0.0`
- `pnpm@10.7.0`

### Optional, depending on what you want to run

- Python 3 for the vendored coding runtime
- Qdrant if you want vector retrieval to be reachable
- Docker Desktop and Docker Compose if you want the tracked container profile
- Docker Model Runner or another Ollama-compatible endpoint if you want model-backed retrieval, drafting, reranking, or coding flows

### Suggested Python packages for `runtimes/local_experts`

- `fastmcp`
- `httpx`
- `pytest`

The repository does not include a tracked Python lockfile or packaging manifest for the vendored runtime.

Example install:

```bash
python -m pip install fastmcp httpx pytest
```

## Install dependencies

```bash
corepack enable
corepack pnpm install
corepack pnpm build
```

The root package scripts are the supported install and build entrypoints.
Tracked helper scripts in `scripts/` are optional operator and default-access
tools, not a required bootstrap layer.

If `corepack enable` cannot install a global `pnpm` shim on your machine, run the
workspace commands as `corepack pnpm ...` directly.

## Default access from other workspaces

The repo now includes opt-in helpers to make MultiAgentBrain easier to discover
outside this workspace on Windows:

```bash
node scripts/install-default-access.mjs
```

What that installer writes:

- a `multiagentbrain` Codex MCP server entry in `%USERPROFILE%\\.codex\\config.toml`
- `multiagentbrain.cmd` and `mab.cmd` launchers in `%APPDATA%\\npm` by default
- a fixed install manifest at `%USERPROFILE%\\.multiagentbrain\\installation.json`

Those helpers point at tracked wrapper scripts inside this repo:

- `scripts/launch-brain-mcp.mjs`
- `scripts/launch-brain-cli.mjs`
- `scripts/doctor-default-access.mjs`

They are opt-in. The repo does not auto-modify machine-wide configuration during
normal install or build steps.

To inspect detectability without mutating anything:

```bash
node scripts/doctor-default-access.mjs --json
multiagentbrain doctor --json
```

### Cross-workspace note workflow

Once MultiAgentBrain is detectable from another workspace, the supported
note flow is:

1. detect the runtime through a mounted MCP capability or `multiagentbrain doctor --json`
2. submit durable candidates through `capture-note`
3. inspect staged drafts through `list-review-queue` and `read-review-note`
4. publish or discard through `accept-note` or `reject-note`

Normal callers should not default to:

- `classify-note-ingress` plus `draft-note` as the ordinary submission path
- manual duplicate-search before every note proposal
- direct staged markdown edits as a normal publishing step
- frontend-driven `promote-note` button flows

See `docs/operations/note-authoring.md` for the detailed request and response
examples.

## Configuration model

Configuration is read from `process.env` by `packages/infrastructure/src/config/env.ts`.

Important:

- `.env.example` is reference material only
- the Node entrypoints do not auto-load `.env`
- if `MAB_VAULT_ROOT` is unset on Windows, the runtime defaults to `F:\Dev\AI Context Brain`
- if `MAB_VAULT_ROOT` is unset on non-Windows platforms, the runtime defaults to `./vault/canonical`

If you want repo-local development state on Windows, set `MAB_VAULT_ROOT` explicitly instead of relying on the Windows default.

See `docs/reference/env-vars.md` for the full environment variable list.

## Run locally

### Minimal repo-local profile

This profile keeps state inside the repository and matches the provider mix used by the end-to-end tests:

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

- draft creation has a deterministic fallback path when no drafting provider is configured
- draft ingress rejects placeholder-only required sections, so staging drafts still need real section content even in no-model mode
- missing Qdrant degrades vector retrieval instead of crashing the runtime
- the test suite repeatedly uses the `hash` / `heuristic` / `disabled` / `local` provider mix

### Start an entrypoint

```bash
corepack pnpm api
corepack pnpm cli -- version
corepack pnpm mcp
```

Entrypoints:

- HTTP API: `corepack pnpm api`
- CLI: `corepack pnpm cli -- <command>`
- MCP server: `corepack pnpm mcp`

If the launcher installer has been run on Windows, the CLI fallback command is:

- `multiagentbrain <command>`
- `mab <command>`

The launcher also exposes a machine-readable detection probe:

- `multiagentbrain doctor --json`
- `mab doctor --json`

### Review frontends

Thin operator review frontends now exist for the governed review queue:

- Windows Tkinter reviewer: `scripts/review-note-gui.py`
- local Obsidian plugin: `integrations/obsidian/multi-agent-brain-review`

These frontends intentionally stay thin:

- they call `list-review-queue`, `read-review-note`, `accept-note`, and `reject-note`
- they do not call low-level review or promotion commands directly
- they do not move files directly

Tkinter reviewer notes:

- Windows-only local reviewer in the supported documentation set
- requires a built `brain-cli`
- expects a working `node` executable unless you override it with `MAB_REVIEW_NODE_EXECUTABLE`
- optionally reads `MAB_REVIEW_REPO_ROOT` if the repo root should not be inferred from the script location

Obsidian plugin notes:

- desktop-only
- must be copied into an Obsidian vault under `.obsidian/plugins/multi-agent-brain-review`
- requires `Repo root` to be set in plugin settings; no machine-specific default path is baked into the plugin
- expects a working `node` executable unless you override it in plugin settings

## Run with Docker

The repository now tracks two Docker runtime shapes:

- `docker/compose.local.yml` for the local HTTP runtime
- `docker/brain-mcp.Dockerfile` plus `docker/brain-mcp-session-entrypoint.mjs`
  for an on-demand stdio MCP session container

### What the compose profile starts

- `brain-api`
- `qdrant`

### What it configures

- canonical notes under `/data/vault/canonical`
- staging drafts under `/data/vault/staging`
- SQLite state under `/data/state/multi-agent-brain.sqlite`
- Qdrant at `http://qdrant:6333`
- model-backed providers against `http://model-runner.docker.internal:12434`
- embedding, reasoning, drafting, and reranking bound to the Docker/Ollama-compatible stack

Expected model names in that Docker/Ollama-compatible endpoint:

- `docker.io/ai/qwen3-embedding:0.6B-F16`
- `qwen3:4B-F16`
- `qwen3-coder`
- `qwen3-reranker`

### Start the tracked HTTP Docker profile

```bash
docker compose -f docker/compose.local.yml up --build
```

Or use the workspace scripts:

```bash
corepack pnpm docker:up
corepack pnpm docker:down
```

Important profile note:

- the compose profile is intentionally more model-backed than the generic local defaults
- generic defaults use `hash` embeddings and `heuristic` reasoning unless you override them
- the compose profile forces the main provider selectors to the Docker/Ollama-compatible stack

### Start a session-scoped Docker MCP container

Tracked Docker MCP assets:

- `docker/brain-mcp.Dockerfile`
- `docker/brain-mcp-session.env.example`
- `docker/brain-mcp-session.actor-registry.example.json`
- `docker/compose.mcp-session.yml`
- `docs/operations/docker-mcp-session.md`

Build the image:

```bash
corepack pnpm docker:mcp:build
```

Validate the profile before connecting a client:

```bash
docker run --rm \
  --env-file docker/brain-mcp-session.env \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/vault/canonical,dst=/data/vault/canonical \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/vault/staging,dst=/data/vault/staging \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/state,dst=/data/state \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/config/auth,dst=/config/auth,readonly \
  --add-host host.docker.internal:host-gateway \
  --add-host model-runner.docker.internal:host-gateway \
  multi-agent-brain-mcp-session:local \
  --validate-only
```

Launch the MCP session:

```bash
docker run --rm -i \
  --env-file docker/brain-mcp-session.env \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/vault/canonical,dst=/data/vault/canonical \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/vault/staging,dst=/data/vault/staging \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/state,dst=/data/state \
  --mount type=bind,src=F:/Dev/scripts/MultiagentBrain/multi-agent-brain/config/auth,dst=/config/auth,readonly \
  --add-host host.docker.internal:host-gateway \
  --add-host model-runner.docker.internal:host-gateway \
  multi-agent-brain-mcp-session:local
```

This mode is intentionally session-scoped. It keeps canonical, staging, state,
and auth data on the host and refuses to start if required mounts, models,
Qdrant, or the fixed session actor contract are missing.

## MCP setup

The tracked MCP adapter is a stdio server exposed by `apps/brain-mcp`.

### Local stdio MCP server

```bash
corepack pnpm mcp
```

Behavior:

- JSON-RPC over stdio with Content-Length framing
- shared transport validation
- optional fixed session actor defaults through `MAB_MCP_DEFAULT_*`
- delegation into the same shared runtime used by the HTTP and CLI adapters

### Generic MCP client command configuration

If your MCP client accepts a local command, point it at the built server:

```json
{
  "command": "pnpm",
  "args": ["mcp"],
  "cwd": "/absolute/path/to/multi-agent-brain"
}
```

If your machine does not have a working global `pnpm` shim, use:

```json
{
  "command": "corepack",
  "args": ["pnpm", "mcp"],
  "cwd": "/absolute/path/to/multi-agent-brain"
}
```

If your client prefers an explicit Node entrypoint after build, use:

```json
{
  "command": "node",
  "args": ["apps/brain-mcp/dist/main.js"],
  "cwd": "/absolute/path/to/multi-agent-brain"
}
```

### Docker plus MCP

The tracked Docker MCP profile is intended for on-demand session launch, not an
always-on background container.

Recommended setup:

1. build `docker/brain-mcp.Dockerfile`
2. copy `docker/brain-mcp-session.env.example` to `docker/brain-mcp-session.env`
3. mount canonical, staging, state, and config explicitly
4. run `docker run --rm -i ... multi-agent-brain-mcp-session:local`

See `docs/operations/docker-mcp-session.md` for the exact command shape,
validation step, and MCP client snippet.

## HTTP and CLI surfaces

### HTTP

- health: `GET /health/live`, `GET /health/ready`
- system: auth status, issued-token listing, token issuance, token introspection, token revocation, freshness, version
- context: search, tree, node, packet, decision summary
- governance: classify ingress, drafts, draft review, review queue/read/accept/reject, refresh drafts, validate, promote, import resource, history query, session archives
- coding: `POST /v1/coding/execute`

### CLI

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

`capture-note` is now the preferred orchestrator-first authoring surface for
other workspaces. It classifies a candidate and, when admitted, stages the
draft through the same governed write path in one call. Callers can provide an
explicit markdown `body` so note quality does not depend on the local drafting
provider. `classify-note-ingress` remains the preflight surface when a caller
needs the contract decision without staging anything. `draft-note` now
recomputes the same ingress contract server-side and rejects current-state-like
drafts that only present session-synthesis evidence. Draft ingress now also
persists structured source-basis and supporting-source provenance into SQLite
for later review, plus duplicate identity hashes used to block exact and
semantic duplicate drafts before they add staging clutter.
Admitted drafts now also persist the governed normalized scope string and prefer
the candidate summary over the raw source prompt when populating draft
frontmatter, so stored metadata matches the ingress contract more closely.
The runtime now also makes note-worthiness decisions before staging: low-
information session residue can be downgraded to `session_only`, raw
transcript-like captures are rejected outright, and vague high-risk candidates
are forced through `rewrite_required` until they carry a specific scope and
enough durable detail.
Only `classify-note-ingress` and `capture-note` gained that inference behavior
in beta; `draft-note` still expects an explicit governed draft request and uses
server-side reclassification to enforce the same policy contract.
Once a draft is admitted, its governance identity is treated as immutable:
runtime review and promotion now reject staged drafts whose note type, corpus,
scope, current-state intent, or admitted governance basis drift after admission.
`review-draft-note` persists explicit review state and promotion eligibility for
staged drafts. High-risk drafts must advance through `approve_draft` before
`set_promotion_ready`, and promotion only succeeds when the latest draft
revision still matches the reviewed revision.

For thin operator frontends, the preferred review contract is now:

- `list-review-queue`
- `read-review-note`
- `accept-note`
- `reject-note`

These commands keep the UI thin while the orchestrator owns state transitions,
archive movement, promotion, indexing, and verification reporting. A minimal
Windows Tkinter reviewer using only that contract now lives at
`scripts/review-note-gui.py`.

See `docs/reference/interfaces.md` for the canonical interface list.

## Health behavior

The HTTP adapter exposes:

- `GET /health/live`
- `GET /health/ready`

Important operational behavior:

- missing Qdrant is a warning in `live`
- missing Qdrant is a failure in `ready`

See `docs/operations/running.md` for the current health model and runtime behavior.

## Verify your setup

```bash
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test:transport
corepack pnpm test
py -3 -m pytest runtimes/local_experts/tests/test_safety_gate.py -v   # Windows
python3 -m pytest runtimes/local_experts/tests/test_safety_gate.py -v # macOS/Linux
```

`corepack pnpm test` currently expands to `pnpm test:e2e`, which first runs
`pnpm build` and then executes the tracked end-to-end suite.

## Repository structure

```text
apps/          transport entrypoints
packages/      layered TypeScript modules
integrations/  optional thin clients such as the Obsidian review plugin
docker/        Dockerfile and local compose profile
docs/          canonical docs plus planning/history docs
runtimes/      vendored Python coding runtime
tests/         end-to-end transport and service tests
scripts/       local helper utilities, launch wrappers, and review/default-access helpers
```

Full map: `docs/reference/repo-map.md`

## Source-of-truth docs

- `docs/setup/installation.md`
- `docs/setup/configuration.md`
- `docs/operations/running.md`
- `docs/operations/note-authoring.md`
- `docs/operations/docker-mcp-session.md`
- `docs/architecture/overview.md`
- `docs/architecture/runtime-flow.md`
- `docs/architecture/invariants-and-boundaries.md`
- `docs/reference/interfaces.md`
- `docs/reference/env-vars.md`
- `docs/reference/repo-map.md`
- `docs/agents/ai-navigation-guide.md`
- `scripts/README.md`
- `integrations/obsidian/multi-agent-brain-review/README.md`

`docs/planning/` is useful for history and rollout context, but it is not the primary source of truth for the current runtime.

## Known limitations and active documentation risks

- namespace browsing is currently backed by rows in the `notes` table; imported jobs and session archives are stored, but they are not exposed through the namespace tree
- the Docker MCP session profile still assumes Qdrant and the model endpoint are managed intentionally outside the session container
- there is no tracked CI pipeline validating docs, builds, or tests automatically

## AI-agent navigation

Start here if you are using an automated reviewer or coding agent:

- `docs/agents/ai-navigation-guide.md`
- `docs/reference/repo-map.md`
- `docs/architecture/invariants-and-boundaries.md`

## Evidence status

### Verified facts

- This README is based on tracked code in `apps/`, `packages/`, `docker/`, `runtimes/`, `tests/`, and `docs/`
- Runtime defaults come from `packages/infrastructure/src/config/env.ts`
- Transport surfaces come from `apps/brain-api/src/server.ts`, `apps/brain-cli/src/main.ts`, and `apps/brain-mcp/src/main.ts`
- Docker behavior comes from `docker/brain-api.Dockerfile` and `docker/compose.local.yml`
- Test commands come from the root `package.json`

### Assumptions

- The generic MCP client command example will need minor format changes depending on the client you use

### TODO gaps

- If the repo adds tracked CI, deployment descriptors, dotenv loading, or migration tooling, update this README and the setup/reference docs together
