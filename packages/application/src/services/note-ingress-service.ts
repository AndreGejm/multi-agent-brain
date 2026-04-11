import { createHash } from "node:crypto";
import type {
  ClassifyNoteIngressRequest,
  ClassifyNoteIngressResponse,
  DraftNoteRequest
} from "@multi-agent-brain/contracts";
import type {
  CorpusId,
  NoteAuthorityRisk,
  NoteType,
  NoteSourceBasis
} from "@multi-agent-brain/domain";
import {
  NOTE_INGRESS_POLICY_VERSION,
  buildDefaultValidationConstraints,
  resolveIngressShape
} from "../policy/note-ingress-policy.js";

const CURRENT_STATE_ALLOWED_SOURCE_BASIS = new Set<NoteSourceBasis>([
  "repo_inspection",
  "direct_observation",
  "retrieved_note"
]);

const GENERIC_NOTE_TITLES = new Set([
  "notes",
  "note",
  "update",
  "updates",
  "thought",
  "thoughts",
  "summary",
  "misc",
  "todo",
  "todos"
]);

const TRANSCRIPT_KEYWORDS = [
  "raw transcript",
  "chat transcript",
  "session transcript",
  "conversation transcript",
  "full transcript"
];

const NOTE_TYPE_SCORING_RULES: Array<{
  noteType: NoteType;
  patterns: RegExp[];
}> = [
  {
    noteType: "policy",
    patterns: [/\bpolicy\b/, /\bgovern(?:ed|ance)?\b/, /\brules?\b/, /\bpromotion gate\b/, /\breview boundaries?\b/]
  },
  {
    noteType: "decision",
    patterns: [/\bdecision\b/, /\bdecide\b/, /\bchosen\b/, /\bselected\b/, /\btrade-?off\b/]
  },
  {
    noteType: "constraint",
    patterns: [/\bconstraint\b/, /\binvariant\b/, /\bmust not\b/, /\bcannot\b/, /\bnever\b/]
  },
  {
    noteType: "architecture",
    patterns: [/\barchitecture\b/, /\barchitectural\b/, /\blayer(?:ing)?\b/, /\bcomponent\b/, /\bpacket assembly\b/, /\bruntime flow\b/]
  },
  {
    noteType: "runbook",
    patterns: [/\brunbook\b/, /\boperator\b/, /\brecovery\b/, /\bplaybook\b/, /\btroubleshoot\b/, /\bprocedure\b/]
  },
  {
    noteType: "bug",
    patterns: [/\bbug\b/, /\berror\b/, /\bfailure\b/, /\bregression\b/, /\bbroken\b/, /\bfix\b/]
  },
  {
    noteType: "investigation",
    patterns: [/\binvestigation\b/, /\broot cause\b/, /\banalysis\b/, /\btrace\b/, /\bdiagnos(?:e|is)\b/]
  },
  {
    noteType: "glossary",
    patterns: [/\bglossary\b/, /\bdefinition\b/, /\bterminology\b/, /\bterm\b/]
  },
  {
    noteType: "handoff",
    patterns: [/\bhandoff\b/, /\bnext steps\b/, /\bfollow-?up\b/, /\boutstanding\b/, /\bpending work\b/]
  },
  {
    noteType: "reference",
    patterns: [/\breference\b/, /\blookup\b/, /\bcheat ?sheet\b/, /\bcatalog\b/, /\binventory\b/, /\bsummary\b/]
  }
];

