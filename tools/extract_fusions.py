"""Extrai a tabela de fusões direto da imagem do jogo (.bin MODE2/2352 ou .iso 2048).

Uso: python tools/extract_fusions.py "C:/PS1/isos/Yu-Gi-Oh! Forbidden Memories (PT-BR).bin" [rotulo] [--json saida.json]
       [--original fusions.json do github.com/sg4e/YGOFM-gamedata (MIT) ou ISO do jogo original]
Com --original (e opcionalmente --confirm OUTRA_REFERENCIA), grava também "diff": {"add": [a,b,r,...] só no Mod 13, "del": [a,b,r,...] só no original}.

Lê o arquivo WA_MRG.MRG do CD (ISO9660) e decodifica a tabela de fusões em 0xB87800:
  - 722 ponteiros de 2 bytes (little-endian) a partir de +2, um por carta (0 = sem fusões);
  - em cada ponteiro: 1 byte de quantidade (0 => quantidade = 511 - próximo byte),
    depois blocos de 5 bytes com 2 fusões cada (parceiro e resultado em 10 bits).
Saída: data/fusions.json no formato usado pelo site.
"""
import json, os, struct, sys
from collections import defaultdict

FUSION_BASE = 0xB87800


def open_cd(path):
    size = os.path.getsize(path)
    raw = size % 2352 == 0 and size % 2048 != 0 or path.lower().endswith(".bin")
    fh = open(path, "rb")
    def sector(n):
        if raw:
            fh.seek(n * 2352)
            s = fh.read(2352)
            return s[24:24 + 2048]          # MODE2 Form1: 12 sync + 4 header + 8 subheader
        fh.seek(n * 2048)
        return fh.read(2048)
    return sector


def find_file(sector, name):
    pvd = sector(16)
    if pvd[1:6] != b"CD001":
        raise SystemExit("Não parece um CD ISO9660.")
    root = pvd[156:156 + 34]
    todo = [(struct.unpack_from("<I", root, 2)[0], struct.unpack_from("<I", root, 10)[0])]
    seen = set()
    while todo:
        lba, length = todo.pop()
        if lba in seen:
            continue
        seen.add(lba)
        data = b"".join(sector(lba + i) for i in range((length + 2047) // 2048))
        p = 0
        while p < len(data):
            ln = data[p]
            if ln == 0:
                p = (p // 2048 + 1) * 2048
                continue
            rec = data[p:p + ln]
            elba, esize, flags = struct.unpack_from("<I", rec, 2)[0], struct.unpack_from("<I", rec, 10)[0], rec[25]
            nm = rec[33:33 + rec[32]].decode("latin-1").split(";")[0]
            if flags & 2:
                if nm not in ("\x00", "\x01"):
                    todo.append((elba, esize))
            elif nm.upper() == name:
                return elba, esize
            p += ln
    raise SystemExit(name + " não encontrado no CD.")


def read_file(sector, lba, size, start, length):
    first, last = start // 2048, (start + length - 1) // 2048
    buf = b"".join(sector(lba + i) for i in range(first, last + 1))
    off = start - first * 2048
    return buf[off:off + length]


def opt(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def load_reference(path):
    """Tabela de referência (jogo original): outra ISO, ou o fusions.json do sg4e/YGOFM-gamedata (MIT)."""
    if path.lower().endswith((".bin", ".iso", ".img")):
        return triples(extract(path))
    txt = open(path, encoding="utf-8").read()
    rows = json.loads(txt[txt.index("["):txt.rindex("]") + 1])
    if rows and isinstance(rows[0], dict):
        return {(min(r["material1"], r["material2"]), max(r["material1"], r["material2"]), r["result"]) for r in rows}
    out = set()                      # formato "lista por carta": item N = [{"card": parceiro, "result": r}, ...]
    for a, lst in enumerate(rows):
        for f in lst or []:
            out.add((min(a, f["card"]), max(a, f["card"]), f["result"]))
    return out


def triples(res):
    return {(a, b, r) for r, ps in res.items() for a, b in ps}


def main():
    out_json, original = opt("--json"), opt("--original")
    skip = {out_json, original, opt("--confirm")}
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a not in skip]
    path, label = args[0], (args[1] if len(args) > 1 else "mod13")
    res = extract(path)
    out = {"src": label, "r": {str(r): [x for pr in sorted(ps) for x in pr] for r, ps in sorted(res.items())}}
    if original:
        mine, ref = triples(res), load_reference(original)
        add, rem = mine - ref, ref - mine
        confirm = opt("--confirm")
        if confirm:              # 2ª referência do original: só vale como diferença o que as duas confirmam
            ref2 = load_reference(confirm)
            print("descartadas por falta de confirmação:", len(add - (mine - ref2)), "novas,", len(rem - (ref2 - mine)), "do original")
            add, rem = add & (mine - ref2), rem & (ref2 - mine)
        add, rem = sorted(add), sorted(rem)
        out["diff"] = {"add": [x for t in add for x in t], "del": [x for t in rem for x in t]}
        print("comparação com o original: iguais", len(mine & ref), "| novas", len(add), "| só no original", len(rem))
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dst = out_json or os.path.join(root, "data", "fusions.json")
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print("resultados:", len(res), "| pares:", sum(len(v) for v in res.values()), "->", dst)


def extract(path):
    sector = open_cd(path)
    lba, size = find_file(sector, "WA_MRG.MRG")
    data = read_file(sector, lba, size, FUSION_BASE, 0x10000)

    res = defaultdict(set)
    for i in range(722):
        ptr = struct.unpack_from("<H", data, 2 + i * 2)[0]
        if not ptr:
            continue
        p = ptr
        count = data[p]; p += 1
        if count == 0:
            count = 511 - data[p]; p += 1
        left = count
        while left > 0:
            b1, b2, b3, b4, b5 = data[p:p + 5]; p += 5
            pairs = [(((b1 & 3) << 8) | b2, (((b1 >> 2) & 3) << 8) | b3),
                     ((((b1 >> 4) & 3) << 8) | b4, (((b1 >> 6) & 3) << 8) | b5)]
            for partner, result in pairs[:min(2, left)]:
                a = i + 1
                if 1 <= partner <= 722 and 1 <= result <= 722:
                    res[result].add((min(a, partner), max(a, partner)))
            left -= 2
    return res


if __name__ == "__main__":
    main()
