
-- Community Templates Table
create table public.community_templates (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  author_name text default 'Official',
  category text not null,
  content jsonb not null, -- Stores the file structure (folders, mindmaps, etc.)
  cover_color text default 'bg-gradient-to-br from-blue-500 to-purple-600',
  likes integer default 0,
  downloads integer default 0,
  is_official boolean default false,
  tags text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.community_templates enable row level security;

-- Policies for community_templates
create policy "Templates are viewable by everyone" 
  on public.community_templates for select 
  using (true);

-- Tutorials Table
create table public.tutorials (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  type text not null check (type in ('video', 'text')),
  content text, -- Markdown content for text tutorials or description for video
  video_url text, -- URL for video tutorials
  thumbnail_url text,
  duration text,
  category text,
  views integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.tutorials enable row level security;

-- Policies for tutorials
create policy "Tutorials are viewable by everyone" 
  on public.tutorials for select 
  using (true);

-- App Versions Table (for Download page)
create table public.app_versions (
  id uuid default gen_random_uuid() primary key,
  platform text not null check (platform in ('windows', 'mac', 'linux', 'ios', 'android')),
  version text not null,
  build_number integer,
  download_url text not null,
  release_notes text,
  force_update boolean default false,
  size text, -- Display string like "85 MB"
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.app_versions enable row level security;

-- Policies for app_versions
create policy "App versions are viewable by everyone" 
  on public.app_versions for select 
  using (true);

-- Welfare/Tasks System
-- Tracks user check-ins and completed tasks
create table public.user_welfare (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  last_check_in_date date,
  check_in_streak integer default 0,
  total_points_earned integer default 0,
  completed_tasks jsonb default '[]'::jsonb, -- Array of task IDs completed today or generally
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

-- Enable RLS
alter table public.user_welfare enable row level security;

-- Policies for user_welfare
create policy "Users can view own welfare data" 
  on public.user_welfare for select 
  using (auth.uid() = user_id);

create policy "Users can insert own welfare data" 
  on public.user_welfare for insert 
  with check (auth.uid() = user_id);

create policy "Users can update own welfare data" 
  on public.user_welfare for update 
  using (auth.uid() = user_id);

-- Trigger to update updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_user_welfare_updated
  before update on public.user_welfare
  for each row execute procedure public.handle_updated_at();

-- Insert some initial data for Templates
insert into public.community_templates (title, author_name, category, content, likes, downloads, is_official, cover_color)
values 
('小说通用模板 (50章节版)', '僵尸道士', '古风言情', '{"type": "folder", "name": "小说通用模板", "children": []}', 89, 1278, true, 'bg-gradient-to-br from-orange-400 to-red-500'),
('觉醒成灭世协议', '匿名作家', '科幻末世', '{"type": "folder", "name": "科幻模板", "children": []}', 41, 205, false, 'bg-gradient-to-br from-blue-600 to-purple-800'),
('网文小说通用模板', '飞鹰77', '都市脑洞', '{"type": "folder", "name": "通用模板", "children": []}', 93, 843, false, 'bg-gradient-to-br from-yellow-500 to-yellow-700');

-- Insert some initial data for Tutorials
insert into public.tutorials (title, type, duration, category, views, thumbnail_url)
values
('新手入门：3分钟快速上手 AI 创作', 'video', '03:12', '入门指南', 12000, 'bg-blue-100'),
('思维导图功能详解', 'video', '05:45', '进阶技巧', 8500, 'bg-purple-100'),
('如何使用"提示词库"提高写作效率？', 'text', '3 min', '效率工具', 5000, 'bg-green-100');

-- Insert some initial data for App Versions
insert into public.app_versions (platform, version, download_url, size)
values
('windows', 'v1.2.0', 'https://example.com/download/win', '85 MB'),
('mac', 'v1.2.0', 'https://example.com/download/mac', '92 MB'),
('linux', 'v1.2.0', 'https://example.com/download/linux', '78 MB'),
('ios', 'v1.0.5', 'https://apps.apple.com/app/id123', 'App Store'),
('android', 'v1.0.5', 'https://play.google.com/store/apps/details?id=com.simplechat', 'Google Play');
