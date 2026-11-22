# Contexto para continuar — FMDrops + live do Mod 13

Cole este arquivo (ou o texto dele) na primeira mensagem para o Claude, em qualquer PC.
Atualizado em 22/11/2026.

## O projeto
- Site **FMDrops Yugioh** (drops do Yu-Gi-Oh! Forbidden Memories Mod 13 e original): https://brandaobrunobr-lgtm.github.io/fmdrops-yugioh/
- Código: repositório GitHub `brandaobrunobr-lgtm/fmdrops-yugioh` (branch `main` = site no ar, publicado pelo GitHub Pages). O trabalho da live está no ramo **`painel-live`** (ainda não juntado ao `main`).
- Site estático (HTML + CSS + JS puro, sem build). Login e ranking no Supabase (`https://itsnqtojjsvktvadeheh.supabase.co`, só a chave pública *publishable* fica no site; nunca usar a chave `service_role`/secret).
- Coleção: `localStorage` (`fmd:owned`) quando sem conta; com conta, tabela `user_cards` via `assets/online.js`. RPCs públicas: `leaderboard`, `player_profile(name)`, `player_cards(name)`.
- Regras combinadas: commits com e-mail noreply do GitHub (`239413677+brandaobrunobr-lgtm@users.noreply.github.com`) e linha "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"; confirmar comigo antes de qualquer push; não remover `google1a8ce628625aa7b9.html` (verificação do Search Console).

## O jogo (PC da live)
- Não é emulador: é o **YFM Re-Decomp v0.3.0** (versão nativa para PC), em `D:\Bruno\YU-GI-OH PC\yfm-redecomp-v0.3.0\memories-pc.exe`.
- ROM: `D:\PS1\PS1\isos\Yu-Gi-Oh! Forbidden Memories (PT-BR).bin` = **Mod 13 em português**. Mods do Re-Decomp ligados: 3D Monsters, Hand Camera, Yamyi Mods (mostra a lista de drops na tela de resultado), texturas HD.
- Save e configurações: `Documents\My Games\YFM Re-Decomp\` (`saves\slot01.sav`). O Re-Decomp abre **2 processos** `memories-pc.exe` (o jogo e um monitor sem a RAM).
- Memória (RAM do PS1 mapeada no endereço real, 0x80000000, dentro do processo; leitura só com ReadProcessMemory):
  - estado do save em `0x801D0200`: deck = 40 × u16 em +0x000; **baú = 722 bytes em +0x050** (`0x801D0250`); código do duelista u32 em +0x334; 16 drops recentes u16 em +0x5BC (mais novo primeiro); starchips u32 em +0x5E0. No arquivo `.sav` o mesmo bloco começa em 0x200.
  - duelo: 2 registros de 0x20 em `0x800E9FF0` (lado 0 = você), LP u16 em +0x14, LP máx em +0x16; vencedor s8 em `0x8009B238` (-1 durante o duelo); oponente s8 em `0x8009B361` (mesma numeração de `data/fm-data.json` → duelists).
  - os drops só entram no baú quando você sai da tela de resultado.

## O que está pronto (ramo `painel-live`)
- `tools/fm-live/fmlive.py` (só Python, sem instalar nada): lê o jogo (ou o save), serve o site e `/estado` em `http://127.0.0.1:8765`; detecta cada drop (inclusive repetidas) e eventos de ataque/dano/vitória/derrota; controla o OBS por obs-websocket (senha só na config do OBS) e grava **um vídeo por duelo**, com nome `data - vs Oponente - vitória.mp4`, na pasta Vídeos. `/simular?ataque|dano|vitoria|derrota` testa o avatar.
- Páginas: `live.html?jogo=1` (painel X/722, +N nesta live, ATK/DEF, starchips, "NOVA CARTA!"), `&v=drop` (último drop 640×360), `&v=avatar` (avatar 480×340 que reage), `live.html?v=fundo` (fundo 1920×1080 com o link do site; vira `img/fundo-live.jpg`).
- Avatar: `img/avatar/normal.png` (cavaleiro de armadura vermelha num medalhão dourado). Opcionais: `feliz.png`, `triste.png`, `vitoria.png`, `derrota.png`.
- OBS 33 instalado; `tools/fm-live/configurar-obs.py --forcar` cria o perfil/cena **FMDrops** (jogo recortado 1280×960 à esquerda em 1440×1080, coluna da direita com painel, último drop, avatar; fundo em imagem; som só do jogo; MP4 híbrido, Quick Sync, 30 fps) e liga o obs-websocket.
- Uso: abrir o jogo → `tools/fm-live/iniciar-live.bat` (deixar aberto) → `tools/fm-live/gravar-jogo.bat` (OBS minimizado; `gravar-jogo.bat continuo` grava sem parar).
- Testado em jogo real: 69 duelos gravados um por arquivo (21–22/11), coleção do save novo chegou a 261/722.

## Pendências / ideias
- Memória: o PC tem 8 GB. Numa sessão de ~3 h o OBS chegou a 9,4 GB (páginas do painel). Já trocado o fundo animado por imagem e o painel/drop para 15 fps; **falta medir numa sessão longa**. WSL/Docker e Java também pesam.
- Se o OBS fechar sem querer, ele abre perguntando "modo de segurança": apagar `%APPDATA%\obs-studio\.sentinel\*`.
- Juntar `painel-live` no `main` quando quiser publicar; a página Coleção ainda pode receber os drops do jogo e marcar na conta (ideia antiga, não feita).
- Nomes das cartas nos painéis vêm do site (inglês); o jogo mostra em português.

## Plano de vídeos
Ainda sem 1.000 seguidores: gravar a série "do zero ao deck final" no OBS já com o painel; cortar vídeos curtos; usar a mesma cena na live depois.
