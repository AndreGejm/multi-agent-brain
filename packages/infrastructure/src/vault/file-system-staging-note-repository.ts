import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StagingDraftRecord, StagingNoteRepository } from "@multi-agent-brain/application";
import type { CorpusId, NoteId } from "@multi-agent-brain/domain";
import { computeRevision, parseMarkdownNote, serializeMarkdownNote } from "./frontmatter-codec.js";
import {
  ensureParentDirectory,
  listMarkdownFiles,
  normalizeNotePath,
  toAbsoluteNotePath,
  toRelativeVaultPath
} from "./vault-paths.js";

export class FileSystemStagingNoteRepository implements StagingNoteRepository {
  constructor(private readonly rootPath: string) {}

  async createDraft(note: StagingDraftRecord): Promise<StagingDraftRecord> {
    return this.writeDraft(note);
  }

  async updateDraft(note: StagingDraftRecord): Promise<StagingDraftRecord> {
    return this.writeDraft(note);
  }

  async archiveRejectedDraft(noteId: NoteId): Promise<StagingDraftRecord | null> {
    return this.archiveHistoricalDraft(noteId, "rejected");
  }

  async archivePromotedDraft(noteId: NoteId): Promise<StagingDraftRecord | null> {
    return this.archiveHistoricalDraft(noteId, "promoted");
  }

  private async archiveHistoricalDraft(
    noteId: NoteId,
    lifecycleState: "promoted" | "rejected"
  ): Promise<StagingDraftRecord | null> {
    const existing = await this.getById(noteId);
    if (!existing) {
      return null;
    }

    const archivedDraftPath = buildArchivedDraftPath(existing, lifecycleState);
    const normalizedCurrentPath = normalizeNotePath(existing.draftPath, existing.corpusId);
    const normalizedArchivedPath = normalizeNotePath(archivedDraftPath, existing.corpusId);
    const updated: StagingDraftRecord = {
      ...existing,
      draftPath: archivedDraftPath,
      lifecycleState,
      frontmatter: {
        ...existing.frontmatter,
        status: lifecycleState
      }
    };
    const persisted = await this.writeDraft(updated);

    if (normalizedCurrentPath !== normalizedArchivedPath) {
      const currentAbsolutePath = toAbsoluteNotePath(
        this.rootPath,
        normalizedCurrentPath,
        existing.corpusId
      );

      try {
        await unlink(currentAbsolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }
    return persisted;
  }

  async getById(noteId: NoteId): Promise<StagingDraftRecord | null> {
    const files = await listMarkdownFiles(this.rootPath);

    for (const filePath of files) {
      const record = await this.readRecord(filePath);
      if (record?.noteId === noteId) {
        return record;
      }
    }

    return null;
  }

  async listByCorpus(corpusId: CorpusId): Promise<StagingDraftRecord[]> {
    const corpusRoot = path.resolve(this.rootPath, corpusId);
    const files = await listMarkdownFiles(corpusRoot);
    const records = await Promise.all(files.map((filePath) => this.readRecord(filePath)));
    return records.filter((record): record is StagingDraftRecord => record !== null);
  }

  private async writeDraft(note: StagingDraftRecord): Promise<StagingDraftRecord> {
    const draftPath = normalizeNotePath(note.draftPath, note.corpusId);
    const absolutePath = toAbsoluteNotePath(this.rootPath, draftPath, note.corpusId);
    const frontmatter = {
      ...note.frontmatter,
      noteId: note.noteId,
      corpusId: note.corpusId,
      status: note.lifecycleState
    };
    const markdown = serializeMarkdownNote({
      frontmatter,
      body: note.body
    });

    await ensureParentDirectory(absolutePath);
    await writeFile(absolutePath, markdown, "utf8");

    return {
      noteId: note.noteId,
      corpusId: note.corpusId,
      draftPath,
      revision: computeRevision(markdown),
      lifecycleState: note.lifecycleState,
      frontmatter,
      body: note.body
    };
  }

  private async readRecord(filePath: string): Promise<StagingDraftRecord | null> {
    try {
      const markdown = await readFile(filePath, "utf8");
      const parsed = parseMarkdownNote(markdown);
      return {
        noteId: parsed.frontmatter.noteId,
        corpusId: parsed.frontmatter.corpusId,
        draftPath: toRelativeVaultPath(this.rootPath, filePath),
        revision: computeRevision(markdown),
        lifecycleState: parsed.frontmatter.status,
        frontmatter: parsed.frontmatter,
        body: parsed.body
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
}

function buildArchivedDraftPath(
  note: StagingDraftRecord,
  lifecycleState: "promoted" | "rejected"
): string {
  const normalized = normalizeNotePath(note.draftPath, note.corpusId);
  const corpusPrefix = `${note.corpusId}/`;
  const relativeWithinCorpus = normalized.startsWith(corpusPrefix)
    ? normalized.slice(corpusPrefix.length)
    : normalized;
  const archiveSegment = lifecycleState === "promoted" ? "_promoted" : "_rejected";
  const withoutArchivePrefix = relativeWithinCorpus.startsWith(`${archiveSegment}/`)
    ? relativeWithinCorpus.slice(`${archiveSegment}/`.length)
    : relativeWithinCorpus;

  return `${note.corpusId}/${archiveSegment}/${withoutArchivePrefix}`;
}
