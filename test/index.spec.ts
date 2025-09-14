import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

async function seedDb() {
	// minimal schema + data for deterministic tests
	const stmts = [
		`DROP TABLE IF EXISTS species;`,
		`DROP TABLE IF EXISTS names;`,
		`DROP TABLE IF EXISTS sources;`,
		`DROP TABLE IF EXISTS toxicity;`,
		`DROP TABLE IF EXISTS search_index;`,
		`DROP TABLE IF EXISTS meta;`,
		`CREATE TABLE species(
			id INTEGER PRIMARY KEY, scientific_name TEXT NOT NULL,
			genus TEXT, family TEXT, notes TEXT,
			created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL
		);`,
		`CREATE TABLE names(
			id INTEGER PRIMARY KEY, species_id INTEGER NOT NULL,
			name TEXT NOT NULL, locale TEXT DEFAULT 'en', is_primary INTEGER DEFAULT 0,
			FOREIGN KEY(species_id) REFERENCES species(id)
		);`,
		`CREATE TABLE sources(
			id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT, license TEXT, access_date_utc TEXT NOT NULL
		);`,
		`CREATE TABLE toxicity(
			id INTEGER PRIMARY KEY, species_id INTEGER NOT NULL,
			verdict TEXT NOT NULL, severity TEXT, parts TEXT, symptoms_short TEXT,
			evidence_level TEXT, source_id INTEGER, reviewed_at_utc TEXT NOT NULL,
			FOREIGN KEY(species_id) REFERENCES species(id),
			FOREIGN KEY(source_id) REFERENCES sources(id)
		);`,
		`CREATE VIRTUAL TABLE search_index USING fts5(term, species_id UNINDEXED, content='');`,
		`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
		`INSERT OR REPLACE INTO meta(key,value) VALUES ('dataset_version','test'),('schema_version','1');`,
		`INSERT INTO species(id, scientific_name, genus, family, notes, created_at_utc, updated_at_utc)
			VALUES (1,'Lilium candidum','Lilium','Liliaceae',NULL,'2020-01-01','2020-01-01');`,
		`INSERT INTO names(id,species_id,name,locale,is_primary) VALUES (1,1,'Lily','en',1);`,
		`INSERT INTO names(id,species_id,name,locale,is_primary) VALUES (2,1,'Madonna Lily','en',0);`,
		`INSERT INTO sources(id,name,url,license,access_date_utc) VALUES (1,'ASPCA','https://www.aspca.org','CC BY', '2020-01-01');`,
		`INSERT INTO toxicity(id,species_id,verdict,severity,parts,symptoms_short,evidence_level,source_id,reviewed_at_utc) VALUES (1,1,'toxic','severe','all','kidney failure','authoritative',1,'2020-01-02');`,
		`INSERT INTO search_index(term,species_id) VALUES ('lily',1);`,
		`INSERT INTO search_index(term,species_id) VALUES ('madonna',1);`,
		`INSERT INTO search_index(term,species_id) VALUES ('lilium',1);`,
	];
	for (const sql of stmts) {
		await env.DB.prepare(sql).run();
	}
}

describe('API routes', () => {
	beforeAll(async () => {
		await seedDb();
	});

	it('GET /health', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/health'), env);
		expect(res.status).toBe(200);
		const body = (await res.json<any>());
		expect(body).toEqual({ ok: true });
	});

	it('GET /version', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/version'), env);
		const body = await res.json<any>();
		expect(body.dataset_version).toBeDefined();
		expect(body.schema_version).toBeDefined();
	});

	it('GET / (index) lists new routes', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/'), env);
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.routes).toContain('/docs');
		expect(body.routes).toContain('/llm');
	});

	it('GET /search?q=lily', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/search?q=lily'), env);
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.q).toBe('lily');
		expect(Array.isArray(body.results)).toBe(true);
		expect(body.results[0]).toMatchObject({ id: 1, display_name: expect.any(String), verdict: 'toxic' });
	});

	it('GET /species/1', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/species/1'), env);
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.species.scientific_name).toBe('Lilium candidum');
		expect(body.names.length).toBeGreaterThan(0);
		expect(body.toxicity[0].verdict).toBe('toxic');
		expect(Array.isArray(body.sources)).toBe(true);
	});

	it('GET /species/999 -> 404', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/species/999'), env);
		expect(res.status).toBe(404);
	});

	it('GET /docs returns markdown', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/docs'), env);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') || '';
		expect(ct).toContain('text/markdown');
		const md = await res.text();
		expect(md).toContain('cat-toxicity-api');
		expect(md).toContain('GET /search');
	});

	it('GET /llm returns machine-readable summary', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/llm'), env);
		expect(res.status).toBe(200);
		const body = await res.json<any>();
		expect(body.name).toBe('cat-toxicity-api');
		expect(Array.isArray(body.endpoints)).toBe(true);
		const hasSearch = body.endpoints.some((e: any) => e.path === '/search');
		expect(hasSearch).toBe(true);
	});

	it('GET /openapi.json returns OpenAPI spec', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/openapi.json'), env);
		expect(res.status).toBe(200);
		const spec = await res.json<any>();
		expect(spec.openapi).toContain('3.');
		expect(spec.info?.title).toBe('cat-toxicity-api');
		expect(spec.paths?.['/search']).toBeDefined();
	});

	it('GET /swagger serves HTML referencing /openapi.json', async () => {
		const res = await worker.fetch(new IncomingRequest('http://api/swagger'), env);
		expect(res.status).toBe(200);
		const ct = res.headers.get('content-type') || '';
		expect(ct).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('/openapi.json');
	});
});
