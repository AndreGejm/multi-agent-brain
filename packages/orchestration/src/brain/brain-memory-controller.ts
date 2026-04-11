import type {
  NoteCaptureService,
  ReviewOperatorService,
  AuditHistoryService,
  DraftReviewService,
  NoteIngressService,
  NoteValidationService,
  PromotionOrchestratorService,
  SessionArchiveService,
  StagingDraftService,
  TemporalRefreshService
} from "@multi-agent-brain/application";
import type {
  AcceptNoteRequest,
  CaptureNoteRequest,
  CreateSessionArchiveRequest,
  ClassifyNoteIngressRequest,
  ClassifyNoteIngressResponse,
  CreateRefreshDraftBatchRequest,
  CreateRefreshDraftRequest,
  DraftNoteRequest,
  ListReviewQueueRequest,
  PromoteNoteRequest,
  QueryHistoryRequest,
  ReadReviewNoteRequest,
  RejectNoteRequest,
  ReviewDraftNoteRequest,
  ValidateNoteRequest,
  ValidateNoteResponse
} from "@multi-agent-brain/contracts";

export class BrainMemoryController {
  constructor(
    private readonly noteCaptureService: NoteCaptureService,
    private readonly stagingDraftService: StagingDraftService,
    private readonly draftReviewService: DraftReviewService,
    private readonly reviewOperatorService: ReviewOperatorService,
    private readonly noteIngressService: NoteIngressService,
    private readonly noteValidationService: NoteValidationService,
    private readonly promotionOrchestratorService: PromotionOrchestratorService,
    private readonly sessionArchiveService: SessionArchiveService,
    private readonly auditHistoryService: AuditHistoryService,
    private readonly temporalRefreshService: TemporalRefreshService
  ) {}

  async captureNote(
    request: CaptureNoteRequest
  ) {
    return this.noteCaptureService.capture(request);
  }

  async draftNote(
    request: DraftNoteRequest
  ) {
    return this.stagingDraftService.createDraft(request);
  }

  async reviewDraftNote(
    request: ReviewDraftNoteRequest
  ) {
    return this.draftReviewService.reviewDraft(request);
  }

  async listReviewQueue(
    request: ListReviewQueueRequest
  ) {
    return this.reviewOperatorService.listReviewQueue(request);
  }

  async readReviewNote(
    request: ReadReviewNoteRequest
  ) {
    return this.reviewOperatorService.readReviewNote(request);
  }

  async acceptNote(
    request: AcceptNoteRequest
  ) {
    return this.reviewOperatorService.acceptNote(request);
  }

  async rejectNote(
    request: RejectNoteRequest
  ) {
    return this.reviewOperatorService.rejectNote(request);
  }

  classifyNoteIngress(
    request: ClassifyNoteIngressRequest
  ): ClassifyNoteIngressResponse {
    return this.noteIngressService.classify(request);
  }

  validateNote(request: ValidateNoteRequest): ValidateNoteResponse {
    return this.noteValidationService.validate(request);
  }

  async promoteNote(
    request: PromoteNoteRequest
  ) {
    return this.promotionOrchestratorService.promoteDraft(request);
  }

  async createRefreshDraft(
    request: CreateRefreshDraftRequest
  ) {
    return this.temporalRefreshService.createRefreshDraft(request);
  }

  async createRefreshDraftBatch(
    request: CreateRefreshDraftBatchRequest
  ) {
    return this.temporalRefreshService.createRefreshDraftBatch(request);
  }

  async createSessionArchive(
    request: CreateSessionArchiveRequest
  ) {
    return this.sessionArchiveService.createArchive(request);
  }

  async queryHistory(
    request: QueryHistoryRequest
  ) {
    return this.auditHistoryService.queryHistory(request);
  }
}
