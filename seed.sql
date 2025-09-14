-- Insert one test species: Lily
INSERT OR REPLACE INTO species
  (id, scientific_name, genus, family, notes, created_at_utc, updated_at_utc)
VALUES
  (1, 'Lilium spp.', 'Lilium', 'Liliaceae', 'Generic lily entry',
   '2025-09-12T00:00:00Z','2025-09-12T00:00:00Z');

-- Names / synonyms
INSERT OR REPLACE INTO names (id, species_id, name, locale, is_primary)
VALUES
  (1, 1, 'lily', 'en', 1),
  (2, 1, 'stargazer lily', 'en', 0);

-- Toxicity record
INSERT OR REPLACE INTO toxicity
  (id, species_id, verdict, severity, parts, symptoms_short, evidence_level, source_id, reviewed_at_utc)
VALUES
  (1, 1, 'toxic', 'high', 'pollen; leaves',
   'Kidney failure, vomiting',
   'authoritative', NULL,
   '2025-09-12T00:00:00Z');

-- Add searchable terms to FTS index
INSERT INTO search_index(term, species_id) VALUES
  ('lily', 1),
  ('stargazer', 1),
  ('lilium', 1);
