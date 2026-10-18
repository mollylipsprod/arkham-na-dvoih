/* Аркхэм на двоих — интерфейс, синхронизация (ntfy.sh) и ведущий (OpenRouter). */
(() => {
'use strict';
const E = window.Engine;
const { SEATS, SEAT_KEYS, LOCATIONS, CLUES, CLUE_ORDER, other } = E;
const NTFY = window.ARKHAM_NTFY || 'https://ntfy.sh';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

/* ---------- Утилиты ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*/g, '$1<em>$2</em>')
  .split(/\n\s*\n/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
const store = {
  get(k) { try { return localStorage.getItem('arkham2.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('arkham2.' + k, v); } catch {} },
  del(k) { try { localStorage.removeItem('arkham2.' + k); } catch {} }
};
const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
let cid = store.get('cid'); if (!cid) { cid = 'c' + rand(10); store.set('cid', cid); }
function toast(msg, ms = 3800) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms); }
function show(id) { for (const v of ['vTitle', 'vSetup', 'vLobby', 'vGame', 'vError']) $(v).hidden = v !== id; }
function patch(el, html) {
  if (el._html === html) return;
  const keep = {};
  el.querySelectorAll('textarea[id],input[id]').forEach(i => { if (i.dataset.dirty) keep[i.id] = i.value; });
  const a = document.activeElement, f = a && el.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  el.innerHTML = html; el._html = html;
  for (const id in keep) { const n = el.querySelector('#' + CSS.escape(id)); if (n) { n.value = keep[id]; n.dataset.dirty = '1'; } }
  if (f) { const n = el.querySelector('#' + CSS.escape(f.id)); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(f.s, f.e); } catch {} } }
}

/* Голосовой ввод (Web Speech API: Chrome, Safari, Edge) */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const Mic = { rec: null, base: '' };
const MIC_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z"/></svg>';
function micBtn(id) {
  if (!SR) return '';
  const on = A.micFor === id;
  return `<button class="icon-btn mic" data-a="mic" data-for="${id}" aria-pressed="${on}" title="${on ? 'Остановить запись' : 'Сказать голосом'}" aria-label="${on ? 'Остановить запись' : 'Сказать голосом'}">${MIC_SVG}</button>`;
}
function stopMic() { if (Mic.rec) { try { Mic.rec.stop(); } catch {} } }
function toggleMic(id) {
  if (Mic.rec && A.micFor === id) return stopMic();
  if (Mic.rec) { try { Mic.rec.abort(); } catch {} Mic.rec = null; }
  const el = $(id); if (!el) return;
  const rec = new SR();
  rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = true;
  Mic.base = el.value.trim() ? el.value.replace(/\s*$/, ' ') : '';
  rec.onresult = e => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    const t = $(id); if (!t) return;
    txt = txt.trim(); if (!Mic.base && txt) txt = txt[0].toUpperCase() + txt.slice(1);
    t.value = Mic.base + txt; t.dataset.dirty = '1';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Разреши доступ к микрофону в настройках браузера. Или нажми микрофон на клавиатуре телефона.');
    else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Голосовой ввод не сработал. Можно надиктовать через микрофон на клавиатуре.');
  };
  rec.onend = () => { if (Mic.rec === rec) { Mic.rec = null; A.micFor = null; scheduleRender(); } };
  try { rec.start(); } catch { return toast('Голосовой ввод сейчас недоступен.'); }
  Mic.rec = rec; A.micFor = id; scheduleRender();
}

const RULES = `<ol>
  <li><b>Вы напарники.</b> Сыщик силён в людях, допросах и замках. Оккультист — в нотах, старых книгах и том, что звучит за стенами. У каждого героя есть тайна, связанная с делом.</li>
  <li><b>Ночь идёт с 22:00 до 02:00.</b> Поездка по городу занимает час, их всего <b>три</b>, а мест четыре. Выбирайте, куда ехать. Говорить и искать на месте можно сколько угодно.</li>
  <li><b>Пишите или говорите, что делает ваш герой,</b> и жмите «Действовать». Кнопка с микрофоном включает голосовой ввод. Ведущий ответит. «Напарнику» — реплика для второго игрока без ответа ведущего.</li>
  <li><b>Риск — бросок кости.</b> 5–6: успех. 3–4: успех, но с ценой. 1–2: провал, а на единице минус одна свеча самообладания. Напарник может помочь: тогда бросаются две кости и берётся лучшая.</li>
  <li><b>Самообладание</b> — шесть свечей на двоих. Жуть их гасит, тёплые моменты зажигают.</li>
  <li><b>Шёпот.</b> Некоторые улики видит только один из вас. Делиться ими или нет, решаете вы.</li>
  <li><b>В полночь — такси.</b> Каждому достаётся вопрос от напарника. Отвечайте как герой или как вы сами. Запомните ответ напарника: в финале он пригодится.</li>
  <li><b>В 02:00 — финал</b> в комнате 3-Б. Чтобы вернуть пропавшую, придётся сказать правду друг о друге.</li>
  <li><b>Стоп</b> в шапке: если сцена неприятна, нажмите. Ведущий сменит её без вопросов.</li>
</ol>`;
document.querySelectorAll('[data-rules]').forEach(n => { n.innerHTML = RULES; });

/* ---------- Транспорт ---------- */
class OnlineBus {
  constructor(topic, onEvent, onStatus) { this.topic = topic; this.onEvent = onEvent; this.onStatus = onStatus; this.seen = new Set(); this.parts = {}; this.opened = false; }
  start() {
    this.es = new EventSource(`${NTFY}/${this.topic}/sse?since=all`);
    this.es.onopen = () => { this.opened = true; this.onStatus('ok'); };
    this.es.onerror = () => this.onStatus(this.opened ? 'reconnecting' : 'connecting');
    this.es.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.event && m.event !== 'message') return;
      if (!m.id || this.seen.has(m.id)) return;
      this.seen.add(m.id);
      this.handle(m.message);
    };
  }
  handle(text) {
    let o; try { o = JSON.parse(text); } catch { return; }
    if (o && o.p) {
      const [eid, i, n] = o.p; const bucket = this.parts[eid] || (this.parts[eid] = []);
      bucket[i] = o.c;
      if (bucket.filter(x => x != null).length === n) { delete this.parts[eid]; try { this.onEvent(JSON.parse(bucket.join(''))); } catch {} }
      return;
    }
    if (o && o.t) this.onEvent(o);
  }
  async post(body) {
    for (let i = 0; i < 4; i++) {
      try { const r = await fetch(`${NTFY}/${this.topic}`, { method: 'POST', body }); if (r.ok) return; if (r.status === 429) await new Promise(res => setTimeout(res, 2500 * (i + 1))); }
      catch { await new Promise(res => setTimeout(res, 1000 * (i + 1))); }
    }
    throw new Error('send failed');
  }
  async publish(ev) {
    const body = JSON.stringify(ev);
    const bytes = new TextEncoder().encode(body).length;
    if (bytes <= 3200) return this.post(body);
    const chunks = []; let cur = '', size = 0;
    for (const ch of body) { const b = new TextEncoder().encode(ch).length; if (size + b > 2600) { chunks.push(cur); cur = ''; size = 0; } cur += ch; size += b; }
    if (cur) chunks.push(cur);
    const eid = rand(8);
    for (let i = 0; i < chunks.length; i++) await this.post(JSON.stringify({ p: [eid, i, chunks.length], c: chunks[i] }));
  }
  stop() { if (this.es) this.es.close(); }
}
class LocalBus {
  constructor(room, onEvent, onStatus) { this.key = 'local.' + room; this.onEvent = onEvent; this.onStatus = onStatus; }
  start() {
    let list = []; try { list = JSON.parse(store.get(this.key) || '[]'); } catch {}
    this.list = list; this.onStatus('ok');
    for (const ev of list) this.onEvent(ev);
  }
  async publish(ev) { this.list.push(ev); store.set(this.key, JSON.stringify(this.list)); setTimeout(() => this.onEvent(ev), 0); }
  stop() {}
}

