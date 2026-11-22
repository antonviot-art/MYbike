-- Run in SQL Editor on the independent MYbike Supabase project.
-- Requires the existing profiles, group_records and private group-media bucket.
begin;

create table if not exists public.mybike_rooms (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  code text not null unique default upper(left(replace(gen_random_uuid()::text, '-', ''), 16))
);

create table if not exists public.mybike_room_members (
  room_id uuid not null references public.mybike_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (room_id, user_id)
);

create table if not exists public.mybike_friendships (
  first_user uuid not null references auth.users(id) on delete cascade,
  second_user uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  primary key (first_user, second_user),
  check (first_user < second_user),
  check (requested_by in (first_user, second_user))
);

alter table public.mybike_rooms enable row level security;
alter table public.mybike_room_members enable row level security;
alter table public.mybike_friendships enable row level security;
revoke all on public.mybike_rooms, public.mybike_room_members, public.mybike_friendships from anon, authenticated;

create or replace function public.mybike_rooms_list()
returns table (id uuid, label text, code text)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.label, r.code from public.mybike_rooms r
  join public.mybike_room_members m on m.room_id = r.id
  where m.user_id = auth.uid()
  order by r.label, r.id
$$;

create or replace function public.mybike_room_create(room_label text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  insert into public.mybike_rooms (label) values (btrim(room_label)) returning id into new_id;
  insert into public.mybike_room_members (room_id, user_id) values (new_id, auth.uid());
  return new_id;
end;
$$;

create or replace function public.mybike_room_join(room_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare found_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select id into found_id from public.mybike_rooms where code = upper(btrim(room_code));
  if found_id is null then raise exception 'Code de discussion inconnu.'; end if;
  insert into public.mybike_room_members (room_id, user_id) values (found_id, auth.uid()) on conflict do nothing;
  return found_id;
end;
$$;

create or replace function public.mybike_friends_list()
returns table (user_id uuid, display_name text, status text)
language sql stable security definer set search_path = ''
as $$
  select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'given_name', ''), 'Pilote'),
    case when f.accepted then 'accepted' when f.requested_by = auth.uid() then 'outgoing' else 'incoming' end
  from public.mybike_friendships f
  join auth.users u on u.id = case when first_user = auth.uid() then second_user else first_user end
  where auth.uid() in (first_user, second_user)
  order by 2, 1
$$;

create or replace function public.mybike_friend_request(friend_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or friend_id is null or friend_id = me then raise exception 'Code ami invalide.'; end if;
  if not exists (select 1 from auth.users where id = friend_id and email_confirmed_at is not null) then
    raise exception 'Code ami inconnu.';
  end if;
  insert into public.mybike_friendships (first_user, second_user, requested_by)
    values (least(me, friend_id), greatest(me, friend_id), me) on conflict do nothing;
end;
$$;

create or replace function public.mybike_friend_accept(friend_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.mybike_friendships set accepted = true
  where first_user = least(auth.uid(), friend_id) and second_user = greatest(auth.uid(), friend_id)
    and requested_by = friend_id and auth.uid() <> friend_id
$$;

create or replace function public.mybike_is_friend(other_user text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.mybike_friendships
    where accepted and (
      (first_user = auth.uid() and second_user::text = other_user)
      or (second_user = auth.uid() and first_user::text = other_user)
    )
  )
$$;

create or replace function public.mybike_can_use_room(room_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    room_key is null or room_key = 'general' or room_key like 'region:%'
    or exists (select 1 from public.mybike_room_members
      where user_id = auth.uid() and 'room:' || room_id::text = room_key)
  )
$$;

revoke execute on function public.mybike_rooms_list(), public.mybike_room_create(text),
  public.mybike_room_join(text), public.mybike_friends_list(), public.mybike_friend_request(uuid),
  public.mybike_friend_accept(uuid), public.mybike_is_friend(text), public.mybike_can_use_room(text) from public, anon;
grant execute on function public.mybike_rooms_list(), public.mybike_room_create(text),
  public.mybike_room_join(text), public.mybike_friends_list(), public.mybike_friend_request(uuid),
  public.mybike_friend_accept(uuid), public.mybike_is_friend(text), public.mybike_can_use_room(text) to authenticated;

drop policy if exists group_read on public.group_records;
create policy group_read on public.group_records for select to authenticated using (
  (kind not in ('message', 'poll', 'poll-vote') or public.mybike_can_use_room(payload ->> 'room'))
  and (kind <> 'media' or (payload ->> 'visibility') is distinct from 'friends'
    or author_id = auth.uid() or public.mybike_is_friend(author_id::text))
);

drop policy if exists group_insert on public.group_records;
create policy group_insert on public.group_records for insert to authenticated with check (
  author_id = auth.uid()
  and (kind not in ('message', 'poll', 'poll-vote') or public.mybike_can_use_room(payload ->> 'room'))
);
drop policy if exists group_update on public.group_records;
create policy group_update on public.group_records for update to authenticated
  using (kind = 'vehicle' or (kind = 'live-position' and author_id = auth.uid()))
  with check (kind = 'vehicle' or (kind = 'live-position' and author_id = auth.uid()));

update storage.buckets set public = false where id = 'group-media';
do $$ begin
  if not exists (select 1 from storage.buckets where id = 'group-media') then
    raise exception 'Crée le bucket privé group-media avant de lancer ce script.';
  end if;
end $$;
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select to authenticated using (
  bucket_id = 'group-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or case
      when (storage.foldername(name))[2] = 'friends' then public.mybike_is_friend((storage.foldername(name))[1])
      when (storage.foldername(name))[2] = 'rooms' then
        (storage.foldername(name))[3] is not null
        and public.mybike_can_use_room('room:' || (storage.foldername(name))[3])
      else true
    end
  )
);

notify pgrst, 'reload schema';
commit;
