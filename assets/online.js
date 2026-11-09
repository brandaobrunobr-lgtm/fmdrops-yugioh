/* FMDrops Yugioh — contas, sincronização da coleção e ranking (Supabase).
 * Sem configuração em assets/config.js (supabase.url / anonKey), o site funciona só no modo offline. */
(function () {
  "use strict";
  const CFG = (window.SITE_CONFIG || {}).supabase || {};
  const USER_RE = /^[A-Za-z0-9_.-]{3,20}$/;
  const $ = (s, el = document) => el.querySelector(s);
  const fmt = n => Number(n || 0).toLocaleString("pt-BR");
  let sb = null, F = null;   // cliente Supabase, API do app (window.FMD)

  const ERR = [
    [/invalid login credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail: abra o link que enviamos e depois entre."],
    [/user already registered|already been registered/i, "Este e-mail já tem conta. Use \"Entrar\" ou \"Esqueci a senha\"."],
    [/password should be at least|weak password/i, "Senha fraca: use pelo menos 8 caracteres, misturando letras e números."],
    [/rate limit|too many/i, "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
    [/database error saving new user|duplicate key|profiles_username/i, "Esse apelido já está em uso. Escolha outro."],
    [/network|fetch/i, "Sem conexão com o servidor. Verifique sua internet."],
  ];
  const mine = m => Object.assign(new Error(m), { mine: true });
  const tr = e => { const m = (e && (e.message || e.error_description || e)) + ""; const f = ERR.find(([r]) => r.test(m)); return f ? f[1] : "Erro: " + m; };

  const On = window.FMOnline = {
    enabled: !!(CFG.url && CFG.anonKey && window.supabase),
    user: null, username: null,

    init() {
      F = window.FMD;
      Object.assign(F.EXTRA_VIEWS, { ranking: viewRanking, jogador: viewPlayer, conta: viewAccount });
      drawHeader();
      if (!On.enabled) return;
      sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") { cleanHash(); openAuth("newpass"); }
        setTimeout(() => handleSession(session, event), 0);
      });
    },
    openAuth: m => openAuth(m),

    async setOwned(id, has) {
      if (!On.user) return;
      const q = has
        ? sb.from("user_cards").upsert({ user_id: On.user.id, card_id: id }, { onConflict: "user_id,card_id", ignoreDuplicates: true })
        : sb.from("user_cards").delete().eq("user_id", On.user.id).eq("card_id", id);
      const { error } = await q;
      if (error) {   // desfaz no navegador para não mentir sobre o que está salvo
        if (has) F.S.owned.delete(id); else F.S.owned.add(id);
        F.saveSets(); F.toast("Não salvou: " + tr(error)); F.render();
      }
    },
    async replaceOwned(set) {
      if (!On.user) { F.S.owned = new Set(set); return; }
      const cur = await fetchOwned();
      const add = [...set].filter(id => !cur.has(id)), del = [...cur].filter(id => !set.has(id));
      if (del.length) { const { error } = await sb.from("user_cards").delete().eq("user_id", On.user.id).in("card_id", del); if (error) return F.toast(tr(error)); }
      if (add.length) { const { error } = await sb.from("user_cards").upsert(add.map(card_id => ({ user_id: On.user.id, card_id })), { onConflict: "user_id,card_id", ignoreDuplicates: true }); if (error) return F.toast(tr(error)); }
      F.S.owned = new Set(set); F.saveSets();
    },
  };

  function cleanHash() { if (/access_token|type=recovery|error_description/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/cartas"); }

  async function fetchOwned() {
    const { data, error } = await sb.from("user_cards").select("card_id").eq("user_id", On.user.id);
    if (error) throw error;
    return new Set(data.map(r => r.card_id));
  }

  async function handleSession(session, event) {
    const was = On.user && On.user.id;
    On.user = session ? session.user : null;
    if (!On.user) { On.username = null; drawHeader(); if (was) F.render(); return; }
    if (was === On.user.id && event !== "SIGNED_IN") { drawHeader(); return; }
    try {
      const { data: p } = await sb.from("profiles").select("username").eq("id", On.user.id).maybeSingle();
      On.username = p ? p.username : (On.user.user_metadata || {}).username || "jogador";
      drawHeader();
      const server = await fetchOwned();
      const localOnly = [...F.S.owned].filter(id => !server.has(id));
      const key = "fmd:merged:" + On.user.id;
      let merged = false; try { merged = !!localStorage.getItem(key); } catch { /* */ }
      if (localOnly.length && !merged &&
          confirm(`Você tem ${localOnly.length} carta(s) marcada(s) neste navegador que não estão na sua conta.\n\nAdicionar à sua conta?`)) {
        const { error } = await sb.from("user_cards").upsert(localOnly.map(card_id => ({ user_id: On.user.id, card_id })), { onConflict: "user_id,card_id", ignoreDuplicates: true });
        if (error) F.toast(tr(error)); else localOnly.forEach(id => server.add(id));
      }
      try { localStorage.setItem(key, "1"); } catch { /* */ }
      F.S.owned = server; F.saveSets();
      cleanHash(); F.render();
      if (event === "SIGNED_IN") F.toast(`Bem-vindo, ${On.username}!`);
    } catch (e) { F.toast(tr(e)); }
  }

  // ---------- cabeçalho ----------
  function drawHeader() {
    const box = $(".top-actions"); if (!box) return;
    let el = $("#authArea");
    if (!el) { el = document.createElement("div"); el.id = "authArea"; el.className = "auth-area"; box.insertBefore(el, $("#donateBtn")); }
    if (!On.enabled) { el.innerHTML = ""; return; }
    el.innerHTML = On.user
      ? `<details class="umenu"><summary class="btn sm">👤 ${F.esc(On.username || "…")}</summary><div class="umenu-list">
           <a href="#/jogador/${encodeURIComponent(On.username || "")}">Meu perfil no ranking</a>
           <a href="#/colecao">Minha coleção</a><a href="#/conta">Minha conta</a>
           <button class="linklike" id="logoutBtn">Sair</button></div></details>`
      : `<button class="btn sm" id="loginBtn">Entrar</button>`;
    const lb = $("#loginBtn"); if (lb) lb.onclick = () => openAuth("login");
    const lo = $("#logoutBtn"); if (lo) lo.onclick = async () => { await sb.auth.signOut(); F.toast("Você saiu da conta"); location.hash = "#/cartas"; };
    el.querySelectorAll(".umenu-list a").forEach(a => a.addEventListener("click", () => el.querySelector("details").removeAttribute("open")));
  }

  // ---------- diálogo de login/cadastro ----------
  function openAuth(mode) {
    if (!On.enabled) return F.toast("Login ainda não configurado neste site.");
    let dlg = $("#authDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "authDlg"; dlg.className = "dlg"; document.body.appendChild(dlg);
      dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); }
    const T = { login: "Entrar", signup: "Criar conta", forgot: "Recuperar senha", newpass: "Nova senha" };
    const tabs = mode === "newpass" ? "" : `<div class="tabs" style="margin:6px 0 10px">${["login", "signup"].map(m => `<span class="chip${m === mode ? " on" : ""}" data-m="${m}">${T[m]}</span>`).join("")}</div>`;
    const f = {
      login: `<label>E-mail<input type="email" name="email" autocomplete="email" required></label>
              <label>Senha<input type="password" name="pw" autocomplete="current-password" required></label>
              <button class="btn primary" type="submit">Entrar</button>
              <button class="linklike" type="button" data-m="forgot">Esqueci a senha</button>`,
      signup: `<label>Apelido (aparece no ranking)<input name="user" maxlength="20" autocomplete="nickname" required placeholder="3 a 20 letras, números, _ . -"></label>
              <label>E-mail (não aparece para ninguém)<input type="email" name="email" autocomplete="email" required></label>
              <label>Senha<input type="password" name="pw" minlength="8" autocomplete="new-password" required placeholder="mínimo 8 caracteres"></label>
              <label>Repita a senha<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>
              <label class="chk"><input type="checkbox" name="ok" required> Li e aceito a <a href="#/sobre" target="_blank">política de privacidade</a> (apelido e cartas ficam públicos no ranking).</label>
              <button class="btn primary" type="submit">Criar conta</button>`,
      forgot: `<p class="small muted">Enviaremos um link para você criar uma nova senha.</p>
              <label>E-mail<input type="email" name="email" autocomplete="email" required></label>
              <button class="btn primary" type="submit">Enviar link</button>
              <button class="linklike" type="button" data-m="login">Voltar para entrar</button>`,
      newpass: `<label>Nova senha<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
              <label>Repita a nova senha<input type="password" name="pw2" minlength="8" autocomplete="new-password" required></label>
              <button class="btn primary" type="submit">Salvar nova senha</button>`,
    }[mode];
    dlg.innerHTML = `<div class="dlg-body"><div class="dlg-head"><h2 style="margin:0">${T[mode]}</h2><button class="close" aria-label="Fechar">×</button></div>
      ${tabs}<form class="authf" novalidate>${f}<p class="msg" role="alert"></p></form></div>`;
    dlg.querySelector(".close").onclick = () => dlg.close();
    dlg.querySelectorAll("[data-m]").forEach(b => b.onclick = () => openAuth(b.dataset.m));
    const form = dlg.querySelector("form"), msg = dlg.querySelector(".msg");
    const say = (t, ok) => { msg.textContent = t; msg.className = "msg" + (ok ? " ok" : " err"); };
    form.onsubmit = async ev => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(form)); const btn = form.querySelector("[type=submit]");
      if (!form.checkValidity()) { const bad = form.querySelector(":invalid"); say(bad && bad.name === "ok" ? "Marque o aceite da política de privacidade." : "Preencha todos os campos corretamente."); return; }
      if (v.pw2 !== undefined && v.pw !== v.pw2) return say("As senhas não são iguais.");
      btn.disabled = true; say("Aguarde…", true);
      try {
        const site = location.origin + location.pathname;
        if (mode === "login") {
          const { error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.pw });
          if (error) throw error; dlg.close();
        } else if (mode === "signup") {
          const user = v.user.trim();
          if (!USER_RE.test(user)) throw mine("Apelido inválido: use 3 a 20 letras, números, _ . ou -");
          const { data: free, error: e1 } = await sb.rpc("username_available", { name: user });
          if (e1) throw e1; if (!free) throw mine("Esse apelido já está em uso. Escolha outro.");
          const { data, error } = await sb.auth.signUp({ email: v.email.trim(), password: v.pw, options: { data: { username: user }, emailRedirectTo: site } });
          if (error) throw error;
          if (data.session) dlg.close();
          else form.innerHTML = `<p class="msg ok">Conta criada! Enviamos um e-mail para <b>${F.esc(v.email.trim())}</b>. Abra o link de confirmação e depois entre com seu e-mail e senha.</p>`;
        } else if (mode === "forgot") {
          const { error } = await sb.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: site });
          if (error) throw error;
          form.innerHTML = `<p class="msg ok">Se existir uma conta com esse e-mail, você vai receber o link em instantes. Confira também o spam.</p>`;
        } else if (mode === "newpass") {
          const { error } = await sb.auth.updateUser({ password: v.pw });
          if (error) throw error; dlg.close(); F.toast("Senha alterada!");
        }
      } catch (e) { say(e.mine ? e.message : tr(e)); }
      finally { if (btn.isConnected) btn.disabled = false; }
    };
    if (!dlg.open) dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", "");
    const first = form.querySelector("input"); if (first) first.focus();
  }

  // ---------- RANKING ----------
  const medal = p => p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : p;
  async function viewRanking() {
    const app = $("#app");
    app.innerHTML = `<section class="hero"><div><h1>Ranking de cartas dropadas</h1>
      <p class="muted">Pontuação = soma do ATK e do DEF de todas as cartas que o jogador marcou como dropadas. Ordem: maior ATK; empate → maior DEF; empate → quem chegou primeiro.</p></div>
      ${On.enabled ? (On.user ? `<a class="btn primary" href="#/colecao" style="text-decoration:none">Marcar minhas cartas</a>` : `<button class="btn primary" onclick="FMOnline.openAuth('signup')">Criar conta e participar</button>`) : ""}</section>
      <div id="rk" class="tbl-wrap"><div class="empty">${On.enabled ? "Carregando ranking…" : "O ranking online ainda não foi ativado neste site."}</div></div>`;
    if (!On.enabled) return;
    const { data, error } = await sb.rpc("leaderboard", { max_rows: 200 });
    if (F.route().name !== "ranking") return;
    if (error) { $("#rk").innerHTML = `<div class="empty">${F.esc(tr(error))}</div>`; return; }
    let mine = "";
    if (On.user && On.username && !data.some(r => r.username === On.username)) {
      const { data: me } = await sb.rpc("player_profile", { name: On.username });
      if (me && me[0]) data.push({ ...me[0], _me: true });
    }
    const top = data.length ? data[0].atk || 1 : 1;
    $("#rk").innerHTML = data.length ? `<table class="tbl rank-tbl"><thead><tr><th>#</th><th>Jogador</th><th class="r">Cartas</th><th class="r">Pontuação</th><th></th></tr></thead><tbody>
      ${data.map(r => `<tr class="${r.username === On.username ? "me" : ""}" data-player="${F.esc(r.username)}" style="cursor:pointer">
        <td class="pos">${medal(Number(r.pos))}</td>
        <td><b>${F.esc(r.username)}</b>${r.username === On.username ? ` <span class="rank">você</span>` : ""}</td>
        <td class="r">${fmt(r.cards)}<div class="small muted">de 722</div></td>
        <td class="r score"><span class="s-atk">ATK ${fmt(r.atk)}</span> / <span class="s-def">DEF ${fmt(r.def)}</span></td>
        <td style="min-width:90px"><div class="bar"><i style="width:${Math.max(3, r.atk / top * 100)}%"></i></div></td></tr>`).join("")}
      </tbody></table>` : `<div class="empty">Ninguém marcou cartas ainda. Seja o primeiro!</div>`;
    $("#rk").querySelectorAll("[data-player]").forEach(tr_ => tr_.onclick = () => location.hash = "#/jogador/" + encodeURIComponent(tr_.dataset.player));
  }

  // ---------- PERFIL DO JOGADOR (visual de "lista de cartas" do jogo) ----------
  async function viewPlayer(arg) {
    const name = decodeURIComponent(arg || "");
    const app = $("#app");
    app.innerHTML = `<a class="back" href="#/ranking">← Ranking</a><div id="pl"><div class="empty">Carregando…</div></div>`;
    if (!On.enabled) { $("#pl").innerHTML = `<div class="empty">Ranking online não ativado.</div>`; return; }
    const [{ data: prof, error: e1 }, { data: cards, error: e2 }] = await Promise.all([
      sb.rpc("player_profile", { name }), sb.rpc("player_cards", { name })]);
    if (F.route().name !== "jogador") return;
    if (e1 || e2) { $("#pl").innerHTML = `<div class="empty">${F.esc(tr(e1 || e2))}</div>`; return; }
    const ids = (cards || []).map(r => r.card_id).filter(id => F.CARD[id]);
    const p = (prof && prof[0]) || { username: name, pos: null, atk: 0, def: 0, cards: 0 };
    if (!ids.length && !(prof && prof[0])) { $("#pl").innerHTML = `<div class="empty">Jogador "${F.esc(name)}" não encontrado ou ainda sem cartas marcadas.</div>`; return; }
    let sort = "num", sel = ids[0];
    const draw = () => {
      const list = [...ids].sort(sort === "atk" ? (a, b) => (F.CARD[b].a || 0) - (F.CARD[a].a || 0) || a - b
        : sort === "def" ? (a, b) => (F.CARD[b].d || 0) - (F.CARD[a].d || 0) || a - b : (a, b) => a - b);
      const c = F.CARD[sel];
      $("#pl").innerHTML = `
      <div class="fmlib">
        <div class="fm-top"><span>CARTAS DE <b>${F.esc(p.username)}</b></span>
          <span>${p.pos ? `RANK #${p.pos} · ` : ""}${fmt(ids.length)}/722</span></div>
        <div class="fm-score">ATK ${fmt(p.atk)} / DEF ${fmt(p.def)}</div>
        <div class="fm-body">
          <div class="fm-view">${c ? `
            <img src="img/full/${c.id}.jpg" alt="${F.esc(c.n)}">
            <div class="fm-info"><div class="fm-no">No.${F.pad(c.id)}</div><div class="fm-name">${F.esc(c.n)}</div>
              ${c.c === "monster" ? `<div class="fm-stats">ATK ${c.a} / DEF ${c.d}</div>
              <div class="fm-sub">${F.esc(F.TYPE_PT[c.t] || c.t)} · Nv ${c.l} · ${c.g.map(g => F.STAR_PT[g] || g).join(" / ")}</div>`
              : `<div class="fm-stats">${F.esc(F.CAT_PT[c.c])}</div>`}
              <a class="fm-link" href="#/carta/${c.id}">Ver quem dropa ▸</a></div>` : `<div class="fm-empty">Nenhuma carta</div>`}</div>
          <div class="fm-list">
            <div class="fm-sort">${[["num", "No."], ["atk", "ATK"], ["def", "DEF"]].map(([k, l]) => `<button class="${sort === k ? "on" : ""}" data-s="${k}">${l}</button>`).join("")}</div>
            <div class="fm-grid">${list.map(id => `<button class="fm-cell${id === sel ? " sel" : ""}" data-id="${id}" title="${F.esc(F.CARD[id].n)}">
              <img src="${F.img(id)}" alt="" loading="lazy"><span>${F.pad(id)}</span></button>`).join("")}</div>
          </div>
        </div>
      </div>`;
      $("#pl").querySelectorAll("[data-id]").forEach(b => b.onclick = () => { sel = +b.dataset.id; draw(); if (innerWidth < 760) $(".fm-view").scrollIntoView({ behavior: "smooth" }); });
      $("#pl").querySelectorAll("[data-s]").forEach(b => b.onclick = () => { sort = b.dataset.s; draw(); });
    };
    draw();
  }

  // ---------- MINHA CONTA ----------
  function viewAccount() {
    const app = $("#app");
    if (!On.enabled) { app.innerHTML = `<div class="empty">Contas ainda não ativadas.</div>`; return; }
    if (!On.user) { app.innerHTML = `<section class="hero"><div><h1>Minha conta</h1><p class="muted">Você não está conectado.</p></div>
      <button class="btn primary" onclick="FMOnline.openAuth('login')">Entrar</button></section>`; return; }
    app.innerHTML = `<section class="hero"><div><h1>Minha conta</h1><p class="muted">Apelido: <b>${F.esc(On.username)}</b> · E-mail: ${F.esc(On.user.email || "")} (só você vê)</p></div></section>
      <div class="panel"><div class="row">
        <a class="btn" href="#/jogador/${encodeURIComponent(On.username)}" style="text-decoration:none">Ver meu perfil público</a>
        <button class="btn" id="chpw">Trocar senha</button>
        <button class="btn" id="delAcc" style="border-color:var(--bad);color:var(--bad)">Excluir minha conta</button></div>
        <p class="small muted">Excluir apaga seu login, apelido e cartas marcadas do servidor, para sempre. A coleção continua salva neste navegador.</p></div>`;
    $("#chpw").onclick = () => openAuth("newpass");
    $("#delAcc").onclick = async () => {
      const t = prompt(`Isto apaga sua conta e sai do ranking para sempre.\nDigite seu apelido (${On.username}) para confirmar:`);
      if (t !== On.username) return t !== null && F.toast("Apelido não confere; nada foi apagado.");
      const { error } = await sb.rpc("delete_my_account");
      if (error) return F.toast(tr(error));
      await sb.auth.signOut(); F.toast("Conta excluída."); location.hash = "#/cartas";
    };
  }
})();
