/* Kim Daha? — ortak parçalar: karakter çizimi, sesler, küçük yardımcılar */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- karakter ---------- */
const SKINS = ['#FFC94D', '#7BD3F7', '#B8F28A', '#FFA36C', '#C8A6FF', '#8EE6D0', '#F7D6B5', '#FF9E9E', '#9FB4FF', '#E8E8E8'];
const EYES = { normal: 'Normal', lashes: 'Kirpikli', sleepy: 'Uykulu', happy: 'Mutlu', wink: 'Göz kırpan' };
const MOUTHS = { smile: 'Gülüş', grin: 'Sırıtış', o: 'Şaşkın', smirk: 'Sinsi', flat: 'Düz', tongue: 'Dil' };
const ACCS = {
  none: 'Yok', shades: 'Güneş gözlüğü', glasses: 'Gözlük', monocle: 'Monokl', party: 'Parti şapkası', crown: 'Taç',
  beanie: 'Bere', cap: 'Kep', tophat: 'Silindir', cowboy: 'Kovboy', wizard: 'Büyücü', chef: 'Aşçı', viking: 'Viking',
  catears: 'Kedi kulağı', bunny: 'Tavşan kulağı', bow: 'Fiyonk', flower: 'Çiçek', sprout: 'Filiz', horns: 'Boynuz',
  halo: 'Hale', headphones: 'Kulaklık', mustache: 'Bıyık',
};
const MOUTH_SVG = {
  smile: '<path d="M41 69 Q50 77 59 69" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/>',
  grin: '<path d="M39 66 Q50 81 61 66 Z" fill="#0F1B3D"/><path d="M43 70 Q50 75 57 70" fill="#FF6B9E"/>',
  o: '<ellipse cx="50" cy="70" rx="4.5" ry="5.5" fill="#0F1B3D"/>',
  smirk: '<path d="M42 70 Q52 72 60 65" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/>',
  flat: '<path d="M43 70 H57" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/>',
  tongue: '<path d="M41 68 Q50 75 59 68" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/><path d="M47 71 Q47 79 51.5 79 Q56 79 55 71 Z" fill="#FF6B9E" stroke="#0F1B3D" stroke-width="1.6"/>',
};
const ACC_SVG = {
  none: '',
  glasses: '<g fill="rgba(255,255,255,.25)" stroke="#0F1B3D" stroke-width="2.6"><circle cx="38" cy="52" r="10"/><circle cx="62" cy="52" r="10"/><path d="M48 52 H52"/></g>',
  shades: '<g stroke="#0F1B3D" stroke-width="2.6"><rect x="26" y="43" width="22" height="17" rx="6" fill="rgba(15,27,61,.42)"/><rect x="52" y="43" width="22" height="17" rx="6" fill="rgba(15,27,61,.42)"/><path d="M48 50 H52" fill="none"/></g><path d="M30 47 l5 0" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/><path d="M56 47 l5 0" stroke="#fff" stroke-width="2" opacity=".55" stroke-linecap="round"/>',
  monocle: '<circle cx="62" cy="52" r="10.5" fill="rgba(255,255,255,.2)" stroke="#E0A400" stroke-width="2.6"/><path d="M71 57 Q76 70 70 82" fill="none" stroke="#E0A400" stroke-width="1.6"/>',
  party: '<path d="M50 2 L36 28 L64 28 Z" fill="#FF3D8B"/><path d="M42 18 L58 18 M39 23 L61 23" stroke="#fff" stroke-width="2.5"/><circle cx="50" cy="3" r="5" fill="#FFC94D"/>',
  crown: '<path d="M30 26 L34 8 L42 18 L50 4 L58 18 L66 8 L70 26 Z" fill="#FFC94D" stroke="#E0A400" stroke-width="2" stroke-linejoin="round"/><circle cx="50" cy="19" r="3" fill="#FF3D8B"/>',
  beanie: '<path d="M16 40 Q16 10 50 10 Q84 10 84 40 Z" fill="#3a5bd9"/><rect x="14" y="34" width="72" height="10" rx="5" fill="#2a47b8"/><circle cx="50" cy="8" r="7" fill="#fff"/>',
  cap: '<path d="M18 38 Q20 12 50 12 Q78 12 82 38 Z" fill="#FF3D8B"/><path d="M50 36 Q80 34 96 42 Q78 46 50 42 Z" fill="#d92a72"/><circle cx="50" cy="13" r="3" fill="#d92a72"/>',
  tophat: '<rect x="33" y="0" width="34" height="26" rx="2" fill="#0F1B3D"/><rect x="33" y="18" width="34" height="5" fill="#FF3D8B"/><rect x="22" y="24" width="56" height="6" rx="3" fill="#0F1B3D"/>',
  cowboy: '<path d="M8 30 Q50 42 92 30 Q86 38 50 40 Q14 38 8 30 Z" fill="#9b6a3c"/><path d="M28 32 Q30 8 42 10 Q50 16 58 10 Q70 8 72 32 Z" fill="#b07a45"/><path d="M29 27 Q50 32 71 27" stroke="#5b3a1c" stroke-width="3" fill="none"/>',
  wizard: '<path d="M50 -4 L30 30 L72 30 Z" fill="#5b3fd1"/><path d="M50 -4 Q62 4 66 0" fill="none" stroke="#5b3fd1" stroke-width="5" stroke-linecap="round"/><ellipse cx="51" cy="30" rx="30" ry="5" fill="#4a30b8"/><path d="M46 14 l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#FFC94D"/>',
  chef: '<rect x="28" y="20" width="44" height="12" rx="2" fill="#fff" stroke="#dfe3ee" stroke-width="1.5"/><circle cx="36" cy="14" r="10" fill="#fff"/><circle cx="50" cy="9" r="11" fill="#fff"/><circle cx="64" cy="14" r="10" fill="#fff"/>',
  viking: '<path d="M18 40 Q18 14 50 14 Q82 14 82 40 Z" fill="#9aa4b8"/><rect x="16" y="34" width="68" height="8" rx="3" fill="#6f7a90"/><path d="M20 30 Q6 22 10 4 Q16 20 26 22 Z M80 30 Q94 22 90 4 Q84 20 74 22 Z" fill="#f4ead2" stroke="#cdbf9b" stroke-width="1.5"/>',
  catears: '<path d="M18 36 L22 8 L42 24 Z M82 36 L78 8 L58 24 Z" fill="#0F1B3D"/><path d="M23 28 L25 15 L35 24 Z M77 28 L75 15 L65 24 Z" fill="#FF3D8B"/>',
  bunny: '<ellipse cx="36" cy="10" rx="7" ry="20" fill="#fff" transform="rotate(-12 36 20)"/><ellipse cx="64" cy="10" rx="7" ry="20" fill="#fff" transform="rotate(12 64 20)"/><ellipse cx="36" cy="11" rx="3.4" ry="14" fill="#FF9EC2" transform="rotate(-12 36 20)"/><ellipse cx="64" cy="11" rx="3.4" ry="14" fill="#FF9EC2" transform="rotate(12 64 20)"/>',
  bow: '<g transform="translate(70 22) rotate(20)"><path d="M0 0 L-14 -9 L-14 9 Z M0 0 L14 -9 L14 9 Z" fill="#FF3D8B"/><circle r="4" fill="#d92a72"/></g>',
  flower: '<g transform="translate(76 28)"><circle r="5" cx="0" cy="-7" fill="#fff"/><circle r="5" cx="7" cy="0" fill="#fff"/><circle r="5" cx="0" cy="7" fill="#fff"/><circle r="5" cx="-7" cy="0" fill="#fff"/><circle r="4.5" fill="#FFC94D"/></g>',
  sprout: '<path d="M50 20 Q50 12 50 6" stroke="#2f9e5b" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M50 10 Q38 0 32 8 Q40 16 50 10 Z" fill="#46c172"/><path d="M50 8 Q60 -2 68 4 Q62 14 50 8 Z" fill="#5ad68a"/>',
  horns: '<path d="M26 26 Q18 10 26 2 Q30 14 38 20 Z" fill="#E5484D"/><path d="M74 26 Q82 10 74 2 Q70 14 62 20 Z" fill="#E5484D"/>',
  halo: '<ellipse cx="50" cy="10" rx="22" ry="6" fill="none" stroke="#FFC94D" stroke-width="4"/>',
  headphones: '<path d="M16 54 Q16 12 50 12 Q84 12 84 54" fill="none" stroke="#0F1B3D" stroke-width="5"/><rect x="9" y="46" width="13" height="20" rx="6" fill="#FF3D8B"/><rect x="78" y="46" width="13" height="20" rx="6" fill="#FF3D8B"/>',
  mustache: '<path d="M50 63 Q42 58 35 63 Q40 68 50 65 Q60 68 65 63 Q58 58 50 63 Z" fill="#3b2a1a"/>',
};
const HAIRS = { none: 'Saçsız', short: 'Kısa', side: 'Yan ayrık', spiky: 'Diken', curly: 'Kıvırcık', long: 'Uzun', pony: 'At kuyruğu', bun: 'Topuz', pigtails: 'İki örgü' };
const HAIR_COLORS = ['#3b2a1a', '#141a2e', '#c98b3c', '#b6452c', '#FF3D8B', '#7b5cff', '#e9e4dc'];
function hairSvg(style, col) {
  const F = `fill="${col}"`;
  const fringe = `<path ${F} d="M15 48 Q14 18 50 18 Q86 18 85 48 Q76 30 56 30 Q60 38 48 40 Q40 32 28 34 Q18 38 15 48Z"/>`;
  const shortTop = `<path ${F} d="M14 50 Q12 16 50 16 Q88 16 86 50 Q80 34 66 30 Q50 38 34 30 Q20 34 14 50 Z"/>`;
  switch (style) {
    case 'short': return { front: shortTop };
    case 'side': return { front: `<path ${F} d="M14 50 Q12 16 50 16 Q88 16 86 50 Q86 36 70 28 Q40 30 22 40 Q16 44 14 50Z"/>` };
    case 'spiky': return { front: `<path ${F} d="M16 46 L18 26 L28 30 L32 14 L42 24 L50 10 L58 24 L68 14 L72 30 L82 26 L84 46 Q70 30 50 32 Q30 30 16 46Z"/>` };
    case 'curly': return { front: `<g ${F}>${[[18,42,9],[22,30,10],[31,21,10],[42,16,10],[54,15,10],[65,19,10],[75,27,10],[81,39,9]].map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>` };
    case 'long': return { back: `<path ${F} d="M14 50 Q12 14 50 14 Q88 14 86 50 L88 88 Q80 94 72 88 L70 62 L30 62 L28 88 Q20 94 12 88 Z"/>`, front: fringe };
    case 'pony': return { back: `<ellipse ${F} cx="85" cy="44" rx="9" ry="18" transform="rotate(28 85 44)"/>`, front: fringe + `<circle cx="78" cy="30" r="3.5" fill="#FF3D8B"/>` };
    case 'bun': return { back: `<circle ${F} cx="50" cy="13" r="11"/>`, front: fringe };
    case 'pigtails': return { back: `<ellipse ${F} cx="14" cy="62" rx="8" ry="16" transform="rotate(12 14 62)"/><ellipse ${F} cx="86" cy="62" rx="8" ry="16" transform="rotate(-12 86 62)"/>`, front: fringe + `<circle cx="18" cy="48" r="3.2" fill="#FF3D8B"/><circle cx="82" cy="48" r="3.2" fill="#FF3D8B"/>` };
    default: return {};
  }
}
let _aid = 0;
/* c = { skin, eyes, mouth, acc, clown }  opt = { look:[dx,dy], cls } */
function avatar(c, opt = {}) {
  const id = 'g' + (++_aid);
  const look = opt.look || [0, 0];
  const eyes = c.eyes || 'normal';
  const hair = hairSvg(c.hair || 'none', c.hairColor || HAIR_COLORS[0]);
  let eyeSvg;
  if (eyes === 'sleepy') eyeSvg = '<g class="pupils"><path d="M31 53 Q38 58 45 53" fill="none" stroke="#0F1B3D" stroke-width="3" stroke-linecap="round"/><path d="M55 53 Q62 58 69 53" fill="none" stroke="#0F1B3D" stroke-width="3" stroke-linecap="round"/></g>';
  else if (eyes === 'happy') eyeSvg = '<g class="pupils"><path d="M31 55 Q38 46 45 55" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/><path d="M55 55 Q62 46 69 55" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/></g>';
  else {
    const right = eyes === 'wink'
      ? '<path d="M55 53 Q62 57 69 53" fill="none" stroke="#0F1B3D" stroke-width="3.2" stroke-linecap="round"/>'
      : '<ellipse cx="62" cy="52" rx="7.5" ry="8.5" fill="#fff"/>';
    const rp = eyes === 'wink' ? '' : '<circle cx="62" cy="53" r="4.2" fill="#0F1B3D"/><circle cx="63.5" cy="51.5" r="1.3" fill="#fff"/>';
    const lash = eyes === 'lashes' ? '<g stroke="#0F1B3D" stroke-width="2.2" stroke-linecap="round"><path d="M31 46 l-3.5 -3"/><path d="M34.5 43.8 l-2 -3.6"/><path d="M69 46 l3.5 -3"/><path d="M65.5 43.8 l2 -3.6"/></g>' : '';
    eyeSvg = `${lash}<ellipse cx="38" cy="52" rx="7.5" ry="8.5" fill="#fff"/>${right}
      <g class="pupils" style="transform:translate(${look[0]}px,${look[1]}px)"><circle cx="38" cy="53" r="4.2" fill="#0F1B3D"/><circle cx="39.5" cy="51.5" r="1.3" fill="#fff"/>${rp}</g>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="${opt.cls || ''}" aria-hidden="true">
    <defs><radialGradient id="${id}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    ${hair.back || ''}
    <circle cx="50" cy="55" r="36" fill="${c.skin}"/><circle cx="50" cy="55" r="36" fill="url(#${id})"/>
    ${hair.front || ''}
    <ellipse cx="31" cy="64" rx="6" ry="3.5" fill="#FF3D8B" opacity=".28"/><ellipse cx="69" cy="64" rx="6" ry="3.5" fill="#FF3D8B" opacity=".28"/>
    ${eyeSvg}
    ${MOUTH_SVG[c.mouth] || MOUTH_SVG.smile}
    ${c.clown ? '<g fill="#FF3D8B"><circle cx="17" cy="38" r="9"/><circle cx="12" cy="50" r="8"/><circle cx="83" cy="38" r="9"/><circle cx="88" cy="50" r="8"/></g><circle cx="50" cy="60" r="5.8" fill="#E5484D"/><circle cx="48" cy="58.4" r="1.8" fill="#fff" opacity=".7"/>' : ''}
    ${ACC_SVG[c.acc] || ''}
  </svg>`;
}
const randomChar = (takenAcc = [], takenSkin = []) => ({ skin: pick(SKINS.filter(x => !takenSkin.includes(x))), eyes: pick(Object.keys(EYES)), mouth: pick(Object.keys(MOUTHS)), hair: pick(Object.keys(HAIRS)), hairColor: pick(HAIR_COLORS), acc: pick(Object.keys(ACCS).filter(a => a !== 'none' && !takenAcc.includes(a))) });

/* ---------- sesler ----------
   Gerçek kayıtlar: Kenney (CC0) — ../ses klasöründe.
   Siteden açılınca WebAudio ile, dosyadan (file://) açılınca <audio> ile çalar. */
let muted = false, _ac = null;
try { muted = localStorage.getItem('kd_mute') === '1'; } catch {}
const SES = (window.SES_YOLU || '../ses/');
const actx = () => { if (!_ac) try { _ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {} if (_ac && _ac.state === 'suspended') _ac.resume(); return _ac; };
document.addEventListener('pointerdown', actx, { once: true });
const _buf = {}, _loading = {};
function _load(name) {
  if (_buf[name] || _loading[name] || location.protocol === 'file:') return;
  const a = actx(); if (!a) return;
  _loading[name] = fetch(SES + name + '.mp3').then(r => r.arrayBuffer()).then(b => a.decodeAudioData(b)).then(d => { _buf[name] = d; }).catch(() => {});
}
function play(name, { vol = .5, rate = 1, at = 0 } = {}) {
  if (muted) return;
  const a = actx();
  if (a && _buf[name]) {
    const s = a.createBufferSource(), g = a.createGain(); s.buffer = _buf[name]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g).connect(a.destination); s.start(a.currentTime + at); return;
  }
  _load(name);
  const el = new Audio(SES + name + '.mp3'); el.volume = Math.min(1, vol); el.playbackRate = rate; el.preservesPitch = false;
  setTimeout(() => el.play().catch(() => {}), at * 1000);
}
function preload(names) { names.forEach(_load); }
const pickOf = (base, n) => base + '-' + (1 + Math.floor(Math.random() * n));

function tone(f, d, type = 'sine', v = .12, at = 0, slide) {
  if (muted) return; const a = actx(); if (!a) return; const t = a.currentTime + at;
  const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0008, t + d); o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, v = .2, at = 0, from = 3000, to = 400) {
  if (muted) return; const a = actx(); if (!a) return; const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.max(1, a.sampleRate * d), a.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'bandpass';
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d); g.gain.value = v;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

