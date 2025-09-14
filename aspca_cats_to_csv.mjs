// Node 18+ (fetch built-in). No deps.
// Scrapes: https://www.aspca.org/pet-care/animal-poison-control/cats-plant-list
// Outputs: ./out/{species.csv,names.csv,toxicity.csv,sources.csv,search_terms.csv,seed_generated.sql}

import fs from "node:fs/promises";

const URL = "https://www.aspca.org/pet-care/animal-poison-control/cats-plant-list";
const NOW = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const outDir = "./out";
await fs.mkdir(outDir, { recursive: true });

const html = await (await fetch(URL, { headers: { "user-agent": "canmycateatthat/0.1" } })).text();

// crude HTML → text
function strip(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/\r/g, "");
  // collapse excessive whitespace, preserve newlines
  s = s.split("\n").map(l => l.replace(/\s+/g, " ").trim()).join("\n");
  return s;
}
const text = strip(html);

// cut sections
function sectionBetween(txt, start, end) {
  const i = txt.indexOf(start);
  const j = end ? txt.indexOf(end, i + start.length) : -1;
  return (i === -1) ? "" : txt.slice(i + start.length, j === -1 ? undefined : j);
}
const toxicBlock = sectionBetween(text, "Plants Toxic to Cats", "Plants Non-Toxic to Cats");
const nontoxicBlock = sectionBetween(text, "Plants Non-Toxic to Cats", "");

// pick only lines that look like entries
const lineRe = /.+\|\s*Scientific Names:\s*.+/i;
const toxicLines = toxicBlock.split("\n").filter(l => lineRe.test(l));
const safeLines  = nontoxicBlock.split("\n").filter(l => lineRe.test(l));

