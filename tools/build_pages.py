"""
Gera páginas estáticas (para o Google indexar) a partir de data/fm-data.json:
  cartas/<id>-<slug>.html   (722 páginas)
  cartas/index.html         (índice de todas as cartas)
  duelistas/<id>-<slug>.html (39 páginas) + duelistas/index.html
  sitemap.xml, robots.txt e as meta tags de compartilhamento do index.html

Uso (rode de dentro da pasta do site, depois de saber o endereço final):
  python tools/build_pages.py https://SEU-USUARIO.github.io/fm-drops
"""
import json, os, re, sys, html, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://SEU-USUARIO.github.io/fm-drops").rstrip("/")
D = json.load(open(os.path.join(ROOT, "data", "fm-data.json"), encoding="utf-8"))
CARD = {c["id"]: c for c in D["cards"]}
DUEL = {d["id"]: d for d in D["duelists"]}
RIT_RES = {r["res"]: r for r in D["rituals"]}
RIT_CARD = {r["r"]: r for r in D["rituals"]}
POOLS = ["SAPow", "SATec", "BCD"]
RANK = {"SAPow": ("S/A-POW", "pow"), "SATec": ("S/A-TEC", "tec"), "BCD": ("B/C/D", "bcd")}
CAT = {"monster": "Monstro", "magic": "Mágica", "equip": "Equipamento", "trap": "Armadilha", "ritual": "Ritual"}
TYPE = {"Dragon": "Dragão", "Spellcaster": "Mago", "Zombie": "Zumbi", "Warrior": "Guerreiro", "Beast-Warrior": "Besta-Guerreira",
        "Beast": "Besta", "Winged Beast": "Besta Alada", "Fiend": "Demônio", "Fairy": "Fada", "Insect": "Inseto",
        "Dinosaur": "Dinossauro", "Reptile": "Réptil", "Fish": "Peixe", "Sea Serpent": "Serpente Marinha", "Machine": "Máquina",
        "Thunder": "Trovão", "Aqua": "Aqua", "Pyro": "Piro", "Rock": "Rocha", "Plant": "Planta"}
STAR = {"Sun": "Sol", "Moon": "Lua", "Mercury": "Mercúrio", "Venus": "Vênus", "Mars": "Marte", "Jupiter": "Júpiter",
        "Saturn": "Saturno", "Uranus": "Urano", "Pluto": "Plutão", "Neptune": "Netuno"}
VER = {"mod13": "Mod 13", "original": "jogo original"}
e = lambda s: html.escape(str(s), quote=True)
pad = lambda n: f"{n:03d}"
pct = lambda p: f"{p / 2048 * 100:.2f}".replace(".", ",") + "%"
one_in = lambda p: "1 em " + f"{round(2048 / p):,}".replace(",", ".")
def slug(s): return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")
card_url = lambda c: f"cartas/{c['id']}-{slug(c['n'])}.html"
duel_url = lambda d: f"duelistas/{d['id']}-{slug(d['n'])}.html"

# índices: drops por carta e por duelista, por versão
DROPS = {v: {} for v in D["pools"]}
for v, pools in D["pools"].items():
    for did, P in pools.items():
        for pool in POOLS:
            for cid, p in P.get(pool, []):
                DROPS[v].setdefault(cid, []).append((int(did), pool, p))
    for cid in DROPS[v]: DROPS[v][cid].sort(key=lambda x: -x[2])

def page(rel_depth, title, desc, canon, og_img, body):
    up = "../" * rel_depth
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(BASE + '/' + canon)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="FMDrops Yugioh">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(BASE + '/' + canon)}">
<meta property="og:image" content="{e(BASE + '/' + og_img)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#14110d">
<link rel="icon" href="{up}img/cards/1.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=VT323&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{up}assets/style.css">
<script>try{{var t=localStorage.getItem("fmd:theme");if(t)document.documentElement.setAttribute("data-theme",JSON.parse(t))}}catch(e){{}}</script>
</head>
<body>
<header class="top"><div class="top-inner">
  <a class="brand" href="{up}index.html#/cartas"><img src="{up}img/cards/1.jpg" alt=""><span>FMDrops <b>Yugioh</b></span></a>
  <nav class="nav">
    <a href="{up}cartas/index.html">Todas as cartas</a>
    <a href="{up}duelistas/index.html">Duelistas</a>
    <a href="{up}index.html#/farm">Farm</a>
    <a href="{up}index.html#/colecao">Coleção</a>
    <a href="{up}index.html#/ranking">🏆 Ranking</a>
    <a href="{up}index.html#/mudancas">Mod 13 × Original</a>
  </nav>
  <div class="top-actions"><a class="btn-donate" href="{up}index.html#/doar" style="text-decoration:none">♥ Apoiar</a></div>
