"""Confere se todos os links e imagens relativos das páginas estáticas existem. Uso: python tools/check_links.py"""
import os, re, glob
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad, n = set(), 0
pat = re.compile(r'(?:href|src)="([^"#:]+?)(?:#[^"]*)?"')
for f in glob.glob(root + "/cartas/*.html") + glob.glob(root + "/duelistas/*.html") + [root + "/index.html"]:
    s = open(f, encoding="utf-8").read(); n += 1
    for u in pat.findall(s):
        if "${" in u: continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), u))): bad.add(u)
sm = open(root + "/sitemap.xml", encoding="utf-8").read()
print("paginas:", n, "| refs quebradas:", len(bad), sorted(bad)[:10], "| URLs no sitemap:", sm.count("<loc>"))
