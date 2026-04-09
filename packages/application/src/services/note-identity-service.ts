import { createHash } from "node:crypto";
import type { NoteIngressMergeHint } from "@multi-agent-brain/contracts";
import type { MetadataNoteRecord } from "../ports/metadata-control-store.js";

export interface NoteIdentity {
  contentHash: string;
  semanticSignature: string;
}

export interface PartitionedPotentialDuplicates {
  exactMatches: MetadataNoteRecord[];
  semanticMatches: MetadataNoteRecord[];
}

export function buildNoteIdentity(input: {
  noteType: string;
  title: string;
  summary: string;
  scope: string;
  body: string;
}): NoteIdentity {
  return {
    contentHash: hashText(input.body),
    semanticSignature: hashText([
      normalizeForSignature(input.noteType),
      normalizeForSignature(input.title),
      normalizeForSignature(input.summary),
      normalizeForSignature(input.scope)
    ].join("\n"))
  };
}

export function partitionPotentialDuplicates(
  duplicates: MetadataNoteRecord[],
  identity: NoteIdentity,
  options?: {
    excludeNoteIds?: string[];
  }
): PartitionedPotentialDuplicates {
  const excludedNoteIds = new Set(options?.excludeNoteIds ?? []);
  const activeDuplicates = duplicates.filter(
    (duplicate) =>
      !excludedNoteIds.has(duplicate.noteId) &&
      duplicate.lifecycleState !== "superseded" &&
      duplicate.reviewState !== "rejected"
  );

  return {
    exactMatches: activeDuplicates.filter(
      (duplicate) => duplicate.contentHash === identity.contentHash
    ),
    semanticMatches: activeDuplicates.filter(
      (duplicate) =>
        duplicate.semanticSignature === identity.semanticSignature &&
        duplicate.contentHash !== identity.contentHash
    )
  };
}

export function buildDuplicateMergeHints(input: {
  exactMatches: MetadataNoteRecord[];
  semanticMatches: MetadataNoteRecord[];
}): NoteIngressMergeHint[] {
  return [
    ...input.exactMatches.map((duplicate) => ({
      noteId: duplicate.noteId,
      notePath: duplicate.notePath,
      reason: "Exact duplicate note content already exists in this corpus."
    })),
    ...input.semanticMatches.map((duplicate) => ({
      noteId: duplicate.noteId,
      notePath: duplicate.notePath,
      reason: "A semantically similar note with the same governed identity already exists in this corpus."
    }))
  ];
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeForSignature(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