/* ---------- Состояние приложения ---------- */
const A = {
  bus: null, room: null, mode: null, S: E.initialState(), conn: 'idle',
  key: store.get('key') || '', model: store.get('model') || 'qwen/qwen3.7-plus',
  busy: false, draft: '', submitted: -1, gmErr: '', pendingSince: 0,
  tab: 'chron', micFor: null, actor: null, confirm: null, mapSel: null, veil: {}, lastScene: '', logLen: -1, nextTo: null
};
const S = () => A.S;
const mine = k => { const p = S().seats[k]; return !!(p && p.cid === cid); };
const mySeats = () => SEAT_KEYS.filter(mine);
const isHost = () => S().hostCid === cid;
const isLocal = () => A.mode === 'local';
function actor() {
  const ms = mySeats();
  if (!ms.length) return null;
  if (ms.length === 1) return ms[0];
  if (!A.actor || !ms.includes(A.actor)) A.actor = S().turn || 'detective';
  return A.actor;
}
const nm = k => E.nameOf(S(), k);
const pl = k => (S().seats[k] && S().seats[k].player) || nm(k);
async function publish(ev) {
  if (!A.bus) return;
  try { await A.bus.publish({ ...ev, cid, at: Date.now() }); }
  catch { toast('Не удалось отправить. Проверьте интернет.'); }
}

/* ---------- Подключение к столу ---------- */
function connect(room, mode) {
  if (A.bus) A.bus.stop();
  A.room = room; A.mode = mode; A.S = E.initialState(); A.submitted = -1; A.draft = ''; A.gmErr = ''; A.logLen = -1; A.lastScene = '';
  const Bus = mode === 'local' ? LocalBus : OnlineBus;
  A.bus = new Bus(room, onEvent, st => { A.conn = st; scheduleRender(); });
  A.bus.start();
  show('vLobby'); scheduleRender();
  if (mode === 'online') setTimeout(() => { if (A.conn !== 'ok' && A.S.seq < 0) { $('errText').textContent = 'Сервер синхронизации ntfy.sh не отвечает. Проверьте интернет или сыграйте на одном экране.'; show('vError'); } }, 15000);
}
function onEvent(ev) {
  if (ev.t === 'next') { if (ev.cid === A.S.hostCid && ev.room && ev.room !== A.room) A.nextTo = ev.room; scheduleRender(); return; }
  A.S = E.reduce(A.S, ev);
  scheduleRender();
}
function route() {
  const h = location.hash.slice(1);
  const p = new URLSearchParams(h);
  if (p.get('r')) return connect(p.get('r'), 'online');
  if (p.get('l')) return connect(p.get('l'), 'local');
  if (A.bus) { A.bus.stop(); A.bus = null; }
  show('vTitle');
}
window.addEventListener('hashchange', route);

async function createRoom(mode) {
  const room = mode === 'local' ? 'L' + rand(10) : 'arkham2-' + rand(16);
  location.hash = (mode === 'local' ? 'l=' : 'r=') + room;
  await new Promise(r => setTimeout(r, 50));
  await publish({ t: 'create', mode });
  if (mode === 'local') for (const k of SEAT_KEYS) await publish({ t: 'claim', seat: k });
}

/* ---------- Ведущий (OpenRouter) ---------- */
function orError(status, text) {
  if (status === 401) return 'Ключ OpenRouter не подошёл.';
  if (status === 402) return 'На счёте OpenRouter закончились деньги или исчерпан лимит ключа.';
  if (status === 429) return 'OpenRouter просит подождать: слишком частые запросы.';
  if (status === 404) return 'Модель недоступна. Выберите другую в настройках.';
  return 'OpenRouter ответил ошибкой ' + status + (text ? ': ' + String(text).slice(0, 140) : '');
}
async function callModel(messages, onText, maxTokens = 900) {
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + A.key, 'Content-Type': 'application/json', 'X-Title': 'Arkham na dvoikh' },
    body: JSON.stringify({ model: A.model, messages, temperature: 0.8, max_tokens: maxTokens, stream: true, reasoning: { enabled: false } })
  });
  if (!res.ok) { let t = ''; try { const j = await res.json(); t = j.error && j.error.message; } catch {} throw new Error(orError(res.status, t)); }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(orError(j.error.code || 500, j.error.message));
      const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
      if (d) { text += d; onText && onText(text); }
    }
  }
  if (!text.trim()) throw new Error('Ведущий вернул пустой ответ.');
  return text;
}
function needGm() {
  const s = S();
  return isHost() && E.pending(s) && s.lastReq > A.submitted && !A.busy;
}
async function runGm(manual) {
  if (!needGm()) return;
  if (!A.key) { A.gmErr = 'Нет ключа OpenRouter на этом устройстве.'; scheduleRender(); return; }
  if (A.gmErr && !manual) return;
  A.busy = true; A.gmErr = ''; A.draft = '';
  const s = S(), upTo = s.seq, resolving = s.phase === 'resolving';
  scheduleRender();
  try {
    if (resolving) {
      const text = await callModel(E.endingMessages(s), t => { A.draft = t; renderDraft(); }, 1400);
      A.submitted = upTo; A.draft = '';
      await publish({ t: 'ending', upTo, text: text.replace(/@@@[\s\S]*$/, '').trim() });
    } else {
      const text = await callModel(E.turnMessages(s), t => { A.draft = t.split('@@@')[0]; renderDraft(); });
      const { narr, data } = E.parseGm(text);
      const clean = E.sanitizeGm(S(), data);
      A.submitted = upTo; A.draft = '';
      await publish({ t: 'gm', upTo, text: narr || '…', ...clean });
    }
  } catch (e) {
    A.gmErr = (e && e.message) || 'Ведущий не ответил.';
  } finally { A.busy = false; A.draft = ''; scheduleRender(); }
}
async function fallbackEnding() {
  const s = S(); if (s.phase !== 'resolving') return;
  A.submitted = s.seq; A.gmErr = '';
  await publish({ t: 'ending', upTo: s.seq, text: E.fallbackEnding(s) });
}

/* ---------- Отрисовка ---------- */
let raf = 0;
function scheduleRender() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  if (!A.bus) return;
  const s = S();
  if (s.phase === 'lobby') { show('vLobby'); renderLobby(); }
  else { show('vGame'); renderGame(); }
  if (needGm()) runGm(false);
  if (E.pending(s)) { if (!A.pendingSince) A.pendingSince = Date.now(); } else A.pendingSince = 0;
}

