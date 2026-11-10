'use strict';
/* Kim Daha? — çok oyunculu oyun motoru
   Oyunu odayı açan telefon (yönetici) yönetir. Herkes ücretsiz, herkese açık bir MQTT sunucusu üzerinden konuşur:
     <NS><ODA>/s   oyunun son hali (yönetici yazar, "retained")
     <NS><ODA>/i   oyunculardan yöneticiye: katıl, karakter, kart, oy, ping
     <NS><ODA>/fx  anlık efektler (kimin kime baktığı) — doğrudan herkese */

CATEGORIES.genel = { e: '🎯', ad: 'Sizin kartınız', tepki: 'Masanın seçilmişi', ses: () => play('jingles_STEEL01', { vol: .28 }) };

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://test.mosquitto.org:8081'];
const NS = 'kimdaha-egc/v2/';
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ';
const STALE_MS = 6 * 3600e3;
const MAXP = 12;
const app = $('#app');

/* ---------- küçük yardımcılar ---------- */
const rid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const loadJ = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const saveJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const dropK = k => { try { localStorage.removeItem(k); } catch {} };
const normCode = s => String(s || '').toLocaleUpperCase('tr').replace(/İ/g, 'I').replace(/[^A-Z]/g, '').slice(0, 4);
const shuffleArr = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CHECK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms); }
const roomLink = () => location.origin + location.pathname + '?oda=' + room;

/* ---------- kimlik (bu cihazda saklanır) ---------- */
function cleanChar(c) {
  c = c || {};
  return {
    skin: SKINS.includes(c.skin) ? c.skin : SKINS[0],
    hair: HAIRS[c.hair] ? c.hair : 'none',
    hairColor: HAIR_COLORS.includes(c.hairColor) ? c.hairColor : HAIR_COLORS[0],
    eyes: EYES[c.eyes] ? c.eyes : 'normal',
    mouth: MOUTHS[c.mouth] ? c.mouth : 'smile',
    acc: ACCS[c.acc] ? c.acc : 'none',
  };
}
const ME = loadJ('kd2_me') || { id: rid(12), n: '', c: null };
if (!ME.c) ME.c = randomChar();
ME.c = cleanChar(ME.c);
const saveMe = () => saveJ('kd2_me', ME);
saveMe();
// Oynanan paketler (yöneticinin cihazında). Paket ancak en az 3 sorusunun sonucu açılınca "oynandı" sayılır.
// Eski anahtar ("Başla"ya basınca işaretleyen sürüm) bilerek okunmuyor: deneme amaçlı işaretler silinmiş olur.
const PLAYED_KEY = 'kd2_oynanan';
let played = loadJ(PLAYED_KEY) || [];
const savePlayed = () => saveJ(PLAYED_KEY, played);
const firstUnplayed = () => { const i = PAKETLER.findIndex((_, k) => !played.includes(k)); return i < 0 ? 0 : i; };

/* ---------- bağlantı ---------- */
let client = null, brokerUrl = null, room = null, role = null; // role: 'host' | 'player'
let S = null, H = null;  // S: herkesin gördüğü durum · H: sadece yöneticide (oylar, deste, yazılan kartlar)
let clockOff = 0, lastStateAt = 0, wasIn = false, timers = [];
const T = (code, k) => NS + code + '/' + k;
function setNet(ok) { $('#net').className = 'netdot' + (ok === true ? ' ok' : ok === false ? ' bad' : ''); }
function connect(url, ms = 6000) {
  return new Promise((res, rej) => {
    const c = mqtt.connect(url, { clientId: 'kd_' + rid(10), clean: true, connectTimeout: ms, reconnectPeriod: 2000, keepalive: 20 });
    let done = false;
    c.once('connect', () => { done = true; res(c); });
    setTimeout(() => { if (!done) { c.end(true); rej(new Error('timeout')); } }, ms + 300);
  });
}
async function connectAny() { for (const url of BROKERS) { try { return [await connect(url), url]; } catch {} } throw new Error('Sunucuya bağlanılamadı'); }
function peekRoom(c, code, ms = 3500) {
  return new Promise(res => {
    const topic = T(code, 's'); let done = false;
    const fin = st => { if (done) return; done = true; c.removeListener('message', onMsg); c.unsubscribe(topic); res(st); };
    const onMsg = (t, m) => { if (t !== topic) return; let st = null; try { st = JSON.parse(m.toString()); } catch {} fin(st); };
    c.on('message', onMsg); c.subscribe(topic, { qos: 1 }); setTimeout(() => fin(null), ms);
  });
}
const alive = st => st && st.v === 2 && st.phase !== 'closed' && Date.now() - st.ts < STALE_MS;
function wire(c) {
  c.on('connect', () => setNet(true)); c.on('reconnect', () => setNet(null));
  c.on('offline', () => setNet(false)); c.on('close', () => setNet(false));
  c.on('message', onMessage);
}
function onMessage(topic, buf) {
  if (!room) return;
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  if (topic === T(room, 's') && role === 'player') {
    if (!m || m.v !== 2 || (S && m.ts < S.ts)) return;
    clockOff = Date.now() - m.ts; lastStateAt = Date.now(); S = m; afterState();
  } else if (topic === T(room, 'i') && role === 'host') hostInput(m);
  else if (topic === T(room, 'fx') && m && m.pid !== ME.id) onFx(m);
}
function send(msg) { msg.pid = ME.id; if (role === 'host') return hostInput(msg); client && client.publish(T(room, 'i'), JSON.stringify(msg), { qos: 1 }); }
function fxSend(msg) { msg.pid = ME.id; client && client.publish(T(room, 'fx'), JSON.stringify(msg), { qos: 0 }); }
const setUrl = code => history.replaceState(null, '', code ? '?oda=' + code : location.pathname);

/* ---------- oda aç / katıl / çık ---------- */
async function createRoom() {
  showLoading('Oda açılıyor…');
  try {
    const [c, url] = await connectAny();
    let code;
    for (let i = 0; i < 6; i++) { code = Array.from({ length: 4 }, () => pick(CODE_CHARS)).join(''); if (!alive(await peekRoom(c, code, 900))) break; }
    client = c; brokerUrl = url; room = code; role = 'host'; wire(c); setNet(true);
    c.subscribe(T(code, 'i'), { qos: 1 }); c.subscribe(T(code, 'fx'), { qos: 0 });
    S = {
      v: 2, room: code, host: ME.id, phase: 'lobby', players: {}, order: [],
      set: { time: 20, mode: 'hazir', pack: firstUnplayed(), spicy: false, rounds: 20, anim: fast ? 'hizli' : 'tam', anon: true },
      r: 0, total: 0, deckLeft: 0, wr: 0, written: [], prep: 'deck', q: null, dl: null, voted: [], rv: null, titles: {}, ts: Date.now(),
    };
    H = { votes: {}, deck: [], cards: {}, seen: {} };
    addPlayer(ME.id, ME.n, ME.c);
    startHostLoop(); publish(true); setUrl(code); afterState();
  } catch { showHome(); toast('Bağlanamadım, internetini kontrol et 😕'); }
}
async function resumeHost(saved) {
  showLoading('Odana dönülüyor…');
  const c = await connect(saved.url).catch(() => null);
  if (!c) { dropK('kd2_host'); showHome(); return toast('Oda açılamadı, yenisini aç'); }
  client = c; brokerUrl = saved.url; room = saved.room; role = 'host'; wire(c); setNet(true);
  S = saved.S; H = saved.H; H.seen = H.seen || {};
  c.subscribe(T(room, 'i'), { qos: 1 }); c.subscribe(T(room, 'fx'), { qos: 0 });
  startHostLoop(); publish(true); setUrl(room); afterState();
}
async function joinRoom(code) {
  code = normCode(code);
  if (code.length !== 4) return toast('Oda kodu 4 harf');
  const saved = loadJ('kd2_host');
  if (saved && saved.room === code && saved.S && saved.S.host === ME.id && saved.S.phase !== 'closed') return resumeHost(saved);
  showLoading('Oda aranıyor…');
  const tries = BROKERS.map(async url => {
    const c = await connect(url, 5000).catch(() => null); if (!c) return null;
    const st = await peekRoom(c, code, 3500);
    if (alive(st)) return { c, url, st };
    c.end(true); return null;
  });
  let found = null;
  await new Promise(res => { let left = tries.length; tries.forEach(p => p.then(r => { if (r && !found) { found = r; res(); } else if (r) r.c.end(true); if (--left === 0) res(); })); });
  if (!found) { setUrl(''); showHome(code); return toast('Böyle bir oda yok 🤔 Kodu kontrol et'); }
  client = found.c; brokerUrl = found.url; room = code; role = 'player'; wire(client); setNet(true);
  S = found.st; clockOff = Date.now() - S.ts; lastStateAt = Date.now(); wasIn = false;
  client.subscribe(T(code, 's'), { qos: 1 }); client.subscribe(T(code, 'fx'), { qos: 0 });
  saveJ('kd2_last', { room: code, at: Date.now() });
  send({ t: 'join', n: ME.n, c: ME.c });
  timers.push(setInterval(() => send({ t: 'ping' }), 8000));
  timers.push(setInterval(() => { const b = $('#hostWarn'); if (b) b.classList.toggle('hidden', Date.now() - lastStateAt < 35000); }, 3000));
  setUrl(code); afterState();
}
function leaveRoom(silent) {
  if (role === 'player') send({ t: 'leave' });
  if (role === 'host' && S) { S.phase = 'closed'; publish(true); dropK('kd2_host'); }
  timers.forEach(clearInterval); timers = []; clearLater();
  const c = client; setTimeout(() => c && c.end(), 400);
  client = null; room = null; role = null; S = null; H = null; view = null; deco = {};
  dropK('kd2_last'); setNet(null); setUrl(''); showHome();
  if (!silent) toast('Odadan çıktın');
}