export class NoteIngressService {
  classify(request: ClassifyNoteIngressRequest): ClassifyNoteIngressResponse {
    const normalizedSourceBasis = normalizeSourceBasis(
      request.sourceBasis,
      request.supportingSources.length
    );
    const currentStateIntent = request.currentStateIntent ?? false;
    const noteTypeResolution = resolveNoteType(request, normalizedSourceBasis);
    const targetCorpusResolution = resolveTargetCorpus(
      request,
      noteTypeResolution.value,
      currentStateIntent
    );
    const ingressShape = resolveIngressShape(noteTypeResolution.value);
    const rejectionReasons: string[] = [];
    let action: ClassifyNoteIngressResponse["action"] = "draft_candidate";
    let durability: ClassifyNoteIngressResponse["durability"] = "durable";
    let authorityRisk: NoteAuthorityRisk = ingressShape.authorityRisk;
    let reviewRequired = ingressShape.reviewRequired;
    let promotionEligible = false;
    const candidateSignals = inspectCandidateSignals(request, normalizedSourceBasis);
    let classificationConfidence = determineClassificationConfidence(
      request,
      normalizedSourceBasis,
      candidateSignals
    );
    let evidenceConfidence = determineEvidenceConfidence(
      normalizedSourceBasis,
      request.supportingSources.length,
      ingressShape.requiredProvenance
    );

    classificationConfidence = minConfidence(
      classificationConfidence,
      noteTypeResolution.confidence,
      targetCorpusResolution.confidence
    );

    if (
      targetCorpusResolution.value === "context_brain" &&
      request.supportingSources.some((source) =>
        source.notePath.replace(/\\/g, "/").startsWith("general_notes/")
      )
    ) {
      action = "reject";
      rejectionReasons.push(
        "Context-brain drafts cannot directly source from general_notes without explicit promotion."
      );
      durability = "transient";
    }

    const unsupportedSourceBasis = normalizedSourceBasis.filter(
      (basis) => !ingressShape.allowedSourceBasis.includes(basis)
    );
    if (unsupportedSourceBasis.length > 0) {
      action = "reject";
      rejectionReasons.push(
        `Unsupported source basis for ${noteTypeResolution.value}: ${unsupportedSourceBasis.join(", ")}.`
      );
      durability = "transient";
    }

    if (request.noteType === undefined && noteTypeResolution.confidence === "low") {
      action = "rewrite_required";
      rejectionReasons.push(
        "The runtime could not infer a stable note type from the candidate; provide stronger note-type cues or an explicit noteType."
      );
    }

    if (currentStateIntent) {
      authorityRisk = "critical";
      reviewRequired = true;
      promotionEligible = false;

      if (!normalizedSourceBasis.some((basis) => CURRENT_STATE_ALLOWED_SOURCE_BASIS.has(basis))) {
        action = "escalate";
        rejectionReasons.push(
          "Current-state draft intent requires repo_inspection, direct_observation, or retrieved_note source basis."
        );
        durability = "durable";
      }
    }

    const missingRequiredProvenance = !hasRequiredProvenance(
      normalizedSourceBasis,
      ingressShape.requiredProvenance
    );
    if (missingRequiredProvenance) {
      if ((authorityRisk === "high" || authorityRisk === "critical" || currentStateIntent) && action === "draft_candidate") {
        action = "rewrite_required";
        rejectionReasons.push(
          `Required provenance is missing; expected at least one of: ${ingressShape.requiredProvenance.join(", ")}.`
        );
      }
      evidenceConfidence = authorityRisk === "low" && !currentStateIntent ? "medium" : "low";
    }

    if (
      action === "draft_candidate" &&
      candidateSignals.transcriptLike &&
      normalizedSourceBasis.length === 1 &&
      normalizedSourceBasis[0] === "session_synthesis" &&
      request.supportingSources.length === 0
    ) {
      action = "reject";
      durability = "transient";
      classificationConfidence = "low";
      evidenceConfidence = "low";
      rejectionReasons.push(
        "Raw transcript-like session residue should stay in session history, not durable notes."
      );
    }

    if (
      action === "draft_candidate" &&
      !currentStateIntent &&
      candidateSignals.lowInformationSessionResidue &&
      authorityRisk === "low"
    ) {
      action = "session_only";
      durability = "session";
      rejectionReasons.push(
        "Session-synthesis-only candidates without a durable summary or captured details should remain session-only until refined."
      );
      classificationConfidence = "low";
      evidenceConfidence = "low";
    }

    const scope = normalizeScope(
      request.scopeHint,
      targetCorpusResolution.value === "context_brain" ? "staging" : "general_notes"
    );

    if (classificationConfidence === "low" && action === "draft_candidate" && authorityRisk !== "low") {
      action = "rewrite_required";
      rejectionReasons.push(
        "The candidate needs a clearer scope, summary, or captured details before it can enter durable staging."
      );
    }

    if (
      action === "draft_candidate" &&
      authorityRisk !== "low" &&
      candidateSignals.vagueHighRiskCandidate
    ) {
      action = "rewrite_required";
      classificationConfidence = "low";
      rejectionReasons.push(
        "High-risk drafts need a specific title, scope, and captured details before durable staging."
      );
    }

    if (action === "rewrite_required") {
      durability = "durable";
    }

    if (action === "escalate") {
      durability = "durable";
    }

    return {
      contractVersion: "note-ingress.v1",
      policyVersion: NOTE_INGRESS_POLICY_VERSION,
      classificationHash: createClassificationHash({
        noteType: noteTypeResolution.value,
        targetCorpus: targetCorpusResolution.value,
        scope,
        authorityRisk,
        sourceBasis: normalizedSourceBasis,
        currentStateIntent,
        action
      }),
      action,
      noteType: noteTypeResolution.value,
      targetCorpus: targetCorpusResolution.value,
      scope,
      durability,
      authorityRisk,
      reviewRequired,
      promotionEligible,
      requiredTemplate: ingressShape.requiredTemplate,
      requiredSections: ingressShape.requiredSections,
      requiredProvenance: ingressShape.requiredProvenance,
      allowedSourceBasis: ingressShape.allowedSourceBasis,
      validationConstraints: buildDefaultValidationConstraints(!currentStateIntent),
      rejectionReasons,
      mergeHints: [],
      classificationConfidence,
      evidenceConfidence
    };
  }