/* Лобби */
function renderLobby() {
  const s = S(), local = isLocal();
  const inv = $('invite');
  inv.hidden = local || !isHost();
  if (!inv.hidden) { $('inviteUrl').value = location.href; $('btnShare').hidden = !navigator.share; }
  const conn = A.conn === 'ok' ? '' : '<div class="muted small">Подключаемся к столу…</div>';
  patch($('seats'), conn + SEAT_KEYS.map(k => seatCard(k)).join(''));
  const both = SEAT_KEYS.every(k => s.seats[k] && s.seats[k].ready);
  let foot;
  if (!s.hostCid) foot = `<span class="muted">Стол ещё не создан или ссылка устарела.</span>`;
  else if (isHost()) foot = `<button class="btn primary big" data-a="start" ${both ? '' : 'disabled'}>Открыть дело</button><span class="muted small">${both ? 'Оба готовы. Включите звук ♪, если хотите дождь.' : 'Ждём, пока оба героя будут готовы.'}</span>`;
  else foot = `<span class="muted">${both ? 'Оба готовы. Дело откроет тот, кто создал стол.' : 'Ждём, пока оба героя будут готовы.'}</span>`;
  patch($('lobbyFoot'), foot);
}
function seatCard(k) {
  const s = S(), p = s.seats[k], role = SEATS[k], ms = mySeats();
  const head = `<div class="portrait"><img src="img/${k}.webp" alt=""><span class="role">${role.label}</span></div>`;
  let body;
  if (!p) {
    const can = isLocal() || !ms.length;
    body = `<h3>Место свободно</h3><div class="skills">${esc(role.role)}. Умения: ${esc(role.skills)}.</div>
      ${can ? `<button class="btn primary" data-a="claim" data-seat="${k}">Играть за ${role.label === 'Сыщик' ? 'Сыщика' : 'Оккультиста'}</button>` : '<div class="muted small">Ждём напарника.</div>'}`;
  } else if (mine(k)) {
    const ready = p.ready;
    const pron = p.pron;
    const dname = pron ? role.names[pron] : '';
    body = `${ready ? `<h3>${esc(p.name)}</h3><div class="tag-ready">Готов к делу</div>` : `<h3>${isLocal() ? role.label : 'Твой герой'}</h3>`}
      <div class="skills">${esc(role.role)}. Умения: ${esc(role.skills)}.</div>
      ${ready ? `<div class="muted small">Игрок: ${esc(p.player || '—')} · ${pron === 'она' ? 'героиня' : 'герой'}</div>
        <div class="row"><button class="btn small" data-a="unready" data-seat="${k}">Изменить</button>${!isLocal() ? `<button class="btn small" data-a="leave" data-seat="${k}">Сменить роль</button>` : ''}</div>
        ${secretBlock(k)}`
      : `<label class="field" style="margin:0"><span>${isLocal() ? 'Кто играет' : 'Как тебя зовут'}</span><input type="text" id="pl-${k}" maxlength="30" value="${esc(p.player)}" placeholder="Имя игрока"></label>
        <div class="field" style="margin:0"><span>Героиня или герой</span><div class="seg"><button data-a="pron" data-seat="${k}" data-v="она" aria-pressed="${pron === 'она'}">она</button><button data-a="pron" data-seat="${k}" data-v="он" aria-pressed="${pron === 'он'}">он</button></div></div>
        <label class="field" style="margin:0"><span>Имя героя</span><input type="text" id="nm-${k}" maxlength="40" value="${esc(p.name || dname)}" placeholder="${esc(dname || 'Выберите «она» или «он»')}"></label>
        <div class="row"><button class="btn primary" data-a="ready" data-seat="${k}">Готов</button>${!isLocal() ? `<button class="btn small" data-a="leave" data-seat="${k}">Сменить роль</button>` : ''}</div>`}`;
  } else {
    body = `<h3>${esc(p.name || role.label)}</h3><div class="skills">${esc(role.role)}.</div>
      <div class="muted small">Играет: ${esc(p.player || '…')} · ${p.ready ? '<span class="tag-ready">готов</span>' : 'выбирает героя'}</div>`;
  }
  return `<article class="hero-card">${head}<div class="body">${body}</div></article>`;
}
function secretBlock(k) {
  const s = S();
  if (s.secretsShown[k]) return `<div class="secret-card"><span class="eyebrow">Тайна рассказана напарнику</span><div>${esc(SEATS[k].secret)}</div></div>`;
  if (isLocal() && !A.veil[k]) return `<div class="secret-card veiled" data-a="unveil" data-seat="${k}">Тайна героя. Пусть напарник отвернётся, потом нажми, чтобы прочитать.</div>`;
  return `<div class="secret-card"><span class="eyebrow">Тайна ${isLocal() ? esc(nm(k)) : 'твоего героя'} · видна только ${isLocal() ? 'этому игроку' : 'тебе'}</span><div>${esc(SEATS[k].secret)}</div>${isLocal() ? `<button class="btn small" data-a="veil" data-seat="${k}" style="margin-top:8px">Спрятать</button>` : ''}</div>`;
}