const sfx = {
  pick()    { play('soft-pick', { vol: .45 }); },                         // kart seçme: yumuşak, boğuk kart dokunuşu
  unpick()  { play('soft-pick', { vol: .25, rate: .9 }); },
  soft()    { play('soft-pick', { vol: .25, rate: 1.1 }); },
  put()     { play('soft-place', { vol: .55 }); },                        // kartı masaya koyma
  land()    { play('soft-place', { vol: .2, rate: 1.05 }); },             // başkasının kartı masaya düşer
  deal(i=0) { play('soft-deal', { vol: .25, at: i * .07 }); },
  fan()     { play('soft-deal', { vol: .4, rate: .9 }); },
  shuffle() { play('soft-shuffle', { vol: .45 }); },
  flip()    { play('soft-deal', { vol: .45, rate: .85 }); play('soft-place', { vol: .25, at: .18 }); },
  flipCard(){ play('soft-deal', { vol: .5 }); },
  hit()     { tone(110, .35, 'sine', .18, 0, 55); },
  count()   { play(pickOf('chip-lay', 2), { vol: .3 }); },               // sayaç artınca fiş sesi
  join()    { play('pluck_001', { vol: .3 }); },
  tick(hi)  { play(hi ? 'tick_002' : 'tick_001', { vol: hi ? .45 : .3 }); },
  pass()    { play('drop_002', { vol: .25, rate: .8 }); },
  whoosh()  { play('soft-deal', { vol: .35 }); },
  start()   { play('chips-stack-1', { vol: .3 }); },
  drop(i=0) { play('chip-lay-2', { vol: .2, rate: 1 + i * .06 }); },
  drum(sec) { for (let i = 0; i < sec * 14; i++) { noise(.05, .03 + i / (sec * 14) * .08, i / 14, 700, 180); tone(70, .05, 'sine', .06, i / 14); } },
  fanfare() { play('chips-collide-1', { vol: .28 }); },
};
const SOUNDS = ['soft-pick', 'soft-place', 'soft-deal', 'soft-shuffle', 'chip-lay-1', 'chip-lay-2', 'pluck_001', 'tick_001', 'tick_002', 'drop_002', 'chips-stack-1', 'chips-collide-1'];

