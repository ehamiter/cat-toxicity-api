CREATE TABLE IF NOT EXISTS species(
  id INTEGER PRIMARY KEY, scientific_name TEXT NOT NULL,
  genus TEXT, family TEXT, notes TEXT,
  created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS names(
  id INTEGER PRIMARY KEY, species_id INTEGER NOT NULL,
  name TEXT NOT NULL, locale TEXT DEFAULT 'en', is_primary INTEGER DEFAULT 0,
  FOREIGN KEY(species_id) REFERENCES species(id)
);
CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, url TEXT, license TEXT, access_date_utc TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS toxicity(
  id INTEGER PRIMARY KEY, species_id INTEGER NOT NULL,
  verdict TEXT NOT NULL, severity TEXT, parts TEXT, symptoms_short TEXT,
  evidence_level TEXT, source_id INTEGER, reviewed_at_utc TEXT NOT NULL,
  FOREIGN KEY(species_id) REFERENCES species(id),
  FOREIGN KEY(source_id) REFERENCES sources(id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(term, species_id UNINDEXED, content='');
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_names_name ON names(name);
CREATE INDEX IF NOT EXISTS idx_names_species ON names(species_id);
CREATE INDEX IF NOT EXISTS idx_toxicity_species ON toxicity(species_id);

-- minimal meta so /version works
INSERT OR REPLACE INTO meta(key,value) VALUES ('dataset_version','dev'),('schema_version','1');