/* Игра */
function renderGame() {
  const s = S();
  renderHud(); renderBanner(); renderLog(); renderDraft(); renderDock(); renderMap(); renderClues(); renderUs();
  $('game').dataset.tab = A.tab;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === A.tab ? 'true' : 'false'));
  $('btnX').hidden = !mySeats().length || !(s.phase === 'play' || s.phase === 'finale');
}
function renderHud() {
  const s = S();
  const late = ['finale', 'resolving', 'ending'].includes(s.phase);
  $('hClock').textContent = late ? (s.phase === 'ending' ? '05:40' : '02:00') : E.hourLabel(s.hour);
  $('hTravels').textContent = late ? (s.phase === 'ending' ? 'рассвет' : 'финал') : s.phase === 'pause' ? 'в такси' : `поездок: ${E.TRAVEL_LIMIT - s.travels}`;
  $('hCalm').innerHTML = Array.from({ length: s.maxCalm }, (_, i) => `<i class="${i < s.calm ? 'on' : ''}"></i>`).join('');
  $('clueCount').textContent = CLUE_ORDER.filter(id => s.clues[id] && !CLUES[id].herring).length;
}
function renderBanner() {
  const s = S();
  const sc = [...s.log].reverse().find(e => e.kind === 'scene');
  const img = sc ? sc.img : 'm1', title = sc ? sc.title : 'Репетиционная 3-Б · 22:00';
  const key = img + '|' + title;
  if (key === A.lastScene) return;
  A.lastScene = key;
  const el = $('bannerImg');
  if (el.getAttribute('src') !== `img/${img}.webp`) { el.classList.add('fading'); setTimeout(() => { el.src = `img/${img}.webp`; el.onload = () => el.classList.remove('fading'); }, 250); }
  $('bannerTitle').textContent = title;
  Sound.scene(img);
}
function visibleClue(id) { const c = S().clues[id]; return c && (!c.whisper || c.shared || mine(c.whisper)); }
function logEntry(e) {
  const s = S();
  const who = k => `${SEATS[k] ? SEATS[k].label : ''} · ${esc(nm(k))}`;
  switch (e.kind) {
    case 'gm': return `<article class="sheet"><span class="tag">${e.static ? 'Сцена' : 'Ведущий'}</span>${paras(e.text)}</article>`;
    case 'scene': return `<div class="scene-div">${esc(e.title)}</div>`;
    case 'act': return `<div class="note"><span class="who">${who(e.seat)}</span>${esc(e.text)}</div>`;
    case 'say': return `<div class="note say"><span class="who">${who(e.seat)} · напарнику</span>${esc(e.text)}</div>`;
    case 'travel': return `<div class="note travel"><span class="who">Поездка · час пути</span>${esc(e.text)}</div>`;
    case 'clue': { const c = CLUES[e.clue]; return `<div class="clue-slip"><span class="eyebrow">Улика найдена</span><h4>${esc(c.title)}</h4>${esc(c.text)}</div>`; }
    case 'whisper': {
      const st = s.clues[e.clue] || {}, c = CLUES[e.clue];
      if (st.shared) return `<div class="whisper"><span class="who">Шёпот для ${esc(nm(e.to))} · рассказан · ${esc(c.title)}</span>${esc(e.text)}</div>`;
      if (mine(e.to) && (!isLocal() || A.veil['w' + e.clue])) return `<div class="whisper"><span class="who">Шёпот · только для ${isLocal() ? esc(nm(e.to)) : 'тебя'} · ${esc(c.title)}</span>${esc(e.text)}<div class="row" style="margin-top:8px"><button class="btn small" data-a="share" data-seat="${e.to}" data-clue="${e.clue}">Рассказать напарнику</button></div></div>`;
      if (mine(e.to)) return `<div class="whisper sealed" data-a="unveil" data-seat="w${e.clue}" style="cursor:pointer">Ведущий шепчет что-то для ${esc(nm(e.to))}. Пусть напарник отвернётся, потом нажми.</div>`;
      return `<div class="whisper sealed"><span class="who">Шёпот</span>Ведущий что-то шепнул: ${esc(nm(e.to))}. Можно спросить, но рассказывать или нет, решать не тебе.</div>`;
    }
    case 'roll': {
      const best = Math.max(...e.dice);
      const dice = e.dice.map((d, i) => `<div class="die ${d === best && e.dice.indexOf(best) === i ? (d >= 5 ? 'good' : d <= 2 ? 'bad' : '') : 'dim'}">${d}</div>`).join('');
      return `<div class="roll"><div class="dice">${dice}</div><div><b>${esc(nm(e.seat))}</b>: ${esc(e.outcome)}${e.helped ? ' (с помощью напарника)' : ''}<div class="muted small">${esc(e.why || '')}</div></div></div>`;
    }
    case 'help': return `<div class="note say"><span class="who">${who(e.seat)} · помогает</span>${esc(e.text || 'Подставляет плечо.')}</div>`;
    case 'secret': return `<div class="secret-card"><span class="eyebrow">${esc(nm(e.seat))} рассказывает свою тайну</span><div>${esc(e.text)}</div></div>`;
    case 'answer': return `<div class="answer"><div class="q">${esc(nm(e.seat))} · «${esc(e.q)}»</div>${e.text ? esc(e.text) : '<span class="muted">Ответ прозвучал вслух.</span>'}</div>`;
    case 'x': return `<div class="sys x">Стоп. Сцена вычеркнута.</div>`;
    case 'sys': return `<div class="sys">${esc(e.text)}</div>`;
    default: return '';
  }
}
function renderLog() {
  const s = S();
  const near = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 320;
  const html = s.log.map(logEntry).join('');
  const before = $('log')._html;
  patch($('log'), html);
  if (s.log.length !== A.logLen) {
    const newOnes = s.log.slice(Math.max(0, A.logLen)).filter(e => e.kind === 'clue' || e.kind === 'whisper');
    if (A.logLen >= 0 && newOnes.length) Sound.chime();
    if (A.logLen >= 0 && s.log.slice(A.logLen).some(e => e.kind === 'roll')) Sound.dice();
    if ((near || A.logLen < 0) && before !== html && A.tab === 'chron') requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: A.logLen < 0 ? 'auto' : 'smooth' }));
    A.logLen = s.log.length;
  }
}
function renderDraft() {
  const d = $('draft');
  d.hidden = !A.draft;
  if (A.draft) { d.innerHTML = '<span class="tag">Ведущий пишет</span>' + paras(A.draft); }
}

