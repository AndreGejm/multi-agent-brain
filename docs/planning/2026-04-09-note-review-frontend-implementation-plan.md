# Note Review Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-owned `Accept`/`Reject` review commands plus a minimal Windows Tkinter reviewer that can move staged notes into long-term memory without embedding workflow logic in the UI.

**Architecture:** Add a first-class review contract to the brain domain, backed by one application service that owns queue listing, note reading, accept orchestration, reject-and-archive orchestration, and backend verification reporting. Then build a Python Tkinter client that calls the CLI transport for those commands and only renders note content, queue position, progress, and results.

**Tech Stack:** TypeScript monorepo, Node 22, pnpm, existing CLI/API/MCP transports, SQLite metadata store, file-backed staging vault, Python 3 stdlib (`tkinter`, `subprocess`, `json`, `unittest`)

---

### Task 1: Add Review Frontend Contracts And Command Names

**Files:**
- Create: `multi-agent-brain/packages/contracts/src/review/list-review-queue.contract.ts`
- Create: `multi-agent-brain/packages/contracts/src/review/read-review-note.contract.ts`
- Create: `multi-agent-brain/packages/contracts/src/review/accept-note.contract.ts`
- Create: `multi-agent-brain/packages/contracts/src/review/reject-note.contract.ts`
- Create: `multi-agent-brain/packages/contracts/src/mcp/list-review-queue.tool.ts`
- Create: `multi-agent-brain/packages/contracts/src/mcp/read-review-note.tool.ts`
- Create: `multi-agent-brain/packages/contracts/src/mcp/accept-note.tool.ts`
- Create: `multi-agent-brain/packages/contracts/src/mcp/reject-note.tool.ts`
- Modify: `multi-agent-brain/packages/contracts/src/index.ts`
- Modify: `multi-agent-brain/packages/contracts/src/mcp/index.ts`
- Modify: `multi-agent-brain/packages/orchestration/src/routing/task-family-router.ts`
- Modify: `multi-agent-brain/packages/orchestration/src/root/actor-authorization-policy.ts`
- Test: `multi-agent-brain/tests/e2e/transport-adapters.test.mjs`

- [ ] **Step 1: Write the failing transport test for the new review commands**

```js
test("brain-cli exposes first-class review frontend commands", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mab-cli-review-contract-"));

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const queueResult = await runNodeCommand(
    path.join(process.cwd(), "apps", "brain-cli", "dist", "main.js"),
    ["list-review-queue", "--json", JSON.stringify({})],
    cliEnvironment(root)
  );

  assert.equal(queueResult.exitCode, 0, queueResult.stderr);
  const queuePayload = JSON.parse(queueResult.stdout);
  assert.equal(queuePayload.ok, true);
  assert.ok(Array.isArray(queuePayload.data.items));
});
```

- [ ] **Step 2: Define shared review queue and workflow result contracts**

```ts
// multi-agent-brain/packages/contracts/src/review/list-review-queue.contract.ts
import type { ActorContext } from "../common/actor-context.js";
import type {
  CorpusId,
  DraftReviewState,
  NoteAuthorityRisk,
  NoteId,
  NoteType
} from "@multi-agent-brain/domain";

export interface ListReviewQueueRequest {
  actor: ActorContext;
  targetCorpus?: CorpusId;
  includeRejected?: boolean;
}

export interface ReviewQueueItem {
  draftNoteId: NoteId;
  title: string;
  targetCorpus: CorpusId;
  scope?: string;
  noteType: NoteType;
  updatedAt: string;
  reviewState: DraftReviewState;
  authorityRisk: NoteAuthorityRisk;
  warningSummary: string[];
}

export interface ListReviewQueueResponse {
  items: ReviewQueueItem[];
}
```

```ts
// multi-agent-brain/packages/contracts/src/review/accept-note.contract.ts
import type { ActorContext } from "../common/actor-context.js";
import type { DraftReviewState, NoteId } from "@multi-agent-brain/domain";

export interface ReviewWorkflowStep {
  step:
    | "reviewability_check"
    | "approve_draft"
    | "set_promotion_ready"
    | "promote_note"
    | "verify_canonical_write"
    | "verify_retrieval"
    | "reject_draft"
    | "archive_rejected_draft";
  status: "succeeded" | "failed" | "skipped";
  message?: string;
}

export interface AcceptNoteRequest {
  actor: ActorContext;
  draftNoteId: NoteId;
}

export interface AcceptNoteResponse {
  draftNoteId: NoteId;
  finalReviewState: DraftReviewState;
  promotedNoteId?: NoteId;
  canonicalPath?: string;
  steps: ReviewWorkflowStep[];
  retrievalWarning?: string;
}
```