/* ================= YÖNETİCİ ================= */
let pubT = null;
function publish(now) {
  if (role !== 'host') return;
  const go = () => {
    pubT = null; S.ts = Date.now();
    client && client.publish(T(room, 's'), JSON.stringify(S), { qos: 1, retain: true });
    if (S.phase !== 'closed') saveJ('kd2_host', { room, url: brokerUrl, S, H });
  };
  if (now) { clearTimeout(pubT); go(); } else if (!pubT) pubT = setTimeout(go, 40);
}
function changed() { publish(); afterState(); }
const onlineIds = () => S.order.filter(id => S.players[id] && S.players[id].on);
function takenBy(field, exceptPid) {
  const m = {}; S.order.forEach(id => { if (id === exceptPid) return; const p = S.players[id]; if (p && p.c[field] && p.c[field] !== 'none') m[p.c[field]] = id; }); return m;
}
function uniqueName(pid, name) {
  name = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 14);
  if (!name) { const i = S.order.indexOf(pid); name = 'Oyuncu ' + (i >= 0 ? i + 1 : S.order.length + 1); }
  const others = S.order.filter(id => id !== pid && S.players[id]).map(id => S.players[id].n.toLocaleLowerCase('tr'));
  let n = name, k = 2; while (others.includes(n.toLocaleLowerCase('tr'))) n = name.slice(0, 11) + ' ' + (k++);
  return n;
}
function addPlayer(pid, name, c) {
  const isNew = !S.players[pid];
  c = cleanChar(c);
  const tA = takenBy('acc', pid), tS = takenBy('skin', pid);
  if (tA[c.acc]) c.acc = pick(Object.keys(ACCS).filter(a => a !== 'none' && !tA[a])) || 'none';
  if (tS[c.skin]) c.skin = pick(SKINS.filter(s => !tS[s])) || c.skin;
  if (isNew) S.order.push(pid);
  S.players[pid] = { n: uniqueName(pid, name), c, on: true };
  S.titles[pid] = S.titles[pid] || [];
  S.x2left = S.x2left || {};
  if (S.x2left[pid] == null) S.x2left[pid] = S.phase === 'lobby' ? 0 : x2Quota();   // oyun sırasında gelen de hakkını alır
  H.seen[pid] = Date.now();
}
function hostInput(m) {
  if (!m || typeof m.pid !== 'string' || !S) return;
  const pid = m.pid;
  if (m.t === 'join') { if (!S.players[pid] && S.order.length >= MAXP) return; addPlayer(pid, m.n, m.c); return changed(); }
  const p = S.players[pid]; if (!p) return;
  H.seen[pid] = Date.now();
  if (!p.on) { p.on = true; changed(); }
  switch (m.t) {
    case 'leave': removePlayer(pid); break;
    case 'me': {
      if (typeof m.n === 'string') p.n = uniqueName(pid, m.n);
      if (m.c && S.phase === 'lobby') {
        const c = cleanChar(m.c), tA = takenBy('acc', pid), tS = takenBy('skin', pid);
        if (tA[c.acc]) c.acc = p.c.acc; if (tS[c.skin]) c.skin = p.c.skin; p.c = c;
      }
      changed(); break;
    }
    case 'card': {
      if (S.phase !== 'write' || m.wr !== S.wr) return;
      let t = String(m.text || '').trim().replace(/\s+/g, ' ').slice(0, 110);
      if (t.length < 5) return; if (!/[?？]$/.test(t)) t += '?';
      H.cards[pid] = t; if (!S.written.includes(pid)) S.written.push(pid);
      changed(); maybeDoneWriting(); break;
    }
    case 'vote': {
      // tek oy hakkı: pas, kendine oy serbest; 2x sadece hazır destede ve hak varsa
      if (S.phase !== 'vote' || m.r !== S.r || S.voted.includes(pid)) return;
      if (!m.pass) {
        if (!S.players[m.to]) return;
        H.votes[pid] = m.to; H.vt = H.vt || {}; H.vt[pid] = Date.now() - (H.rs || Date.now());   // karar süresi
        S.x2left = S.x2left || {}; H.x2 = H.x2 || {};
        if (m.x2 && S.set.mode === 'hazir' && (S.x2left[pid] || 0) > 0) { H.x2[pid] = true; S.x2left[pid]--; }
      }
      S.voted.push(pid);
      changed(); maybeReveal(); break;
    }
  }
}
function removePlayer(pid) {
  if (pid === S.host || !S.players[pid]) return;
  delete S.players[pid]; S.order = S.order.filter(x => x !== pid);
  S.voted = S.voted.filter(x => x !== pid); S.written = S.written.filter(x => x !== pid);
  delete H.votes[pid]; delete H.cards[pid];
  changed(); maybeReveal(); maybeDoneWriting();
}
function hostSet(k, v) { S.set[k] = v; if (k === 'anim') setFast(v === 'hizli'); changed(); }
function hostToMode() { if (S.order.length < 2) return toast('En az 2 kişi lazım'); S.phase = 'mode'; changed(); }
function hostModeGo() {
  S.r = 0; S.titles = {}; S.stats = {}; S.night = null; S.order.forEach(id => S.titles[id] = []);
  if (S.set.mode === 'hazir') {
    let deck = shuffleArr(paketSorulari(S.set.pack, { baharat: S.set.spicy }).map(x => ({ t: x.soru, cat: x.kat })));
    if (S.set.rounds !== 'hepsi') deck = deck.slice(0, +S.set.rounds);
    H.deck = deck; S.total = deck.length;
    resetX2(); goDeck();
  } else { S.total = 0; resetX2(); goWrite(); }
}
// 2x jokeri: hazır destede tur sayısının 5'te biri kadar (20 tur → 4), kendi kartlarımızda yok
const x2Quota = () => S.set.mode === 'hazir' ? Math.floor(S.total / 5) : 0;
function resetX2() { S.x2left = {}; S.order.forEach(id => S.x2left[id] = x2Quota()); }
function goWrite() { S.phase = 'write'; S.wr++; S.written = []; H.cards = {}; S.q = null; S.rv = null; changed(); }
function maybeDoneWriting() {
  if (!S || S.phase !== 'write') return;
  const need = onlineIds();
  if (need.length && need.every(id => S.written.includes(id))) { clearTimeout(maybeDoneWriting.t); maybeDoneWriting.t = setTimeout(finishWriting, 900); }
}
function finishWriting() {
  if (S.phase !== 'write') return;
  const cards = Object.values(H.cards); if (!cards.length) return toast('Henüz kimse kart yazmadı');
  H.deck = shuffleArr(cards.map(t => ({ t, cat: null }))); goDeck();
}
function goDeck() { S.phase = 'prep'; S.prep = 'deck'; S.deckLeft = H.deck.length; S.q = null; S.rv = null; changed(); }
function hostStartRound() {
  if (S.phase !== 'prep') return;
  const q = H.deck.shift(); if (!q) return hostAfterDeck();
  S.r++; S.q = q; S.deckLeft = H.deck.length; S.dl = Date.now() + S.set.time * 1000;
  S.voted = []; H.votes = {}; H.x2 = {}; H.vt = {}; H.rs = Date.now(); S.rv = null; S.phase = 'vote'; changed();
}
function maybeReveal() {
  if (!S || S.phase !== 'vote') return;
  const need = onlineIds();
  if (need.length && need.every(id => S.voted.includes(id))) { clearTimeout(maybeReveal.t); maybeReveal.t = setTimeout(reveal, 700); }
}
function reveal() {
  if (S.phase !== 'vote') return;
  // pairs: [kimden, kime, ağırlık] — 2x kullanan 2 sayılır
  const pairs = Object.entries(H.votes).filter(([f, t]) => S.players[t]).map(([f, t]) => [f, t, H.x2 && H.x2[f] ? 2 : 1]);
  const counts = {}; pairs.forEach(([, t, w]) => counts[t] = (counts[t] || 0) + w);
  const total = pairs.reduce((a, p) => a + p[2], 0);
  const max = Math.max(0, ...Object.values(counts));
  const win = max ? Object.keys(counts).filter(id => counts[id] === max) : [];
  const order = shuffleArr(pairs.map(p => [p[1], p[2]]));
  if (win.length) { const li = order.findIndex(o => o[0] === win[0]); order.push(order.splice(li, 1)[0]); }   // son kart kazananın
  const seq = order.map(o => o[0]), sw = order.map(o => o[1]);
  const target = win[0], others = pairs.filter(([f]) => f !== target);
  const uni = win.length === 1 && others.length >= 2 && others.every(([, t]) => t === target);
  const pass = S.order.filter(id => S.players[id] && !H.votes[id]);
  win.forEach(id => (S.titles[id] = S.titles[id] || []).push(S.q.t));
  // kategori kimliği için: bu kategorideki oyların kime gittiği
  if (S.q.cat && total) {
    S.stats = S.stats || {}; const st = S.stats[S.q.cat] = S.stats[S.q.cat] || { total: 0, by: {} };
    st.total += total; Object.entries(counts).forEach(([id, n]) => st.by[id] = (st.by[id] || 0) + n);
  }
  trackNight(pairs, pass, win, uni);
  S.rv = { counts, seq, sw, win, total, votes: pairs.length, pct: total ? Math.round(max / total * 100) : 0, uni, pass, anon: S.set.anon, pairs: S.set.anon ? null : pairs };
  // paket gerçekten oynandıysa (en az 3 soru ya da paketin tamamı) işaretle
  if (S.set.mode === 'hazir' && S.r >= Math.min(3, S.total) && !played.includes(S.set.pack)) { played.push(S.set.pack); savePlayed(); }
  S.phase = 'reveal'; S.dl = null; changed();
}
/* gecenin özeti: tur tur biriken istatistikler.
   Kimin kime oy verdiğini ele veren sayılar (kendine oy, 2x, sürü/muhalif, karşılıklı) sadece açık oylu turlardan. */
function trackNight(pairs, pass, win, uni) {
  const N = S.night = S.night || { pass: {}, self: {}, x2: {}, recv: {}, agree: {}, disagree: {}, mutual: {}, time: {}, uni: {}, rounds: 0, open: 0 };
  const inc = (o, k, n = 1) => o[k] = (o[k] || 0) + n;
  N.rounds++;
  pass.forEach(id => inc(N.pass, id));
  pairs.forEach(([, t, w]) => inc(N.recv, t, w));
  Object.entries(H.vt || {}).forEach(([id, ms]) => { const x = N.time[id] = N.time[id] || [0, 0]; x[0] += ms; x[1]++; });
  if (uni) inc(N.uni, win[0]);
  if (!S.set.anon) {
    N.open++;
    const map = Object.fromEntries(pairs.map(p => [p[0], p[1]]));
    pairs.forEach(([f, t, w]) => {
      if (f === t) inc(N.self, f);
      if (w > 1) inc(N.x2, f);
      if (win.length === 1 && f !== t) inc(win.includes(t) ? N.agree : N.disagree, f);
      if (f < t && map[t] === f) inc(N.mutual, f + '|' + t);
    });
  }
}
function hostNext() { if (S.phase !== 'reveal') return; if (H.deck.length) { S.phase = 'prep'; S.prep = 'card'; S.q = null; S.rv = null; changed(); } else hostAfterDeck(); }
function hostAfterDeck() { if (S.set.mode === 'kendi') goWrite(); else { S.phase = 'end'; changed(); } }
function hostEnd() { S.phase = 'end'; changed(); }
function hostNewGame() { S.phase = 'lobby'; S.r = 0; S.q = null; S.rv = null; S.voted = []; S.written = []; H.deck = []; S.set.pack = firstUnplayed(); changed(); }
function startHostLoop() {
  timers.push(setInterval(() => {
    if (!S) return;
    let ch = false;
    S.order.forEach(id => { if (id === ME.id) return; const on = Date.now() - (H.seen[id] || 0) < 25000; if (S.players[id].on !== on) { S.players[id].on = on; ch = true; } });
    if (ch) { changed(); maybeReveal(); maybeDoneWriting(); }
    if (S.phase === 'vote' && S.dl && Date.now() > S.dl) reveal();
  }, 1000));
  timers.push(setInterval(() => publish(true), 10000));
}