/* ---------- hızlı mod: uzun animasyonları atlar (kişi başı ayar, tarayıcıda saklanır) ---------- */
let fast = false;
try { fast = localStorage.getItem('kd_fast') === '1'; } catch {}
/* ---------- köşedeki "ben" menüsü: kendi karakterin = ayarlar düğmesi ---------- */
const ICON = {
  sesKapali: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  hizli: '<svg viewBox="0 0 24 24"><path d="M13 2.5 5.5 13.5H11l-1 8 7.5-11H12z"/></svg>',
};
const ME_MENU_CSS = `
.memount{position:relative}
.mebtn{position:relative;display:block;width:44px;height:44px;padding:0;border-radius:50%;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}
.mebtn > svg{width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
.mebtn:hover{transform:translateY(-2px) rotate(-6deg)}
.mebtn[aria-expanded="true"]{transform:scale(1.08)}
.mebtn .badges{position:absolute;right:-4px;bottom:-2px;display:flex;gap:2px}
.mebtn .badges i{width:17px;height:17px;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 0 2px #0F1B3D}
.mebtn .badges i svg{width:10px;height:10px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.mebtn .b-fast{background:#FF3D8B}.mebtn .b-mute{background:#52608a}
.memenu{font-family:'Geist',system-ui,sans-serif;font-size:15px;position:absolute;right:0;top:54px;width:264px;padding:8px;border-radius:14px;background:rgba(22,36,77,.94);border:1px solid rgba(255,255,255,.12);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 30px 60px -20px rgba(0,0,0,.75);transform-origin:top right;z-index:80;
  animation:mmIn .28s cubic-bezier(.3,1.4,.5,1)}
.memenu[hidden]{display:none}
@keyframes mmIn{from{opacity:0;transform:scale(.85) translateY(-6px)}}
.mm-who{display:flex;gap:10px;align-items:center;padding:6px 8px 12px;border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:4px}
.mm-who svg{width:42px;height:42px;flex:none}
.mm-who b{display:block;font-weight:500;font-size:15px;letter-spacing:-.02em}
.mm-who small{display:block;color:rgba(255,255,255,.4);font-size:12px;margin-top:1px}
.mm-row{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 8px;border-radius:8px;font-size:15px;text-align:left;color:#fff}
.mm-row:hover{background:rgba(255,255,255,.06)}
.mm-row small{display:block;color:rgba(255,255,255,.4);font-size:12px;margin-top:2px}
.mm-info{cursor:default}.mm-info:hover{background:none}
.mm-val{color:rgba(255,255,255,.62);font-size:13px;white-space:nowrap}
.mm-row .arr{font-family:'Geist Mono',monospace;color:rgba(255,255,255,.6)}
.mm-sw{flex:none;width:44px;height:26px;border-radius:99px;background:rgba(255,255,255,.15);position:relative;transition:.25s}
.mm-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.25s cubic-bezier(.3,1.5,.5,1)}
.mm-sw.on{background:#FF3D8B}.mm-sw.on:after{left:21px}
`;
function mountMeMenu(host, { getChar, getName, onFast, onEdit }) {
  if (!document.getElementById('me-menu-css')) { const st = document.createElement('style'); st.id = 'me-menu-css'; st.textContent = ME_MENU_CSS; document.head.appendChild(st); }
  host.classList.add('memount');
  host.innerHTML = `<button class="mebtn" aria-haspopup="true" aria-expanded="false" aria-label="Ayarlar ve karakterin"></button>
    <div class="memenu" role="menu" hidden>
      <div class="mm-who"></div>
      <button class="mm-row" data-k="ses"><span>Ses</span><span class="mm-sw"></span></button>
      <div class="mm-row mm-info"><span>Animasyonlar<small>Yönetici oyun başında seçer</small></span><span class="mm-val"></span></div>
      <button class="mm-row" data-k="edit"><span>Karakterimi düzenle</span><span class="arr">→</span></button>
    </div>`;
  const btn = host.querySelector('.mebtn'), menu = host.querySelector('.memenu');
  const isOpen = () => !menu.hidden;
  function refresh() {
    const c = getChar(), nm = (getName && getName()) || 'Sen';
    btn.innerHTML = avatar(c, { look: isOpen() ? [-2.5, 3] : [0, 0] }) +
      `<span class="badges">${fast ? `<i class="b-fast">${ICON.hizli}</i>` : ''}${muted ? `<i class="b-mute">${ICON.sesKapali}</i>` : ''}</span>`;
    menu.querySelector('.mm-who').innerHTML = `${avatar(c)}<div><b>${esc(nm)}</b><small>Ayarlar sadece bu cihazda geçerli</small></div>`;
    menu.querySelector('[data-k="ses"] .mm-sw').classList.toggle('on', !muted);
    menu.querySelector('.mm-val').textContent = fast ? 'Hızlı ⚡' : 'Tam';
  }
  const open = v => { menu.hidden = !v; btn.setAttribute('aria-expanded', v); refresh(); if (v) sfx.soft(); };
  btn.onclick = e => { e.stopPropagation(); open(!isOpen()); };
  menu.onclick = e => {
    e.stopPropagation();
    const r = e.target.closest('.mm-row'); if (!r) return;
    if (r.dataset.k === 'ses') { muted = !muted; try { localStorage.setItem('kd_mute', muted ? '1' : '0'); } catch {} if (!muted) sfx.soft(); }
    if (r.dataset.k === 'edit') { open(false); onEdit && onEdit(); return; }
    refresh();
  };
  document.addEventListener('click', () => { if (isOpen()) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) open(false); });
  refresh();
  return { refresh };
}
function setFast(v) { fast = !!v; try { localStorage.setItem('kd_fast', fast ? '1' : '0'); } catch {} document.body.classList.toggle('fast', fast); }
const dur = ms => fast ? Math.round(ms * .15) : ms;   // bekleme sürelerini hızlı modda kısalt
function vib(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

/* ---------- tepki müzikleri: hafif, kısa, arka planda ----------
   Palyaço: özgün, sentezlenmiş kısa karnaval (calliope) melodisi.
   Utanç: klasik "üzgün trombon". Diğerleri Kenney jingle'ları. */
function calliope(vol = .05) {
  const a = actx(); if (!a || muted) return;
  const t0 = a.currentTime + .05, beat = .22, master = a.createGain();
  master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(vol, t0 + .3);
  master.gain.setValueAtTime(vol, t0 + beat * 15); master.gain.linearRampToValueAtTime(0, t0 + beat * 19);
  master.connect(a.destination);
  const N = n => 440 * Math.pow(2, (n - 69) / 12);
  const organ = (midi, start, len, v = 1) => {
    [1, 2, 3, 4].forEach((h, i) => {
      const o = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      o.frequency.value = N(midi) * h; lfo.frequency.value = 6; lg.gain.value = 3 * h; lfo.connect(lg).connect(o.frequency);
      const amp = [.5, .28, .14, .07][i] * v;
      g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(amp, start + .015); g.gain.setValueAtTime(amp * .8, start + len * .7); g.gain.linearRampToValueAtTime(0, start + len);
      o.connect(g).connect(master); o.start(start); lfo.start(start); o.stop(start + len + .05); lfo.stop(start + len + .05);
    });
  };
  // 3/4 vals: um-pa-pa bas + oynak melodi (özgün)
  const mel = [[79,1],[76,1],[79,1],[78,1],[79,1],[81,1],[79,1],[76,1],[72,1],[74,2],[71,1],[72,1],[74,1],[76,1],[79,2],[72,1],[72,2]];
  let t = t0; mel.forEach(([m, d]) => { organ(m, t, beat * d * .92, .9); t += beat * d; });
  const bass = [48, 55, 55, 43, 55, 55, 48, 55, 55, 43, 53, 53, 48, 55, 55, 48, 52, 55];
  bass.forEach((m, i) => organ(i % 3 === 0 ? m : m + 12, t0 + i * beat, beat * .6, i % 3 === 0 ? .7 : .35));
}
function sadTrombone(vol = .06) {
  const a = actx(); if (!a || muted) return;
  const t0 = a.currentTime + .05, f = a.createBiquadFilter(), g = a.createGain(); f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol; f.connect(g).connect(a.destination);
  [[196, .45], [185, .45], [174.6, .45], [164.8, 1.4]].forEach(([hz, d], i, arr) => {
    const st = t0 + arr.slice(0, i).reduce((s, x) => s + x[1], 0), o = a.createOscillator(), e = a.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(hz, st);
    if (i === 3) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = 5.5; lg.gain.value = 4; l.connect(lg).connect(o.frequency); l.start(st); l.stop(st + d); }
    e.gain.setValueAtTime(0, st); e.gain.linearRampToValueAtTime(1, st + .05); e.gain.setValueAtTime(1, st + d * .75); e.gain.linearRampToValueAtTime(0, st + d);
    o.connect(e).connect(f); o.start(st); o.stop(st + d + .02);
  });
}
const CATEGORIES = {
  komik:     { e: '🤡', ad: 'Komik',     tepki: 'Masanın palyaçosu',  ses: () => calliope() },
  acimasiz:  { e: '😈', ad: 'Acımasız',  tepki: 'Masanın şeytanı',    ses: () => play('jingles_HIT15', { vol: .3, rate: .9 }) },
  ask:       { e: '💘', ad: 'Aşk',       tepki: 'Aşk kurbanı',        ses: () => play('jingles_SAX07', { vol: .3 }) },
  utanc:     { e: '🫣', ad: 'Utanç',     tepki: 'Utanç abidesi',      ses: () => sadTrombone() },
  pislik:    { e: '🤢', ad: 'Pis alışkanlık', tepki: 'Masanın en pisi',    ses: () => play('jingles_NES13', { vol: .22, rate: .85 }) },
  karaktersiz: { e: '🐀', ad: 'Karaktersizlik', tepki: 'Masanın pisliği', ses: () => play('jingles_NES05', { vol: .22, rate: .7 }) },
  hainlik:   { e: '🗡️', ad: 'Hainlik',   tepki: 'Masanın haini',      ses: () => play('jingles_HIT11', { vol: .3, rate: .85 }) },
  kurnazlik: { e: '🦊', ad: 'Kurnazlık', tepki: 'Masanın tilkisi',    ses: () => play('jingles_PIZZI07', { vol: .32 }) },
  sinsilik:  { e: '🐍', ad: 'Sinsilik',  tepki: 'Masanın yılanı',     ses: () => play('jingles_PIZZI03', { vol: .3, rate: .8 }) },
  drama:     { e: '🎭', ad: 'Drama',     tepki: 'Drama kraliçesi',    ses: () => play('jingles_HIT09', { vol: .3 }) },
  dedikodu:  { e: '👀', ad: 'Dedikodu',  tepki: 'Masanın radyosu',    ses: () => play('jingles_PIZZI01', { vol: .3 }) },
  tembellik: { e: '🦥', ad: 'Tembellik', tepki: 'Masanın tembeli',    ses: () => play('jingles_STEEL07', { vol: .28, rate: .7 }) },
  cimrilik:  { e: '💸', ad: 'Cimrilik',  tepki: 'Masanın cimrisi',    ses: () => { play('chips-stack-1', { vol: .35 }); play('jingles_NES05', { vol: .2, at: .25 }); } },
  ego:       { e: '🪞', ad: 'Ego',       tepki: 'Masanın narsisti',   ses: () => play('jingles_STEEL01', { vol: .28 }) },
  kaos:      { e: '🌪️', ad: 'Kaos',      tepki: 'Kaos ustası',        ses: () => play('jingles_NES00', { vol: .2 }) },
  gelecek:   { e: '🔮', ad: 'Gelecek',   tepki: 'Kader belli oldu',   ses: () => play('jingles_STEEL14', { vol: .28, rate: .85 }) },
  kampus:    { e: '🎓', ad: 'Kampüs',    tepki: 'Kampüs efsanesi',    ses: () => play('jingles_NES11', { vol: .2 }) },
  saflik:    { e: '😇', ad: 'Saflık',    tepki: 'Masanın meleği',     ses: () => play('jingles_STEEL12', { vol: .28 }) },
  baharatli: { e: '🌶️', ad: 'Baharatlı', tepki: 'Ateş topu 🔥',       ses: () => play('jingles_SAX03', { vol: .3 }) },
};
// Müzik her turda çalmasın: son tepki müziğinden sonra en az 2 tur geçmeli (görsel tepki yine çıkar)
let _lastMusicRound = -99;
function reactionMusic(cat, round) {
  if (round != null && round - _lastMusicRound < 2) return false;
  _lastMusicRound = round ?? _lastMusicRound; CATEGORIES[cat] && CATEGORIES[cat].ses(); return true;
}