function decodeHtml(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// returns { primary, syns } normalized & lowercase, no empty parens, no “includes …”
function extractPrimaryAndSyns(commonRaw) {
  const NOISE_SYNONYM = /\b(varieties?|species|group|includes?|including|assorted|mixed|type|cultivars?)\b/i;
  const norm = (n) => n.toLowerCase().replace(/[.,;:]+$/, "").replace(/\s+/g, " ").trim();

  // decode entities & trim
  let s = norm(decodeHtml(commonRaw));

  // strip leading junk: "and ", "including:", "includes ", "group also includes "
  s = s.replace(/^(and\s+|including:?\s+|includes\s+|group also includes\s+|group includes\s+)/i, "").trim();

  // remove empty () at end
  s = s.replace(/\(\s*\)\s*$/, "").trim();

  // collect ALL parenthetical chunks, even nested
  const parenChunks = [];
  s = s.replace(/\(([^()]*)\)/g, (_, inner) => {
    const t = norm(inner);
    if (t) parenChunks.push(t);
    return ""; // drop from primary
  }).replace(/\s+/g, " ").trim();

  // primary now has no parens
  const primary = norm(s);

  // flatten synonyms: split commas; drop noise phrases; drop empties & dups & equals-primary
  const syns = Array.from(new Set(
    parenChunks
      .flatMap(ch => ch.split(/\s*,\s*/))
      .map(norm)
      .filter(x => x && !NOISE_SYNONYM.test(x) && x !== primary)
  ));

  return { primary, syns };
}

// parse a single entry line
function parseLine(line) {
  // Accept "Scientific Name:" or "Scientific Names:", Family optional
  const m = line.match(/^(.*?)\s*\|\s*Scientific Name[s]?:\s*([^|]+?)\s*(?:\|\s*Family:\s*(.*))?$/i);
  if (!m) return null;

  const commonWithSyn = m[1].trim();
  let sciRaw = (m[2] || "").trim().replace(/\s+/g, " ");
  const family = (m[3] || "").trim() || null;

  if (!sciRaw || /^(n\/a|unknown|various|see|multiple)/i.test(sciRaw)) return null;

  // If multiple scientific names listed, keep the first
  const sci = sciRaw.split(/\s*(?:,|;| or )\s*/i)[0].trim();
  if (!sci) return null;

  const { primary, syns } = extractPrimaryAndSyns(commonWithSyn);

  // genus heuristic = first token of scientific name
  const genus = (sci.split(/\s+/)[0] || "").replace(/[^A-Za-z-]+/g, "") || null;

  return { primary, syns, sci, family, genus };
}

// collect rows, dedupe by scientific name
const bySci = new Map();
function addLines(lines, verdict) {
  for (const l of lines) {
    const rec = parseLine(l);
    if (!rec) continue;
    const key = rec.sci.toLowerCase();
    const existing = bySci.get(key);
    if (!existing) {
      bySci.set(key, { ...rec, verdicts: new Set([verdict]) });
    } else {
      // merge synonyms & verdicts if the plant appears multiple times
      const merged = new Set([...(existing.syns || []), ...(rec.syns || [])]);
      existing.syns = [...merged];
      existing.primary = existing.primary || rec.primary;
      existing.family = existing.family || rec.family;
      existing.genus = existing.genus || rec.genus;
      existing.verdicts.add(verdict);
    }
  }
}
addLines(toxicLines, "toxic");
addLines(safeLines, "safe");

// assign IDs and build tables
let speciesId = 0;
let nameId = 0;
let toxId = 0;

const speciesRows = [];
const namesRows = [];
const toxRows = [];
const searchRows = [];
const sourcesRows = [{
  id: 1,
  name: "ASPCA Toxic and Non-Toxic Plant List — Cats",
  url: URL,
  license: "restricted",
  access_date_utc: NOW
}];

for (const [, rec] of bySci) {
  const id = ++speciesId;
  speciesRows.push({
    id,
    scientific_name: rec.sci,
    genus: rec.genus || "",
    family: rec.family || "",
    notes: "",
    created_at_utc: NOW,
    updated_at_utc: NOW
  });
  namesRows.push({ id: ++nameId, species_id: id, name: rec.primary.toLowerCase(), locale: "en", is_primary: 1 });
  searchRows.push({ term: rec.primary.toLowerCase(), species_id: id });
  for (const syn of rec.syns) {
    namesRows.push({ id: ++nameId, species_id: id, name: syn.toLowerCase(), locale: "en", is_primary: 0 });
    searchRows.push({ term: syn.toLowerCase(), species_id: id });
  }
  // verdict preference: if any "toxic" appears, mark toxic; else safe
  const verdict = rec.verdicts.has("toxic") ? "toxic" : "safe";
  toxRows.push({
    id: ++toxId, species_id: id, verdict,
    severity: null,
    parts: "",
    symptoms_short: "",
    evidence_level: "reputable",
    source_id: 1,
    reviewed_at_utc: NOW
  });
}

// CSV writers
function toCSV(rows, headers) {
  const esc = v => v == null ? "" : `"${String(v).replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

// write CSVs
await fs.writeFile(`${outDir}/species.csv`, toCSV(speciesRows, ["id","scientific_name","genus","family","notes","created_at_utc","updated_at_utc"]));
await fs.writeFile(`${outDir}/names.csv`,   toCSV(namesRows,   ["id","species_id","name","locale","is_primary"]));
await fs.writeFile(`${outDir}/toxicity.csv`,toCSV(toxRows,     ["id","species_id","verdict","severity","parts","symptoms_short","evidence_level","source_id","reviewed_at_utc"]));
await fs.writeFile(`${outDir}/sources.csv`, toCSV(sourcesRows, ["id","name","url","license","access_date_utc"]));
await fs.writeFile(`${outDir}/search_terms.csv`, toCSV(searchRows, ["term","species_id"]));

// also emit a seed SQL that you can push directly (no BEGIN/COMMIT; FTS5 delete-all)
function sqlEsc(v){ if (v == null || v === "") return "NULL"; return "'" + String(v).replace(/'/g,"''") + "'"; }

let sql = "";
sql += "INSERT OR REPLACE INTO meta(key,value) VALUES ('dataset_version'," + sqlEsc(NOW.slice(0,10)) + "),('schema_version','1');\n";

for (const r of speciesRows)
  sql += `INSERT OR REPLACE INTO species(id,scientific_name,genus,family,notes,created_at_utc,updated_at_utc) VALUES (${r.id},${sqlEsc(r.scientific_name)},${sqlEsc(r.genus)},${sqlEsc(r.family)},${sqlEsc(r.notes)},${sqlEsc(r.created_at_utc)},${sqlEsc(r.updated_at_utc)});\n`;

for (const r of namesRows)
  sql += `INSERT OR REPLACE INTO names(id,species_id,name,locale,is_primary) VALUES (${r.id},${r.species_id},${sqlEsc(r.name)},${sqlEsc(r.locale)},${r.is_primary});\n`;

for (const r of sourcesRows)
  sql += `INSERT OR REPLACE INTO sources(id,name,url,license,access_date_utc) VALUES (${r.id},${sqlEsc(r.name)},${sqlEsc(r.url)},${sqlEsc(r.license)},${sqlEsc(r.access_date_utc)});\n`;

for (const r of toxRows)
  sql += `INSERT OR REPLACE INTO toxicity(id,species_id,verdict,severity,parts,symptoms_short,evidence_level,source_id,reviewed_at_utc) VALUES (${r.id},${r.species_id},${sqlEsc(r.verdict)},${sqlEsc(r.severity)},${sqlEsc(r.parts)},${sqlEsc(r.symptoms_short)},${sqlEsc(r.evidence_level)},${r.source_id ?? "NULL"},${sqlEsc(r.reviewed_at_utc)});\n`;

// FTS5 contentless table: use the special 'delete-all' command
sql += "INSERT INTO search_index(search_index) VALUES('delete-all');\n";
for (const r of searchRows)
  sql += `INSERT INTO search_index(term,species_id) VALUES (${sqlEsc(r.term)},${r.species_id});\n`;

await fs.writeFile(`${outDir}/seed_generated.sql`, sql);

console.log(`OK:
  species: ${speciesRows.length}
  names:   ${namesRows.length}
  tox:     ${toxRows.length}
  search:  ${searchRows.length}
  files in ${outDir}/`);