</div></header>
<main class="wrap">
{body}
</main>
<footer class="foot wrap">
  <p>Site de fãs, sem vínculo com a Konami. Yu-Gi-Oh! e Forbidden Memories são marcas da Konami. Dados extraídos do jogo; imagens via Yugipedia.</p>
  <p><a href="{up}index.html">Abrir o app interativo</a> · <a href="{up}cartas/index.html">Índice de cartas</a> · <a href="{up}duelistas/index.html">Índice de duelistas</a></p>
</footer>
</body>
</html>
"""

def av(d, up):
    b = f"<em>{e(d['b'])}</em>" if d["b"] else ""
    return f'<span class="av"><img src="{up}img/duelists/{d["k"]}.jpg" alt="" loading="lazy" width="38" height="38">{b}</span>'

def drop_table(cid, ver, up):
    rows = DROPS[ver].get(cid, [])
    if not rows:
        return f'<div class="note">Não dropa de nenhum duelista no {VER[ver]}.</div>'
    mx = rows[0][2]
    tr = "".join(
        f'<tr><td><a class="who" href="{up}{duel_url(DUEL[d])}">{av(DUEL[d], up)}<span>{e(DUEL[d]["n"])}</span></a></td>'
        f'<td><span class="rank {RANK[pool][1]}">{RANK[pool][0]}</span></td>'
        f'<td class="r"><span class="pct">{pct(p)}</span><div class="small muted">{p}/2048</div></td>'
        f'<td class="r small">{one_in(p)} duelos</td>'
        f'<td style="min-width:80px"><div class="bar"><i style="width:{max(3, p / mx * 100):.0f}%"></i></div></td></tr>'
        for d, pool, p in rows)
    return (f'<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Duelista</th><th>Rank</th><th class="r">Chance</th>'
            f'<th class="r">Média</th><th></th></tr></thead><tbody>{tr}</tbody></table></div>')

def best_text(cid, ver):
    rows = DROPS[ver].get(cid, [])
    if not rows: return f"não dropa no {VER[ver]}"
    d, pool, p = rows[0]
    return f"melhor drop: {DUEL[d]['n']} em {RANK[pool][0]} ({pct(p)})"

def card_page(c):
    up = "../"
    cid = c["id"]
    stats = []
    if c["c"] == "monster":
        stats = [("ATK", c["a"]), ("DEF", c["d"]), ("Nível", c["l"]), ("Tipo", TYPE.get(c["t"], c["t"])),
                 ("Atributo", c["at"]), ("Guardian Stars", " / ".join(STAR.get(g, g) for g in c["g"]))]
    else:
        stats = [("Categoria", CAT[c["c"]])]
    if c.get("pw"): stats.append(("Senha", c["pw"]))
    if c.get("sc"): stats.append(("Star Chips", f"{c['sc']:,}".replace(",", ".")))
    rit = ""
    if cid in RIT_RES:
        r = RIT_RES[cid]
        rit = (f'<div class="note">Monstro de ritual: use <a href="{up}{card_url(CARD[r["r"]])}">#{pad(r["r"])} {e(CARD[r["r"]]["n"])}</a> com '
               + ", ".join(f'<a href="{up}{card_url(CARD[m])}">{e(CARD[m]["n"])}</a>' for m in r["m"]) + ".</div>")
    if cid in RIT_CARD:
        r = RIT_CARD[cid]
        rit = (f'<div class="note">Este ritual invoca <a href="{up}{card_url(CARD[r["res"]])}">#{pad(r["res"])} {e(CARD[r["res"]]["n"])}</a> usando '
               + ", ".join(f'<a href="{up}{card_url(CARD[m])}">{e(CARD[m]["n"])}</a>' for m in r["m"]) + ".</div>")
    prev_c, next_c = CARD.get(cid - 1), CARD.get(cid + 1)
    navl = '<div class="row" style="justify-content:space-between;margin-top:18px">' + \
        (f'<a href="{up}{card_url(prev_c)}">← #{pad(prev_c["id"])} {e(prev_c["n"])}</a>' if prev_c else "<span></span>") + \
        (f'<a href="{up}{card_url(next_c)}">#{pad(next_c["id"])} {e(next_c["n"])} →</a>' if next_c else "<span></span>") + "</div>"
    kind = f"ATK {c['a']}/DEF {c['d']}" if c["c"] == "monster" else CAT[c["c"]]
    title = f"{c['n']} (#{pad(cid)}) — quem dropa no Forbidden Memories Mod 13"
    desc = (f"{c['n']} (#{pad(cid)}, {kind}) no Yu-Gi-Oh! Forbidden Memories: {best_text(cid, 'mod13')} no Mod 13; "
            f"{best_text(cid, 'original')}. Tabela completa por duelista e rank.")
    body = f"""
