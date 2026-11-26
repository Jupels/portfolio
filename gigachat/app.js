(() => {
  'use strict';

  /* =====================================================================
     Утилиты
     ===================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };
  const fmtDur = ms => {
    const s = Math.max(1, Math.round(ms / 1000));
    return s < 60 ? `${s} ${plural(s, 'секунду', 'секунды', 'секунд')}` : `${Math.floor(s / 60)} мин ${s % 60} с`;
  };
  const shortTitle = s => {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > 48 ? s.slice(0, 46).trim() + '…' : s || 'Новый чат';
  };

  marked.use({ gfm: true, breaks: true });
  const renderMd = text => DOMPurify.sanitize(marked.parse(text || ''));
  const plainText = md => { const d = document.createElement('div'); d.innerHTML = renderMd(md); return d.textContent.trim(); };

  const toastEl = $('#toast');
  let toastTimer;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
  }
  async function copyText(text, done = 'Скопировано') {
    try { await navigator.clipboard.writeText(text); toast(done); }
    catch { toast('Не удалось скопировать'); }
  }
  function parseJSON(text) {
    if (!text) return null;
    const s = String(text).replace(/```(?:json)?/g, '');
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
  }

  /* =====================================================================
     Промпты
     ===================================================================== */
  const SYS_ASK = 'Ты — ГигаЧат, ИИ-помощник. Отвечай на русском языке, понятно и по делу, дружелюбным тоном. ' +
    'Форматируй ответ в Markdown: короткие абзацы, списки, **жирный** для главного, таблицы — когда что-то сравниваешь. ' +
    'Не повторяй вопрос в начале ответа. Если спрашивают, кто ты, — ты ГигаЧат.';

  const SYS_META = 'Ты помогаешь интерфейсу чата. По вопросу пользователя и ответу ассистента верни строго JSON без пояснений:\n' +
    '{"title": "название чата, 2–5 слов, без кавычек и точки в конце", "suggestions": ["короткое продолжение от лица пользователя, до 6 слов", "ещё одно"], "isTask": false}\n' +
    'isTask = true, только если пользователь просит сделать работу из нескольких шагов с конкретным результатом (план, документ, расчёт, исследование, подборка), которую удобнее поручить как задачу.';

  const SYS_PLAN = 'Ты — ГигаЧат в режиме «Поручить». Пользователь поручает задачу. Составь план её выполнения. Верни строго JSON без пояснений:\n' +
    '{"title": "короткое название задачи, 2–5 слов", "summary": "что будет сделано и какой будет результат, одно предложение", "eta": "примерное время, например «≈ 1 мин»", "steps": [{"title": "глагол + объект, до 7 слов"}], "needs": []}\n' +
    'Шагов 3–5. Все шаги ты выполняешь сам, текстом: анализ, расчёты, идеи, составление, проверка. ' +
    'Не обещай действий во внешнем мире (звонки, оплата, отправка писем). ' +
    'В needs перечисли, что может понадобиться от пользователя, только если без этого никак; иначе оставь пустой список.';

  const SYS_STEP = 'Ты — ГигаЧат и выполняешь задачу пользователя по шагам. Сейчас выполни только текущий шаг — кратко, до 120 слов, в Markdown. ' +
    'Если данных не хватает, сделай разумные допущения и явно их назови. Не пиши вступлений.';

  const SYS_RESULT = 'Ты — ГигаЧат. Все шаги задачи выполнены. Собери итоговый результат, готовый к использованию: документ, план, расчёт или подборку. ' +
    'Структурируй его: заголовки, списки, таблицы — где уместно. Не пересказывай шаги, дай сам результат. В конце — 1–2 строки «Что дальше».';

  // Общий чат: несколько людей в одном треде
  const SYS_GROUP = 'Это общий чат: в нём переписываются несколько человек, каждая их реплика подписана именем («Имя: текст»), ' +
    'служебные события — в квадратных скобках. Отвечай всем сразу одним сообщением; если вопросов несколько — разбери каждый и обращайся по имени, ' +
    'чтобы было понятно, кому что. Не угадывай пол участников по имени — пиши нейтрально. Не начинай ответ с подписи и не пиши реплики за участников.';

  const SYS_RPG = 'Ты — ГигаЧат в роли ведущего (мастера) настольной ролевой игры в жанре фэнтези-приключения. ' +
    'Играют несколько человек: их реплики подписаны именами («Имя: текст»), события и броски кубиков — в квадратных скобках.\n' +
    'Правила ведущего:\n' +
    '— пиши по-русски, живо и образно, 80–180 слов за ход, в Markdown; **жирным** — важные имена, предметы и места;\n' +
    '— реагируй на действия каждого игрока и называй его по имени (или по имени его героя); не решай за игроков, что они делают, говорят и чувствуют;\n' +
    '— не угадывай пол игрока или героя по имени: пока героя не описали, обращайся нейтрально («твой герой», «ты»), потом — как описал сам игрок;\n' +
    '— если исход действия неочевиден, делай проверку: бери значения из «Броски на этот ход» строго по порядку и пиши так: «Проверка ловкости — d20: 14, успех». ' +
    'Сложность: 10 — обычная, 15 — трудная, 20 — почти невозможная. Не выдумывай броски сверх списка;\n' +
    '— если игрок сам бросил кубик, это проверка его действия: обязательно назови его бросок и исход («Лира, твой d20: 18 — успех») и не бери для этого действия значение из списка;\n' +
    '— у сцены есть цель, угроза и тайна; давай игрокам выбор и последствия;\n' +
    '— заканчивай ход вопросом «Что делаете?» или обращением к конкретному игроку;\n' +
    '— приключенческий тон без жестокости; не выходи из роли, пока тебя явно не попросят.';
  const RPG_START = '[Начало игры. Коротко поприветствуй игроков, в 2–3 предложениях задай завязку приключения и первую сцену ' +
    'и попроси каждого представить своего героя: имя, кто он и одна яркая черта.]';

  /* =====================================================================
     Заготовки: придуманные чаты, подчаты в папках, карточки задач
     ===================================================================== */
  const RECENT_SEEDS = [
    'Создание изображения баннера для акции',
    'Напиши 5 вариантов новогоднего поздравления',
    'Дизайн интерьера гостиной в скандинавском стиле',
    'Топ-5 идей для летнего тимбилдинга',
    'Утопические мечты: как создать идеальный город',
    'Новый год в IT: 5 креативных идей',
    'Лофт в вашем доме: идеи для ремонта',
    'Летние приключения: топ маршрутов по России',
    'Лофт: как создать уникальное пространство',
    'Тимбилдинг в парке: 5 идей для команды',
    'Рецепт сырников без муки',
    'Сравни тарифы мобильной связи',
    'План тренировок на 4 недели',
    'Перевод письма партнёрам на английский',
    'Подарок маме на день рождения',
    'Как объяснить ребёнку дроби',
    'Резюме для продуктового дизайнера',
    'Маршрут по Калининграду на 3 дня',
    'Что посадить на балконе весной',
    'Разбор договора аренды квартиры',
    'Сценарий для детского праздника',
    'Идеи логотипа для кофейни',
    'Список покупок на неделю',
    'Как начать бегать с нуля',
  ];
  const SEEDS = {};
  RECENT_SEEDS.forEach((title, i) => { SEEDS['r:' + i] = { title, prompt: title, mode: 'ask' }; });
  Object.assign(SEEDS, {
    'f:ege': { title: 'Подготовка к ЕГЭ по физике', mode: 'ask', folder: 'edu',
      prompt: 'Составь план подготовки к ЕГЭ по физике на 3 месяца: что повторять по неделям и как тренироваться' },
    'f:eng': { title: 'Английский: план на месяц', mode: 'ask', folder: 'edu',
      prompt: 'Составь план изучения английского на месяц по 30 минут в день для уровня A2' },
    'f:budget': { title: 'Бюджет семьи на ноябрь', mode: 'task', folder: 'fin', autoRun: true,
      prompt: 'Составь бюджет семьи из трёх человек на ноябрь: доход 150 000 ₽, ипотека 45 000 ₽, детский сад 12 000 ₽. Остальное распредели по категориям и заложи накопления' },
    'f:plan': { title: 'Планирование финансов на 2027', mode: 'ask', folder: 'fin',
      prompt: 'Помоги спланировать личные финансы на 2027 год: цели, подушка безопасности, накопления и инвестиции' },
    'c:ozon': { title: 'Исследование для Озона', sub: 'Проверить расчёт', look: 'review', mode: 'task', card: true,
      prompt: 'Проведи исследование: как небольшому продавцу выйти на маркетплейс Озон — комиссии, логистика, первые шаги и примерный расчёт юнит-экономики' },
    'c:cu': { title: 'Поступления в ЦУ', sub: 'Заявка готова', look: 'done', mode: 'task', card: true,
      prompt: 'Подготовь заявку на поступление в Центральный университет: требования, документы, сроки и черновик мотивационного письма' },
    'c:fin': { title: 'Планирование финансов', sub: 'Есть лишние траты', look: 'alert', mode: 'task', card: true,
      prompt: 'Проанализируй мои траты за месяц и найди лишние: доход 120 000 ₽, продукты 32 000 ₽, кафе 14 000 ₽, такси 9 500 ₽, подписки 3 200 ₽, маркетплейсы 18 000 ₽' },
  });

  /* =====================================================================
     Хранилище (localStorage) и состояние
     ===================================================================== */
  // Вкладка, открытая по приглашению в общий чат, хранит всё отдельно — иначе гость и
  // создатель в одном браузере затирали бы друг другу переписку.
  const GS = window.GigaShare || null;
  const JOIN = (() => {
    const m = /^#join=([a-z0-9]{6,32})\.([a-z0-9]{6,32})$/.exec(location.hash);
    return m ? { host: m[1], share: m[2] } : null;
  })();
  const STORE_KEY = JOIN ? 'giga.v1.guest' : 'giga.v1';
  const state = load();
  const runtime = { activeId: null, ctrl: {} }; // ctrl: AbortController активного запроса по id треда

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && s.threads) return { seeds: {}, hidden: [], ...s };
    } catch {}
    return { threads: {}, seeds: {}, hidden: [] };
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
    }, 250);
  }
  // То, что оборвалось перезагрузкой страницы, помечаем как остановленное.
  for (const t of Object.values(state.threads)) {
    for (const m of t.messages) {
      if (m.status === 'streaming') m.status = m.content ? 'stopped' : 'error';
      if (m.status === 'loading') { m.status = 'error'; m.error = 'Составление плана прервалось'; }
    }
    if (t.task && (t.task.status === 'running' || t.task.status === 'planning')) {
      t.task.status = t.task.plan ? 'stopped' : 'error';
      (t.task.steps || []).forEach(s => { if (s.status === 'running') s.status = 'pending'; });
    }
    // задачи из ранних версий прототипа получают id, результат привязывается к задаче
    if (t.task && !t.task.id) t.task.id = uid();
    for (const m of t.messages) if (m.kind === 'result' && !m.taskId && t.task) m.taskId = t.task.id;
  }

  // Карточки «Продолжить работу» теперь открывают готовые чаты-заготовки (fakes.js).
  // Чаты, созданные по ним раньше, отвязываем и убираем из карточек, в недавних они остаются.
  const FAKES = window.GIGA_FAKES || { threads: {}, docs: {} };
  for (const key of Object.keys(FAKES.threads)) {
    const old = state.threads[state.seeds[key]];
    if (old && old.fake !== key) {
      delete state.seeds[key];
      // чат, где была только стартовая формулировка карточки, удаляем; с вашей перепиской — оставляем
      if (old.messages.filter(m => m.role === 'user').length <= 1) delete state.threads[old.id];
      else if (!state.hidden.includes(old.id)) state.hidden.push(old.id);
    }
  }

  const threadList = () => Object.values(state.threads).sort((a, b) => b.updatedAt - a.updatedAt);
  const activeThread = () => state.threads[runtime.activeId];
  // у гостя общего чата модель вызывает создатель — «занят», пока его ответ идёт потоком
  const isBusy = t => !!runtime.ctrl[t.id] || (t.shared?.role === 'guest' && lastAssistant(t)?.status === 'streaming');
  const taskActive = t => !!t.task && isBusy(t) && (t.task.status === 'running' || t.task.status === 'planning');
  const touch = t => { t.updatedAt = Date.now(); };
  const lastAssistant = t => { for (let i = t.messages.length - 1; i >= 0; i--) if (t.messages[i].role === 'assistant') return t.messages[i]; return null; };

  function createThread({ mode, model, title, ...rest }) {
    const t = { id: uid(), mode, model, title: shortTitle(title), messages: [], createdAt: Date.now(), updatedAt: Date.now(), ...rest };
    state.threads[t.id] = t;
    save();
    return t;
  }

  /* =====================================================================
     API. Если в config.js есть ключ — страница ходит в OpenRouter сама
     (работает без сервера, например на GitHub Pages). Иначе — через node server.js.
     ===================================================================== */
  const CFG = window.GIGA_CONFIG || {};
  // ключ может быть открытым или зашифрованным паролем (тогда его кладёт gate.js после входа)
  const isDirect = () => !!((CFG.openrouterKey && CFG.openrouterKey.trim()) || CFG.encryptedKey);
  const MODEL = CFG.model || 'deepseek/deepseek-v4.1-flash';
  // назначение запроса → лимит токенов и формат (то же, что на сервере)
  const PURPOSES = {
    chat: { maxTokens: 2500, stream: true },
    result: { maxTokens: 3000, stream: true },
    step: { maxTokens: 700 },
    plan: { maxTokens: 900, json: true },
    meta: { maxTokens: 300, json: true },
  };

  async function request(purpose, messages, think, signal) {
    if (!isDirect()) {
      return fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose, think, messages }),
        signal,
      });
    }
    if (!CFG.openrouterKey) {
      // гость общего чата заводит свой чат — для этого нужен пароль прототипа
      const ok = window.GIGA_GATE ? await window.GIGA_GATE.ensure() : false;
      if (!ok || !CFG.openrouterKey) throw Object.assign(new Error('Чтобы начать свой чат, нужен пароль от прототипа'), { keep: true });
    }
    const cfg = PURPOSES[purpose];
    const useThink = think && (purpose === 'chat' || purpose === 'result');
    const payload = {
      model: MODEL,
      messages,
      stream: !!cfg.stream,
      max_tokens: cfg.maxTokens,
      reasoning: useThink ? { effort: 'medium' } : { enabled: false },
    };
    if (cfg.json) payload.response_format = { type: 'json_object' };
    const call = () => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CFG.openrouterKey.trim()}`,
        'Content-Type': 'application/json',
        'X-Title': 'Chat prototype',
      },
      body: JSON.stringify(payload),
      signal,
    });
    let res = await call();
    // если модель не приняла выключение рассуждений — повторяем без параметра
    if (res.status === 400 && !useThink) { delete payload.reasoning; res = await call(); }
    return res;
  }

  let mockNoted = false;
  async function api(purpose, messages, { think = false, signal, onDelta } = {}) {
    let res;
    try {
      res = await request(purpose, messages, think, signal);
    } catch (err) {
      if (err.name === 'AbortError' || err.keep) throw err;
      throw new Error(isDirect() ? 'Нет связи с OpenRouter — проверьте интернет' : 'Нет связи с сервером. Запустите node server.js');
    }
    if (res.headers.get('X-Mock') === '1' && !mockNoted) {
      mockNoted = true;
      toast('Демо-режим: ключ OpenRouter не подключён');
    }
    if (!res.ok) {
      let m = `Ошибка ${res.status}`;
      try { const j = await res.json(); m = (typeof j.error === 'string' ? j.error : j.error?.message) || m; } catch {}
      if (res.status === 401) m = 'Ключ OpenRouter не принят — проверьте config.js';
      if (res.status === 402) m = 'На ключе OpenRouter закончились средства';
      throw new Error(m);
    }
    if (!onDelta) {
      const j = await res.json();
      return (isDirect() ? j.choices?.[0]?.message?.content : j.content) || '';
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', content = '', reasoning = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.error) throw new Error(j.error.message || 'Ошибка модели');
        const d = j.choices?.[0]?.delta || {};
        const r = d.reasoning || d.reasoning_content || '';
        if (r) reasoning += r;
        if (d.content) content += d.content;
        if (r || d.content) onDelta({ content, reasoning });
      }
    }
    return { content, reasoning };
  }

  function buildMessages(t, system, exclude) {
    if (isGroup(t)) return groupMessages(t, exclude);
    const out = [{ role: 'system', content: system }];
    const hist = t.messages.filter(m => m !== exclude && m.status !== 'error');
    for (const m of hist.slice(-20)) {
      if (m.role === 'user') out.push({ role: 'user', content: m.content.slice(0, 8000) });
      else if (m.kind === 'plan' && (m.task || t.task)?.plan) out.push({ role: 'assistant', content: planAsText(m.task || t.task) });
      else if (m.content) out.push({ role: 'assistant', content: m.content.slice(0, 8000) });
    }
    // подряд идущие реплики одной роли склеиваем
    return out.reduce((acc, m) => {
      const prev = acc[acc.length - 1];
      if (prev && prev.role === m.role && m.role !== 'system') prev.content += '\n\n' + m.content;
      else acc.push({ ...m });
      return acc;
    }, []);
  }
  const planAsText = task => {
    const p = task.plan;
    return `План задачи «${p.title}»: ${p.summary}\nШаги: ${task.steps.map((s, i) => `${i + 1}. ${s.title}`).join('; ')}`;
  };
  // Карточка текущей задачи треда; прежние задачи хранятся в своих карточках (m.task)
  const currentPlanMsg = t => t.messages.find(m => m.kind === 'plan' && !m.task);
  function archiveTask(t) {
    const cur = currentPlanMsg(t);
    if (t.task && cur) cur.task = t.task;
  }

  /* =====================================================================
     Экраны
     ===================================================================== */
  const card = $('#card');
  const input = $('#input');
  const homeSend = $('#homeSend');
  const feed = $('#feed');
  const allIdeas = $('#allIdeas');
  const threadEl = $('#thread');
  const chatScroll = $('#chatScroll');
  const chatInput = $('#chatInput');
  const chatSend = $('#chatSend');
  const chatComposer = $('.chat-composer');
  const chatModel = $('#chatModel');
  const chatDice = $('#chatDice');
  let activeChip = null;

  function setView(view) {
    closeModelMenu();
    closePlusMenu();
    stopSpeaking();
    closeInvite();
    closePeople();
    closeDice();
    if (view !== 'chat') typingOff();
    card.dataset.view = view;
    if (view !== 'chat') runtime.activeId = null;
    $('#navVideo').classList.toggle('is-active', view === 'video');
    $('#navIdeas').classList.toggle('is-active', view === 'ideas');
    renderSidebar();
  }
  function newChat() {
    setIdeas(false);
    setMode('ask');
    input.value = '';
    updateHomeSend();
    setView('home');
    setTimeout(() => input.focus(), 60);
  }

  /* ---------- Спросить / Поручить ---------- */
  const segs = $$('.view-home .seg');
  function setMode(mode) {
    closeModelMenu();
    closePlusMenu();
    card.dataset.mode = mode;
    if (mode === 'ask') dropFormatTool('home');
    segs.forEach(s => s.setAttribute('aria-selected', String(s.dataset.mode === mode)));
  }
  segs.forEach(s => s.addEventListener('click', () => setMode(s.dataset.mode)));

  /* ---------- Все идеи ---------- */
  function setIdeas(open) {
    if (open) feed.scrollTop = 0;
    card.dataset.ideas = String(open);
    allIdeas.setAttribute('aria-expanded', String(open));
  }
  allIdeas.addEventListener('click', () => setIdeas(card.dataset.ideas !== 'true'));

  $$('.idea', card).forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.querySelector('.idea-title').textContent;
      updateHomeSend();
      setIdeas(false);
      setTimeout(() => input.focus({ preventScroll: true }), 450);
    });
  });
  $$('.sugg[data-fill]', card).forEach(btn => {
    btn.addEventListener('click', () => { input.value = btn.dataset.fill; updateHomeSend(); input.focus(); });
  });
  const filters = $('#filters');
  filters.addEventListener('click', e => {
    const f = e.target.closest('.filter');
    if (!f || f.hasAttribute('data-static')) return;
    filters.querySelectorAll('.filter').forEach(x => x.classList.toggle('is-active', x === f));
  });

  /* ---------- Композер главной ---------- */
  const homeComposer = $('.view-home .composer');
  function updateHomeSend() {
    const has = !!input.value.trim();
    homeSend.classList.toggle('has-text', has);
    homeComposer.classList.toggle('has-text', has); // при наборе прячем микрофон
    homeSend.title = has ? 'Отправить' : 'Голосовой режим';
  }
  input.addEventListener('input', updateHomeSend);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendFromHome(); }
  });
  homeSend.addEventListener('click', () => (input.value.trim() ? sendFromHome() : toast('Голосовой режим в прототипе не подключён')));

  function sendFromHome() {
    const text = input.value.trim();
    if (!text) return;
    const tool = toolState.home;
    const chip = card.dataset.mode === 'delegate' ? $('#homeModelTask') : $('#homeModelAsk');
    // «Глубокое исследование» выполняется как задача и из «Спросить»
    const isTask = card.dataset.mode === 'delegate' || tool === 'research';
    const t = createThread({ mode: isTask ? 'task' : 'ask', model: chip.dataset.model, title: text });
    input.value = '';
    updateHomeSend();
    setTool('home', null);
    openThread(t.id);
    if (isTask) startTask(t, text, { tool }); else sendAsk(t, text);
  }

  /* =====================================================================
     Переписка
     ===================================================================== */
  function openThread(id) {
    if (!state.threads[id]) return;
    stopSpeaking();
    closeModelMenu();
    closeInvite();
    closePeople();
    closeDice();
    setIdeas(false);
    if (runtime.activeId && runtime.activeId !== id) typingOff();
    runtime.activeId = id;
    card.dataset.view = 'chat';
    closePlusMenu();
    setTool('chat', null);
    chatInput.value = '';
    autoGrow();
    const t = state.threads[id];
    if (isGuest(t)) guestEnsure(t);
    syncChatComposer();
    renderThread(true);
    renderSidebar();
    renderShareUI();
    chatInput.focus({ preventScroll: true });
  }

  function openSeed(key) {
    const s = SEEDS[key];
    if (!s) return;
    const existing = state.threads[state.seeds[key]];
    if (existing) return openThread(existing.id);
    if (FAKES.threads[key]) return openFake(key);
    const t = createThread({
      mode: s.mode, model: s.mode === 'task' && !s.autoRun ? 'think' : 'fast',
      title: s.title, titleLocked: true, folder: s.folder || null,
    });
    state.seeds[key] = t.id;
    save();
    openThread(t.id);
    if (s.mode === 'task') startTask(t, s.prompt, { autoRun: s.autoRun }); else sendAsk(t, s.prompt);
  }

  // Готовый чат: переписка, выполненный план и файлы — всё из заготовки
  function openFake(key) {
    const f = FAKES.threads[key];
    const t = createThread({ mode: 'task', model: 'think', title: f.title, titleLocked: true, fake: key, cardLook: f.cardLook, cardSub: f.cardSub });
    const taskId = uid();
    t.messages = f.messages(taskId).map(m => ({ ...m, id: uid() }));
    const plan = t.messages.find(m => m.kind === 'plan');
    if (plan) {
      // задача завершилась пару часов назад и шла столько, сколько записано в заготовке
      const took = plan.task.finishedAt - plan.task.startedAt;
      plan.task.startedAt = Date.now() - 2 * 3600e3;
      plan.task.finishedAt = plan.task.startedAt + took;
      t.task = plan.task;
    }
    state.seeds[key] = t.id;
    save();
    openThread(t.id);
  }

  function pushMsg(t, m) {
    m.id = m.id || uid();
    t.messages.push(m);
    touch(t);
    shareMsg(t, m, true);
    if (runtime.activeId === t.id) {
      const prev = t.messages.slice(0, -1).reverse().find(x => x.role === 'assistant');
      // новое сообщение встаёт перед «Аня пишет…», если оно показано
      const typingEl = threadEl.querySelector('.typing-row');
      if (typingEl) typingEl.insertAdjacentHTML('beforebegin', msgHTML(t, m));
      else threadEl.insertAdjacentHTML('beforeend', msgHTML(t, m));
      threadEl.querySelector(`[data-mid="${m.id}"]`)?.classList.add('enter');
      if (prev) updateMsgEl(t, prev); // у прошлого ответа пропадают подсказки
      scrollToBottom(true);
    }
    return m;
  }
  function removeMsg(t, m) {
    const i = t.messages.indexOf(m);
    if (i >= 0) t.messages.splice(i, 1);
    if (isHosted(t)) sendAll(t, { t: 'del', id: m.id });
    threadEl.querySelector(`[data-mid="${m.id}"]`)?.remove();
  }

  function sendAsk(t, text) {
    pushMsg(t, { role: 'user', content: text });
    save();
    renderSidebar();
    return streamAnswer(t);
  }

  async function streamAnswer(t, { kind = null, purpose = 'chat', apiMessages = null, taskId } = {}) {
    const msg = pushMsg(t, { role: 'assistant', kind, taskId, content: '', reasoning: '', status: 'streaming', startedAt: Date.now() });
    const ctrl = new AbortController();
    runtime.ctrl[t.id] = ctrl;
    syncChatComposer();
    renderSidebar();
    try {
      await api(purpose, apiMessages || buildMessages(t, SYS_ASK, msg), {
        think: t.model === 'think',
        signal: ctrl.signal,
        onDelta: ({ content, reasoning }) => {
          msg.reasoning = reasoning;
          if (content && !msg.content && reasoning) msg.thinkMs = Date.now() - msg.startedAt;
          msg.content = content;
          scheduleUpdate(t, msg);
        },
      });
      msg.status = msg.content.trim() ? 'done' : 'error';
      if (msg.status === 'error') msg.error = 'Модель вернула пустой ответ';
    } catch (err) {
      if (err.name === 'AbortError') msg.status = 'stopped';
      else { msg.status = 'error'; msg.error = err.message; }
    } finally {
      if (msg.reasoning && !msg.thinkMs) msg.thinkMs = Date.now() - msg.startedAt;
      if (runtime.ctrl[t.id] === ctrl) delete runtime.ctrl[t.id];
      touch(t);
      save();
      updateMsgEl(t, msg);
      syncChatComposer();
      renderSidebar();
    }
    if (msg.status === 'done' && kind !== 'result') fetchMeta(t, msg);
    if (isGroup(t)) afterTurn(t);
    return msg;
  }

  // Название чата, подсказки-продолжения и признак «это задача» — одним дешёвым запросом.
  async function fetchMeta(t, msg) {
    const q = isGroup(t)
      ? t.messages.filter(m => m.role === 'user').slice(-4).map(m => humanLine(t, m)).join('\n')
      : [...t.messages].reverse().find(m => m.role === 'user')?.content || '';
    try {
      const raw = await api('meta', [
        { role: 'system', content: SYS_META },
        { role: 'user', content: `Вопрос: ${q.slice(0, 2000)}\n\nОтвет: ${msg.content.slice(0, 2000)}` },
      ]);
      const j = parseJSON(raw);
      if (!j) return;
      msg.suggestions = (Array.isArray(j.suggestions) ? j.suggestions : [])
        .filter(s => typeof s === 'string' && s.trim()).slice(0, 2).map(s => s.trim().slice(0, 60));
      msg.isTask = t.mode === 'ask' && !isGroup(t) && j.isTask === true;
      if (!t.titleLocked && !t.titleSet && typeof j.title === 'string' && j.title.trim()) {
        t.title = shortTitle(j.title.replace(/["«»]/g, ''));
        t.titleSet = true;
        sendMeta(t);
      }
      save();
      updateMsgEl(t, msg);
      renderSidebar();
    } catch { /* подсказки не критичны */ }
  }

  /* ---------- Отрисовка сообщений ---------- */
  const ICON = n => `<img src="assets/chat/icon-${n}.svg" width="24" height="24" alt="">`;
  const SPIN16 = '<img class="spin" src="assets/icon-loader.svg" width="16" height="16" alt="">';
  const DOTS = '<span class="dots"><i></i><i></i><i></i></span>';
  let speakingId = null;

  function renderThread(toEnd) {
    const t = activeThread();
    if (!t) return;
    threadEl.innerHTML = t.messages.map(m => msgHTML(t, m)).join('');
    renderTyping(false);
    if (toEnd) chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  const pendingUpdates = new Map();
  let raf = 0;
  function scheduleUpdate(t, m) {
    shareMsg(t, m); // гостям — напрямую: в фоновой вкладке requestAnimationFrame не срабатывает
    pendingUpdates.set(m.id, [t, m]);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const [tt, mm] of pendingUpdates.values()) updateMsgEl(tt, mm);
      pendingUpdates.clear();
    });
  }
  function updateMsgEl(t, m) {
    shareMsg(t, m);
    if (runtime.activeId !== t.id) return;
    const el = threadEl.querySelector(`[data-mid="${m.id}"]`);
    if (!el) return;
    const near = isNearBottom();
    el.outerHTML = msgHTML(t, m);
    if (m.status === 'streaming') {
      const body = threadEl.querySelector(`[data-mid="${m.id}"] .reasoning-body`);
      if (body) body.scrollTop = body.scrollHeight;
    }
    if (near) scrollToBottom();
  }
  const isNearBottom = () => chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 140;
  const scrollToBottom = smooth => chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

  function msgHTML(t, m) {
    if (m.role === 'event') return `<div class="msg msg-event" data-mid="${m.id}">${esc(m.text)}</div>`;
    if (m.role === 'user') {
      // в общем чате все люди справа: свои — как обычно, у чужих имя и свой оттенок
      let cls = '', style = '', head = '';
      if (isGroup(t)) {
        const first = startsRun(t, m);
        if (!first) cls += ' is-cont';
        if (!isMine(t, m)) {
          const tn = tint(t, authorId(m));
          cls += ' is-other';
          style = ` style="--tint:${tn.bg};--tint-av:${tn.av};--tint-fg:${tn.fg}"`;
          const name = authorName(t, m);
          if (first) head = `<div class="msg-author">${avatarHTML(t, authorId(m), 'av-sm')}${esc(name)}</div>`;
        }
      }
      if (m.kind === 'roll') {
        return `<div class="msg msg-user msg-roll${cls}" data-mid="${m.id}"${style}>${head}` +
          `<div class="roll-pill" title="Бросок кубика d${m.die}"><img src="assets/chip-dice.svg" width="22" height="22" alt="">` +
          `<span class="roll-die">d${m.die}</span><span class="roll-arrow">→</span><b>${m.value}</b></div></div>`;
      }
      const tag = m.tool && TOOLS[m.tool] ? `<div class="bubble-tag">${svgIcon(TOOLS[m.tool].icon)}${TOOLS[m.tool].tag}</div>` : '';
      const files = m.files?.length ? `<div class="msg-files is-user">${m.files.map(fileChipHTML).join('')}</div>` : '';
      return `<div class="msg msg-user${cls}" data-mid="${m.id}"${style}>${head}${tag}${files}<div class="bubble">${esc(m.content)}</div>` +
        `<button class="act" data-act="copy" title="Копировать">${ICON('copy')}</button></div>`;
    }
    if (m.kind === 'plan') return `<div class="msg msg-ai msg-plan" data-mid="${m.id}">${planHTML(t, m)}</div>`;

    let h = `<div class="msg msg-ai" data-mid="${m.id}">`;
    if (m.kind === 'result') h += '<div class="result-label">Результат</div>';
    if (m.reasoning) {
      const live = m.status === 'streaming' && !m.content;
      const label = live ? 'Думаю…' : `Думал ${fmtDur(m.thinkMs || 0)}`;
      h += `<div class="reasoning${live || m.reasoningOpen ? ' is-open' : ''}">` +
        `<button class="reasoning-head" data-act="reasoning">${live ? SPIN16 : ''}${label}` +
        '<img class="chev" src="assets/icon-chevron.svg" width="16" height="16" alt=""></button>' +
        `<div class="reasoning-body">${esc(m.reasoning)}</div></div>`;
    }
    if (m.content) h += `<div class="md">${renderMd(m.content)}</div>`;
    if (m.files?.length && m.status === 'done') h += `<div class="msg-files">${m.files.map(fileCardHTML).join('')}</div>`;
    else if (m.status === 'streaming' && !m.reasoning) h += `<div class="typing">${DOTS}${t.model === 'think' ? 'Думаю…' : 'Печатает…'}</div>`;
    if (m.status === 'error') {
      h += `<div class="msg-error">${esc(m.error || 'Не удалось получить ответ')}` +
        `${isGuest(t) ? '' : '<button class="link-btn" data-act="retry">Повторить</button>'}</div>`;
    }
    if (m.status === 'stopped') h += '<div class="msg-note">Ответ остановлен</div>';
    if ((m.status === 'done' || m.status === 'stopped') && m.content) h += actionsHTML(t, m);
    if (m.status === 'done' && lastAssistant(t) === m && !isBusy(t)) h += suggHTML(t, m);
    return h + '</div>';
  }

  function actionsHTML(t, m) {
    return '<div class="ai-actions">' +
      `<button class="act${m.liked === 1 ? ' is-on' : ''}" data-act="like" title="Хороший ответ">${ICON('like')}</button>` +
      `<button class="act${m.liked === -1 ? ' is-on' : ''}" data-act="dislike" title="Плохой ответ">${ICON('dislike')}</button>` +
      (isGuest(t) ? '' : `<button class="act" data-act="regen" title="Сгенерировать заново">${ICON('regenerate')}</button>`) +
      `<button class="act${speakingId === m.id ? ' is-on' : ''}" data-act="speak" title="Прочитать вслух">${ICON('read-aloud')}</button>` +
      `<button class="act" data-act="podcast" title="Сделать подкаст">${ICON('podcast')}</button>` +
      '<span class="spacer"></span>' +
      `<button class="act" data-act="copy" title="Копировать">${ICON('copy')}</button>` +
      `<button class="act" data-act="share" title="Поделиться">${ICON('share')}</button>` +
      '</div>';
  }

  function suggHTML(t, m) {
    const items = (m.suggestions || []).map(s => `<button class="sugg-chip" data-act="suggest" data-text="${esc(s)}">${esc(s)}</button>`);
    if (m.isTask && t.mode === 'ask') {
      items.push('<button class="sugg-chip handoff" data-act="handoff" title="ГигаЧат составит план и выполнит его по шагам">' +
        '<img src="assets/icon-pencil.svg" width="16" height="16" alt="">Поручить как задачу</button>');
    }
    return items.length ? `<div class="ai-sugg">${items.join('')}</div>` : '';
  }

  /* =====================================================================
     Задачи: план → явный запуск → видимые шаги → результат (Figma «Ask to Task»)
     ===================================================================== */
  const STATUS_LABEL = { planning: 'Составляю план', preview: 'Ждёт запуска', running: 'Выполняется', stopped: 'Остановлено', done: 'Готово', error: 'Ошибка' };

  function planHTML(t, m) {
    const task = m.task || t.task;
    const archived = !!m.task;
    if (m.status === 'error') return `<div class="msg-error">${esc(m.error || 'Не удалось составить план')}<button class="link-btn" data-act="replan">Повторить</button></div>`;
    if (m.status === 'loading' || !task?.plan) return `<div class="typing">${DOTS}Составляю план…</div>`;

    const p = task.plan;
    const n = task.steps.length;
    const st = task.status;
    const cur = task.steps.findIndex(s => s.status !== 'done');
    const steps = task.steps.map((s, i) => {
      const ico = s.status === 'done' ? '<img src="assets/icon-check.svg" width="14" height="14" alt="">'
        : s.status === 'running' ? SPIN16 : i + 1;
      return `<li class="step is-${s.status}${s.open ? ' is-open' : ''}">` +
        `<button class="step-row" data-act="step" data-i="${i}"${s.notes ? ' title="Показать, что сделано"' : ' disabled'}>` +
        `<span class="step-ico">${ico}</span><span class="step-title">${esc(s.title)}</span>` +
        `${s.notes ? '<img class="step-chev" src="assets/icon-chevron.svg" width="16" height="16" alt="">' : ''}</button>` +
        `${s.notes ? `<div class="step-notes md md-sm">${renderMd(s.notes)}</div>` : ''}</li>`;
    }).join('');

    let foot = '';
    if (archived && st !== 'done') {
      foot = `<span class="plan-status">${st === 'preview' ? 'Не запускалась' : STATUS_LABEL[st]}</span>`;
    } else if (st === 'preview') {
      foot = '<button class="btn btn-primary" data-act="run">Запустить</button><button class="btn btn-ghost" data-act="edit-plan">Изменить план</button>';
    } else if (st === 'running') {
      foot = `<span class="plan-status">${SPIN16}${cur < 0 ? 'Собираю результат' : `Шаг ${cur + 1} из ${n}`}</span>` +
        '<button class="btn btn-ghost" data-act="stop-task">Остановить</button>';
    } else if (st === 'stopped') {
      foot = `<span class="plan-status">${cur < 0 ? 'Остановлено на итоговом результате' : `Остановлено на шаге ${cur + 1} из ${n}`}</span>` +
        '<button class="btn btn-primary" data-act="continue-task">Продолжить</button>';
    } else if (st === 'error') {
      foot = `<span class="plan-status">${esc(task.error || 'Что-то пошло не так')}</span><button class="btn btn-primary" data-act="continue-task">Повторить</button>`;
    } else if (st === 'done') {
      foot = `<span class="plan-status">Готово за ${fmtDur((task.finishedAt || 0) - (task.startedAt || 0))}</span>`;
    }
    const needs = (p.needs || []).filter(Boolean);
    return '<div class="plan-card">' +
      `<div class="plan-head"><span class="plan-kicker">План задачи</span><span class="pill pill-${st}">${STATUS_LABEL[st] || ''}</span></div>` +
      `<div class="plan-title">${esc(p.title)}</div>` +
      (p.summary ? `<div class="plan-summary">${esc(p.summary)}</div>` : '') +
      `<div class="plan-meta"><span>${esc(p.eta || '≈ 1 мин')}</span><span>·</span><span>${n} ${plural(n, 'шаг', 'шага', 'шагов')}</span></div>` +
      (needs.length ? `<div class="plan-needs"><b>Может понадобиться:</b> ${esc(needs.join('; '))}</div>` : '') +
      `<ol class="steps">${steps}</ol>` +
      `<div class="plan-foot">${foot}</div></div>`;
  }

  function startTask(t, text, { autoRun = false, tool = null } = {}) {
    t.mode = 'task';
    delete t.cardLook;
    delete t.cardSub;
    archiveTask(t);
    pushMsg(t, tool ? { role: 'user', content: text, tool } : { role: 'user', content: text });
    t.task = { id: uid(), goal: text + toolHint(tool), status: 'planning' };
    return makePlan(t, { autoRun });
  }

  async function makePlan(t, { feedback = '', autoRun = false } = {}) {
    const task = t.task;
    const prev = task.plan;
    const old = currentPlanMsg(t);
    if (old) removeMsg(t, old);
    Object.assign(task, { status: 'planning', plan: null, steps: [], error: null, steering: [], startedAt: null, finishedAt: null });
    t.editing = false;
    const msg = pushMsg(t, { role: 'assistant', kind: 'plan', status: 'loading' });
    const ctrl = new AbortController();
    runtime.ctrl[t.id] = ctrl;
    syncChatComposer();
    renderSidebar();

    let user = `Задача: ${task.goal}`;
    if (task.context) user += `\n\nКонтекст из разговора:\n${task.context}`;
    if (prev && feedback) user += `\n\nПрежний план:\n${prev.steps.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}\n\nПравки пользователя: ${feedback}`;
    try {
      const raw = await api('plan', [{ role: 'system', content: SYS_PLAN }, { role: 'user', content: user }], { signal: ctrl.signal });
      const p = normalizePlan(parseJSON(raw), task.goal);
      task.plan = p;
      task.steps = p.steps.map(s => ({ title: s.title, status: 'pending', notes: '' }));
      task.status = 'preview';
      msg.status = 'done';
      if (!t.titleLocked && !t.titleSet) { t.title = shortTitle(p.title); t.titleSet = true; }
    } catch (err) {
      msg.status = 'error';
      msg.error = err.name === 'AbortError' ? 'Составление плана остановлено' : err.message;
      task.status = 'error';
      task.error = msg.error;
    } finally {
      if (runtime.ctrl[t.id] === ctrl) delete runtime.ctrl[t.id];
      touch(t);
      save();
      updateMsgEl(t, msg);
      syncChatComposer();
      renderSidebar();
    }
    if (autoRun && task.status === 'preview') runTask(t);
  }

  function normalizePlan(j, goal) {
    const steps = (Array.isArray(j?.steps) ? j.steps : [])
      .map(s => String(typeof s === 'string' ? s : s?.title || '').trim())
      .filter(Boolean).slice(0, 6);
    if (!j || steps.length < 2) throw new Error('Не получилось составить план');
    return {
      title: String(j.title || shortTitle(goal)).trim(),
      summary: String(j.summary || '').trim(),
      eta: String(j.eta || '≈ 1 мин').trim(),
      steps: steps.map(title => ({ title })),
      needs: (Array.isArray(j.needs) ? j.needs : []).map(String).filter(s => s.trim()).slice(0, 3),
    };
  }

  const goalBlock = task => `Задача: ${task.goal}${task.context ? `\n\nКонтекст из разговора:\n${task.context}` : ''}`;
  function stepMessages(task, i) {
    const plan = task.steps.map((s, k) => `${k + 1}. ${s.title}`).join('\n');
    const done = task.steps.slice(0, i).map((s, k) => `Шаг ${k + 1} — ${s.title}:\n${s.notes}`).join('\n\n');
    let user = `${goalBlock(task)}\n\nПлан:\n${plan}`;
    if (done) user += `\n\nУже сделано:\n${done}`;
    if (task.steering?.length) user += `\n\nУточнения пользователя по ходу работы: ${task.steering.join('; ')}`;
    user += `\n\nВыполни шаг ${i + 1}: ${task.steps[i].title}`;
    return [{ role: 'system', content: SYS_STEP }, { role: 'user', content: user }];
  }
  function resultMessages(task) {
    const notes = task.steps.map((s, k) => `Шаг ${k + 1} — ${s.title}:\n${s.notes}`).join('\n\n');
    let user = `${goalBlock(task)}\n\nЗаметки по шагам:\n${notes}`;
    if (task.steering?.length) user += `\n\nУточнения пользователя: ${task.steering.join('; ')}`;
    return [{ role: 'system', content: SYS_RESULT }, { role: 'user', content: user }];
  }

  async function runTask(t) {
    const task = t.task;
    if (!task?.plan || isBusy(t)) return;
    const ctrl = new AbortController();
    runtime.ctrl[t.id] = ctrl;
    task.status = 'running';
    task.error = null;
    if (!task.startedAt) task.startedAt = Date.now();
    const planMsg = currentPlanMsg(t);
    const refresh = () => {
      touch(t); save();
      if (planMsg) updateMsgEl(t, planMsg);
      syncChatComposer(); renderSidebar();
    };
    refresh();
    try {
      for (let i = 0; i < task.steps.length; i++) {
        const s = task.steps[i];
        if (s.status === 'done') continue;
        s.status = 'running';
        refresh();
        const notes = await api('step', stepMessages(task, i), { signal: ctrl.signal });
        s.notes = notes.trim() || 'Готово.';
        s.status = 'done';
        refresh();
      }
      const oldResult = t.messages.find(m => m.kind === 'result' && m.taskId === task.id);
      if (oldResult) removeMsg(t, oldResult);
      if (runtime.ctrl[t.id] === ctrl) delete runtime.ctrl[t.id];
      const msg = await streamAnswer(t, { kind: 'result', purpose: 'result', apiMessages: resultMessages(task), taskId: task.id });
      task.status = msg.status === 'done' ? 'done' : msg.status === 'stopped' ? 'stopped' : 'error';
      if (task.status === 'error') task.error = msg.error;
      if (task.status === 'done') task.finishedAt = Date.now();
    } catch (err) {
      task.steps.forEach(s => { if (s.status === 'running') s.status = 'pending'; });
      if (err.name === 'AbortError') task.status = 'stopped';
      else { task.status = 'error'; task.error = err.message; }
    } finally {
      if (runtime.ctrl[t.id] === ctrl) delete runtime.ctrl[t.id];
      refresh();
    }
  }

  // «Поручить как задачу»: тот же тред, разговор становится контекстом задачи.
  function handoff(t) {
    const lastUser = [...t.messages].reverse().find(m => m.role === 'user');
    const context = t.messages.filter(m => m.content && !m.kind).slice(-6)
      .map(m => `${m.role === 'user' ? 'Пользователь' : 'ГигаЧат'}: ${m.content.slice(0, 1200)}`).join('\n\n');
    const last = lastAssistant(t);
    if (last) last.isTask = false;
    t.mode = 'task';
    archiveTask(t);
    t.task = { id: uid(), goal: lastUser?.content || t.title, context, status: 'planning' };
    syncChatComposer();
    if (last) updateMsgEl(t, last);
    makePlan(t);
  }

  /* ---------- Действия в переписке ---------- */
  threadEl.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    const t = activeThread();
    if (!b || !t) return;
    const el = b.closest('[data-mid]');
    const m = el && t.messages.find(x => x.id === el.dataset.mid);
    // кнопки управления работают только у текущей задачи треда
    if (m?.task && ['run', 'continue-task', 'stop-task', 'replan', 'edit-plan'].includes(b.dataset.act)) return;
    switch (b.dataset.act) {
      case 'copy': if (m) copyText(m.role === 'user' ? m.content : plainText(m.content)); break;
      case 'share': if (m) copyText(plainText(m.content), 'Текст ответа скопирован — можно отправить'); break;
      case 'like':
      case 'dislike': {
        const v = b.dataset.act === 'like' ? 1 : -1;
        m.liked = m.liked === v ? 0 : v;
        if (m.liked) toast('Спасибо за оценку');
        save(); updateMsgEl(t, m); break;
      }
      case 'regen':
      case 'retry': if (!isGuest(t)) regenerate(t, m); break;
      case 'speak': speak(t, m); break;
      case 'podcast': toast('Подкасты в прототипе не подключены'); break;
      case 'reasoning': m.reasoningOpen = !m.reasoningOpen; updateMsgEl(t, m); break;
      case 'file-open': openDoc(b.dataset.doc); break;
      case 'file-dl': fakeDownload(b.dataset.doc); break;
      case 'suggest':
        if (isGroup(t)) say(t, b.dataset.text);
        else if (!isBusy(t)) sendAsk(t, b.dataset.text);
        break;
      case 'handoff': if (!isBusy(t)) handoff(t); break;
      case 'run': runTask(t); break;
      case 'continue-task': if (t.task?.plan) runTask(t); else makePlan(t); break;
      case 'stop-task': runtime.ctrl[t.id]?.abort(); break;
      case 'replan': if (!isBusy(t)) makePlan(t); break;
      case 'edit-plan':
        t.editing = true;
        syncChatComposer();
        chatInput.focus();
        break;
      case 'step': {
        const s = (m?.task || t.task)?.steps[+b.dataset.i];
        if (s?.notes) { s.open = !s.open; save(); updateMsgEl(t, m); }
        break;
      }
    }
  });

  function regenerate(t, m) {
    if (!m || isBusy(t)) return;
    if (m.kind === 'result') {
      if (m.taskId !== t.task?.id) { toast('Пересоздать можно результат только последней задачи'); return; }
      removeMsg(t, m);
      runTask(t);
      return;
    }
    if (lastAssistant(t) !== m) { toast('Пересоздать можно только последний ответ'); return; }
    removeMsg(t, m);
    streamAnswer(t);
  }

  /* ---------- Озвучка ответа ---------- */
  function speak(t, m) {
    if (!('speechSynthesis' in window)) return toast('Браузер не умеет читать вслух');
    if (speakingId === m.id) return stopSpeaking();
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(plainText(m.content));
    u.lang = 'ru-RU';
    const ru = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith('ru'));
    if (ru) u.voice = ru;
    u.onend = u.onerror = () => { if (speakingId === m.id) { speakingId = null; updateMsgEl(t, m); } };
    speakingId = m.id;
    speechSynthesis.speak(u);
    updateMsgEl(t, m);
  }
  function stopSpeaking() {
    if (!speakingId) return;
    speakingId = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $$('[data-act="speak"].is-on', threadEl).forEach(x => x.classList.remove('is-on'));
  }

  /* ---------- Композер переписки ---------- */
  function autoGrow() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 156) + 'px';
  }
  function placeholderFor(t) {
    if (t.preset === 'rpg') return 'Что делает ваш герой?';
    if (isGroup(t) && t.shared) return 'Напишите в общий чат';
    if (t.mode !== 'task') return 'Спросите ГигаЧат';
    const st = t.task?.status;
    if (st === 'preview') return t.editing ? 'Что поменять в плане?' : 'Уточните задачу или поменяйте план';
    if (st === 'running') return 'Добавьте уточнение — учту на следующем шаге';
    return 'Опишите новую задачу';
  }
  function syncChatComposer() {
    const t = activeThread();
    if (!t) return;
    setChipModel(chatModel, t.model);
    const cmode = t.mode === 'task' ? 'task' : 'ask';
    chatView.dataset.cmode = cmode;
    chatToggle.dataset.mode = cmode;
    $$('.seg', chatToggle).forEach(s => s.setAttribute('aria-selected', String(s.dataset.cmode === cmode)));
    // общий чат: без «Поручить» и «+», у гостя нет выбора модели, у ролевой игры — кубики
    const group = isGroup(t);
    chatView.classList.toggle('is-group', group);
    chatView.classList.toggle('is-guest', isGuest(t));
    chatDice.hidden = t.preset !== 'rpg';
    const off = isGuest(t) && !(sh.guest?.tid === t.id && sh.guest.status === 'online');
    chatComposer.classList.toggle('is-off', off);
    chatInput.disabled = off;
    const busy = isBusy(t);
    const has = !!chatInput.value.trim();
    // в общем чате писать можно и пока ГигаЧат отвечает — сообщение встанет в очередь
    const steerable = busy && has && (group || t.task?.status === 'running');
    chatSend.classList.toggle('has-text', has);
    chatSend.classList.toggle('is-busy', busy && !steerable);
    chatComposer.classList.toggle('has-text', has);
    chatComposer.classList.toggle('is-busy', busy);
    chatSend.title = busy && !steerable ? 'Остановить' : has ? 'Отправить' : 'Голосовой режим';
    chatInput.placeholder = placeholderFor(t);
  }
  chatInput.addEventListener('input', () => { autoGrow(); syncChatComposer(); noteTyping(); });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendInChat(); }
  });
  chatSend.addEventListener('click', () => {
    const t = activeThread();
    if (!t) return;
    if (chatSend.classList.contains('is-busy')) { stopAnswer(t); return; }
    if (chatInput.value.trim()) sendInChat();
    else toast('Голосовой режим в прототипе не подключён');
  });

  function sendInChat() {
    const t = activeThread();
    const text = chatInput.value.trim();
    if (!t || !text) return;
    if (isGroup(t)) {
      chatInput.value = '';
      autoGrow();
      if (!say(t, text)) { chatInput.value = text; autoGrow(); }
      syncChatComposer();
      return;
    }
    const st = t.task?.status;
    // пока идёт ответ, писать можно только уточнения к выполняемой задаче
    if (isBusy(t) && !(t.mode === 'task' && st === 'running')) return;
    const tool = toolState.chat;
    setTool('chat', null);
    chatInput.value = '';
    autoGrow();
    // исследование из «Спросить» — всегда новая задача (не правка висящего плана)
    if (tool === 'research' && t.mode !== 'task') { startTask(t, text, { tool }); syncChatComposer(); return; }
    if (t.mode !== 'task') { sendAsk(t, text); return; }

    if (st === 'preview' || (st === 'error' && !t.task.plan)) {
      pushMsg(t, tool ? { role: 'user', content: text, tool } : { role: 'user', content: text });
      makePlan(t, { feedback: text + toolHint(tool) });
    } else if (st === 'running') {
      pushMsg(t, { role: 'user', content: text });
      (t.task.steering = t.task.steering || []).push(text);
      save();
      syncChatComposer();
      toast('Учту на следующем шаге');
    } else {
      startTask(t, text, { tool }); // новая задача в том же треде
    }
  }

  /* ---------- Переключатель режима в переписке: режим следующего сообщения ---------- */
  const chatView = $('.view-chat');
  const chatToggle = $('#chatToggle');
  $$('.seg', chatToggle).forEach(s => s.addEventListener('click', () => {
    const t = activeThread();
    if (!t || t.mode === s.dataset.cmode) return;
    t.mode = s.dataset.cmode;
    t.editing = false;
    if (t.mode === 'ask') dropFormatTool('chat');
    save();
    closeModelMenu();
    closePlusMenu();
    syncChatComposer();
    chatInput.focus();
  }));

  /* =====================================================================
     Сайдбар
     ===================================================================== */
  const recentScroll = $('#recentScroll');

  function renderSidebar() {
    renderRecent();
    renderFolders();
    renderTasks();
  }

  function renderRecent() {
    const row = ({ tid, seed, title, active, spin, shared }) =>
      `<a class="chat-row${active ? ' is-active' : ''}" ${tid ? `data-tid="${tid}"` : `data-seed="${seed}"`} title="${esc(title)}${shared ? ' — общий чат' : ''}">` +
      `<span>${esc(title)}</span>${shared ? '<img class="row-ico" src="assets/icon-people.svg" width="16" height="16" alt="">' : ''}${spin ? SPIN16 : ''}</a>`;
    const rows = threadList().filter(t => !t.folder).map(t => row({
      tid: t.id, title: t.title, active: t.id === runtime.activeId, spin: taskActive(t),
      shared: !!t.shared,
    }));
    const seeds = Object.entries(SEEDS)
      .filter(([k]) => k.startsWith('r:') && !state.threads[state.seeds[k]])
      .map(([k, s]) => row({ seed: k, title: s.title }));
    recentScroll.innerHTML = rows.concat(seeds).join('');
    updateFade();
  }
  recentScroll.addEventListener('click', e => {
    const r = e.target.closest('.chat-row');
    if (!r) return;
    if (r.dataset.tid) openThread(r.dataset.tid); else openSeed(r.dataset.seed);
  });

  function renderFolders() {
    $$('.sub-chat[data-seed]').forEach(a => {
      const key = a.dataset.seed;
      const t = state.threads[state.seeds[key]];
      a.classList.toggle('is-active', !!t && t.id === runtime.activeId);
      const showSpin = t ? taskActive(t) : !!SEEDS[key].autoRun;
      const spin = a.querySelector('.spin');
      if (showSpin && !spin) a.insertAdjacentHTML('beforeend', SPIN16);
      if (!showSpin && spin) spin.remove();
      a.title = showSpin ? 'Задача в работе' : '';
    });
  }
  $$('.sub-chat[data-seed]').forEach(a => a.addEventListener('click', () => openSeed(a.dataset.seed)));

  /* ---------- «Продолжить работу» ---------- */
  const LOOK = {
    review: { c: '#c4c4c4', glow: 'rgba(134,134,134,0.11)', icon: '<img src="assets/icon-pencil.svg" width="16" height="16" alt="">' },
    done: { c: '#82f3c9', glow: 'rgba(61,255,183,0.23)', icon: '<img src="assets/icon-check.svg" width="20" height="20" alt="">' },
    alert: { c: '#f39d82', glow: 'rgba(255,112,61,0.1)', icon: '<img src="assets/icon-alert.svg" width="24" height="24" alt="">' },
  };
  function taskLook(t) {
    const task = t.task;
    switch (task.status) {
      case 'done': return ['done', 'Готово'];
      case 'stopped': return ['alert', 'Остановлено'];
      case 'error': return ['alert', 'Нужна помощь'];
      case 'planning': return ['review', 'Составляю план'];
      case 'running': {
        const cur = task.steps.findIndex(s => s.status !== 'done');
        return ['review', cur < 0 ? 'Собираю результат' : `Шаг ${cur + 1} из ${task.steps.length}`];
      }
      default: return ['review', 'Ждёт запуска'];
    }
  }
  function renderTasks() {
    const hidden = new Set(state.hidden);
    const items = [];
    for (const t of threadList()) {
      if (!t.task || hidden.has(t.id)) continue;
      const [look, sub] = t.cardLook ? [t.cardLook, t.cardSub] : taskLook(t);
      items.push({ key: t.id, tid: t.id, title: t.title, sub, look });
    }
    for (const [k, s] of Object.entries(SEEDS)) {
      if (s.card && !state.threads[state.seeds[k]] && !hidden.has(k)) items.push({ key: k, seed: k, title: s.title, sub: s.sub, look: s.look });
    }
    const list = items.slice(0, 3);
    $('#continue').hidden = !list.length;
    $('#tasks').innerHTML = list.map(it => {
      const L = LOOK[it.look];
      return `<div class="task" tabindex="0" role="button" ${it.tid ? `data-tid="${it.tid}"` : `data-seed="${it.seed}"`} data-key="${it.key}">` +
        `<span class="task-icon" style="--c:${L.c}; --glow:${L.glow}">${L.icon}</span>` +
        `<div class="task-text"><div class="task-title">${esc(it.title)}</div><div class="task-sub">${esc(it.sub)}</div></div>` +
        '<button class="task-close" title="Скрыть"><img src="assets/icon-close-sm.svg" width="28" height="28" alt=""></button></div>';
    }).join('');
  }
  $('#tasks').addEventListener('click', e => {
    const c = e.target.closest('.task');
    if (!c) return;
    if (e.target.closest('.task-close')) {
      c.classList.add('leaving');
      state.hidden.push(c.dataset.key);
      save();
      setTimeout(renderTasks, 200);
      return;
    }
    if (c.dataset.tid) openThread(c.dataset.tid); else openSeed(c.dataset.seed);
  });
  $('#tasks').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('task')) { e.preventDefault(); e.target.click(); }
  });

  /* ---------- Навигация ---------- */
  $('#newChat').addEventListener('click', newChat);
  $('#navSearch').addEventListener('click', openSearch);
  $('#navVideo').addEventListener('click', () => { setIdeas(false); setView('video'); });
  $('#navIdeas').addEventListener('click', () => { setIdeas(false); setView('ideas'); renderIdeas(); $('.view-ideas').scrollTop = 0; });
  $$('[data-act="folder-new"]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); newChat(); }));

  // Заглушки: всё, что в прототипе не подключено, отвечает коротким тостом.
  document.addEventListener('click', e => {
    const s = e.target.closest('[data-stub]');
    if (s) toast(`«${s.dataset.stub}» в прототипе пока не работает`);
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.nav-item[data-stub], .profile[data-stub]')) { e.preventDefault(); e.target.click(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('#newChat, #navSearch, #navVideo, #navIdeas')) { e.preventDefault(); e.target.click(); }
  });

  /* ---------- Остальное: Видео / Идеи / Подкасты ---------- */
  const moreToggle = $('#moreToggle');
  const navMore = $('#navMore');
  const toggleMore = () => {
    const open = navMore.dataset.open !== 'true';
    navMore.dataset.open = String(open);
    moreToggle.setAttribute('aria-expanded', String(open));
  };
  moreToggle.addEventListener('click', toggleMore);
  moreToggle.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMore(); }
  });

  /* ---------- Папки ---------- */
  $$('.folder').forEach(folder => {
    const head = folder.querySelector('.folder-head');
    const toggle = () => {
      const open = folder.dataset.open !== 'true';
      folder.dataset.open = String(open);
      head.setAttribute('aria-expanded', String(open));
    };
    head.addEventListener('click', e => { if (!e.target.closest('.folder-actions')) toggle(); });
    head.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); toggle(); }
    });
  });

  /* ---------- Ширина сайдбара: тянется в рамках, чат не ужимается ---------- */
  const SIDEBAR_MIN = 266;   // ширина из макета
  const SIDEBAR_MAX = 420;
  const CARD_MIN = 860;      // колонка чата 720 + кнопки справа
  const SIDEBAR_KEY = 'giga.sidebarW';
  const resizer = $('#sidebarResizer');
  let sidebarPref = SIDEBAR_MIN;
  let sidebarW = SIDEBAR_MIN;
  try { sidebarPref = Number(localStorage.getItem(SIDEBAR_KEY)) || SIDEBAR_MIN; } catch {}

  const sidebarMax = () => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, window.innerWidth - 16 - CARD_MIN));
  function applySidebar() {
    sidebarW = Math.round(Math.min(sidebarMax(), Math.max(SIDEBAR_MIN, sidebarPref)));
    document.documentElement.style.setProperty('--sidebar-w', `${sidebarW}px`);
    resizer.setAttribute('aria-valuemin', String(SIDEBAR_MIN));
    resizer.setAttribute('aria-valuemax', String(sidebarMax()));
    resizer.setAttribute('aria-valuenow', String(sidebarW));
  }
  function setSidebar(w, persist) {
    sidebarPref = Math.min(sidebarMax(), Math.max(SIDEBAR_MIN, w));
    applySidebar();
    if (persist) { try { localStorage.setItem(SIDEBAR_KEY, String(sidebarPref)); } catch {} }
  }
  applySidebar();
  window.addEventListener('resize', applySidebar);

  let drag = null;
  resizer.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    closeModelMenu();
    drag = { x: e.clientX, w: sidebarW };
    resizer.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
  });
  resizer.addEventListener('pointermove', e => { if (drag) setSidebar(drag.w + e.clientX - drag.x); });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('is-resizing');
    setSidebar(sidebarW, true);
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
  resizer.addEventListener('dblclick', () => setSidebar(SIDEBAR_MIN, true));
  resizer.addEventListener('keydown', e => {
    const step = { ArrowRight: 16, ArrowLeft: -16 }[e.key];
    if (step) { e.preventDefault(); setSidebar(sidebarW + step, true); }
    if (e.key === 'Home') { e.preventDefault(); setSidebar(SIDEBAR_MIN, true); }
    if (e.key === 'End') { e.preventDefault(); setSidebar(SIDEBAR_MAX, true); }
  });

  /* ---------- Прокрутка сайдбара: лого уезжает и гаснет, края растворяются ---------- */
  const sidebarScroll = $('#sidebarScroll');
  const logoEl = $('.logo', sidebarScroll);
  function updateFade() {
    const s = sidebarScroll;
    s.classList.toggle('at-end', s.scrollTop + s.clientHeight >= s.scrollHeight - 2);
    s.classList.toggle('is-scrolled', s.scrollTop > 2);
    logoEl.style.opacity = String(Math.max(0, 1 - s.scrollTop / 64));
  }
  sidebarScroll.addEventListener('scroll', updateFade, { passive: true });
  const fadeObserver = new ResizeObserver(updateFade);
  [sidebarScroll, $('.nav'), $('.folders'), recentScroll].forEach(el => fadeObserver.observe(el));

  /* =====================================================================
     Меню «+»: в «Спросить» — файлы и инструменты, в «Поручить» — ещё формат
     результата (PDF, документ, презентация) и скилы. Иконки в стиле SF Symbols.
     ===================================================================== */
  const SF = {
    clip: '<path d="M16.5 7.5 9.4 14.6a2 2 0 0 0 2.8 2.8l7.4-7.4a4 4 0 0 0-5.6-5.6L6.4 11.9a6 6 0 0 0 8.5 8.5l5.6-5.6"/>',
    stack: '<rect x="7" y="7" width="13" height="13" rx="2.5"/><path d="M4 16V6.5A2.5 2.5 0 0 1 6.5 4H16"/>',
    photo: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17.5 4.5-4.5 3.5 3.5 2.5-2.5 5.5 5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.4 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.4-3.4-8.5s1-6.1 3.4-8.5z"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    research: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 4.7 4.7"/><path d="m10.5 7.4.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8z"/>',
    scribble: '<path d="M4 15.5c1.8-3.6 3.8-8 5.6-8 2 0-1.6 9.2 1.2 9.2 2.4 0 3-6.6 5-6.6 1.8 0-.8 5.6 1.2 5.6 1 0 1.8-1.1 3-2.4"/>',
    pdf: '<path d="M7 3.5h6.5l5 5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5v5h5"/><path d="M8.5 16.5h7"/>',
    doc: '<path d="M7 3.5h6.5l5 5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5v5h5"/><path d="M8.5 12.5h7M8.5 15.5h7M8.5 9.5h2.5"/>',
    slides: '<rect x="3.5" y="4.5" width="17" height="11.5" rx="2"/><path d="M12 16v3.5M8.5 19.5h7"/><path d="m7.5 12.5 3-3 2 2 4-4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
    sparkles: '<path d="m11 4 1.7 4.6L17.3 10l-4.6 1.7L11 16.3l-1.7-4.6L4.7 10l4.6-1.4z"/><path d="m18 14.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    close: '<path d="m8 8 8 8M16 8l-8 8"/>',
  };
  const svgIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SF[name]}</svg>`;

  const PM_BASE = [
    { id: 'files', icon: 'clip', title: 'Добавить фото и файлы', desc: 'Загрузить с компьютера' },
    { id: 'library', icon: 'stack', title: 'Добавить из библиотеки', desc: 'Просмотр и поиск ваших файлов' },
    { id: 'image', icon: 'photo', title: 'Создать изображение', desc: 'Создать любое изображение' },
    { id: 'web', icon: 'globe', title: 'Поиск в сети', desc: 'Искать актуальные новости и информацию' },
    { id: 'project', icon: 'folder', title: 'Работать в проекте', desc: 'Начать чат в проекте' },
    { id: 'research', icon: 'research', title: 'Глубокое исследование', desc: 'Получить подробный отчёт' },
    { id: 'draw', icon: 'scribble', title: 'Нарисовать', desc: 'Нарисуйте и прикрепите изображение' },
  ];
  const PM_TASK = [
    { sep: true }, { label: 'Формат результата' },
    { id: 'pdf', icon: 'pdf', title: 'PDF', desc: 'Прочитать, создать и проверить PDF' },
    { id: 'doc', icon: 'doc', title: 'Документ', desc: 'Создать и отредактировать документ' },
    { id: 'slides', icon: 'slides', title: 'Презентация', desc: 'Собрать и отредактировать презентацию' },
    { sep: true }, { label: 'Скилы' },
    { id: 'templates', icon: 'grid', title: 'Создатель шаблонов', desc: 'Многоразовые шаблоны как личные скилы' },
    { id: 'skill', icon: 'sparkles', title: 'Создать скил', desc: 'Опишите свой процесс — ГигаЧат превратит его в скил' },
  ];
  // Инструменты, которые становятся чипом в поле и меняют то, как выполнится запрос
  const TOOLS = {
    research: { label: 'Исследование', tag: 'Глубокое исследование', icon: 'research',
      hint: 'Это глубокое исследование: разбери тему с разных сторон, сравни варианты, приведи цифры и дай подробный отчёт с выводами.' },
    pdf: { label: 'PDF', tag: 'Результат в PDF', icon: 'pdf', format: true,
      hint: 'Формат результата — PDF-отчёт: титул, разделы с заголовками, таблицы и выводы, готово к печати.' },
    doc: { label: 'Документ', tag: 'Результат документом', icon: 'doc', format: true,
      hint: 'Формат результата — документ: связный текст с заголовками, списками и таблицами, готовый к редактированию.' },
    slides: { label: 'Презентация', tag: 'Результат презентацией', icon: 'slides', format: true,
      hint: 'Формат результата — презентация: 6–10 слайдов, для каждого заголовок, 3–5 тезисов и заметки докладчика.' },
  };
  const PM_STUBS = {
    library: 'Библиотека файлов', image: 'Создание изображений', web: 'Поиск в сети', project: 'Работа в проекте',
    draw: 'Рисование', templates: 'Скил «Создатель шаблонов»', skill: 'Создание скилов',
  };
  const toolHint = tool => (tool && TOOLS[tool] ? `\n\n${TOOLS[tool].hint}` : '');

  const plusMenu = $('#plusMenu');
  const filePicker = $('#filePicker');
  const toolState = { home: null, chat: null };
  const toolSlots = { home: $('#homeTool'), chat: $('#chatTool') };
  let plusCtx = null;

  function setTool(where, id) {
    toolState[where] = id;
    const tool = TOOLS[id];
    toolSlots[where].innerHTML = tool
      ? `<span class="tool-chip" title="${esc(tool.tag)}">${svgIcon(tool.icon)}${tool.label}<button class="tool-x" data-where="${where}" title="Убрать">${svgIcon('close')}</button></span>`
      : '';
  }
  function dropFormatTool(where) { if (TOOLS[toolState[where]]?.format) setTool(where, null); }
  document.addEventListener('click', e => {
    const x = e.target.closest('.tool-x');
    if (x) setTool(x.dataset.where, null);
  });

  function openPlusMenu(where, btn) {
    if (plusCtx?.btn === btn) { closePlusMenu(); return; }
    closeModelMenu();
    closePlusMenu();
    const isTask = where === 'home' ? card.dataset.mode === 'delegate' : activeThread()?.mode === 'task';
    const items = isTask ? PM_BASE.concat(PM_TASK) : PM_BASE;
    plusMenu.innerHTML = items.map(it => {
      if (it.sep) return '<div class="pm-sep"></div>';
      if (it.label) return `<div class="pm-label">${it.label}</div>`;
      return `<button class="pm-item" role="menuitem" data-pm="${it.id}">${svgIcon(it.icon)}<span class="pm-title">${it.title}</span><span class="pm-desc">${it.desc}</span></button>`;
    }).join('');

    // ширина — как у поля ввода. Открываемся вниз (если не влезает — список
    // прокручивается внутри); вверх — только когда снизу почти нет места,
    // как у нижнего поля в переписке
    const anchor = where === 'home' ? $('.view-home .composer') : chatComposer;
    const r = anchor.getBoundingClientRect();
    plusMenu.style.width = `${r.width}px`;
    plusMenu.style.left = `${r.left}px`;
    plusMenu.style.maxHeight = 'none';
    const natural = plusMenu.offsetHeight;
    const below = window.innerHeight - r.bottom - 24;
    const above = r.top - 24;
    const up = below < Math.min(natural, 220) && above > below;
    const h = Math.min(natural, up ? above : below);
    plusMenu.style.maxHeight = `${h}px`;
    plusMenu.style.top = `${up ? r.top - 8 - h : r.bottom + 8}px`;
    plusMenu.scrollTop = 0;
    plusMenu.classList.toggle('is-up', up);
    plusMenu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    plusCtx = { where, btn };
  }
  function closePlusMenu() {
    if (!plusCtx) return;
    plusCtx.btn.setAttribute('aria-expanded', 'false');
    plusMenu.classList.remove('is-open');
    plusCtx = null;
  }
  $('#homePlus').addEventListener('click', e => openPlusMenu('home', e.currentTarget));
  $('#chatPlus').addEventListener('click', e => openPlusMenu('chat', e.currentTarget));

  plusMenu.addEventListener('click', e => {
    const b = e.target.closest('.pm-item');
    if (!b || !plusCtx) return;
    const { where } = plusCtx;
    const id = b.dataset.pm;
    closePlusMenu();
    if (id === 'files') { filePicker.click(); return; }
    if (TOOLS[id]) {
      setTool(where, id);
      if (id === 'research') toast('Исследование выполнится как задача — сначала покажу план');
      (where === 'home' ? input : chatInput).focus();
      return;
    }
    toast(`«${PM_STUBS[id]}» в прототипе пока не работает`);
  });
  plusMenu.addEventListener('keydown', e => {
    const items = $$('.pm-item', plusMenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  [$('#homePlus'), $('#chatPlus')].forEach(b => b.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && plusCtx) { e.preventDefault(); $('.pm-item', plusMenu)?.focus(); }
  }));
  document.addEventListener('click', e => {
    if (plusCtx && !plusMenu.contains(e.target) && !e.target.closest('#homePlus, #chatPlus')) closePlusMenu();
  });
  window.addEventListener('resize', closePlusMenu);

  $$('[data-act="pick-files"]').forEach(b => b.addEventListener('click', () => filePicker.click()));
  filePicker.addEventListener('change', () => {
    const files = [...filePicker.files];
    if (files.length === 1) {
      const n = files[0].name.length > 36 ? files[0].name.slice(0, 34) + '…' : files[0].name;
      toast(`Файл «${n}» выбран — в прототипе файлы пока не отправляются`);
    } else if (files.length > 1) {
      toast(`Выбрано файлов: ${files.length} — в прототипе они пока не отправляются`);
    }
    filePicker.value = '';
  });

  /* =====================================================================
     Режим ответа: Быстрый / Думающий
     ===================================================================== */
  const MODELS = {
    fast: { label: 'Быстрый', icon: 'assets/icon-giga.svg' },
    think: { label: 'Думающий', icon: 'assets/icon-reason.svg' },
  };
  const modelMenu = $('#modelMenu');
  const modelOpts = $$('.model-opt', modelMenu);

  function setChipModel(chip, key) {
    if (!MODELS[key]) return;
    chip.dataset.model = key;
    chip.querySelector('.model-ico').src = MODELS[key].icon;
    chip.querySelector('.model-label').textContent = MODELS[key].label;
  }
  function openModelMenu(chip) {
    closePlusMenu();
    activeChip = chip;
    modelOpts.forEach(o => o.setAttribute('aria-checked', String(o.dataset.model === chip.dataset.model)));
    chip.setAttribute('aria-expanded', 'true');
    const r = chip.getBoundingClientRect();
    const h = modelMenu.offsetHeight;
    const up = r.bottom + 8 + h > window.innerHeight - 8;
    modelMenu.classList.toggle('is-up', up);
    modelMenu.style.left = `${r.left}px`;
    modelMenu.style.top = `${up ? r.top - 8 - h : r.bottom + 8}px`;
    modelMenu.classList.add('is-open');
  }
  function closeModelMenu() {
    if (!activeChip) return;
    activeChip.setAttribute('aria-expanded', 'false');
    modelMenu.classList.remove('is-open');
    activeChip = null;
  }
  $$('.model-chip').forEach(chip => {
    chip.addEventListener('click', () => (activeChip === chip ? closeModelMenu() : openModelMenu(chip)));
  });
  modelOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      const chip = activeChip;
      setChipModel(chip, opt.dataset.model);
      if (chip === chatModel && activeThread()) { activeThread().model = opt.dataset.model; save(); sendMeta(activeThread()); }
      closeModelMenu();
    });
  });
  document.addEventListener('click', e => {
    if (activeChip && !modelMenu.contains(e.target) && !e.target.closest('.model-chip')) closeModelMenu();
  });
  window.addEventListener('resize', closeModelMenu);

  /* =====================================================================
     Голосовой ввод (Web Speech API)
     ===================================================================== */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function dictate(field, btn, after) {
    if (!SR) return toast('Голосовой ввод в этом браузере недоступен');
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'ru-RU';
    rec.interimResults = true;
    const base = field.value ? field.value.replace(/\s*$/, ' ') : '';
    rec.onresult = e => { field.value = base + [...e.results].map(r => r[0].transcript).join(''); after && after(); };
    rec.onerror = e => {
      if (e.error === 'not-allowed') toast('Нет доступа к микрофону');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Не получилось распознать речь');
    };
    rec.onend = () => { btn.classList.remove('is-listening'); rec = null; };
    btn.classList.add('is-listening');
    try { rec.start(); } catch { btn.classList.remove('is-listening'); rec = null; }
  }
  $('#homeMic').addEventListener('click', e => dictate(input, e.currentTarget, updateHomeSend));
  $('#chatMic').addEventListener('click', e => dictate(chatInput, e.currentTarget, () => { autoGrow(); syncChatComposer(); }));

  /* =====================================================================
     Поиск по чатам
     ===================================================================== */
  const search = $('#search');
  const searchInput = $('#searchInput');
  const searchList = $('#searchList');
  let searchItems = [];
  let searchIdx = 0;

  function openSearch() {
    closeModelMenu();
    search.hidden = false;
    searchInput.value = '';
    renderSearch();
    searchInput.focus();
  }
  function closeSearch() { search.hidden = true; }
  function renderSearch() {
    const q = searchInput.value.trim().toLowerCase();
    const kind = mode => (mode === 'task' ? 'Задача' : 'Чат');
    const all = threadList().map(t => ({ tid: t.id, title: t.title, kind: kind(t.mode) }))
      .concat(Object.entries(SEEDS).filter(([k]) => !state.threads[state.seeds[k]]).map(([k, s]) => ({ seed: k, title: s.title, kind: kind(s.mode) })));
    searchItems = (q ? all.filter(i => i.title.toLowerCase().includes(q)) : all).slice(0, 60);
    searchIdx = 0;
    searchList.innerHTML = searchItems.length
      ? searchItems.map((i, k) => `<button class="search-item${k === 0 ? ' is-active' : ''}" data-k="${k}"><span>${esc(i.title)}</span><span class="si-kind">${i.kind}</span></button>`).join('')
      : '<div class="search-empty">Ничего не нашлось</div>';
  }
  function moveSearch(d) {
    if (!searchItems.length) return;
    searchIdx = (searchIdx + d + searchItems.length) % searchItems.length;
    $$('.search-item', searchList).forEach((b, k) => b.classList.toggle('is-active', k === searchIdx));
    $(`.search-item[data-k="${searchIdx}"]`, searchList)?.scrollIntoView({ block: 'nearest' });
  }
  function pickSearch(k) {
    const i = searchItems[k];
    if (!i) return;
    closeSearch();
    if (i.tid) openThread(i.tid); else openSeed(i.seed);
  }
  searchInput.addEventListener('input', renderSearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSearch(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveSearch(-1); }
    if (e.key === 'Enter') { e.preventDefault(); pickSearch(searchIdx); }
  });
  searchList.addEventListener('click', e => {
    const b = e.target.closest('.search-item');
    if (b) pickSearch(+b.dataset.k);
  });
  search.addEventListener('mousedown', e => { if (e.target === search) closeSearch(); });

  /* ---------- Горячие клавиши ---------- */
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.hidden ? openSearch() : closeSearch(); return; }
    if (e.key !== 'Escape') return;
    if (!docView.hidden) { closeDoc(); return; }
    if (!search.hidden) { closeSearch(); return; }
    if (plusCtx) { const b = plusCtx.btn; closePlusMenu(); b.focus(); return; }
    if (activeChip) { const c = activeChip; closeModelMenu(); c.focus(); return; }
    if (diceOpen) { closeDice(); chatDice.focus(); return; }
    if (!invitePop.hidden) { closeInvite(); inviteBtn.focus(); return; }
    if (!peoplePop.hidden) { closePeople(); peoplePill.focus(); return; }
    if (card.dataset.ideas === 'true') setIdeas(false);
  });

  /* =====================================================================
     Идеи (Figma 34:1089): фильтры работают, избранное сохраняется,
     клик по карточке подставляет идею в поле на главной
     ===================================================================== */
  const IDEAS = [
    { title: 'Сделай фигурку из стекла и желе', img: 'jelly', cats: ['create'] },
    { title: 'Придумай весенний букет', img: 'flowers', cats: ['life', 'create'] },
    { title: 'Замотивируй себя на работу', img: 'motivation', cats: ['work', 'life'] },
    { title: 'Создай маску лесного духа', img: 'fox', cats: ['create', 'parents'] },
    { title: 'Нарисуй персонажа в пиксель-арте', img: 'pixel', cats: ['create', 'study'] },
    { title: 'Собери кубик с любимыми рецептами', img: 'recipes', cats: ['life', 'parents'] },
    { title: 'Преврати себя в героя аниме', img: 'anime', tall: true, cats: ['create'] },
    { title: 'Создай открытку ко Дню святого Валентина', img: 'valentine', cats: ['life', 'create'] },
    { title: 'Сделай раскраску для ребёнка', img: 'coloring', cats: ['parents', 'study'] },
  ];
  const HEART = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13.2C8 13.2 2.9 10.4 2.9 6.6C2.9 6 3.09 5.42 3.44 4.94C3.8 4.46 4.29 4.1 4.86 3.93C5.43 3.75 6.04 3.75 6.61 3.95C7.17 4.14 7.66 4.51 8 5C8.34 4.51 8.83 4.14 9.39 3.95C9.96 3.75 10.57 3.75 11.14 3.93C11.71 4.1 12.2 4.46 12.56 4.94C12.91 5.42 13.1 6 13.1 6.6C13.1 10.4 8 13.2 8 13.2Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/></svg>';
  const ideasGrid = $('#ideasGrid');
  const ideasFilters = $('#ideasFilters');
  let ideasCat = 'all';
  state.favIdeas = state.favIdeas || [];

  function renderIdeas() {
    const fav = new Set(state.favIdeas);
    const list = IDEAS.filter(i => ideasCat === 'all' || (ideasCat === 'fav' ? fav.has(i.img) : i.cats.includes(ideasCat)));
    if (!list.length) {
      ideasGrid.innerHTML = `<div class="ideas-empty">${ideasCat === 'fav' ? 'Здесь появятся идеи, отмеченные сердечком' : 'В этой подборке пока пусто'}</div>`;
      return;
    }
    // раскладка «в самую короткую колонку» — для «Всё» совпадает с макетом
    const cols = [[], [], [], []], heights = [0, 0, 0, 0];
    list.forEach((idea, i) => {
      const c = heights.indexOf(Math.min(...heights));
      cols[c].push(`<div class="icard" role="button" tabindex="0" data-idea="${idea.img}" style="--i:${i}">` +
        `<div class="icard-art${idea.tall ? ' tall' : ''}"><img src="assets/ideas/${idea.img}.png" alt=""></div>` +
        `<div class="icard-title">${esc(idea.title)}</div>` +
        `<button class="icard-fav${fav.has(idea.img) ? ' is-on' : ''}" data-fav="${idea.img}" title="${fav.has(idea.img) ? 'Убрать из избранного' : 'В избранное'}">${HEART}</button></div>`);
      heights[c] += (idea.tall ? 345 : 210) + 16;
    });
    ideasGrid.innerHTML = cols.map(c => `<div class="icol">${c.join('')}</div>`).join('');
  }
  ideasFilters.addEventListener('click', e => {
    const f = e.target.closest('.ifilter[data-cat]');
    if (!f) return;
    ideasCat = f.dataset.cat;
    $$('.ifilter', ideasFilters).forEach(x => x.classList.toggle('is-active', x === f));
    renderIdeas();
  });
  function useIdea(key) {
    const idea = IDEAS.find(i => i.img === key);
    if (!idea) return;
    setView('home');
    setMode('ask');
    setIdeas(false);
    input.value = idea.title;
    updateHomeSend();
    setTimeout(() => input.focus(), 350);
  }
  ideasGrid.addEventListener('click', e => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      const key = favBtn.dataset.fav;
      const on = !state.favIdeas.includes(key);
      state.favIdeas = on ? [...state.favIdeas, key] : state.favIdeas.filter(k => k !== key);
      save();
      if (ideasCat === 'fav') renderIdeas();
      else { favBtn.classList.toggle('is-on', on); favBtn.title = on ? 'Убрать из избранного' : 'В избранное'; }
      toast(on ? 'Идея в избранном' : 'Идея убрана из избранного');
      return;
    }
    const c = e.target.closest('.icard');
    if (c) useIdea(c.dataset.idea);
  });
  ideasGrid.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('icard')) { e.preventDefault(); useIdea(e.target.dataset.idea); }
  });

  /* =====================================================================
     Видео (Figma 34:1038) — экран кликабельный, генерация не подключена
     ===================================================================== */
  const videoInput = $('#videoInput');
  const videoCount = $('#videoCount');
  const videoGo = $('#videoGo');
  const updateVideoCount = () => { videoCount.textContent = String(2000 - videoInput.value.length); };
  videoInput.addEventListener('input', updateVideoCount);
  $$('.vchip[data-cycle]').forEach(b => b.addEventListener('click', () => {
    const opts = b.dataset.cycle.split('|');
    b.textContent = opts[(opts.indexOf(b.textContent.trim()) + 1) % opts.length];
  }));
  $('#videoSound').addEventListener('click', e => {
    const off = e.currentTarget.classList.toggle('is-off');
    e.currentTarget.title = off ? 'Звук выключен' : 'Звук включён';
  });
  $$('.vex').forEach(b => b.addEventListener('click', () => {
    videoInput.value = b.dataset.prompt;
    updateVideoCount();
    videoInput.focus();
  }));
  videoGo.addEventListener('click', () => {
    if (!videoInput.value.trim()) { toast('Опишите, какое видео нужно'); videoInput.focus(); return; }
    if (videoGo.classList.contains('is-loading')) return;
    videoGo.classList.add('is-loading');
    setTimeout(() => {
      videoGo.classList.remove('is-loading');
      toast('В прототипе генерация видео не подключена');
    }, 1400);
  });

  /* =====================================================================
     Задача по расписанию: 59с → 0 → галка, через 20с галка пропадает
     ===================================================================== */
  const DURATION = 59000;
  const R = 7.333, C = 11;
  const pie = $('#schedPie');
  const timeEl = $('#schedTime');
  const sched = $('#sched');
  let lastSec = null;

  // Оставшееся время: сектор от «стрелки» по часовой до 12 часов — убывает по ходу таймера
  function piePath(done) {
    const left = 1 - done;
    if (left <= 0) return '';
    if (left >= 0.9999) return `M${C} ${C - R}A${R} ${R} 0 1 1 ${C} ${C + R}A${R} ${R} 0 1 1 ${C} ${C - R}Z`;
    const a = done * Math.PI * 2;
    const x = C + R * Math.sin(a), y = C - R * Math.cos(a);
    return `M${C} ${C}L${x.toFixed(3)} ${y.toFixed(3)}A${R} ${R} 0 ${left > 0.5 ? 1 : 0} 1 ${C} ${C - R}Z`;
  }
  const t0 = performance.now();
  function tick(now) {
    const elapsed = Math.min(now - t0, DURATION);
    pie.setAttribute('d', piePath(elapsed / DURATION));
    const sec = Math.ceil((DURATION - elapsed) / 1000);
    if (sec !== lastSec) { timeEl.textContent = sec + 'с'; lastSec = sec; }
    if (elapsed >= DURATION) {
      sched.classList.add('is-done');
      setTimeout(() => sched.classList.add('is-cleared'), 20000);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* =====================================================================
     Файлы-результаты в чатах-заготовках: карточки с миниатюрой и просмотр.
     Скачать их нельзя — это демо-файлы прототипа.
     ===================================================================== */
  const DOCS = FAKES.docs;
  const FILE_KIND = {
    pdf: ['PDF', '#e5484d'], docx: ['DOC', '#2f6fed'], xlsx: ['XLS', '#1e9e5a'], pptx: ['PPT', '#ea6a1e'], csv: ['CSV', '#64748b'],
  };
  const DOC_W = { pdf: 595, docx: 595, xlsx: 760, csv: 760, pptx: 800 }; // ширина страницы документа
  const THUMB_W = 232;
  const DL_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>';
  function fileIcon(type, w = 20) {
    const [label, color] = FILE_KIND[type] || ['FILE', '#64748b'];
    return `<svg class="file-ico" width="${w}" height="${Math.round(w * 32 / 28)}" viewBox="0 0 28 32" aria-hidden="true">` +
      `<path d="M4 0h14l10 10v18a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="${color}"/>` +
      '<path d="M18 0v6a4 4 0 0 0 4 4h6z" fill="#fff" fill-opacity=".45"/>' +
      `<text x="14" y="25" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="Inter, -apple-system, sans-serif">${label}</text></svg>`;
  }
  const thumbCache = {};
  function fileCardHTML(key) {
    const d = DOCS[key];
    if (!d) return '';
    const w = DOC_W[d.type] || 595;
    const first = thumbCache[key] || (thumbCache[key] = d.render()[0]);
    return `<div class="file-card" data-act="file-open" data-doc="${key}" role="button" tabindex="0" title="Открыть «${esc(d.name)}»">` +
      `<div class="fc-thumb is-${d.type}"><div class="fc-page" style="width:${w}px;transform:scale(${((THUMB_W - 32) / w).toFixed(4)})">${first}</div>` +
      '<span class="fc-open">Открыть</span></div>' +
      `<div class="fc-foot">${fileIcon(d.type)}<div class="fc-text"><div class="fc-name">${esc(d.name)}</div><div class="fc-meta">${esc(d.meta)}</div></div>` +
      `<button class="fc-dl" data-act="file-dl" data-doc="${key}" title="Скачать">${DL_ICON}</button></div></div>`;
  }
  function fileChipHTML(key) {
    const d = DOCS[key];
    if (!d) return '';
    return `<button class="file-chip" data-act="file-open" data-doc="${key}" title="Открыть «${esc(d.name)}»">${fileIcon(d.type, 24)}` +
      `<span class="fc-text"><span class="fc-name">${esc(d.name)}</span><span class="fc-meta">${esc(d.meta)}</span></span></button>`;
  }
  function fakeDownload(key) {
    const d = DOCS[key];
    if (d) toast(`«${d.name}» — демо-файл, в прототипе он не скачивается`);
  }

  const docView = $('#docView');
  let docKey = null, docFrom = null;
  function openDoc(key) {
    const d = DOCS[key];
    if (!d) return;
    docKey = key;
    docFrom = document.activeElement;
    $('#dvIcon').innerHTML = fileIcon(d.type, 28);
    $('#dvName').textContent = d.name;
    $('#dvMeta').textContent = d.meta;
    const pages = d.render();
    const more = (d.pages || pages.length) - pages.length;
    const unit = d.type === 'pptx' ? ['слайд', 'слайда', 'слайдов'] : ['страница', 'страницы', 'страниц'];
    $('#dvBody').innerHTML = pages.map(pg => `<div class="dv-page is-${d.type}">${pg}</div>`).join('') +
      (more > 0 ? `<div class="dv-more">Ещё ${more} ${plural(more, ...unit)} — в прототипе показано начало документа</div>` : '');
    $('#dvBody').scrollTop = 0;
    docView.hidden = false;
    $('#dvClose').focus();
  }
  function closeDoc() {
    if (docView.hidden) return;
    docView.hidden = true;
    docKey = null;
    docFrom?.focus?.();
  }
  $('#dvClose').addEventListener('click', closeDoc);
  $('#dvDownload').addEventListener('click', () => docKey && fakeDownload(docKey));
  docView.addEventListener('mousedown', e => { if (e.target === docView) closeDoc(); });
  threadEl.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('file-card')) { e.preventDefault(); openDoc(e.target.dataset.doc); }
  });

  /* =====================================================================
     Общий чат: друзья пишут в один тред, ГигаЧат отвечает всем.
     Хост — браузер того, кто пригласил: он хранит тред, вызывает модель своим
     ключом и рассылает события гостям. Ключ никуда не уходит, гостю пароль не нужен.
     ===================================================================== */
  const HOST_PID = 'h';
  const NAME_KEY = JOIN ? 'giga.guestName' : 'giga.name';
  const DICE = [4, 6, 8, 10, 12, 20];
  const MAX_GUESTS = 5;
  const SNAPSHOT = 150;
  // оттенки участников: фон пузыря, кружок аватара, текст
  const TINTS = [
    { bg: '#efebfd', av: '#e2dafc', fg: '#4a3a8c' }, // сиреневый
    { bg: '#e7f5ee', av: '#d0eee0', fg: '#1f6646' }, // мятный
    { bg: '#fdefe6', av: '#fbe0cd', fg: '#88481d' }, // персиковый
    { bg: '#e8f0fc', av: '#d6e5fa', fg: '#214c86' }, // голубой
    { bg: '#fcedf1', av: '#f8d9e2', fg: '#882746' }, // розовый
    { bg: '#fcf5df', av: '#f7eab8', fg: '#755608' }, // солнечный
    { bg: '#e3f4f4', av: '#cdeaea', fg: '#1d5f63' }, // бирюзовый
    { bg: '#f1f1ee', av: '#e4e4df', fg: '#55554d' }, // серый
  ];
  // Каждому участнику при входе достаётся животное (как в Google Документах);
  // у животного свой цвет — им же подсвечены его реплики
  const ANIMALS = [
    { e: '🦊', n: 'лиса', t: 2 }, { e: '🐼', n: 'панда', t: 7 }, { e: '🐸', n: 'лягушка', t: 1 },
    { e: '🦉', n: 'сова', t: 0 }, { e: '🐧', n: 'пингвин', t: 3 }, { e: '🐙', n: 'осьминог', t: 4 },
    { e: '🦁', n: 'лев', t: 5 }, { e: '🐢', n: 'черепаха', t: 6 }, { e: '🐨', n: 'коала', t: 7 },
    { e: '🦔', n: 'ёж', t: 2 }, { e: '🐳', n: 'кит', t: 3 }, { e: '🐰', n: 'кролик', t: 4 },
    { e: '🦄', n: 'единорог', t: 0 }, { e: '🐝', n: 'пчела', t: 5 }, { e: '🦦', n: 'выдра', t: 6 },
    { e: '🐻', n: 'медведь', t: 2 },
  ];
  const validAnimal = a => (Number.isInteger(a) && a >= 0 && a < ANIMALS.length ? a : null);

  const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const validPid = s => (typeof s === 'string' && /^(h|g[a-z0-9]{6})$/.test(s) ? s : null);

  const sh = {
    name: '',            // моё имя в общих чатах
    host: null,          // постоянный peer создателя
    hostState: 'idle',   // connecting | online | reconnecting | busy
    links: new Set(),    // у создателя: соединения гостей { conn, tid, pid, last, typingAt, quiet }
    typing: {},          // tid → { pid: { name, until } }
    turns: {},           // tid → { timer, pending, since } — очередь ответа ГигаЧата
    leaveTimers: {},
    guest: null,         // у гостя: соединение с создателем открытого общего чата
  };
  try { sh.name = cleanName(localStorage.getItem(NAME_KEY)); } catch {}
  function setMyName(n) { sh.name = n; try { localStorage.setItem(NAME_KEY, n); } catch {} }

  const isGroup = t => !!(t && (t.shared || t.preset));
  const isGuest = t => t?.shared?.role === 'guest';
  const isHosted = t => t?.shared?.role === 'host' && !!t.shared.active;
  const myPid = t => (isGuest(t) ? t.shared.me : HOST_PID);
  const hostName = () => sh.name || 'Создатель чата';
  const authorId = m => m.author?.id || HOST_PID;
  const isMine = (t, m) => authorId(m) === myPid(t);
  function personName(t, pid, fallback) {
    if (pid === HOST_PID && !isGuest(t)) return hostName();
    return t.shared?.people?.[pid]?.name || fallback || (pid === HOST_PID ? 'Создатель чата' : 'Гость');
  }
  const authorName = (t, m) => personName(t, authorId(m), m.author?.name);
  // животное участника: у создателя — своё поле, у гостей — в списке людей
  function animalOf(t, pid) {
    const a = pid === HOST_PID && !isGuest(t) ? t.shared?.hostAnimal : t.shared?.people?.[pid]?.a;
    if (validAnimal(a) !== null) return ANIMALS[a];
    const h = [...String(pid)].reduce((x, ch) => (x * 31 + ch.charCodeAt(0)) >>> 0, 7);
    return ANIMALS[h % ANIMALS.length];
  }
  const tint = (t, pid) => TINTS[animalOf(t, pid).t];
  // свободное животное, по возможности ещё и другого цвета, чем у остальных
  function pickAnimal(t) {
    const used = new Set([t.shared?.hostAnimal, ...Object.values(t.shared?.people || {}).map(p => p.a)].filter(a => validAnimal(a) !== null));
    const usedTints = new Set([...used].map(a => ANIMALS[a].t));
    const free = ANIMALS.map((_, i) => i).filter(i => !used.has(i));
    const fresh = free.filter(i => !usedTints.has(ANIMALS[i].t));
    const pool = fresh.length ? fresh : free.length ? free : ANIMALS.map((_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const avatarHTML = (t, pid, cls = '', title = '') => {
    const an = animalOf(t, pid);
    const tn = TINTS[an.t];
    return `<span class="av${cls ? ' ' + cls : ''}" style="--av:${tn.av};--av-fg:${tn.fg}"${title ? ` title="${esc(title)}"` : ''}>${an.e}</span>`;
  };
  // имя показываем над первой репликой подряд одного человека
  function startsRun(t, m) {
    const i = t.messages.indexOf(m);
    const prev = i > 0 ? t.messages[i - 1] : null;
    return !prev || prev.role !== 'user' || authorId(prev) !== authorId(m);
  }
  function humanLine(t, m) {
    const name = authorName(t, m);
    return m.kind === 'roll' ? `[${name} бросает d${m.die}: выпало ${m.value}]` : `${name}: ${String(m.content || '').slice(0, 4000)}`;
  }

  // Честный бросок: криптослучайность без перекоса по модулю
  function rollDie(n) {
    const a = new Uint32Array(1);
    const lim = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(a); while (a[0] >= lim);
    return (a[0] % n) + 1;
  }

  // Контекст для модели: реплики подписаны именами, события и броски — в скобках
  function groupMessages(t, exclude) {
    const rpg = t.preset === 'rpg';
    const names = [...new Set([sh.name, ...Object.values(t.shared?.people || {}).map(p => p.name)].filter(Boolean))];
    let sys = rpg ? SYS_RPG : `${SYS_ASK}\n\n${SYS_GROUP}`;
    if (names.length) sys += `\n\nУчастники чата: ${names.join(', ')}.`;
    if (rpg) {
      const d20 = Array.from({ length: 4 }, () => rollDie(20)).join(', ');
      sys += `\n\nБроски на этот ход (бери по порядку и только когда нужна проверка): d20 — ${d20}; d6 — ${rollDie(6)}, ${rollDie(6)}.`;
    }
    const out = [{ role: 'system', content: sys }];
    if (rpg) out.push({ role: 'user', content: RPG_START });
    const hist = t.messages.filter(m => m !== exclude && m.status !== 'error');
    for (const m of hist.slice(-36)) {
      if (m.role === 'event') out.push({ role: 'user', content: `[${m.text}]` });
      else if (m.role === 'user') out.push({ role: 'user', content: humanLine(t, m) });
      else if (m.kind === 'plan' && (m.task || t.task)?.plan) out.push({ role: 'assistant', content: planAsText(m.task || t.task) });
      else if (m.content) out.push({ role: 'assistant', content: m.content.slice(0, 8000) });
    }
    return out.reduce((acc, m) => {
      const prev = acc[acc.length - 1];
      if (prev && prev.role === m.role && m.role !== 'system') prev.content += '\n' + m.content;
      else acc.push({ ...m });
      return acc;
    }, []);
  }

  /* ---------- Очередь ответа: ГигаЧат ждёт, пока все допишут ---------- */
  const someoneTyping = t => Object.values(sh.typing[t.id] || {}).some(v => v.until > Date.now());
  function needsAnswer(t) {
    for (let i = t.messages.length - 1; i >= 0; i--) {
      const m = t.messages[i];
      if (m.role === 'event') { if (m.reply) return true; continue; }
      return m.role === 'user';
    }
    return false;
  }
  function queueTurn(t) {
    const q = sh.turns[t.id] || (sh.turns[t.id] = { timer: 0, pending: false, since: 0 });
    if (isBusy(t)) { q.pending = true; return; }
    clearTimeout(q.timer);
    if (!q.since) q.since = Date.now();
    q.timer = setTimeout(() => fireTurn(t), onlineLinks(t).length ? 1500 : 300);
  }
  function fireTurn(t) {
    const q = sh.turns[t.id];
    if (!q) return;
    q.timer = 0;
    if (isBusy(t)) { q.pending = true; return; }
    // пока кто-то печатает — ждём, но не дольше 8 секунд
    if (someoneTyping(t) && Date.now() - q.since < 8000) { q.timer = setTimeout(() => fireTurn(t), 600); return; }
    q.since = 0;
    q.pending = false;
    if (needsAnswer(t)) streamAnswer(t);
  }
  function afterTurn(t) {
    const q = sh.turns[t.id];
    if (q?.pending) { q.pending = false; queueTurn(t); }
  }
  function cancelTurn(t) {
    const q = sh.turns[t.id];
    if (!q) return;
    clearTimeout(q.timer);
    Object.assign(q, { timer: 0, pending: false, since: 0 });
  }
  function stopAnswer(t) {
    if (isGuest(t)) { guestLinkFor(t)?.link.send({ t: 'stop' }); return; }
    cancelTurn(t);
    runtime.ctrl[t.id]?.abort();
  }

  /* ---------- Сообщения людей ---------- */
  const guestLinkFor = t => (sh.guest && sh.guest.tid === t.id && sh.guest.status === 'online' ? sh.guest : null);
  function groupPush(t, m) {
    pushMsg(t, m);
    save();
    renderSidebar();
    syncChatComposer();
    queueTurn(t);
  }
  function say(t, text) {
    text = String(text || '').trim().slice(0, 2000);
    if (!text) return false;
    typingOff();
    if (isGuest(t)) {
      const g = guestLinkFor(t);
      const m = { id: GS.rid(12), role: 'user', content: text, author: { id: t.shared.me, name: t.shared.name } };
      if (!g || !g.link.send({ t: 'say', id: m.id, text })) { toast('Нет связи с создателем чата'); return false; }
      pushMsg(t, m);
      save();
      renderSidebar();
      return true;
    }
    groupPush(t, { role: 'user', content: text, author: { id: HOST_PID, name: hostName() } });
    return true;
  }
  function rollFor(t, die) {
    if (!DICE.includes(die)) return;
    if (isGuest(t)) {
      const g = guestLinkFor(t);
      if (!g || !g.link.send({ t: 'roll', die })) toast('Нет связи с создателем чата');
      return;
    }
    groupPush(t, { role: 'user', kind: 'roll', die, value: rollDie(die), author: { id: HOST_PID, name: hostName() } });
  }

  /* ---------- Создатель: рассылка гостям ---------- */
  const onlineLinks = t => [...sh.links].filter(l => l.tid === t.id && l.pid);
  function sendAll(t, obj, except) {
    for (const l of onlineLinks(t)) if (l.pid !== except) l.conn.send(obj);
  }
  function sendMeta(t) { if (isHosted(t)) sendAll(t, { t: 'meta', title: t.title, model: t.model }); }
  function roster(t) {
    if (!t?.shared) return [];
    if (isGuest(t)) return Object.entries(t.shared.people || {}).map(([id, p]) => ({ id, name: p.name, a: p.a, online: !!p.online }));
    const on = new Set(onlineLinks(t).map(l => l.pid));
    return [{ id: HOST_PID, name: hostName(), a: t.shared.hostAnimal, online: true }]
      .concat(Object.entries(t.shared.people || {}).map(([id, p]) => ({ id, name: p.name, a: p.a, online: on.has(id) })));
  }
  function sendPeople(t) {
    if (isHosted(t)) sendAll(t, { t: 'people', list: roster(t) });
    renderShareUI();
  }
  // Что видит гость: без служебных полей; карточка плана — текстом
  function publicMsg(t, m) {
    const o = { id: m.id, role: m.role };
    if (m.role === 'event') return { ...o, text: m.text };
    if (m.role === 'user') {
      o.author = { id: authorId(m), name: authorName(t, m) };
      if (m.kind === 'roll') return { ...o, kind: 'roll', die: m.die, value: m.value };
      return { ...o, content: String(m.content || '').slice(0, 4000) };
    }
    if (m.kind === 'plan') {
      const task = m.task || t.task;
      return task?.plan ? { ...o, kind: null, content: planAsText(task), status: 'done' } : null;
    }
    return {
      ...o,
      kind: m.kind === 'result' ? 'result' : null,
      content: String(m.content || '').slice(0, 16000),
      reasoning: m.reasoning ? m.reasoning.slice(-4000) : '',
      status: m.status, error: m.error || '', thinkMs: m.thinkMs || 0,
      suggestions: m.suggestions || [],
    };
  }
  const shareTimers = new Map();
  function shareMsg(t, m, immediate) {
    if (!isHosted(t) || !onlineLinks(t).length) return;
    const send = () => {
      clearTimeout(shareTimers.get(m.id));
      shareTimers.delete(m.id);
      if (!t.messages.includes(m)) return;
      const o = publicMsg(t, m);
      if (o) sendAll(t, { t: 'msg', m: o });
    };
    if (immediate || m.status !== 'streaming') { send(); return; }
    if (!shareTimers.has(m.id)) shareTimers.set(m.id, setTimeout(send, 120)); // поток — не чаще ~8 раз в секунду
  }
  function hostEvent(t, text, reply) {
    pushMsg(t, reply ? { role: 'event', text, reply: true } : { role: 'event', text });
    save();
    if (reply) queueTurn(t);
  }

  /* ---------- «Пишет…» ---------- */
  function setTyping(t, pid, on, name) {
    const map = sh.typing[t.id] || (sh.typing[t.id] = {});
    const had = !!map[pid];
    if (on) map[pid] = { name: name || personName(t, pid), until: Date.now() + 5000 };
    else delete map[pid];
    if (isHosted(t) && (on || had)) sendAll(t, { t: 'typing', pid, name: personName(t, pid), on: !!on }, pid);
    if (had !== !!on && runtime.activeId === t.id) { renderTyping(true); renderPeoplePop(t); }
  }
  function renderTyping(scroll) {
    const t = activeThread();
    const old = threadEl.querySelector('.typing-row');
    const me = t && myPid(t);
    const list = t ? Object.entries(sh.typing[t.id] || {}).filter(([pid, v]) => pid !== me && v.until > Date.now()) : [];
    if (!list.length) { old?.remove(); return; }
    const names = list.map(([pid, v]) => personName(t, pid, v.name));
    const label = names.length === 1 ? `${names[0]} пишет`
      : names.length === 2 ? `${names[0]} и ${names[1]} пишут`
      : `${names.length} ${plural(names.length, 'человек', 'человека', 'человек')} пишут`;
    const tn = tint(t, list[0][0]);
    if (old) {
      old.querySelector('.typing-name').innerHTML = `${avatarHTML(t, list[0][0], 'av-sm')}<span>${esc(label)}</span>`;
      old.style.setProperty('--tint', tn.bg);
      old.style.setProperty('--tint-fg', tn.fg);
      return;
    }
    const near = isNearBottom();
    threadEl.insertAdjacentHTML('beforeend', `<div class="typing-row" style="--tint:${tn.bg};--tint-fg:${tn.fg}">` +
      `<span class="typing-bubble">${DOTS}</span><span class="typing-name">${avatarHTML(t, list[0][0], 'av-sm')}<span>${esc(label)}</span></span></div>`);
    if (scroll && near) scrollToBottom(true);
  }
  setInterval(() => {
    const now = Date.now();
    for (const [tid, map] of Object.entries(sh.typing)) {
      let changed = false;
      for (const [pid, v] of Object.entries(map)) if (v.until <= now) { delete map[pid]; changed = true; }
      if (changed && tid === runtime.activeId) { renderTyping(true); renderPeoplePop(activeThread()); }
    }
  }, 1000);

  // мой набор текста: «пишу» раз в 1,5 с, через 3 с тишины — «перестал»
  let typingOn = false, typingSent = 0, typingTimer = 0;
  function sendTyping(t, on) {
    if (isGuest(t)) guestLinkFor(t)?.link.send({ t: 'typing', on });
    else if (isHosted(t)) setTyping(t, HOST_PID, on);
  }
  function noteTyping() {
    const t = activeThread();
    if (!t || !(isHosted(t) || isGuest(t))) return;
    clearTimeout(typingTimer);
    if (!chatInput.value.trim()) { typingOff(); return; }
    if (!typingOn || Date.now() - typingSent > 1500) { typingOn = true; typingSent = Date.now(); sendTyping(t, true); }
    typingTimer = setTimeout(typingOff, 3000);
  }
  function typingOff() {
    clearTimeout(typingTimer);
    if (!typingOn) return;
    typingOn = false;
    const t = activeThread();
    if (t) sendTyping(t, false);
  }

  /* ---------- Создатель: приём гостей ---------- */
  function startHost() {
    if (sh.host || !GS?.available) return;
    sh.host = GS.createHost({
      onState: s => {
        const prev = sh.hostState;
        sh.hostState = s;
        if (s === 'busy' && prev !== 'busy') toast('Общие чаты сейчас обслуживает другая вкладка с прототипом');
        renderShareUI();
      },
      onConnection: conn => {
        const link = { conn, tid: null, pid: null, last: 0, typingAt: 0, quiet: false };
        sh.links.add(link);
        conn.on('data', d => { try { hostReceive(link, d); } catch (err) { console.warn('share', err); } });
        conn.on('close', () => hostDrop(link));
      },
    });
  }
  const sharedById = id => Object.values(state.threads).find(t => isHosted(t) && t.shared.id === id);
  function bye(link, frame) {
    link.quiet = true;
    link.conn.send(frame);
    setTimeout(() => link.conn.close(), 300);
  }

  // Гостю не доверяем: проверяем каждое поле и частоту сообщений
  function hostReceive(link, d) {
    if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
    if (!link.pid) {
      if (d.t !== 'peek' && d.t !== 'hello') return;
      const t = GS.validId(d.share) ? sharedById(d.share) : null;
      if (!t) { bye(link, { t: 'closed' }); return; }
      if (d.t === 'peek') link.conn.send({ t: 'preview', title: t.title, hostName: hostName(), preset: t.preset || null });
      else hostWelcome(link, t, d);
      return;
    }
    const t = state.threads[link.tid];
    if (!isHosted(t)) return;
    const now = Date.now();
    switch (d.t) {
      case 'say': {
        const text = String(d.text || '').trim().slice(0, 2000);
        const id = typeof d.id === 'string' && /^[a-z0-9]{6,24}$/.test(d.id) ? d.id : null;
        if (!text || !id || t.messages.some(m => m.id === id)) return;
        if (now - link.last < 700) { link.conn.send({ t: 'reject', id, reason: 'Слишком часто — подождите секунду' }); return; }
        link.last = now;
        setTyping(t, link.pid, false);
        groupPush(t, { id, role: 'user', content: text, author: { id: link.pid, name: personName(t, link.pid) } });
        break;
      }
      case 'roll':
        if (t.preset !== 'rpg' || !DICE.includes(d.die)) return;
        // у бросков свой лимит: написать действие и сразу бросить кубик — нормально
        if (now - (link.lastRoll || 0) < 700) { link.conn.send({ t: 'reject', reason: 'Кубик можно бросать не чаще раза в секунду' }); return; }
        link.lastRoll = now;
        groupPush(t, { role: 'user', kind: 'roll', die: d.die, value: rollDie(d.die), author: { id: link.pid, name: personName(t, link.pid) } });
        break;
      case 'typing':
        if (d.on && now - link.typingAt < 300) return;
        link.typingAt = now;
        setTyping(t, link.pid, !!d.on);
        break;
      case 'stop':
        if (isBusy(t)) stopAnswer(t);
        break;
    }
  }

  function hostWelcome(link, t, d) {
    const name = cleanName(d.name);
    const token = typeof d.token === 'string' && /^[a-z0-9]{12,40}$/.test(d.token) ? d.token : null;
    if (!name || !token) { bye(link, { t: 'closed' }); return; }
    const people = t.shared.people || (t.shared.people = {});
    let pid = Object.keys(people).find(k => people[k].token === token);
    if (onlineLinks(t).filter(l => l.pid !== pid).length >= MAX_GUESTS) { bye(link, { t: 'full' }); return; }
    if (!pid) {
      pid = 'g' + GS.rid(6);
      people[pid] = { name, token, a: pickAnimal(t), seen: 0 };
    }
    if (validAnimal(people[pid].a) === null) people[pid].a = pickAnimal(t);
    // тот же гость из другой вкладки — прежнее соединение закрываем
    for (const l of onlineLinks(t)) if (l.pid === pid) bye(l, { t: 'replaced' });
    const p = people[pid];
    p.name = name;
    link.tid = t.id;
    link.pid = pid;
    const key = `${t.id}:${pid}`;
    const returning = !!sh.leaveTimers[key] || (p.seen && Date.now() - p.seen < 60000);
    clearTimeout(sh.leaveTimers[key]);
    delete sh.leaveTimers[key];

    link.conn.send({ t: 'welcome', you: pid, title: t.title, model: t.model, preset: t.preset || null });
    sendPeople(t); // до переписки: гость сразу знает животных и цвета участников
    for (const m of t.messages.slice(-SNAPSHOT)) {
      const o = publicMsg(t, m);
      if (o) link.conn.send({ t: 'msg', m: o });
    }
    link.conn.send({ t: 'synced' });
    for (const [tp, v] of Object.entries(sh.typing[t.id] || {})) {
      if (tp !== pid) link.conn.send({ t: 'typing', pid: tp, name: personName(t, tp, v.name), on: true });
    }
    // в игре ведущий сразу поприветствует нового игрока
    if (!returning) hostEvent(t, `${name} входит в чат`, t.preset === 'rpg');
    save();
  }

  function hostDrop(link) {
    sh.links.delete(link);
    const t = state.threads[link.tid];
    if (!t || !link.pid) return;
    const p = t.shared?.people?.[link.pid];
    if (p) p.seen = Date.now();
    const stillHere = onlineLinks(t).some(l => l.pid === link.pid);
    if (!stillHere) setTyping(t, link.pid, false);
    // «выходит из чата» — только если за 30 секунд не вернулся (перезагрузка, смена сети)
    if (!link.quiet && !stillHere && isHosted(t) && p) {
      const key = `${t.id}:${link.pid}`;
      clearTimeout(sh.leaveTimers[key]);
      sh.leaveTimers[key] = setTimeout(() => {
        delete sh.leaveTimers[key];
        if (isHosted(t) && !onlineLinks(t).some(l => l.pid === link.pid)) hostEvent(t, `${p.name} выходит из чата`);
      }, 30000);
    }
    sendPeople(t);
    save();
  }

  function activateShare(t) {
    if (!GS?.available) { toast('Общий чат в этом браузере недоступен'); return false; }
    if (t.mode === 'task') {
      if (isBusy(t)) { toast('Дождитесь, пока задача выполнится'); return false; }
      archiveTask(t);
      t.mode = 'ask';
      t.editing = false;
    }
    if (!t.shared) t.shared = { role: 'host', people: {} };
    if (validAnimal(t.shared.hostAnimal) === null) t.shared.hostAnimal = pickAnimal(t);
    if (!t.shared.active) { t.shared.active = true; t.shared.id = GS.rid(10); }
    startHost();
    save();
    syncChatComposer();
    renderThread();
    renderSidebar();
    return true;
  }
  function stopSharing(t) {
    if (!isHosted(t)) return;
    for (const l of onlineLinks(t)) bye(l, { t: 'closed' });
    t.shared.active = false;
    for (const k of Object.keys(sh.leaveTimers)) {
      if (k.startsWith(t.id + ':')) { clearTimeout(sh.leaveTimers[k]); delete sh.leaveTimers[k]; }
    }
    delete sh.typing[t.id];
    save();
    renderTyping();
    renderShareUI();
    toast('Доступ закрыт — по старой ссылке больше не войти');
  }

  /* ---------- Гость ---------- */
  const ROLES = new Set(['user', 'assistant', 'event']);
  const STATUSES = new Set(['streaming', 'done', 'stopped', 'error']);
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  // Что пришло от создателя — только по белому списку полей
  function cleanMsg(o) {
    if (!o || typeof o !== 'object' || !ROLES.has(o.role) || typeof o.id !== 'string' || !/^[a-z0-9]{4,40}$/.test(o.id)) return null;
    const m = { id: o.id, role: o.role };
    if (o.role === 'event') { m.text = str(o.text, 120); return m.text ? m : null; }
    if (o.role === 'user') {
      m.author = { id: validPid(o.author?.id) || 'gxxxxxx', name: cleanName(o.author?.name) || 'Гость' };
      if (o.kind === 'roll') {
        const die = DICE.includes(o.die) ? o.die : 0;
        if (!die || !Number.isInteger(o.value) || o.value < 1 || o.value > die) return null;
        Object.assign(m, { kind: 'roll', die, value: o.value });
      } else {
        m.content = str(o.content, 4000);
      }
      return m;
    }
    m.kind = o.kind === 'result' ? 'result' : null;
    m.content = str(o.content, 16000);
    m.reasoning = str(o.reasoning, 4000);
    m.status = STATUSES.has(o.status) ? o.status : 'done';
    if (m.status === 'error') m.error = str(o.error, 300) || 'Не удалось получить ответ';
    if (Number.isFinite(o.thinkMs)) m.thinkMs = Math.max(0, Math.min(o.thinkMs, 600000));
    if (Array.isArray(o.suggestions)) m.suggestions = o.suggestions.filter(s => typeof s === 'string').slice(0, 2).map(s => s.slice(0, 60));
    return m;
  }

  const guestThreadFor = (host, share) => Object.values(state.threads).find(t => isGuest(t) && t.shared.host === host && t.shared.id === share);
  const FINAL = ['closed', 'full', 'replaced'];

  function guestStart({ host, share, tid = null, name = '', token, phase }) {
    guestStop();
    const g = { host, share, tid, name, token, phase, status: 'connecting', link: null, retry: 0, syncing: false, buffer: [] };
    sh.guest = g;
    g.link = GS.join(host, {
      onOpen: () => {
        if (sh.guest !== g) return;
        g.link.send(g.name ? { t: 'hello', share, name: g.name, token: g.token } : { t: 'peek', share });
      },
      onData: d => {
        if (sh.guest !== g) return;
        try { guestReceive(g, d); } catch (err) { console.warn('share', err); }
      },
      onClose: () => guestLost(g),
      onFail: reason => {
        if (sh.guest !== g) return;
        if (g.phase === 'join') joinShow('fail', { reason });
        else guestLost(g);
      },
    });
    return g;
  }
  function guestStop() {
    const g = sh.guest;
    if (!g) return;
    clearTimeout(g.retry);
    g.link?.stop();
    sh.guest = null;
  }
  // связь пропала — переписка остаётся, переподключаемся каждые 5 секунд
  function guestLost(g) {
    if (sh.guest !== g || FINAL.includes(g.status)) return;
    if (g.phase === 'join') { joinShow('fail', { reason: 'offline' }); return; }
    g.status = 'offline';
    if (g.tid) delete sh.typing[g.tid];
    clearTimeout(g.retry);
    g.retry = setTimeout(() => { if (sh.guest === g) g.link.retry(); }, 5000);
    refreshGuest(g);
  }
  function guestEnsure(t) {
    const g = sh.guest;
    if (g && g.tid === t.id && !FINAL.includes(g.status)) return;
    if (g?.phase === 'join') return;
    if (!t.shared.name || !t.shared.token || !GS?.available) return;
    guestStart({ host: t.shared.host, share: t.shared.id, tid: t.id, name: t.shared.name, token: t.shared.token, phase: 'live' });
  }
  function refreshGuest(g) {
    if (!g.tid || runtime.activeId !== g.tid) return;
    syncChatComposer();
    renderShareUI();
    renderTyping();
  }

  function guestUpsert(t, m) {
    if (m.role === 'user' && sh.typing[t.id]?.[m.author.id]) setTyping(t, m.author.id, false);
    const cur = t.messages.find(x => x.id === m.id);
    if (!cur) {
      pushMsg(t, m);
    } else {
      Object.assign(cur, { error: undefined, suggestions: undefined }, m, { liked: cur.liked, reasoningOpen: cur.reasoningOpen });
      if (cur.status === 'streaming') { scheduleUpdate(t, cur); save(); return; }
      updateMsgEl(t, cur);
    }
    save();
    if (runtime.activeId === t.id) syncChatComposer();
    renderSidebar();
  }

  function guestReceive(g, d) {
    if (!d || typeof d !== 'object') return;
    let t = state.threads[g.tid];
    switch (d.t) {
      case 'preview':
        if (g.phase === 'join' && !g.name) joinShow('name', { hostName: cleanName(d.hostName), title: shortTitle(str(d.title, 80)) });
        break;
      case 'welcome': {
        const me = validPid(d.you);
        if (!me) return;
        t = t || guestThreadFor(g.host, g.share) || createThread({
          mode: 'ask', model: 'fast', title: 'Общий чат', titleLocked: true,
          shared: { role: 'guest', host: g.host, id: g.share, people: {} },
        });
        Object.assign(t.shared, { me, name: g.name, token: g.token });
        t.title = shortTitle(str(d.title, 80) || t.title);
        t.model = d.model === 'think' ? 'think' : 'fast';
        t.preset = d.preset === 'rpg' ? 'rpg' : null;
        g.tid = t.id;
        g.syncing = true;
        g.buffer = [];
        break;
      }
      case 'msg': {
        const m = cleanMsg(d.m);
        if (!m || !t) return;
        if (g.syncing) g.buffer.push(m); else guestUpsert(t, m);
        break;
      }
      case 'synced': {
        if (!t || !g.syncing) return;
        const old = new Map(t.messages.map(x => [x.id, x]));
        t.messages = g.buffer.map(m => {
          const o = old.get(m.id);
          if (o) { m.liked = o.liked; m.reasoningOpen = o.reasoningOpen; }
          return m;
        });
        g.syncing = false;
        g.buffer = [];
        g.status = 'online';
        touch(t);
        save();
        if (g.phase === 'join') { g.phase = 'live'; finishJoin(t); }
        else if (runtime.activeId === t.id) renderThread(true);
        renderSidebar();
        refreshGuest(g);
        break;
      }
      case 'del': {
        const m = t?.messages.find(x => x.id === d.id);
        if (m) { removeMsg(t, m); save(); }
        break;
      }
      case 'typing': {
        const pid = validPid(d.pid);
        if (t && pid && pid !== t.shared.me) setTyping(t, pid, !!d.on, cleanName(d.name));
        break;
      }
      case 'people': {
        if (!t || !Array.isArray(d.list)) return;
        const names = ppl => Object.entries(ppl || {}).map(([id, p]) => `${id}:${p.name}:${p.a}`).join('|');
        const before = names(t.shared.people);
        const people = {};
        for (const p of d.list.slice(0, 12)) {
          const id = validPid(p?.id);
          if (id) people[id] = { name: cleanName(p.name) || 'Гость', a: validAnimal(p.a), online: !!p.online };
        }
        t.shared.people = people;
        save();
        if (runtime.activeId === t.id && names(people) !== before) renderThread();
        refreshGuest(g);
        break;
      }
      case 'meta':
        if (!t) return;
        if (typeof d.title === 'string' && d.title.trim()) t.title = shortTitle(d.title.slice(0, 80));
        t.model = d.model === 'think' ? 'think' : 'fast';
        save();
        renderSidebar();
        refreshGuest(g);
        break;
      case 'reject': {
        const m = t?.messages.find(x => x.id === d.id && x.role === 'user');
        if (m) removeMsg(t, m);
        toast(str(d.reason, 80) || 'Сообщение не отправилось');
        break;
      }
      case 'closed':
      case 'full':
      case 'replaced':
        g.status = d.t;
        clearTimeout(g.retry);
        g.link.stop();
        if (g.phase === 'join') joinShow('fail', { reason: d.t });
        refreshGuest(g);
        break;
    }
  }

  /* ---------- Вход гостя по ссылке ---------- */
  const joinEl = $('#join');
  const joinName = $('#joinName');
  const JOIN_FAIL = {
    offline: ['Создатель чата не в сети', 'Ссылка заработает, когда создатель снова откроет прототип'],
    timeout: ['Не получилось подключиться', 'Сервер чата не ответил. Проверьте интернет и попробуйте ещё раз'],
    network: ['Нет связи', 'Проверьте интернет и попробуйте ещё раз'],
    browser: ['Браузер не подходит', 'Откройте ссылку в свежем Chrome, Safari, Firefox или Edge'],
    closed: ['Ссылка не работает', 'Создатель закрыл доступ к чату, или ссылка скопирована не целиком'],
    full: ['Чат заполнен', 'В чате уже максимум участников'],
    replaced: ['Чат открыт в другой вкладке', 'Продолжайте там или закройте её и обновите страницу'],
  };
  function joinShow(kind, info = {}) {
    $('#joinField').hidden = kind !== 'name';
    $('#joinActions').hidden = kind !== 'fail';
    $('#joinError').textContent = '';
    const title = $('#joinTitle');
    const text = $('#joinText');
    if (kind === 'connecting') {
      title.textContent = info.title || 'Подключаюсь к чату';
      text.innerHTML = `${SPIN16}${esc(info.text || 'Это займёт пару секунд')}`;
    } else if (kind === 'name') {
      title.textContent = info.hostName ? `${info.hostName} приглашает в чат` : 'Вас пригласили в чат';
      text.textContent = `«${info.title || 'Общий чат'}». Как вас представить?`;
      joinName.value = sh.name;
      setTimeout(() => joinName.focus(), 50);
    } else {
      const [a, b] = JOIN_FAIL[info.reason] || JOIN_FAIL.network;
      title.textContent = a;
      text.textContent = b;
      $('#joinRetry').hidden = FINAL.includes(info.reason) || info.reason === 'browser';
    }
  }
  function finishJoin(t) {
    document.documentElement.classList.remove('is-locked');
    joinEl.classList.add('is-leaving');
    setTimeout(() => { joinEl.hidden = true; joinEl.classList.remove('is-leaving'); }, 400);
    openThread(t.id);
    const an = animalOf(t, t.shared.me);
    setTimeout(() => toast(`Вы в чате, ваша аватарка — ${an.e} ${an.n}`), 450);
  }
  $('#joinForm').addEventListener('submit', e => {
    e.preventDefault();
    const g = sh.guest;
    const name = cleanName(joinName.value);
    if (!g) return;
    if (!name) {
      const f = $('#joinForm');
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
      joinName.focus();
      return;
    }
    setMyName(name);
    g.name = name;
    joinShow('connecting', { title: 'Вхожу в чат', text: 'Секунду…' });
    if (!g.link.send({ t: 'hello', share: g.share, name, token: g.token })) joinShow('fail', { reason: 'network' });
  });
  $('#joinRetry').addEventListener('click', () => {
    const g = sh.guest;
    if (!g) return;
    g.status = 'connecting';
    joinShow('connecting');
    g.link.retry();
  });
  // без приглашения — обычный вход по паролю (страница перезагрузится без #join)
  $('#joinPass').addEventListener('click', () => location.replace(location.pathname + location.search));

  /* ---------- Приглашение, участники, плашка ---------- */
  const inviteBtn = $('#inviteBtn');
  const invitePop = $('#invitePop');
  const ipName = $('#ipName');
  const ipLink = $('#ipLink');
  const ipCopy = $('#ipCopy');
  const ipStop = $('#ipStop');
  const linkFor = t => (isGuest(t) ? GS.makeLink(t.shared.host, t.shared.id) : isHosted(t) ? GS.makeLink(GS.hostId(), t.shared.id) : '');
  const HOST_NOTE = {
    connecting: 'Подключаюсь к сети…',
    reconnecting: 'Связь пропала — переподключаюсь…',
    busy: 'Общие чаты сейчас обслуживает другая вкладка с прототипом',
    online: 'Чат работает, пока эта вкладка открыта',
  };
  function openInvite() {
    const t = activeThread();
    if (!t) return;
    closeModelMenu();
    closePlusMenu();
    closeDice();
    closePeople();
    invitePop.hidden = false;
    inviteBtn.setAttribute('aria-expanded', 'true');
    renderInvite();
    if (!isGuest(t) && !sh.name) setTimeout(() => ipName.focus(), 40);
  }
  function closeInvite() {
    if (invitePop.hidden) return;
    invitePop.hidden = true;
    inviteBtn.setAttribute('aria-expanded', 'false');
  }
  function renderInvite() {
    const t = activeThread();
    if (!t || invitePop.hidden) return;
    const guest = isGuest(t);
    const link = GS ? linkFor(t) : '';
    $('#ipNameRow').hidden = guest;
    if (document.activeElement !== ipName) ipName.value = sh.name;
    $('#ipText').textContent = guest
      ? 'Позовите ещё кого-нибудь: по этой ссылке можно войти в этот чат.'
      : t.preset === 'rpg'
        ? 'Друзья откроют ссылку и сыграют вместе с вами. ГигаЧат ведёт игру и отвечает всем.'
        : 'Друг откроет ссылку и сможет писать здесь вместе с вами. ГигаЧат ответит всем.';
    ipLink.value = link;
    $('#ipLinkRow').classList.toggle('has-link', !!link);
    ipCopy.textContent = link ? 'Скопировать' : 'Создать ссылку';
    ipCopy.disabled = !guest && !cleanName(ipName.value);
    $('#ipNote').textContent = guest
      ? 'Чат работает, пока у создателя открыта вкладка'
      : isHosted(t) ? HOST_NOTE[sh.hostState] || HOST_NOTE.connecting : 'Ссылка работает, пока эта вкладка открыта';
    ipStop.hidden = !isHosted(t);
  }

  /* ---------- Кто в чате: плашка сверху и список участников ---------- */
  const peoplePill = $('#peoplePill');
  const peoplePop = $('#peoplePop');
  // кто сейчас в сети: я — первым; у гостя без связи с создателем — только он сам
  function presence(t) {
    const me = myPid(t);
    const connected = !isGuest(t) || !!guestLinkFor(t);
    const typing = sh.typing[t.id] || {};
    return roster(t).map(p => ({
      ...p,
      me: p.id === me,
      online: p.id === me || (connected && p.online),
      typing: p.id !== me && !!typing[p.id] && typing[p.id].until > Date.now(),
    })).sort((a, b) => (b.me - a.me) || (b.online - a.online));
  }
  function renderPeoplePill(t) {
    const show = !!(t && t.shared && (isGuest(t) || isHosted(t)));
    peoplePill.hidden = !show;
    if (!show) { closePeople(); return; }
    const list = presence(t);
    const on = list.filter(p => p.online);
    const others = on.filter(p => !p.me).map(p => p.name);
    let text;
    if (isGuest(t) && !guestLinkFor(t)) text = 'Нет связи с создателем';
    else if (!others.length) text = 'Пока только вы';
    else if (others.length === 1) text = `Вы и ${others[0]}`;
    else if (others.length === 2) text = `Вы, ${others[0]} и ${others[1]}`;
    else text = `Вы, ${others[0]} и ещё ${others.length - 1}`;
    $('#ppStack').innerHTML = on.slice(0, 4).map(p => avatarHTML(t, p.id, '', p.me ? `${p.name} — вы` : p.name)).join('') +
      (on.length > 4 ? `<span class="av av-more">+${on.length - 4}</span>` : '');
    $('#ppText').textContent = text;
    peoplePill.title = `В чате: ${on.map(p => p.name).join(', ')}`;
    renderPeoplePop(t, list);
  }
  function renderPeoplePop(t, list = presence(t)) {
    if (peoplePop.hidden) return;
    const n = list.filter(p => p.online).length;
    $('#ppCount').textContent = `${n} ${plural(n, 'человек', 'человека', 'человек')} в сети`;
    $('#ppList').innerHTML = list.map(p => {
      const an = animalOf(t, p.id);
      const role = [an.n, p.me ? 'вы' : '', p.id === HOST_PID ? 'создатель чата' : ''].filter(Boolean).join(' · ');
      const state = p.typing ? 'пишет…' : p.online ? 'в сети' : 'не в сети';
      return `<div class="pp-row${p.online ? '' : ' is-off'}">${avatarHTML(t, p.id, 'av-lg')}` +
        `<div class="pp-who"><div class="pp-name">${esc(p.name)}</div><div class="pp-role">${esc(role)}</div></div>` +
        `<span class="pp-state${p.online ? ' is-on' : ''}${p.typing ? ' is-typing' : ''}">${state}</span></div>`;
    }).join('');
  }
  function openPeople() {
    closeInvite();
    closeDice();
    closeModelMenu();
    peoplePop.hidden = false;
    peoplePill.setAttribute('aria-expanded', 'true');
    renderPeoplePill(activeThread());
  }
  function closePeople() {
    if (peoplePop.hidden) return;
    peoplePop.hidden = true;
    peoplePill.setAttribute('aria-expanded', 'false');
  }
  peoplePill.addEventListener('click', () => (peoplePop.hidden ? openPeople() : closePeople()));
  document.addEventListener('click', e => {
    if (!peoplePop.hidden && !peoplePop.contains(e.target) && !e.target.closest('#peoplePill')) closePeople();
  });
  function renderShareNote(t) {
    let text = '';
    if (isGuest(t)) {
      const st = sh.guest?.tid === t.id ? sh.guest.status : 'connecting';
      text = {
        connecting: 'Подключаюсь к создателю чата…',
        offline: 'Создатель чата не в сети — переписка сохранена. Переподключаюсь…',
        closed: 'Создатель закрыл доступ к этому чату',
        full: 'В чате уже максимум участников',
        replaced: 'Этот чат открыт в другой вкладке',
      }[st] || '';
    } else if (isHosted(t) && sh.hostState === 'busy') {
      text = 'Этот общий чат обслуживает другая вкладка с прототипом — пишите в ней';
    }
    const el = $('#shareNote');
    el.textContent = text;
    el.hidden = !text;
  }
  function renderShareUI() {
    const t = activeThread();
    renderPeoplePill(t);
    renderShareNote(t);
    renderInvite();
  }

  inviteBtn.addEventListener('click', () => (invitePop.hidden ? openInvite() : closeInvite()));
  ipCopy.addEventListener('click', () => {
    const t = activeThread();
    if (!t) return;
    if (!isGuest(t)) {
      const name = cleanName(ipName.value);
      if (!name) { ipName.focus(); return; }
      if (name !== sh.name) setMyName(name);
      if (!isHosted(t) && !activateShare(t)) return;
      sendPeople(t);
    }
    renderInvite();
    copyText(linkFor(t), 'Ссылка скопирована — отправьте её другу');
  });
  ipName.addEventListener('input', () => {
    const name = cleanName(ipName.value);
    ipCopy.disabled = !name;
    if (!name) return;
    setMyName(name);
    const t = activeThread();
    if (isHosted(t)) sendPeople(t);
  });
  ipName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ipCopy.click(); } });
  ipLink.addEventListener('focus', () => ipLink.select());
  ipStop.addEventListener('click', () => {
    const t = activeThread();
    if (t) stopSharing(t);
    renderInvite();
  });
  document.addEventListener('click', e => {
    if (!invitePop.hidden && !invitePop.contains(e.target) && !e.target.closest('#inviteBtn')) closeInvite();
  });

  /* ---------- Кубики ---------- */
  const diceMenu = $('#diceMenu');
  let diceOpen = false;
  function openDice() {
    closeModelMenu();
    closePlusMenu();
    closeInvite();
    const r = chatDice.getBoundingClientRect();
    diceMenu.style.left = `${r.left}px`;
    diceMenu.style.top = `${r.top - 8 - diceMenu.offsetHeight}px`;
    diceMenu.classList.add('is-open');
    chatDice.setAttribute('aria-expanded', 'true');
    diceOpen = true;
  }
  function closeDice() {
    if (!diceOpen) return;
    diceOpen = false;
    diceMenu.classList.remove('is-open');
    chatDice.setAttribute('aria-expanded', 'false');
  }
  chatDice.addEventListener('click', () => (diceOpen ? closeDice() : openDice()));
  diceMenu.addEventListener('click', e => {
    const b = e.target.closest('.dice-opt');
    if (!b) return;
    closeDice();
    const t = activeThread();
    if (t) rollFor(t, Number(b.dataset.die));
  });
  diceMenu.addEventListener('keydown', e => {
    const items = $$('.dice-opt', diceMenu);
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowRight') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  document.addEventListener('click', e => {
    if (diceOpen && !diceMenu.contains(e.target) && !e.target.closest('#chatDice')) closeDice();
  });
  window.addEventListener('resize', closeDice);

  /* ---------- Пресет «Ролевая игра» ---------- */
  function startRpg() {
    const t = createThread({ mode: 'ask', model: 'fast', title: 'Ролевая игра', titleLocked: true, preset: 'rpg' });
    openThread(t.id);
    streamAnswer(t); // ведущий сам открывает сцену
    if (!JOIN) setTimeout(openInvite, 450);
  }
  $('#rpgStart').addEventListener('click', startRpg);

  /* =====================================================================
     Старт
     ===================================================================== */
  if (JOIN) {
    // вход по приглашению: страница откроется, когда создатель примет подключение
    joinEl.hidden = false;
    if (!GS?.available) {
      joinShow('fail', { reason: 'browser' });
    } else {
      joinShow('connecting');
      const existing = guestThreadFor(JOIN.host, JOIN.share);
      guestStart({
        host: JOIN.host, share: JOIN.share, tid: existing?.id || null,
        name: existing?.shared.name || '', token: existing?.shared.token || GS.rid(16), phase: 'join',
      });
    }
  } else if (Object.values(state.threads).some(isHosted)) {
    startHost(); // ссылки на общие чаты снова работают после перезагрузки
  }
  renderSidebar();
  if (location.protocol === 'file:' && !isDirect()) {
    setTimeout(() => toast('Чат работает через сервер: node server.js → http://localhost:3000'), 800);
  }
})();