function busyLine() {
  const s = S();
  if (!E.pending(s)) return '';
  if (isHost() && A.gmErr) return `<div class="row"><span class="status err" style="margin:0">${esc(A.gmErr)}</span><button class="btn small primary" data-a="retry">Повторить</button>${s.phase === 'resolving' ? '<button class="btn small" data-a="fallback">Финал без ИИ</button>' : ''}</div>`;
  const slow = A.pendingSince && Date.now() - A.pendingSince > 40000 && !isHost();
  return `<div class="busy"><span class="quill"></span><span>${s.phase === 'resolving' ? 'Ведущий пишет финал…' : 'Ведущий пишет…'}${slow ? ` Если тишина затянулась, пусть ${esc(pl(SEAT_KEYS.find(k => s.seats[k] && s.seats[k].cid === s.hostCid) || 'detective'))} откроет игру на своём телефоне: ведущий живёт там.` : ''}</span></div>`;
}
function seatSwitch() {
  if (!isLocal() || mySeats().length < 2) return '';
  const a = actor();
  return `<div class="row"><span class="eyebrow">Сейчас пишет</span><div class="seg">${SEAT_KEYS.map(k => `<button data-a="actor" data-seat="${k}" aria-pressed="${a === k}">${esc(nm(k))}</button>`).join('')}</div></div>`;
}
function renderDock() {
  const s = S(), me = actor();
  let html = '';
  if (A.nextTo) html += `<div class="callout">Ведущий накрыл новый стол. <a class="btn small primary" href="#r=${esc(A.nextTo)}">Перейти</a></div>`;
  if (!me && s.phase !== 'ending') { patch($('dock'), `<div class="box"><span class="muted">Вы смотрите со стороны: оба места заняты.</span>${busyLine()}</div>`); return; }
  if (s.phase === 'play') {
    html += `<div class="box">${busyLine()}`;
    if (s.roll) {
      const r = s.roll, rollerMine = mine(r.seat), helperMine = mine(other(r.seat));
      html += `<div class="turn ${rollerMine ? 'mine' : ''}">Ведущий просит бросок: <b>${esc(nm(r.seat))}</b> — ${esc(r.why)}</div>`;
      if (r.helped) html += `<div class="muted small">${esc(nm(r.helped))} помогает: будут брошены две кости.</div>`;
      html += '<div class="row">';
      if (rollerMine) html += `<button class="btn primary" data-a="roll">${r.helped ? 'Бросить две кости' : 'Бросить кость'}</button>`;
      if (helperMine && !r.helped) html += `<button class="btn" data-a="help">Помочь (${esc(nm(other(r.seat)))})</button>`;
      if (!rollerMine) html += `<span class="muted small">Бросает ${esc(nm(r.seat))}.</span>`;
      html += '</div><div class="muted small">5–6 успех · 3–4 успех с ценой · 1–2 провал</div>';
      if (helperMine && !r.helped) html += `<input type="text" id="helpText" maxlength="200" placeholder="Как ты помогаешь? (необязательно)">`;
    } else {
      const t = s.turn;
      html += seatSwitch();
      html += `<div class="turn ${mine(t) && (!isLocal() || me === t) ? 'mine' : ''}">${mine(t) && !isLocal() ? `Твой ход, <b>${esc(nm(t))}</b>.` : `Ведущий ждёт хода: <b>${esc(nm(t))}</b>.`} ${!isLocal() && !mine(t) ? 'Ты тоже можешь действовать.' : ''}</div>
        <textarea id="act" rows="2" placeholder="Что делает ${esc(nm(me))}? Например: осматриваю стену, ищу следы мела"></textarea>
        <div class="row"><button class="btn primary" data-a="act">Действовать</button><button class="btn" data-a="say">Напарнику</button>${micBtn('act')}<span class="spacer"></span><button class="btn small" data-a="tab" data-tab="map">Карта · поездки</button></div>`;
      if (s.travels >= E.TRAVEL_LIMIT) html += `<div class="confirm"><span>Поездок больше нет. Скоро пробьёт два.</span><button class="btn small primary" data-a="finale">В консерваторию: финал</button></div>`;
    }
    html += '</div>';
  } else if (s.phase === 'pause') html += pausePanel();
  else if (s.phase === 'finale') html += finalePanel();
  else if (s.phase === 'resolving') html += `<div class="box">${busyLine()}</div>`;
  else if (s.phase === 'ending') html += endingPanel();
  patch($('dock'), html);
}
function pausePanel() {
  const s = S(), P = s.pause;
  const blocks = SEAT_KEYS.filter(mine).map(k => {
    const p = other(k);
    let h = `<div class="night"><span class="eyebrow" style="color:#b6a7d6">${isLocal() ? esc(nm(k)) + ', тебе вопрос' : 'Вопрос тебе'} от ${esc(nm(p))}</span><div class="q">${esc(P.q[k])}</div>`;
    if (!P.ans[k]) h += `<div class="muted small">Отвечай как герой или как ты сам. Можно сказать вслух, если вы рядом или созваниваетесь.</div>
        <textarea id="ans-${k}" rows="2" placeholder="Ответ (можно оставить пустым и сказать вслух)"></textarea><div class="row"><button class="btn primary" data-a="answer" data-seat="${k}">Ответить</button>${micBtn('ans-' + k)}</div>`;
    else if (P.ask[k] && !P.conf[k]) h += `<div>${esc(nm(p))} спрашивает: <b>«Это было про тебя?»</b></div><div class="row"><button class="btn primary" data-a="conf" data-seat="${k}" data-v="self">Да, про меня</button><button class="btn" data-a="conf" data-seat="${k}" data-v="hero">Это ответ героя</button></div>`;
    else h += `<div class="muted">Ответ дан${P.conf[k] === 'self' ? ' — и это было про тебя' : ''}.</div>`;
    if (!isLocal() || true) {
      if (!P.ans[p]) h += `<div class="muted small">${esc(nm(p))} ещё думает над своим вопросом: «${esc(P.q[p])}»</div>`;
      else if (!P.ask[p]) h += `<div class="row"><button class="btn small" data-a="guess" data-seat="${k}">Спросить ${esc(nm(p))}: «Это было про тебя?»</button></div>`;
    }
    return h + '</div>';
  });
  const done = SEAT_KEYS.every(k => P.ans[k]);
  return `<div class="stack">${blocks.join('')}${done ? `<div class="row"><button class="btn primary" data-a="pause_end">Такси останавливается: выйти</button></div>` : ''}</div>`;
}
function finalePanel() {
  const s = S(), f = s.finale, ms = mySeats();
  let h = `<div class="box final">`;
  h += `<div><div class="stepn">Шаг 1 · разгадка</div><h4>Что здесь произошло? Кто это сделал и зачем?</h4>
    <textarea id="f-accuse" rows="2" placeholder="Например: …">${esc(f.accuse)}</textarea><div class="row"><span class="muted small">Поле общее, писать может любой.</span>${micBtn('f-accuse')}</div></div>`;
  h += `<div><div class="stepn">Шаг 2 · правда, которая удержит</div><div class="muted small">«Вернуть может лишь тот, кто слышит, если другой держит его за руку и говорит о нём правду». Напишите по одной настоящей вещи о напарнике: о человеке, не о герое. Можно из разговора в такси.</div></div>`;
  for (const k of SEAT_KEYS) {
    const p = other(k);
    if (mine(k)) h += `<label class="field" style="margin:0"><span>${esc(nm(k))} о ${esc(pl(p))}</span><textarea id="f-anchor-${k}" rows="2" placeholder="Например: ты любишь, когда ночью идёт дождь">${esc(f.anchors[k])}</textarea></label><div class="row">${micBtn('f-anchor-' + k)}</div>`;
    if (mine(p) && f.anchors[k]) {
      h += `<div class="quote">${esc(nm(k))} о тебе${isLocal() ? ` (${esc(pl(p))})` : ''}: «${esc(f.anchors[k])}»</div>`;
      h += f.conf[p] ? `<div class="muted small">${f.conf[p] === 'yes' ? 'Ты подтвердил(а): это правда.' : 'Ты ответил(а): не совсем.'} <button class="btn small" data-a="fconf" data-seat="${p}" data-v="${f.conf[p] === 'yes' ? '0' : '1'}">Передумать</button></div>`
        : `<div class="row"><button class="btn small primary" data-a="fconf" data-seat="${p}" data-v="1">Да, это правда обо мне</button><button class="btn small" data-a="fconf" data-seat="${p}" data-v="0">Не совсем</button></div>`;
    } else if (!mine(k) && !f.anchors[k]) h += `<div class="muted small">${esc(nm(k))} пишет о тебе…</div>`;
    else if (!mine(k) && f.anchors[k] && !mine(p)) h += '';
  }
  const ch = [
    ['crane', 'Показать Крейну свидетельство о смерти Элеоноры', 'K7'],
    ['bella', 'Позвать Мэйбл именем, которым её звала мать', 'K8'],
    ['agatha', 'Позвать и Агату Пирс', 'K6']
  ];
  h += `<div><div class="stepn">Шаг 3 · что вы делаете в комнате</div><div class="stack" style="gap:8px;margin-top:6px">`;
  for (const [key, label, need] of ch) {
    const ok = E.choiceAvailable(s, key);
    const why = key === 'agatha' && has(need) && !s.secretsShown.detective ? 'Сначала Сыщику нужно рассказать свою тайну (вкладка «Мы»).' : 'Не хватает улики.';
    h += `<label class="choice ${ok ? '' : 'off'}"><input type="checkbox" data-a="choice" data-key="${key}" ${f.choices[key] ? 'checked' : ''} ${ok ? '' : 'disabled'}><span>${ok ? esc(label) : '???'}${ok ? '' : `<br><span class="muted small">${why}</span>`}</span></label>`;
  }
  h += `</div></div>`;
  const ready = E.finaleReady(s);
  const need = [];
  if (!f.accuse.trim()) need.push('разгадка');
  for (const k of SEAT_KEYS) { if (!f.anchors[k].trim()) need.push(`слова ${nm(k)}`); else if (!f.conf[other(k)]) need.push(`ответ ${nm(other(k))}`); }
  h += `<div class="row"><button class="btn primary big" data-a="play_note" ${ready && ms.length ? '' : 'disabled'}>Сыграть ноту</button>${need.length ? `<span class="muted small">Ещё нужно: ${esc(need.join(', '))}</span>` : ''}</div>`;
  h += `<div class="row"><input type="text" id="sayF" maxlength="300" placeholder="Сказать напарнику…" style="flex:1;min-width:0"><button class="btn small" data-a="sayF">Сказать</button>${micBtn('sayF')}</div>`;
  return h + '</div>';
}
const has = id => !!S().clues[id];
function endingPanel() {
  const s = S(), o = s.outcome || {};
  const stars = Array.from({ length: 5 }, (_, i) => `<span class="${i < o.stars ? '' : 'off'}">★</span>`).join('');
  const mabel = o.mabel === 'full' ? 'Вернулась. Вы позвали её Беллой.' : o.mabel === 'partial' ? 'Вернулась, но часть её осталась за стеной.' : 'Осталась за стеной.';
  const agatha = has('K6') ? (o.agatha ? 'Вернулась спустя пять лет.' : 'Осталась за стеной.') : 'Вы так и не узнали о ней.';
  const missed = CLUE_ORDER.filter(id => !CLUES[id].herring && !s.clues[id]).map(id => `«${CLUES[id].title}» (${LOCATIONS[CLUES[id].loc].code} ${LOCATIONS[CLUES[id].loc].name})`);
  return `<div class="box ending"><span class="eyebrow">Дело закрыто</span><h2>${esc(o.title || 'Финал')}</h2><div class="stars" aria-label="${o.stars} из 5">${stars}</div>
    <div class="outcome"><div><span>Мэйбл</span><span>${mabel}</span></div><div><span>Агата</span><span>${agatha}</span></div>
    <div><span>Крейн</span><span>${o.crane === 'saved' ? 'Жив и сдался полиции.' : 'Ушёл за стену искать жену.'}</span></div>
    <div><span>Правда</span><span>${o.strength} из 2 слов друг о друге оказались правдой.</span></div></div>
    ${missed.length ? `<details><summary class="muted">Что вы упустили (спойлеры)</summary><ul class="small">${missed.map(m => `<li>${esc(m)}</li>`).join('')}</ul></details>` : '<div class="muted small">Вы нашли все улики.</div>'}
    <div class="row">${isHost() ? '<button class="btn primary" data-a="again">Сыграть ещё раз</button>' : ''}<a class="btn" href="./">На главную</a></div></div>`;
}
function renderMap() {
  const s = S();
  const canTravel = s.phase === 'play' && !s.roll && !E.pending(s) && mySeats().length && s.travels < E.TRAVEL_LIMIT;
  const pins = Object.entries(LOCATIONS).map(([id, l]) => `<button class="pin ${id === s.loc ? 'here' : s.visited.includes(id) ? 'was' : ''}" style="left:${l.x}%;top:${l.y}%" data-a="mapsel" data-loc="${id}" title="${esc(l.name)}"><span class="dot">${l.code}</span></button>`).join('');
  const sel = A.mapSel;
  const list = Object.entries(LOCATIONS).map(([id, l]) => {
    const here = id === s.loc, was = s.visited.includes(id);
    const st = here ? 'вы здесь' : was ? 'уже были' : '';
    const btn = !here && !was && canTravel ? (sel === id ? `<span class="row"><button class="btn small primary" data-a="travel" data-loc="${id}">Ехать (1 час)</button><button class="btn small" data-a="mapsel" data-loc="">Нет</button></span>` : `<button class="btn small" data-a="mapsel" data-loc="${id}">Ехать</button>`) : '<span></span>';
    return `<div class="loc ${here ? 'here' : ''}"><div class="code">${l.code}</div><div style="min-width:0"><div class="nm">${esc(l.name)}</div><div class="bl">${esc(l.blurb)}</div><div class="st">${esc(l.district)}${st ? ' · ' + st : ''}</div></div>${btn}</div>`;
  }).join('');
  let note = '';
  if (s.phase === 'play') {
    if (s.travels >= E.TRAVEL_LIMIT) note = `<div class="callout"><b>Поездок больше нет.</b><span class="small">Часы скоро пробьют два. Пора в консерваторию.</span><button class="btn primary" data-a="finale">Финал в комнате 3-Б</button></div>`;
    else if (!canTravel && E.pending(s)) note = '<div class="muted small" style="margin-top:8px">Дождитесь ответа ведущего, потом можно ехать.</div>';
    else if (!canTravel && s.roll) note = '<div class="muted small" style="margin-top:8px">Сначала бросок кости.</div>';
    else note = `<div class="muted small" style="margin-top:8px">Осталось поездок: ${E.TRAVEL_LIMIT - s.travels}. Каждая — час. ${A.confirm === 'finale' ? '' : '<button class="btn small" data-a="askFinale">Мы готовы к развязке</button>'}</div>${A.confirm === 'finale' ? `<div class="confirm"><span>Отправиться в 3-Б прямо сейчас?</span><button class="btn small primary" data-a="finale">Да</button><button class="btn small" data-a="noFinale">Нет</button></div>` : ''}`;
  }
  patch($('pMap'), `<h3>Аркхэм</h3><div class="map"><img src="img/map.webp" alt="Карта Аркхэма: река Мискатоник, университет, Френч-Хилл, Ривертаун, центр">${pins}</div>${note}<div style="margin-top:6px">${list}</div>`);
}
function renderClues() {
  const s = S();
  const cards = CLUE_ORDER.map(id => {
    const c = CLUES[id], st = s.clues[id];
    if (!st) return c.herring ? '' : `<div class="clue-card unknown"><span>?</span><span class="small">Где-то в Аркхэме</span></div>`;
    if (!visibleClue(id)) return `<div class="clue-card private">Шёпот у ${esc(nm(st.whisper))}: «${esc(c.title)}». Спроси напарника.</div>`;
    return `<div class="clue-card found"><h4>${esc(c.title)}</h4>${esc(c.text)}<div class="muted small" style="color:var(--ink-muted);margin-top:4px">${LOCATIONS[c.loc].code} ${esc(LOCATIONS[c.loc].name)}</div></div>`;
  }).join('');
  const n = CLUE_ORDER.filter(id => s.clues[id] && !CLUES[id].herring).length;
  patch($('pClues'), `<h3>Улики <span class="muted small mono">${n} из 8</span></h3><div class="clue-grid">${cards}</div>`);
}
function renderUs() {
  const s = S();
  const cards = SEAT_KEYS.map(k => {
    const p = s.seats[k] || {}, role = SEATS[k];
    let sec = '';
    if (s.secretsShown[k]) sec = `<div class="secret-card" style="margin-top:8px"><span class="eyebrow">Тайна рассказана</span><div>${esc(role.secret)}</div></div>`;
    else if (mine(k)) sec = (isLocal() && !A.veil[k]) ? `<div class="secret-card veiled" data-a="unveil" data-seat="${k}" style="margin-top:8px">Тайна ${esc(nm(k))}. Нажми, когда напарник отвернётся.</div>`
      : `<div class="secret-card" style="margin-top:8px"><span class="eyebrow">Твоя тайна · видна только тебе</span><div>${esc(role.secret)}</div>
        ${A.confirm === 'secret' + k ? `<div class="row" style="margin-top:8px"><span class="small">Рассказать её напарнику?</span><button class="btn small primary" data-a="secret" data-seat="${k}">Да</button><button class="btn small" data-a="noSecret">Нет</button></div>` : `<button class="btn small" data-a="askSecret" data-seat="${k}" style="margin-top:8px">Рассказать напарнику</button>`}</div>`;
    return `<div class="us-card"><img src="img/${k}.webp" alt=""><div style="min-width:0"><span class="eyebrow">${role.label}${mine(k) && !isLocal() ? ' · это ты' : ''}</span><h4>${esc(p.name || role.label)}</h4><div class="small muted">${esc(role.skills)}</div><div class="small muted">Играет: ${esc(p.player || '—')}</div>${sec}</div></div>`;
  }).join('');
  patch($('pUs'), `<h3>Мы</h3>${cards}<div class="row"><button class="btn small" data-a="rules">Правила</button><a class="btn small" href="./">Выйти на главную</a></div>`);
}