<a class="back" href="{up}cartas/index.html">← Todas as cartas</a>
<div class="detail">
  <div><img class="big" src="{up}img/full/{cid}.jpg" alt="Carta {e(c['n'])} no Forbidden Memories" width="320" height="256">
    <p><a class="btn primary" href="{up}index.html#/carta/{cid}" style="display:inline-block;text-decoration:none;margin-top:10px">Abrir no app (coleção, desejos, farm)</a></p></div>
  <div>
    <div class="muted">#{pad(cid)} · {CAT[c['c']]}</div>
    <h1>{e(c['n'])}</h1>
    <div class="stats">{''.join(f'<div class="stat"><span>{k}</span><b>{e(v)}</b></div>' for k, v in stats)}</div>
    {rit}
    <h2>Quem dropa no Mod 13</h2>
    {drop_table(cid, 'mod13', up)}
    <h2 style="margin-top:20px">Quem dropa no jogo original</h2>
    {drop_table(cid, 'original', up)}
    <p class="small muted">A chance vale por duelo vencido com o rank indicado. "1 em N" é a média de duelos para conseguir a carta.
    S/A-POW = vitória por força; S/A-TEC = vitória técnica; B/C/D = ranks baixos.</p>
    {navl}
  </div>
</div>"""
    return page(1, title, desc, card_url(c), f"img/full/{cid}.jpg", body)

def duel_page(d):
    up = "../"
    sec = []
    for ver in ("mod13", "original"):
        P = D["pools"][ver].get(str(d["id"]), {})
        for pool in POOLS:
            lst = P.get(pool, [])
            if not lst: continue
            mx = lst[0][1]
            tr = "".join(
                f'<tr><td><img class="thumb" src="{up}img/cards/{cid}.jpg" alt="" loading="lazy" width="40" height="40"></td>'
                f'<td><div class="small muted">#{pad(cid)}</div><a href="{up}{card_url(CARD[cid])}"><b>{e(CARD[cid]["n"])}</b></a></td>'
                f'<td class="small">{(str(CARD[cid]["a"]) + " / " + str(CARD[cid]["d"])) if CARD[cid]["c"] == "monster" else CAT[CARD[cid]["c"]]}</td>'
                f'<td class="r"><span class="pct">{pct(p)}</span><div class="small muted">{p}/2048</div></td>'
                f'<td class="r small">{one_in(p)}</td><td style="min-width:70px"><div class="bar"><i style="width:{max(3, p / mx * 100):.0f}%"></i></div></td></tr>'
                for cid, p in lst)
            sec.append(f'<h2 id="{ver}-{pool}" style="margin-top:20px">{RANK[pool][0]} — {VER[ver]} <span class="small muted">({len(lst)} cartas)</span></h2>'
                       f'<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Carta</th><th>ATK/DEF</th><th class="r">Chance</th><th class="r">Média</th><th></th></tr></thead><tbody>{tr}</tbody></table></div>')
    top = D["pools"]["mod13"].get(str(d["id"]), {})
    best = sorted(((cid, p, pool) for pool in POOLS for cid, p in top.get(pool, [])), key=lambda x: -x[1])[:3]
    title = f"{d['n']} — drops no Yu-Gi-Oh! Forbidden Memories Mod 13"
    desc = (f"Tudo o que {d['n']} dropa no Forbidden Memories (Mod 13 e original), por rank S/A-POW, S/A-TEC e B/C/D. "
            + ("Destaques: " + ", ".join(f"{CARD[c]['n']} {pct(p)}" for c, p, _ in best) + "." if best else ""))
    jump = " · ".join(f'<a href="#{v}-{p}">{RANK[p][0]} ({VER[v]})</a>' for v in ("mod13", "original") for p in POOLS
                      if D["pools"][v].get(str(d["id"]), {}).get(p))
    body = f"""
