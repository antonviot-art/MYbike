-- Install after mybike-social-setup.sql in the independent Supabase project.
begin;

create table if not exists public.mybike_friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z2-9]{5}$')
);
create table if not exists public.mybike_friend_code_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.mybike_friend_codes enable row level security;
alter table public.mybike_friend_code_limits enable row level security;
revoke all on public.mybike_friend_codes, public.mybike_friend_code_limits from anon, authenticated;

create or replace function public.mybike_friend_code()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  current_code text;
  candidate text;
  sample bytea;
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  for attempt in 1..30 loop
    select code into current_code from public.mybike_friend_codes where user_id = me;
    if found then return current_code; end if;
    sample := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    for idx in 0..4 loop
      candidate := candidate || substr(alphabet, get_byte(sample, idx) % 32 + 1, 1);
    end loop;
    insert into public.mybike_friend_codes(user_id, code) values (me, candidate) on conflict do nothing;
    if found then return candidate; end if;
  end loop;
  raise exception 'Code indisponible. Réessaie.';
end;
$$;

create or replace function public.mybike_friend_request_code(friend_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  target uuid;
  attempts_used integer;
begin
  if me is null then raise exception 'Connexion requise.'; end if;
  insert into public.mybike_friend_code_limits as limits (user_id, window_start, attempts)
    values (me, now(), 1)
  on conflict (user_id) do update set
    attempts = case when limits.window_start <= now() - interval '1 minute' then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start <= now() - interval '1 minute' then now() else limits.window_start end
  returning attempts into attempts_used;
  if attempts_used > 12 then return 'rate'; end if;
  select user_id into target from public.mybike_friend_codes where code = upper(btrim(friend_code));
  if target is null or target = me then return 'invalid'; end if;
  perform public.mybike_friend_request(target);
  return 'ok';
end;
$$;

create or replace function public.mybike_ride_edit(ride_id uuid, ride_name text, ride_description text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if ride_name is null or char_length(btrim(ride_name)) not between 1 and 80
    or char_length(coalesce(ride_description, '')) > 600 then
    raise exception 'Vérifie le titre et la description.';
  end if;
  update public.group_records
  set payload = payload || jsonb_build_object('name', btrim(ride_name), 'description', btrim(coalesce(ride_description, '')))
  where id = ride_id and author_id = auth.uid() and kind = 'ride-track';
  if not found then raise exception 'Parcours introuvable.'; end if;
end;
$$;

revoke execute on function public.mybike_friend_code(), public.mybike_friend_request_code(text),
  public.mybike_ride_edit(uuid, text, text) from public, anon;
grant execute on function public.mybike_friend_code(), public.mybike_friend_request_code(text),
  public.mybike_ride_edit(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
