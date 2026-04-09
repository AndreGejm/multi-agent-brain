import type { MetadataNoteRecord } from "../ports/metadata-control-store.js";
import type { StagingDraftRecord } from "../ports/staging-note-repository.js";

export function findDraftGovernanceIdentityViolations(
  draft: StagingDraftRecord,
  metadata: MetadataNoteRecord
): string[] {
  const violations: string[] = [];

  if (draft.noteId !== metadata.noteId) {
    violations.push("draft note id no longer matches the admitted governance identity");
  }

  if (draft.corpusId !== metadata.corpusId || draft.frontmatter.corpusId !== metadata.corpusId) {
    violations.push("draft corpus no longer matches the admitted governance identity");
  }

  if (draft.frontmatter.type !== metadata.noteType) {
    violations.push("draft note type no longer matches the admitted governance identity");
  }

  if ((metadata.scope ?? "") !== (draft.frontmatter.scope ?? "")) {
    violations.push("draft scope no longer matches the admitted governance identity");
  }

  if (draft.frontmatter.currentState !== metadata.currentState) {
    violations.push("draft current-state intent no longer matches the admitted governance identity");
  }

  return violations;
}