/* ================= EKRANLAR ================= */
let view = null, deco = {}, lastLocalEdit = 0, known = new Set();
let my = { r: -1, sel: null, done: false }, myCard = { wr: -1, sent: false };
let rvT = [];
const later = (ms, fn) => rvT.push(setTimeout(fn, ms));
const clearLater = () => { rvT.forEach(clearTimeout); rvT = []; cancelAnimationFrame(tickTimer.raf); };
const isHost = () => role === 'host';
const P = id => S.players[id] || { n: '?', c: { skin: '#888' } };
const nameOf = id => id === ME.id ? 'Sen' : esc(P(id).n);
const charOf = id => ({ ...(id === ME.id && S && S.phase === 'lobby' ? ME.c : P(id).c), ...(deco[id] || {}) });
const meMenu = mountMeMenu($('#meMenu'), {
  getChar: () => ({ ...ME.c, ...(deco[ME.id] || {}) }),
  getName: () => (S && S.players[ME.id] ? S.players[ME.id].n : ME.n) || 'Sen',
  onEdit: () => {
    if (S && S.phase === 'lobby') { const a = $('.a-me'); a && a.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => $('#nameInp') && $('#nameInp').focus({ preventScroll: true }), 300); }
    else toast(room ? 'Karakterini lobide değiştirebilirsin' : 'Karakterini odaya girince lobide seçersin');
  },
  canLeave: () => !!room,
  onLeave: () => askLeave(),
});

function afterState() {
  if (!S) return;
  if (role === 'player') {
    const inRoom = !!S.players[ME.id];
    if (S.phase === 'closed') { leaveRoom(true); return toast('Yönetici odayı kapattı 👋', 3000); }
    if (wasIn && !inRoom) { leaveRoom(true); return toast('Odadan çıkarıldın', 3000); }
    if (inRoom) wasIn = true; else return showLoading('Odaya giriliyor…');
    if (Date.now() - lastLocalEdit > 1500) { ME.c = cleanChar(S.players[ME.id].c); saveMe(); }
  }
  setFast(S.set.anim === 'hizli');
  meMenu.refresh();
  $('#roomPill').textContent = 'ODA · ' + room; $('#roomPill').classList.remove('hidden');
  const bb = $('#backBtn'); bb.classList.remove('hidden'); bb.innerHTML = isHost() ? '← <span class="long">Odayı kapat</span><span class="short">Kapat</span>' : '← Çık';
  $('#floaters').classList.add('off');
  const locked = S.phase === 'vote' || S.phase === 'reveal';
  $('#anonPill').innerHTML = ['prep', 'vote', 'reveal'].includes(S.phase) ? ((locked && S.rv ? S.rv.anon : S.set.anon) ? '🔒 Anonim' : '👁 Açık oy') + (locked ? ' <span class="pill-lock">· kilitli</span>' : '') : '';
  const key = [S.phase, S.r, S.phase === 'prep' ? S.prep : '', S.phase === 'write' ? S.wr : ''].join(':');
  if (key !== view) { clearLater(); view = key; (build[S.phase] || (() => {}))(); }
  (update[S.phase] || (() => {}))();
}
function showLoading(msg) {
  view = 'loading'; clearLater();
  app.innerHTML = `<section class="screen"><div class="waiting" style="margin-top:80px;border:0"><span class="dots"><i></i><i></i><i></i></span>${esc(msg)}</div></section>`;
}
function askLeave() {
  if (!room) return showHome();
  if (confirm(isHost() ? 'Odayı kapatırsan oyun herkes için biter. Emin misin?' : 'Odadan çıkmak istiyor musun?')) leaveRoom();
}
$('#logo').onclick = () => { if (room) askLeave(); };
$('#backBtn').onclick = askLeave;
function hostBackToLobby() { if (S.phase !== 'mode') return; S.phase = 'lobby'; changed(); }

/* ---------- masa ---------- */
function seatOrder() { const o = S.order.filter(id => S.players[id]); const i = o.indexOf(ME.id); return i < 0 ? o : [...o.slice(i), ...o.slice(0, i)]; }
function drawTable(el, { ids, empties = 0, done = [], kick = false, animIn = [], think = false }) {
  const total = ids.length + empties, pos = {};
  el.classList.toggle('many', total > 8);
  el.querySelectorAll('.seat').forEach(s => s.remove());
  for (let i = 0; i < total; i++) {
    const a = Math.PI / 2 + (i / total) * Math.PI * 2, xy = { x: 50 + Math.cos(a) * 40, y: 50 + Math.sin(a) * 38 };
    const id = ids[i], s = document.createElement('div');
    s.style.left = xy.x + '%'; s.style.top = xy.y + '%';
    if (!id) { s.className = 'seat empty'; s.innerHTML = '<svg class="av" viewBox="0 0 100 100"><circle cx="50" cy="55" r="34" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/></svg><div class="nm">boş</div>'; el.appendChild(s); continue; }
    pos[id] = xy; const p = P(id), d = deco[id], dn = done.includes(id);
    s.className = 'seat' + (id === ME.id ? ' me' : '') + (p.on === false ? ' off' : '') + (dn ? ' done' : '') + (think && !dn ? ' think' : '') + (animIn.includes(id) ? ' in' : '');
    s.dataset.id = id;
    s.innerHTML = avatar(charOf(id), { cls: 'av' }) + `<div class="nm">${nameOf(id)}</div><div class="ok">✓</div>` +
      (id === S.host ? '<span class="crown">👑</span>' : '') + (d && d.badge ? `<span class="badge">${d.badge}</span>` : '') +
      (kick && id !== S.host ? `<button class="kick" data-kick="${esc(id)}" aria-label="Odadan çıkar">✕</button>` : '');
    el.appendChild(s);
  }
  el._pos = pos;
}
function lookAt(el, from, to) {
  const s = el && el.querySelector(`.seat[data-id="${from}"] .pupils`); if (!s) return;
  if (!to || !el._pos || !el._pos[to] || !el._pos[from]) { s.style.transform = ''; return; }
  const a = el._pos[from], b = el._pos[to], dx = (b.x - a.x) * el.clientWidth / 100, dy = (b.y - a.y) * el.clientHeight / 100, L = Math.hypot(dx, dy) || 1;
  s.style.transform = `translate(${(dx / L * 3.6).toFixed(2)}px,${(dy / L * 3.2).toFixed(2)}px)`;
}
const lastFx = {};
function onFx(m) {
  if (m.t === 'look' && S && S.phase === 'vote') { lastFx[m.pid] = Date.now(); lookAt($('#table'), m.pid, m.to); }
}
function wanderEyes(el) {
  const step = () => {
    if (!el.isConnected) return;
    Object.keys(el._pos || {}).forEach(id => {
      if (id === ME.id || Date.now() - (lastFx[id] || 0) < 4000 || Math.random() < .5) return;
      const ids = Object.keys(el._pos).filter(x => x !== id); lookAt(el, id, Math.random() < .25 ? null : pick(ids));
    });
    later(1300 + Math.random() * 1200, step);
  };
  later(800, step);
}
function hostWarnHtml() { return isHost() ? '' : '<div id="hostWarn" class="banner hidden">Yöneticiden bir süredir ses yok, bağlantısı kopmuş olabilir…</div>'; }

const build = {}, update = {};

/* ---------- AÇILIŞ ---------- */
function drawFloaters() {
  const C = [{ skin: SKINS[4], hair: 'long', hairColor: HAIR_COLORS[2], eyes: 'lashes', mouth: 'smile', acc: 'bow' }, { skin: SKINS[2], hair: 'curly', hairColor: HAIR_COLORS[3], mouth: 'o', acc: 'party' }, { skin: SKINS[3], hair: 'spiky', eyes: 'sleepy', mouth: 'flat', acc: 'horns' }, { skin: SKINS[5], hair: 'pigtails', hairColor: HAIR_COLORS[1], eyes: 'wink', mouth: 'tongue', acc: 'catears' }];
  const F = [
    { t: 'Sence kim zombi kıyametinde ilk ölür?', x: 4, y: 8, k: 'gl mid' }, { n: 'Zeynep', c: C[0], x: 74, y: 6, k: 'pk' },
    { t: 'Kimin gizlice eskisini stalkladığını düşünüyorsun?', x: 70, y: 66, k: 'gl' }, { n: 'Can', c: C[1], x: 8, y: 70, k: 'pk mid' },
    { t: 'Sence kim 3 lira için IBAN atar?', x: 40, y: -2, k: 'gl far' }, { n: 'Mert', c: C[2], x: 86, y: 38, k: 'pk far' },
    { n: 'Elif', c: C[3], x: -4, y: 40, k: 'pk far' }, { t: 'Sence kim hesap gelince tuvalete kaçar?', x: 38, y: 84, k: 'gl far' },
  ];
  $('#floaters').innerHTML = F.map((f, i) => `<div class="fl ${f.k}" style="left:${f.x}%;top:${f.y}%;animation-delay:${-i * 1.3}s">${f.n ? `<div class="ft">${avatar(f.c)}${f.n}</div>` : f.t}</div>`).join('');
}
function showHome(prefill) {
  view = 'home'; clearLater();
  $('#floaters').classList.remove('off'); $('#roomPill').classList.add('hidden'); $('#anonPill').textContent = ''; $('#backBtn').classList.add('hidden');
  const code = prefill || normCode(new URLSearchParams(location.search).get('oda'));
  const saved = loadJ('kd2_host');
  const canResume = saved && saved.S && saved.S.phase !== 'closed' && Date.now() - saved.S.ts < 3 * 3600e3;
  app.innerHTML = `<section class="screen"><div class="hero">
    <h1>Kim<br>daha<b>?</b></h1>
    <p>Soru kartı açılır, herkes gizlice birini seçer. Kartlar tek tek açıldığında masada kıyamet kopar.</p>
    <div class="acts ${code ? 'hidden' : ''}" id="heroActs"><button class="btn w" id="btnCreate">Oda aç <span class="arr">→</span></button><button class="btn g" id="btnJoin">Odaya katıl</button></div>
    <div class="joinbox ${code ? '' : 'hidden'}" id="joinBox">
      <div class="codeboxes" id="codeBoxes">${[0, 1, 2, 3].map(i => `<input maxlength="1" autocapitalize="characters" autocomplete="off" aria-label="${i + 1}. harf" value="${esc(code[i] || '')}">`).join('')}</div>
      <button class="btn w" id="btnJoinGo" ${code.length === 4 ? '' : 'disabled'}>Masaya katıl <span class="arr">→</span></button>
      ${code ? '<button class="btn g sm" id="btnCreate2">ya da yeni oda aç</button>' : ''}
      <button class="backlink" id="joinBack">← Geri</button>
    </div>
    ${canResume ? `<button class="btn g sm resume" id="btnResume">↩ ${esc(saved.room)} odana geri dön</button>` : ''}
    <p class="foot">Oda kodunu bilen herkes oyunu görebilir, gerçekten özel şeyler yazmayın.</p>
  </div></section>`;
  drawFloaters();
  $('#btnCreate').onclick = () => { sfx.whoosh(); createRoom(); };
  if ($('#btnCreate2')) $('#btnCreate2').onclick = () => { sfx.whoosh(); createRoom(); };
  $('#btnJoin').onclick = () => { $('#heroActs').classList.add('hidden'); $('#joinBox').classList.remove('hidden'); $('#codeBoxes input').focus(); sfx.soft(); };
  const cbs = $$('#codeBoxes input');
  cbs.forEach((inp, i) => {
    inp.oninput = () => {
      const v = normCode(inp.value);
      if (v.length > 1) { v.split('').slice(0, 4 - i).forEach((ch, k) => cbs[i + k].value = ch); } else inp.value = v;
      if (inp.value && cbs[i + 1]) cbs[i + 1].focus();
      $('#btnJoinGo').disabled = cbs.some(c => !c.value);
    };
    inp.onkeydown = e => { if (e.key === 'Backspace' && !inp.value && cbs[i - 1]) cbs[i - 1].focus(); if (e.key === 'Enter' && !$('#btnJoinGo').disabled) $('#btnJoinGo').click(); };
  });
  $('#btnJoinGo').onclick = () => { sfx.whoosh(); joinRoom(cbs.map(c => c.value).join('')); };
  $('#joinBack').onclick = () => { sfx.soft(); setUrl(''); showHome(); };
  if (canResume) $('#btnResume').onclick = () => resumeHost(saved);
}

