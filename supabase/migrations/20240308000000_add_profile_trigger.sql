-- Create a trigger to automatically create a profile entry when a new user signs up via Supabase Auth.

-- 1. Create the function that will be called by the trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url, word_balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    0 -- Initial word balance
  );
  return new;
end;
$$;

-- 2. Create the trigger
-- Drop if exists to ensure clean slate if re-running
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Backfill existing users who might be missing a profile (Optional but recommended)
-- This ensures that if this migration is run on an existing database, users without profiles get one.
insert into public.profiles (id, username, avatar_url, word_balance)
select 
  id, 
  coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  coalesce(raw_user_meta_data->>'avatar_url', ''),
  0
from auth.users
where id not in (select id from public.profiles);
