/* Аркхэм на двоих — движок: дело, правила, состояние (event sourcing) и промпты ведущего.
   Чистые функции без DOM: работают и в браузере, и в node (для тестов). */
(function (root) {
'use strict';

const SEATS = {
  detective: {
    label: 'Сыщик', names: { 'она': 'Рут Кэллоуэй', 'он': 'Рэй Кэллоуэй' },
    role: 'Частный сыщик, бывший сержант полиции Аркхэма',
    skills: 'Люди, допросы, замки, слежка, драка, город',
    secret: 'В 1921 году ты вёл дело о пропаже студентки-скрипачки Агаты Пирс из консерваторского крыла Мискатоника. На стене той комнаты был меловой знак, а из-за стены доносилась тихая музыка. Тебе стало страшно, и ты закрыл дело как побег. Никто об этом не знает.'
  },
  occultist: {
    label: 'Оккультист', names: { 'она': 'Лея Мартен', 'он': 'Лео Мартен' },
    role: 'Младший архивист Мискатоника, разбирает запретные рукописи',
    skills: 'Языки, символы, ноты, сны, ритуалы, старые книги',
    secret: 'С детства в некоторые ночи ты слышишь из-за стен тихую музыку. Когда тебе было семь, мать водила тебя к молодому учёному-акустику по фамилии Крейн. Он долго слушал тебя и что-то записал в тетрадь. Сегодня музыка звучит снова.'
  }
};
const SEAT_KEYS = ['detective', 'occultist'];
const PRONS = ['она', 'он'];
const other = s => (s === 'detective' ? 'occultist' : 'detective');

const LOCATIONS = {
  m1: { code: 'М1', name: 'Репетиционная 3-Б', district: 'Мискатоникский университет', img: 'm1', blurb: 'Запертая изнутри комната, открытый рояль, холод у северной стены', x: 25, y: 29,
    gm: 'Место исчезновения. Здесь Томас Корвин (брат Мэйбл, клиент, нервный, мнёт кепку) и сторож Эбенезер Пратт (старик, видел профессора Крейна выходящим из крыла в 21:30 с футляром для камертонов, боится говорить, но расскажет, если надавить или пожалеть). Рояль открыт, табурет опрокинут, окно на шпингалете. На пюпитре партитура (улика K1). У северной стены холодно, мел на стене стёрт ладонью, остался слабый след знака. Тот, кто слышит (Оккультист), уловит за стеной тихую игру (улика K2, шёпотом только Оккультисту). Если Сыщик прижмёт ухо к стене, он услышит только собственное сердце.',
    clues: ['K1', 'K2'] },
  f2: { code: 'Ф2', name: 'Квартира профессора Крейна', district: 'Френч-Хилл', img: 'f2', blurb: 'Старый дом на холме, хозяйка не спит, жилец ушёл с вечера', x: 76, y: 31,
    gm: 'Второй этаж дома миссис Глэдис Ригг (хозяйка, любопытная, в бигуди, у неё запасной ключ; пустит, если убедить, что профессор в беде, или если Сыщик покажет старый значок). Крейна нет с семи вечера. Кабинет: камертоны, фонограф с восковым валиком (если завести — женский голос шепчет «Абель, тут нет дверей»), стол с тетрадями (улика K3, легко найти при поиске). Овальный портрет жены Элеоноры висит криво: за ним тайник (улика K4) — найти можно только при внимательном осмотре портрета или успешном броске кости. Миссис Ригг скажет, что после смерти жены профессор «разговаривал со стенами».',
    clues: ['K3', 'K4'] },
  m3: { code: 'М3', name: 'Закрытый фонд библиотеки', district: 'Мискатоникский университет', img: 'm3', blurb: 'Ночью закрыто; сторож Диксон решает кроссворд', x: 43, y: 31,
    gm: 'Ночью библиотека закрыта. Сторож Уолтер Диксон (решает кроссворд, пропустит за подсказку к кроссворду, удачную ложь или бросок) — у Оккультиста есть ключ от архива, но не от решётки фонда. Тетрадь Сайласа Уэйра, аркхэмского органиста 1702 года (улика K5): Оккультист прочтёт старый почерк и ноты; Сыщик сам не разберёт, но заметит, что последний лист вырван недавно (свежие волокна, в журнале выдачи — подпись «А. Крейн», 14 сентября). Опасность: если читать тетрадь вслух, стены начинают тихо гудеть (−1 самообладание при неосторожности).',
    clues: ['K5'] },
  n4: { code: 'Ц4', name: 'Полицейский участок', district: 'Центр, у ратуши', img: 'n4', blurb: 'Дежурит сержант Малоун, старый сослуживец Сыщика', x: 86, y: 67,
    gm: 'Дежурный сержант Пэт Малоун — старый сослуживец Сыщика, ворчливый, но верный. Считает, что Мэйбл похитили бутлегеры О\'Бэнниона из-за долга брата (ложный след R1). В архиве участка — дело Агаты Пирс 1921 года (улика K6, шёпотом только Сыщику: это его старое дело). В том же шкафу — папка о смерти Элеоноры Крейн и показаниях профессора (улика K7). Малоун пустит в архив, если Сыщик попросит по-человечески или вспомнит общее прошлое.',
    clues: ['K6', 'K7', 'R1'] },
  r5: { code: 'Р5', name: 'Пансион миссис Хоторн', district: 'Ривертаун', img: 'r5', blurb: 'Комната Мэйбл; её соседка Клара ещё не спит', x: 14, y: 73,
    gm: 'Дешёвый пансион у реки. Клара Уинтроп, соседка Мэйбл (резкая, ревнует к таланту подруги, но любит её; сначала грубит, смягчится, если увидит, что героям не всё равно). Расскажет: Крейн заставлял Мэйбл играть по вечерам «для стен», Мэйбл говорила, что слышит из стены своё детское имя. Дневник Мэйбл (улика K8) Клара прячет под матрасом и отдаст, если ей доверятся или пообещают вернуть подругу. Клара тоже знает про долг Томаса (ложный след R1).',
    clues: ['K8', 'R1'] }
};
const START_LOC = 'm1';
const TRAVEL_LIMIT = 3; // поездок за ночь: успеть можно три места из четырёх

const CLUES = {
  K1: { title: 'Нота, которой нет', loc: 'm1', text: 'Партитура на пюпитре обрывается знаком, похожим на скрипичный ключ, завязанный узлом. Под ним карандашом, не почерком Мэйбл: «тише, чем тишина». На полях: «2:00 — дверь закроется».' },
  K2: { title: 'Музыка за стеной', loc: 'm1', whisper: 'occultist', text: 'За северной стеной кто-то очень тихо играет ту же пьесу. Играющий сбивается на одном и том же такте и начинает заново. Мелодия врезается в память.' },
  K3: { title: 'Список слышащих', loc: 'f2', text: 'Тетрадь Крейна: имена детей и студентов за двадцать лет, у четверых пометка «слышит». Мэйбл Корвин отмечена сегодняшней датой. Агата Пирс: 1921, «ушла». Последняя строка: имя Оккультиста, 1907 год, «слышит отчётливо».' },
  K4: { title: 'Вырванная страница', loc: 'f2', text: 'Последний лист тетради Уэйра, спрятанный за портретом жены. Та же мелодия, записанная задом наперёд. Приписка: «Сыгравший обратно вернёт ушедшего, но сам шагнёт к двери. Держите его крепко».' },
  K5: { title: 'Тетрадь Уэйра, 1702', loc: 'm3', text: '«Есть нота тише тишины. Кто сыграет её, уйдёт в комнату за комнатой. Вернуть его может лишь тот, кто слышит, если другой держит его за руку и говорит о нём правду. Ложь не удержит». Последний лист вырван недавно, в журнале выдачи подпись: А. Крейн.' },
  K6: { title: 'Дело Агаты Пирс, 1921', loc: 'n4', whisper: 'detective', text: 'Твоё старое дело. Скрипачка исчезла из той же комнаты 3-Б. На фотографии из дела тот же знак мелом на стене. На полях твоим почерком: «закрыть». Её преподаватель: А. Крейн.' },
  K7: { title: 'Смерть Элеоноры Крейн', loc: 'n4', text: 'Жена профессора умерла от тифа в больнице Святой Марии в марте 1923-го. Похоронена на Кладбище Христа. В протоколе Крейн настаивал: «Она не умерла. Она ушла за стену, и я за ней приду».' },
  K8: { title: 'Дневник Мэйбл', loc: 'r5', text: 'Последняя запись: «Профессор говорит, в городе есть ещё один, кто слышит. Если я уйду, пусть меня позовут именем, которым звала мама: Белла. Только так я найду дорогу».' },
  R1: { title: 'Долг Томаса', loc: 'n4', alt: 'r5', herring: true, text: 'Томас Корвин задолжал 300 долларов людям О\'Бэнниона. Полиция уверена, что Мэйбл увезли бутлегеры. Но бутлегеры не запирают двери изнутри.' }
};
const CLUE_ORDER = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'R1'];

const TRUTH = `Профессор акустики Абель Крейн (52 года, вдовец) три года назад нашёл в архиве тетрадь органиста Сайласа Уэйра (1702) о «ноте тише тишины». Её может сыграть только тот, кто слышит музыку из-за стен, и сыгравший уходит в «комнату за комнатой» — складку пространства за стенами репетиционной 3-Б. Крейн уверен, что его умершая от тифа жена Элеонора ушла туда (это бред горя: она умерла, есть свидетельство). Двадцать лет он записывал «слышащих» детей. В 1921-м он уже заставил сыграть ноту Агату Пирс, и она исчезла; дело замял сержант, нынешний Сыщик. Сегодня в 19:00 Крейн заставил сыграть Мэйбл Корвин, а сам ушёл с вырванной последней страницей: на ней мелодия задом наперёд, которой можно вернуть ушедшего. В 2:00 «дверь» закроется до следующего равноденствия. Крейн вернётся в 3-Б к двум часам, чтобы сыграть ноту самому и уйти за женой; для этого ему нужен ещё один слышащий, и в его списке есть Оккультист. Мэйбл жива и играет за стеной, сбиваясь на одном такте. Агата тоже там, пять лет для неё прошли как один вечер. Вернуть можно так: слышащий (Оккультист) играет мелодию обратно, а напарник держит его за руку и говорит о нём правду, иначе комната заберёт и его. Ушедшего нужно позвать по истинному имени (Мэйбл мать звала Беллой).`;

const TAXI_QUESTIONS = [
  'Что тебе нравится в ночном городе?',
  'Когда тебе в последний раз было по-настоящему спокойно?',
  'Какая музыка связана у тебя с важным моментом?',
  'Чем тебя проще всего рассмешить?',
  'Какую мелочь о тебе мало кто знает?',
  'Какое место тебе хотелось бы показать человеку, который тебе нравится?',
  'О чём тебе хочется, чтобы тебя спрашивали чаще?',
  'Что тебя по-настоящему радует в людях?'
];

/* ---------- Род ---------- */
const g = (pron, m, f) => (pron === 'она' ? f : m);

/* ---------- Состояние ---------- */
function initialState() {
  return {
    phase: 'lobby', mode: null, hostCid: null, title: 'Тихая нота',
    seats: { detective: null, occultist: null },
    hour: 0, loc: START_LOC, visited: [START_LOC], calm: 6, maxCalm: 6,
    clues: {}, secretsShown: { detective: false, occultist: false },
    roll: null, turn: 'detective',
    log: [], seq: -1, lastReq: -1, gmUpTo: -1, travels: 0,
    pause: null, pauseDone: false, arrival: null,
    finale: { accuse: '', anchors: { detective: '', occultist: '' }, conf: { detective: null, occultist: null }, choices: { crane: false, bella: false, agatha: false } },
    ending: null, xcards: 0
  };
}
const clone = o => JSON.parse(JSON.stringify(o));
const seatOf = (s, k) => s.seats[k] || { name: SEATS[k].label, pron: 'он', player: '' };
const nameOf = (s, k) => seatOf(s, k).name || SEATS[k].label;
const hourLabel = h => { const t = 22 + h; return String(t % 24).padStart(2, '0') + ':00'; };
const has = (s, id) => !!s.clues[id];

function introText(s) {
  const d = seatOf(s, 'detective'), o = seatOf(s, 'occultist');
  return `Аркхэм, вторник, 21 сентября 1926 года. Третьи сутки льёт дождь, и Мискатоник поднялся до самых опор моста на Гаррисон-стрит.

Консерваторское крыло университета темно, горит только репетиционная 3-Б. Дверь была заперта изнутри, полчаса назад сторож её вскрыл. Внутри никого. Рояль открыт, табурет опрокинут, на пюпитре недописанная партитура. Окно третьего этажа закрыто на шпингалет.

Томас Корвин, промокший юноша в дешёвом пиджаке, мнёт кепку: «Моя сестра Мэйбл была здесь в семь вечера. Сторож клянётся, что она не выходила. В полиции говорят, сбежала с кавалером. Она не могла».

${d.name} ${g(d.pron, 'пришёл', 'пришла')} сюда, потому что Томасу больше не к кому идти. ${o.name} — потому что ректорат попросил архивиста взглянуть на странные ноты. Едва вы переступаете порог, ${o.name} ${g(o.pron, 'чувствует', 'чувствует')}, как закладывает уши, будто при спуске с холма. У северной стены на пять градусов холоднее, чем в коридоре.

Часы на часовне бьют десять. Что вы делаете?`;
}
function taxiText(s) {
  return `Такси ползёт сквозь ливень. Водитель молчит, дворники скрипят, огни Аркхэма расплываются на стекле. Полночь. До двух часов ещё есть время, но в машине вдруг становится тихо, и музыка за стенами на минуту смолкает.

${nameOf(s, 'detective')} и ${nameOf(s, 'occultist')} сидят рядом на холодном кожаном сиденье. Можно поговорить не о деле.`;
}
function finaleIntro(s) {
  return `Без пяти два. Консерваторское крыло. Северная стена репетиционной 3-Б колышется, как чёрная вода, и сквозь неё уже видно силуэт девушки за роялем. Она снова и снова сбивается на одном такте.

Дверь за вашими спинами скрипит. На пороге стоит профессор Абель Крейн, мокрый, с футляром камертонов. Его взгляд останавливается на том, кто слышит: «${nameOf(s, 'occultist')}… Вы пришли. Я записал вас в тетрадь девятнадцать лет назад. Сыграйте ноту. Мне нужно к ней».`;
}

/* Ивенты, на которые должен ответить ведущий */
const NEEDS_GM = new Set(['act', 'roll', 'x', 'pause_end', 'arrive', 'play_note']);

function reduce(state, ev) {
  const s = state; s.seq++;
  const seq = s.seq, t = ev.t;
  const isHost = ev.cid && ev.cid === s.hostCid;
  const seat = SEATS[ev.seat] ? ev.seat : null;
  const push = e => s.log.push({ seq, ...e });
  switch (t) {
    case 'create':
      if (!s.hostCid) { s.hostCid = ev.cid; s.mode = ev.mode || 'online'; }
      break;
    case 'claim': {
      if (s.phase !== 'lobby' || !seat) break;
      const cur = s.seats[seat];
      if (cur && cur.cid !== ev.cid && !ev.force) break;
      if (s.mode === 'online') for (const k of SEAT_KEYS) if (k !== seat && s.seats[k] && s.seats[k].cid === ev.cid) s.seats[k] = null;
      const pron = PRONS.includes(ev.pron) ? ev.pron : (cur ? cur.pron : '');
      s.seats[seat] = { cid: ev.cid, pron, name: String(ev.name || (cur && cur.name) || '').slice(0, 40), player: String(ev.player || (cur && cur.player) || '').slice(0, 30), ready: false };
      break;
    }
    case 'profile': {
      if (s.phase !== 'lobby' || !seat || !s.seats[seat] || s.seats[seat].cid !== ev.cid) break;
      const pron = PRONS.includes(ev.pron) ? ev.pron : '';
      const name = String(ev.name || (pron ? SEATS[seat].names[pron] : '')).trim().slice(0, 40);
      Object.assign(s.seats[seat], { pron, name, player: String(ev.player || '').trim().slice(0, 30), ready: !!ev.ready && !!pron && !!name });
      break;
    }
    case 'leave':
      if (s.phase === 'lobby' && seat && s.seats[seat] && s.seats[seat].cid === ev.cid) s.seats[seat] = null;
      break;
    case 'start':
      if (s.phase !== 'lobby' || !isHost || !SEAT_KEYS.every(k => s.seats[k] && s.seats[k].ready)) break;
      s.phase = 'play'; s.turn = 'detective';
      push({ kind: 'scene', img: 'm1', title: 'Репетиционная 3-Б · ' + hourLabel(0) });
      push({ kind: 'gm', text: introText(s) });
      s.gmUpTo = seq;
      break;
    case 'act': case 'say':
      if ((s.phase !== 'play' && s.phase !== 'finale') || !seat) break;
      push({ kind: t, seat, text: String(ev.text || '').slice(0, 1200) });
      if (t === 'act' && s.phase === 'play') s.lastReq = seq;
      break;
    case 'travel': {
      const l = LOCATIONS[ev.loc];
      if (s.phase !== 'play' || !seat || !l || s.roll || s.visited.includes(ev.loc) || s.travels >= TRAVEL_LIMIT) break;
      s.travels++; s.hour++; s.loc = ev.loc; s.visited.push(ev.loc);
      push({ kind: 'travel', seat, loc: ev.loc, text: `${nameOf(s, seat)} ловит такси: ${l.code} ${l.name}` });
      if (s.hour === 2 && !s.pauseDone) {
        const n = TAXI_QUESTIONS.length, a = ((ev.qa | 0) % n + n) % n; let b = ((ev.qb | 0) % n + n) % n; if (b === a) b = (a + 1) % n;
        s.phase = 'pause';
        s.pause = { q: { detective: TAXI_QUESTIONS[a], occultist: TAXI_QUESTIONS[b] }, ans: {}, ask: {}, conf: {} };
        push({ kind: 'scene', img: 'taxi', title: 'Такси под дождём · 00:00' });
        push({ kind: 'gm', text: taxiText(s), static: true });
      } else {
        push({ kind: 'scene', img: l.img, title: `${l.name} · ${hourLabel(s.hour)}` });
        s.arrival = ev.loc; s.lastReq = seq;
      }
      break;
    }
    case 'help':
      if (s.roll && seat && seat !== s.roll.seat && !s.roll.helped) { s.roll.helped = seat; push({ kind: 'help', seat, text: String(ev.text || '').slice(0, 300) }); }
      break;
    case 'roll': {
      if (!s.roll || seat !== s.roll.seat) break;
      const dice = (Array.isArray(ev.dice) ? ev.dice : []).map(x => Math.max(1, Math.min(6, x | 0))).slice(0, s.roll.helped ? 2 : 1);
      if (!dice.length) break;
      const d = Math.max(...dice);
      const outcome = d >= 5 ? 'успех' : d >= 3 ? 'успех, но с ценой' : 'провал';
      if (d === 1) s.calm = Math.max(0, s.calm - 1);
      push({ kind: 'roll', seat, dice, d, outcome, why: s.roll.why, helped: s.roll.helped || null });
      s.roll = null; s.lastReq = seq;
      break;
    }
    case 'gm': {
      if (typeof ev.upTo !== 'number') break;
      const text = String(ev.text || '').slice(0, 4000);
      if (s.phase === 'play') {
        push({ kind: 'gm', text });
        for (const id of Array.isArray(ev.clues) ? ev.clues : []) {
          const c = CLUES[id];
          if (!c || s.clues[id] || (c.loc !== s.loc && c.alt !== s.loc)) continue;
          s.clues[id] = { seq, whisper: c.whisper || null, shared: !c.whisper };
          if (c.whisper) push({ kind: 'whisper', to: c.whisper, clue: id, text: String(ev.whisper || c.text).slice(0, 700) });
          else push({ kind: 'clue', clue: id });
        }
        const dc = Math.max(-2, Math.min(1, ev.calm | 0));
        if (dc) { s.calm = Math.max(0, Math.min(s.maxCalm, s.calm + dc)); push({ kind: 'sys', text: dc < 0 ? `Самообладание ${dc}` : 'Самообладание +1' }); }
        if (SEATS[ev.next]) s.turn = ev.next;
        s.roll = ev.roll && SEATS[ev.roll.seat] ? { seat: ev.roll.seat, why: String(ev.roll.why || 'рискованное действие').slice(0, 160), helped: null } : null;
        s.arrival = null;
        if (s.calm <= 0) { s.phase = 'finale'; s.roll = null; push({ kind: 'sys', text: 'Нервы на пределе. Вы бежите обратно в консерваторию, пока ещё можете.' }); push({ kind: 'scene', img: 'finale', title: 'Репетиционная 3-Б · 02:00' }); push({ kind: 'gm', text: finaleIntro(s), static: true }); }
      }
      s.gmUpTo = Math.max(s.gmUpTo, ev.upTo);
      break;
    }
    case 'share':
      if (seat && s.clues[ev.clue] && s.clues[ev.clue].whisper === seat && !s.clues[ev.clue].shared) {
        s.clues[ev.clue].shared = true; push({ kind: 'sys', text: `${nameOf(s, seat)} рассказывает напарнику: «${CLUES[ev.clue].title}»` });
      }
      break;
    case 'secret':
      if (seat && !s.secretsShown[seat] && s.phase !== 'lobby') {
        s.secretsShown[seat] = true; push({ kind: 'secret', seat, text: SEATS[seat].secret });
      }
      break;
    case 'pause_answer':
      if (s.phase === 'pause' && seat && !s.pause.ans[seat]) { s.pause.ans[seat] = String(ev.text || '').slice(0, 800) || '—'; push({ kind: 'answer', seat, q: s.pause.q[seat], text: ev.text ? String(ev.text).slice(0, 800) : '' }); }
      break;
    case 'guess':
      if (s.phase === 'pause' && seat && s.pause.ans[other(seat)] && !s.pause.ask[other(seat)]) s.pause.ask[other(seat)] = true;
      break;
    case 'confirm':
      if (s.phase === 'pause' && seat && s.pause.ask[seat] && !s.pause.conf[seat]) {
        s.pause.conf[seat] = ev.val === 'self' ? 'self' : 'hero';
        if (ev.val === 'self') { s.calm = Math.min(s.maxCalm, s.calm + 1); push({ kind: 'sys', text: `${nameOf(s, seat)}: «Это было про меня». Самообладание +1` }); }
        else push({ kind: 'sys', text: `${nameOf(s, seat)}: «Это ответ героя»` });
      }
      break;
    case 'pause_end':
      if (s.phase === 'pause' && SEAT_KEYS.every(k => s.pause.ans[k])) {
        s.phase = 'play'; s.pauseDone = true; s.calm = Math.min(s.maxCalm, s.calm + 1);
        const l = LOCATIONS[s.loc];
        push({ kind: 'sys', text: 'Разговор в такси возвращает силы. Самообладание +1' });
        push({ kind: 'scene', img: l.img, title: `${l.name} · ${hourLabel(s.hour)}` });
        s.arrival = s.loc; s.lastReq = seq;
      }
      break;
    case 'finale':
      if (s.phase === 'play' && !s.roll) {
        s.phase = 'finale'; s.hour = 4;
        push({ kind: 'scene', img: 'finale', title: 'Репетиционная 3-Б · 02:00' });
        push({ kind: 'gm', text: finaleIntro(s), static: true });
      }
      break;
    case 'fset':
      if (s.phase !== 'finale') break;
      if (ev.field === 'accuse') s.finale.accuse = String(ev.text || '').slice(0, 600);
      if (ev.field === 'anchor' && seat) { s.finale.anchors[seat] = String(ev.text || '').slice(0, 400); s.finale.conf[other(seat)] = null; }
      break;
    case 'fconf':
      if (s.phase === 'finale' && seat && s.finale.anchors[other(seat)]) s.finale.conf[seat] = ev.val ? 'yes' : 'no';
      break;
    case 'choice':
      if (s.phase === 'finale' && ev.key in s.finale.choices && choiceAvailable(s, ev.key)) s.finale.choices[ev.key] = !!ev.val;
      break;
    case 'play_note':
      if (s.phase === 'finale' && finaleReady(s)) { s.phase = 'resolving'; s.outcome = computeOutcome(s); push({ kind: 'sys', text: `${nameOf(s, 'occultist')} садится за рояль. ${nameOf(s, 'detective')} берёт напарника за руку.` }); s.lastReq = seq; }
      break;
    case 'ending':
      if (s.phase === 'resolving') { s.phase = 'ending'; s.ending = { text: String(ev.text || '').slice(0, 6000) }; push({ kind: 'scene', img: s.outcome.mabel === 'lost' ? 'dark' : 'dawn', title: 'Рассвет' }); push({ kind: 'gm', text: s.ending.text }); s.gmUpTo = Math.max(s.gmUpTo, ev.upTo | 0); }
      break;
    case 'x':
      if (s.phase === 'play' || s.phase === 'finale') { s.xcards++; push({ kind: 'x', seat }); if (s.phase === 'play') s.lastReq = seq; }
      break;
  }
  return s;
}
function choiceAvailable(s, key) {
  if (key === 'crane') return has(s, 'K7');
  if (key === 'bella') return has(s, 'K8');
  if (key === 'agatha') return has(s, 'K6') && s.secretsShown.detective;
  return false;
}
function finaleReady(s) {
  const f = s.finale;
  return f.accuse.trim() && SEAT_KEYS.every(k => f.anchors[k].trim() && f.conf[k]);
}
function computeOutcome(s) {
  const f = s.finale;
  const canReverse = has(s, 'K4') || (has(s, 'K2') && has(s, 'K5'));
  const strength = SEAT_KEYS.filter(k => f.conf[k] === 'yes').length;
  let mabel = 'lost';
  if (canReverse && strength >= 1) mabel = f.choices.bella && strength === 2 ? 'full' : 'partial';
  const agatha = mabel !== 'lost' && f.choices.agatha && strength === 2;
  const crane = f.choices.crane ? 'saved' : 'lost';
  let stars = 0;
  if (mabel === 'full') stars += 2; else if (mabel === 'partial') stars += 1;
  if (agatha) stars += 1; if (crane === 'saved') stars += 1; if (strength === 2) stars += 1;
  const title = mabel === 'full' && agatha ? 'Две мелодии' : mabel === 'full' ? 'Белла вернулась' : mabel === 'partial' ? 'Вернулась не вся' : 'Тише тишины';
  return { canReverse, strength, mabel, agatha, crane, stars: Math.min(5, stars), title };
}
function replay(events) {
  let s = initialState();
  for (const ev of events) s = reduce(s, ev);
  return s;
}
function pending(s) { return s.lastReq > s.gmUpTo && (s.phase === 'play' || s.phase === 'resolving'); }

/* ---------- Промпты ведущего ---------- */
function heroLines(s) {
  return SEAT_KEYS.map(k => { const p = seatOf(s, k);
    return `- ${SEATS[k].label} (id: ${k}) — ${p.name}, ${g(p.pron, 'мужчина, мужской род', 'женщина, женский род')}. ${SEATS[k].role}. Умения: ${SEATS[k].skills}. Тайна (игрок пока ${s.secretsShown[k] ? 'УЖЕ рассказал её напарнику' : 'держит её при себе'}): ${SEATS[k].secret}`; }).join('\n');
}
function systemPrompt(s) {
  const locs = Object.entries(LOCATIONS).map(([id, l]) => `${id} — ${l.code} «${l.name}» (${l.district}). Улики здесь: ${l.clues.join(', ')}. Заметки: ${l.gm}`).join('\n');
  const clues = CLUE_ORDER.map(id => { const c = CLUES[id]; return `${id} «${c.title}»${c.whisper ? ` [ШЁПОТ: только для ${c.whisper}]` : ''}${c.herring ? ' [ложный след]' : ''}: ${c.text}`; }).join('\n');
  return `Ты — ведущий (гейммастер) короткой кооперативной детективной игры «Аркхэм на двоих: Тихая нота» в духе Лавкрафта. Аркхэм, ночь на 22 сентября 1926 года, ливень. Играют двое людей, которые только знакомятся. Партия идёт около 15 минут. Твоя задача — атмосферная, понятная и живая история, в которой героям нужны умения друг друга.

ПРАВДА О ДЕЛЕ (скрыта от игроков, не выдавай её прямо):
${TRUTH}

ГЕРОИ:
${heroLines(s)}

МЕСТА (id — код «название»):
${locs}

УЛИКИ (выдавай только те, что лежат в текущем месте):
${clues}

ПРАВИЛА ВЕДУЩЕГО:
1. Пиши по-русски, образно и коротко: 50–120 слов, 1–2 абзаца. Настоящее время. Обращайся к героям по именам и соблюдай их род.
2. Отвечай на последние действия игроков. Если действовали оба — ответь обоим.
3. Улику выдавай, когда герои ищут, спрашивают или рискуют в правильном месте. Обычно не больше одной улики за ответ, но не жадничай: за одно место можно найти всё за 2–3 хода. В тексте опиши находку своими словами.
4. Улику с пометкой ШЁПОТ не описывай в общем тексте. Скажи только, что герой что-то заметил/услышал, а суть напиши в поле whisper.
5. Помогай умениям: Сыщику легче с людьми и замками, Оккультисту — с нотами, текстами и тем, что за стеной. Создавай моменты, где один нужен другому.
6. Рискованное действие (взлом, обман, давление, чтение запретного вслух) — попроси бросок через поле roll, исход не решай заранее. Не чаще одного броска на место.
7. Самообладание (поле calm): −1 за по-настоящему жуткое, обычно 0. +1 за тёплый момент поддержки между героями.
8. Если игроки делают то, что не продвигает дело, мягко подтолкни: деталь, звук, реплика персонажа.
9. Не раскрывай разгадку и не пересказывай улики, которых герои не нашли. Время идёт только за поездки, на месте можно действовать сколько угодно.
10. Жуть — через намёки, звуки и холод. Без жестокости и откровенного. Если подняли стоп-карту, сразу и мягко смени сцену и не возвращайся к ней.
11. Заверши обращением к одному герою по имени с вопросом. Чередуй героев, чтобы оба участвовали поровну.
12. Пиши только своё повествование. Не повторяй служебные строки хроники («НАЙДЕНА УЛИКА», «[Самообладание]», реплики игроков) и не пиши за игроков их действия.

ФОРМАТ ОТВЕТА СТРОГО: сначала текст повествования (без заголовков и списков), затем отдельной строкой ровно @@@, затем одна строка JSON:
{"next":"detective|occultist","clues":["K1"],"whisper":null,"calm":0,"roll":null}
— clues: id найденных сейчас улик (или пустой список); whisper: текст шёпота для улики с пометкой ШЁПОТ или null; roll: null или {"seat":"detective|occultist","why":"что решает бросок"}.`;
}
function logLine(s, e) {
  const n = k => `${SEATS[k] ? SEATS[k].label : ''} ${nameOf(s, k)}`;
  switch (e.kind) {
    case 'gm': return `ВЕДУЩИЙ: ${e.text}`;
    case 'act': return `${n(e.seat)} (действие): ${e.text}`;
    case 'say': return `${n(e.seat)} (говорит напарнику): ${e.text}`;
    case 'travel': return `ПОЕЗДКА: герои едут в ${LOCATIONS[e.loc].code} ${LOCATIONS[e.loc].name}`;
    case 'scene': return `--- СЦЕНА: ${e.title} ---`;
    case 'help': return `${n(e.seat)} помогает напарнику перед броском: ${e.text || ''}`;
    case 'roll': return `БРОСОК ${n(e.seat)} «${e.why}»: кости ${e.dice.join(' и ')} → ${e.outcome}`;
    case 'clue': return `НАЙДЕНА УЛИКА ${e.clue} «${CLUES[e.clue].title}»`;
    case 'whisper': return `ШЁПОТ для ${e.to}: ${e.text}`;
    case 'secret': return `${n(e.seat)} РАССКАЗЫВАЕТ НАПАРНИКУ СВОЮ ТАЙНУ: ${e.text}`;
    case 'answer': return `(разговор в такси) ${n(e.seat)} отвечает на вопрос «${e.q}»: ${e.text || 'ответ вслух'}`;
    case 'x': return 'СТОП-КАРТА: игроку неприятна последняя сцена';
    case 'sys': return `[${e.text}]`;
    default: return '';
  }
}
function stateLine(s) {
  const l = LOCATIONS[s.loc];
  const found = Object.keys(s.clues);
  const left = l.clues.filter(id => !s.clues[id]);
  return `СОСТОЯНИЕ: время ${hourLabel(s.hour)}, поездок осталось ${TRAVEL_LIMIT - s.travels} из ${TRAVEL_LIMIT}. Герои в: ${s.loc} ${l.code} «${l.name}». Самообладание ${s.calm}/${s.maxCalm}.
Найдено улик: ${found.length ? found.join(', ') : 'ни одной'}. Ещё не найдено в этом месте: ${left.length ? left.join(', ') : 'ничего — подтолкни героев ехать дальше'}.`;
}
function triggerLine(s, events) {
  if (s.arrival) {
    const l = LOCATIONS[s.arrival];
    return `Герои только что приехали в ${l.code} «${l.name}». Опиши место и людей так, чтобы было понятно, что здесь можно сделать. Улику сразу не отдавай.`;
  }
  const last = s.log.filter(e => e.seq > s.gmUpTo);
  if (last.some(e => e.kind === 'x')) return 'Подняли стоп-карту. Сразу смени сцену и продолжи с другой стороны.';
  if (last.some(e => e.kind === 'roll')) return 'Только что был бросок. Опиши последствия строго по исходу: успех — получилось; успех с ценой — получилось, но есть осложнение; провал — не вышло, и стало хуже.';
  return 'Ответь на последние действия игроков (см. конец хроники).';
}
function turnMessages(s) {
  const recent = s.log.filter(e => !(e.kind === 'gm' && e.static && e.seq < s.gmUpTo - 40)).slice(-36).map(e => logLine(s, e)).filter(Boolean).join('\n');
  return [
    { role: 'system', content: systemPrompt(s) },
    { role: 'user', content: `ХРОНИКА:\n${recent}\n\n${stateLine(s)}\n\nСЕЙЧАС: ${triggerLine(s)}` }
  ];
}
function endingMessages(s) {
  const o = s.outcome, f = s.finale, D = nameOf(s, 'detective'), O = nameOf(s, 'occultist');
  const pd = seatOf(s, 'detective').player || D, po = seatOf(s, 'occultist').player || O;
  const facts = [
    `Разгадка игроков: «${f.accuse}».`,
    `${D} (держит за руку) говорит правду об игроке ${po}: «${f.anchors.detective}» — ${f.conf.occultist === 'yes' ? 'это правда, подтверждено' : 'не совсем правда'}.`,
    `${O} говорит правду об игроке ${pd}: «${f.anchors.occultist}» — ${f.conf.detective === 'yes' ? 'это правда, подтверждено' : 'не совсем правда'}.`,
    o.canReverse ? `Мелодию обратно сыграть можно (${has(s, 'K4') ? 'нашли вырванную страницу' : 'Оккультист запомнил мелодию из-за стены и знает правило Уэйра'}).` : 'Мелодии обратно у героев нет: они не нашли ни страницу, ни правило.',
    o.mabel === 'full' ? 'ИТОГ: Мэйбл возвращается целиком — её позвали Беллой.' : o.mabel === 'partial' ? 'ИТОГ: Мэйбл возвращается, но не вся: без истинного имени (или без полной правды) часть её памяти о музыке осталась за стеной.' : 'ИТОГ: Мэйбл вернуть не удалось, стена закрылась. Оккультиста едва удержали.',
    o.agatha ? `ИТОГ: вместе с Мэйбл из стены выходит Агата Пирс, исчезнувшая в 1921-м: для неё прошёл один вечер. ${D} наконец закрывает своё старое дело по-настоящему.` : (has(s, 'K6') ? 'Агата Пирс остаётся за стеной.' : ''),
    o.crane === 'saved' ? 'ИТОГ: герои показали Крейну свидетельство о смерти жены. Он ломается, плачет и опускает камертон: он остаётся жив и сдаётся полиции.' : 'ИТОГ: Крейн сам играет ноту и уходит за стену искать жену. Его больше никто не видит.'
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: `Ты — ведущий игры «Аркхэм на двоих: Тихая нота». Сейчас финал. Правда о деле: ${TRUTH}\n\nГерои: ${D} (${g(seatOf(s, 'detective').pron, 'он', 'она')}, Сыщик), ${O} (${g(seatOf(s, 'occultist').pron, 'он', 'она')}, Оккультист).` },
    { role: 'user', content: `Напиши финальную сцену и эпилог по-русски, 200–300 слов, 3–4 абзаца, без заголовков и списков.
Факты, которые нужно отразить точно:
${facts}

Сцена: два часа ночи, комната 3-Б, ${O} играет мелодию задом наперёд, ${D} держит за руку и вслух говорит правду о напарнике — процитируй эти слова (можно чуть сгладить), и пусть именно они удерживают. Процитируй и то, что в ответ говорит ${O}. Затем исход по фактам. Последний абзац — рассвет над Аркхэмом и тёплая нота о том, что эти двое теперь знают друг о друге что-то настоящее. Ничего не добавляй после текста.` }
  ];
}
function parseGm(text) {
  const i = text.indexOf('@@@');
  let narr = (i >= 0 ? text.slice(0, i) : text).trim();
  let data = {};
  const raw = i >= 0 ? text.slice(i + 3) : '';
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) { try { data = JSON.parse(raw.slice(a, b + 1)); } catch (e) { data = {}; } }
  narr = narr.replace(/^\s*(ВЕДУЩИЙ|Ведущий)\s*:\s*/, '').replace(/```[a-z]*\s*$/i, '');
  const service = /^\s*(НАЙДЕНА УЛИКА|ШЁПОТ для|ПОЕЗДКА:|БРОСОК |СТОП-КАРТА|ХРОНИКА|СОСТОЯНИЕ:|СЕЙЧАС:|---\s*СЦЕНА|\[|(Сыщик|Оккультист)\s.*\((действие|говорит напарнику)\)|ВЕДУЩИЙ:)/;
  const lines = narr.split('\n'); const cut = lines.findIndex((l, i) => i > 0 && service.test(l));
  narr = (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim();
  return { narr, data };
}
function fallbackEnding(s) {
  const o = s.outcome, D = nameOf(s, 'detective'), O = nameOf(s, 'occultist');
  const parts = [`${O} садится за рояль и играет мелодию задом наперёд. ${D} крепко держит напарника за руку и говорит: «${s.finale.anchors.detective}». Стена отвечает гулом.`];
  if (o.mabel === 'full') parts.push('«Белла!» — зовёте вы, и из чёрной воды стены выходит Мэйбл, мокрая и живая, со своей музыкой в руках.');
  else if (o.mabel === 'partial') parts.push('Мэйбл выходит из стены, но смотрит сквозь вас: имя, которым её звала мама, осталось там.');
  else parts.push('Стена твердеет у вас на глазах. Музыка за ней обрывается на том же такте.');
  if (o.agatha) parts.push('Следом выходит девушка со скрипкой: Агата Пирс, 1921 год. Для неё прошёл один вечер.');
  parts.push(o.crane === 'saved' ? 'Крейн смотрит на свидетельство о смерти жены и опускает камертон.' : 'Крейн шагает в стену, пока она не закрылась, и исчезает.');
  parts.push('Над Аркхэмом встаёт мокрый рассвет. Вы идёте по пустой улице рядом и молчите о том, что теперь знаете друг о друге.');
  return parts.join('\n\n');
}

function sanitizeGm(s, data) {
  const here = LOCATIONS[s.loc];
  const ids = (Array.isArray(data.clues) ? data.clues : []).map(String).filter(id => CLUES[id] && !s.clues[id] && (CLUES[id].loc === s.loc || CLUES[id].alt === s.loc));
  let whisper = typeof data.whisper === 'string' ? data.whisper.trim() : (data.whisper && typeof data.whisper.text === 'string' ? data.whisper.text.trim() : '');
  if (/^K\d$/.test(whisper)) { if (CLUES[whisper] && CLUES[whisper].whisper && !ids.includes(whisper) && !s.clues[whisper] && here.clues.includes(whisper)) ids.push(whisper); whisper = ''; }
  const wid = here.clues.find(id => CLUES[id].whisper && !s.clues[id]);
  if (whisper && wid && !ids.includes(wid)) ids.push(wid);
  const wc = ids.find(id => CLUES[id].whisper);
  if (wc && !whisper) whisper = CLUES[wc].text;
  const roll = data.roll && SEATS[data.roll.seat] ? { seat: data.roll.seat, why: String(data.roll.why || '').slice(0, 160) } : null;
  return { clues: [...new Set(ids)], whisper: wc ? whisper : '', calm: Math.max(-2, Math.min(1, Math.round(Number(data.calm) || 0))), next: SEATS[data.next] ? data.next : other(s.turn), roll };
}

const Engine = { SEATS, SEAT_KEYS, other, LOCATIONS, CLUES, CLUE_ORDER, TAXI_QUESTIONS, TRAVEL_LIMIT, NEEDS_GM,
  initialState, reduce, replay, pending, hourLabel, nameOf, seatOf, choiceAvailable, finaleReady, computeOutcome,
  turnMessages, endingMessages, parseGm, sanitizeGm, fallbackEnding, g, clone };
root.Engine = Engine;
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
