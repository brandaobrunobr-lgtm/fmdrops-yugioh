# Contexto para continuar no outro PC — FMDrops + live do Mod 13

Cole este arquivo (ou o texto dele) na primeira mensagem para o Claude no outro PC.

## O projeto
- Site **FMDrops Yugioh** (drops do Yu-Gi-Oh! Forbidden Memories Mod 13 e original): https://brandaobrunobr-lgtm.github.io/fmdrops-yugioh/
- Código: repositório GitHub `brandaobrunobr-lgtm/fmdrops-yugioh` (branch `main` = site no ar, publicado pelo GitHub Pages).
- Site estático (HTML + CSS + JS puro, sem build). Login e ranking no Supabase (`https://itsnqtojjsvktvadeheh.supabase.co`, só a chave pública *publishable* fica no site; nunca usar a chave `service_role`/secret).
- Coleção: `localStorage` (`fmd:owned`) quando sem conta; com conta, tabela `user_cards` via `assets/online.js`. RPCs públicas: `leaderboard`, `player_profile(name)`, `player_cards(name)`.
- Regras combinadas: commits com e-mail noreply do GitHub e linha "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; confirmar comigo antes de qualquer push; não remover `google1a8ce628625aa7b9.html` (verificação do Search Console).

## Painel de live (feito, AINDA NÃO PUBLICADO)
Arquivos novos no PC principal (fora do git até agora): `live.html`, `assets/live.js`, `assets/live.css`; e 1 linha em `assets/app.js` (botão "📺 Painel para live" na página Coleção).
- `live.html` sem parâmetros = tela de configuração que gera o link.
- `live.html?u=APELIDO` = lê o ranking a cada 15 s. `?local=1` = lê a coleção do navegador.
- Extras: `n` (nº da live), `t` (título), `m` (meta), `bg=transp` (fundo transparente).
- Mostra X/722, barra, "+N nesta live", ATK/DEF, posição no ranking, meta, miniaturas e destaque animado "NOVA CARTA!".
- OBS / TikTok LIVE Studio: fonte Navegador/Link, 1080 × 700.

## Próximo passo: ligar o jogo ao painel
Ideia: programa auxiliar (Python) no PC do jogo lê a memória do emulador, detecta cartas novas no baú e:
1. avisa o painel (NOVA CARTA! + últimos drops) — servidor local em 127.0.0.1, painel com modo `?jogo=1` (ajustar CSP `connect-src`);
2. opcional: a página Coleção, logada no navegador, recebe os drops e marca na conta (o programa nunca recebe senha).
- Pista da memória (versão NTSC-U, SLUS-01411): baú = 1 byte por carta em `0x1D0250 + (id - 1)` (código Codebreaker da carta 513 escreve em `0x1D0450`). **Confirmar no Mod 13** com testes no jogo. Cartas do deck ficam em outro lugar (descobrir).
- Falta saber: **qual emulador** roda o jogo (DuckStation, ePSXe, BizHawk, RetroArch…) e a versão.

## Plano de vídeos
Ainda sem 1.000 seguidores: gravar a série "do zero ao deck final" no OBS já com o painel; cortar vídeos curtos; usar a mesma cena na live depois.
