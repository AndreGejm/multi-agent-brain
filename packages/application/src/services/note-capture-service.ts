import type {
  CaptureNoteRequest,
  CaptureNoteResponse,
  ServiceResult
} from "@multi-agent-brain/contracts";
import type { NoteIngressService } from "./note-ingress-service.js";
import type { StagingDraftService } from "./staging-draft-service.js";

type CaptureNoteErrorCode = "forbidden" | "validation_failed" | "write_failed" | "not_found";

export class NoteCaptureService {
  constructor(
    private readonly noteIngressService: NoteIngressService,
    private readonly stagingDraftService: StagingDraftService
  ) {}

  async capture(
    request: CaptureNoteRequest
  ): Promise<ServiceResult<CaptureNoteResponse, CaptureNoteErrorCode>> {
    const classification = this.noteIngressService.classify(request);

    if (classification.action !== "draft_candidate") {
      return {
        ok: true,
        data: {
          classification,
          staged: false
        }
      };
    }

    const draft = await this.stagingDraftService.createDraft({
      actor: request.actor,
      targetCorpus: classification.targetCorpus,
      noteType: classification.noteType,
      title: request.title,
      sourcePrompt: request.sourcePrompt,
      supportingSources: request.supportingSources,
      frontmatterOverrides: request.frontmatterOverrides,
      body: request.body,
      bodyHints: request.bodyHints,
      scopeHint: request.scopeHint,
      candidateSummary: request.candidateSummary,
      currentStateIntent: request.currentStateIntent,
      sourceBasis: request.sourceBasis,
      classification: {
        classificationHash: classification.classificationHash,
        policyVersion: classification.policyVersion,
        action: classification.action
      }
    });

    if (!draft.ok) {
      return draft;
    }

    return {
      ok: true,
      data: {
        classification,
        staged: true,
        draft: draft.data
      }
    };
  }
}
