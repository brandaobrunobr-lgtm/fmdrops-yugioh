# FMDrops Yugioh — Yu-Gi-Oh! Forbidden Memories (Mod 13 + Original)

Site estático e interativo com as tabelas de drop do **Yu-Gi-Oh! Forbidden Memories**:
722 cartas, 39 duelistas, ranks S/A-POW, S/A-TEC e B/C/D, no **Mod 13** e no **jogo original**.

## Funcionalidades
- **Cartas**: busca por nome/número, filtros (categoria, tipo, guardian star, ATK, rank, com/sem drop, coleção), ordenação por chance.
- **Página da carta**: quem dropa em cada rank, chance em % e /2048, média de duelos ("1 em N"), diferença Mod 13 × Original, rituais e duelistas que a usam no deck. Link compartilhável.
- **Duelistas**: tudo o que cada oponente dropa por rank, e as cartas do deck dele.
- **Planejador de farm**: monte sua lista de desejos e veja o duelista + rank que mais rende.
- **Coleção**: marque o que já tem, progresso 0/722, exportar/importar.
- **Mod 13 × Original**: todas as 348 mudanças de drop do mod.
- **Contas e ranking** (opcional, via Supabase): login com e-mail e senha, coleção salva na nuvem, ranking por ATK/DEF somados das cartas dropadas e perfil público de cada jogador no visual de lista de cartas do jogo.
- **Doação**: Pix com QR Code e "copia e cola" para qualquer valor, e links (Ko-fi, PayPal etc.).
- Tema claro/escuro, funciona no celular, sem anúncios.

## Configurar a doação
Edite `assets/config.js`:
```js
pix: { key: "sua-chave-pix", name: "SEU NOME", city: "SUA CIDADE", message: "Apoio FMDrops Yugioh" },
links: [ { label: "Ko-fi", url: "https://ko-fi.com/seuusuario" } ]
```
Teste o QR com o app do seu banco antes de divulgar.

## Ativar login e ranking (Supabase — gratuito)
1. Crie uma conta em https://supabase.com e clique em **New project** (região: *South America (São Paulo)*).
   Guarde a senha do banco num lugar seguro; ela não vai para o site.
2. No projeto: **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**.
   (Cria as tabelas, as regras de segurança, as funções do ranking e o ATK/DEF das 722 cartas.)
3. **Authentication → URL Configuration**:
   - *Site URL*: `https://brandaobrunobr-lgtm.github.io/fmdrops-yugioh/`
   - *Redirect URLs*: adicione o mesmo endereço.
4. **Project Settings → API**: copie a **Project URL** e a chave **publishable** (ou *anon public*) para `assets/config.js` (bloco `supabase`).
   **Nunca** use a chave `service_role` no site.
5. Publique de novo. O botão **Entrar** e o **Ranking** passam a funcionar.
6. Segurança: rode `supabase/security_tests.sql` no SQL Editor (todas as linhas devem dar **OK**) e siga
   as "Configurações no painel" do [SECURITY.md](SECURITY.md) (regras de senha, limites, 2FA).

Observações:
- O e-mail de confirmação/recuperação do plano grátis tem limite de poucos envios por hora. Para muitos cadastros,
  configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Brevo, Resend, gratuitos).
- A pontuação é calculada no servidor a partir da tabela `card_stats`; o navegador não consegue inventar pontos.
- Projetos grátis do Supabase pausam após 7 dias sem nenhum acesso; basta reativar no painel.
- Para regerar o SQL após mudar dados: `python tools/build_sql.py`.

## Publicar no GitHub Pages
1. Repositório: https://github.com/brandaobrunobr-lgtm/fmdrops-yugioh (site: https://brandaobrunobr-lgtm.github.io/fmdrops-yugioh/).
2. **Antes de enviar**, gere as páginas com o endereço final do site (troque `SEU-USUARIO` e `fm-drops`):
   ```
   python tools/build_pages.py https://SEU-USUARIO.github.io/fm-drops
   ```
   Isso gera 722 páginas de carta, 39 de duelista, os índices, `sitemap.xml`, `robots.txt` e as tags de compartilhamento.
   **Não publique com `SEU-USUARIO` no endereço** — o Google usaria o endereço errado.
3. Envie o conteúdo desta pasta para a branch `main` (pelo GitHub Desktop é o mais fácil: são ~2.200 arquivos).
4. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)`** → Save.
5. Em ~1 minuto o site fica em `https://SEU-USUARIO.github.io/fm-drops/`.

## Aparecer no Google
- Cada carta tem página própria (ex.: `cartas/380-blue-eyes-ultimate-dragon.html`) com título e descrição para busca.
- Cadastre o site no [Google Search Console](https://search.google.com/search-console) (gratuito), confirme a propriedade
  e envie `https://SEU-USUARIO.github.io/fm-drops/sitemap.xml` em **Sitemaps**.
- Divulgue o link em grupos/Discords de Forbidden Memories, vídeos de Mod 13 no YouTube, Reddit e fóruns.
- Para conferir links quebrados depois de mudanças: `python tools/check_links.py`.

## Testar localmente
```
python -m http.server 8000
```
e abra `http://localhost:8000`.

## Fontes
- Drops do Mod 13: lidos do `WA_MRG.MRG` da ISO (39 duelistas × 4 pools, cada um somando 2048).
- Jogo original: [sg4e/YGOFM-gamedata](https://github.com/sg4e/YGOFM-gamedata), conferido na [Yugipedia](https://yugipedia.com/).
- Imagens: Yugipedia.

Yu-Gi-Oh! e Forbidden Memories são marcas da Konami. Projeto de fãs, sem vínculo com a Konami.
