import type { ImportOrchestrationService } from "@multi-agent-brain/application";
import type {
  AcceptNoteRequest,
  AssembleContextPacketRequest,
  AssembleContextPacketResponse,
  ClassifyNoteIngressRequest,
  ClassifyNoteIngressResponse,
  CreateSessionArchiveRequest,
  CreateRefreshDraftBatchRequest,
  CreateRefreshDraftRequest,
  DraftNoteRequest,
  GetDecisionSummaryRequest,
  ImportResourceRequest,
  ListReviewQueueRequest,
  PromoteNoteRequest,
  QueryHistoryRequest,
  ReadReviewNoteRequest,
  RejectNoteRequest,
  ReviewDraftNoteRequest,
  RetrieveContextRequest,
  ValidateNoteRequest,
  ValidateNoteResponse
} from "@multi-agent-brain/contracts";
import type { BrainMemoryController } from "./brain-memory-controller.js";
import type { BrainRetrievalController } from "./brain-retrieval-controller.js";

export class BrainDomainController {
  constructor(
    private readonly retrievalController: BrainRetrievalController,
    private readonly memoryController: BrainMemoryController,
    private readonly importOrchestrationService: ImportOrchestrationService
  ) {}

  async searchContext(
    request: RetrieveContextRequest
  ) {
    return this.retrievalController.searchContext(request);
  }

  async fetchDecisionSummary(
    request: GetDecisionSummaryRequest
  ) {
    return this.retrievalController.fetchDecisionSummary(request);
  }

  async getContextPacket(
    request: AssembleContextPacketRequest
  ): Promise<AssembleContextPacketResponse> {
    return this.retrievalController.getContextPacket(request);
  }

  async draftNote(
    request: DraftNoteRequest
  ) {
    return this.memoryController.draftNote(request);
  }

  async reviewDraftNote(
    request: ReviewDraftNoteRequest
  ) {
    return this.memoryController.reviewDraftNote(request);
  }

  async listReviewQueue(
    request: ListReviewQueueRequest
  ) {
    return this.memoryController.listReviewQueue(request);
  }

  async readReviewNote(
    request: ReadReviewNoteRequest
  ) {
    return this.memoryController.readReviewNote(request);
  }

  async acceptNote(
    request: AcceptNoteRequest
  ) {
    return this.memoryController.acceptNote(request);
  }

  async rejectNote(
    request: RejectNoteRequest
  ) {
    return this.memoryController.rejectNote(request);
  }

  classifyNoteIngress(
    request: ClassifyNoteIngressRequest
  ): ClassifyNoteIngressResponse {
    return this.memoryController.classifyNoteIngress(request);
  }

  async createSessionArchive(
    request: CreateSessionArchiveRequest
  ) {
    return this.memoryController.createSessionArchive(request);
  }

  async createRefreshDraft(
    request: CreateRefreshDraftRequest
  ) {
    return this.memoryController.createRefreshDraft(request);
  }

  async createRefreshDraftBatch(
    request: CreateRefreshDraftBatchRequest
  ) {
    return this.memoryController.createRefreshDraftBatch(request);
  }

  async importResource(
    request: ImportResourceRequest
  ) {
    return this.importOrchestrationService.importResource(request);
  }

  validateNote(request: ValidateNoteRequest): ValidateNoteResponse {
    return this.memoryController.validateNote(request);
  }

  async promoteNote(
    request: PromoteNoteRequest
  ) {
    return this.memoryController.promoteNote(request);
  }

  async queryHistory(
    request: QueryHistoryRequest
  ) {
    return this.memoryController.queryHistory(request);
  }
}
