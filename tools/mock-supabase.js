/* Supabase SIMULADO — só para testar o site localmente (dev-mock.html). Não é usado em produção. */
(function () {
  const K = "mocksb:db";
  let db; try { db = JSON.parse(localStorage.getItem(K)); } catch { db = null; }
  if (!db) {
    db = { users: [], profiles: [], user_cards: [], session: null, seq: 1 };
    const seed = [["Kaiba_Fan", [1, 380, 374, 364, 22, 35, 82, 707]], ["YugiBR", [35, 22, 1, 2, 3, 4]], ["Joey99", [82, 4, 5]]];
    seed.forEach(([u, cards], i) => {
      const id = "u" + db.seq++; db.users.push({ id, email: u.toLowerCase() + "@x.test", pw: "senha123", confirmed: true, user_metadata: { username: u } });
      db.profiles.push({ id, username: u, created_at: 1000 + i });
      cards.forEach((c, j) => db.user_cards.push({ user_id: id, card_id: c, created_at: 2000 + i * 10 + j }));
    });
  }
  const save = () => localStorage.setItem(K, JSON.stringify(db));
  let STATS = null;
  const stats = async () => STATS || (STATS = await fetch("data/fm-data.json").then(r => r.json()).then(j => Object.fromEntries(j.cards.map(c => [c.id, [c.a || 0, c.d || 0]]))));
  const listeners = [];
  const emit = (ev, s) => listeners.forEach(f => f(ev, s));
  const sess = u => u ? { user: { id: u.id, email: u.email, user_metadata: u.user_metadata } } : null;
  const delay = v => new Promise(r => setTimeout(() => r(v), 120));

  function builder(table) {
    let rows = () => db[table], filt = [], op = "select", single = false, payload = null;
    const b = {
      select() { op = "select"; return b; },
      eq(c, v) { filt.push(r => r[c] === v); return b; },
      in(c, vs) { filt.push(r => vs.includes(r[c])); return b; },
      maybeSingle() { single = true; return b; },
      upsert(p) { op = "upsert"; payload = [].concat(p); return b; },
      delete() { op = "delete"; return b; },
      then(res, rej) { return run().then(res, rej); },
    };
    async function run() {
      const uid = db.session;
      if (op === "upsert") {
        for (const r of payload) {
          if (r.user_id !== uid) return delay({ error: { message: "new row violates row-level security policy" } });
          if (!db.user_cards.some(x => x.user_id === r.user_id && x.card_id === r.card_id)) db.user_cards.push({ ...r, created_at: Date.now() });
        }
        save(); return delay({ data: null, error: null });
      }
      if (op === "delete") {
        const keep = db[table].filter(r => !(filt.every(f => f(r)) && r.user_id === uid));
        db[table] = keep; save(); return delay({ data: null, error: null });
      }
      const out = rows().filter(r => filt.every(f => f(r)));
      return delay({ data: single ? (out[0] || null) : out, error: null });
    }
    return b;
  }

  async function board() {
    const S = await stats();
    const r = db.profiles.map(p => {
      const cs = db.user_cards.filter(c => c.user_id === p.id);
      return { username: p.username, atk: cs.reduce((s, c) => s + S[c.card_id][0], 0), def: cs.reduce((s, c) => s + S[c.card_id][1], 0),
        cards: cs.length, last: Math.max(0, ...cs.map(c => c.created_at)), created: p.created_at };
    }).filter(x => x.cards > 0).sort((a, b) => b.atk - a.atk || b.def - a.def || a.last - b.last || a.created - b.created);
    return r.map((x, i) => ({ pos: i + 1, username: x.username, atk: x.atk, def: x.def, cards: x.cards }));
  }

  window.supabase = {
    createClient() {
      setTimeout(() => emit("INITIAL_SESSION", sess(db.users.find(u => u.id === db.session))), 50);
      return {
        auth: {
          onAuthStateChange(f) { listeners.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
          async signInWithPassword({ email, password }) {
            const u = db.users.find(x => x.email === email.toLowerCase());
            if (!u || u.pw !== password) return delay({ error: { message: "Invalid login credentials" } });
            db.session = u.id; save(); emit("SIGNED_IN", sess(u)); return delay({ data: sess(u), error: null });
          },
          async signUp({ email, password, options }) {
            if (db.users.some(x => x.email === email.toLowerCase())) return delay({ error: { message: "User already registered" } });
            if (password.length < 8) return delay({ error: { message: "Password should be at least 8 characters" } });
            const id = "u" + db.seq++, un = options.data.username;
            if (db.profiles.some(p => p.username.toLowerCase() === un.toLowerCase())) return delay({ error: { message: "Database error saving new user" } });
            db.users.push({ id, email: email.toLowerCase(), pw: password, user_metadata: { username: un } });
            db.profiles.push({ id, username: un, created_at: Date.now() }); save();
            return delay({ data: { session: null, user: { id } }, error: null });   // exige confirmar e-mail, como o padrão do Supabase
          },
          async signOut() { db.session = null; save(); emit("SIGNED_OUT", null); return delay({ error: null }); },
          async resetPasswordForEmail() { return delay({ error: null }); },
          async updateUser({ password }) { const u = db.users.find(x => x.id === db.session); if (!u) return delay({ error: { message: "not authenticated" } }); u.pw = password; save(); return delay({ error: null }); },
        },
        from: builder,
        async rpc(name, a) {
          if (name === "username_available") return delay({ data: !db.profiles.some(p => p.username.toLowerCase() === a.name.toLowerCase()), error: null });
          if (name === "leaderboard") return delay({ data: (await board()).slice(0, a.max_rows), error: null });
          if (name === "player_profile") return delay({ data: (await board()).filter(r => r.username.toLowerCase() === a.name.toLowerCase()), error: null });
          if (name === "player_cards") { const p = db.profiles.find(x => x.username.toLowerCase() === a.name.toLowerCase());
            return delay({ data: p ? db.user_cards.filter(c => c.user_id === p.id).map(c => ({ card_id: c.card_id })).sort((x, y) => x.card_id - y.card_id) : [], error: null }); }
          if (name === "delete_my_account") { const id = db.session; db.users = db.users.filter(u => u.id !== id); db.profiles = db.profiles.filter(p => p.id !== id);
            db.user_cards = db.user_cards.filter(c => c.user_id !== id); save(); return delay({ error: null }); }
          return delay({ error: { message: "rpc desconhecida " + name } });
        },
      };
    },
  };
  // utilitário de teste: confirma o e-mail de todos os usuários simulados
  window.__mockConfirmAll = () => { db.users.forEach(u => u.confirmed = true); save(); };
})();
