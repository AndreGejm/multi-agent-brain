# docker

Tracked container assets for both the local HTTP runtime and the session-scoped
MCP container profile live here.

## Files

- `docker/brain-api.Dockerfile`
- `docker/brain-mcp.Dockerfile`
- `docker/brain-mcp-session-entrypoint.mjs`
- `docker/brain-mcp-session.env.example`
- `docker/brain-mcp-session.actor-registry.example.json`
- `docker/brain-mcp.requirements.txt`
- `docker/compose.local.yml`
- `docker/compose.mcp-session.yml`

## Current behavior

`docker/brain-api.Dockerfile`:

- builds the workspace with Node 22
- runs `pnpm install --frozen-lockfile`
- runs `pnpm build`
- starts the app with `pnpm api`

`docker/brain-mcp.Dockerfile`:

- builds the same workspace with Node 22
- installs Python plus a venv at `/opt/mab-python`
- installs the tracked MCP session Python requirements from `docker/brain-mcp.requirements.txt`
- starts the session wrapper with `docker/brain-mcp-session-entrypoint.mjs`

`docker/compose.local.yml`:

- runs `brain-api`
- runs `qdrant`
- maps the API to `8080:8080`
- binds persistent named volumes for canonical vault, staging vault, SQLite state, and Qdrant storage
- points model-backed providers at `http://model-runner.docker.internal:12434`
- sets embedding, reasoning, drafting, and reranking selectors to the Ollama-compatible stack

`docker/compose.mcp-session.yml`:

- runs `brain-mcp-session`
- expects host-backed canonical, staging, state, and auth-config paths through `MAB_HOST_*` env vars
- keeps stdin open for stdio MCP clients
- does not create its own long-lived named volumes

## Important profile note

The local HTTP compose profile is more model-backed than the generic defaults in `packages/infrastructure/src/config/env.ts`.

For example:

- generic defaults use `hash` embeddings and `heuristic` reasoning unless overridden
- compose forces the main provider selectors to `ollama`

## Run the tracked HTTP profile

```bash
docker compose -f docker/compose.local.yml up --build
```

## Run the tracked MCP session profile

1. copy `docker/brain-mcp-session.env.example` to `docker/brain-mcp-session.env`
2. set `MAB_HOST_CANONICAL_ROOT`, `MAB_HOST_STAGING_ROOT`, `MAB_HOST_STATE_ROOT`, and `MAB_HOST_CONFIG_ROOT`
3. launch the session container:

```bash
docker compose -f docker/compose.mcp-session.yml run --rm brain-mcp-session
```

For the stricter validation-first flow and raw `docker run` examples, see
`docs/operations/docker-mcp-session.md`.

## Evidence status

### Verified facts

- This README is based on `docker/brain-api.Dockerfile`, `docker/brain-mcp.Dockerfile`, `docker/compose.local.yml`, and `docker/compose.mcp-session.yml`

### Assumptions

- None

### TODO gaps

- If more container profiles are added, document their differences here instead of folding everything into one description