  classifyDraftRequest(request: DraftNoteRequest): ClassifyNoteIngressResponse {
    return this.classify({
      actor: request.actor,
      targetCorpus: request.targetCorpus,
      noteType: request.noteType,
      title: request.title,
      sourcePrompt: request.sourcePrompt,
      supportingSources: request.supportingSources,
      bodyHints: request.bodyHints,
      scopeHint: request.scopeHint ?? request.frontmatterOverrides?.scope,
      candidateSummary: request.candidateSummary,
      currentStateIntent: request.currentStateIntent ?? request.frontmatterOverrides?.currentState,
      sourceBasis: request.sourceBasis
    });
  }
}

function normalizeSourceBasis(
  value: NoteSourceBasis[] | undefined,
  supportingSourceCount: number
): NoteSourceBasis[] {
  if (value && value.length > 0) {
    return [...new Set(value)];
  }

  if (supportingSourceCount > 0) {
    return ["retrieved_note"];
  }

  return ["session_synthesis"];
}

function determineEvidenceConfidence(
  sourceBasis: NoteSourceBasis[],
  supportingSourceCount: number,
  requiredProvenance: NoteSourceBasis[]
): ClassifyNoteIngressResponse["evidenceConfidence"] {
  if (!hasRequiredProvenance(sourceBasis, requiredProvenance)) {
    return "low";
  }

  if (
    supportingSourceCount > 0 ||
    sourceBasis.some((basis) =>
      basis === "repo_inspection" ||
      basis === "direct_observation" ||
      basis === "retrieved_note" ||
      basis === "inferred_multi_source"
    )
  ) {
    return "high";
  }

  if (sourceBasis.length === 1 && sourceBasis[0] === "user_instruction") {
    return "medium";
  }

  if (sourceBasis.includes("session_synthesis")) {
    return "low";
  }

  return "medium";
}

