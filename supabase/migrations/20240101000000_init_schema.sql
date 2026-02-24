-- 用户表 (扩展 auth.users)
-- 注意：Supabase 默认已有 auth.users 表，我们创建 profiles 表来存储额外信息
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text,
  avatar_url text,
  membership_type text default 'free' check (membership_type in ('free', 'pro', 'max')),
  word_balance integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.profiles enable row level security;

-- 创建策略
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- 作品表
create table public.works (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  cover_url text,
  status text default 'draft' check (status in ('draft', 'ongoing', 'completed')),
  word_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.works enable row level security;

-- 创建策略
create policy "Users can view own works." on public.works
  for select using (auth.uid() = user_id);

create policy "Users can create own works." on public.works
  for insert with check (auth.uid() = user_id);

create policy "Users can update own works." on public.works
  for update using (auth.uid() = user_id);

create policy "Users can delete own works." on public.works
  for delete using (auth.uid() = user_id);

-- 章节表
create table public.chapters (
  id uuid default gen_random_uuid() primary key,
  work_id uuid references public.works on delete cascade not null,
  title text not null,
  content text,
  chapter_number integer not null,
  word_count integer default 0,
  status text default 'draft',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.chapters enable row level security;

-- 创建策略
-- 这里的策略稍微复杂一点，需要检查 work_id 对应的 user_id 是否是当前用户
-- 为了简化，我们假设前端会保证只访问属于自己的 works 的 chapters
-- 在生产环境中，应该使用更严格的 RLS 策略，例如通过 join works 表来验证 user_id

create policy "Users can view chapters of own works." on public.chapters
  for select using (
    exists (
      select 1 from public.works
      where public.works.id = public.chapters.work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can insert chapters to own works." on public.chapters
  for insert with check (
    exists (
      select 1 from public.works
      where public.works.id = work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can update chapters of own works." on public.chapters
  for update using (
    exists (
      select 1 from public.works
      where public.works.id = work_id
      and public.works.user_id = auth.uid()
    )
  );

create policy "Users can delete chapters of own works." on public.chapters
  for delete using (
    exists (
      select 1 from public.works
      where public.works.id = work_id
      and public.works.user_id = auth.uid()
    )
  );

-- 自动创建 Profile 的触发器 (可选，但推荐)
-- 当新用户在 auth.users 注册时，自动在 public.profiles 创建记录
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