/* ---------- Действия ---------- */
let fTimers = {};
function fieldPublish(id, ev) { clearTimeout(fTimers[id]); fTimers[id] = setTimeout(() => publish(ev), 2000); }
document.addEventListener('input', e => {
  const t = e.target; if (!t.id) return;
  t.dataset.dirty = '1';
  if (t.id === 'f-accuse') fieldPublish(t.id, { t: 'fset', field: 'accuse', text: t.value });
  const m = t.id.match(/^f-anchor-(\w+)$/); if (m) fieldPublish(t.id, { t: 'fset', field: 'anchor', seat: m[1], text: t.value });
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'act' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doAct('act'); }
  if (e.key === 'Escape' && !$('modal').hidden) $('modal').hidden = true;
});
async function doAct(kind) {
  const ta = $('act'); if (!ta) return;
  const text = ta.value.trim(); const me = actor();
  if (!text || !me) return toast(kind === 'act' ? 'Опиши, что делает герой.' : 'Напиши реплику.');
  stopMic(); if (Mic.rec) { try { Mic.rec.abort(); } catch {} }
  ta.value = ''; delete ta.dataset.dirty;
  Sound.unlock();
  await publish({ t: kind, seat: me, text });
}
function profileFrom(k, ready) {
  const p = S().seats[k] || {};
  const pl = $('pl-' + k), nmI = $('nm-' + k);
  return { t: 'profile', seat: k, pron: p.pron, player: pl ? pl.value.trim() : p.player, name: nmI ? nmI.value.trim() : p.name, ready };
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, k = b.dataset.seat, s = S();
  switch (a) {
    case 'claim': publish({ t: 'claim', seat: k }); break;
    case 'leave': publish({ t: 'leave', seat: k }); break;
    case 'pron': {
      const ev = profileFrom(k, false); ev.pron = b.dataset.v;
      const nmI = $('nm-' + k); const old = s.seats[k] && s.seats[k].pron;
      if (nmI && (!nmI.value.trim() || (old && nmI.value.trim() === SEATS[k].names[old]))) { ev.name = SEATS[k].names[b.dataset.v]; nmI.value = ev.name; delete nmI.dataset.dirty; }
      publish(ev); break;
    }
    case 'ready': {
      const ev = profileFrom(k, true);
      if (!ev.pron) return toast('Выбери: героиня или герой.');
      if (!ev.name) ev.name = SEATS[k].names[ev.pron];
      document.querySelectorAll(`#pl-${k},#nm-${k}`).forEach(i => delete i.dataset.dirty);
      publish(ev); Sound.unlock(); break;
    }
    case 'unready': publish(profileFrom(k, false)); break;
    case 'unveil': A.veil[k] = true; scheduleRender(); break;
    case 'veil': A.veil[k] = false; scheduleRender(); break;
    case 'start': await publish({ t: 'start' }); wake(); break;
    case 'act': doAct('act'); break;
    case 'say': doAct('say'); break;
    case 'sayF': { const i = $('sayF'); const me = actor(); if (i && i.value.trim() && me) { publish({ t: 'say', seat: me, text: i.value.trim() }); i.value = ''; delete i.dataset.dirty; } break; }
    case 'actor': A.actor = k; scheduleRender(); break;
    case 'tab': A.tab = b.dataset.tab; scheduleRender(); window.scrollTo({ top: 0 }); break;
    case 'mapsel': A.mapSel = b.dataset.loc || null; if (A.mapSel && window.innerWidth <= 980) A.tab = 'map'; scheduleRender(); break;
    case 'travel': {
      const me = actor(); if (!me) return;
      A.mapSel = null; A.tab = 'chron';
      const n = E.TAXI_QUESTIONS.length, qa = Math.floor(Math.random() * n); let qb = Math.floor(Math.random() * n); if (qb === qa) qb = (qa + 1) % n;
      await publish({ t: 'travel', seat: me, loc: b.dataset.loc, qa, qb });
      window.scrollTo({ top: document.documentElement.scrollHeight }); break;
    }
    case 'askFinale': A.confirm = 'finale'; scheduleRender(); break;
    case 'noFinale': A.confirm = null; scheduleRender(); break;
    case 'finale': A.confirm = null; A.tab = 'chron'; publish({ t: 'finale', seat: actor() }); break;
    case 'roll': {
      const r = s.roll; if (!r) return;
      const dice = Array.from({ length: r.helped ? 2 : 1 }, () => 1 + Math.floor(Math.random() * 6));
      publish({ t: 'roll', seat: r.seat, dice }); break;
    }
    case 'help': { const r = s.roll; if (!r) return; const i = $('helpText'); publish({ t: 'help', seat: other(r.seat), text: i ? i.value.trim() : '' }); break; }
    case 'share': publish({ t: 'share', seat: k, clue: b.dataset.clue }); break;
    case 'askSecret': A.confirm = 'secret' + k; scheduleRender(); break;
    case 'noSecret': A.confirm = null; scheduleRender(); break;
    case 'secret': A.confirm = null; publish({ t: 'secret', seat: k }); break;
    case 'answer': { stopMic(); const i = $('ans-' + k); publish({ t: 'pause_answer', seat: k, text: i ? i.value.trim() : '' }); if (i) delete i.dataset.dirty; break; }
    case 'guess': publish({ t: 'guess', seat: k }); break;
    case 'conf': publish({ t: 'confirm', seat: k, val: b.dataset.v }); break;
    case 'pause_end': publish({ t: 'pause_end' }); break;
    case 'fconf': publish({ t: 'fconf', seat: k, val: b.dataset.v === '1' }); break;
    case 'choice': publish({ t: 'choice', key: b.dataset.key, val: b.checked }); break;
    case 'play_note': {
      for (const id of Object.keys(fTimers)) clearTimeout(fTimers[id]);
      const acc = $('f-accuse'); if (acc && acc.dataset.dirty && acc.value !== s.finale.accuse) await publish({ t: 'fset', field: 'accuse', text: acc.value });
      for (const kk of SEAT_KEYS) { const i = $('f-anchor-' + kk); if (i && i.dataset.dirty && i.value !== s.finale.anchors[kk]) await publish({ t: 'fset', field: 'anchor', seat: kk, text: i.value }); }
      publish({ t: 'play_note' }); Sound.note(true); break;
    }
    case 'retry': A.gmErr = ''; runGm(true); break;
    case 'fallback': fallbackEnding(); break;
    case 'again': {
      const mode = A.mode;
      const room = mode === 'local' ? 'L' + rand(10) : 'arkham2-' + rand(16);
      if (mode === 'online') await publish({ t: 'next', room });
      location.hash = (mode === 'local' ? 'l=' : 'r=') + room;
      await new Promise(r => setTimeout(r, 80));
      await publish({ t: 'create', mode });
      if (mode === 'local') for (const kk of SEAT_KEYS) await publish({ t: 'claim', seat: kk });
      break;
    }
    case 'mic': toggleMic(b.dataset.for); break;
    case 'rules': $('modal').hidden = false; break;
  }
});
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { A.tab = b.dataset.tab; scheduleRender(); window.scrollTo({ top: 0 }); }));
$('btnRules').onclick = () => { $('modal').hidden = false; };
$('btnModalClose').onclick = () => { $('modal').hidden = true; };
$('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });
$('btnX').onclick = () => { const me = actor(); if (me) publish({ t: 'x', seat: me }); };
$('btnSound').onclick = () => { const on = Sound.toggle(); $('btnSound').setAttribute('aria-pressed', on ? 'true' : 'false'); };
$('btnCopy').onclick = async () => { const v = $('inviteUrl').value; try { await navigator.clipboard.writeText(v); toast('Ссылка скопирована.'); } catch { $('inviteUrl').select(); toast('Выдели и скопируй ссылку вручную.'); } };
$('btnShare').onclick = () => { navigator.share({ title: 'Аркхэм на двоих', text: 'Сыграем в детектив? Открывай:', url: $('inviteUrl').value }).catch(() => {}); };
$('btnErrRetry').onclick = () => route();

let pendingMode = null;
function openSetup(mode) {
  pendingMode = mode;
  $('inKey').value = A.key; $('inModel').value = A.model;
  $('setupStatus').textContent = ''; $('setupStatus').className = 'status';
  show('vSetup');
}
$('btnOnline').onclick = () => { Sound.unlock(); openSetup('online'); };
$('btnLocal').onclick = () => { Sound.unlock(); openSetup('local'); };
$('btnSetupBack').onclick = () => show('vTitle');
$('btnSetupGo').onclick = async () => {
  const key = $('inKey').value.trim(), model = $('inModel').value;
  const st = $('setupStatus');
  if (!key) { st.textContent = 'Вставь ключ OpenRouter.'; st.className = 'status err'; return; }
  A.key = key; A.model = model;
  st.textContent = 'Проверяю ключ…'; st.className = 'status';
  $('btnSetupGo').disabled = true;
  try {
    await callModel([{ role: 'user', content: 'Ответь одним словом: готов' }], null, 8);
    store.set('key', key); store.set('model', model);
    st.textContent = 'Ключ работает.';
    await createRoom(pendingMode);
  } catch (err) { st.textContent = err.message || 'Не получилось.'; st.className = 'status err'; }
  finally { $('btnSetupGo').disabled = false; }
};

/* Экран не гаснет у ведущего */
let lock = null;
async function wake() { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (isHost() && S().phase !== 'lobby') wake(); scheduleRender(); } });
setInterval(() => { if (A.bus && E.pending(S())) scheduleRender(); }, 10000);

