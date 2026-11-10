# Segurança — FMDrops Yugioh

Auditoria feita em 09/11/2026, antes de ativar o login e o ranking.

## Arquitetura (o que existe para proteger)

- **Site estático no GitHub Pages:** HTML, CSS e JS, sem servidor próprio, sem painel de admin e sem upload de arquivos.
- **Login e banco no Supabase:**
  - autenticação por e-mail e senha;
  - Postgres com Row Level Security (RLS).
- **Dados dos usuários guardados:**
  - e-mail, que fica só no Supabase Auth;
  - apelido;
  - lista de cartas marcadas.
- **Senhas:** nunca passam por este site nem ficam guardadas por ele. Vão direto para o Supabase, que guarda apenas o hash (bcrypt).

## Checklist

| # | Item | Situação | Como foi resolvido |
|---|------|----------|--------------------|
| 1 | Chave de API protegida | ✅ | No site só existe a chave **publishable**, feita para ficar pública. A chave secreta (`sb_secret_…` / `service_role`) nunca saiu do painel do Supabase e não está no código nem no histórico do git. Quem protege os dados são as regras do banco (itens 5–7). |
| 2 | `.env` nunca exposto | ✅ | O projeto não usa `.env`. Mesmo assim, o `.gitignore` bloqueia `.env`, `.env.*`, `*.pem`, `*.key`, `secrets*` e `*service_role*`. |
| 3 | Sem senha no código | ✅ | Nenhuma senha ou credencial no código. O simulador local de testes (`tools/mock-supabase.js`, que tem senhas falsas) saiu do repositório e ficou só no computador. O campo "Senha" na página de cada carta é o código de 8 dígitos do jogo, não uma credencial. |
| 4 | Tela de login de verdade | ✅ | Páginas próprias: `#/entrar`, `#/cadastro`, `#/recuperar` e `#/nova-senha`. Têm mostrar/ocultar senha, medidor de força, regras de senha e confirmação por e-mail. Para trocar a senha é preciso digitar a senha atual. |
| 5 | Permissões do servidor conferidas | ✅ | `revoke all` em todas as tabelas para `anon` e `authenticated`, e cada permissão liberada uma a uma. Visitante não lê nem grava nenhuma tabela. Usuário logado só faz SELECT/DELETE nas próprias linhas e INSERT só das colunas `user_id` e `card_id`. Ninguém faz UPDATE em nada. |
| 6 | Cada um só vê o seu usuário (exceto o ranking) | ✅ | RLS: `profiles` e `user_cards` só devolvem as linhas do próprio `auth.uid()`. A parte pública sai só pelas funções `leaderboard`, `player_profile` e `player_cards`, que devolvem apenas apelido, pontos e números de cartas, nunca o e-mail. |
| 7 | Banco travado | ✅ | RLS ativo nas 3 tabelas. `card_stats` (ATK/DEF oficiais) não tem nenhuma política, então ninguém lê nem altera direto. Funções com `security definer` e `search_path = ''`. Execução de funções revogada por padrão e liberada uma a uma. `delete_my_account` só para usuário logado. |
| 8 | Admin protegido | ⚠️ ação sua | O site não tem área de admin, portanto não há porta de admin para atacar. Os "admins" reais são a sua conta do **Supabase** e a do **GitHub**: ative a verificação em 2 etapas (2FA) nas duas. |
| 9 | Debug desligado | ✅ | Sem `console.log`, sem modo debug e sem mapas de código. O simulador de testes não vai para o site. |
| 10 | Erros sem detalhes | ✅ | Erros do servidor são traduzidos para mensagens curtas em português, e qualquer erro desconhecido vira uma mensagem genérica. As mensagens não revelam se um e-mail tem conta (cadastro e "esqueci a senha" respondem igual). |
| 11 | Tudo validado no servidor | ✅ | **Apelido:** regex `^[A-Za-z0-9_.-]{3,20}$` no banco (CHECK e trigger), lista de nomes reservados (admin, suporte…) e unicidade sem diferenciar maiúsculas. **Carta:** só de 1 a 722 (chave estrangeira). **Data da marcação:** sempre do relógio do servidor, então ninguém forja o desempate. **Pontuação:** calculada no banco. **Senha:** mínimo e regras no Supabase Auth (ver "Configurações no painel"). O navegador valida antes só para dar resposta rápida. |
| 12 | Conteúdo do usuário limpo | ✅ | O único texto livre é o apelido, que o servidor restringe a letras, números e `_ . -`. Mesmo assim, tudo que vai para a tela passa por `esc()` (escape de HTML). Endereços `#/jogador/...` malformados são tratados. Dados do `localStorage` e de arquivos importados são filtrados (só números de 1 a 722). |
| 13 | Upload protegido | ✅ | Não existe upload para o servidor: nenhum bucket no Supabase Storage. A "importação de coleção" lê o arquivo só no navegador, com limite de 50 KB, e aceita apenas números de cartas válidos. |
| 14 | Sem injeção de SQL | ✅ | Não há SQL montado com texto do usuário: a API do Supabase usa parâmetros, e as funções SQL não usam `EXECUTE` dinâmico. |
| 15 | Limite de tentativas (login e cadastro) | ✅ + ⚠️ | **Servidor:** limites do Supabase Auth por IP, configuráveis em *Authentication → Rate Limits*. **Navegador:** depois de 5 senhas erradas, o login bloqueia por 30 s, dobrando a cada erro até 15 min. Cadastro e "esqueci a senha" têm 1 tentativa por minuto. Trocar senha exige a senha atual e também tem limite. |
| 16 | Git sem senha vazada | ✅ | Histórico verificado (`git log -p --all`) atrás de `sb_secret`, `service_role`, tokens JWT, tokens do GitHub e `password=`: nada encontrado. Commits usam o e-mail *noreply* do GitHub. |
| 17 | Headers de segurança e CORS | ✅ parcial | O GitHub Pages não permite headers HTTP próprios, então usamos o que funciona via `<meta>`. **CSP:** só scripts, fontes e estilos do próprio site (`script-src 'self'`, sem nenhum script inline), conexão só com o seu Supabase, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`. **Referrer-Policy:** `strict-origin-when-cross-origin`. **Bibliotecas:** supabase-js e qrcode-generator agora ficam no próprio site, com o SHA-384 conferido contra as CDNs oficiais; as fontes também, então não sobra nenhuma dependência externa em tempo de execução. **Anti-clickjacking:** via JS, o site se recusa a rodar dentro de iframe. **HTTPS:** obrigatório pelo GitHub Pages. **CORS:** o Supabase aceita requisições de qualquer origem. Isso é normal para APIs com chave pública, e a proteção real fica nas regras do banco (5–7), não no CORS. Para headers HTTP completos (HSTS, X-Frame-Options), seria preciso um domínio próprio atrás do Cloudflare. |
| 18 | Teste como um estranho | ✅ | Testado de fora, sem login, contra o servidor real: ler tabelas, gravar carta sem login, apagar conta, trocar apelido, GraphQL (desativado), Storage (sem buckets) e esquema da API, tudo bloqueado; apelido "admin" indisponível. O arquivo `supabase/security_tests.sql` simula visitante e dois jogadores tentando burlar as regras e desfaz tudo no final: rodado no banco real em 09/11/2026, **28 de 28 testes OK**. |
| 19 | Auditoria | ✅ | Este documento. |

## Configurações no painel do Supabase (feitas pelo dono do projeto)

1. **Authentication → Sign In / Providers → Email:**
   - *Confirm email* ligado;
   - *Secure email change* ligado;
   - *Secure password change* ligado;
   - *Minimum password length* 8;
   - *Password requirements*: "Letters and digits".
2. **Authentication → Rate Limits:** revisar os limites de cadastro e login por IP. Os padrões já são razoáveis.
3. **Authentication → Sign In / Providers:** manter *Allow anonymous sign-ins* desligado.
4. **Advisors → Security Advisor:** rodar e confirmar que não aparece nenhum alerta.
5. **Conta do Supabase e do GitHub:** ligar o 2FA.

## Privacidade (LGPD), cookies e acessibilidade

| # | Item | Situação | Como foi resolvido |
|---|------|----------|--------------------|
| 20 | Política de privacidade | ✅ | Página `#/privacidade`, em linguagem simples. Cobre: controlador e contato, dados tratados, finalidade e base legal (art. 7º, I, V e IX), o que é público, operadores (Supabase e GitHub), transferência internacional (art. 33), cookies, retenção, direitos (art. 18), segurança, menores (art. 14) e mudanças. Ligada no rodapé de todas as páginas e no cadastro. |
| 21 | Aviso de cookies | ✅ | Aviso informativo na primeira visita, com botão "Entendi", acessível e lembrado por versão da política. O site não usa cookies; só o armazenamento local essencial (preferências, coleção, sessão de login). Por isso não precisa de opções de aceitar ou recusar. |
| 22 | Formulários conforme a LGPD | ✅ | O cadastro pede consentimento destacado e específico para a exibição pública (apelido, cartas e pontos) e a confirmação de idade ou autorização do responsável. O aceite é registrado com versão e data. O e-mail é marcado como "não aparece para ninguém". |
| 23 | Só os dados necessários | ✅ | Só e-mail, apelido e cartas marcadas. Não pedimos nome real, CPF, telefone, endereço, nascimento nem localização. Sem conta, nada vai para o servidor. |
| 24 | Scripts de tracking | ✅ | Nenhum: sem Analytics, pixels, anúncios ou mapas de calor. As fontes do Google e as CDNs foram trocadas por arquivos do próprio site, então abrir uma página não envia o IP do visitante a terceiros. Conferido no navegador: zero requisições para outros domínios. |
| 25 | Direitos do titular | ✅ | Em *Minha conta*: **Baixar meus dados** (JSON com conta, perfil, aceite e cartas — acesso e portabilidade), **Corrigir apelido** (validado no servidor por `change_username`) e **Excluir minha conta** (eliminação e revogação). Os demais pedidos vão pelo canal de contato da política. |
| 26 | Acessibilidade | ✅ | Link "Pular para o conteúdo", `aria-label` no menu e `aria-current` na página ativa. Todo elemento clicável é alcançável por **Tab** e ativável por **Enter/Espaço**, com `role` e `aria-pressed` nos filtros. Foco visível em tudo. O foco vai para o título a cada troca de página, para o leitor de tela anunciar. Mensagens de erro com `role=alert`, e animações desligadas para quem pede menos movimento. |
| 27 | `alt` nas imagens | ✅ | Todas as imagens têm `alt`: o nome da carta ou do duelista, ou vazio quando é decorativa e o nome já está escrito ao lado. Verificação automática: 0 imagens sem `alt`. |
| 28 | Contraste | ✅ | Cores do tema claro corrigidas para o nível WCAG 2.1 AA (texto ≥ 4,5:1): dourado, cinza, verde, vermelho e cores de ATK/DEF/rank. Verificação automática do texto visível em 10 telas × 2 temas: 0 falhas. |
| 29 | Direitos autorais das imagens | ⚠️ | Créditos em *Sobre → Direitos autorais*: © Kazuki Takahashi / Konami, imagens via Yugipedia, uso reduzido e informativo, projeto sem fins lucrativos e canal para pedido de remoção. As licenças das fontes (OFL) e das bibliotecas (MIT) estão em `assets/fonts` e `assets/vendor`. **Risco:** as artes pertencem à Konami e não há licença formal; o uso de fã é tolerado, mas não é garantido. As doações aumentam um pouco esse risco. |

## Limitações conhecidas

- O ranking é declarativo: o jogador marca as cartas que diz ter. Não há como provar o drop no jogo.
- O bloqueio de tentativas no navegador pode ser contornado por quem limpa os dados do navegador. O limite que vale de verdade é o do servidor (Supabase Auth). Para mais proteção, dá para ativar um CAPTCHA (Cloudflare Turnstile) em *Authentication → Attack Protection*.

## Como reportar uma falha

Abra uma *issue* no repositório sem incluir detalhes exploráveis, ou fale com o mantenedor pelo GitHub.
