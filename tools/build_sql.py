"""Gera supabase/schema.sql (tabelas, segurança RLS, funções do ranking e ATK/DEF das 722 cartas).
Uso: python tools/build_sql.py"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "data", "fm-data.json"), encoding="utf-8"))
rows = ",\n".join(f"  ({c['id']},{c.get('a') or 0},{c.get('d') or 0})" for c in D["cards"])
sql = f"""-- =====================================================================
-- FMDrops Yugioh — banco de dados (Supabase)
-- Cole TUDO no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem problema (é idempotente) — inclusive por cima da versão antiga.
--
-- Modelo de segurança ("banco travado"):
--  * Visitantes (anon) NÃO leem nem escrevem nenhuma tabela diretamente.
--  * Usuário logado só enxerga e altera os PRÓPRIOS dados (perfil e cartas).
--  * O que é público (ranking, cartas de quem está no ranking) sai só por funções
--    controladas, que devolvem apenas apelido, pontuação e números de cartas — nunca e-mail.
--  * Pontuação calculada no servidor a partir da tabela oficial card_stats.
--  * Sem SQL dinâmico: todas as consultas usam parâmetros (sem injeção de SQL).
-- =====================================================================

-- Perfis (o e-mail fica só no sistema de login do Supabase, nunca aqui)
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

-- ---------------- Permissões: tranca tudo e libera só o mínimo ----------------
revoke all on public.profiles, public.card_stats, public.user_cards from public, anon, authenticated;
grant select on public.profiles to authenticated;               -- (RLS: só a própria linha)
grant select, delete on public.user_cards to authenticated;     -- (RLS: só as próprias cartas)
grant insert (user_id, card_id) on public.user_cards to authenticated;  -- created_at é do servidor

-- ---------------- Row Level Security ----------------
alter table public.profiles   enable row level security;
alter table public.card_stats enable row level security;
alter table public.user_cards enable row level security;

-- remove as políticas da versão antiga (que deixavam tudo visível)
drop policy if exists "perfis visiveis" on public.profiles;
drop policy if exists "edita o proprio perfil" on public.profiles;
drop policy if exists "stats visiveis" on public.card_stats;
drop policy if exists "colecoes visiveis" on public.user_cards;
drop policy if exists "marca as proprias cartas" on public.user_cards;
drop policy if exists "desmarca as proprias cartas" on public.user_cards;
drop policy if exists "ve o proprio perfil" on public.profiles;
drop policy if exists "ve as proprias cartas" on public.user_cards;

create policy "ve o proprio perfil" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "ve as proprias cartas" on public.user_cards for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "marca as proprias cartas" on public.user_cards for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "desmarca as proprias cartas" on public.user_cards for delete to authenticated
  using ((select auth.uid()) = user_id);
-- card_stats: nenhuma política = ninguém lê direto (só as funções abaixo usam)

-- data da marcação sempre do relógio do servidor (ninguém "volta no tempo" para ganhar desempate)
create or replace function public.user_cards_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  return new;
end $$;
drop trigger if exists user_cards_stamp on public.user_cards;
create trigger user_cards_stamp before insert or update on public.user_cards
  for each row execute function public.user_cards_stamp();