function determineClassificationConfidence(
  request: ClassifyNoteIngressRequest,
  sourceBasis: NoteSourceBasis[],
  candidateSignals: CandidateSignals
): ClassifyNoteIngressResponse["classificationConfidence"] {
  if (
    candidateSignals.transcriptLike ||
    candidateSignals.lowInformationSessionResidue ||
    candidateSignals.vagueHighRiskCandidate
  ) {
    return "low";
  }

  if (
    !request.scopeHint &&
    !request.candidateSummary &&
    (!request.bodyHints || request.bodyHints.length === 0) &&
    request.supportingSources.length === 0 &&
    sourceBasis.length === 1 &&
    sourceBasis[0] === "session_synthesis"
  ) {
    return "low";
  }

  if (
    !request.scopeHint ||
    (!request.candidateSummary &&
      (!request.bodyHints || request.bodyHints.length === 0) &&
      request.supportingSources.length === 0)
  ) {
    return "medium";
  }

  return "high";
}

function resolveNoteType(
  request: ClassifyNoteIngressRequest,
  sourceBasis: NoteSourceBasis[]
): { value: NoteType; confidence: ClassifyNoteIngressResponse["classificationConfidence"] } {
  if (request.noteType) {
    return {
      value: request.noteType,
      confidence: "high"
    };
  }

  const inferred = inferNoteType(request, sourceBasis);
  return inferred ?? {
    value: sourceBasis.length === 1 && sourceBasis[0] === "session_synthesis"
      ? "handoff"
      : "reference",
    confidence: "low"
  };
}

function resolveTargetCorpus(
  request: ClassifyNoteIngressRequest,
  noteType: NoteType,
  currentStateIntent: boolean
): { value: CorpusId; confidence: ClassifyNoteIngressResponse["classificationConfidence"] } {
  if (request.targetCorpus) {
    return {
      value: request.targetCorpus,
      confidence: "high"
    };
  }

  if (currentStateIntent) {
    return {
      value: "context_brain",
      confidence: "high"
    };
  }

  if (
    noteType === "decision" ||
    noteType === "constraint" ||
    noteType === "bug" ||
    noteType === "investigation" ||
    noteType === "runbook" ||
    noteType === "architecture"
  ) {
    return {
      value: "context_brain",
      confidence: "high"
    };
  }

  return {
    value: "general_notes",
    confidence: noteType === "reference" ? "medium" : "high"
  };
}

function hasRequiredProvenance(
  sourceBasis: NoteSourceBasis[],
  requiredProvenance: NoteSourceBasis[]
): boolean {
  return requiredProvenance.length === 0 ||
    requiredProvenance.some((basis) => sourceBasis.includes(basis));
}

function normalizeScope(scopeHint: string | undefined, fallback: string): string {
  const raw = (scopeHint ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");

  return raw || fallback;
}

function inferNoteType(
  request: ClassifyNoteIngressRequest,
  sourceBasis: NoteSourceBasis[]
): { value: NoteType; confidence: ClassifyNoteIngressResponse["classificationConfidence"] } | null {
  const text = [
    request.title,
    request.sourcePrompt,
    request.candidateSummary ?? "",
    ...(request.bodyHints ?? [])
  ]
    .join("\n")
    .toLowerCase();

  const scores = new Map<NoteType, number>();
  for (const rule of NOTE_TYPE_SCORING_RULES) {
    const score = rule.patterns.reduce(
      (total, pattern) => total + (pattern.test(text) ? 2 : 0),
      0
    );
    scores.set(rule.noteType, score);
  }

  if (sourceBasis.includes("session_synthesis") && request.supportingSources.length === 0) {
    incrementScore(scores, "handoff", 1);
  }
  if (sourceBasis.includes("user_instruction")) {
    incrementScore(scores, "policy", 1);
  }
  if (sourceBasis.includes("repo_inspection")) {
    incrementScore(scores, "architecture", 1);
    incrementScore(scores, "decision", 1);
    incrementScore(scores, "constraint", 1);
    incrementScore(scores, "reference", 1);
  }
  if (sourceBasis.includes("retrieved_note")) {
    incrementScore(scores, "reference", 1);
    incrementScore(scores, "architecture", 1);
    incrementScore(scores, "decision", 1);
  }
  if (sourceBasis.includes("direct_observation")) {
    incrementScore(scores, "bug", 1);
    incrementScore(scores, "runbook", 1);
    incrementScore(scores, "investigation", 1);
  }
  if (sourceBasis.includes("inferred_multi_source")) {
    incrementScore(scores, "architecture", 1);
    incrementScore(scores, "decision", 1);
    incrementScore(scores, "policy", 1);
  }

  const ranked = [...scores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });
  const [topType, topScore] = ranked[0] ?? [];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (!topType || topScore <= 0) {
    return null;
  }

  if (topScore >= 4 && topScore - secondScore >= 2) {
    return { value: topType, confidence: "high" };
  }

  if (topScore >= 2 && topScore > secondScore) {
    return { value: topType, confidence: "medium" };
  }

  return {
    value: topType,
    confidence: "low"
  };
}