<a class="back" href="{up}duelistas/index.html">← Todos os duelistas</a>
<section class="hero"><div class="row">{av(d, up).replace('width="38" height="38"', 'width="84" height="84" style="width:84px;height:84px"')}<div>
  <h1>{e(d['n'])}</h1><p class="muted small">{jump}</p>
  <p><a class="btn primary" href="{up}index.html#/duelista/{d['id']}" style="text-decoration:none">Abrir no app interativo</a></p></div></div></section>
{''.join(sec)}"""
    return page(1, title, desc, duel_url(d), f"img/duelists/{d['k']}.jpg", body)

def card_index():
    up = "../"
    groups = {}
    for c in D["cards"]: groups.setdefault(c["c"], []).append(c)
    parts = []
    for k in ("monster", "magic", "equip", "trap", "ritual"):
        items = "".join(
            f'<li><a href="{up}{card_url(c)}"><img src="{up}img/cards/{c["id"]}.jpg" alt="" loading="lazy" width="28" height="28">'
            f'<span>#{pad(c["id"])} {e(c["n"])}</span></a></li>' for c in groups.get(k, []))
        parts.append(f'<h2 style="margin-top:20px">{CAT[k]} <span class="small muted">({len(groups.get(k, []))})</span></h2><ul class="idx">{items}</ul>')
    body = f"""<section class="hero"><div><h1>Todas as 722 cartas do Forbidden Memories</h1>
<p class="muted">Clique numa carta para ver quem dropa no Mod 13 e no jogo original. Para buscar e filtrar, use o <a href="{up}index.html">app interativo</a>.</p></div></section>
{''.join(parts)}"""
    return page(1, "Todas as 722 cartas — Yu-Gi-Oh! Forbidden Memories Mod 13 | FMDrops Yugioh",
                "Lista completa das 722 cartas do Yu-Gi-Oh! Forbidden Memories, com página de drops (Mod 13 e original) para cada uma.",
                "cartas/index.html", "img/full/1.jpg", body)

def duel_index():
    up = "../"
    tiles = "".join(f'<a class="dtile" href="{up}{duel_url(d)}">{av(d, up)}<b>{e(d["n"])}</b></a>' for d in D["duelists"])
    body = f"""<section class="hero"><div><h1>Duelistas do Forbidden Memories</h1>
<p class="muted">Os 39 oponentes e tudo o que cada um dropa, por rank, no Mod 13 e no jogo original.</p></div></section>
<div class="dgrid">{tiles}</div>"""
    return page(1, "Duelistas e drops — Yu-Gi-Oh! Forbidden Memories Mod 13 | FMDrops Yugioh",
                "Os 39 duelistas do Yu-Gi-Oh! Forbidden Memories e a tabela de drops de cada um por rank (S/A-POW, S/A-TEC, B/C/D).",
                "duelistas/index.html", "img/duelists/seto.jpg", body)

def write(rel, s):
    p = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w", encoding="utf-8", newline="\n").write(s)

# limpa páginas antigas (nomes podem mudar)
for folder in ("cartas", "duelistas"):
    fp = os.path.join(ROOT, folder)
    if os.path.isdir(fp):
        for f in os.listdir(fp):
            if f.endswith(".html"): os.remove(os.path.join(fp, f))

urls = ["", "cartas/index.html", "duelistas/index.html"]
for c in D["cards"]: write(card_url(c), card_page(c)); urls.append(card_url(c))
for d in D["duelists"]: write(duel_url(d), duel_page(d)); urls.append(duel_url(d))
write("cartas/index.html", card_index())
write("duelistas/index.html", duel_index())

today = datetime.date.today().isoformat()
write("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      "".join(f"  <url><loc>{e(BASE + '/' + u)}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")

# meta tags de compartilhamento no index.html (entre os marcadores)
ip = os.path.join(ROOT, "index.html"); s = open(ip, encoding="utf-8").read()
seo = (f'<!--SEO-->\n<link rel="canonical" href="{BASE}/">\n<meta property="og:type" content="website">\n'
       f'<meta property="og:site_name" content="FMDrops Yugioh">\n<meta property="og:title" content="FMDrops Yugioh — drops do Yu-Gi-Oh! Forbidden Memories Mod 13">\n'
       f'<meta property="og:description" content="Quem dropa cada uma das 722 cartas, por duelista e rank, no Mod 13 e no jogo original. Planejador de farm e coleção.">\n'
       f'<meta property="og:url" content="{BASE}/">\n<meta property="og:image" content="{BASE}/img/full/380.jpg">\n<meta name="twitter:card" content="summary">\n<!--/SEO-->')
s = re.sub(r"<!--SEO-->.*?<!--/SEO-->", seo, s, flags=re.S) if "<!--SEO-->" in s else s.replace("</head>", seo + "\n</head>")
open(ip, "w", encoding="utf-8", newline="\n").write(s)
print(f"OK: {len(urls)} URLs no sitemap · base = {BASE}")
