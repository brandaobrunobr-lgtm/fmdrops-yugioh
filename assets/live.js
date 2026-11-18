/* FMDrops Yugioh — painel para live (OBS / TikTok LIVE Studio).
 * live.html            → tela de configuração (gera o link do painel)
 * live.html?u=apelido  → painel que lê a coleção pública do ranking (atualiza sozinho)
 * live.html?local=1    → painel que lê a coleção salva neste navegador
 * Parâmetros extras: t=título, n=número da live, m=meta, bg=transp
 * Todo texto vindo da URL ou do banco entra via textContent (nunca innerHTML). */
(function () {
  "use strict";
  const CFG = (window.SITE_CONFIG || {}).supabase || {};
  const root = document.getElementById("root");
  const Q = new URLSearchParams(location.search);
  const par = (k, max) => (Q.get(k) || "").trim().slice(0, max);
  const opt = {
    user: par("u", 20), local: Q.get("local") === "1",
    title: par("t", 80), num: par("n", 5).replace(/\D/g, ""), goal: par("m", 120),
    transp: Q.get("bg") === "transp"
  };
  const TOTAL = 722;
  const fmt = n => Number(n || 0).toLocaleString("pt-BR");
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const validIds = a => Array.isArray(a) ? a.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= TOTAL) : [];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento: segue sem lembrar */ } }
  };

  if (!opt.user && !opt.local) return setup();
  overlay();

  // ======================= tela de configuração =======================
  function setup() {
    document.title = "Painel de live — FMDrops Yugioh";
    root.innerHTML = `
    <div class="setup">
      <h1>Painel para live</h1>
      <p>Mostra na sua transmissão a contagem de cartas, a barra de progresso, a meta do dia e um destaque animado sempre que você marcar uma carta nova no FMDrops. Feito para o formato vertical do TikTok (1080 px de largura).</p>
      <fieldset><legend>De onde vem a coleção</legend>
        <label class="opt"><input type="radio" name="src" value="u" checked> <span><b>Minha conta do ranking</b> (recomendado): marque as cartas no site, em qualquer aparelho, e o painel atualiza sozinho em até 15 segundos.</span></label>
        <label for="fu">Seu apelido no ranking</label><input type="text" id="fu" maxlength="20" autocomplete="off" placeholder="ex.: DuelistaBR">
        <label class="opt"><input type="radio" name="src" value="local"> <span><b>Coleção deste navegador</b> (sem conta): só funciona se o painel abrir neste mesmo navegador; no OBS use "Captura de janela" em vez de "Navegador".</span></label>
      </fieldset>
      <fieldset><legend>Textos da live</legend>
        <label for="fn">Número da live</label><input type="number" id="fn" min="1" max="99999" placeholder="ex.: 1">
        <label for="ft">Título</label><input type="text" id="ft" maxlength="80" placeholder="ex.: Do zero ao deck final — Mod 13">
        <label for="fm">Meta do dia</label><input type="text" id="fm" maxlength="120" placeholder="ex.: farmar Meadow Mage até dropar o Meteor B. Dragon">
        <label class="opt"><input type="checkbox" id="fb"> <span>Fundo transparente (para colocar o painel por cima do jogo)</span></label>
      </fieldset>
      <fieldset><legend>Link do painel</legend>
        <output class="url" id="out"></output>
        <div class="row"><button class="btn primary" id="copy" type="button">Copiar link</button><a class="btn" id="open" target="_blank" rel="noopener">Abrir prévia</a></div>
        <p class="hint" id="msg" role="status" aria-live="polite"></p>
      </fieldset>
      <h2>Como colocar no OBS / TikTok LIVE Studio</h2>
      <ol>
        <li>Adicione uma fonte <b>Navegador</b> (no LIVE Studio: <b>Adicionar fonte → Link</b>) e cole o link acima.</li>
        <li>Largura <code>1080</code>, altura <code>700</code>. Posicione onde quiser na tela vertical (1080×1920).</li>
        <li>Durante a live, marque as cartas que dropar no FMDrops (✓ Tenho). O painel mostra <b>NOVA CARTA!</b> com a imagem dela.</li>
        <li>O contador "nesta live" zera sozinho depois de 8 horas sem atualizar, ou quando você muda o número da live.</li>
      </ol>
      <p class="hint">O painel só lê dados públicos do ranking (apelido e cartas), os mesmos que qualquer visitante já vê. <a href="./">Voltar ao FMDrops</a></p>
    </div>`;
    const $ = id => document.getElementById(id);
    const saved = store.get("fmd:live:setup", {});
    if (saved && typeof saved === "object") {
      if (typeof saved.u === "string") $("fu").value = saved.u.slice(0, 20);
      if (typeof saved.t === "string") $("ft").value = saved.t.slice(0, 80);
      if (typeof saved.m === "string") $("fm").value = saved.m.slice(0, 120);
      if (saved.n) $("fn").value = String(saved.n).replace(/\D/g, "").slice(0, 5);
      if (saved.bg) $("fb").checked = true;
      if (saved.src === "local") document.querySelector('input[name=src][value=local]').checked = true;
    }
    const build = () => {
      const src = document.querySelector("input[name=src]:checked").value;
      const p = new URLSearchParams();
      const u = $("fu").value.trim(), n = $("fn").value.replace(/\D/g, "").slice(0, 5), t = $("ft").value.trim(), m = $("fm").value.trim();
      if (src === "u") { if (u) p.set("u", u); } else p.set("local", "1");
      if (n) p.set("n", n); if (t) p.set("t", t); if (m) p.set("m", m); if ($("fb").checked) p.set("bg", "transp");
      store.set("fmd:live:setup", { src, u, n, t, m, bg: $("fb").checked });
      const ok = src === "local" || !!u;
      const url = new URL("live.html", location.href); url.search = p.toString();
      $("out").textContent = ok ? url.href : "Digite seu apelido do ranking para gerar o link.";
      $("copy").disabled = !ok; $("open").toggleAttribute("href", ok); if (ok) $("open").href = url.href;
      return ok ? url.href : "";
    };
    root.addEventListener("input", build); root.addEventListener("change", build); build();
    $("copy").addEventListener("click", async () => {
      const u = build(); if (!u) return;
      try { await navigator.clipboard.writeText(u); $("msg").textContent = "Link copiado! Cole no OBS ou no LIVE Studio."; }
      catch { $("msg").textContent = "Não deu para copiar automaticamente: selecione o link acima e copie."; }
    });
  }

  // ======================= painel =======================
  async function overlay() {
    if (opt.transp) document.body.classList.add("transp");
    document.title = "Live" + (opt.num ? " #" + opt.num : "") + " — FMDrops";
    // nomes das cartas (mesmo arquivo do site)
    let NAMES = {};
    try { const d = await (await fetch("data/fm-data.json")).json(); for (const c of d.cards) NAMES[c.id] = c; } catch { /* sem nomes: mostra só o número */ }

    const ov = el("div", "ov"), card = el("div", "card");
    const top = el("div", "top"); top.append(el("span", "", "FMDrops · Mod 13"), el("span", "live", opt.num ? "LIVE #" + opt.num : "AO VIVO"));
    const title = el("div", "title", opt.title || (opt.user ? "Coleção de " + opt.user : "Minha coleção"));
    const count = el("div", "count"); const cB = el("b", "", "—"); const pc = el("span", "pc", "");
    count.append(cB, el("span", "", "/ " + TOTAL), pc);
    const bar = el("div", "bar"); const barI = el("i"); bar.append(barI);
    const stats = el("div", "stats");
    const mk = (label, cls) => { const s = el("div", "stat" + (cls ? " " + cls : "")); const b = el("b", "", "—"); s.append(b, el("small", "", label)); stats.append(s); return b; };
    const sNew = mk("nesta live", "up"), sAtk = mk("ATK total"), sDef = mk("DEF total"), sPos = opt.user ? mk("no ranking") : null;
    card.append(top, title, count, bar, stats);
    if (opt.goal) { const g = el("div", "goal"); g.append(el("em", "", "Meta: "), document.createTextNode(opt.goal)); card.append(g); }
    const recent = el("div", "recent"); const foot = el("div", "foot", "");
    card.append(recent, foot);
    const pop = el("div", "pop"); pop.setAttribute("aria-live", "polite");
    ov.append(card, pop); root.replaceChildren(ov);

    // linha de base "nesta live": guardada por fonte + número da live, expira em 8h sem uso
    const bkey = "fmd:live:base:" + (opt.user ? "u:" + opt.user.toLowerCase() : "local") + ":" + (opt.num || "");
    let base = null, prev = null, sessionNew = [];
    const loadBase = () => { const b = store.get(bkey, null); if (b && Array.isArray(b.ids) && Date.now() - (b.at || 0) < 8 * 3600e3) { base = new Set(validIds(b.ids)); sessionNew = validIds(b.got || []); } };
    const saveBase = () => { if (base) store.set(bkey, { ids: [...base], got: sessionNew, at: Date.now() }); };
    loadBase();

    const queue = []; let showing = false;
    const showNext = () => {
      if (showing || !queue.length) return; showing = true;
      const id = queue.shift(), c = NAMES[id];
      const im = el("img"); im.src = "img/full/" + id + ".jpg"; im.alt = "";
      const tx = el("div"); tx.append(el("div", "t1", "NOVA CARTA!"), el("div", "t2", c ? c.n : "Carta #" + id),
        el("div", "t3", c && c.c === "monster" ? `ATK ${c.a} / DEF ${c.d}` : "No." + String(id).padStart(3, "0")));
      pop.replaceChildren(im, tx); pop.classList.add("show");
      setTimeout(() => { pop.classList.remove("show"); setTimeout(() => { showing = false; showNext(); }, 500); }, 6000);
    };

    function render(ids, rankPos) {
      const set = new Set(ids);
      if (!base) { base = new Set(set); sessionNew = []; }
      // cartas novas desde o início da live; só anima as que chegaram com o painel aberto
      for (const id of set) if (!base.has(id) && !sessionNew.includes(id)) { sessionNew.push(id); if (prev) queue.push(id); }
      sessionNew = sessionNew.filter(id => set.has(id));       // desmarcou? sai da lista
      prev = set; saveBase();
      let atk = 0, def = 0; set.forEach(id => { const c = NAMES[id]; if (c) { atk += c.a || 0; def += c.d || 0; } });
      cB.textContent = fmt(set.size); pc.textContent = (set.size / TOTAL * 100).toFixed(1).replace(".", ",") + "%";
      barI.style.width = (set.size / TOTAL * 100) + "%";
      sNew.textContent = "+" + sessionNew.length; sAtk.textContent = fmt(atk); sDef.textContent = fmt(def);
      if (sPos) sPos.textContent = rankPos ? "#" + rankPos : "—";
      recent.replaceChildren(...sessionNew.slice(-8).reverse().map(id => { const i = el("img"); i.src = "img/cards/" + id + ".jpg"; i.alt = NAMES[id] ? NAMES[id].n : ""; return i; }));
      showNext();
    }

    if (opt.local) {
      const read = () => render(validIds(store.get("fmd:owned", [])), null);
      read(); foot.textContent = "Coleção deste navegador";
      window.addEventListener("storage", e => { if (e.key === "fmd:owned") read(); });
      setInterval(read, 3000);
      return;
    }

    if (!CFG.url || !CFG.anonKey || !window.supabase) { foot.textContent = "Ranking online indisponível."; foot.classList.add("err"); return; }
    const sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let fails = 0;
    async function poll() {
      try {
        const [{ data: cards, error: e1 }, { data: prof, error: e2 }] = await Promise.all([
          sb.rpc("player_cards", { name: opt.user }), sb.rpc("player_profile", { name: opt.user })]);
        if (e1 || e2) throw e1 || e2;
        fails = 0;
        const ids = validIds((cards || []).map(r => r.card_id));
        if (!ids.length && !(prof && prof[0])) { foot.textContent = `Jogador "${opt.user}" não encontrado ou sem cartas marcadas.`; foot.classList.add("err"); }
        else { foot.textContent = "Atualizado " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); foot.classList.remove("err"); }
        render(ids, prof && prof[0] ? prof[0].pos : null);
      } catch {
        fails++; foot.textContent = "Sem conexão com o ranking — tentando de novo…"; foot.classList.add("err");
      }
      setTimeout(poll, fails ? Math.min(60000, 15000 * fails) : 15000);
    }
    poll();
  }
})();
