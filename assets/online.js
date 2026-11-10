/* FMDrops Yugioh — contas, sincronização da coleção e ranking (Supabase).
 * Sem configuração em assets/config.js (supabase.url / anonKey), o site funciona só no modo offline. */
(function () {
  "use strict";
  const CFG = (window.SITE_CONFIG || {}).supabase || {};
  const USER_RE = /^[A-Za-z0-9_.-]{3,20}$/;
  const POLICY_VERSION = "2026-11-09";   // mesma versão de assets/app.js (Política de Privacidade)
  const $ = (s, el = document) => el.querySelector(s);
  const fmt = n => Number(n || 0).toLocaleString("pt-BR");
  let sb = null, F = null;   // cliente Supabase, API do app (window.FMD)

  const ERR = [
    [/invalid login credentials/i, "E-mail ou senha incorretos."],
    [/email not confirmed/i, "Confirme seu e-mail: abra o link que enviamos e depois entre."],
    [/user already registered|already been registered/i, "Não foi possível criar a conta com esse e-mail. Se ela já existe, use \"Entrar\" ou \"Esqueci a senha\"."],
    [/password should|weak password|password is known|pwned/i, "Senha fraca ou muito comum: use pelo menos 8 caracteres, com letras e números."],
    [/same_password|should be different/i, "A nova senha precisa ser diferente da atual."],
    [/expired|invalid.*(token|link)|otp/i, "O link expirou ou já foi usado. Peça outro."],
    [/rate limit|too many/i, "Muitas tentativas. Aguarde alguns minutos e tente de novo."],
    [/database error saving new user|duplicate key|profiles_username|invalid username|reserved username/i, "Esse apelido já está em uso ou não é permitido. Escolha outro."],
    [/network|fetch/i, "Sem conexão com o servidor. Verifique sua internet."],
  ];
  const mine = m => Object.assign(new Error(m), { mine: true });
  const tr = e => { const m = (e && (e.message || e.error_description || e)) + ""; const f = ERR.find(([r]) => r.test(m)); return f ? f[1] : "Não foi possível concluir agora. Tente novamente em instantes."; };

  const On = window.FMOnline = {
    enabled: !!(CFG.url && CFG.anonKey && window.supabase),
    user: null, username: null,

    init() {
      F = window.FMD;
      Object.assign(F.EXTRA_VIEWS, { ranking: viewRanking, jogador: viewPlayer, conta: viewAccount,
        entrar: () => viewAuth("login"), cadastro: () => viewAuth("signup"), recuperar: () => viewAuth("forgot"), "nova-senha": () => viewAuth("newpass") });
      drawHeader();
      if (!On.enabled) return;
      sb = window.supabase.createClient(CFG.url, CFG.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") { recovering = true; cleanHash(); location.hash = "#/nova-senha"; }
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
    if (was === On.user.id && (event !== "SIGNED_IN" || quiet)) { drawHeader(); return; }
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
      if (event === "SIGNED_IN" && !recovering) { F.toast(`Bem-vindo, ${On.username}!`); if (["entrar", "cadastro"].includes(F.route().name)) goNext(); }
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

  // ---------- limite de tentativas (no navegador; o limite real fica no servidor do Supabase) ----------
  const RL = {
    get(k) { try { return JSON.parse(localStorage.getItem("fmd:rl:" + k)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } },
    put(k, v) { try { localStorage.setItem("fmd:rl:" + k, JSON.stringify(v)); } catch { /* */ } },
    wait(k) { return Math.max(0, Math.ceil((RL.get(k).until - Date.now()) / 1000)); },
    fail(k, free, base) { const v = RL.get(k); v.n++; if (v.n >= free) v.until = Date.now() + Math.min(900, base * 2 ** (v.n - free)) * 1000; RL.put(k, v); },
    hold(k, secs) { const v = RL.get(k); v.until = Date.now() + secs * 1000; RL.put(k, v); },
    clear(k) { try { localStorage.removeItem("fmd:rl:" + k); } catch { /* */ } },
  };
  const human = s => s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;

  // ---------- validação (o servidor valida de novo: apelido no banco, senha no Supabase Auth) ----------
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
  function checkPassword(pw, ctx = {}) {
    if (pw.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (pw.length > 72) return "A senha pode ter no máximo 72 caracteres.";
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
    const low = pw.toLowerCase();
    if (ctx.user && low.includes(ctx.user.toLowerCase())) return "A senha não pode conter o seu apelido.";
    const local = (ctx.email || "").split("@")[0].toLowerCase();
    if (local.length >= 4 && low.includes(local)) return "A senha não pode conter o seu e-mail.";
    if (/^(.)\1+$/.test(pw) || /^(12345678|123456789|abcd1234|senha123|password1|qwerty12)/i.test(pw)) return "Senha muito fácil de adivinhar.";
    return "";
  }
  function strength(pw) {
    let s = 0; if (pw.length >= 8) s++; if (pw.length >= 12) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(4, s);
  }

  // ---------- TELA DE LOGIN / CADASTRO / RECUPERAÇÃO (páginas próprias) ----------
  const AUTH_ROUTE = { login: "entrar", signup: "cadastro", forgot: "recuperar", newpass: "nova-senha" };
  let recovering = false, quiet = false;   // quiet: reautenticação ao trocar senha (não recarrega a tela)   // true quando o usuário chegou pelo link "esqueci a senha"
  function openAuth(mode) {
    if (!On.enabled) return F.toast("Login ainda não configurado neste site.");
    const cur = F.route().name;
    if (!Object.values(AUTH_ROUTE).includes(cur)) { try { sessionStorage.setItem("fmd:next", location.hash || "#/colecao"); } catch { /* */ } }
    location.hash = "#/" + AUTH_ROUTE[mode];
  }
  function goNext() {
    let n = "#/colecao"; try { n = sessionStorage.getItem("fmd:next") || n; sessionStorage.removeItem("fmd:next"); } catch { /* */ }
    if (!/^#\/[a-z-]+(\/[^/]*)?$/.test(n) || Object.values(AUTH_ROUTE).some(r => n.startsWith("#/" + r))) n = "#/colecao";
    location.hash = n;
  }

  const pwField = (name, label, ac, extra = "") => `<label>${label}<span class="pw-wrap">
      <input type="password" name="${name}" autocomplete="${ac}" maxlength="72" required ${extra}>
      <button type="button" class="pw-eye" aria-label="Mostrar senha" title="Mostrar senha">👁</button></span></label>`;

  function viewAuth(mode) {
    const app = $("#app");
    if (!On.enabled) { app.innerHTML = `<div class="empty">Contas ainda não ativadas neste site.</div>`; return; }
    if (On.user && mode !== "newpass") { goNext(); return; }
    if (mode === "newpass" && !On.user && recovering) { app.innerHTML = authShell("newpass", `<p class="muted">Validando o link…</p>`); return; }
    if (mode === "newpass" && !On.user) {
      app.innerHTML = authShell("newpass", `<p class="msg err">O link para criar uma nova senha expirou ou já foi usado. Peça outro.</p>
        <a class="btn primary" href="#/recuperar">Pedir novo link</a>`); return;
    }
    const T = {
      login: ["Entrar", "Acesse sua conta para salvar a coleção e aparecer no ranking."],
      signup: ["Criar conta", "Grátis. Só o apelido aparece para os outros jogadores."],
      forgot: ["Recuperar senha", "Enviaremos um link para você criar uma nova senha."],
      newpass: [recovering ? "Criar nova senha" : "Trocar senha", recovering ? "Escolha a nova senha da sua conta." : "Confirme a senha atual e escolha a nova."],
    };
    const body = {
      login: `<label>E-mail<input type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" required autofocus></label>
        ${pwField("pw", "Senha", "current-password")}
        <button class="btn primary big-btn" type="submit">Entrar</button>
        <div class="auth-links"><a href="#/recuperar">Esqueci a senha</a><a href="#/cadastro">Não tenho conta</a></div>`,
      signup: `<label>Apelido <span class="hint">aparece no ranking · 3 a 20: letras, números, _ . -</span>
          <input name="user" maxlength="20" autocomplete="nickname" required autofocus></label>
        <label>E-mail <span class="hint">não aparece para ninguém</span><input type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" required></label>
        ${pwField("pw", 'Senha <span class="hint">8+ caracteres, com letras e números</span>', "new-password")}
        <div class="pw-meter" aria-hidden="true"><i></i></div>
        ${pwField("pw2", "Repita a senha", "new-password")}
        <label class="chk"><input type="checkbox" name="ok" required> <span>Li a <a href="#/privacidade" target="_blank" rel="noopener">Política de Privacidade</a> e concordo que meu <b>apelido</b>, minhas <b>cartas marcadas</b> e minha <b>pontuação</b> fiquem públicos no ranking.</span></label>
        <label class="chk"><input type="checkbox" name="age" required> <span>Tenho 18 anos ou mais, ou tenho autorização da minha mãe, pai ou responsável.</span></label>
        <button class="btn primary big-btn" type="submit">Criar conta</button>
        <div class="auth-links"><a href="#/entrar">Já tenho conta</a></div>`,
      forgot: `<label>E-mail da conta<input type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" required autofocus></label>
        <button class="btn primary big-btn" type="submit">Enviar link</button>
        <div class="auth-links"><a href="#/entrar">Voltar para entrar</a></div>`,
      newpass: `${recovering ? "" : pwField("cur", "Senha atual", "current-password")}
        ${pwField("pw", 'Nova senha <span class="hint">8+ caracteres, com letras e números</span>', "new-password")}
        <div class="pw-meter" aria-hidden="true"><i></i></div>
        ${pwField("pw2", "Repita a nova senha", "new-password")}
        <button class="btn primary big-btn" type="submit">Salvar nova senha</button>
        ${recovering ? "" : `<div class="auth-links"><a href="#/conta">Cancelar</a></div>`}`,
    }[mode];
    app.innerHTML = authShell(mode, `<h1>${T[mode][0]}</h1><p class="muted">${T[mode][1]}</p>
      <form class="authf" novalidate>${body}<p class="msg" role="alert" aria-live="assertive"></p></form>`);
    const form = $(".authf"), msg = $(".authf .msg");
    const say = (t, ok) => { msg.textContent = t; msg.className = "msg" + (ok ? " ok" : " err"); };
    form.querySelectorAll(".pw-eye").forEach(b => b.onclick = () => {
      const i = b.previousElementSibling, show = i.type === "password";
      i.type = show ? "text" : "password"; b.setAttribute("aria-label", show ? "Esconder senha" : "Mostrar senha"); b.classList.toggle("on", show);
    });
    const meter = form.querySelector(".pw-meter i");
    if (meter) form.pw.addEventListener("input", () => { const s = strength(form.pw.value); meter.style.width = (s / 4 * 100) + "%"; meter.dataset.s = s; });

    const RLK = { login: "login", signup: "signup", forgot: "forgot", newpass: "newpass" }[mode];
    form.onsubmit = async ev => {
      ev.preventDefault();
      const btn = form.querySelector("[type=submit]");
      if (btn.disabled) return;
      const w = RL.wait(RLK);
      if (w) return say(`Muitas tentativas. Aguarde ${human(w)} e tente de novo.`);
      const v = {}; new FormData(form).forEach((val, key) => { v[key] = typeof val === "string" ? val : ""; });
      const email = (v.email || "").trim().toLowerCase(), user = (v.user || "").trim();
      // validação no navegador (rápida); o servidor valida tudo de novo
      if ("email" in v && !EMAIL_RE.test(email)) return say("Digite um e-mail válido.");
      if (mode === "login" && !v.pw) return say("Digite a sua senha.");
      if (mode === "signup") {
        if (!USER_RE.test(user)) return say("Apelido inválido: use 3 a 20 letras, números, _ . ou -");
        const p = checkPassword(v.pw, { user, email }); if (p) return say(p);
        if (v.pw !== v.pw2) return say("As senhas não são iguais.");
        if (!form.ok.checked) return say("Para criar conta, é preciso concordar com a Política de Privacidade.");
        if (!form.age.checked) return say("Confirme a idade ou a autorização do responsável.");
      }
      if (mode === "newpass") {
        if (!recovering && !v.cur) return say("Digite a senha atual.");
        const p = checkPassword(v.pw, { user: On.username, email: On.user && On.user.email }); if (p) return say(p);
        if (v.pw !== v.pw2) return say("As senhas não são iguais.");
        if (!recovering && v.cur === v.pw) return say("A nova senha precisa ser diferente da atual.");
      }
      btn.disabled = true; say("Aguarde…", true);
      try {
        const site = location.origin + location.pathname;
        if (mode === "login") {
          const { error } = await sb.auth.signInWithPassword({ email, password: v.pw });
          if (error) { if (/invalid login/i.test(error.message || "")) RL.fail(RLK, 5, 30); throw error; }
          RL.clear(RLK);   // o redirecionamento acontece em handleSession
        } else if (mode === "signup") {
          RL.hold(RLK, 60);
          const { data: free, error: e1 } = await sb.rpc("username_available", { name: user });
          if (e1) throw e1; if (!free) throw mine("Esse apelido já está em uso ou não é permitido. Escolha outro.");
          const { data, error } = await sb.auth.signUp({ email, password: v.pw, options: { data: { username: user, privacy_version: POLICY_VERSION, privacy_accepted_at: new Date().toISOString(), age_confirmed: true }, emailRedirectTo: site } });
          if (error) throw error;
          if (!data.session) form.innerHTML = `<p class="msg ok">Quase lá! Se o e-mail <b>${F.esc(email)}</b> ainda não tiver conta, você vai receber um link de confirmação. Abra o link e depois entre com seu e-mail e senha. Confira também o spam.</p>
            <a class="btn primary big-btn" href="#/entrar">Ir para Entrar</a>`;
        } else if (mode === "forgot") {
          RL.hold(RLK, 60);
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: site });
          if (error) throw error;
          form.innerHTML = `<p class="msg ok">Se existir uma conta com esse e-mail, o link chega em instantes. Confira também o spam.</p>
            <a class="btn big-btn" href="#/entrar">Voltar para entrar</a>`;
        } else if (mode === "newpass") {
          if (!recovering) {
            quiet = true;
            const { error: e0 } = await sb.auth.signInWithPassword({ email: On.user.email, password: v.cur }).finally(() => setTimeout(() => { quiet = false; }, 500));
            if (e0) { RL.fail(RLK, 5, 30); throw mine("Senha atual incorreta."); }
          }
          const { error } = await sb.auth.updateUser({ password: v.pw });
          if (error) throw error;
          RL.clear(RLK); recovering = false; F.toast("Senha alterada!"); location.hash = "#/conta";
        }
      } catch (e) {
        if (/rate limit|too many|429/i.test((e && e.message) || "")) RL.hold(RLK, 120);
        say(e.mine ? e.message : tr(e));
      } finally { if (btn.isConnected) btn.disabled = false; }
    };
  }
  function authShell(mode, inner) {
    const tabs = mode === "login" || mode === "signup"
      ? `<nav class="auth-tabs"><a href="#/entrar" class="${mode === "login" ? "on" : ""}">Entrar</a><a href="#/cadastro" class="${mode === "signup" ? "on" : ""}">Criar conta</a></nav>` : "";
    return `<section class="auth-page"><div class="auth-card">
      <div class="auth-brand"><img src="img/cards/1.jpg" alt=""><span>FMDrops <b>Yugioh</b></span></div>
      ${tabs}${inner}
      <p class="auth-foot">🔒 Conexão segura (HTTPS). A senha vai direto para o servidor de login (Supabase), protegida por criptografia — este site nunca a vê guardada.</p>
    </div></section>`;
  }

  // ---------- RANKING ----------
  const medal = p => p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : p;
  async function viewRanking() {
    const app = $("#app");
    app.innerHTML = `<section class="hero"><div><h1>Ranking de cartas dropadas</h1>
      <p class="muted">Pontuação = soma do ATK e do DEF de todas as cartas que o jogador marcou como dropadas. Ordem: maior ATK; empate → maior DEF; empate → quem chegou primeiro.</p></div>
      ${On.enabled ? (On.user ? `<a class="btn primary" href="#/colecao" style="text-decoration:none">Marcar minhas cartas</a>` : `<a class="btn primary" href="#/cadastro" style="text-decoration:none">Criar conta e participar</a>`) : ""}</section>
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
    let name = ""; try { name = decodeURIComponent(arg || "").slice(0, 20); } catch { name = ""; }
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
      <a class="btn primary" href="#/entrar" style="text-decoration:none">Entrar</a></section>`; return; }
    app.innerHTML = `<section class="hero"><div><h1>Minha conta</h1><p class="muted">Apelido: <b>${F.esc(On.username)}</b> · E-mail: ${F.esc(On.user.email || "")} (só você vê)</p></div></section>
      <div class="panel"><div class="row">
        <a class="btn" href="#/jogador/${encodeURIComponent(On.username)}" style="text-decoration:none">Ver meu perfil público</a>
        <button class="btn" id="chpw" type="button">Trocar senha</button></div></div>
      <div class="panel"><h2 style="margin-top:0">Corrigir apelido</h2>
        <form id="unForm" class="authf" novalidate><label>Novo apelido <span class="hint">3 a 20: letras, números, _ . -</span>
          <input name="user" maxlength="20" autocomplete="nickname" required value="${F.esc(On.username)}"></label>
          <button class="btn" type="submit">Salvar apelido</button><p class="msg" role="alert" aria-live="assertive"></p></form></div>
      <div class="panel"><h2 style="margin-top:0">Meus dados (LGPD)</h2>
        <p class="small muted">Baixe uma cópia de tudo o que o site guarda sobre você: e-mail, apelido, datas, aceite da política e cartas marcadas.</p>
        <div class="row"><button class="btn" id="expData" type="button">Baixar meus dados</button>
        <button class="btn" id="delAcc" type="button" style="border-color:var(--bad);color:var(--bad)">Excluir minha conta</button></div>
        <p class="small muted">Excluir apaga para sempre seu login, e-mail, apelido e cartas marcadas do servidor, e você sai do ranking. A coleção continua salva neste navegador.
        Veja a <a href="#/privacidade">Política de Privacidade</a>.</p></div>`;
    $("#chpw").onclick = () => { recovering = false; location.hash = "#/nova-senha"; };
    const unf = $("#unForm"), unmsg = unf.querySelector(".msg");
    unf.onsubmit = async ev => {
      ev.preventDefault();
      const btn = unf.querySelector("[type=submit]"); if (btn.disabled) return;
      const u = unf.user.value.trim();
      const say = (t, ok) => { unmsg.textContent = t; unmsg.className = "msg" + (ok ? " ok" : " err"); };
      if (u === On.username) return say("Esse já é o seu apelido.");
      if (!USER_RE.test(u)) return say("Apelido inválido: use 3 a 20 letras, números, _ . ou -");
      const w = RL.wait("rename"); if (w) return say(`Aguarde ${human(w)} para trocar de novo.`);
      btn.disabled = true;
      try {
        const { error } = await sb.rpc("change_username", { new_name: u });
        if (error) throw /taken|invalid/i.test(error.message || "") ? mine("Esse apelido já está em uso ou não é permitido. Escolha outro.") : error;
        RL.hold("rename", 30); On.username = u; drawHeader(); F.toast("Apelido atualizado"); viewAccount();
      } catch (e) { say(e.mine ? e.message : tr(e)); } finally { if (btn.isConnected) btn.disabled = false; }
    };
    $("#expData").onclick = async () => {
      try {
        const [{ data: prof, error: e1 }, { data: cards, error: e2 }] = await Promise.all([
          sb.from("profiles").select("username, created_at").eq("id", On.user.id).maybeSingle(),
          sb.from("user_cards").select("card_id, created_at").eq("user_id", On.user.id).order("card_id")]);
        if (e1 || e2) throw e1 || e2;
        const m = On.user.user_metadata || {};
        const out = {
          gerado_em: new Date().toISOString(), site: location.origin + location.pathname,
          conta: { email: On.user.email, criada_em: On.user.created_at, email_confirmado_em: On.user.email_confirmed_at || null, ultimo_login: On.user.last_sign_in_at || null },
          perfil_publico: prof, aceite_politica: { versao: m.privacy_version || null, em: m.privacy_accepted_at || null, idade_confirmada: !!m.age_confirmed },
          cartas_marcadas: (cards || []).map(c => ({ numero: c.card_id, nome: F.CARD[c.card_id] ? F.CARD[c.card_id].n : null, marcada_em: c.created_at })),
          observacao: "A senha não é incluída: o site não tem acesso a ela (é guardada só como código criptografado).",
        };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
        a.download = "fmdrops-meus-dados.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      } catch (e) { F.toast(tr(e)); }
    };
    $("#delAcc").onclick = async () => {
      const t = prompt(`Isto apaga sua conta e sai do ranking para sempre.
Digite seu apelido (${On.username}) para confirmar:`);
      if (t !== On.username) return t !== null && F.toast("Apelido não confere; nada foi apagado.");
      const { error } = await sb.rpc("delete_my_account");
      if (error) return F.toast(tr(error));
      await sb.auth.signOut(); F.toast("Conta excluída."); location.hash = "#/cartas";
    };
  }
})();
