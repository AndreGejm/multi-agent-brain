import type {
  NoteIngressAction,
  NoteFrontmatter,
  NoteLifecycleState,
  NoteSourceBasis,
  NoteType,
  ProvenanceRef,
  CorpusId
} from "./draft-note.imports.js";
import type { ActorContext } from "../common/actor-context.js";

export interface DraftNoteRequest {
  actor: ActorContext;
  targetCorpus: CorpusId;
  noteType: NoteType;
  title: string;
  sourcePrompt: string;
  supportingSources: ProvenanceRef[];
  frontmatterOverrides?: Partial<NoteFrontmatter>;
  bodyHints?: string[];
  candidateSummary?: string;
  sourceBasis?: NoteSourceBasis[];
  classification?: {
    classificationHash: string;
    policyVersion: string;
    action?: NoteIngressAction;
  };
}

export interface DraftNoteResponse {
  draftNoteId: string;
  lifecycleState: NoteLifecycleState;
  draftPath: string;
  frontmatter: NoteFrontmatter;
  body: string;
  warnings: string[];
}