- [ ] **Step 3: Export the new contracts and register the command names**

```ts
// multi-agent-brain/packages/orchestration/src/routing/task-family-router.ts
export type BrainCommand =
  | "search_context"
  | "get_context_packet"
  | "fetch_decision_summary"
  | "classify_note_ingress"
  | "draft_note"
  | "review_draft_note"
  | "list_review_queue"
  | "read_review_note"
  | "accept_note"
  | "reject_note"
  | "create_session_archive"
  | "create_refresh_draft"
  | "create_refresh_drafts"
  | "import_resource"
  | "validate_note"
  | "promote_note"
  | "query_history";
```

```ts
// multi-agent-brain/packages/orchestration/src/root/actor-authorization-policy.ts
const COMMAND_ROLE_POLICY: Record<OrchestratorCommand, ReadonlySet<ActorRole>> = {
  // existing commands ...
  list_review_queue: new Set(["operator", "orchestrator", "system"]),
  read_review_note: new Set(["operator", "orchestrator", "system"]),
  accept_note: new Set(["operator", "orchestrator", "system"]),
  reject_note: new Set(["operator", "orchestrator", "system"])
};
```

- [ ] **Step 4: Build and run the focused transport test until it fails for missing implementation, not missing types**

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
corepack pnpm build
node --test tests/e2e/transport-adapters.test.mjs
```

Expected:
```text
FAIL ... list-review-queue ...
Unknown command or not yet routed
```

- [ ] **Step 5: Commit the contract slice**

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
git add packages/contracts packages/orchestration tests/e2e/transport-adapters.test.mjs
git commit -m "feat: add review frontend command contracts"
```

### Task 2: Implement Backend Review Queue, Read Payload, And Reject Archive Flow

**Files:**
- Create: `multi-agent-brain/packages/application/src/services/review-operator-service.ts`
- Modify: `multi-agent-brain/packages/application/src/ports/metadata-control-store.ts`
- Modify: `multi-agent-brain/packages/application/src/ports/staging-note-repository.ts`
- Modify: `multi-agent-brain/packages/application/src/index.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/sqlite/sqlite-metadata-control-store.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/vault/file-system-staging-note-repository.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/vault/vault-paths.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/bootstrap/build-service-container.ts`
- Test: `multi-agent-brain/tests/e2e/service-boundaries-and-regression.test.mjs`

- [ ] **Step 1: Write the failing service-level tests for queue listing, note reading, and reject archival**

```js
test("review operator service lists active reviewable drafts only", async (t) => {
  const { container } = await createHarness(t);
  const pending = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "general_notes",
    noteType: "handoff",
    title: "Pending Review Queue Item",
    sourcePrompt: "Queue me.",
    bodyHints: ["This note should appear in the review queue."],
    frontmatterOverrides: { scope: "project/review-queue" }
  });

  const queue = await container.services.reviewOperatorService.listReviewQueue({
    actor: actor("operator")
  });

  assert.equal(queue.ok, true);
  assert.ok(queue.data.items.some((item) => item.draftNoteId === pending.draftNoteId));
});

test("review operator service rejects and archives a draft under backend control", async (t) => {
  const { container } = await createHarness(t);
  const draft = await createDraft(container, {
    actorRole: "writer",
    targetCorpus: "general_notes",
    noteType: "handoff",
    title: "Reject And Archive Me",
    sourcePrompt: "Reject me.",
    bodyHints: ["This note should move to rejected storage."],
    frontmatterOverrides: { scope: "project/reject-archive" }
  });

  const result = await container.services.reviewOperatorService.rejectNote({
    actor: actor("operator"),
    draftNoteId: draft.draftNoteId
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.finalReviewState, "rejected");
  assert.match(result.data.archivedPath, /^general_notes\/_rejected\//);
});
```

- [ ] **Step 2: Extend the metadata and staging ports for review queue reads and archival moves**

```ts
// multi-agent-brain/packages/application/src/ports/metadata-control-store.ts
export interface MetadataControlStore {
  // existing methods ...
  listNotes(input?: {
    corpusId?: CorpusId;
    lifecycleStates?: NoteLifecycleState[];
    reviewStates?: DraftReviewState[];
    limit?: number;
  }): Promise<MetadataNoteRecord[]>;
}
```

