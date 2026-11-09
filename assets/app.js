/* FMDrops Yugioh — site estático (GitHub Pages). Sem build: HTML + CSS + JS puro. */
(function () {
  "use strict";
  const CFG = window.SITE_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = p => (p / 2048 * 100).toFixed(2).replace(".", ",") + "%";
  const oneIn = p => p ? "1 em " + Math.round(2048 / p).toLocaleString("pt-BR") : "—";
  const pad = n => String(n).padStart(3, "0");
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const img = id => `img/cards/${id}.jpg`;
  const RANKS = { SAPow: ["S/A-POW", "pow"], SATec: ["S/A-TEC", "tec"], BCD: ["B/C/D", "bcd"], Deck: ["Deck", "deck"] };
  const DROP_POOLS = ["SAPow", "SATec", "BCD"];
  const CAT_PT = { monster: "Monstro", magic: "Mágica", equip: "Equipamento", trap: "Armadilha", ritual: "Ritual" };
  const TYPE_PT = { Dragon: "Dragão", Spellcaster: "Mago", Zombie: "Zumbi", Warrior: "Guerreiro", "Beast-Warrior": "Besta-Guerreira",
    Beast: "Besta", "Winged Beast": "Besta Alada", Fiend: "Demônio", Fairy: "Fada", Insect: "Inseto", Dinosaur: "Dinossauro",
    Reptile: "Réptil", Fish: "Peixe", "Sea Serpent": "Serpente Marinha", Machine: "Máquina", Thunder: "Trovão", Aqua: "Aqua",
    Pyro: "Piro", Rock: "Rocha", Plant: "Planta", Magic: "Mágica", Equip: "Equipamento", Trap: "Armadilha", Ritual: "Ritual" };
  const STAR_PT = { Sun: "Sol", Moon: "Lua", Mercury: "Mercúrio", Venus: "Vênus", Mars: "Marte", Jupiter: "Júpiter",
    Saturn: "Saturno", Uranus: "Urano", Pluto: "Plutão", Neptune: "Netuno" };

  // ---------- storage (falha silenciosa: modo privado etc.) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fmd:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fmd:" + k, JSON.stringify(v)); } catch { /* ignora */ } }
  };
  const S = {
    ver: store.get("ver", "mod13"),
    owned: new Set(store.get("owned", [])),
    wish: new Set(store.get("wish", [])),
    filters: store.get("filters", {}),
  };
  const saveSets = () => { store.set("owned", [...S.owned]); store.set("wish", [...S.wish]); };

  let D = null;               // dados brutos
  const IDX = {};             // índices por versão
  const CARD = {};            // id -> carta
  const DUEL = {};            // id -> duelista
  const RIT_BY_RES = {}, RIT_BY_CARD = {};

  function buildIndex(ver) {
    if (IDX[ver]) return IDX[ver];
    const pools = D.pools[ver];
    const drops = {}, deck = {}, best = {};
    for (const [did, p] of Object.entries(pools)) {
      const d = +did;
      for (const [pool, list] of Object.entries(p)) {
        for (const [cid, prob] of list) {
          if (pool === "Deck") { (deck[cid] = deck[cid] || []).push({ d, p: prob }); continue; }
          (drops[cid] = drops[cid] || []).push({ d, pool, p: prob });
          if (!best[cid] || prob > best[cid].p) best[cid] = { d, pool, p: prob };
        }
      }
    }
    for (const k in drops) drops[k].sort((a, b) => b.p - a.p);
    for (const k in deck) deck[k].sort((a, b) => b.p - a.p);
    return (IDX[ver] = { drops, deck, best });
  }
  const I = () => buildIndex(S.ver);

  // ---------- helpers de UI ----------
  function avatar(d, size) {
    const du = DUEL[d];
    return `<span class="av"${size ? ` style="width:${size}px"` : ""}><img src="img/duelists/${du.k}.jpg" alt="" loading="lazy"${size ? ` style="width:${size}px;height:${size}px"` : ""}>${du.b ? `<em>${esc(du.b)}</em>` : ""}</span>`;
  }
  const who = d => `<a class="who" href="#/duelista/${d}">${avatar(d)}<span>${esc(DUEL[d].n)}</span></a>`;
  const rankTag = pool => `<span class="rank ${RANKS[pool][1]}">${RANKS[pool][0]}</span>`;
  const bar = (p, max) => `<div class="bar"><i style="width:${Math.max(3, Math.min(100, p / max * 100))}%"></i></div>`;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }
  function statLine(c) {
    if (c.c === "monster") return `<span>ATK ${c.a}</span><span>DEF ${c.d}</span>`;
    return `<span>${CAT_PT[c.c]}</span>`;
  }
  function marks(id) {
    return `<span class="marks">
      <button class="mark wish${S.wish.has(id) ? " on" : ""}" data-wish="${id}" title="Lista de desejos" aria-label="Lista de desejos">★</button>
      <button class="mark own${S.owned.has(id) ? " on" : ""}" data-own="${id}" title="Já tenho" aria-label="Já tenho">✓</button></span>`;
  }
  function tile(c) {
    const b = I().best[c.id];
    return `<div class="tile${S.owned.has(c.id) ? " owned" : ""}" data-card="${c.id}">
      <img class="art" src="${img(c.id)}" alt="${esc(c.n)}" loading="lazy">
      ${b ? `<span class="best">${pct(b.p)}</span>` : `<span class="best nodrop">sem drop</span>`}
      ${marks(c.id)}
      <div class="meta"><div class="num">#${pad(c.id)}</div><div class="nm">${esc(c.n)}</div><div class="st">${statLine(c)}</div></div></div>`;
  }
  function toggle(set, id, label) {
    if (set.has(id)) set.delete(id); else set.add(id);
    saveSets(); toast(set.has(id) ? `${label}: adicionada` : `${label}: removida`);
    if (set === S.owned && window.FMOnline && window.FMOnline.user) window.FMOnline.setOwned(id, set.has(id));
  }
  document.addEventListener("click", e => {
    const w = e.target.closest("[data-wish]"), o = e.target.closest("[data-own]");
    if (w || o) {
      e.stopPropagation(); e.preventDefault();
      const id = +(w ? w.dataset.wish : o.dataset.own);
      toggle(w ? S.wish : S.owned, id, w ? "Lista de desejos" : "Coleção");
      if (w) w.classList.toggle("on", S.wish.has(id));
      if (o) { o.classList.toggle("on", S.owned.has(id)); const t = o.closest(".tile"); if (t) t.classList.toggle("owned", S.owned.has(id)); }
      if (route().name === "farm" || route().name === "colecao") render();
      return;
    }
    const t = e.target.closest("[data-card]");
    if (t && !e.target.closest("a")) location.hash = "#/carta/" + t.dataset.card;
  });

  // ---------- rotas ----------
  const EXTRA_VIEWS = {};   // telas registradas por assets/online.js (ranking, jogador, conta)
  function route() {
    const h = location.hash.replace(/^#\/?/, "").split("/");
    return { name: h[0] || "cartas", arg: h[1] };
  }
  function render() {
    const r = route();
    if (r.name === "doar") { history.replaceState(null, "", "#/cartas"); viewCards(); openDonate(); return; }
    document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.r === r.name ||
      (r.name === "carta" && a.dataset.r === "cartas") || (r.name === "duelista" && a.dataset.r === "duelistas") || (r.name === "jogador" && a.dataset.r === "ranking")));
    const v = { cartas: viewCards, carta: viewCard, duelistas: viewDuelists, duelista: viewDuelist, farm: viewFarm,
      colecao: viewCollection, mudancas: viewChanges, sobre: viewAbout, ...EXTRA_VIEWS }[r.name] || viewCards;
    v(r.arg);
  }
  window.addEventListener("hashchange", () => { render(); if (!["cartas"].includes(route().name)) window.scrollTo(0, 0); });

  // ---------- CARTAS ----------
  let shown = 0, lastList = [];
  function filteredCards() {
    const f = S.filters, q = (f.q || "").trim().toLowerCase(), idx = I();
    let list = D.cards.filter(c => {
      if (q && !(c.n.toLowerCase().includes(q) || pad(c.id).includes(q.replace("#", "")))) return false;
      if (f.cat && c.c !== f.cat) return false;
      if (f.type && c.t !== f.type) return false;
      if (f.star && !(c.g && c.g.includes(f.star))) return false;
      if (f.amin && !(c.a >= +f.amin)) return false;
      if (f.amax && !(c.a <= +f.amax)) return false;
      const dr = idx.drops[c.id] || [];
      if (f.drop === "yes" && !dr.length) return false;
      if (f.drop === "no" && dr.length) return false;
      if (f.rank && !dr.some(x => x.pool === f.rank)) return false;
      if (f.mine === "missing" && S.owned.has(c.id)) return false;
      if (f.mine === "owned" && !S.owned.has(c.id)) return false;
      if (f.mine === "wish" && !S.wish.has(c.id)) return false;
      return true;
    });
    const bp = c => { const dr = (idx.drops[c.id] || []).filter(x => !f.rank || x.pool === f.rank); return dr.length ? dr[0].p : 0; };
    const sorters = { num: (a, b) => a.id - b.id, name: (a, b) => a.n.localeCompare(b.n), atk: (a, b) => (b.a || 0) - (a.a || 0),
      def: (a, b) => (b.d || 0) - (a.d || 0), chance: (a, b) => bp(b) - bp(a) || a.id - b.id };
    list.sort(sorters[f.sort || "num"]);
    return list;
  }
  function viewCards() {
    const f = S.filters, types = [...new Set(D.cards.filter(c => c.c === "monster").map(c => c.t))].sort();
    const owned = S.owned.size, withDrop = Object.keys(I().drops).length;
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Drops do Forbidden Memories</h1>
        <p class="muted">${S.ver === "mod13" ? "Mod 13 (dados extraídos da ISO PT-BR)" : "Jogo original (dados da ROM)"} · 722 cartas · 39 duelistas · clique numa carta para ver quem dropa</p></div>
        <div class="kpis"><div class="kpi"><b>${withDrop}</b><span>cartas que dropam</span></div>
        <div class="kpi"><b>${owned}/722</b><span>na sua coleção</span></div><div class="kpi"><b>${S.wish.size}</b><span>na lista de desejos</span></div></div></section>
      <div class="panel">
        <div class="filters">
          <input class="search" type="search" id="fq" placeholder="Buscar por nome ou número (ex.: Blue-eyes, 380)" value="${esc(f.q || "")}">
          <select id="fcat"><option value="">Todas as categorias</option>${Object.entries(CAT_PT).map(([k, v]) => `<option value="${k}"${f.cat === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <select id="ftype"><option value="">Todos os tipos</option>${types.map(t => `<option value="${t}"${f.type === t ? " selected" : ""}>${TYPE_PT[t] || t}</option>`).join("")}</select>
          <select id="fstar"><option value="">Guardian Star</option>${Object.entries(STAR_PT).map(([k, v]) => `<option value="${k}"${f.star === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <select id="fsort">${[["num", "Ordenar: número"], ["name", "Nome"], ["atk", "Maior ATK"], ["def", "Maior DEF"], ["chance", "Maior chance de drop"]].map(([k, v]) => `<option value="${k}"${(f.sort || "num") === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <div class="full row">
            <div class="chips" id="frank"><span class="small muted">Rank:</span>${[["", "Todos"], ["SAPow", "S/A-POW"], ["SATec", "S/A-TEC"], ["BCD", "B/C/D"]].map(([k, v]) => `<span class="chip${(f.rank || "") === k ? " on" : ""}" data-v="${k}">${v}</span>`).join("")}</div>
            <div class="chips" id="fdrop"><span class="small muted">Drop:</span>${[["", "Todas"], ["yes", "Dropam"], ["no", "Não dropam"]].map(([k, v]) => `<span class="chip${(f.drop || "") === k ? " on" : ""}" data-v="${k}">${v}</span>`).join("")}</div>
            <div class="chips" id="fmine"><span class="small muted">Coleção:</span>${[["", "Todas"], ["missing", "Faltando"], ["owned", "Tenho"], ["wish", "Desejos ★"]].map(([k, v]) => `<span class="chip${(f.mine || "") === k ? " on" : ""}" data-v="${k}">${v}</span>`).join("")}</div>
            <div class="atk"><span class="small muted">ATK</span><input type="number" id="famin" placeholder="mín" step="100" value="${esc(f.amin || "")}"><input type="number" id="famax" placeholder="máx" step="100" value="${esc(f.amax || "")}"></div>
            <button class="btn sm" id="fclear">Limpar filtros</button>
          </div>
        </div>
        <p class="small muted" id="fcount"></p>
        <div class="grid" id="grid"></div><div class="more"><button class="btn" id="moreBtn">Carregar mais</button></div>
      </div>`;
    const upd = () => { store.set("filters", S.filters); drawGrid(true); };
    $("#fq").addEventListener("input", e => { S.filters.q = e.target.value; upd(); });
    [["#fcat", "cat"], ["#ftype", "type"], ["#fstar", "star"], ["#fsort", "sort"], ["#famin", "amin"], ["#famax", "amax"]]
      .forEach(([s, k]) => $(s).addEventListener("change", e => { S.filters[k] = e.target.value; upd(); }));
    [["#frank", "rank"], ["#fdrop", "drop"], ["#fmine", "mine"]].forEach(([s, k]) => $(s).addEventListener("click", e => {
      const c = e.target.closest(".chip"); if (!c) return;
      S.filters[k] = c.dataset.v; $(s).querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c)); upd();
    }));
    $("#fclear").addEventListener("click", () => { S.filters = {}; store.set("filters", {}); viewCards(); });
    $("#moreBtn").addEventListener("click", () => drawGrid(false));
    drawGrid(true);
  }
  function drawGrid(reset) {
    if (reset) { lastList = filteredCards(); shown = 0; $("#grid").innerHTML = ""; }
    const next = lastList.slice(shown, shown + 120); shown += next.length;
    $("#grid").insertAdjacentHTML("beforeend", next.map(tile).join(""));
    $("#fcount").textContent = `${lastList.length} carta${lastList.length === 1 ? "" : "s"} encontrada${lastList.length === 1 ? "" : "s"}`;
    $("#moreBtn").style.display = shown < lastList.length ? "" : "none";
    if (!lastList.length) $("#grid").innerHTML = `<div class="empty">Nenhuma carta com esses filtros.</div>`;
  }

  // ---------- CARTA (detalhe) ----------
  function viewCard(arg) {
    const c = CARD[+arg]; if (!c) return viewCards();
    const idx = I(), dr = idx.drops[c.id] || [], dk = idx.deck[c.id] || [];
    const other = buildIndex(S.ver === "mod13" ? "original" : "mod13");
    const otherLabel = S.ver === "mod13" ? "Original" : "Mod 13";
    // agrupa por duelista
    const byD = {};
    dr.forEach(x => { (byD[x.d] = byD[x.d] || {})[x.pool] = x.p; });
    const odr = {}; (other.drops[c.id] || []).forEach(x => { (odr[x.d] = odr[x.d] || {})[x.pool] = x.p; });
    const rows = Object.entries(byD).map(([d, m]) => ({ d: +d, m, best: Math.max(...Object.values(m)) })).sort((a, b) => b.best - a.best);
    const max = rows.length ? rows[0].best : 1;
    const cell = (m, k, om) => {
      const v = m[k] || 0, o = (om || {})[k] || 0;
      const diff = v !== o ? (v > o ? `<div class="small diff-up">▲ ${otherLabel}: ${o ? pct(o) : "—"}</div>` : `<div class="small diff-down">▼ ${otherLabel}: ${pct(o)}</div>`) : "";
      return `<td class="r">${v ? `<span class="pct">${pct(v)}</span><div class="small muted">${v}/2048 · ${oneIn(v)}</div>` : `<span class="muted">—</span>`}${diff}</td>`;
    };
    const lost = Object.keys(odr).filter(d => !byD[d]);
    const rit = RIT_BY_RES[c.id], isRit = RIT_BY_CARD[c.id];
    const stats = c.c === "monster" ? [["ATK", c.a], ["DEF", c.d], ["Nível", c.l], ["Tipo", TYPE_PT[c.t] || c.t], ["Atributo", c.at],
      ["Guardian Stars", c.g.map(g => STAR_PT[g] || g).join(" / ")]] : [["Categoria", CAT_PT[c.c]]];
    if (c.pw) stats.push(["Senha", c.pw]);
    if (c.sc) stats.push(["Star Chips", c.sc.toLocaleString("pt-BR")]);
    $("#app").innerHTML = `
      <a class="back" href="javascript:history.back()">← Voltar</a>
      <div class="detail">
        <div><img class="big" src="img/full/${c.id}.jpg" alt="${esc(c.n)}" onerror="this.src='${img(c.id)}'">
          <div class="row" style="margin-top:10px">
            <button class="btn${S.wish.has(c.id) ? " primary" : ""}" data-wish="${c.id}">★ Desejo</button>
            <button class="btn${S.owned.has(c.id) ? " primary" : ""}" data-own="${c.id}">✓ Tenho</button>
            <button class="btn" id="shareBtn">Copiar link</button>
          </div>
          <p class="small"><a href="cartas/${c.id}-${slug(c.n)}.html">Página permanente desta carta</a></p></div>
        <div>
          <div class="muted">#${pad(c.id)} · ${CAT_PT[c.c]}</div>
          <h1>${esc(c.n)}</h1>
          <div class="stats">${stats.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>
          ${rit ? `<div class="note">Monstro de ritual: use <a href="#/carta/${rit.r}">#${pad(rit.r)} ${esc(CARD[rit.r].n)}</a> com
            ${rit.m.map(m => `<a href="#/carta/${m}">${esc(CARD[m].n)}</a>`).join(", ")}.</div>` : ""}
          ${isRit ? `<div class="note">Este ritual invoca <a href="#/carta/${isRit.res}">#${pad(isRit.res)} ${esc(CARD[isRit.res].n)}</a> usando
            ${isRit.m.map(m => `<a href="#/carta/${m}">${esc(CARD[m].n)}</a>`).join(", ")}.</div>` : ""}
          <h2>Quem dropa (${S.ver === "mod13" ? "Mod 13" : "Original"})</h2>
          ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Duelista</th><th class="r">S/A-POW</th><th class="r">S/A-TEC</th><th class="r">B/C/D</th><th>Melhor</th></tr></thead><tbody>
            ${rows.map(r => `<tr><td>${who(r.d)}</td>${cell(r.m, "SAPow", odr[r.d])}${cell(r.m, "SATec", odr[r.d])}${cell(r.m, "BCD", odr[r.d])}<td>${bar(r.best, max)}</td></tr>`).join("")}
            </tbody></table></div>` : `<div class="note">Esta carta não dropa de nenhum duelista nesta versão.${rit ? " Farme o card de ritual acima." : ""}</div>`}
          ${lost.length ? `<p class="small muted">Dropava no ${otherLabel} e não dropa aqui: ${lost.map(d => esc(DUEL[d].n)).join(", ")}.</p>` : ""}
          <p class="small muted">A chance vale por duelo vencido com o rank indicado. "1 em N" = média de duelos para conseguir a carta.</p>
          ${dk.length ? `<h3>Duelistas que usam no deck</h3><div class="row">${dk.slice(0, 20).map(x => `<span class="chip" onclick="location.hash='#/duelista/${x.d}'">${esc(DUEL[x.d].n)} · ${pct(x.p)}</span>`).join("")}</div>` : ""}
        </div></div>`;
    $("#shareBtn").addEventListener("click", () => copy(new URL(`cartas/${c.id}-${slug(c.n)}.html`, location.href).href, "Link copiado"));
  }

  // ---------- DUELISTAS ----------
  function viewDuelists() {
    const idx = D.pools[S.ver];
    $("#app").innerHTML = `<section class="hero"><div><h1>Duelistas</h1><p class="muted">Escolha um oponente para ver tudo o que ele dropa em cada rank.</p></div></section>
      <div class="dgrid">${D.duelists.map(d => {
        const n = new Set(DROP_POOLS.flatMap(p => (idx[d.id] && idx[d.id][p] || []).map(x => x[0]))).size;
        return `<a class="dtile" href="#/duelista/${d.id}">${avatar(d.id)}<b>${esc(d.n)}</b><span>${n} cartas no drop</span></a>`;
      }).join("")}</div>`;
  }
  function viewDuelist(arg) {
    const d = DUEL[+arg]; if (!d) return viewDuelists();
    const P = D.pools[S.ver][d.id] || {};
    const tab = store.get("dtab", "SAPow"), q = store.get("dq", ""), miss = store.get("dmiss", false);
    const list = (P[tab] || []).filter(([cid]) => {
      const c = CARD[cid];
      if (q && !(c.n.toLowerCase().includes(q.toLowerCase()) || pad(cid).includes(q))) return false;
      if (miss && S.owned.has(cid)) return false;
      return true;
    });
    const max = list.length ? list[0][1] : 1;
    const wantSum = (P[tab] || []).filter(([cid]) => S.wish.has(cid) && !S.owned.has(cid)).reduce((s, x) => s + x[1], 0);
    $("#app").innerHTML = `
      <a class="back" href="#/duelistas">← Duelistas</a>
      <section class="hero"><div class="row">${avatar(d.id, 84)}<div><h1>${esc(d.n)}</h1>
        <p class="muted">${S.ver === "mod13" ? "Mod 13" : "Original"} · ${DROP_POOLS.map(p => `${RANKS[p][0]}: ${(P[p] || []).length} cartas`).join(" · ")}</p></div></div>
        ${wantSum ? `<div class="kpi"><b>${pct(wantSum)}</b><span>chance de dropar algo da sua lista de desejos neste rank</span></div>` : ""}</section>
      <div class="tabs" id="dtabs">${["SAPow", "SATec", "BCD", "Deck"].map(p => `<span class="chip${tab === p ? " on" : ""}" data-v="${p}">${p === "Deck" ? "Cartas do deck dele" : RANKS[p][0]}</span>`).join("")}</div>
      <div class="row" style="margin-bottom:10px"><input type="search" id="dq" placeholder="Filtrar cartas…" value="${esc(q)}">
        <label class="chip${miss ? " on" : ""}" id="dmiss">Só as que faltam</label></div>
      ${tab === "Deck" ? `<p class="small muted">Probabilidade de cada uma das 40 cartas do deck dele ser esta carta (não é drop).</p>` : ""}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Carta</th><th>ATK/DEF</th><th class="r">Chance</th><th class="r">Média</th><th></th><th></th></tr></thead><tbody>
      ${list.map(([cid, p]) => { const c = CARD[cid]; return `<tr data-card="${cid}" style="cursor:pointer">
        <td><img class="thumb" src="${img(cid)}" alt="" loading="lazy"></td>
        <td><div class="small muted">#${pad(cid)}</div><b>${esc(c.n)}</b></td>
        <td class="small">${c.c === "monster" ? `${c.a} / ${c.d}` : CAT_PT[c.c]}</td>
        <td class="r"><span class="pct">${pct(p)}</span><div class="small muted">${p}/2048</div></td>
        <td class="r small">${tab === "Deck" ? "—" : oneIn(p)}</td><td style="min-width:80px">${bar(p, max)}</td>
        <td style="white-space:nowrap"><button class="btn sm${S.wish.has(cid) ? " primary" : ""}" data-wish="${cid}">★</button> <button class="btn sm${S.owned.has(cid) ? " primary" : ""}" data-own="${cid}">✓</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">Nada aqui.</td></tr>`}
      </tbody></table></div>`;
    $("#dtabs").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) { store.set("dtab", c.dataset.v); viewDuelist(arg); } });
    $("#dq").addEventListener("change", e => { store.set("dq", e.target.value); viewDuelist(arg); });
    $("#dmiss").addEventListener("click", () => { store.set("dmiss", !miss); viewDuelist(arg); });
  }

  // ---------- FARM ----------
  function viewFarm() {
    const P = D.pools[S.ver];
    const want = [...S.wish].filter(id => !S.owned.has(id));
    const results = [];
    for (const d of D.duelists) for (const pool of DROP_POOLS) {
      const list = (P[d.id] && P[d.id][pool]) || [];
      const hit = list.filter(([cid]) => want.includes(cid));
      if (!hit.length) continue;
      const sum = hit.reduce((s, x) => s + x[1], 0);
      results.push({ d: d.id, pool, sum, hit });
    }
    results.sort((a, b) => b.sum - a.sum || b.hit.length - a.hit.length);
    const max = results.length ? results[0].sum : 1;
    const noDrop = want.filter(id => !(I().drops[id] || []).length);
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Planejador de farm</h1><p class="muted">Monte sua lista de desejos e descubra qual duelista e rank rendem mais.</p></div></section>
      <div class="farm-grid">
        <div class="panel"><h3>Sua lista de desejos (${want.length} faltando)</h3>
          <div class="sugg"><input type="search" id="addq" placeholder="Adicionar carta: digite o nome ou número…" style="width:100%" autocomplete="off"><div class="sugg-list" id="addl" hidden></div></div>
          <div class="wl" style="margin-top:10px">${want.map(id => `<span class="pill"><img src="${img(id)}" alt=""><a href="#/carta/${id}">${esc(CARD[id].n)}</a><button data-wish="${id}" title="Remover">✕</button></span>`).join("") || `<span class="muted small">Vazia. Adicione cartas acima ou clique na ★ em qualquer carta.</span>`}</div>
          ${noDrop.length ? `<p class="small" style="color:var(--bad)">Sem drop nesta versão: ${noDrop.map(id => esc(CARD[id].n)).join(", ")}.</p>` : ""}
        </div>
        <div class="panel"><h3>Como ler</h3><p class="small muted">Para cada duelista e rank, somamos a chance de cada carta da sua lista que ele dropa.
          A "média" é quantos duelos, em média, até cair <b>alguma</b> carta da lista. Para S/A-POW, vença com muito dano e ataques; para S/A-TEC, use mágicas, armadilhas e fusões; B/C/D é o rank baixo.</p></div>
      </div>
      <h2 style="margin-top:18px">Melhores alvos</h2>
      ${results.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Duelista</th><th>Rank</th><th class="r">Chance total</th><th class="r">Média</th><th></th><th>Cartas da lista</th></tr></thead><tbody>
        ${results.slice(0, 30).map(r => `<tr><td>${who(r.d)}</td><td>${rankTag(r.pool)}</td><td class="r"><span class="pct">${pct(r.sum)}</span><div class="small muted">${r.sum}/2048</div></td>
          <td class="r small">${oneIn(r.sum)} duelos</td><td style="min-width:80px">${bar(r.sum, max)}</td>
          <td><div class="mini-thumbs">${r.hit.map(([cid, p]) => `<a href="#/carta/${cid}" title="${esc(CARD[cid].n)} · ${pct(p)}"><img src="${img(cid)}" alt=""></a>`).join("")}</div></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty panel">Adicione cartas à lista de desejos para ver os melhores alvos.</div>`}`;
    const q = $("#addq"), l = $("#addl");
    q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase(); if (!s) { l.hidden = true; return; }
      const m = D.cards.filter(c => c.n.toLowerCase().includes(s) || pad(c.id).includes(s)).slice(0, 12);
      l.innerHTML = m.map(c => `<button data-add="${c.id}"><img src="${img(c.id)}" alt=""><span>#${pad(c.id)} ${esc(c.n)}</span></button>`).join("") || `<div class="empty small">Nada encontrado</div>`;
      l.hidden = false;
    });
    l.addEventListener("click", e => { const b = e.target.closest("[data-add]"); if (b) { S.wish.add(+b.dataset.add); saveSets(); viewFarm(); $("#addq").focus(); } });
  }

  // ---------- COLEÇÃO ----------
  function viewCollection() {
    const cats = Object.keys(CAT_PT).map(k => { const all = D.cards.filter(c => c.c === k); const o = all.filter(c => S.owned.has(c.id)).length; return [k, o, all.length]; });
    const o = S.owned.size, on = window.FMOnline, me = on && on.user;
    let atk = 0, def = 0; S.owned.forEach(id => { atk += CARD[id].a || 0; def += CARD[id].d || 0; });
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Minha coleção</h1><p class="muted">${me
        ? `Sincronizada com a sua conta <b>${esc(on.username || "")}</b> — vale em qualquer aparelho. <a href="#/jogador/${encodeURIComponent(on.username || "")}">Ver meu perfil público</a>`
        : `Salva só neste navegador. ${on && on.enabled ? `<button class="linklike" onclick="FMOnline.openAuth('login')">Entre ou crie uma conta</button> para salvar online e entrar no <a href="#/ranking">ranking</a>.` : "Exporte para não perder ou levar para outro aparelho."}`}</p>
        <div class="kpis" style="margin-top:10px"><div class="kpi"><b>ATK ${atk.toLocaleString("pt-BR")}</b><span>soma do ATK das cartas marcadas</span></div>
        <div class="kpi"><b>DEF ${def.toLocaleString("pt-BR")}</b><span>soma do DEF</span></div></div></div>
        <div class="row"><button class="btn" id="exp">Exportar</button><label class="btn">Importar<input type="file" id="imp" accept="application/json" hidden></label><button class="btn" id="rst">Zerar</button></div></section>
      <div class="panel"><div class="row" style="justify-content:space-between"><b>${o} / 722 cartas</b><span class="muted">${(o / 722 * 100).toFixed(1).replace(".", ",")}%</span></div>
        <div class="prog" style="margin:8px 0 14px"><i style="width:${o / 722 * 100}%"></i></div>
        <div class="cols3">${cats.map(([k, a, t]) => `<div><div class="row" style="justify-content:space-between"><span>${CAT_PT[k]}</span><span class="small muted">${a}/${t}</span></div><div class="prog"><i style="width:${t ? a / t * 100 : 0}%"></i></div></div>`).join("")}</div></div>
      <h2 style="margin-top:18px">Lista de desejos (${S.wish.size})</h2>
      <div class="grid">${[...S.wish].sort((a, b) => a - b).map(id => tile(CARD[id])).join("") || `<div class="empty">Clique na ★ de uma carta para adicionar.</div>`}</div>
      <h2 style="margin-top:18px">Cartas que tenho (${o})</h2>
      <div class="grid">${[...S.owned].sort((a, b) => a - b).map(id => tile(CARD[id])).join("") || `<div class="empty">Clique no ✓ de uma carta para marcar que você tem.</div>`}</div>`;
    $("#exp").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({ owned: [...S.owned], wish: [...S.wish] })], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "fm-colecao.json"; a.click();
    });
    $("#imp").addEventListener("change", async e => {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        const owned = new Set((j.owned || []).map(Number).filter(id => CARD[id]));
        S.wish = new Set((j.wish || []).map(Number).filter(id => CARD[id]));
        if (me) await on.replaceOwned(owned); else S.owned = owned;
        saveSets(); toast("Coleção importada"); viewCollection();
      } catch { toast("Arquivo inválido"); }
    });
    $("#rst").addEventListener("click", async () => {
      if (!confirm(me ? "Desmarcar TODAS as cartas da sua conta e limpar a lista de desejos?" : "Apagar coleção e lista de desejos deste navegador?")) return;
      if (me) await on.replaceOwned(new Set()); else S.owned.clear();
      S.wish.clear(); saveSets(); viewCollection();
    });
  }

  // ---------- MUDANÇAS ----------
  function viewChanges() {
    const A = D.pools.original, B = D.pools.mod13, map = {};
    const key = (d, p, c) => d + "|" + p + "|" + c;
    const va = {}, vb = {};
    for (const [d, P] of Object.entries(A)) for (const p of DROP_POOLS) for (const [c, n] of (P[p] || [])) va[key(d, p, c)] = n;
    for (const [d, P] of Object.entries(B)) for (const p of DROP_POOLS) for (const [c, n] of (P[p] || [])) vb[key(d, p, c)] = n;
    for (const k of new Set([...Object.keys(va), ...Object.keys(vb)])) {
      const a = va[k] || 0, b = vb[k] || 0; if (a === b) continue;
      const [d, p, c] = k.split("|"); (map[c] = map[c] || []).push({ d: +d, p, a, b });
    }
    const mode = store.get("chmode", "new");
    let cards = Object.keys(map).map(Number);
    const newDrop = c => !Object.keys(va).some(k => k.endsWith("|" + c)) ;
    if (mode === "new") cards = cards.filter(newDrop);
    cards.sort((x, y) => (CARD[y].a || 0) - (CARD[x].a || 0) || x - y);
    const total = Object.values(map).reduce((s, x) => s + x.length, 0);
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Mod 13 × Original</h1><p class="muted">${total} entradas de drop mudaram em ${Object.keys(map).length} cartas.</p></div></section>
      <div class="tabs" id="chm">${[["new", "Cartas que só dropam no Mod 13"], ["all", "Todas as mudanças"]].map(([k, v]) => `<span class="chip${mode === k ? " on" : ""}" data-v="${k}">${v}</span>`).join("")}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Carta</th><th>Mudanças (duelista · rank · original → Mod 13)</th></tr></thead><tbody>
      ${cards.map(c => `<tr data-card="${c}" style="cursor:pointer"><td><img class="thumb" src="${img(c)}" alt="" loading="lazy"></td>
        <td><div class="small muted">#${pad(c)}</div><b>${esc(CARD[c].n)}</b>${CARD[c].a != null ? `<div class="small muted">ATK ${CARD[c].a}</div>` : ""}</td>
        <td class="small">${map[c].sort((x, y) => y.b - x.b).map(x => `${esc(DUEL[x.d].n)} · ${RANKS[x.p][0]} · ${x.a ? pct(x.a) : "—"} → <b class="${x.b > x.a ? "diff-up" : "diff-down"}">${x.b ? pct(x.b) : "removido"}</b>`).join("<br>")}</td></tr>`).join("")}
      </tbody></table></div>`;
    $("#chm").addEventListener("click", e => { const c = e.target.closest(".chip"); if (c) { store.set("chmode", c.dataset.v); viewChanges(); } });
  }

  // ---------- SOBRE ----------
  function viewAbout() {
    $("#app").innerHTML = `
      <section class="hero"><div><h1>Sobre</h1></div></section>
      <div class="panel">
        <h3>De onde vêm os dados</h3>
        <p>As tabelas do <b>Mod 13</b> foram lidas diretamente do arquivo <code>WA_MRG.MRG</code> da ISO (versão PT-BR): 39 duelistas × 4 pools (Deck, S/A-POW, S/A-TEC, B/C/D), cada um somando exatamente 2048.
        A leitura foi validada contra o banco de dados do jogo original publicado em <a href="https://github.com/sg4e/YGOFM-gamedata" target="_blank" rel="noopener">github.com/sg4e/YGOFM-gamedata</a> e conferida na <a href="https://yugipedia.com/wiki/Yu-Gi-Oh!_Forbidden_Memories" target="_blank" rel="noopener">Yugipedia</a>.
        Números, ATK/DEF, tipos e guardian stars das 722 cartas são idênticos entre o Mod 13 e o original — o mod altera só os drops (348 entradas).</p>
        <h3>Como funciona o drop</h3>
        <p>Ao vencer, o jogo sorteia <b>1 carta</b> do pool do duelista correspondente ao seu rank: S/A-POW (vitória por força), S/A-TEC (vitória técnica) ou B/C/D (ranks baixos). A chance é <i>N</i>/2048 por duelo.</p>
        <h3 id="privacidade">Contas, ranking e privacidade</h3>
        <p>A conta é opcional: sem ela, a coleção fica só no seu navegador. Com conta, guardamos apenas o <b>e-mail</b> (para entrar e recuperar a senha — nunca é exibido),
        o <b>apelido</b> e as <b>cartas que você marcou</b>. O apelido, as cartas marcadas e a pontuação (ATK/DEF) são <b>públicos</b> no ranking.
        As senhas são guardadas pelo Supabase (serviço de login) de forma criptografada; ninguém do site tem acesso a elas.
        Você pode excluir sua conta e todos os dados a qualquer momento em <a href="#/conta">Minha conta</a>.</p>
        <p class="small muted">O ranking é feito com o que cada jogador marca, sem verificação no jogo: vale a honestidade de cada um.</p>
        <h3>Imagens e marcas</h3>
        <p class="small muted">Imagens de cartas e personagens obtidas via Yugipedia. Yu-Gi-Oh! e Forbidden Memories são marcas e propriedade da Konami. Este é um projeto de fãs, sem fins comerciais e sem vínculo com a Konami.</p>
        ${CFG.repoUrl ? `<p><a href="${esc(CFG.repoUrl)}" target="_blank" rel="noopener">Código no GitHub</a></p>` : ""}
        <p><button class="btn-donate" onclick="document.getElementById('donateBtn').click()">♥ Apoiar o projeto</button></p>
      </div>`;
  }

  // ---------- DOAÇÃO (Pix BR Code + links) ----------
  const tlv = (id, v) => id + String(v.length).padStart(2, "0") + v;
  const ascii = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "");
  function crc16(s) {
    let crc = 0xFFFF;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
  }
  function pixPayload(amount) {
    const p = CFG.pix || {};
    const msg = ascii(p.message).slice(0, 40);
    const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", String(p.key).trim()) + (msg ? tlv("02", msg) : "");
    let s = tlv("00", "01") + tlv("26", mai) + tlv("52", "0000") + tlv("53", "986") +
      (amount ? tlv("54", amount.toFixed(2)) : "") + tlv("58", "BR") +
      tlv("59", ascii(p.name).toUpperCase().slice(0, 25) || "RECEBEDOR") + tlv("60", ascii(p.city).toUpperCase().slice(0, 15) || "BRASIL") +
      tlv("62", tlv("05", "***")) + "6304";
    return s + crc16(s);
  }
  function copy(text, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(msg || "Copiado"))
      .catch(() => { prompt("Copie:", text); });
  }
  let donateAmount = 0;
  function openDonate() {
    const dlg = $("#donate"), hasPix = CFG.pix && CFG.pix.key, links = (CFG.links || []).filter(l => l.url);
    const presets = CFG.presets || [5, 10, 20, 50];
    const draw = () => {
      let pixHtml = "";
      if (hasPix) {
        const payload = pixPayload(donateAmount);
        let qr = "";
        try { const q = qrcode(0, "M"); q.addData(payload); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch { qr = ""; }
        pixHtml = `
          <h3 style="margin-top:12px">Pix — qualquer valor</h3>
          <div class="amounts">${presets.map(v => `<span class="chip${donateAmount === v ? " on" : ""}" data-amt="${v}">R$ ${v}</span>`).join("")}
            <span class="chip${donateAmount === 0 ? " on" : ""}" data-amt="0">Você escolhe no app</span></div>
          <div class="custom"><span class="small muted">Outro valor: R$</span><input type="number" id="amt" min="1" step="1" placeholder="ex.: 15" value="${donateAmount && !presets.includes(donateAmount) ? donateAmount : ""}"><button class="btn sm" id="amtOk">Usar</button></div>
          ${qr ? `<div class="qr">${qr}</div>` : `<p class="small muted">Não foi possível desenhar o QR Code; use o copia e cola.</p>`}
          <p class="small muted" style="text-align:center;margin:0 0 8px">${donateAmount ? `Valor: <b>R$ ${donateAmount.toFixed(2).replace(".", ",")}</b>` : "Sem valor fixo: você digita o valor no app do banco."}</p>
          <div class="copybox"><input type="text" readonly value="${esc(payload)}" id="pixCode"><button class="btn primary sm" id="pixCopy">Copiar</button></div>`;
      }
      $("#donateBody").innerHTML = `
        <div class="dlg-head"><h2 style="margin:0">♥ Apoie o FMDrops Yugioh</h2><button class="close" id="dclose" aria-label="Fechar">×</button></div>
        <p class="small muted">O site é gratuito e sem anúncios. Se ele te ajudou a farmar, qualquer valor ajuda a manter e melhorar o projeto.</p>
        ${pixHtml}
        ${links.length ? `<h3 style="margin-top:14px">Outras formas</h3><div class="dlinks">${links.map(l => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>` : ""}
        ${!hasPix && !links.length ? `<div class="note small">Doações ainda não configuradas. Dono do site: preencha <code>assets/config.js</code> com sua chave Pix e/ou links.</div>` : ""}`;
      $("#dclose").onclick = () => dlg.close();
      $("#donateBody").querySelectorAll("[data-amt]").forEach(c => c.onclick = () => { donateAmount = +c.dataset.amt; draw(); });
      const ok = $("#amtOk"); if (ok) ok.onclick = () => { const v = Math.round(parseFloat($("#amt").value) * 100) / 100; if (v >= 1) { donateAmount = v; draw(); } else toast("Valor mínimo R$ 1"); };
      const pc = $("#pixCopy"); if (pc) pc.onclick = () => copy($("#pixCode").value, "Pix copia e cola copiado");
    };
    draw();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("#donate").addEventListener("click", e => { if (e.target.id === "donate") e.target.close(); });
  $("#donateBtn").addEventListener("click", openDonate);
  $("#donateBtn2").addEventListener("click", openDonate);

  // ---------- tema / versão ----------
  function applyTheme(t) { if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme"); }
  applyTheme(store.get("theme", null));
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const n = cur === "light" ? "dark" : "light"; applyTheme(n); store.set("theme", n);
  });
  function drawVer() { document.querySelectorAll("#verSwitch button").forEach(b => b.classList.toggle("on", b.dataset.v === S.ver)); }
  $("#verSwitch").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    S.ver = b.dataset.v; store.set("ver", S.ver); drawVer(); render(); toast(S.ver === "mod13" ? "Mostrando Mod 13" : "Mostrando jogo original");
  });

  // ---------- boot ----------
  fetch("data/fm-data.json").then(r => r.json()).then(j => {
    D = j;
    D.cards.forEach(c => CARD[c.id] = c);
    D.duelists.forEach(d => DUEL[d.id] = d);
    D.rituals.forEach(r => { RIT_BY_RES[r.res] = r; RIT_BY_CARD[r.r] = r; });
    if (!D.pools[S.ver]) S.ver = "mod13";
    window.FMD = { S, D, CARD, DUEL, render, route, toast, saveSets, esc, pad, img, EXTRA_VIEWS, STAR_PT, TYPE_PT, CAT_PT };
    if (window.FMOnline) window.FMOnline.init();
    drawVer(); render();
  }).catch(() => { $("#app").innerHTML = `<div class="empty">Não foi possível carregar os dados. Se abriu o arquivo direto do disco, use um servidor local ou o GitHub Pages.</div>`; });
})();
