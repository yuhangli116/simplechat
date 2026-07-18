-- Block blacklisted users from authenticated access to core business tables.

create or replace function public.is_user_blacklisted(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_risk_controls urc
    where urc.user_id = p_user_id
      and urc.status = 'blacklisted'
  );
$$;

grant execute on function public.is_user_blacklisted(uuid) to authenticated;

do $$
declare
  v_table regclass;
  v_policy_name text;
begin
  foreach v_table in array array[
    to_regclass('public.profiles'),
    to_regclass('public.works'),
    to_regclass('public.chapters'),
    to_regclass('public.chapter_versions'),
    to_regclass('public.mind_maps'),
    to_regclass('public.trash_items'),
    to_regclass('public.usage_logs'),
    to_regclass('public.recharge_logs'),
    to_regclass('public.user_welfare'),
    to_regclass('public.template_likes'),
    to_regclass('public.user_templates'),
    to_regclass('public.skill_template_likes'),
    to_regclass('public.community_templates'),
    to_regclass('public.community_skill_templates')
  ] loop
    if v_table is not null then
      v_policy_name := 'Blocked users cannot access ' || replace(v_table::text, 'public.', '');
      execute format('drop policy if exists %I on %s', v_policy_name, v_table);
      execute format(
        'create policy %I on %s as restrictive for all to authenticated using (not public.is_user_blacklisted(auth.uid())) with check (not public.is_user_blacklisted(auth.uid()))',
        v_policy_name,
        v_table
      );
    end if;
  end loop;
end;
$$;