/* ---------- LOBİ ---------- */
let tab = 'skin', meSendT = null;
build.lobby = () => {
  known = new Set();
  app.innerHTML = `<section class="screen"><div class="lobby">
    <div class="a-code">
      ${hostWarnHtml()}
      <div class="rule">Lobi</div>
      <div class="glass codecard"><div><small>Oda kodu</small><div class="code">${esc(room.slice(0, 2))}<span>${esc(room[2])}</span>${esc(room[3])}</div></div><div class="qr" id="qr"></div></div>
      <div class="sharerow"><button class="btn g" id="btnShare">Linki paylaş</button><button class="btn g" id="btnCopy">Kopyala</button></div>
    </div>
    <div class="a-table"><div class="table" id="lobbyTable"><div class="felt"></div><div class="tcenter"><div class="count" id="lobbyCount"></div></div></div></div>
    <div class="a-me">
      <div class="rule">Karakterin</div>
      <div class="glass mecard">
        <div class="mehead"><div class="mini-prev" id="preview"></div>
          <div class="namef"><label for="nameInp">Adın</label><input id="nameInp" maxlength="14" placeholder="Masada görünecek ad" autocomplete="nickname" value="${esc(ME.n)}">
          <button class="dice" id="dice">🎲 Rastgele karakter</button></div></div>
        <div class="tabs" id="tabs"><button data-t="skin" class="on">Renk</button><button data-t="hair">Saç</button><button data-t="acc">Aksesuar</button><button data-t="eyes">Gözler</button><button data-t="mouth">Ağız</button></div>
        <div id="hairCols" class="hcols hidden"></div>
        <div class="opts" id="opts"></div>
      </div>
    </div>
    <div class="a-set">
      <div class="rule">Ayarlar <span id="setOwner" style="text-transform:none"></span></div>
      <div class="glass set" id="settings"><div class="row"><div class="l">Seçim süresi<small>Son 5 saniyede saat tıkırdar, süre biterse pas sayılır</small></div>
        <div class="seg" data-k="time"><button data-v="15">15 sn</button><button data-v="20">20 sn</button><button data-v="30">30 sn</button></div></div></div>
      <div style="margin-top:16px" id="startBox"></div>
    </div>
  </div></section>`;
  try { new QRCode($('#qr'), { text: roomLink(), width: 168, height: 168, colorDark: '#0F1B3D', colorLight: '#ffffff' }); } catch {}
  $('#btnShare').onclick = async () => { const d = { title: 'Kim Daha?', text: `Kim Daha? oynuyoruz, gel! Oda: ${room}`, url: roomLink() }; if (navigator.share) { try { await navigator.share(d); } catch {} } else copyLink(); };
  $('#btnCopy').onclick = copyLink;
  tab = 'skin';
  $('#tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; $$('#tabs button').forEach(x => x.classList.toggle('on', x === b)); sfx.soft(); drawOpts(); };
  $('#opts').onclick = e => { const b = e.target.closest('.opt'); if (!b || b.classList.contains('taken')) return; ME.c[tab] = b.dataset.v; charChanged(); };
  $('#hairCols').onclick = e => { const b = e.target.closest('[data-hc]'); if (!b) return; ME.c.hairColor = b.dataset.hc; charChanged(); };
  $('#dice').onclick = () => { const tk = takenMap(); Object.assign(ME.c, randomChar(Object.keys(tk.acc), Object.keys(tk.skin))); sfx.shuffle(); charChanged(); };
  $('#nameInp').oninput = () => { ME.n = $('#nameInp').value.trim(); saveMe(); clearTimeout(meSendT); meSendT = setTimeout(() => send({ t: 'me', n: ME.n }), 350); meMenu.refresh(); };
  $('#settings').onclick = e => { if (!isHost()) return; const b = e.target.closest('.seg button'); if (!b) return; sfx.soft(); hostSet('time', +b.dataset.v); };
  $('#lobbyTable').onclick = e => { const k = e.target.closest('[data-kick]'); if (!k || !isHost()) return; if (confirm(P(k.dataset.kick).n + ' odadan çıkarılsın mı?')) removePlayer(k.dataset.kick); };
  drawPreview(); drawOpts();
};
function copyLink() { navigator.clipboard?.writeText(roomLink()).then(() => toast('Link kopyalandı'), () => toast(roomLink(), 4000)); }
function takenMap() {
  const acc = {}, skin = {};
  S.order.forEach(id => { if (id === ME.id || !S.players[id]) return; const c = S.players[id].c; if (c.acc !== 'none') acc[c.acc] = id; skin[c.skin] = id; });
  return { acc, skin };
}
function charChanged() {
  lastLocalEdit = Date.now(); ME.c = cleanChar(ME.c); saveMe();
  clearTimeout(meSendT); meSendT = setTimeout(() => send({ t: 'me', c: ME.c, n: ME.n }), 150);
  sfx.pick(); vib(10); drawPreview(true); drawOpts(); meMenu.refresh(); drawLobbyTable(true);
}
function drawPreview(pop) {
  const pv = $('#preview'); if (!pv) return; pv.innerHTML = avatar(ME.c);
  if (pop) { pv.classList.remove('pop'); void pv.offsetWidth; pv.classList.add('pop'); }
}
function ownerTag(id) { return `<span class="owner">${avatar(P(id).c)}${esc(P(id).n)}</span>`; }
function drawOpts() {
  const box = $('#opts'); if (!box) return;
  const tk = takenMap();
  $('#hairCols').classList.toggle('hidden', tab !== 'hair');
  if (tab === 'hair') $('#hairCols').innerHTML = HAIR_COLORS.map(c => `<button class="${ME.c.hairColor === c ? 'on' : ''}" data-hc="${c}" style="background:${c}" aria-label="Saç rengi"></button>`).join('');
  if (tab === 'skin') box.innerHTML = SKINS.map(s => `<button class="opt ${ME.c.skin === s ? 'on' : ''} ${tk.skin[s] ? 'taken' : ''}" data-v="${s}"><span class="swatch" style="background:${s}"></span>${tk.skin[s] ? ownerTag(tk.skin[s]) : ''}</button>`).join('');
  else {
    const src = { acc: ACCS, eyes: EYES, mouth: MOUTHS, hair: HAIRS }[tab], t = tab === 'acc' ? tk.acc : {};
    box.innerHTML = Object.entries(src).map(([k, label]) => `<button class="opt ${ME.c[tab] === k ? 'on' : ''} ${t[k] ? 'taken' : ''}" data-v="${k}">${avatar({ ...ME.c, [tab]: k })}${t[k] ? ownerTag(t[k]) : `<small>${label}</small>`}</button>`).join('');
  }
}
function drawLobbyTable(bumpMe) {
  const el = $('#lobbyTable'); if (!el) return;
  const ids = seatOrder(), fresh = ids.filter(id => !known.has(id));
  drawTable(el, { ids, empties: Math.max(0, 8 - ids.length), kick: isHost(), animIn: fresh });
  if (bumpMe) el.querySelector(`.seat[data-id="${ME.id}"]`)?.classList.add('bump');
  if (known.size && fresh.length) { sfx.join(); vib(15); fresh.forEach(f => ids.forEach(id => id !== f && later(120 + Math.random() * 300, () => lookAt(el, id, f)))); later(2600, () => ids.forEach(id => lookAt(el, id, null))); }
  fresh.forEach(id => known.add(id));
  $('#lobbyCount').textContent = ids.length + ' kişi';
}
update.lobby = () => {
  drawLobbyTable(); drawOpts();
  if (Date.now() - lastLocalEdit > 1500) drawPreview();
  const st = $('#settings'); st.classList.toggle('ro', !isHost());
  $('#setOwner').textContent = isHost() ? '' : '· yönetici seçiyor';
  $$('#settings .seg button').forEach(b => b.classList.toggle('on', +b.dataset.v === S.set.time));
  const n = S.order.length;
  $('#startBox').innerHTML = isHost()
    ? `<button class="btn w full" id="btnStart" ${n < 2 ? 'disabled' : ''}>Oyunu başlat <span class="arr">→</span></button><div class="count" style="text-align:center;margin-top:10px">${n < 2 ? 'Arkadaşların linkle ya da kodla girsin' : n < 3 ? '2 kişi oynanır ama 3+ çok daha eğlenceli' : n + ' kişi masada, hazırsanız başlat'}</div>`
    : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>Yöneticinin başlatması bekleniyor</div>`;
  if (isHost()) $('#btnStart').onclick = () => { sfx.start(); hostToMode(); };
};

/* ---------- MOD (oyun başında bir kez) ---------- */
build.mode = () => {
  app.innerHTML = `<section class="screen"><div class="modewrap">
    ${hostWarnHtml()}
    ${isHost() ? '<button class="backlink" id="modeBack">← Lobiye dön</button>' : ''}
    <div class="rule">Oyun modu</div>
    <h2>Bu oyunu nasıl <em>oynuyoruz?</em></h2>
    <p class="sub" id="modSub"></p>
    <div id="modBox">
      <div class="modes">
        <button class="mode" data-mode="kendi"><span class="e">✍️</span><b>Kendi kartlarımız</b><small>Herkes masaya bir soru kartı koyar. Kimin yazdığı bilinmez, kartlar karışık açılır. Kartlar bitince yeniden yazılır.</small></button>
        <button class="mode" data-mode="hazir"><span class="e">🃏</span><b>Hazır deste</b><small>418 soru, 19 kategori, 9 ayrı paket. Biri oyların çoğunu toplarsa kategorinin tepkisi çıkar.</small></button>
      </div>
      <div class="glass set" id="hazirSet" style="margin-top:14px">
        <div class="packwrap"><div class="ph">Soru paketi<small>Hiçbir soru iki pakette yok. Oynadığınız paketler işaretlenir.</small></div><div class="packs" id="packs"></div>
          <button class="packreset hidden" id="packUnplay">Bu paketi oynanmadı say</button>
          <button class="packreset hidden" id="packReset" style="margin-left:14px">Paket geçmişini sıfırla</button></div>
        <div class="row"><div class="l">Baharatlı sorular 🌶️<small>+18 imalı sorular desteye karışır</small></div><button class="sw" data-k="spicy" aria-label="Baharatlı"></button></div>
        <div class="row"><div class="l">Kaç soru?</div><div class="seg" data-k="rounds"><button data-v="10">10</button><button data-v="20">20</button><button data-v="30">30</button><button data-v="hepsi">Hepsi</button></div></div>
      </div>
      <div class="glass set" style="margin-top:14px"><div class="row"><div class="l">Animasyonlar<small>Herkes için geçerli. Yönetici her tur başında değiştirebilir.</small></div>
        <div class="seg" data-k="anim"><button data-v="tam">Tam</button><button data-v="hizli">Hızlı ⚡</button></div></div></div>
    </div>
    <div style="margin-top:18px" id="modGo"></div>
  </div></section>`;
  if ($('#modeBack')) $('#modeBack').onclick = () => { sfx.soft(); hostBackToLobby(); };
  $('#modBox').onclick = e => {
    if (!isHost()) return;
    const m = e.target.closest('.mode'), b = e.target.closest('.seg button'), sw = e.target.closest('.sw'), pk = e.target.closest('.pack');
    if (e.target.closest('#packReset')) { played = []; savePlayed(); sfx.soft(); return hostSet('pack', 0); }
    if (e.target.closest('#packUnplay')) { played = played.filter(i => i !== S.set.pack); savePlayed(); sfx.soft(); return hostSet('pack', S.set.pack); }
    sfx.pick();
    if (pk) hostSet('pack', +pk.dataset.pack);
    else if (m) hostSet('mode', m.dataset.mode);
    else if (sw) hostSet('spicy', !S.set.spicy);
    else if (b) { const k = b.parentElement.dataset.k; hostSet(k, k === 'rounds' && b.dataset.v !== 'hepsi' ? +b.dataset.v : b.dataset.v); }
  };
};
update.mode = () => {
  const s = S.set;
  $('#modBox').classList.toggle('ro', !isHost());
  $$('.mode').forEach(m => m.classList.toggle('on', m.dataset.mode === s.mode));
  $('#hazirSet').classList.toggle('hidden', s.mode !== 'hazir');
  $('[data-k="spicy"]').classList.toggle('on', s.spicy);
  $$('#modBox .seg button').forEach(b => { const k = b.parentElement.dataset.k; b.classList.toggle('on', String(s[k]) === b.dataset.v); });
  $('#packs').innerHTML = PAKETLER.map((p, i) => {
    const n = paketSorulari(i, { baharat: s.spicy }).length, pl = isHost() && played.includes(i);
    return `<button class="pack ${s.pack === i ? 'on' : ''} ${pl ? 'played' : ''}" data-pack="${i}"><span class="e">${p.e}</span><b>${p.ad}</b><small>${n} soru</small>${pl ? '<span class="pl">Oynandı ✓</span>' : ''}</button>`;
  }).join('');
  $('#packReset').classList.toggle('hidden', !isHost() || !played.length);
  $('#packUnplay').classList.toggle('hidden', !isHost() || !played.includes(s.pack));
  $('#modSub').textContent = isHost() ? 'Bir kez seçilir, oyun bitene kadar değişmez.' : 'Yönetici seçiyor, seçimler burada canlı görünür.';
  $('#modGo').innerHTML = isHost()
    ? `<button class="btn w full" id="btnModGo">${s.mode === 'kendi' ? 'Başla, herkes ilk kartını yazsın' : 'Başla, desteyi karıştır'} <span class="arr">→</span></button>`
    : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>Yönetici modu seçiyor</div>`;
  if (isHost()) $('#btnModGo').onclick = () => { sfx.start(); hostModeGo(); };
};

/* ---------- SORU YAZ (kendi kartlarımız) ---------- */
build.write = () => {
  app.innerHTML = `<section class="screen"><div class="writer">
    <div>
      ${hostWarnHtml()}
      <div class="rule">Soru kartı · ${S.wr}. deste</div>
      <h2>Masaya bir <em>soru</em> koy</h2>
      <p class="sub">Kimse kimin yazdığını bilmeyecek. Kartlar karıştırılıp rastgele açılacak.</p>
      <div class="qedit" id="qedit"><div class="tag">Gizli soru kartı</div><textarea id="qtext" maxlength="110" placeholder="Sence kim…?"></textarea><div class="cnt" id="qcnt">0 / 110</div></div>
      <div class="ideas" id="ideas"><button>Sence kim…</button><button>Kimin gizli gizli…</button><button>Sence kim zor durumda…</button><button>Kim 10 yıl sonra…</button><button>Kimin telefonunda…</button></div>
      <button class="btn w full" id="btnPut" disabled>Kartı masaya koy <span class="arr">→</span></button>
      <div class="status" id="sent">Kartın masada <span style="color:var(--pink)">✓</span> Diğerleri yazıyor…</div>
      <div id="hostWriteCtl" style="margin-top:12px"></div>
    </div>
    <div><div class="table" id="writeTable"><div class="felt"></div><div class="pile" id="wpile"></div><div class="pile-label" id="wcount"></div></div></div>
  </div></section>`;
  const sent = myCard.wr === S.wr && myCard.sent;
  if (sent || S.written.includes(ME.id)) setWriteSent();
  $('#qtext').oninput = () => { const v = $('#qtext').value; $('#qcnt').textContent = v.length + ' / 110'; $('#btnPut').disabled = v.trim().length < 5; };
  $('#ideas').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#qtext').value = b.textContent.replace('…', ' '); $('#qtext').focus(); $('#qtext').oninput(); sfx.soft(); };
  $('#btnPut').onclick = putCard;
  wanderEyes($('#writeTable'));
};
function setWriteSent() { $('#qedit').classList.add('hidden'); $('#ideas').classList.add('hidden'); $('#btnPut').classList.add('hidden'); $('#sent').classList.add('on'); }
function putCard() {
  const text = $('#qtext').value.trim(); if (text.length < 5) return;
  myCard = { wr: S.wr, sent: true };
  const done = () => send({ t: 'card', wr: S.wr, text });
  sfx.put(); vib(20);
  if (fast) { setWriteSent(); return done(); }
  const qe = $('#qedit'), from = qe.getBoundingClientRect(), pile = $('#wpile').getBoundingClientRect();
  const f = document.createElement('div'); f.className = 'flyer back';
  Object.assign(f.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  document.body.appendChild(f);
  qe.style.transform = 'perspective(900px) rotateY(90deg)'; qe.style.opacity = '0';
  const dx = pile.left - (from.left + from.width / 2), dy = pile.top - (from.top + from.height / 2);
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${dx}px,${dy}px) rotate(${Math.random() * 30 - 15}deg) scale(${40 / from.width},${56 / from.height})`; }));
  setTimeout(() => { f.remove(); done(); }, 870);
  setTimeout(setWriteSent, 700);
}
let pileShown = 0;
function syncPile(el, n, label) {
  const pile = el.querySelector('.pile'); if (!pile) return;
  const have = pile.children.length;
  for (let i = have; i < n; i++) {
    const m = document.createElement('div'); m.className = 'mini back';
    const r = `rotate(${(Math.random() * 40 - 20).toFixed(1)}deg) translate(${(Math.random() * 16 - 8).toFixed(1)}px,${(Math.random() * 10 - 5).toFixed(1)}px)`;
    m.style.setProperty('--r', r); m.style.transform = r; pile.appendChild(m);
    if (have > 0 || i > 0) sfx.land();
  }
  while (pile.children.length > n) pile.lastChild.remove();
  const lb = el.querySelector('.pile-label'); if (lb) lb.textContent = label;
}
update.write = () => {
  const el = $('#writeTable'); const ids = seatOrder();
  drawTable(el, { ids, done: S.written, think: true });
  syncPile(el, S.written.length, `${S.written.length} / ${onlineIds().length} kart`);
  if (S.written.includes(ME.id)) setWriteSent();
  const left = onlineIds().filter(id => !S.written.includes(id));
  $('#hostWriteCtl').innerHTML = !isHost() ? '' :
    (S.written.length && left.length ? `<button class="btn g full sm" id="btnNoWait">Yazmayanları bekleme, ${S.written.length} kartla başla</button>` : '') +
    `<button class="btn g full sm" id="btnEndW" style="margin-top:10px">Oyunu bitir, sonuçlara geç</button>`;
  if ($('#btnNoWait')) $('#btnNoWait').onclick = finishWriting;
  if ($('#btnEndW')) $('#btnEndW').onclick = () => { if (confirm('Oyun bitsin mi? Sonuç ekranına geçilecek.')) hostEnd(); };
};

/* ---------- TUR HAZIRLIĞI: deste (ilk tur) ya da kapalı kart ---------- */
function prepBoxHtml() {
  return `<div class="prepbox ${isHost() ? '' : 'ro'}" id="prepBox">
    <div class="prow"><div>Bu turun oyları<small>Kart açılınca bu tur için kilitlenir</small></div>
      <div class="seg" data-k="anon"><button data-v="1">🔒 Anonim</button><button data-v="0">👁 Açık oy</button></div></div>
    <div class="prow"><div>Animasyonlar<small>Değiştirmediğin sürece sonraki turlarda da sürer</small></div>
      <div class="seg" data-k="anim"><button data-v="tam">Tam</button><button data-v="hizli">Hızlı ⚡</button></div></div>
  </div>`;
}
function bindPrepBox() {
  $('#prepBox').onclick = e => {
    const b = e.target.closest('.seg button'); if (!b || !isHost()) return;
    const k = b.parentElement.dataset.k; sfx.soft();
    hostSet(k, k === 'anon' ? b.dataset.v === '1' : b.dataset.v);
  };
}
function updatePrepBox() {
  $$('#prepBox .seg button').forEach(b => { const k = b.parentElement.dataset.k; b.classList.toggle('on', k === 'anon' ? (b.dataset.v === '1') === S.set.anon : b.dataset.v === S.set.anim); });
}
function deckInfo() {
  if (S.set.mode === 'kendi') return `${S.deckLeft} soru kartı masada.`;
  const p = PAKETLER[S.set.pack]; return `${p.e} ${p.ad} paketi · ${S.total} soru${S.set.spicy ? ' · baharatlı 🌶️' : ''}.`;
}
build.prep = () => {
  if (S.prep === 'deck') {
    app.innerHTML = `<section class="screen"><div class="deckwrap">
      ${hostWarnHtml()}
      <div class="rule">Deste</div>
      <div class="table" id="deckTable"><div class="felt"></div><div class="deck" id="deck"></div><div class="shufflecap" id="shcap">Kartlar karıştırılıyor…</div></div>
      <div class="ready hidden" id="ready"><h2>Tur ${String(S.r + 1).padStart(2, '0')} <em>hazır</em></h2><p class="sub" id="readySub"></p>${prepBoxHtml()}</div>
    </div></section>`;
    bindPrepBox(); runShuffle();
  } else {
    app.innerHTML = `<section class="screen"><main class="stage">
      <section class="qwrap">${hostWarnHtml()}
        <div class="rule">Tur ${String(S.r + 1).padStart(2, '0')}${S.total ? ' — soru ' + (S.r + 1) + ' / ' + S.total : ''}</div>
        <div class="qcard qclosed ${isHost() ? 'tap' : ''}" id="qclosed"><span class="cat plain">Kapalı kart</span>
          <div class="qtext" style="color:var(--ink-3)">Soru kartı masada,<br>henüz açılmadı.</div>
          <div class="qfoot"><span>Destede ${S.deckLeft} kart</span><span class="taphint ${isHost() ? '' : 'ro'}">${isHost() ? 'Dokun, kartı aç' : 'Yönetici açacak'}</span></div></div>
      </section>
      <section class="table-wrap"><div class="table" id="table"><div class="felt"></div><div class="pile"></div></div></section>
      <section class="side"><div class="rule">Tur hazırlığı</div>
        <div class="hand-head"><h3>Sıradaki kart bekliyor</h3><small>${isHost() ? 'sen yöneticisin 👑' : 'yönetici: ' + esc(P(S.host).n) + ' 👑'}</small></div>
        ${prepBoxHtml()}
        <div id="prepCtl" style="margin-top:14px"></div></section>
    </main></section>`;
    bindPrepBox();
    if (isHost()) $('#qclosed').onclick = () => { sfx.flip(); vib(30); hostStartRound(); };
    wanderEyes($('#table'));
  }
};
update.prep = () => {
  updatePrepBox();
  if (S.prep === 'card') {
    drawTable($('#table'), { ids: seatOrder() });
    $('#prepCtl').innerHTML = isHost()
      ? `<button class="btn g full sm" id="btnEnd">Oyunu bitir, sonuçlara geç</button>`
      : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>Yönetici kartı açınca tur başlar</div>`;
    if ($('#btnEnd')) $('#btnEnd').onclick = () => { if (confirm('Oyun bitsin mi? Sonuç ekranına geçilecek.')) hostEnd(); };
  } else if ($('#readySub')) $('#readySub').textContent = deckInfo() + (isHost() ? ' Öne çıkan karta dokun, tur başlasın.' : ' Yönetici öne çıkan karta dokununca tur başlar.');
};
function runShuffle() {
  const n = 7, d = $('#deck'), tw = $('#deckTable').clientWidth, w = Math.max(48, Math.min(78, tw * .12)), h = w * 1.4;
  const cards = Array.from({ length: n }, (_, i) => {
    const c = document.createElement('div'); c.className = 'dc back';
    Object.assign(c.style, { width: w + 'px', height: h + 'px', margin: `${-h / 2}px 0 0 ${-w / 2}px`, transform: `translate(0,${-i * 1.5}px)` });
    d.appendChild(c); return c;
  });
  let t = fast ? 0 : 300;
  if (!fast) later(t, () => sfx.shuffle());
  for (let r = 0; r < (fast ? 0 : 3); r++) {
    later(t, () => cards.forEach((c, i) => c.style.transform = `translate(${i % 2 ? w * .75 : -w * .75}px,${-i * 1.5}px) rotate(${i % 2 ? 8 : -8}deg)`));
    t += 480;
    later(t, () => { cards.forEach((c, i) => c.style.transform = `translate(0,${-i * 1.5}px) rotate(${(Math.random() * 6 - 3).toFixed(1)}deg)`); vib(25); });
    t += 600;
  }
  later(t, () => { cards.forEach((c, i) => c.style.transform = `translate(${(i - (n - 1) / 2) * w * .32}px,${Math.abs(i - (n - 1) / 2) * 3}px) rotate(${(i - (n - 1) / 2) * 7}deg)`); sfx.fan(); });
  t += fast ? 150 : 900;
  later(t, () => {
    const top = cards[n - 1];
    top.style.transform = `translate(0,${-h * .35}px) scale(1.25)`; top.style.zIndex = 5; sfx.flipCard();
    $('#shcap').classList.add('hidden'); $('#ready').classList.remove('hidden'); update.prep();
    const cap = document.createElement('div'); cap.className = 'tapcap' + (isHost() ? '' : ' ro');
    cap.textContent = isHost() ? 'Dokun, tur başlasın' : 'Yönetici açacak'; cap.style.top = (h * .55) + 'px'; d.appendChild(cap);
    if (isHost()) {
      top.classList.add('tapme');
      top.onclick = () => {
        if (top.dataset.opened) return; top.dataset.opened = '1';
        top.classList.remove('tapme'); top.classList.add('opening'); cap.style.display = 'none';
        sfx.flip(); vib(30);
        top.style.transform = `translate(0,${-h * .6}px) rotateY(180deg) scale(${fast ? 1.4 : 2.4})`;
        setTimeout(hostStartRound, fast ? 200 : 600);
      };
    }
  });
}