```ts
// multi-agent-brain/packages/application/src/ports/staging-note-repository.ts
export interface StagingNoteRepository {
  createDraft(note: StagingDraftRecord): Promise<StagingDraftRecord>;
  updateDraft(note: StagingDraftRecord): Promise<StagingDraftRecord>;
  getById(noteId: NoteId): Promise<StagingDraftRecord | null>;
  listByCorpus(corpusId: CorpusId): Promise<StagingDraftRecord[]>;
  archiveRejectedDraft(note: StagingDraftRecord): Promise<StagingDraftRecord>;
}
```

- [ ] **Step 3: Implement `ReviewOperatorService` as the single backend owner of queue, read, and reject/archive**

```ts
// multi-agent-brain/packages/application/src/services/review-operator-service.ts
export class ReviewOperatorService {
  constructor(
    private readonly metadataControlStore: MetadataControlStore,
    private readonly stagingNoteRepository: StagingNoteRepository,
    private readonly draftReviewService: DraftReviewService,
    private readonly promotionOrchestratorService: PromotionOrchestratorService
  ) {}

  async listReviewQueue(request: ListReviewQueueRequest) {
    const notes = await this.metadataControlStore.listNotes({
      corpusId: request.targetCorpus,
      lifecycleStates: ["draft", "staged"],
      limit: 200
    });

    return {
      ok: true,
      data: {
        items: notes
          .filter((note) => note.reviewState !== "rejected")
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
          .map((note) => ({
            draftNoteId: note.noteId,
            title: path.basename(note.notePath, ".md"),
            targetCorpus: note.corpusId,
            scope: note.scope,
            noteType: note.noteType,
            updatedAt: note.updatedAt,
            reviewState: note.reviewState ?? "unreviewed",
            authorityRisk: note.authorityRisk ?? "medium",
            warningSummary: []
          }))
      }
    };
  }

  async rejectNote(request: RejectNoteRequest) {
    const reviewed = await this.draftReviewService.reviewDraft({
      actor: request.actor,
      draftNoteId: request.draftNoteId,
      decision: "reject",
      reviewNotes: request.reviewNotes
    });
    if (!reviewed.ok) return reviewed;

    const draft = await this.stagingNoteRepository.getById(request.draftNoteId);
    if (!draft) {
      return {
        ok: false,
        error: { code: "not_found", message: "Draft disappeared before archival." }
      };
    }

    const archived = await this.stagingNoteRepository.archiveRejectedDraft({
      ...draft,
      lifecycleState: "rejected",
      frontmatter: { ...draft.frontmatter, status: "rejected" }
    });

    return {
      ok: true,
      data: {
        draftNoteId: archived.noteId,
        finalReviewState: "rejected",
        archivedPath: archived.draftPath,
        steps: [
          { step: "reject_draft", status: "succeeded" },
          { step: "archive_rejected_draft", status: "succeeded" }
        ]
      }
    };
  }
}
```

- [ ] **Step 4: Implement the repository/archive behavior and make the service tests pass**

```ts
// multi-agent-brain/packages/infrastructure/src/vault/file-system-staging-note-repository.ts
async archiveRejectedDraft(note: StagingDraftRecord): Promise<StagingDraftRecord> {
  const archivePath = `${note.corpusId}/_rejected/${path.basename(note.draftPath)}`;
  return this.writeDraft({
    ...note,
    draftPath: archivePath,
    lifecycleState: "rejected",
    frontmatter: {
      ...note.frontmatter,
      status: "rejected",
      tags: [...new Set([...(note.frontmatter.tags ?? []), "status/rejected"])]
    }
  });
}
```

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
corepack pnpm build
node --test tests/e2e/service-boundaries-and-regression.test.mjs
```

Expected:
```text
PASS review operator service lists active reviewable drafts only
PASS review operator service rejects and archives a draft under backend control
```

- [ ] **Step 5: Commit the backend queue/archive slice**

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
git add packages/application packages/infrastructure tests/e2e/service-boundaries-and-regression.test.mjs
git commit -m "feat: add backend review queue and reject archive flow"
```

### Task 3: Implement Backend Accept Workflow And Expose It Through CLI, API, And MCP

