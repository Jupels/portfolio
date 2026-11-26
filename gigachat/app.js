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
    'c:ozon': { title: 'Исследование для Озона', sub: 'Проверить рассчет', look: 'review', mode: 'task', card: true,
      prompt: 'Проведи исследование: как небольшому продавцу выйти на маркетплейс Озон — комиссии, логистика, первые шаги и примерный расчёт юнит-экономики' },
    'c:cu': { title: 'Поступления в ЦУ', sub: 'Заявка готова', look: 'done', mode: 'task', card: true,
      prompt: 'Подготовь заявку на поступление в Центральный университет: требования, документы, сроки и черновик мотивационного письма' },
    'c:fin': { title: 'Планирование финансов', sub: 'Есть лишние траты', look: 'alert', mode: 'task', card: true,
      prompt: 'Проанализируй мои траты за месяц и найди лишние: доход 120 000 ₽, продукты 32 000 ₽, кафе 14 000 ₽, такси 9 500 ₽, подписки 3 200 ₽, маркетплейсы 18 000 ₽' },
  });

  /* =====================================================================
     Хранилище (localStorage) и состояние
     ===================================================================== */
  const STORE_KEY = 'giga.v1';
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

  const threadList = () => Object.values(state.threads).sort((a, b) => b.updatedAt - a.updatedAt);
  const activeThread = () => state.threads[runtime.activeId];
  const isBusy = t => !!runtime.ctrl[t.id];
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
    if (!CFG.openrouterKey) throw new Error('Сначала введите пароль на странице');
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
      if (err.name === 'AbortError') throw err;
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
  let activeChip = null;

  function setView(view) {
    closeModelMenu();
    closePlusMenu();
    stopSpeaking();
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
    setIdeas(false);
    runtime.activeId = id;
    card.dataset.view = 'chat';
    closePlusMenu();
    setTool('chat', null);
    chatInput.value = '';
    autoGrow();
    syncChatComposer();
    renderThread(true);
    renderSidebar();
    chatInput.focus({ preventScroll: true });
  }

  function openSeed(key) {
    const s = SEEDS[key];
    if (!s) return;
    const existing = state.threads[state.seeds[key]];
    if (existing) return openThread(existing.id);
    const t = createThread({
      mode: s.mode, model: s.mode === 'task' && !s.autoRun ? 'think' : 'fast',
      title: s.title, titleLocked: true, folder: s.folder || null,
    });
    state.seeds[key] = t.id;
    save();
    openThread(t.id);
    if (s.mode === 'task') startTask(t, s.prompt, { autoRun: s.autoRun }); else sendAsk(t, s.prompt);
  }

  function pushMsg(t, m) {
    m.id = m.id || uid();
    t.messages.push(m);
    touch(t);
    if (runtime.activeId === t.id) {
      const prev = t.messages.slice(0, -1).reverse().find(x => x.role === 'assistant');
      threadEl.insertAdjacentHTML('beforeend', msgHTML(t, m));
      threadEl.lastElementChild.classList.add('enter');
      if (prev) updateMsgEl(t, prev); // у прошлого ответа пропадают подсказки
      scrollToBottom(true);
    }
    return m;
  }
  function removeMsg(t, m) {
    const i = t.messages.indexOf(m);
    if (i >= 0) t.messages.splice(i, 1);
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
    return msg;
  }

  // Название чата, подсказки-продолжения и признак «это задача» — одним дешёвым запросом.
  async function fetchMeta(t, msg) {
    const q = [...t.messages].reverse().find(m => m.role === 'user')?.content || '';
    try {
      const raw = await api('meta', [
        { role: 'system', content: SYS_META },
        { role: 'user', content: `Вопрос: ${q.slice(0, 2000)}\n\nОтвет: ${msg.content.slice(0, 2000)}` },
      ]);
      const j = parseJSON(raw);
      if (!j) return;
      msg.suggestions = (Array.isArray(j.suggestions) ? j.suggestions : [])
        .filter(s => typeof s === 'string' && s.trim()).slice(0, 2).map(s => s.trim().slice(0, 60));
      msg.isTask = t.mode === 'ask' && j.isTask === true;
      if (!t.titleLocked && !t.titleSet && typeof j.title === 'string' && j.title.trim()) {
        t.title = shortTitle(j.title.replace(/["«»]/g, ''));
        t.titleSet = true;
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
    if (toEnd) chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  const pendingUpdates = new Map();
  let raf = 0;
  function scheduleUpdate(t, m) {
    pendingUpdates.set(m.id, [t, m]);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const [tt, mm] of pendingUpdates.values()) updateMsgEl(tt, mm);
      pendingUpdates.clear();
    });
  }
  function updateMsgEl(t, m) {
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
    if (m.role === 'user') {
      const tag = m.tool && TOOLS[m.tool] ? `<div class="bubble-tag">${svgIcon(TOOLS[m.tool].icon)}${TOOLS[m.tool].tag}</div>` : '';
      return `<div class="msg msg-user" data-mid="${m.id}">${tag}<div class="bubble">${esc(m.content)}</div>` +
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
    else if (m.status === 'streaming' && !m.reasoning) h += `<div class="typing">${DOTS}${t.model === 'think' ? 'Думаю…' : 'Печатает…'}</div>`;
    if (m.status === 'error') h += `<div class="msg-error">${esc(m.error || 'Не удалось получить ответ')}<button class="link-btn" data-act="retry">Повторить</button></div>`;
    if (m.status === 'stopped') h += '<div class="msg-note">Ответ остановлен</div>';
    if ((m.status === 'done' || m.status === 'stopped') && m.content) h += actionsHTML(m);
    if (m.status === 'done' && lastAssistant(t) === m && !isBusy(t)) h += suggHTML(t, m);
    return h + '</div>';
  }

  function actionsHTML(m) {
    return '<div class="ai-actions">' +
      `<button class="act${m.liked === 1 ? ' is-on' : ''}" data-act="like" title="Хороший ответ">${ICON('like')}</button>` +
      `<button class="act${m.liked === -1 ? ' is-on' : ''}" data-act="dislike" title="Плохой ответ">${ICON('dislike')}</button>` +
      `<button class="act" data-act="regen" title="Сгенерировать заново">${ICON('regenerate')}</button>` +
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
      case 'regen': regenerate(t, m); break;
      case 'retry': regenerate(t, m); break;
      case 'speak': speak(t, m); break;
      case 'podcast': toast('Подкасты в прототипе не подключены'); break;
      case 'reasoning': m.reasoningOpen = !m.reasoningOpen; updateMsgEl(t, m); break;
      case 'suggest': if (!isBusy(t)) sendAsk(t, b.dataset.text); break;
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
    const busy = isBusy(t);
    const has = !!chatInput.value.trim();
    const steerable = busy && t.task?.status === 'running' && has;
    chatSend.classList.toggle('has-text', has);
    chatSend.classList.toggle('is-busy', busy && !steerable);
    chatComposer.classList.toggle('has-text', has);
    chatComposer.classList.toggle('is-busy', busy);
    chatSend.title = busy && !steerable ? 'Остановить' : has ? 'Отправить' : 'Голосовой режим';
    chatInput.placeholder = placeholderFor(t);
  }
  chatInput.addEventListener('input', () => { autoGrow(); syncChatComposer(); });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendInChat(); }
  });
  chatSend.addEventListener('click', () => {
    const t = activeThread();
    if (!t) return;
    if (chatSend.classList.contains('is-busy')) { runtime.ctrl[t.id]?.abort(); return; }
    if (chatInput.value.trim()) sendInChat();
    else toast('Голосовой режим в прототипе не подключён');
  });

  function sendInChat() {
    const t = activeThread();
    const text = chatInput.value.trim();
    if (!t || !text) return;
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
    const row = ({ tid, seed, title, active, spin }) =>
      `<a class="chat-row${active ? ' is-active' : ''}" ${tid ? `data-tid="${tid}"` : `data-seed="${seed}"`} title="${esc(title)}">` +
      `<span>${esc(title)}</span>${spin ? SPIN16 : ''}</a>`;
    const rows = threadList().filter(t => !t.folder).map(t => row({
      tid: t.id, title: t.title, active: t.id === runtime.activeId, spin: taskActive(t),
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
      const [look, sub] = taskLook(t);
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
      if (chip === chatModel && activeThread()) { activeThread().model = opt.dataset.model; save(); }
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
    if (!search.hidden) { closeSearch(); return; }
    if (plusCtx) { const b = plusCtx.btn; closePlusMenu(); b.focus(); return; }
    if (activeChip) { const c = activeChip; closeModelMenu(); c.focus(); return; }
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
     Старт
     ===================================================================== */
  renderSidebar();
  if (location.protocol === 'file:' && !isDirect()) {
    setTimeout(() => toast('Чат работает через сервер: node server.js → http://localhost:3000'), 800);
  }
})();
