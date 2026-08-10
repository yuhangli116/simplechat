-- Keep the personal instruction workshop bounded even when clients race or bypass the UI.
create or replace function public.enforce_user_prompt_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.user_prompts where user_id = new.user_id) >= 100 then
    raise exception 'USER_PROMPTS_LIMIT_REACHED'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_user_prompt_limit on public.user_prompts;
create trigger trg_enforce_user_prompt_limit
before insert on public.user_prompts
for each row execute function public.enforce_user_prompt_limit();
