/* FMDrops Yugioh — página de Fusões (#/fusoes e #/fusao/ID) + seção de fusões em "Mod 13 × Original".
 * Dados: data/fusions.json (gerado por tools/extract_fusions.py a partir da ISO do Mod 13)
 *   {"src": "mod13", "r": {"resultado": [a, b, a, b, ...]},
 *    "diff": {"add": [a, b, r, ...] só no Mod 13, "del": [a, b, r, ...] só no original}}
 * A tabela do jogo original = Mod 13 − add + del. Pares sem ordem (a <= b). */
(function () {
  "use strict";
  let F = null, FUS = null, loading = null;
  const $ = (s, el = document) => el.querySelector(s);
  const fmt = n => Number(n || 0).toLocaleString("pt-BR");
  const UI = { q: "", type: "", sort: "atk", mine: "", cat: "monster", news: "" };   // filtros da lista (só nesta visita)
  const pk = (a, b) => a + "|" + b;

  function load() {
    if (FUS) return Promise.resolve(FUS);
    if (!loading) loading = fetch("data/fusions.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => {
      const ok = x => !!F.CARD[x];
      const mod = {};
      for (const [k, flat] of Object.entries(j.r || {})) {
        const r = +k; if (!ok(r) || !Array.isArray(flat)) continue;
        const pairs = [];
        for (let i = 0; i + 1 < flat.length; i += 2) { const a = +flat[i], b = +flat[i + 1]; if (ok(a) && ok(b)) pairs.push([a, b]); }
        if (pairs.length) mod[r] = pairs;
      }
      const trip = flat => { const out = []; for (let i = 0; Array.isArray(flat) && i + 2 < flat.length; i += 3) { const t = [+flat[i], +flat[i + 1], +flat[i + 2]]; if (t.every(ok)) out.push(t); } return out; };
      const add = trip(j.diff && j.diff.add), del = trip(j.diff && j.diff.del);
      // tabela do original
      const addKey = new Set(add.map(([a, b, r]) => pk(a, b) + "|" + r));
      const orig = {};
      for (const [r, ps] of Object.entries(mod)) { const keep = ps.filter(([a, b]) => !addKey.has(pk(a, b) + "|" + r)); if (keep.length) orig[r] = keep; }
      for (const [a, b, r] of del) (orig[r] = orig[r] || []).push([a, b]);
      // marcas: no Mod 13, par novo (antes: nada) ou mudou (antes: outro resultado); no original, par que muda no Mod 13
      const before = new Map(), after = new Map();
      del.forEach(([a, b, r]) => before.set(pk(a, b), r));
      add.forEach(([a, b, r]) => after.set(pk(a, b), r));
      const tag13 = new Map(), tagOr = new Map();
      add.forEach(([a, b, r]) => tag13.set(pk(a, b) + "|" + r, before.has(pk(a, b)) ? { k: "mudou", was: before.get(pk(a, b)) } : { k: "nova" }));
      del.forEach(([a, b, r]) => tagOr.set(pk(a, b) + "|" + r, after.has(pk(a, b)) ? { k: "muda", now: after.get(pk(a, b)) } : { k: "sai" }));
      return (FUS = { src: j.src || "", mod, orig, add, del, before, tag13, tagOr });
    });
    return loading;
  }
  const isMod = () => F.S.ver !== "original";
  const table = () => isMod() ? FUS.mod : FUS.orig;
  const tagOf = (a, b, r) => (isMod() ? FUS.tag13 : FUS.tagOr).get(pk(a, b) + "|" + r);
  const newsOf = r => FUS.add.filter(t => t[2] === r).length;   // combinações do Mod 13 que geram r e não existiam no original

  // situação de uma fusão em relação à coleção
  function status(pairs) {
    const o = F.S.owned; let can = 0, one = 0;
    for (const [a, b] of pairs) { const n = (o.has(a) ? 1 : 0) + (o.has(b) ? 1 : 0); if (n === 2 || (a === b && o.has(a))) can++; else if (n === 1) one++; }
    return { can, one };
  }
  const statLine = c => c.c === "monster" ? `ATK ${fmt(c.a)} / DEF ${fmt(c.d)}` : F.esc(F.CAT_PT[c.c] || c.c);
  const verName = () => isMod() ? "Mod 13" : "jogo original";
  const wait = () => `<div class="empty">Carregando fusões…</div>`;
  const fail = () => `<div class="empty">Não foi possível carregar a tabela de fusões.</div>`;
  const chipGroup = (id, label, opts, cur) => `<div class="chips" id="${id}"><span class="small muted">${label}</span>${opts.map(([k, v]) =>
    `<span class="chip${cur === k ? " on" : ""}" data-v="${k}" role="button" tabindex="0">${v}</span>`).join("")}</div>`;
  function bindChips(sel, onPick) {
    const el = $(sel); if (!el) return;
    const pick = e => { const c = e.target.closest(".chip"); if (!c) return; if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; e.preventDefault();
      el.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c)); onPick(c.dataset.v); };
    el.addEventListener("click", pick); el.addEventListener("keydown", pick);
  }

  // ======================= lista =======================
  function viewFusions() {
    const app = $("#app"); app.innerHTML = wait();
    load().then(() => { if (F.route().name === "fusoes") drawList(); }).catch(() => { app.innerHTML = fail(); });
  }
  function drawList() {
    const T = table(), mod = isMod();
    if (!mod) UI.news = "";
    const all = Object.keys(T).map(Number);
    const mons = all.filter(r => F.CARD[r].c === "monster");
    const types = [...new Set(mons.map(r => F.CARD[r].t))].sort((a, b) => (F.TYPE_PT[a] || a).localeCompare(F.TYPE_PT[b] || b));
    const st = {}; all.forEach(r => st[r] = status(T[r]));
    const canCount = mons.filter(r => st[r].can).length;
    const total = mons.reduce((s, r) => s + T[r].length, 0);
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Fusões</h1>
        <p class="muted">Todos os monstros que podem ser criados por fusão no <b>${verName()}</b> e as combinações de cartas que geram cada um. A ordem das duas cartas não importa. Marque suas cartas (✓) para ver o que você já consegue fundir.</p>
        <p class="small">${mod ? `O Mod 13 tem <b>${FUS.add.length} combinações diferentes</b> do jogo original.` : `Mostrando o jogo original.`} <a href="#/mudancas">Ver o comparativo Mod 13 × Original</a></p></div>
        <div class="kpis"><div class="kpi"><b>${mons.length}</b><span>monstros de fusão</span></div>
          <div class="kpi"><b>${fmt(total)}</b><span>combinações</span></div>
          <div class="kpi"><b>${canCount}</b><span>você já pode fazer</span></div></div></section>
      <div class="panel">
        <div class="filters">
          <input class="search" type="search" id="uq" placeholder="Buscar monstro de fusão (ex.: Tiger Axe, 64)" value="${F.esc(UI.q)}" aria-label="Buscar monstro de fusão">
          <select id="utype" aria-label="Tipo"><option value="">Todos os tipos</option>${types.map(t => `<option value="${t}"${UI.type === t ? " selected" : ""}>${F.esc(F.TYPE_PT[t] || t)}</option>`).join("")}</select>
          <select id="usort" aria-label="Ordenar">${[["atk", "Ordenar: maior ATK"], ["def", "Maior DEF"], ["name", "Nome"], ["num", "Número"], ["combos", "Mais combinações"]].map(([k, v]) => `<option value="${k}"${UI.sort === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <div class="full row">
            ${chipGroup("umine", "Coleção:", [["", "Todas"], ["can", "Posso fazer"], ["one", "Falta 1 carta"], ["have", "Já tenho o resultado"]], UI.mine)}
            ${chipGroup("ucat", "Resultado:", [["monster", "Monstros"], ["other", "Outras cartas"]], UI.cat)}
            ${mod ? chipGroup("unews", "Mod 13:", [["", "Todas"], ["news", "Só novidades do Mod 13"]], UI.news) : ""}
          </div>
        </div>
        <p class="small muted" id="ucount"></p>
        <div class="grid" id="ugrid"></div>
      </div>
      <p class="small muted" style="margin-top:10px">Tabela de fusões do ${verName()}: lida da ISO PT-BR do Mod 13${mod ? "" : " e ajustada para o original com as diferenças confirmadas"}. Troque a versão no botão Mod 13 / Original do topo.</p>`;
    const draw = () => {
      const q = UI.q.trim().toLowerCase();
      const list = (UI.cat === "monster" ? mons : all.filter(r => F.CARD[r].c !== "monster")).filter(r => {
        const c = F.CARD[r];
        if (q && !(c.n.toLowerCase().includes(q) || String(r) === q.replace(/^#/, ""))) return false;
        if (UI.type && c.t !== UI.type) return false;
        if (UI.mine === "can" && !st[r].can) return false;
        if (UI.mine === "one" && (st[r].can || !st[r].one)) return false;
        if (UI.mine === "have" && !F.S.owned.has(r)) return false;
        if (UI.news && !newsOf(r)) return false;
        return true;
      });
      const so = { atk: (a, b) => (F.CARD[b].a || 0) - (F.CARD[a].a || 0) || a - b, def: (a, b) => (F.CARD[b].d || 0) - (F.CARD[a].d || 0) || a - b,
        name: (a, b) => F.CARD[a].n.localeCompare(F.CARD[b].n), num: (a, b) => a - b, combos: (a, b) => T[b].length - T[a].length || a - b };
      list.sort(so[UI.sort] || so.atk);
      $("#ucount").textContent = `${list.length} ${list.length === 1 ? "carta" : "cartas"}`;
      $("#ugrid").innerHTML = list.map(r => {
        const c = F.CARD[r], s = st[r], n = T[r].length, nw = mod ? newsOf(r) : 0, only = mod && !FUS.orig[r];
        return `<a class="tile fus-tile${F.S.owned.has(r) ? " owned" : ""}" href="#/fusao/${r}">
          <img class="art" src="${F.img(r)}" alt="" loading="lazy">
          <span class="best">${fmt(n)} ${n === 1 ? "combinação" : "combinações"}</span>
          ${s.can ? `<span class="fus-can">✓ posso fazer</span>` : s.one ? `<span class="fus-one">falta 1</span>` : ""}
          ${only ? `<span class="fus-new">só no Mod 13</span>` : nw ? `<span class="fus-new">+${nw} no Mod 13</span>` : ""}
          <div class="meta"><div class="num">#${F.pad(r)}</div><div class="nm">${F.esc(c.n)}</div><div class="st"><span>${statLine(c)}</span></div></div></a>`;
      }).join("") || `<div class="empty">Nenhuma fusão com esses filtros.</div>`;
    };
    $("#uq").addEventListener("input", e => { UI.q = e.target.value; draw(); });
    $("#utype").addEventListener("change", e => { UI.type = e.target.value; draw(); });
    $("#usort").addEventListener("change", e => { UI.sort = e.target.value; draw(); });
    bindChips("#umine", v => { UI.mine = v; draw(); });
    bindChips("#ucat", v => { UI.cat = v; draw(); });
    bindChips("#unews", v => { UI.news = v; draw(); });
    draw();
  }

  // ======================= detalhe =======================
  function viewFusion(arg) {
    const id = +arg, app = $("#app");
    if (!F.CARD[id]) { location.hash = "#/fusoes"; return; }
    app.innerHTML = `<a class="back" href="#/fusoes">← Fusões</a>` + wait();
    load().then(() => { if (F.route().name === "fusao" && +F.route().arg === id) drawDetail(id); }).catch(() => { app.innerHTML = fail(); });
  }
  // agrupa pares: escolhe sempre a carta com mais parceiros restantes → "Carta + [parceiros]"
  function group(pairs) {
    const adj = new Map();
    const add = (x, y) => { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); };
    for (const [a, b] of pairs) { add(a, b); add(b, a); }
    const groups = [];
    while (adj.size) {
      let best = null, bn = -1;
      for (const [k, v] of adj) if (v.size > bn || (v.size === bn && k < best)) { best = k; bn = v.size; }
      const partners = [...adj.get(best)].sort((x, y) => x - y);
      groups.push([best, partners]);
      for (const p of partners) { const s = adj.get(p); if (s) { s.delete(best); if (!s.size) adj.delete(p); } }
      adj.delete(best);
    }
    return groups;
  }
  function drawDetail(id) {
    const c = F.CARD[id], mod = isMod(), pairs = table()[id] || [], st = status(pairs);
    const other = (mod ? FUS.orig : FUS.mod)[id];
    const P = { q: "", mine: st.can ? "can" : "", news: "", shown: 40 };
    const mat = new Set(); pairs.forEach(([a, b]) => { mat.add(a); mat.add(b); });
    const tagged = pairs.filter(([a, b]) => tagOf(a, b, id)).length;
    const cardChip = (x, partnerOf) => {
      const t = partnerOf != null ? tagOf(Math.min(x, partnerOf), Math.max(x, partnerOf), id) : null;
      const tg = !t ? "" : t.k === "nova" ? `<em class="fus-tag">nova no Mod 13</em>`
        : t.k === "mudou" ? `<em class="fus-tag" title="No jogo original esta combinação dava ${F.esc(F.CARD[t.was].n)}">mudou no Mod 13</em>`
        : t.k === "muda" ? `<em class="fus-tag" title="No Mod 13 esta combinação dá ${F.esc(F.CARD[t.now].n)}">muda no Mod 13</em>`
        : `<em class="fus-tag">sai no Mod 13</em>`;
      const extra = t && t.k === "mudou" ? ` (antes: ${F.esc(F.CARD[t.was].n)})` : t && t.k === "muda" ? ` (Mod 13: ${F.esc(F.CARD[t.now].n)})` : "";
      return `<a class="fus-mat${F.S.owned.has(x) ? " own" : ""}${t ? " tagged" : ""}" href="#/carta/${x}" title="${F.esc(F.CARD[x].n)}${extra}"><img src="${F.img(x)}" alt="" loading="lazy"><span>${F.esc(F.CARD[x].n)}</span>${tg}</a>`;
    };
    const head = `<a class="back" href="#/fusoes">← Fusões</a>
      <section class="fus-head panel">
        <img class="fus-big" src="img/full/${id}.jpg" alt="${F.esc(c.n)}">
        <div><div class="num">#${F.pad(id)} · ${verName()}</div><h1>${F.esc(c.n)}</h1>
          <p class="muted">${c.c === "monster" ? `${F.esc(F.TYPE_PT[c.t] || c.t)} · Nv ${c.l} · ATK ${fmt(c.a)} / DEF ${fmt(c.d)}` : F.esc(F.CAT_PT[c.c] || "")}</p>
          <div class="kpis"><div class="kpi"><b>${fmt(pairs.length)}</b><span>combinações</span></div>
            <div class="kpi"><b>${fmt(mat.size)}</b><span>cartas diferentes servem</span></div>
            <div class="kpi"><b>${fmt(st.can)}</b><span>você pode fazer</span></div></div>
          ${tagged ? `<p class="small" style="margin-top:8px"><b>${tagged}</b> ${tagged === 1 ? "combinação muda" : "combinações mudam"} entre o Mod 13 e o original (marcadas abaixo).</p>` : ""}
          <p style="margin-top:10px"><a href="#/carta/${id}">Ver a carta e quem dropa ▸</a> · <button class="linklike" data-own="${id}">${F.S.owned.has(id) ? "✓ já tenho" : "Marcar que tenho"}</button></p></div>
      </section>`;
    if (!pairs.length) {
      $("#app").innerHTML = head + `<div class="panel" style="margin-top:14px"><div class="empty">Esta carta não é criada por fusão no ${verName()}.${other ? ` No ${mod ? "jogo original" : "Mod 13"} ela tem ${fmt(other.length)} ${other.length === 1 ? "combinação" : "combinações"} — troque a versão no topo.` : ""}</div></div>`;
      return;
    }
    $("#app").innerHTML = head + `
      <div class="panel" style="margin-top:14px">
        <div class="filters">
          <input class="search" type="search" id="pq" placeholder="Buscar carta usada na fusão" aria-label="Buscar carta usada na fusão">
          <div class="full row">${chipGroup("pmine", "Mostrar:", [["", "Todas"], ["can", "Posso fazer"], ["one", "Tenho 1 das 2"]], P.mine)}
            ${tagged ? chipGroup("pnews", "Versão:", [["", "Todas"], ["news", mod ? "Só novidades do Mod 13" : "Só as que mudam no Mod 13"]], P.news) : ""}</div>
        </div>
        <p class="small muted" id="pcount"></p>
        <div id="plist" class="fus-groups"></div>
        <div class="more"><button class="btn" id="pmore">Mostrar mais</button></div>
        <p class="small muted">Cartas com borda verde já estão na sua coleção. Clique numa carta para ver quem a dropa.</p>
      </div>`;
    let groups = [];
    const rebuild = () => {
      const q = P.q.trim().toLowerCase(), o = F.S.owned;
      const sel = pairs.filter(([a, b]) => {
        if (q && !(F.CARD[a].n.toLowerCase().includes(q) || F.CARD[b].n.toLowerCase().includes(q))) return false;
        const n = (o.has(a) ? 1 : 0) + (o.has(b) ? 1 : 0);
        if (P.mine === "can" && !(n === 2 || (a === b && o.has(a)))) return false;
        if (P.mine === "one" && n !== 1) return false;
        if (P.news && !tagOf(a, b, id)) return false;
        return true;
      });
      groups = group(sel); P.shown = 40;
      $("#pcount").textContent = `${fmt(sel.length)} ${sel.length === 1 ? "combinação" : "combinações"}`;
      paint();
    };
    const paint = () => {
      $("#plist").innerHTML = groups.slice(0, P.shown).map(([m, ps]) => `<div class="fus-row">${cardChip(m)}<span class="fus-plus" aria-hidden="true">+</span>
        <div class="fus-partners">${ps.map(p => cardChip(p, m)).join("")}</div></div>`).join("") || `<div class="empty">Nenhuma combinação com esse filtro.</div>`;
      $("#pmore").parentElement.style.display = groups.length > P.shown ? "" : "none";
    };
    $("#pq").addEventListener("input", e => { P.q = e.target.value; rebuild(); });
    bindChips("#pmine", v => { P.mine = v; rebuild(); });
    bindChips("#pnews", v => { P.news = v; rebuild(); });
    $("#pmore").addEventListener("click", () => { P.shown += 40; paint(); });
    rebuild();
  }

  // ======================= seção em "Mod 13 × Original" =======================
  function changesSection(box) {
    if (!box) return;
    box.innerHTML = wait();
    load().then(() => {
      if (!box.isConnected) return;
      const rows = FUS.add.map(([a, b, r]) => ({ a, b, r, was: FUS.before.get(pk(a, b)) }))
        .sort((x, y) => (x.was ? 1 : 0) - (y.was ? 1 : 0) || (F.CARD[y.r].a || 0) - (F.CARD[x.r].a || 0) || x.r - y.r);
      const nNew = rows.filter(x => !x.was).length;
      const mini = x => `<a class="fus-mat" href="#/carta/${x}"><img src="${F.img(x)}" alt="" loading="lazy"><span>${F.esc(F.CARD[x].n)}</span></a>`;
      box.innerHTML = `<h2 style="margin-top:22px">Fusões</h2>
        <p class="muted">O Mod 13 tem <b>${rows.length}</b> combinações de fusão diferentes do jogo original: <b>${nNew}</b> novas e <b>${rows.length - nNew}</b> que passaram a dar outro monstro. Todas as outras ${fmt(Object.values(FUS.mod).reduce((s, p) => s + p.length, 0) - rows.length)} combinações são iguais.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Combinação</th><th>Mod 13</th><th>Jogo original</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td><div class="fus-pair">${mini(x.a)}<span class="fus-plus">+</span>${mini(x.b)}</div></td>
          <td><a href="#/fusao/${x.r}"><b>${F.esc(F.CARD[x.r].n)}</b></a>${F.CARD[x.r].c === "monster" ? `<div class="small muted">ATK ${fmt(F.CARD[x.r].a)}</div>` : ""}</td>
          <td>${x.was ? `<a href="#/fusao/${x.was}">${F.esc(F.CARD[x.was].n)}</a>` : `<span class="muted">não existia</span>`}</td></tr>`).join("")}
        </tbody></table></div>`;
    }).catch(() => { box.innerHTML = fail(); });
  }

  window.FMFusions = {
    init() {
      F = window.FMD;
      F.EXTRA_VIEWS.fusoes = viewFusions;
      F.EXTRA_VIEWS.fusao = viewFusion;
    },
    changesSection
  };
})();
