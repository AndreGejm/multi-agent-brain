import type { ActorRole } from "@multi-agent-brain/contracts";

export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  defaultActorRole: ActorRole;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOL_DEFINITIONS: ReadonlyArray<McpToolDefinition> = [
  {
    name: "execute_coding_task",
    title: "Execute Coding Task",
    description: "Run a coding-domain task through the vendored safety-gated coding runtime.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["taskType", "task"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        taskType: {
          type: "string",
          enum: ["triage", "review", "draft_patch", "generate_tests", "summarize_diff", "propose_fix"]
        },
        task: { type: "string" },
        context: { type: "string" },
        repoRoot: { type: "string" },
        filePath: { type: "string" },
        symbolName: { type: "string" },
        diffText: { type: "string" },
        pytestTarget: { type: "string" },
        lintTarget: { type: "string" }
      }
    }
  },
  {
    name: "search_context",
    title: "Search Context",
    description: "Run bounded hybrid retrieval and return a context packet with provenance.",
    defaultActorRole: "retrieval",
    inputSchema: {
      type: "object",
      required: ["query", "corpusIds", "budget"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        query: { type: "string" },
        corpusIds: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: ["context_brain", "general_notes"] }
        },
        budget: {
          type: "object",
          required: ["maxTokens", "maxSources", "maxRawExcerpts", "maxSummarySentences"],
          properties: {
            maxTokens: { type: "number" },
            maxSources: { type: "number" },
            maxRawExcerpts: { type: "number" },
            maxSummarySentences: { type: "number" }
          }
        },
        intentHint: { type: "string" },
        noteTypePriority: { type: "array", items: { type: "string" } },
        tagFilters: { type: "array", items: { type: "string" } },
        includeSuperseded: { type: "boolean" },
        requireEvidence: { type: "boolean" }
      }
    }
  },
  {
    name: "list_context_tree",
    title: "List Context Tree",
    description: "List namespace nodes without mutating authority state.",
    defaultActorRole: "retrieval",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        ownerScope: { type: "string" },
        authorityStates: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  },
  {
    name: "read_context_node",
    title: "Read Context Node",
    description: "Read a namespace node without mutating authority state.",
    defaultActorRole: "retrieval",
    inputSchema: {
      type: "object",
      required: ["uri"],
      additionalProperties: true,
      properties: {
        uri: { type: "string" }
      }
    }
  },
  {
    name: "get_context_packet",
    title: "Get Context Packet",
    description: "Assemble a bounded context packet directly from ranked candidates and a retrieval budget.",
    defaultActorRole: "retrieval",
    inputSchema: {
      type: "object",
      required: ["intent", "budget", "candidates", "includeRawExcerpts"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        intent: {
          type: "string",
          enum: [
            "fact_lookup",
            "decision_lookup",
            "implementation_guidance",
            "architecture_recall",
            "status_timeline",
            "debugging"
          ]
        },
        budget: {
          type: "object",
          required: ["maxTokens", "maxSources", "maxRawExcerpts", "maxSummarySentences"],
          properties: {
            maxTokens: { type: "number" },
            maxSources: { type: "number" },
            maxRawExcerpts: { type: "number" },
            maxSummarySentences: { type: "number" }
          }
        },
        candidates: {
          type: "array",
          items: {
            type: "object",
            required: [
              "noteType",
              "score",
              "summary",
              "scope",
              "qualifiers",
              "tags",
              "stalenessClass",
              "provenance"
            ],
            additionalProperties: true,
            properties: {
              noteType: { type: "string" },
              score: { type: "number" },
              summary: { type: "string" },
              rawText: { type: "string" },
              scope: { type: "string" },
              qualifiers: { type: "array", items: { type: "string" } },
              tags: { type: "array", items: { type: "string" } },
              stalenessClass: {
                type: "string",
                enum: ["current", "stale", "superseded"]
              },
              provenance: {
                type: "object",
                required: ["noteId", "notePath", "headingPath"],
                additionalProperties: true,
                properties: {
                  noteId: { type: "string" },
                  chunkId: { type: "string" },
                  notePath: { type: "string" },
                  headingPath: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          }
        },
        includeRawExcerpts: { type: "boolean" }
      }
    }
  },
  {
    name: "list_review_queue",
    title: "List Review Queue",
    description: "List the active governed review queue for thin operator frontends.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        targetCorpus: { type: "string", enum: ["context_brain", "general_notes"] },
        includeRejected: { type: "boolean" }
      }
    }
  },
  {
    name: "read_review_note",
    title: "Read Review Note",
    description: "Read a full review payload for one staged draft note.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["draftNoteId"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        draftNoteId: { type: "string" }
      }
    }
  },
  {
    name: "accept_note",
    title: "Accept Note",
    description: "Accept a staged review note through the orchestrator-owned approve, ready, and promote flow.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["draftNoteId"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        draftNoteId: { type: "string" }
      }
    }
  },
  {
    name: "reject_note",
    title: "Reject Note",
    description: "Reject and archive a staged review note under orchestrator control.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["draftNoteId"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        draftNoteId: { type: "string" },
        reviewNotes: { type: "string" }
      }
    }
  },
  {
    name: "create_refresh_draft",
    title: "Create Refresh Draft",
    description: "Create a governed staging refresh draft for an expired or expiring current-state canonical note.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["noteId"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        noteId: { type: "string" },
        asOf: { type: "string" },
        expiringWithinDays: { type: "number" },
        bodyHints: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "create_refresh_drafts",
    title: "Create Refresh Drafts",
    description: "Create a bounded batch of governed staging refresh drafts from current temporal-validity candidates.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        asOf: { type: "string" },
        expiringWithinDays: { type: "number" },
        corpusId: { type: "string", enum: ["context_brain", "general_notes"] },
        limitPerCategory: { type: "number" },
        maxDrafts: { type: "number" },
        sourceStates: {
          type: "array",
          items: {
            type: "string",
            enum: ["expired", "future_dated", "expiring_soon"]
          }
        },
        bodyHints: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "import_resource",
    title: "Import Resource",
    description: "Record a controlled import job without writing canonical memory.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["sourcePath", "importKind"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        sourcePath: { type: "string" },
        importKind: { type: "string" }
      }
    }
  },
  {
    name: "classify_note_ingress",
    title: "Classify Note Ingress",
    description: "Resolve the governed note-ingress contract for a candidate before any draft is written.",
    defaultActorRole: "writer",
    inputSchema: {
      type: "object",
      required: ["title", "sourcePrompt", "supportingSources"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        targetCorpus: { type: "string", enum: ["context_brain", "general_notes"] },
        noteType: { type: "string" },
        title: { type: "string" },
        sourcePrompt: { type: "string" },
        supportingSources: { type: "array", items: { type: "object" } },
        bodyHints: { type: "array", items: { type: "string" } },
        scopeHint: { type: "string" },
        candidateSummary: { type: "string" },
        currentStateIntent: { type: "boolean" },
        sourceBasis: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "draft_note",
    title: "Draft Note",
    description: "Create a staging draft through the writer-only drafting service.",
    defaultActorRole: "writer",
    inputSchema: {
      type: "object",
      required: ["targetCorpus", "noteType", "title", "sourcePrompt", "supportingSources"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        targetCorpus: { type: "string", enum: ["context_brain", "general_notes"] },
        noteType: { type: "string" },
        title: { type: "string" },
        sourcePrompt: { type: "string" },
        supportingSources: { type: "array", items: { type: "object" } },
        frontmatterOverrides: { type: "object" },
        bodyHints: { type: "array", items: { type: "string" } },
        candidateSummary: { type: "string" },
        sourceBasis: { type: "array", items: { type: "string" } },
        classification: { type: "object" }
      }
    }
  },
  {
    name: "review_draft_note",
    title: "Review Draft Note",
    description: "Record an explicit governed review decision for a staging draft before promotion.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["draftNoteId", "decision"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        draftNoteId: { type: "string" },
        decision: {
          type: "string",
          enum: [
            "approve_draft",
            "request_rewrite",
            "require_merge",
            "reject",
            "escalate",
            "set_promotion_ready"
          ]
        },
        reviewNotes: { type: "string" }
      }
    }
  },
  {
    name: "fetch_decision_summary",
    title: "Fetch Decision Summary",
    description: "Retrieve a bounded decision packet for a topic from canonical context.",
    defaultActorRole: "retrieval",
    inputSchema: {
      type: "object",
      required: ["topic", "budget"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        topic: { type: "string" },
        budget: {
          type: "object",
          required: ["maxTokens", "maxSources", "maxRawExcerpts", "maxSummarySentences"],
          properties: {
            maxTokens: { type: "number" },
            maxSources: { type: "number" },
            maxRawExcerpts: { type: "number" },
            maxSummarySentences: { type: "number" }
          }
        }
      }
    }
  },
  {
    name: "validate_note",
    title: "Validate Note",
    description: "Run deterministic note schema validation without mutating state.",
    defaultActorRole: "orchestrator",
    inputSchema: {
      type: "object",
      required: ["targetCorpus", "notePath", "frontmatter", "body", "validationMode"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        targetCorpus: { type: "string", enum: ["context_brain", "general_notes"] },
        notePath: { type: "string" },
        frontmatter: { type: "object" },
        body: { type: "string" },
        validationMode: { type: "string", enum: ["draft", "promotion"] }
      }
    }
  },
  {
    name: "promote_note",
    title: "Promote Note",
    description: "Promote a staging draft into canonical memory through the deterministic orchestrator.",
    defaultActorRole: "orchestrator",
    inputSchema: {
      type: "object",
      required: ["draftNoteId", "targetCorpus", "promoteAsCurrentState"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        draftNoteId: { type: "string" },
        targetCorpus: { type: "string", enum: ["context_brain", "general_notes"] },
        expectedDraftRevision: { type: "string" },
        targetPath: { type: "string" },
        promoteAsCurrentState: { type: "boolean" }
      }
    }
  },
  {
    name: "query_history",
    title: "Query History",
    description: "Query bounded audit history for notes and promotion actions.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["limit"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        noteId: { type: "string" },
        since: { type: "string" },
        until: { type: "string" },
        limit: { type: "number" }
      }
    }
  },
  {
    name: "create_session_archive",
    title: "Create Session Archive",
    description: "Persist an immutable non-authoritative session archive without creating drafts or canonical notes.",
    defaultActorRole: "operator",
    inputSchema: {
      type: "object",
      required: ["sessionId", "messages"],
      additionalProperties: true,
      properties: {
        actor: { type: "object" },
        sessionId: { type: "string" },
        messages: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["role", "content"],
            additionalProperties: false,
            properties: {
              role: {
                type: "string",
                enum: ["system", "user", "assistant", "tool"]
              },
              content: { type: "string" }
            }
          }
        }
      }
    }
  }
];

export function getToolDefinition(name: string): McpToolDefinition | undefined {
  return MCP_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
