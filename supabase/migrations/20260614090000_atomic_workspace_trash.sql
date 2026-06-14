-- Atomic workspace delete-to-trash helper.
-- Run this after the trash_items, works, chapters and mind_maps tables exist.

create or replace function public.move_workspace_node_to_trash(
  p_node_kind text,
  p_work_id uuid,
  p_node_id text,
  p_title text,
  p_original_path text default null,
  p_parent_id text default null,
  p_work_name text default null,
  p_extra jsonb default '{}'::jsonb,
  p_snapshot jsonb default null,
  p_chapter_ids uuid[] default '{}'::uuid[],
  p_mindmap_ids uuid[] default '{}'::uuid[]
)
returns public.trash_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_expires_at bigint := (extract(epoch from now() + interval '30 days') * 1000)::bigint;
  v_content jsonb;
  v_trash public.trash_items%rowtype;
  v_mindmap_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_node_kind = 'work' then
    select jsonb_build_object(
      'id', w.id,
      'name', w.title,
      'type', 'folder',
      'children', jsonb_build_array(
        jsonb_build_object(
          'id', 'meta-' || w.id::text,
          'name', '作品相关',
          'type', 'folder',
          'children', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', case when mm.is_default then mm.id::text else 'mm-custom-' || mm.id::text end,
                'name', mm.title,
                'type', 'mindmap',
                'mindMapType', mm.editor_type,
                'customIcon', mm.custom_icon,
                'path', case
                  when mm.is_default and mm.editor_type = 'outline' then '/workspace/p/' || w.id::text || '/outline'
                  when mm.is_default and mm.editor_type = 'world' then '/workspace/p/' || w.id::text || '/world'
                  when mm.is_default and mm.editor_type = 'character' then '/workspace/p/' || w.id::text || '/characters'
                  when mm.is_default and mm.editor_type = 'event' then '/workspace/p/' || w.id::text || '/events'
                  else '/workspace/p/' || w.id::text || '/mindmap/' || mm.id::text
                end,
                'savedMindMap', coalesce(mm.content, '{"nodes":[],"edges":[]}'::jsonb)
              )
              order by mm.created_at asc
            )
            from public.mind_maps mm
            where mm.work_id = w.id
          ), '[]'::jsonb)
        ),
        jsonb_build_object(
          'id', 'chapters-' || w.id::text,
          'name', '正文情节',
          'type', 'folder',
          'children', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', 'ch-' || c.id::text,
                'name', c.title,
                'type', 'file',
                'path', '/workspace/p/' || w.id::text || '/story/' || c.id::text,
                'savedContent', c.content
              )
              order by c.chapter_number asc
            )
            from public.chapters c
            where c.work_id = w.id
          ), '[]'::jsonb)
        )
      )
    )
    into v_content
    from public.works w
    where w.id = p_work_id
      and w.user_id = v_user_id;

    if v_content is null then
      raise exception 'work not found or permission denied';
    end if;

    insert into public.trash_items (
      user_id, original_id, type, title, content, deleted_at, expires_at,
      original_path, parent_id, work_name, extra
    )
    values (
      v_user_id, p_work_id::text, 'work', p_title, v_content, v_now, v_expires_at,
      p_original_path, p_parent_id, coalesce(p_work_name, p_title), coalesce(p_extra, '{}'::jsonb) || '{"isFullWork":true}'::jsonb
    )
    returning * into v_trash;

    delete from public.works
    where id = p_work_id
      and user_id = v_user_id;

    return v_trash;
  end if;

  if p_node_kind = 'chapter' then
    select jsonb_build_object(
      'id', 'ch-' || c.id::text,
      'name', c.title,
      'type', 'file',
      'path', '/workspace/p/' || c.work_id::text || '/story/' || c.id::text,
      'savedContent', c.content
    )
    into v_content
    from public.chapters c
    join public.works w on w.id = c.work_id
    where c.id::text = p_node_id
      and c.work_id = p_work_id
      and w.user_id = v_user_id;

    if v_content is null then
      raise exception 'chapter not found or permission denied';
    end if;

    insert into public.trash_items (
      user_id, original_id, type, title, content, deleted_at, expires_at,
      original_path, parent_id, work_name, extra
    )
    values (
      v_user_id, p_node_id, 'chapter', p_title, v_content, v_now, v_expires_at,
      p_original_path, p_parent_id, p_work_name, coalesce(p_extra, '{}'::jsonb)
    )
    returning * into v_trash;

    delete from public.chapters
    where id::text = p_node_id
      and work_id = p_work_id;

    return v_trash;
  end if;

  if p_node_kind = 'mindmap' then
    v_mindmap_id := case
      when p_node_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then p_node_id::uuid
      else null
    end;

    if v_mindmap_id is null then
      raise exception 'invalid mindmap id';
    end if;

    select jsonb_build_object(
      'id', case when mm.is_default then mm.id::text else 'mm-custom-' || mm.id::text end,
      'name', mm.title,
      'type', 'mindmap',
      'mindMapType', mm.editor_type,
      'customIcon', mm.custom_icon,
      'path', case
        when mm.is_default and mm.editor_type = 'outline' then '/workspace/p/' || mm.work_id::text || '/outline'
        when mm.is_default and mm.editor_type = 'world' then '/workspace/p/' || mm.work_id::text || '/world'
        when mm.is_default and mm.editor_type = 'character' then '/workspace/p/' || mm.work_id::text || '/characters'
        when mm.is_default and mm.editor_type = 'event' then '/workspace/p/' || mm.work_id::text || '/events'
        else '/workspace/p/' || mm.work_id::text || '/mindmap/' || mm.id::text
      end,
      'savedMindMap', coalesce(mm.content, '{"nodes":[],"edges":[]}'::jsonb)
    )
    into v_content
    from public.mind_maps mm
    join public.works w on w.id = mm.work_id
    where mm.id = v_mindmap_id
      and mm.work_id = p_work_id
      and w.user_id = v_user_id;

    if v_content is null then
      raise exception 'mindmap not found or permission denied';
    end if;

    insert into public.trash_items (
      user_id, original_id, type, title, content, deleted_at, expires_at,
      original_path, parent_id, work_name, extra
    )
    values (
      v_user_id, p_node_id, 'mindmap', p_title, v_content, v_now, v_expires_at,
      p_original_path, p_parent_id, p_work_name, coalesce(p_extra, '{}'::jsonb)
    )
    returning * into v_trash;

    delete from public.mind_maps
    where id = v_mindmap_id
      and work_id = p_work_id;

    return v_trash;
  end if;

  if p_node_kind = 'folder' then
    if p_snapshot is null then
      raise exception 'folder snapshot is required';
    end if;

    if not exists (
      select 1 from public.works w
      where w.id = p_work_id
        and w.user_id = v_user_id
    ) then
      raise exception 'work not found or permission denied';
    end if;

    insert into public.trash_items (
      user_id, original_id, type, title, content, deleted_at, expires_at,
      original_path, parent_id, work_name, extra
    )
    values (
      v_user_id, p_node_id, 'folder', p_title, p_snapshot, v_now, v_expires_at,
      p_original_path, p_parent_id, p_work_name, coalesce(p_extra, '{}'::jsonb)
    )
    returning * into v_trash;

    if coalesce(array_length(p_chapter_ids, 1), 0) > 0 then
      delete from public.chapters
      where work_id = p_work_id
        and id = any(p_chapter_ids);
    end if;

    if coalesce(array_length(p_mindmap_ids, 1), 0) > 0 then
      delete from public.mind_maps
      where work_id = p_work_id
        and id = any(p_mindmap_ids);
    end if;

    return v_trash;
  end if;

  raise exception 'unsupported node kind: %', p_node_kind;
end;
$$;
