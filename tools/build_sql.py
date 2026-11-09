"""Gera supabase/schema.sql (tabelas, segurança RLS, funções do ranking e ATK/DEF das 722 cartas).
Uso: python tools/build_sql.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "data", "fm-data.json"), encoding="utf-8"))
rows = ",\n".join(f"  ({c['id']},{c.get('a') or 0},{c.get('d') or 0})" for c in D["cards"])
sql = f"""-- =====================================================================
-- FMDrops Yugioh — banco de dados (Supabase)
-- Cole TUDO no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (é idempotente).
-- =====================================================================

-- Perfis públicos (só o apelido aparece; e-mail fica no sistema de login do Supabase)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{{3,20}}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

-- ATK/DEF oficiais das 722 cartas (a pontuação é calculada a partir daqui)
create table if not exists public.card_stats (
  card_id smallint primary key check (card_id between 1 and 722),
  atk int not null,
  def int not null
);

-- Cartas que cada jogador marcou como dropadas
create table if not exists public.user_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id smallint not null references public.card_stats(card_id),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists user_cards_card on public.user_cards(card_id);

-- ---------------- Segurança (Row Level Security) ----------------
alter table public.profiles   enable row level security;
alter table public.card_stats enable row level security;
alter table public.user_cards enable row level security;

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select using (true);
drop policy if exists "edita o proprio perfil" on public.profiles;
create policy "edita o proprio perfil" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "stats visiveis" on public.card_stats;
create policy "stats visiveis" on public.card_stats for select using (true);

drop policy if exists "colecoes visiveis" on public.user_cards;
create policy "colecoes visiveis" on public.user_cards for select using (true);
drop policy if exists "marca as proprias cartas" on public.user_cards;
create policy "marca as proprias cartas" on public.user_cards for insert
  with check (auth.uid() = user_id);
drop policy if exists "desmarca as proprias cartas" on public.user_cards;
create policy "desmarca as proprias cartas" on public.user_cards for delete
  using (auth.uid() = user_id);

-- ---------------- Cria o perfil automaticamente no cadastro ----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------- Funções públicas ----------------
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(name));
$$;

-- Ranking: maior ATK total; empate -> maior DEF; empate -> quem chegou primeiro
create or replace function public.leaderboard(max_rows int default 200)
returns table (pos bigint, username text, atk bigint, def bigint, cards bigint)
language sql stable security definer set search_path = public as $$
  with s as (
    select p.username, p.created_at,
           coalesce(sum(c.atk), 0) as atk, coalesce(sum(c.def), 0) as def,
           count(uc.card_id) as cards, max(uc.created_at) as last_at
    from profiles p
    left join user_cards uc on uc.user_id = p.id
    left join card_stats c on c.card_id = uc.card_id
    group by p.id
  ), r as (
    select row_number() over (order by atk desc, def desc, last_at asc nulls last, created_at asc) as pos,
           username, atk, def, cards
    from s where cards > 0
  )
  select * from r order by pos limit greatest(1, least(max_rows, 5000));
$$;

create or replace function public.player_profile(name text)
returns table (pos bigint, username text, atk bigint, def bigint, cards bigint)
language sql stable security definer set search_path = public as $$
  select * from leaderboard(5000) where lower(username) = lower(name);
$$;

create or replace function public.player_cards(name text)
returns table (card_id smallint)
language sql stable security definer set search_path = public as $$
  select uc.card_id from user_cards uc join profiles p on p.id = uc.user_id
  where lower(p.username) = lower(name) order by uc.card_id;
$$;

-- O próprio usuário apaga a conta (perfil e cartas vão junto, por cascata)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.leaderboard(int)          to anon, authenticated;
grant execute on function public.player_profile(text)      to anon, authenticated;
grant execute on function public.player_cards(text)        to anon, authenticated;

-- ---------------- ATK/DEF das 722 cartas ----------------
insert into public.card_stats (card_id, atk, def) values
{rows}
on conflict (card_id) do update set atk = excluded.atk, def = excluded.def;
"""
open(os.path.join(ROOT, "supabase", "schema.sql"), "w", encoding="utf-8", newline="\n").write(sql)
print("schema.sql ok,", len(D["cards"]), "cartas")
