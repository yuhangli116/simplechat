-- Step 1: 修改 profiles 表，添加钻石余额字段
alter table public.profiles 
add column if not exists diamond_balance integer default 1000000;

-- Step 2: 创建使用记录表 (usage_logs)
create table if not exists public.usage_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  model_name text not null,
  input_tokens integer default 0,
  output_tokens integer default 0,
  total_cost integer default 0, -- 消耗的钻石数
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS
alter table public.usage_logs enable row level security;

-- 允许用户查看自己的消费记录
create policy "Users can view own usage logs" on public.usage_logs
  for select using (auth.uid() = user_id);

-- Step 3: 创建扣费存储过程 (RPC)
-- 这是一个原子操作，确保扣费和记录日志同时成功，且余额不会扣成负数
create or replace function public.deduct_diamonds(
  p_user_id uuid,
  p_cost integer,
  p_model_name text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns boolean
language plpgsql
security definer
as $$
declare
  current_bal integer;
begin
  -- 锁定用户记录行，防止并发冲突
  select diamond_balance into current_bal
  from public.profiles
  where id = p_user_id
  for update;

  if current_bal is null then
    raise exception 'User not found';
  end if;

  if current_bal < p_cost then
    return false; -- 余额不足
  end if;

  -- 扣除余额
  update public.profiles
  set diamond_balance = diamond_balance - p_cost,
      updated_at = now()
  where id = p_user_id;

  -- 记录消费日志
  insert into public.usage_logs (user_id, model_name, input_tokens, output_tokens, total_cost)
  values (p_user_id, p_model_name, p_input_tokens, p_output_tokens, p_cost);

  return true;
end;
$$;

-- Step 4: 更新新用户触发器 (确保新用户有初始资金)
-- 注意：我们只需要修改 handle_new_user 函数的默认插入逻辑
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url, diamond_balance)
  values (
    new.id, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url',
    1000000 -- 默认赠送 100万 钻石
  );
  return new;
end;
$$ language plpgsql security definer;