-- ---------------- Regras do apelido (usadas no cadastro e na troca) ----------------
create or replace function public.username_ok(u text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(u ~ '^[A-Za-z0-9_.-]{{3,20}}$', false)
     and lower(u) not in ('admin','administrador','administrator','root','suporte','support','moderador',
                          'moderator','fmdrops','fmdropsyugioh','fmdrops-yugioh','supabase','system','sistema','null','undefined');
$$;

-- ---------------- Cria o perfil no cadastro (validação no servidor) ----------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare u text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if not public.username_ok(u) then
    raise exception 'invalid username';
  end if;
  insert into public.profiles (id, username) values (new.id, u);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------- Funções públicas (somente leitura, dados mínimos) ----------------
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.username_ok(name)
     and not exists (select 1 from public.profiles p where lower(p.username) = lower(name));
$$;

-- Ranking: maior ATK total; empate -> maior DEF; empate -> quem chegou primeiro
create or replace function public.leaderboard(max_rows int default 200)
returns table (pos bigint, username text, atk bigint, def bigint, cards bigint)
language sql stable security definer set search_path = '' as $$
  with s as (
    select p.username, p.created_at,
           coalesce(sum(c.atk), 0) as atk, coalesce(sum(c.def), 0) as def,
           count(uc.card_id) as cards, max(uc.created_at) as last_at
    from public.profiles p
    left join public.user_cards uc on uc.user_id = p.id
    left join public.card_stats c on c.card_id = uc.card_id
    group by p.id
  ), r as (
    select row_number() over (order by atk desc, def desc, last_at asc nulls last, created_at asc) as pos,
           username, atk, def, cards
    from s where cards > 0
  )
  select * from r order by pos limit greatest(1, least(coalesce(max_rows, 200), 500));
$$;

create or replace function public.player_profile(name text)
returns table (pos bigint, username text, atk bigint, def bigint, cards bigint)
language sql stable security definer set search_path = '' as $$
  with s as (
    select p.username, p.created_at,
           coalesce(sum(c.atk), 0) as atk, coalesce(sum(c.def), 0) as def,
           count(uc.card_id) as cards, max(uc.created_at) as last_at
    from public.profiles p
    left join public.user_cards uc on uc.user_id = p.id
    left join public.card_stats c on c.card_id = uc.card_id
    group by p.id
  ), r as (
    select row_number() over (order by atk desc, def desc, last_at asc nulls last, created_at asc) as pos,
           username, atk, def, cards
    from s where cards > 0
  )
  select * from r where length(name) <= 20 and lower(r.username) = lower(name);
$$;

-- só as cartas de quem está no ranking (é a exceção pública pedida)
create or replace function public.player_cards(name text)
returns table (card_id smallint)
language sql stable security definer set search_path = '' as $$
  select uc.card_id from public.user_cards uc join public.profiles p on p.id = uc.user_id
  where length(name) <= 20 and lower(p.username) = lower(name) order by uc.card_id;
$$;

-- O próprio usuário corrige o apelido (direito de correção — LGPD art. 18, III)
create or replace function public.change_username(new_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare u text := btrim(coalesce(new_name, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.username_ok(u) then raise exception 'invalid username'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(u) and id <> auth.uid()) then
    raise exception 'username taken';
  end if;
  update public.profiles set username = u where id = auth.uid();
end $$;

-- O próprio usuário apaga a conta (perfil e cartas vão junto, por cascata)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- execução das funções: ninguém por padrão; libera só o necessário
revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.user_cards_stamp()         from public, anon, authenticated;
revoke all on function public.username_available(text)   from public, anon, authenticated;
revoke all on function public.leaderboard(int)           from public, anon, authenticated;
revoke all on function public.player_profile(text)       from public, anon, authenticated;
revoke all on function public.player_cards(text)         from public, anon, authenticated;
revoke all on function public.delete_my_account()        from public, anon, authenticated;
revoke all on function public.change_username(text)      from public, anon, authenticated;
revoke all on function public.username_ok(text)          from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.leaderboard(int)          to anon, authenticated;
grant execute on function public.player_profile(text)      to anon, authenticated;
grant execute on function public.player_cards(text)        to anon, authenticated;
grant execute on function public.delete_my_account()       to authenticated;
grant execute on function public.change_username(text)     to authenticated;

-- ---------------- ATK/DEF das 722 cartas ----------------
insert into public.card_stats (card_id, atk, def) values
{rows}
on conflict (card_id) do update set atk = excluded.atk, def = excluded.def;
"""
open(os.path.join(ROOT, "supabase", "schema.sql"), "w", encoding="utf-8", newline="\n").write(sql)
print("schema.sql ok,", len(D["cards"]), "cartas")