/* ---------- OY VER ---------- */
function stageHtml(side) {
  const q = S.q, C = CATEGORIES[q.cat || 'genel'];
  return `<section class="screen"><main class="stage">
    <section class="qwrap">${hostWarnHtml()}
      <div class="rule">Tur ${String(S.r).padStart(2, '0')}${S.total ? ' — soru ' + S.r + ' / ' + S.total : ''}</div>
      <div class="qcard ${S.phase === 'vote' ? 'flipin' : 'small'}" id="qcard">
        <span class="cat">${q.cat ? C.e + ' ' + C.ad : '✍️ Sizin kartınız'}</span>
        <div class="qtext">${esc(q.t)}</div>
        <div class="qfoot"><span>${q.cat ? 'Hazır deste' : 'Bir oyuncunun gizli kartı'}</span><span id="votedCount"></span></div>
      </div>
      ${S.phase === 'vote' ? '<div class="timer" id="timer"><span class="t" id="tt"></span><div class="line"><i id="tl"></i></div></div>' : ''}
    </section>
    <section class="table-wrap"><div class="table" id="table"><div class="felt"></div><div class="pile"></div><div class="pile-label"></div></div></section>
    <section class="side">${side}</section>
  </main></section>`;
}
build.vote = () => {
  if (my.r !== S.r) my = { r: S.r, sel: null, x2: false, done: S.voted.includes(ME.id) };
  app.innerHTML = stageHtml(`<div class="rule">Elin</div>
    <div class="hand-head"><h3>Kimi seçiyorsun?</h3><small>Kendine de verebilirsin</small></div>
    <div class="cards" id="cards"></div>
    <div class="vopts" id="vopts"><button class="x2btn hidden" id="x2Btn"></button><button class="passbtn" id="passBtn">Pas geç</button></div>
    <button class="confirm" id="confirm" disabled>Kartı masaya koy <span class="arr">→</span></button>
    <div class="status" id="status"></div><div id="hostVoteCtl"></div>`);
  sfx.flip(); vib(30);
  const hand = [...seatOrder().filter(id => id !== ME.id), ME.id];          // kendi kartın en sonda
  $('#cards').innerHTML = hand.map((id, i) => `<button class="card ${id === ME.id ? 'mine' : ''}" data-id="${id}" style="animation-delay:${fast ? 0 : .35 + i * .07}s" aria-label="${id === ME.id ? 'Kendine' : esc(P(id).n)}">
    <span class="tick">${CHECK}</span><span class="thumb">${avatar(charOf(id))}</span><span class="nm">${id === ME.id ? 'Sen' : esc(P(id).n)}</span></button>`).join('');
  hand.forEach((_, i) => sfx.deal(i));
  drawX2();
  $('#x2Btn').onclick = () => { if (my.done || x2Left() <= 0) return; my.x2 = !my.x2; sfx.pick(); vib(15); drawX2(); };
  $('#passBtn').onclick = () => {
    if (my.done) return; my.done = true; my.sel = null; lookAt($('#table'), ME.id, null);
    sfx.pass(); lockHand('Bu turu pas geçtin 🙈'); $('#cards').style.opacity = .35;
    send({ t: 'vote', r: S.r, pass: true });
  };
  $('#cards').onclick = e => {
    const c = e.target.closest('.card'); if (!c || my.done) return;
    my.sel = my.sel === c.dataset.id ? null : c.dataset.id;
    my.sel ? (sfx.pick(), vib(12)) : sfx.unpick();
    $$('#cards .card').forEach(x => x.classList.toggle('sel', x.dataset.id === my.sel));
    $('#cards').classList.toggle('has-sel', !!my.sel); $('#confirm').disabled = !my.sel;
    lookAt($('#table'), ME.id, my.sel); fxSend({ t: 'look', to: my.sel });     // gözlerin seçtiğine döner, herkes görür
  };
  $('#confirm').onclick = confirmVote;
  drawTable($('#table'), { ids: seatOrder(), done: S.voted, think: true });
  wanderEyes($('#table'));
  tickTimer();
};
const x2Left = () => (S.set.mode === 'hazir' && S.x2left && S.x2left[ME.id]) || 0;
function drawX2() {
  const b = $('#x2Btn'); if (!b) return;
  const left = x2Left();
  b.classList.toggle('hidden', S.set.mode !== 'hazir' || (left <= 0 && !my.x2));
  b.classList.toggle('on', my.x2);
  b.innerHTML = `<b>2x</b><span>${my.x2 ? 'Oyun 2 sayılacak' : 'Oyunu ikiye katla'}</span><small>${left} hak</small>`;
  $$('#cards .card').forEach(c => c.classList.toggle('x2', my.x2));
  $('#confirm').innerHTML = my.x2 ? 'Kartı 2x masaya koy <span class="arr">→</span>' : 'Kartı masaya koy <span class="arr">→</span>';
}
function lockHand(msg) {
  my.done = true; $('#cards').classList.add('locked'); $('#confirm').style.display = 'none'; $('#vopts').classList.add('hidden');
  const st = $('#status'); st.classList.add('on'); st.innerHTML = msg;
}
function confirmVote() {
  if (!my.sel || my.done) return;
  const to = my.sel, x2 = my.x2 && x2Left() > 0; my.done = true;
  const done = () => send({ t: 'vote', r: S.r, to, x2 });
  const card = $(`#cards .card[data-id="${to}"]`);
  if (x2) { sfx.count(); vib([20, 30, 20]); }
  sfx.put(); lockHand(`Kartın masada${x2 ? ' (2x)' : ''} <span style="color:var(--pink)">✓</span> Diğerleri bekleniyor…`);
  if (fast || !card) return done();
  const from = card.getBoundingClientRect(), pile = $('#table .pile').getBoundingClientRect();
  const f = document.createElement('div'); f.className = 'flyer';
  Object.assign(f.style, { left: from.left + 'px', top: from.top + 'px', width: from.width + 'px', height: from.height + 'px' });
  f.innerHTML = `<div class="f card" style="animation:none">${card.innerHTML}</div><div class="b back"></div>`;
  document.body.appendChild(f); card.style.visibility = 'hidden';
  const dx = pile.left - (from.left + from.width / 2), dy = pile.top - (from.top + from.height / 2);
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${dx}px,${dy}px) rotateY(180deg) rotate(${(Math.random() * 30 - 15).toFixed(1)}deg) scale(${38 / from.width})`; }));
  setTimeout(() => { f.remove(); done(); }, 850);
}
function tickTimer() {
  cancelAnimationFrame(tickTimer.raf); let lastSec = null;
  const loop = () => {
    if (!S || S.phase !== 'vote' || !S.dl || !$('#tl')) return;
    const total = S.set.time * 1000, left = Math.max(0, S.dl - (Date.now() - clockOff)), sec = Math.ceil(left / 1000);
    $('#tl').style.transform = `scaleX(${Math.min(1, left / total)})`;
    $('#tt').textContent = '00:' + String(sec).padStart(2, '0');
    $('#timer').classList.toggle('low', sec <= 5);
    if (sec !== lastSec) { lastSec = sec; if (sec <= 5 && sec > 0 && !my.done) sfx.tick(sec <= 2); if (sec === 0 && !my.done) { sfx.pass(); lockHand('Süre doldu, bu turu pas geçtin'); $('#cards').style.opacity = .35; } }
    tickTimer.raf = requestAnimationFrame(loop);
  };
  loop();
}
update.vote = () => {
  const el = $('#table');
  el.querySelectorAll('.seat').forEach(s => { const id = s.dataset.id; if (!id) return; const dn = S.voted.includes(id); s.classList.toggle('done', dn); s.classList.toggle('think', !dn); s.classList.toggle('off', P(id).on === false); });
  if (!el.querySelector(`.seat[data-id="${seatOrder().slice(-1)[0]}"]`) || el.querySelectorAll('.seat').length !== seatOrder().length) drawTable(el, { ids: seatOrder(), done: S.voted, think: true });
  syncPile(el, S.voted.length, S.voted.length ? S.voted.length + ' kart masada' : 'masa boş');
  $('#votedCount').textContent = `${S.voted.length} / ${onlineIds().length} oy`;
  if (S.voted.includes(ME.id) && !my.done) lockHand('Kartın masada <span style="color:var(--pink)">✓</span> Diğerleri bekleniyor…');
  if (!my.done) drawX2();
  $('#hostVoteCtl').innerHTML = isHost() ? '<button class="btn g full sm" id="btnForce" style="margin-top:12px">Beklemeden sonucu göster</button>' : '';
  if ($('#btnForce')) $('#btnForce').onclick = () => { if (!S.voted.length && !confirm('Henüz kimse oy vermedi. Yine de geçilsin mi?')) return; reveal(); };
};

/* ---------- SONUÇ: kartlar tek tek açılır ---------- */
build.reveal = () => {
  app.innerHTML = stageHtml(`<div class="rule">Sonuç</div>
    <div class="verdict" id="verdict">Kartlar açılıyor…</div>
    <div class="tally" id="tally"></div><div class="passline" id="passline"></div>
    <div id="nextCtl" style="margin-top:16px"></div>`);
  const R = S.rv;
  drawTable($('#table'), { ids: seatOrder(), done: seatOrder().filter(id => !R.pass.includes(id)) });
  $('#votedCount').textContent = `${R.total} oy${R.votes != null && R.total !== R.votes ? ' (2x dahil)' : ''} · ${R.pass.length} pas`;
  $('#tally').innerHTML = seatOrder().map(id => `<div class="trow" data-id="${id}"><span class="tav">${avatar(charOf(id))}</span>
    <div class="mid"><div class="tnm">${nameOf(id)}</div><div class="stack"></div></div><span class="tc">0</span><div class="voters"></div></div>`).join('');
  runReveal(R);
};
update.reveal = () => {};
function bumpCount(to, w = 1) {
  const row = $(`.trow[data-id="${to}"]`); if (!row) return;
  row.querySelector('.stack').insertAdjacentHTML('beforeend', w > 1 ? '<i class="x2"></i><i class="x2"></i>' : '<i></i>');
  const tc = row.querySelector('.tc'); tc.textContent = +tc.textContent + w; tc.classList.add('has');
  tc.classList.remove('bump'); void tc.offsetWidth; tc.classList.add('bump'); sfx.count();
}
function runReveal(R) {
  const tb = $('#table');
  if (!R.total) { $('#verdict').innerHTML = 'Kimse oy vermedi 😴'; return showNext(400); }
  const W = i => (R.sw && R.sw[i]) || 1;
  if (fast) { R.seq.forEach((to, i) => later(120 + i * 90, () => bumpCount(to, W(i)))); return later(120 + R.seq.length * 90 + 250, () => finish(R)); }
  const tw = tb.clientWidth, w = Math.max(40, Math.min(70, tw * .115)), h = w * 1.38, gap = Math.min(w * .8, (tw * .5) / R.seq.length);
  const pile = tb.querySelector('.pile');
  const els = R.seq.map((to, i) => {
    const el = document.createElement('div'); el.className = 'vcard';
    el.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px;--w:${w}px;transform:scale(.2);opacity:0`;
    el.innerHTML = `<div class="face back"></div><div class="face front">${W(i) > 1 ? '<span class="x2tag">2x</span>' : ''}${avatar(charOf(to))}<b>${to === ME.id ? 'Sen' : esc(P(to).n)}</b></div>`;
    pile.appendChild(el);
    const x = (i - (R.seq.length - 1) / 2) * gap, r = (i - (R.seq.length - 1) / 2) * 5;
    later(150 + i * 110, () => { el.style.opacity = 1; el.style.transform = `translate(${x}px,${Math.abs(r) * .8}px) rotate(${r}deg)`; sfx.deal(0); });
    return el;
  });
  let t = 1600;
  R.seq.forEach((to, i) => {
    const el = els[i], last = i === R.seq.length - 1;
    if (last && R.seq.length > 1) { later(t, () => { el.classList.add('shake'); $('#verdict').innerHTML = 'Son kart…'; sfx.drum(1.9); vib([20, 40, 20, 40, 20, 40, 20]); }); t += 2000; }
    later(t, () => {
      el.classList.remove('shake'); el.classList.add('up');
      el.style.transform = `translate(0px,${-h * .15}px) rotateY(180deg) scale(${last ? 2.6 : 2.2})`;
      sfx.flipCard(); later(260, sfx.hit);
      Object.keys(tb._pos || {}).forEach(id => id !== to && lookAt(tb, id, to));   // herkes ona bakar
    });
    t += last ? 1500 : 1150;
    later(t, () => flyToTally(el, to, W(i)));
    t += last ? 500 : 650;
  });
  later(t + 300, () => finish(R));
}
function flyToTally(el, to, w = 1) {
  const row = $(`.trow[data-id="${to}"]`); if (!row) { el.remove(); return; }
  const stack = row.querySelector('.stack'), a = el.querySelector('.front').getBoundingClientRect(), b = stack.getBoundingClientRect();
  const f = document.createElement('div'); f.className = 'flyer2';
  f.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;--w:${a.width}px`;
  f.innerHTML = el.querySelector('.front').innerHTML; document.body.appendChild(f); el.remove();
  const tx = b.left + stack.children.length * 11 - a.left, ty = b.top - a.top;
  requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transform = `translate(${tx}px,${ty}px) scale(${15 / a.width})`; f.style.opacity = .4; }));
  setTimeout(() => { f.remove(); bumpCount(to, w); }, 620);
}
function finish(R) {
  const tb = $('#table'), cat = S.q.cat || 'genel';
  const rows = [...$('#tally').children];
  rows.forEach(r => { if (!R.counts[r.dataset.id]) r.classList.add('zero'); });
  rows.sort((a, b) => (R.counts[b.dataset.id] || 0) - (R.counts[a.dataset.id] || 0)).forEach(r => $('#tally').appendChild(r));
  const names = R.win.map(id => id === ME.id ? 'Sen' : esc(P(id).n)).join(' & ');
  $('#verdict').innerHTML = R.win.length > 1 ? `Berabere: <em>${names}</em>` : `<em>${names}</em>, ${R.counts[R.win[0]]} oyla <span style="color:var(--ink-3)">%${R.pct}</span>`;
  R.win.forEach(id => { $(`.trow[data-id="${id}"]`)?.classList.add('win'); tb.querySelector(`.seat[data-id="${id}"]`)?.classList.add('winner'); });
  Object.keys(tb._pos || {}).forEach(id => !R.win.includes(id) && lookAt(tb, id, R.win[0]));
  sfx.fanfare(); vib([60, 40, 120]);
  $('#passline').textContent = R.pass.length ? (R.anon ? `${R.pass.length} kişi pas geçti` : `Pas geçen: ${R.pass.map(id => id === ME.id ? 'Sen' : P(id).n).join(', ')}`) : '';
  let t = fast ? 300 : 900;
  if (R.uni) { later(t, () => unanimousShow(R.win[0], R.seq.length ? (R.pairs ? R.pairs.map(p => p[0]) : null) : null, cat)); t += fast ? 2200 : 4400; }
  else if (R.win.length === 1 && R.pct >= 60 && R.total >= 2) { later(t, () => reaction(R.win[0], R.pct, cat)); t += fast ? 1700 : 3300; }
  if (!R.anon && R.pairs) {
    later(t, () => $('#verdict').insertAdjacentHTML('beforeend', '<span class="lbl">Kim kime verdi ↓</span>')); t += 400;
    rows.forEach(r => R.pairs.filter(p => p[1] === r.dataset.id).forEach(([from, , w]) => {
      later(t, () => { const v = r.querySelector('.voters'); v.insertAdjacentHTML('beforeend', `<span>${avatar(charOf(from))}${from === ME.id ? 'Sen' : esc(P(from).n)}${w > 1 ? ' <b class="x2mini">2x</b>' : ''}</span>`); sfx.drop(v.children.length); });
      t += fast ? 110 : 380;
    }));
  }
  showNext(t);
}
function decorate(id, cat) {
  deco[id] = deco[id] || {};
  if (cat === 'komik') deco[id].clown = true; else deco[id].badge = CATEGORIES[cat].e;
  const tb = $('#table'), seat = tb && tb.querySelector(`.seat[data-id="${id}"]`);
  if (seat) { seat.querySelector('svg.av').outerHTML = avatar(charOf(id), { cls: 'av' }); seat.querySelector('.badge')?.remove(); if (deco[id].badge) seat.insertAdjacentHTML('beforeend', `<span class="badge">${deco[id].badge}</span>`); }
  const tav = $(`.trow[data-id="${id}"] .tav`); if (tav) tav.innerHTML = avatar(charOf(id));
  if (id === ME.id) meMenu.refresh();
}
function rain(e, n, spread) {
  for (let i = 0; i < n; i++) {
    const x = document.createElement('span'); x.className = 'rain'; x.textContent = e;
    x.style.left = Math.random() * 100 + 'vw'; x.style.fontSize = (16 + Math.random() * 34) + 'px';
    x.style.animationDuration = (2.2 + Math.random() * 2.5) + 's'; x.style.animationDelay = (Math.random() * spread) + 's';
    document.body.appendChild(x); setTimeout(() => x.remove(), (spread + 5) * 1000);
  }
}
function reaction(id, pct, cat) {
  const C = CATEGORIES[cat]; decorate(id, cat);
  const r = document.createElement('div'); r.className = 'react';
  r.innerHTML = `<div class="big">${C.e}</div><div class="cap"><small>%${pct} · ${C.ad}</small>${C.tepki}: ${id === ME.id ? 'Sen' : esc(P(id).n)}</div>`;
  if (fast) r.style.animationDuration = '1.6s';
  document.body.appendChild(r); setTimeout(() => r.remove(), fast ? 1600 : 3300);
  reactionMusic(cat, S.r); vib([80, 50, 80]); rain(C.e, fast ? 8 : 14, .8);
}
function handSvg(skin) {
  return `<svg viewBox="0 0 60 40"><g fill="${skin}" stroke="#0F1B3D" stroke-width="2.2" stroke-linejoin="round"><rect x="1" y="11" width="9" height="20" rx="3" fill="#fff"/><rect x="8" y="8" width="26" height="26" rx="11"/><rect x="26" y="9" width="32" height="10" rx="5"/><rect x="15" y="2" width="15" height="10" rx="5" transform="rotate(-12 22 7)"/></g><path d="M21 21.5 h10 M21 27.5 h10" stroke="#0F1B3D" stroke-width="1.8" stroke-linecap="round" opacity=".5"/></svg>`;
}
function unanimousShow(target, voterIds, cat) {
  const C = CATEGORIES[cat], tb = $('#table');
  // anonimde bile oy birliğinde kimin kime verdiği zaten belli: hedef dışındaki herkes
  const voters = (voterIds || seatOrder().filter(id => !S.rv.pass.includes(id))).filter(id => id !== target);
  voters.forEach((id, i) => later(fast ? 0 : i * 140, () => {
    const seat = tb.querySelector(`.seat[data-id="${id}"]`); if (!seat || !tb._pos[id] || !tb._pos[target]) return;
    const a = tb._pos[id], b = tb._pos[target], dx = (b.x - a.x) * tb.clientWidth / 100, dy = (b.y - a.y) * tb.clientHeight / 100;
    const hnd = document.createElement('div'); hnd.className = 'phand';
    hnd.style.setProperty('--a', (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1) + 'deg'); hnd.style.setProperty('--f', dx < 0 ? -1 : 1);
    hnd.innerHTML = handSvg(P(id).c.skin); seat.appendChild(hnd); lookAt(tb, id, target); if (!fast) sfx.soft();
  }));
  decorate(target, cat);
  $('#verdict').innerHTML = `Oy birliği: <em>${target === ME.id ? 'Sen' : esc(P(target).n)}</em>`;
  later(fast ? 200 : voters.length * 140 + 500, () => {
    const r = document.createElement('div'); r.className = 'react uni';
    r.innerHTML = `<div class="big">${C.e}</div><div class="cap"><small>Oy birliği · ${C.ad}</small>Herkes aynı kişiyi gösterdi: ${target === ME.id ? 'Sen' : esc(P(target).n)}</div>`;
    if (fast) r.style.animationDuration = '2s';
    document.body.appendChild(r); setTimeout(() => r.remove(), fast ? 2000 : 4200);
    reactionMusic(cat, null); vib([120, 60, 120, 60, 200]); rain(C.e, fast ? 40 : 80, fast ? .6 : 2.2);
  });
}
function showNext(after) {
  later(after, () => {
    const box = $('#nextCtl'); if (!box) return;
    const last = !S.deckLeft && S.set.mode === 'hazir';
    box.innerHTML = isHost()
      ? `<button class="btn w full" id="btnNext">${last ? 'Sonuçlara geç 🏆' : !S.deckLeft ? 'Yeni kartları yazalım ✍️' : 'Sıradaki kart →'}</button>`
      : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>Yönetici sıradaki kartı açacak</div>`;
    if (isHost()) $('#btnNext').onclick = () => { sfx.soft(); hostNext(); };
  });
}

