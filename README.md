# FM Drops — Yu-Gi-Oh! Forbidden Memories (Mod 13 + Original)

Site estático e interativo com as tabelas de drop do **Yu-Gi-Oh! Forbidden Memories**:
722 cartas, 39 duelistas, ranks S/A-POW, S/A-TEC e B/C/D, no **Mod 13** e no **jogo original**.

## Funcionalidades
- **Cartas**: busca por nome/número, filtros (categoria, tipo, guardian star, ATK, rank, com/sem drop, coleção), ordenação por chance.
- **Página da carta**: quem dropa em cada rank, chance em % e /2048, média de duelos ("1 em N"), diferença Mod 13 × Original, rituais e duelistas que a usam no deck. Link compartilhável.
- **Duelistas**: tudo o que cada oponente dropa por rank, e as cartas do deck dele.
- **Planejador de farm**: monte sua lista de desejos e veja o duelista + rank que mais rende.
- **Coleção**: marque o que já tem, progresso 0/722, exportar/importar.
- **Mod 13 × Original**: todas as 348 mudanças de drop do mod.
- **Doação**: Pix com QR Code e "copia e cola" para qualquer valor, e links (Ko-fi, PayPal etc.).
- Tema claro/escuro, funciona no celular, sem anúncios, sem servidor.

## Configurar a doação
Edite `assets/config.js`:
```js
pix: { key: "sua-chave-pix", name: "SEU NOME", city: "SUA CIDADE", message: "Apoio FM Drops" },
links: [ { label: "Ko-fi", url: "https://ko-fi.com/seuusuario" } ]
```
Teste o QR com o app do seu banco antes de divulgar.

## Publicar no GitHub Pages
1. Crie um repositório público no GitHub (ex.: `fm-drops`).
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