interface CandidateSignals {
  genericTitle: boolean;
  transcriptLike: boolean;
  lowInformationSessionResidue: boolean;
  vagueHighRiskCandidate: boolean;
}

function inspectCandidateSignals(
  request: ClassifyNoteIngressRequest,
  sourceBasis: NoteSourceBasis[]
): CandidateSignals {
  const normalizedTitle = request.title.trim().toLowerCase();
  const normalizedPrompt = request.sourcePrompt.trim().toLowerCase();
  const normalizedSummary = (request.candidateSummary ?? "").trim().toLowerCase();
  const bodyHints = request.bodyHints ?? [];
  const genericTitle =
    GENERIC_NOTE_TITLES.has(normalizedTitle) ||
    normalizedTitle.length <= 6 ||
    /^note[s]?\b/.test(normalizedTitle);
  const transcriptLike =
    matchesAnyKeyword(normalizedTitle, TRANSCRIPT_KEYWORDS) ||
    matchesAnyKeyword(normalizedPrompt, TRANSCRIPT_KEYWORDS) ||
    matchesAnyKeyword(normalizedSummary, TRANSCRIPT_KEYWORDS) ||
    /\braw transcript\b|\bchat transcript\b|\bconversation transcript\b/.test(normalizedPrompt) ||
    /\braw transcript\b|\bchat transcript\b|\bconversation transcript\b/.test(normalizedSummary);
  const hasCapturedDetail =
    request.supportingSources.length > 0 ||
    bodyHints.length > 0 ||
    normalizedSummary.length >= 40;
  const lowInformationSessionResidue =
    sourceBasis.length === 1 &&
    sourceBasis[0] === "session_synthesis" &&
    request.supportingSources.length === 0 &&
    !request.scopeHint &&
    !hasCapturedDetail &&
    (genericTitle ||
      /\bremember\b.*\bconversation\b/.test(normalizedPrompt) ||
      /\bfor later\b/.test(normalizedPrompt) ||
      /\btemporary recall\b/.test(normalizedSummary));
  const vagueHighRiskCandidate =
    request.supportingSources.length === 0 &&
    bodyHints.length === 0 &&
    !request.candidateSummary &&
    (!request.scopeHint || genericTitle) &&
    (genericTitle ||
      normalizedPrompt.length < 24 ||
      /^(some thoughts\.?|quick note\.?|small update\.?)$/.test(normalizedPrompt));

  return {
    genericTitle,
    transcriptLike,
    lowInformationSessionResidue,
    vagueHighRiskCandidate
  };
}

function matchesAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function incrementScore(scores: Map<NoteType, number>, noteType: NoteType, delta: number): void {
  scores.set(noteType, (scores.get(noteType) ?? 0) + delta);
}

function minConfidence(
  ...values: ClassifyNoteIngressResponse["classificationConfidence"][]
): ClassifyNoteIngressResponse["classificationConfidence"] {
  if (values.includes("low")) {
    return "low";
  }

  if (values.includes("medium")) {
    return "medium";
  }

  return "high";
}

function createClassificationHash(input: {
  noteType: string;
  targetCorpus: string;
  scope: string;
  authorityRisk: string;
  sourceBasis: string[];
  currentStateIntent: boolean;
  action: string;
}): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(input));
  return hash.digest("hex");
}