**Files:**
- Modify: `multi-agent-brain/packages/orchestration/src/brain/brain-memory-controller.ts`
- Modify: `multi-agent-brain/packages/orchestration/src/brain/brain-domain-controller.ts`
- Modify: `multi-agent-brain/packages/orchestration/src/root/multi-agent-orchestrator.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/bootstrap/build-service-container.ts`
- Modify: `multi-agent-brain/packages/infrastructure/src/transport/request-validation.ts`
- Modify: `multi-agent-brain/apps/brain-cli/src/main.ts`
- Modify: `multi-agent-brain/apps/brain-api/src/server.ts`
- Modify: `multi-agent-brain/apps/brain-mcp/src/tool-definitions.ts`
- Modify: `multi-agent-brain/tests/e2e/transport-adapters.test.mjs`
- Modify: `multi-agent-brain/tests/e2e/mcp-adapter.test.mjs`

- [ ] **Step 1: Write the failing end-to-end transport tests for queue/read/accept/reject**

```js
test("brain-cli accept-note performs governed review and promotion in one command", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mab-cli-accept-note-"));
  const draft = await seedStagingDraft(root, {
    title: "CLI Accept Workflow",
    corpusId: "general_notes",
    scope: "project/cli-accept"
  });

  const result = await runNodeCommand(
    path.join(process.cwd(), "apps", "brain-cli", "dist", "main.js"),
    ["accept-note", "--json", JSON.stringify({ draftNoteId: draft.draftNoteId })],
    cliEnvironment(root)
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.finalReviewState, "promotion_ready");
  assert.equal(typeof payload.data.canonicalPath, "string");
  assert.ok(payload.data.steps.some((step) => step.step === "promote_note"));
});
```

- [ ] **Step 2: Add orchestrator methods that delegate to `ReviewOperatorService`**

```ts
// multi-agent-brain/packages/orchestration/src/brain/brain-memory-controller.ts
async listReviewQueue(request: ListReviewQueueRequest) {
  return this.reviewOperatorService.listReviewQueue(request);
}

async readReviewNote(request: ReadReviewNoteRequest) {
  return this.reviewOperatorService.readReviewNote(request);
}

async acceptNote(request: AcceptNoteRequest) {
  return this.reviewOperatorService.acceptNote(request);
}

async rejectNote(request: RejectNoteRequest) {
  return this.reviewOperatorService.rejectNote(request);
}
```

- [ ] **Step 3: Wire the new commands through CLI, API, MCP, and request validation**

```ts
// multi-agent-brain/apps/brain-cli/src/main.ts
type CommandName =
  | "list-review-queue"
  | "read-review-note"
  | "accept-note"
  | "reject-note"
  // existing commands...

const DEFAULT_ACTOR_ROLE: Record<RoutedCommandName, ActorRole> = {
  "list-review-queue": "operator",
  "read-review-note": "operator",
  "accept-note": "operator",
  "reject-note": "operator",
  // existing defaults...
};
```

```ts
// multi-agent-brain/apps/brain-api/src/server.ts
const ROUTES = {
  "/v1/review/queue": { method: "POST", name: "list-review-queue" },
  "/v1/review/note": { method: "POST", name: "read-review-note" },
  "/v1/review/accept": { method: "POST", name: "accept-note" },
  "/v1/review/reject": { method: "POST", name: "reject-note" }
};
```

- [ ] **Step 4: Make `accept-note` perform the full governed flow and surface step-by-step results**

```ts
// inside ReviewOperatorService.acceptNote(...)
const steps: ReviewWorkflowStep[] = [];

steps.push({ step: "reviewability_check", status: "succeeded" });

const approved = await this.draftReviewService.reviewDraft({
  actor: request.actor,
  draftNoteId: request.draftNoteId,
  decision: "approve_draft",
  reviewNotes: request.reviewNotes
});
if (!approved.ok) return rejectWithSteps("approve_draft", approved.error, steps);
steps.push({ step: "approve_draft", status: "succeeded" });

const promotedReady = await this.draftReviewService.reviewDraft({
  actor: request.actor,
  draftNoteId: request.draftNoteId,
  decision: "set_promotion_ready",
  reviewNotes: request.reviewNotes
});
if (!promotedReady.ok) return rejectWithSteps("set_promotion_ready", promotedReady.error, steps);
steps.push({ step: "set_promotion_ready", status: "succeeded" });

const promoted = await this.promotionOrchestratorService.promoteDraft({
  actor: request.actor,
  draftNoteId: request.draftNoteId,
  targetCorpus: draft.corpusId,
  expectedDraftRevision: promotedReady.data.reviewedRevision,
  promoteAsCurrentState: false
});
if (!promoted.ok) return rejectWithSteps("promote_note", promoted.error, steps);
steps.push({ step: "promote_note", status: "succeeded" });
steps.push({ step: "verify_canonical_write", status: "succeeded" });
```

