-- Pattern library backing the "Closest Matches" panel on the results page.
--
-- src/pages/Result.jsx reads this table and src/lib/rhythmEngine.js compares
-- each row's reference_pattern against the transcribed rhythm. Until the table
-- exists the read fails softly and the matches list is simply always empty.

create table if not exists public.pattern_library (
  id                uuid primary key default gen_random_uuid(),
  song_name         text        not null,
  -- Array of note objects, same shape the engine emits:
  --   [{ "duration_16ths": 4, "is_rest": false, "ornaments": [] }, ...]
  reference_pattern jsonb       not null default '[]'::jsonb,
  tags              text[]      not null default '{}',
  created_at        timestamptz not null default now()
);

create index if not exists pattern_library_song_name_idx
  on public.pattern_library (song_name);

alter table public.pattern_library enable row level security;

-- The library is shared reference data: everyone reads it, nobody writes it
-- through the client. Seed and curate it from the SQL editor or dashboard,
-- both of which use the service role and bypass RLS.
drop policy if exists "pattern_library is readable by everyone" on public.pattern_library;
create policy "pattern_library is readable by everyone"
  on public.pattern_library
  for select
  using (true);

-- Example row — delete or replace. This one is a plain quarter-note bar in 4/4.
-- insert into public.pattern_library (song_name, reference_pattern, tags)
-- values (
--   'Four On The Floor',
--   '[{"duration_16ths":4,"is_rest":false,"ornaments":[]},
--     {"duration_16ths":4,"is_rest":false,"ornaments":[]},
--     {"duration_16ths":4,"is_rest":false,"ornaments":[]},
--     {"duration_16ths":4,"is_rest":false,"ornaments":[]}]'::jsonb,
--   array['basic','4/4']
-- );
