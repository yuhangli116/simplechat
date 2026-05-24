-- Skill template interactions: likes + uses(view)

create table if not exists public.skill_template_likes (
  id uuid primary key default gen_random_uuid(),
  skill_template_id uuid not null references public.community_skill_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (skill_template_id, user_id)
);

alter table public.skill_template_likes enable row level security;

drop policy if exists "allow_select_skill_template_likes" on public.skill_template_likes;
create policy "allow_select_skill_template_likes" on public.skill_template_likes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "allow_insert_skill_template_likes" on public.skill_template_likes;
create policy "allow_insert_skill_template_likes" on public.skill_template_likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "allow_delete_skill_template_likes" on public.skill_template_likes;
create policy "allow_delete_skill_template_likes" on public.skill_template_likes
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.handle_skill_template_like_insert()
returns trigger as $$
begin
  update public.community_skill_templates
  set likes = coalesce(likes, 0) + 1
  where id = new.skill_template_id;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.handle_skill_template_like_delete()
returns trigger as $$
begin
  update public.community_skill_templates
  set likes = greatest(coalesce(likes, 0) - 1, 0)
  where id = old.skill_template_id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists on_skill_template_like_insert on public.skill_template_likes;
create trigger on_skill_template_like_insert
after insert on public.skill_template_likes
for each row execute function public.handle_skill_template_like_insert();

drop trigger if exists on_skill_template_like_delete on public.skill_template_likes;
create trigger on_skill_template_like_delete
after delete on public.skill_template_likes
for each row execute function public.handle_skill_template_like_delete();

create or replace function public.increment_skill_template_uses(skill_template_id uuid)
returns void as $$
begin
  update public.community_skill_templates
  set uses = coalesce(uses, 0) + 1
  where id = skill_template_id;
end;
$$ language plpgsql security definer;