/* ---------- Звук: дождь, гул и тихая нота ---------- */
const Sound = (() => {
  let ctx = null, master = null, on = false, noteTimer = 0, scene = 'm1';
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.035 * w) / 1.035; d[i] = w * 0.35 + last * 3.2; } }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const rg = ctx.createGain(); rg.gain.value = 0.22;
    src.connect(hp).connect(lp).connect(rg).connect(master); src.start();
    for (const [f, v] of [[55, 0.05], [82.4, 0.03], [110.6, 0.012]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gn = ctx.createGain(); gn.gain.value = v;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.07; const lg = ctx.createGain(); lg.gain.value = v * 0.7;
      lfo.connect(lg).connect(gn.gain); o.connect(gn).connect(master); o.start(); lfo.start();
    }
  }
  function tone(freq, t0, dur, vol) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2.001;
    gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(vol, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); o2.connect(gn); gn.connect(master); o.start(t0); o2.start(t0); o.stop(t0 + dur); o2.stop(t0 + dur);
  }
  const MOTIF = [392, 349.2, 311.1, 293.7, 311.1, 277.2];
  function motif(strong) {
    if (!on) return;
    const t = ctx.currentTime + 0.05, detune = scene === 'finale' ? 1.012 : 1;
    MOTIF.forEach((f, i) => tone(f * (i === 5 ? detune * 0.985 : 1), t + i * 0.42, 1.8, strong ? 0.07 : 0.035));
  }
  function loop() { clearTimeout(noteTimer); if (!on) return; noteTimer = setTimeout(() => { motif(false); loop(); }, (scene === 'finale' ? 14000 : 30000) + Math.random() * 15000); }
  return {
    unlock() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggle() {
      if (!ctx) build();
      on = !on; ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(on ? 0.9 : 0, ctx.currentTime + 1.2);
      if (on) { setTimeout(() => motif(false), 2500); loop(); } else clearTimeout(noteTimer);
      store.set('sound', on ? '1' : '0');
      return on;
    },
    scene(img) { scene = img; if (on && (img === 'finale' || img === 'm1')) setTimeout(() => motif(false), 1200); },
    chime() { if (!on) return; const t = ctx.currentTime + 0.02; tone(1046.5, t, 1.2, 0.05); tone(1568, t + 0.12, 1.4, 0.035); },
    dice() { if (!on) return; const t = ctx.currentTime; for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 1200, t + i * 0.05 + Math.random() * 0.03, 0.05, 0.03); },
    note(strong) { motif(strong); }
  };
})();

/* ---------- Дождь ---------- */
(function rain() {
  const cv = $('rain'), ctx = cv.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, drops = [];
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = Math.floor(innerWidth * dpr); H = cv.height = Math.floor(innerHeight * dpr);
    const n = Math.round((innerWidth * innerHeight) / 9000);
    drops = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, l: (8 + Math.random() * 18) * dpr, v: (9 + Math.random() * 10) * dpr, a: 0.08 + Math.random() * 0.18 }));
  }
  function frame() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    for (const d of drops) {
      ctx.strokeStyle = `rgba(190,215,210,${d.a})`;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.18, d.y + d.l); ctx.stroke();
      if (!reduce) { d.y += d.v; d.x -= d.v * 0.18; if (d.y > H) { d.y = -d.l; d.x = Math.random() * W * 1.1; } }
    }
    if (!reduce && document.visibilityState === 'visible') requestAnimationFrame(frame);
  }
  size(); addEventListener('resize', size);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !reduce) requestAnimationFrame(frame); });
  frame();
})();

route();
})();
