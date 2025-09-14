// src/index.ts
import { openapiSpec } from "./openapi";
type Env = {
  DB: D1Database;
  CACHE_SECONDS: string;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
      ...(init.headers || {}),
    },
  });

const text = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      ...CORS,
      ...(init.headers || {}),
    },
  });

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...CORS,
      ...(init.headers || {}),
    },
  });

function dropNullish<T extends Record<string, any>>(obj: T) {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;   // drop nullish
    if (typeof v === "string" && v.trim() === "") continue; // drop empty strings
    out[k] = v;
  }
  return out as T;
}

function parseCacheSeconds(env: Env): number {
  const n = Number.parseInt(env.CACHE_SECONDS, 10);
  return Number.isFinite(n) && n >= 0 ? n : 600;
}

function sanitizeTerms(q: string): string[] {
  const tokens = q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const uniq: string[] = [];
  for (const t of tokens) if (!uniq.includes(t)) uniq.push(t);
  return uniq.slice(0, 5);
}


export default {
  async fetch(req: Request, env: Env): Promise<Response> {

    // handle preflight
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { ...CORS, "access-control-max-age": "600" } });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const cacheSecs = parseCacheSeconds(env);

    // 0) index
    if (path === "/")
      return json(
        {
          ok: true,
          routes: [
            "/health",
            "/version",
            "/species/:id",
            "/search?q=term",
            "/docs",
            "/llm",
            "/openapi.json",
             "/swagger",
          ],
        },
        { headers: { "cache-control": "public, max-age=60, s-maxage=60" } }
      );

    // 1) health
    if (path === "/health") return json({ ok: true });

  // 2) version
    if (path === "/version") {
      const rows = await env.DB.prepare(
        "SELECT key, value FROM meta WHERE key IN ('dataset_version','schema_version')"
      ).all();
      const out: Record<string, string> = {};
      for (const r of (rows.results as any[]) || []) out[r.key] = r.value;
      return json(out, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
    }

    // 2.7) OpenAPI JSON
    if (path === "/openapi.json") {
      return json(openapiSpec, {
        headers: { "cache-control": "public, max-age=600, s-maxage=600" },
      });
    }

      // 2.8) Swagger UI — interactive docs
      if (path === "/swagger") {
        const page = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>cat-toxicity-api — Swagger UI</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
      <style>body { margin: 0; } #swagger-ui { max-width: 1100px; margin: 0 auto; }</style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
      <script>
        window.ui = SwaggerUIBundle({
          url: '${url.origin}/openapi.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout'
        });
      </script>
    </body>
  </html>`;
        return html(page, { headers: { "cache-control": "public, max-age=600, s-maxage=600" } });
      }

    // 2.5) docs — Markdown API reference for humans
    if (path === "/docs") {
      const md = `# cat-toxicity-api — API docs\n\n` +
`Base URL\n\n- Production: https://cat-toxicity-api.ehamiter.workers.dev/\n\n` +
`## Endpoints\n\n` +
`### GET /health\nLiveness check.\n\nResponse\n\n{ \\"ok\\": true }\n\n` +
`### GET /version\nDataset and schema versions.\n\nResponse\n\n{ \\"dataset_version\\": \\"YYYY-MM-DD\\", \\"schema_version\\": \\"1\\" }\n\n` +
`### GET /search?q=term\nSearch by common or scientific name (case-insensitive, punctuation ignored, FTS prefix).\n\nParameters\n- q (string): search term.\n\nResponse\n\n{\n  \"q\": \"term\",\n  \"results\": [ { \"id\": 1, \"display_name\": \"string\", \"verdict\": \"toxic|safe|null\", \"severity\": \"string?\" } ]\n}\n\n` +
`### GET /species/:id\nDetailed species info, names, toxicity entries, and sources.\n\nResponse\n\n{\n  \"species\": { \"id\": 1, \"scientific_name\": \"string\", \"genus\": \"string?\", \"family\": \"string?\" },\n  \"names\": [ { \"name\": \"string\", \"locale\": \"en\", \"is_primary\": 1 } ],\n  \"toxicity\": [ { \"verdict\": \"toxic|safe|null\", \"severity\": \"string?\", \"parts\": \"string?\", \"symptoms_short\": \"string?\", \"evidence_level\": \"authoritative|reputable|other?\", \"source_id\": 1, \"reviewed_at_utc\": \"ISO8601\" } ],\n  \"sources\": [ { \"id\": 1, \"name\": \"string\", \"url\": \"string?\", \"license\": \"string?\", \"access_date_utc\": \"ISO8601\" } ]\n}\n\n` +
`## Notes\n- CORS: GET and OPTIONS allowed, wildcard origin.\n- Cache: /search honors CACHE_SECONDS; /version ~5m; /species ~1h; /docs and /llm ~10m.\n- Workflow: search first, then fetch /species/:id for details and sources.\n`;
      return text(md, { headers: { "cache-control": "public, max-age=600, s-maxage=600" } });
    }

    // 3) search?q=...
    if (path === "/search") {
      const q = url.searchParams.get("q")?.trim();
      if (!q) return json({ error: "missing q" }, { status: 400 });
      const terms = sanitizeTerms(q);
      if (!terms.length) return json({ error: "invalid q" }, { status: 400 });

      // exact name match first
      const exact = await env.DB.prepare(
        `SELECT s.id,
                COALESCE(MAX(CASE WHEN n.is_primary=1 THEN n.name END), MIN(n.name), s.scientific_name) AS display_name,
                (SELECT verdict FROM toxicity WHERE species_id=s.id
                   ORDER BY CASE evidence_level WHEN 'authoritative' THEN 1 WHEN 'reputable' THEN 2 ELSE 3 END, id
                   LIMIT 1) AS verdict,
                (SELECT severity FROM toxicity WHERE species_id=s.id
                   ORDER BY CASE evidence_level WHEN 'authoritative' THEN 1 WHEN 'reputable' THEN 2 ELSE 3 END, id
                   LIMIT 1) AS severity
         FROM names n
         JOIN species s ON s.id = n.species_id
         WHERE lower(n.name) = lower(?)
         GROUP BY s.id
         LIMIT 5`
      ).bind(q).all();

      let results = (exact.results as any[]) || [];

      // fallback: simple FTS prefix search on search_index
    if (!results.length) {
      const ftsQuery = terms.map((t) => `${t}*`).join(" OR ");
      const fuzzy = await env.DB.prepare(
       `SELECT s.id,
            COALESCE(n2.name, s.scientific_name) AS display_name,
            (SELECT verdict FROM toxicity WHERE species_id=s.id
              ORDER BY CASE evidence_level WHEN 'authoritative' THEN 1 WHEN 'reputable' THEN 2 ELSE 3 END, id
              LIMIT 1) AS verdict,
            (SELECT severity FROM toxicity WHERE species_id=s.id
              ORDER BY CASE evidence_level WHEN 'authoritative' THEN 1 WHEN 'reputable' THEN 2 ELSE 3 END, id
              LIMIT 1) AS severity
        FROM search_index si
        JOIN species s ON s.id = si.species_id
        LEFT JOIN names n2 ON n2.species_id = s.id AND n2.is_primary = 1
        WHERE si.term MATCH ?
        GROUP BY s.id
        LIMIT 10`
      ).bind(ftsQuery).all();
      results = (fuzzy.results as any[]) || [];
    }

      results = results.map((r: any) => {
        // explicitly drop severity if it’s null/empty so cards just show verdict
        if (r.severity == null || (typeof r.severity === "string" && r.severity.trim() === "")) {
          delete r.severity;
        }
        return r;
      });

    

      return json(
        { q, results },
        { headers: { "cache-control": `public, max-age=${cacheSecs}, s-maxage=${cacheSecs}` } }
      );

    }

    // 3.5) llm — machine-readable summary for tooling/agents
    if (path === "/llm") {
      const baseUrl = `${url.origin}`;
      const payload = {
        name: "cat-toxicity-api",
        description:
          "Cloudflare Worker + D1 API for cat plant toxicity, mirroring the ASPCA Cats Plant List. Search plants and retrieve toxicity details for cats.",
        base_url: baseUrl,
        auth: { type: "none" },
        endpoints: [
          {
            method: "GET",
            path: "/health",
            summary: "Liveness check",
            response: { ok: true },
          },
          {
            method: "GET",
            path: "/version",
            summary: "Dataset and schema versions",
            response: { dataset_version: "string", schema_version: "string" },
          },
          {
            method: "GET",
            path: "/search",
            query: { q: "string" },
            summary: "Search by common or scientific name (FTS prefix)",
            response: {
              q: "string",
              results: [
                {
                  id: 0,
                  display_name: "string",
                  verdict: "toxic|safe|null",
                  severity: "string?",
                },
              ],
            },
          },
          {
            method: "GET",
            path: "/species/:id",
            summary: "Detailed species info including names, toxicity entries, and sources",
            response: {
              species: {
                id: 0,
                scientific_name: "string",
                genus: "string?",
                family: "string?",
              },
              names: [
                { name: "string", locale: "en", is_primary: 1 },
              ],
              toxicity: [
                {
                  verdict: "toxic|safe|null",
                  severity: "string?",
                  parts: "string?",
                  symptoms_short: "string?",
                  evidence_level: "authoritative|reputable|other?",
                  source_id: 1,
                  reviewed_at_utc: "ISO8601",
                },
              ],
              sources: [
                {
                  id: 1,
                  name: "string",
                  url: "string?",
                  license: "string?",
                  access_date_utc: "ISO8601",
                },
              ],
            },
          },
        ],
        guidance: [
          "Search first using /search, then call /species/:id for full details.",
          "Queries are case-insensitive; punctuation is ignored.",
          "display_name is the best common name; severity may be absent; treat absent fields as unknown.",
          "CORS is enabled for GET; follow cache headers to avoid unnecessary calls.",
        ],
        cache: {
          search_seconds: parseCacheSeconds(env),
          version_seconds: 300,
          species_seconds: 3600,
        },
      } as const;

      return json(payload, { headers: { "cache-control": "public, max-age=600, s-maxage=600" } });
    }

    // 4) species/:id
    const m = path.match(/^\/species\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const species = await env.DB.prepare("SELECT * FROM species WHERE id=?").bind(id).first();
      if (!species) return json({ error: "not found" }, { status: 404 });

      const names = await env.DB.prepare(
        "SELECT name, locale, is_primary FROM names WHERE species_id=? ORDER BY is_primary DESC, name"
      ).bind(id).all();

      const toxRaw = await env.DB.prepare(`
        SELECT verdict, severity, parts, symptoms_short, evidence_level, source_id, reviewed_at_utc
        FROM toxicity WHERE species_id=?
        ORDER BY CASE evidence_level WHEN 'authoritative' THEN 1 WHEN 'reputable' THEN 2 ELSE 3 END, id
      `).bind(id).all();

      const tox = (toxRaw.results as any[]).map(dropNullish);

      const speciesClean = dropNullish(species);
      const namesClean = (names.results as any[]).map(dropNullish);

  const sourceIds = Array.from(new Set((tox as any[]).map((r: any) => r.source_id).filter(Boolean)));
      const sources = sourceIds.length
        ? (await env.DB.prepare(
            `SELECT id, name, url, license, access_date_utc FROM sources WHERE id IN (${sourceIds.map(() => "?").join(",")})`
          ).bind(...sourceIds).all()).results
        : [];

      return json(
        { species: speciesClean, names: namesClean, toxicity: tox, sources },
        { headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } }
      );
    }

    return json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
