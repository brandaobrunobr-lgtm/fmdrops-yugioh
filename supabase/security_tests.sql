-- =====================================================================
-- FMDrops Yugioh — TESTE DE SEGURANÇA ("teste como um estranho")
-- Rode DEPOIS do schema.sql: SQL Editor > New query > cole tudo > Run.
-- Cria 2 usuários falsos, tenta burlar as regras como visitante e como
-- outro jogador, e DESFAZ TUDO no final (nada fica gravado no banco).
-- Resultado esperado: 28 linhas, todas com resultado = 'OK'.
-- =====================================================================
create temp table if not exists _sec (n int, teste text, resultado text);
truncate _sec;

do $$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  r text[] := '{}';
  k int;
begin
  begin  -- subtransação: tudo aqui dentro é desfeito no final
    insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (a, 'teste-a@exemplo.invalid', '{"username":"zzTesteA"}', 'authenticated', 'authenticated'),
           (b, 'teste-b@exemplo.invalid', '{"username":"zzTesteB"}', 'authenticated', 'authenticated');
    insert into public.user_cards (user_id, card_id) values (b, 1), (b, 2);

    -- 1) cadastro com apelido malicioso deve falhar
    begin
      insert into auth.users (id, email, raw_user_meta_data, aud, role)
      values ('00000000-0000-4000-a000-00000000000c', 'c@exemplo.invalid', '{"username":"<script>alert(1)</script>"}', 'authenticated', 'authenticated');
      r := r || ('FALHOU|1|apelido com <script> no cadastro foi aceito')::text;
    exception when others then r := r || ('OK|1|apelido com <script> recusado no servidor')::text; end;
    begin
      insert into auth.users (id, email, raw_user_meta_data, aud, role)
      values ('00000000-0000-4000-a000-00000000000d', 'd@exemplo.invalid', '{"username":"admin"}', 'authenticated', 'authenticated');
      r := r || ('FALHOU|2|apelido reservado "admin" foi aceito')::text;
    exception when others then r := r || ('OK|2|apelido reservado "admin" recusado')::text; end;

    -- ======== como VISITANTE (anon) ========
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin perform 1 from public.profiles limit 1; r := r || ('FALHOU|3|visitante leu a tabela de perfis')::text;
    exception when insufficient_privilege then r := r || ('OK|3|visitante não lê perfis')::text; end;
    begin perform 1 from public.user_cards limit 1; r := r || ('FALHOU|4|visitante leu as cartas dos usuários')::text;
    exception when insufficient_privilege then r := r || ('OK|4|visitante não lê cartas dos usuários')::text; end;
    begin perform 1 from public.card_stats limit 1; r := r || ('FALHOU|5|visitante leu card_stats direto')::text;
    exception when insufficient_privilege then r := r || ('OK|5|visitante não lê tabelas internas')::text; end;
    begin insert into public.user_cards (user_id, card_id) values (b, 3); r := r || ('FALHOU|6|visitante gravou carta')::text;
    exception when insufficient_privilege then r := r || ('OK|6|visitante não grava cartas')::text; end;
    begin perform public.delete_my_account(); r := r || ('FALHOU|7|visitante executou delete_my_account')::text;
    exception when insufficient_privilege then r := r || ('OK|7|visitante não apaga contas')::text; end;
    begin perform public.change_username('Invasor'); r := r || ('FALHOU|28|visitante executou change_username')::text;
    exception when insufficient_privilege then r := r || ('OK|28|visitante não troca apelidos')::text; end;
    select count(*) into k from public.leaderboard(10);
    r := r || (case when k >= 1 then 'OK|8|ranking público funciona para visitante' else 'FALHOU|8|ranking não respondeu' end)::text;
    select count(*) into k from public.leaderboard(100000);
    r := r || ('OK|9|ranking limitado a 500 linhas (pedido de 100000 devolveu ' || k || ')')::text;
    reset role;

    -- ======== como JOGADOR A (logado) tentando mexer no B ========
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    begin insert into public.user_cards (user_id, card_id) values (a, 380); r := r || ('OK|10|A marca a própria carta')::text;
    exception when others then r := r || ('FALHOU|10|A não conseguiu marcar a própria carta: ' || sqlerrm)::text; end;
    begin insert into public.user_cards (user_id, card_id) values (b, 380); r := r || ('FALHOU|11|A gravou carta na conta de B')::text;
    exception when others then r := r || ('OK|11|A não grava na conta de B')::text; end;
    begin insert into public.user_cards (user_id, card_id, created_at) values (a, 5, '2000-01-01'); r := r || ('FALHOU|12|A forjou a data da marcação')::text;
    exception when others then r := r || ('OK|12|A não forja a data (desempate)')::text; end;
    begin insert into public.user_cards (user_id, card_id) values (a, 999); r := r || ('FALHOU|13|carta 999 aceita')::text;
    exception when others then r := r || ('OK|13|carta inexistente recusada')::text; end;
    select count(*) into k from public.profiles;
    r := r || (case when k = 1 then 'OK|14|A só enxerga o próprio perfil' else 'FALHOU|14|A enxerga ' || k || ' perfis' end)::text;
    select count(*) into k from public.user_cards;
    r := r || (case when k = 1 then 'OK|15|A só enxerga as próprias cartas' else 'FALHOU|15|A enxerga ' || k || ' cartas' end)::text;
    delete from public.user_cards where user_id = b;
    get diagnostics k = row_count;
    r := r || (case when k = 0 then 'OK|16|A não apaga cartas de B' else 'FALHOU|16|A apagou ' || k || ' cartas de B' end)::text;
    begin update public.profiles set username = 'Hacker' where id = b; get diagnostics k = row_count;
      r := r || (case when k = 0 then 'OK|17|A não altera perfil de B' else 'FALHOU|17|A alterou perfil de B' end)::text;
    exception when insufficient_privilege then r := r || ('OK|17|A não altera perfil de B')::text; end;
    begin update public.profiles set created_at = '2000-01-01' where id = a; get diagnostics k = row_count;
      r := r || (case when k = 0 then 'OK|18|A não forja a data de cadastro' else 'FALHOU|18|A alterou a própria data de cadastro' end)::text;
    exception when insufficient_privilege then r := r || ('OK|18|A não forja a data de cadastro')::text; end;
    begin update public.card_stats set atk = 99999 where card_id = 1; get diagnostics k = row_count;
      r := r || (case when k = 0 then 'OK|19|A não altera ATK/DEF oficiais' else 'FALHOU|19|A alterou ATK oficial' end)::text;
    exception when insufficient_privilege then r := r || ('OK|19|A não altera ATK/DEF oficiais')::text; end;
    begin perform 1 from auth.users limit 1; r := r || ('FALHOU|20|A leu a tabela de e-mails (auth.users)')::text;
    exception when insufficient_privilege then r := r || ('OK|20|e-mails (auth.users) inacessíveis')::text; end;
    select count(*) into k from public.leaderboard(10) where username in ('zzTesteA', 'zzTesteB');
    r := r || (case when k = 2 then 'OK|21|ranking mostra A e B (exceção pública)' else 'FALHOU|21|ranking incompleto' end)::text;
    select count(*) into k from public.player_cards('zzTesteB');
    r := r || (case when k = 2 then 'OK|22|cartas de B visíveis só pelo ranking' else 'FALHOU|22|player_cards devolveu ' || k end)::text;
    begin perform public.change_username('zzTesteB'); r := r || ('FALHOU|25|A pegou o apelido de B')::text;
    exception when others then r := r || ('OK|25|A não pega apelido de outro jogador')::text; end;
    begin perform public.change_username('<b>x</b>'); r := r || ('FALHOU|26|apelido com HTML aceito na troca')::text;
    exception when others then r := r || ('OK|26|troca de apelido valida no servidor')::text; end;
    begin perform public.change_username('zzTesteA2'); select count(*) into k from public.profiles where username = 'zzTesteA2';
      r := r || (case when k = 1 then 'OK|27|A corrige o próprio apelido' else 'FALHOU|27|troca de apelido não gravou' end)::text;
    exception when others then r := r || ('FALHOU|27|A não conseguiu corrigir o apelido: ' || sqlerrm)::text; end;
    begin perform public.delete_my_account();
    exception when others then r := r || ('FALHOU|23|delete_my_account deu erro: ' || sqlerrm)::text; end;
    reset role;
    select count(*) into k from public.profiles where id = a;
    r := r || (case when k = 0 then 'OK|23|A apagou a própria conta' else 'FALHOU|23|conta de A não foi apagada' end)::text;
    select count(*) into k from public.profiles where id = b;
    r := r || (case when k = 1 then 'OK|24|conta de B intacta' else 'FALHOU|24|conta de B sumiu' end)::text;

    raise exception 'FIM_DOS_TESTES';   -- desfaz tudo o que foi criado acima
  exception when others then   -- desfaz tudo; erro inesperado vira linha FALHOU no resultado
    if sqlerrm <> 'FIM_DOS_TESTES' then r := r || ('FALHOU|0|erro inesperado: ' || replace(sqlerrm, '|', '/'))::text; end if;
  end;
  insert into _sec select split_part(x, '|', 2)::int, split_part(x, '|', 3), split_part(x, '|', 1) from unnest(r) x;
end $$;

select n, resultado, teste from _sec order by n;
