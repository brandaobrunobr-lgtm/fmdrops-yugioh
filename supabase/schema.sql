-- =====================================================================
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
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,20}$'),
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
  select coalesce(u ~ '^[A-Za-z0-9_.-]{3,20}$', false)
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
  (1,3000,2500),
  (2,800,2000),
  (3,1200,1000),
  (4,1200,700),
  (5,1000,500),
  (6,1300,1400),
  (7,1400,1200),
  (8,800,600),
  (9,500,200),
  (10,1500,800),
  (11,1750,2030),
  (12,1800,1500),
  (13,1200,1400),
  (14,1800,1300),
  (15,1800,1600),
  (16,500,400),
  (17,200,300),
  (18,200,300),
  (19,200,300),
  (20,200,300),
  (21,1000,1000),
  (22,2500,1200),
  (23,1400,700),
  (24,300,200),
  (25,1300,1000),
  (26,1700,1000),
  (27,1200,1500),
  (28,800,1200),
  (29,600,1000),
  (30,1200,900),
  (31,1500,1200),
  (32,1600,1200),
  (33,2200,1500),
  (34,600,1500),
  (35,2500,2100),
  (36,1500,1200),
  (37,2600,2100),
  (38,2300,2100),
  (39,2000,1500),
  (40,200,1800),
  (41,1400,1200),
  (42,1200,2200),
  (43,1500,1200),
  (44,1600,1000),
  (45,1000,500),
  (46,1200,1500),
  (47,1200,600),
  (48,1000,600),
  (49,1200,1500),
  (50,500,700),
  (51,1500,1200),
  (52,1500,2000),
  (53,1200,1000),
  (54,1200,1400),
  (55,1500,1200),
  (56,500,400),
  (57,2600,2500),
  (58,300,200),
  (59,1200,800),
  (60,1600,800),
  (61,1200,800),
  (62,1300,1400),
  (63,1950,2100),
  (64,1300,1100),
  (65,1200,800),
  (66,1500,1200),
  (67,3500,3000),
  (68,1800,1500),
  (69,2400,2000),
  (70,1200,1400),
  (71,1200,1500),
  (72,0,2000),
  (73,1800,1500),
  (74,1300,2000),
  (75,800,600),
  (76,1100,1200),
  (77,1300,1200),
  (78,1700,1150),
  (79,1800,2000),
  (80,1500,800),
  (81,1600,1200),
  (82,2400,2000),
  (83,920,1930),
  (84,1380,1930),
  (85,2000,1530),
  (86,1380,1530),
  (87,1610,1460),
  (88,1150,2150),
  (89,1000,2000),
  (90,1800,2000),
  (91,1300,1550),
  (92,2000,1700),
  (93,1500,1700),
  (94,1600,1400),
  (95,1350,1400),
  (96,1500,0),
  (97,1600,0),
  (98,1350,0),
  (99,1800,2000),
  (100,700,1000),
  (101,700,600),
  (102,900,400),
  (103,800,1300),
  (104,600,500),
  (105,500,400),
  (106,1700,1400),
  (107,800,600),
  (108,700,900),
  (109,1200,1000),
  (110,1100,1000),
  (111,1600,1400),
  (112,1200,1000),
  (113,800,900),
  (114,1000,700),
  (115,1300,1100),
  (116,900,800),
  (117,1400,1200),
  (118,1000,1000),
  (119,1300,900),
  (120,1200,900),
  (121,700,1700),
  (122,900,300),
  (123,300,400),
  (124,1700,1400),
  (125,1500,1100),
  (126,1800,1500),
  (127,1700,1200),
  (128,1200,1700),
  (129,800,700),
  (130,600,400),
  (131,1600,1400),
  (132,1200,900),
  (133,1100,800),
  (134,700,700),
  (135,600,600),
  (136,1400,1300),
  (137,500,500),
  (138,1100,900),
  (139,900,700),
  (140,1000,1000),
  (141,700,1300),
  (142,900,1000),
  (143,800,900),
  (144,700,900),
  (145,700,700),
  (146,900,1300),
  (147,600,900),
  (148,800,700),
  (149,1400,1200),
  (150,1700,1400),
  (151,1200,1300),
  (152,500,700),
  (153,900,1200),
  (154,700,500),
  (155,800,1000),
  (156,300,1200),
  (157,700,600),
  (158,800,600),
  (159,500,800),
  (160,1000,500),
  (161,500,1000),
  (162,1250,800),
  (163,1300,1300),
  (164,1300,1000),
  (165,1400,700),
  (166,1000,1500),
  (167,400,200),
  (168,1500,1250),
  (169,1200,800),
  (170,800,2000),
  (171,1200,1000),
  (172,700,1300),
  (173,600,1000),
  (174,900,200),
  (175,1000,700),
  (176,800,600),
  (177,800,1000),
  (178,1000,800),
  (179,700,600),
  (180,800,1000),
  (181,1000,1000),
  (182,500,700),
  (183,600,800),
  (184,600,900),
  (185,600,500),
  (186,1100,1400),
  (187,700,800),
  (188,800,900),
  (189,900,700),
  (190,1000,800),
  (191,600,600),
  (192,400,300),
  (193,1000,1500),
  (194,1200,1300),
  (195,900,500),
  (196,1000,1200),
  (197,500,400),
  (198,800,500),
  (199,900,800),
  (200,600,700),
  (201,1200,1000),
  (202,400,600),
  (203,600,800),
  (204,1700,1400),
  (205,900,800),
  (206,900,700),
  (207,600,500),
  (208,600,900),
  (209,700,700),
  (210,600,500),
  (211,700,600),
  (212,700,600),
  (213,1200,2000),
  (214,800,400),
  (215,1000,800),
  (216,1200,1400),
  (217,3200,2500),
  (218,900,700),
  (219,1050,1000),
  (220,900,1400),
  (221,700,1400),
  (222,800,600),
  (223,2100,1800),
  (224,500,1100),
  (225,1400,800),
  (226,900,800),
  (227,600,700),
  (228,1000,900),
  (229,700,600),
  (230,1500,1200),
  (231,800,1200),
  (232,600,800),
  (233,1300,1100),
  (234,1600,800),
  (235,900,1200),
  (236,1000,1200),
  (237,500,500),
  (238,800,600),
  (239,900,700),
  (240,700,800),
  (241,1200,1200),
  (242,600,600),
  (243,900,700),
  (244,900,1000),
  (245,800,400),
  (246,1100,1000),
  (247,900,800),
  (248,1200,1000),
  (249,1400,1200),
  (250,800,1200),
  (251,1200,900),
  (252,1100,900),
  (253,800,1000),
  (254,500,750),
  (255,500,2000),
  (256,1200,1000),
  (257,800,1200),
  (258,1000,1100),
  (259,1000,1300),
  (260,750,1100),
  (261,700,600),
  (262,800,1300),
  (263,700,1400),
  (264,500,1300),
  (265,800,700),
  (266,900,700),
  (267,1000,500),
  (268,700,500),
  (269,1100,900),
  (270,1000,900),
  (271,900,600),
  (272,1300,900),
  (273,600,1500),
  (274,500,1600),
  (275,1500,1000),
  (276,1000,1000),
  (277,300,1300),
  (278,300,200),
  (279,1000,900),
  (280,800,1500),
  (281,1500,1000),
  (282,800,1000),
  (283,1100,700),
  (284,1200,900),
  (285,700,600),
  (286,1500,1800),
  (287,1200,1400),
  (288,600,1400),
  (289,400,300),
  (290,1100,1000),
  (291,1300,1000),
  (292,400,1000),
  (293,1100,1100),
  (294,1200,900),
  (295,600,1300),
  (296,700,1300),
  (297,1400,1200),
  (298,900,900),
  (299,1200,900),
  (300,800,800),
  (301,0,0),
  (302,0,0),
  (303,0,0),
  (304,0,0),
  (305,0,0),
  (306,0,0),
  (307,0,0),
  (308,0,0),
  (309,0,0),
  (310,0,0),
  (311,0,0),
  (312,0,0),
  (313,0,0),
  (314,0,0),
  (315,0,0),
  (316,0,0),
  (317,0,0),
  (318,0,0),
  (319,0,0),
  (320,0,0),
  (321,0,0),
  (322,0,0),
  (323,0,0),
  (324,0,0),
  (325,0,0),
  (326,0,0),
  (327,0,0),
  (328,0,0),
  (329,0,0),
  (330,0,0),
  (331,0,0),
  (332,0,0),
  (333,0,0),
  (334,0,0),
  (335,0,0),
  (336,0,0),
  (337,0,0),
  (338,0,0),
  (339,0,0),
  (340,0,0),
  (341,0,0),
  (342,0,0),
  (343,0,0),
  (344,0,0),
  (345,0,0),
  (346,0,0),
  (347,0,0),
  (348,0,0),
  (349,0,0),
  (350,0,0),
  (351,1300,1500),
  (352,1400,1400),
  (353,1500,1200),
  (354,1200,900),
  (355,1500,1800),
  (356,2300,2100),
  (357,1600,1800),
  (358,2500,2300),
  (359,1100,800),
  (360,2800,2300),
  (361,1200,1000),
  (362,0,3000),
  (363,1400,1000),
  (364,3000,2500),
  (365,2100,1800),
  (366,0,3000),
  (367,2200,100),
  (368,1600,1300),
  (369,1600,3000),
  (370,2400,2400),
  (371,2600,2200),
  (372,2400,2200),
  (373,2500,2400),
  (374,3750,3400),
  (375,1800,1500),
  (376,1800,1600),
  (377,1600,1200),
  (378,2000,1600),
  (379,1800,1000),
  (380,4500,3800),
  (381,800,1600),
  (382,1800,1600),
  (383,2000,1300),
  (384,1100,1500),
  (385,2300,2000),
  (386,2000,2500),
  (387,400,300),
  (388,1750,2000),
  (389,1850,1500),
  (390,2200,2500),
  (391,2600,1900),
  (392,3000,2300),
  (393,250,200),
  (394,250,300),
  (395,300,200),
  (396,1550,1650),
  (397,300,350),
  (398,300,250),
  (399,250,250),
  (400,1800,1500),
  (401,2150,1950),
  (402,250,350),
  (403,1750,1550),
  (404,1350,1600),
  (405,1450,1500),
  (406,1000,1300),
  (407,2200,2000),
  (408,1750,1900),
  (409,1850,1700),
  (410,400,500),
  (411,300,350),
  (412,1200,1400),
  (413,1500,1700),
  (414,900,1200),
  (415,1850,800),
  (416,850,1800),
  (417,800,900),
  (418,900,1600),
  (419,1700,1800),
  (420,700,500),
  (421,750,700),
  (422,500,400),
  (423,1650,1800),
  (424,1900,1800),
  (425,1600,1500),
  (426,2000,2300),
  (427,2300,2000),
  (428,300,400),
  (429,950,700),
  (430,1400,1000),
  (431,1150,900),
  (432,1100,700),
  (433,1450,1200),
  (434,1750,1500),
  (435,1250,1000),
  (436,500,400),
  (437,1900,1600),
  (438,1600,1900),
  (439,1650,1700),
  (440,1800,800),
  (441,1800,1500),
  (442,2250,1900),
  (443,2000,1700),
  (444,450,500),
  (445,1300,1000),
  (446,1050,900),
  (447,1800,800),
  (448,1600,1300),
  (449,1250,2100),
  (450,1200,900),
  (451,650,900),
  (452,600,700),
  (453,2000,2200),
  (454,1500,1000),
  (455,1000,1300),
  (456,1300,1200),
  (457,1200,1000),
  (458,1900,1400),
  (459,1200,1300),
  (460,1400,1500),
  (461,1100,800),
  (462,1500,1300),
  (463,800,900),
  (464,1800,1500),
  (465,2100,1800),
  (466,1550,1200),
  (467,2300,1800),
  (468,1200,2000),
  (469,300,300),
  (470,1300,1400),
  (471,2200,1800),
  (472,2100,1600),
  (473,1900,1500),
  (474,1100,1300),
  (475,300,250),
  (476,600,800),
  (477,950,700),
  (478,1000,800),
  (479,800,900),
  (480,1250,1000),
  (481,850,800),
  (482,1900,1500),
  (483,2000,1700),
  (484,300,350),
  (485,550,400),
  (486,650,500),
  (487,1800,1400),
  (488,400,500),
  (489,1100,600),
  (490,750,700),
  (491,1700,1500),
  (492,500,700),
  (493,1550,1400),
  (494,1550,1700),
  (495,1750,1500),
  (496,1000,1200),
  (497,900,1700),
  (498,1550,1300),
  (499,250,300),
  (500,2000,2100),
  (501,450,600),
  (502,1300,1100),
  (503,700,900),
  (504,400,300),
  (505,800,1000),
  (506,650,600),
  (507,1600,1200),
  (508,1800,1400),
  (509,2200,2000),
  (510,900,500),
  (511,1400,1300),
  (512,1400,1300),
  (513,1650,1600),
  (514,1300,1000),
  (515,1100,1400),
  (516,600,300),
  (517,1300,1600),
  (518,1450,2200),
  (519,1600,1500),
  (520,1900,1700),
  (521,1900,1700),
  (522,2000,1900),
  (523,1800,1000),
  (524,550,500),
  (525,1300,1800),
  (526,1750,1900),
  (527,300,250),
  (528,1600,1800),
  (529,2100,1800),
  (530,950,1000),
  (531,2100,1700),
  (532,1900,900),
  (533,1900,1700),
  (534,850,750),
  (535,1150,1400),
  (536,800,600),
  (537,750,600),
  (538,900,800),
  (539,1100,700),
  (540,900,400),
  (541,450,500),
  (542,1400,1600),
  (543,1350,800),
  (544,900,500),
  (545,1700,1900),
  (546,1250,900),
  (547,350,300),
  (548,400,300),
  (549,700,500),
  (550,1350,1000),
  (551,2000,800),
  (552,1200,1000),
  (553,1250,800),
  (554,1550,1800),
  (555,1700,1900),
  (556,800,600),
  (557,1400,1800),
  (558,400,400),
  (559,1250,700),
  (560,950,1400),
  (561,1200,1000),
  (562,750,600),
  (563,550,400),
  (564,2200,1800),
  (565,2100,1300),
  (566,1200,900),
  (567,1200,900),
  (568,1000,850),
  (569,900,800),
  (570,1300,800),
  (571,2100,1800),
  (572,2100,1700),
  (573,1100,700),
  (574,1100,1200),
  (575,1800,1900),
  (576,1100,1000),
  (577,1850,1600),
  (578,1350,1200),
  (579,750,400),
  (580,1100,900),
  (581,1450,1000),
  (582,1800,1700),
  (583,950,1500),
  (584,1000,1100),
  (585,800,1000),
  (586,650,900),
  (587,1300,1400),
  (588,900,1100),
  (589,500,600),
  (590,800,900),
  (591,700,600),
  (592,850,900),
  (593,1400,1800),
  (594,2000,1800),
  (595,1300,1400),
  (596,1600,1200),
  (597,1500,1200),
  (598,600,550),
  (599,1550,800),
  (600,1050,1200),
  (601,700,1400),
  (602,750,500),
  (603,1100,1200),
  (604,750,800),
  (605,950,800),
  (606,850,700),
  (607,1250,1300),
  (608,1300,1100),
  (609,600,700),
  (610,850,800),
  (611,650,500),
  (612,1100,800),
  (613,2800,2100),
  (614,1600,1400),
  (615,850,1400),
  (616,1100,1200),
  (617,1700,1600),
  (618,1900,1700),
  (619,1650,1900),
  (620,1000,1200),
  (621,1650,1300),
  (622,1600,1500),
  (623,1200,1300),
  (624,1650,1300),
  (625,1600,1100),
  (626,1300,1400),
  (627,1900,2000),
  (628,550,500),
  (629,950,1100),
  (630,1400,1100),
  (631,1500,1300),
  (632,1600,1500),
  (633,1400,1700),
  (634,1150,1300),
  (635,350,300),
  (636,1600,1200),
  (637,1500,1800),
  (638,1800,1500),
  (639,1850,1300),
  (640,900,700),
  (641,1350,1700),
  (642,1150,900),
  (643,1350,1000),
  (644,400,450),
  (645,1900,2200),
  (646,1300,700),
  (647,1500,900),
  (648,1600,1300),
  (649,1450,1000),
  (650,1650,1600),
  (651,0,0),
  (652,0,0),
  (653,0,0),
  (654,0,0),
  (655,0,0),
  (656,0,0),
  (657,0,0),
  (658,0,0),
  (659,0,0),
  (660,0,0),
  (661,0,0),
  (662,0,0),
  (663,0,0),
  (664,0,0),
  (665,0,0),
  (666,0,0),
  (667,0,0),
  (668,0,0),
  (669,0,0),
  (670,0,0),
  (671,0,0),
  (672,0,0),
  (673,0,0),
  (674,0,0),
  (675,0,0),
  (676,0,0),
  (677,0,0),
  (678,0,0),
  (679,0,0),
  (680,0,0),
  (681,0,0),
  (682,0,0),
  (683,0,0),
  (684,0,0),
  (685,0,0),
  (686,0,0),
  (687,0,0),
  (688,0,0),
  (689,0,0),
  (690,0,0),
  (691,0,0),
  (692,0,0),
  (693,0,0),
  (694,0,0),
  (695,0,0),
  (696,0,0),
  (697,0,0),
  (698,0,0),
  (699,0,0),
  (700,0,0),
  (701,1950,1850),
  (702,2000,1850),
  (703,2750,2500),
  (704,2050,2500),
  (705,2850,2350),
  (706,2350,2400),
  (707,2650,2250),
  (708,2900,2450),
  (709,2450,2000),
  (710,2550,2500),
  (711,2200,2350),
  (712,1800,2000),
  (713,3500,2000),
  (714,2250,1800),
  (715,2000,2350),
  (716,2550,2150),
  (717,2450,2550),
  (718,2350,2150),
  (719,1900,1850),
  (720,2000,1800),
  (721,0,0),
  (722,2800,2600)
on conflict (card_id) do update set atk = excluded.atk, def = excluded.def;
