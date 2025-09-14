// OpenAPI 3.1 specification for cat-toxicity-api
export const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "cat-toxicity-api",
    version: "1.0.0",
    description:
      "Cloudflare Worker + D1 API mirroring the ASPCA Cats Plant List. Search plant names and fetch toxicity details for cats.",
    contact: { name: "cat-toxicity-api" },
  },
  servers: [
    { url: "https://cat-toxicity-api.ehamiter.workers.dev", description: "Production" },
  ],
  paths: {
    "/": {
      get: {
        summary: "Service index and available routes",
        responses: {
          200: {
            description: "Index",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IndexResponse" },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Liveness check",
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } },
            },
          },
        },
      },
    },
    "/version": {
      get: {
        summary: "Dataset and schema versions",
        responses: {
          200: {
            description: "Version info",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/VersionResponse" } },
            },
          },
        },
      },
    },
    "/search": {
      get: {
        summary: "Search by common or scientific name (FTS prefix)",
        parameters: [
          { in: "query", name: "q", required: true, schema: { type: "string" }, description: "Search term" },
        ],
        responses: {
          200: {
            description: "Search results",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } },
            },
          },
          400: {
            description: "Missing or invalid query",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/species/{id}": {
      get: {
        summary: "Detailed species info including names, toxicity entries, and sources",
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "integer", minimum: 1 } },
        ],
        responses: {
          200: {
            description: "Species detail",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SpeciesResponse" } },
            },
          },
          404: {
            description: "Not found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },
    "/docs": {
      get: {
        summary: "Markdown API documentation",
        responses: {
          200: { description: "Markdown", content: { "text/markdown": { schema: { type: "string" } } } },
        },
      },
    },
    "/llm": {
      get: {
        summary: "Machine-readable API summary for LLM tools/agents",
        responses: {
          200: { description: "LLM manifest", content: { "application/json": { schema: { $ref: "#/components/schemas/LLMManifest" } } } },
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "OpenAPI 3.1 specification",
        responses: {
          200: { description: "OpenAPI JSON", content: { "application/json": { schema: { type: "object" } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      IndexResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          routes: { type: "array", items: { type: "string" } },
        },
        required: ["ok", "routes"],
      },
      VersionResponse: {
        type: "object",
        properties: {
          dataset_version: { type: "string" },
          schema_version: { type: "string" },
        },
        required: ["dataset_version", "schema_version"],
      },
      SearchResult: {
        type: "object",
        properties: {
          id: { type: "integer" },
          display_name: { type: "string" },
          verdict: { type: ["string", "null"], enum: ["toxic", "safe", null] },
          severity: { type: ["string", "null"] },
        },
        required: ["id", "display_name"],
      },
      SearchResponse: {
        type: "object",
        properties: {
          q: { type: "string" },
          results: { type: "array", items: { $ref: "#/components/schemas/SearchResult" } },
        },
        required: ["q", "results"],
      },
      Species: {
        type: "object",
        properties: {
          id: { type: "integer" },
          scientific_name: { type: "string" },
          genus: { type: ["string", "null"] },
          family: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          created_at_utc: { type: ["string", "null"] },
          updated_at_utc: { type: ["string", "null"] },
        },
        required: ["id", "scientific_name"],
      },
      Name: {
        type: "object",
        properties: {
          name: { type: "string" },
          locale: { type: "string" },
          is_primary: { type: "integer" },
        },
        required: ["name", "is_primary"],
      },
      Toxicity: {
        type: "object",
        properties: {
          verdict: { type: ["string", "null"] },
          severity: { type: ["string", "null"] },
          parts: { type: ["string", "null"] },
          symptoms_short: { type: ["string", "null"] },
          evidence_level: { type: ["string", "null"] },
          source_id: { type: ["integer", "null"] },
          reviewed_at_utc: { type: ["string", "null"] },
        },
      },
      Source: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          url: { type: ["string", "null"] },
          license: { type: ["string", "null"] },
          access_date_utc: { type: ["string", "null"] },
        },
        required: ["id", "name"],
      },
      SpeciesResponse: {
        type: "object",
        properties: {
          species: { $ref: "#/components/schemas/Species" },
          names: { type: "array", items: { $ref: "#/components/schemas/Name" } },
          toxicity: { type: "array", items: { $ref: "#/components/schemas/Toxicity" } },
          sources: { type: "array", items: { $ref: "#/components/schemas/Source" } },
        },
        required: ["species", "names", "toxicity", "sources"],
      },
      ErrorResponse: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
      LLMManifest: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          base_url: { type: "string" },
          auth: { type: "object", properties: { type: { type: "string" } }, required: ["type"] },
          endpoints: { type: "array", items: { type: "object" } },
          guidance: { type: "array", items: { type: "string" } },
          cache: { type: "object" },
        },
        required: ["name", "description", "base_url", "auth", "endpoints"],
      },
    },
  },
} as const;
