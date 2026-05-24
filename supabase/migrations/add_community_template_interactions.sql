create table if not exists public.template_likes (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.community_templates(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(template_id, user_id)
);

alter table public.template_likes enable row level security;

create policy "Like rows are viewable by owner"
  on public.template_likes for select
  using (auth.uid() = user_id);

create policy "Users can like templates"
  on public.template_likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike templates"
  on public.template_likes for delete
  using (auth.uid() = user_id);

create table if not exists public.user_templates (
  id uuid default gen_random_uuid() primary key,
  template_id uuid references public.community_templates(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(template_id, user_id)
);

alter table public.user_templates enable row level security;

create policy "Collected templates are viewable by owner"
  on public.user_templates for select
  using (auth.uid() = user_id);

create policy "Users can collect templates"
  on public.user_templates for insert
  with check (auth.uid() = user_id);

create policy "Users can uncollect templates"
  on public.user_templates for delete
  using (auth.uid() = user_id);

create or replace function public.increment_downloads(template_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.community_templates
  set downloads = coalesce(downloads, 0) + 1
  where id = template_id;
end;
$$;

create or replace function public.handle_template_like_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.community_templates
  set likes = coalesce(likes, 0) + 1
  where id = new.template_id;
  return new;
end;
$$;

drop trigger if exists on_template_like_insert on public.template_likes;
create trigger on_template_like_insert
  after insert on public.template_likes
  for each row execute procedure public.handle_template_like_insert();

create or replace function public.handle_template_like_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.community_templates
  set likes = greatest(coalesce(likes, 0) - 1, 0)
  where id = old.template_id;
  return old;
end;
$$;

drop trigger if exists on_template_like_delete on public.template_likes;
create trigger on_template_like_delete
  after delete on public.template_likes
  for each row execute procedure public.handle_template_like_delete();
