import type { ActorContext } from "../common/actor-context.js";
import type { NoteFrontmatter, NoteSourceBasis, NoteType, ProvenanceRef, CorpusId } from "./draft-note.imports.js";
import type { ClassifyNoteIngressResponse } from "./classify-note-ingress.contract.js";
import type { DraftNoteResponse } from "./draft-note.contract.js";

export interface CaptureNoteRequest {
  actor: ActorContext;
  targetCorpus?: CorpusId;
  noteType?: NoteType;
  title: string;
  sourcePrompt: string;
  supportingSources: ProvenanceRef[];
  frontmatterOverrides?: Partial<NoteFrontmatter>;
  body?: string;
  bodyHints?: string[];
  scopeHint?: string;
  candidateSummary?: string;
  currentStateIntent?: boolean;
  sourceBasis?: NoteSourceBasis[];
}

export interface CaptureNoteResponse {
  classification: ClassifyNoteIngressResponse;
  staged: boolean;
  draft?: DraftNoteResponse;
}