/* ---------- SON ---------- */
// kategori kimliği: her oyuncunun en yüksek oranla seçildiği kategori
function categoryIdentity() {
  const st = S.stats || {}, lead = [], ident = {};
  Object.entries(st).forEach(([cat, x]) => {
    if (!x.total || !CATEGORIES[cat]) return;
    const max = Math.max(0, ...Object.values(x.by));
    const ids = Object.keys(x.by).filter(id => x.by[id] === max && S.players[id]);   // beraberlikte hepsi
    if (max && ids.length) lead.push({ cat, ids, n: max, rate: Math.round(max / x.total * 100) });
    Object.entries(x.by).forEach(([id, n]) => {
      const rate = n / x.total, cur = ident[id];
      if (!cur || rate > cur.rate || (rate === cur.rate && n > cur.n)) ident[id] = { cat, rate, n };
    });
  });
  lead.sort((a, b) => b.rate - a.rate || b.n - a.n);
  return { lead, ident };
}
function nightHtml() {
  const N = S.night; if (!N || !N.rounds) return '';
  const alive = id => !!S.players[id];
  const best = (obj, { min = 1, asc = false } = {}) => {
    const e = Object.entries(obj || {}).filter(([id, v]) => alive(id) && v >= min); if (!e.length) return null;
    const v = asc ? Math.min(...e.map(x => x[1])) : Math.max(...e.map(x => x[1]));
    return { ids: e.filter(x => x[1] === v).map(x => x[0]), v };
  };
  const cards = [];
  // herkes eşitse (hepsi aynı değer) o istatistik bir şey anlatmaz, gösterme
  const add = (e, t, r, val) => { if (r && r.ids.length && r.ids.length < S.order.length) cards.push({ e, t, ids: r.ids.slice(0, 3), text: val(r.v) }); };
  add('🎯', 'Gecenin hedefi', best(N.recv), r => `${r} oy aldı`);
  add('🙈', 'Pas ustası', best(N.pass), r => `${r} kez pas geçti`);
  add('😏', 'Kendine aşık', best(N.self), r => `${r} kez kendine oy verdi`);
  add('✌️', '2x canavarı', best(N.x2), r => `${r} kez 2x bastı`);
  const avg = {}; Object.entries(N.time).forEach(([id, [sum, n]]) => { if (n >= 2) avg[id] = Math.round(sum / n / 100) / 10; });
  if (Object.keys(avg).filter(alive).length >= 2) {
    const f = best(avg, { min: 0, asc: true }), sl = best(avg, { min: 0 });
    if (f && sl && f.v !== sl.v) { add('⚡', 'Işık hızı', f, r => `ortalama ${r} sn'de karar verdi`); add('🐢', 'Düşünür', sl, r => `ortalama ${r} sn düşündü`); }
  }
  add('🐑', 'Sürüye uyan', best(N.agree, { min: 2 }), r => `${r} kez kazanana oy verdi`);
  add('🦄', 'Muhalif', best(N.disagree, { min: 2 }), r => `${r} kez ters köşe yaptı`);
  const mu = best(N.mutual);
  if (mu) { const [a, b] = mu.ids[0].split('|'); if (alive(a) && alive(b)) cards.push({ e: '💞', t: 'Birbirini gösterenler', ids: [a, b], text: `${mu.v} kez karşılıklı oy`, pair: true }); }
  add('🙌', 'Oy birliği kurbanı', best(N.uni), r => `${r} kez herkes onu gösterdi`);
  if (N.rounds >= 3) { const angels = S.order.filter(id => alive(id) && !N.recv[id]); if (angels.length && angels.length < S.order.length) cards.push({ e: '😇', t: 'Masanın meleği', ids: angels.slice(0, 3), text: 'hiç oy almadı' }); }
  if (!cards.length) return '';
  const names = c => c.ids.map(nameOf).join(c.pair ? ' ↔ ' : ', ');
  return `<div class="rule">Gecenin özeti</div>
    <div class="night">${cards.map(c => `<div class="nstat"><span class="ne">${c.e}</span><div class="nt">${c.t}</div>
      <div class="nwho"><span class="nav">${c.ids.map(id => avatar(charOf(id))).join('')}</span><b>${names(c)}</b></div><small>${c.text}</small></div>`).join('')}</div>
    ${N.open < N.rounds ? `<p class="nfoot">Anonim turlar, kimin kime oy verdiğini gösteren sayılara katılmadı.</p>` : ''}`;
}
build.end = () => {
  const ids = seatOrder();
  const by = [...ids].sort((a, b) => (S.titles[b] || []).length - (S.titles[a] || []).length);
  const top = by[0], topN = top ? (S.titles[top] || []).length : 0;
  const { lead, ident } = categoryIdentity();
  const identHtml = id => {
    const x = ident[id]; if (!x || !S.players[id]) return '';
    const C = CATEGORIES[x.cat];
    return `<div class="ident"><span class="ie">${C.e}</span><div><b>${C.tepki}</b><small>${C.ad} sorularındaki oyların %${Math.round(x.rate * 100)}'i</small></div></div>`;
  };
  app.innerHTML = `<section class="screen"><div class="modewrap">
    <div class="endhero">${topN ? avatar(charOf(top)) : ''}<h2>${topN ? `<em>${nameOf(top)}</em>, gecenin yıldızı` : 'Oyun bitti'}</h2>
      <p class="sub">${topN ? topN + ' ünvanla masanın en çok seçileni' : 'Hiç ünvan çıkmadı'}</p></div>
    ${nightHtml()}
    <div class="rule">Kim neymiş?</div>
    <div class="glass awards" style="padding:4px 16px">${by.map(id => {
      const t = S.titles[id] || [];
      return `<div class="aw">${avatar(charOf(id))}<div style="min-width:0;flex:1"><div class="n">${nameOf(id)}${id === top && topN ? '<span class="crownb">KRAL</span>' : ''}</div>
        ${identHtml(id)}
        <ul>${t.length ? t.map(x => `<li>${esc(x)}</li>`).join('') : '<li>Tertemiz çıktı 😇</li>'}</ul></div></div>`;
    }).join('')}</div>
    ${lead.length ? `<div class="rule" style="margin-top:22px">Kategori liderleri</div>
    <div class="glass leaders">${lead.map(l => { const C = CATEGORIES[l.cat]; return `<div class="ld"><span class="ie">${C.e}</span>
      <div class="lt"><b>${C.ad}</b><small>${C.tepki}</small></div><span class="lav">${l.ids.slice(0, 3).map(id => avatar(charOf(id))).join('')}</span><div class="lw"><b>${l.ids.map(nameOf).join(', ')}</b><small>%${l.rate} · ${l.n} oy${l.ids.length > 1 ? ' · berabere' : ''}</small></div></div>`; }).join('')}</div>` : ''}
    <div style="margin-top:18px;display:grid;gap:10px" id="endCtl"></div>
  </div></section>`;
  rain('🎉', fast ? 20 : 40, 1.5); sfx.fanfare();
};
update.end = () => {
  $('#endCtl').innerHTML = isHost()
    ? `<button class="btn w full" id="btnAgain">Yeni oyun, lobiye dön 🔁</button>`
    : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span>Yönetici yeni oyun açabilir</div><button class="btn g full sm" id="btnLeave">Odadan çık</button>`;
  if ($('#btnAgain')) $('#btnAgain').onclick = hostNewGame;
  if ($('#btnLeave')) $('#btnLeave').onclick = () => leaveRoom();
};

/* ---------- başlangıç ---------- */
preload(SOUNDS);
(function boot() {
  const code = normCode(new URLSearchParams(location.search).get('oda'));
  const saved = loadJ('kd2_host'), last = loadJ('kd2_last');
  if (code && saved && saved.room === code && saved.S && saved.S.host === ME.id && saved.S.phase !== 'closed' && Date.now() - saved.S.ts < 3 * 3600e3) return resumeHost(saved);
  if (code && last && last.room === code && Date.now() - last.at < 3 * 3600e3) return joinRoom(code);   // sayfa yenilendiyse odaya geri gir
  showHome();
})();
