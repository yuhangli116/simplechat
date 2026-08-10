-- One AI apply action must create at most one history snapshot.
-- Existing manual/legacy snapshots have a null operation_key and are unaffected.
alter table public.chapter_versions add column if not exists operation_key text;

create unique index if not exists idx_chapter_versions_operation_key
  on public.chapter_versions(chapter_id, source, operation_key)
  where operation_key is not null;