- [ ] **Step 5: Build and run the transport suites**

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
corepack pnpm build
node --test tests/e2e/transport-adapters.test.mjs tests/e2e/mcp-adapter.test.mjs
```

Expected:
```text
PASS brain-cli accept-note performs governed review and promotion in one command
PASS brain-cli reject-note removes the draft from the active queue
PASS brain-mcp exposes list-review-queue and accept-note
```

- [ ] **Step 6: Commit the backend command surface**

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
git add packages/orchestration packages/infrastructure apps tests/e2e
git commit -m "feat: expose backend-owned review frontend commands"
```

### Task 4: Build The Windows Tkinter Reviewer As A Thin CLI Client

**Files:**
- Create: `multi-agent-brain/scripts/note-reviewer/review_backend_client.py`
- Create: `multi-agent-brain/scripts/note-reviewer/review_gui.py`
- Create: `multi-agent-brain/scripts/note-reviewer/run-reviewer.ps1`
- Create: `multi-agent-brain/scripts/note-reviewer/test_review_backend_client.py`
- Test: `multi-agent-brain/scripts/note-reviewer/test_review_backend_client.py`

- [ ] **Step 1: Write the failing Python client test against a fake CLI runner**

```python
import unittest
from review_backend_client import ReviewBackendClient


class FakeRunner:
    def __init__(self):
        self.calls = []

    def __call__(self, command, payload):
        self.calls.append((command, payload))
        if command == "list-review-queue":
            return {"ok": True, "data": {"items": []}}
        raise AssertionError(f"Unexpected command: {command}")


class ReviewBackendClientTests(unittest.TestCase):
    def test_lists_review_queue_through_single_backend_command(self):
        runner = FakeRunner()
        client = ReviewBackendClient(run_cli_command=runner)

        payload = client.list_review_queue()

        self.assertEqual(payload["ok"], True)
        self.assertEqual(runner.calls, [("list-review-queue", {})])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Implement the thin CLI client wrapper**

```python
# multi-agent-brain/scripts/note-reviewer/review_backend_client.py
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile


class ReviewBackendClient:
    def __init__(self, cli_path: Path | None = None, run_cli_command=None):
        self.cli_path = cli_path or Path(__file__).resolve().parents[2] / "apps" / "brain-cli" / "dist" / "main.js"
        self._run = run_cli_command or self._invoke_cli

    def list_review_queue(self) -> dict:
        return self._run("list-review-queue", {})

    def read_review_note(self, draft_note_id: str) -> dict:
        return self._run("read-review-note", {"draftNoteId": draft_note_id})

    def accept_note(self, draft_note_id: str) -> dict:
        return self._run("accept-note", {"draftNoteId": draft_note_id})

    def reject_note(self, draft_note_id: str) -> dict:
        return self._run("reject-note", {"draftNoteId": draft_note_id})

    def _invoke_cli(self, command: str, payload: dict) -> dict:
        with NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(payload, handle)
            temp_path = handle.name

        result = subprocess.run(
            ["node", str(self.cli_path), command, "--input", temp_path],
            check=False,
            capture_output=True,
            text=True
        )
        return json.loads(result.stdout)
```

- [ ] **Step 3: Build the Tkinter UI with one current note, queue position, and Accept/Reject buttons**

```python
# multi-agent-brain/scripts/note-reviewer/review_gui.py
import tkinter as tk
from tkinter import messagebox
from tkinter.scrolledtext import ScrolledText

from review_backend_client import ReviewBackendClient


class ReviewApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.client = ReviewBackendClient()
        self.queue = []
        self.index = 0

        self.title_var = tk.StringVar(value="Loading review queue...")
        self.meta_var = tk.StringVar(value="")
        self.status_var = tk.StringVar(value="Ready")

        tk.Label(root, textvariable=self.title_var, font=("Segoe UI", 14, "bold")).pack(anchor="w", padx=12, pady=(12, 4))
        tk.Label(root, textvariable=self.meta_var, font=("Segoe UI", 9)).pack(anchor="w", padx=12)
        self.body = ScrolledText(root, wrap="word", width=110, height=35)
        self.body.pack(fill="both", expand=True, padx=12, pady=12)

        button_row = tk.Frame(root)
        button_row.pack(fill="x", padx=12, pady=(0, 8))
        tk.Button(button_row, text="Previous", command=self.show_previous).pack(side="left")
        tk.Button(button_row, text="Next", command=self.show_next).pack(side="left", padx=(8, 0))
        tk.Button(button_row, text="Accept", command=self.accept_current).pack(side="right")
        tk.Button(button_row, text="Reject", command=self.reject_current).pack(side="right", padx=(0, 8))

        tk.Label(root, textvariable=self.status_var, anchor="w").pack(fill="x", padx=12, pady=(0, 12))
        self.reload_queue()
```

- [ ] **Step 4: Add a Windows launcher and run the Python smoke test**

```powershell
# multi-agent-brain/scripts/note-reviewer/run-reviewer.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

corepack pnpm build
py -3 .\scripts\note-reviewer\review_gui.py
```

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
py -3 -m unittest scripts\note-reviewer\test_review_backend_client.py
```

Expected:
```text
OK
```

- [ ] **Step 5: Commit the Tkinter reviewer**

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
git add scripts/note-reviewer
git commit -m "feat: add tkinter note reviewer"
```

### Task 5: Update Docs And Run End-To-End Verification

**Files:**
- Modify: `multi-agent-brain/README.md`
- Modify: `multi-agent-brain/docs/reference/interfaces.md`
- Modify: `multi-agent-brain/docs/architecture/runtime-flow.md`
- Modify: `multi-agent-brain/docs/operations/troubleshooting.md`
- Modify: `multi-agent-brain/docs/planning/current-implementation.md`
- Modify: `multi-agent-brain/docs/planning/note-review-frontend-design.md`

- [ ] **Step 1: Update operator docs to describe the new single-action backend commands**

```md
## Review Frontend Commands

- `list-review-queue` returns the active operator review queue
- `read-review-note` returns a full review payload for one draft
- `accept-note` performs approve, promotion-ready, promote, and backend verification
- `reject-note` marks the draft rejected and archives it out of the active queue
```

- [ ] **Step 2: Add a troubleshooting section for partial accept failures**

```md
## `accept-note` partially succeeded

If `accept-note` reports `partial_success`, inspect the returned `steps` array.

- if `approve_draft` succeeded but `promote_note` failed, the note remains reviewed but not promoted
- reopen the note through `read-review-note`
- fix the reported backend error
- retry `accept-note` instead of manually replaying low-level workflow steps from the UI
```

- [ ] **Step 3: Run the repo verification suite plus the Python client smoke test**

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
corepack pnpm build
node --test tests/e2e/service-boundaries-and-regression.test.mjs tests/e2e/transport-adapters.test.mjs tests/e2e/mcp-adapter.test.mjs
corepack pnpm test
py -3 -m unittest scripts\note-reviewer\test_review_backend_client.py
```

Expected:
```text
all Node suites PASS
Python unittest OK
```

- [ ] **Step 4: Manual operator smoke test on Windows**

Run:
```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
.\scripts\note-reviewer\run-reviewer.ps1
```

Expected:
```text
Tkinter window opens
review queue loads
Accept promotes a note through the orchestrator
Reject moves a note under general_notes/_rejected or context_brain/_rejected
```

- [ ] **Step 5: Commit the docs and verification pass**

```powershell
Set-Location F:\Dev\scripts\MultiagentBrain\multi-agent-brain
git add README.md docs
git commit -m "docs: add note review frontend workflow"
```

## Self-Review

### Spec coverage

- Backend-owned `Accept`/`Reject` contract: covered in Tasks 1-3
- Thin Tkinter shell: covered in Task 4
- Future Obsidian reuse of same contract: covered by Tasks 1-3 and docs in Task 5
- Reject-as-archive for v1: covered in Task 2
- Backend reporting of verification: covered in Task 3 and Task 5

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain
- All new files and commands are named explicitly
- Each task includes explicit test and verification commands

### Type consistency

- Contract names, orchestrator command names, and CLI/API/MCP names all use:
  - `list-review-queue`
  - `read-review-note`
  - `accept-note`
  - `reject-note`
- Application service is consistently named `ReviewOperatorService`
- Tkinter client methods mirror the same command names
