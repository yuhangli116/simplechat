create table if not exists public.payment_products (
  product_key text primary key,
  name text not null,
  order_type text not null check (order_type in ('membership', 'fuel_pack')),
  amount_cny numeric(10,2) not null check (amount_cny > 0),
  diamonds_granted integer not null check (diamonds_granted >= 0),
  membership_days integer check (membership_days is null or membership_days > 0),
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_products (product_key, name, order_type, amount_cny, diamonds_granted, membership_days, active)
values
  ('monthly', '月卡', 'membership', 0.01, 12000000, 30, true),
  ('quarterly', '季卡', 'membership', 0.01, 35000000, 90, true),
  ('yearly', '年卡', 'membership', 0.01, 150000000, 365, true)
on conflict (product_key) do nothing;

alter table public.payment_products enable row level security;

drop policy if exists "Active payment products are readable" on public.payment_products;
create policy "Active payment products are readable"
  on public.payment_products for select
  using (active = true);

grant select on public.payment_products to anon, authenticated;

create or replace function public.admin_list_payment_products()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  perform public.admin_require_permission('system_config.update');

  select coalesce(jsonb_agg(to_jsonb(p) order by p.order_type, p.product_key), '[]'::jsonb)
  into v_rows
  from public.payment_products p;

  return jsonb_build_object('success', true, 'data', v_rows);
end;
$$;

create or replace function public.admin_update_payment_product(p_product_key text, p_values jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_order_type text;
  v_name text;
  v_amount numeric;
  v_diamonds integer;
  v_membership_days integer;
  v_active boolean;
begin
  perform public.admin_require_permission('system_config.update');

  select to_jsonb(p), p.order_type
  into v_before, v_order_type
  from public.payment_products p
  where p.product_key = p_product_key;

  if v_before is null then
    raise exception '商品不存在：%', p_product_key;
  end if;

  v_name := coalesce(nullif(trim(p_values->>'name'), ''), v_before->>'name');
  v_amount := coalesce((p_values->>'amount_cny')::numeric, (v_before->>'amount_cny')::numeric);
  v_diamonds := coalesce((p_values->>'diamonds_granted')::integer, (v_before->>'diamonds_granted')::integer);
  v_membership_days := case
    when v_order_type = 'membership' then coalesce((p_values->>'membership_days')::integer, (v_before->>'membership_days')::integer)
    else null
  end;
  v_active := coalesce((p_values->>'active')::boolean, (v_before->>'active')::boolean);

  if v_amount <= 0 then
    raise exception '商品售价必须大于 0';
  end if;
  if v_diamonds < 0 then
    raise exception '钻石额度不能小于 0';
  end if;
  if v_order_type = 'membership' and (v_membership_days is null or v_membership_days <= 0) then
    raise exception '会员商品有效期必须大于 0 天';
  end if;

  update public.payment_products
  set name = v_name,
      amount_cny = v_amount,
      diamonds_granted = v_diamonds,
      membership_days = v_membership_days,
      active = v_active,
      version = version + 1,
      updated_at = now()
  where product_key = p_product_key;

  select to_jsonb(p) into v_after
  from public.payment_products p
  where p.product_key = p_product_key;

  insert into public.admin_config_change_logs (admin_id, config_area, target_key, before_value, after_value, reason)
  values (auth.uid(), 'payment_products', p_product_key, v_before, v_after, p_reason);

  perform public.admin_write_audit('payment_product.update', 'payment_product', p_product_key, p_reason, v_before, v_after);

  return jsonb_build_object('success', true, 'data', v_after);
end;
$$;

grant execute on function public.admin_list_payment_products() to authenticated;
grant execute on function public.admin_update_payment_product(text, jsonb, text) to authenticated;
