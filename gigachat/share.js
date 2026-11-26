// Общий чат: транспорт между браузерами через сервер-посредник (relay/ на fly.io).
// Создатель и гости подключаются к посреднику по WebSocket — обычному HTTPS-порту 443,
// поэтому связь проходит через VPN, корпоративные и мобильные сети. Посредник только
// пересылает сообщения и ничего не хранит. Логики чата здесь нет — её ведёт app.js.
(() => {
  'use strict';
  const CFG = window.GIGA_CONFIG || {};
  const RELAY = (() => {
    try { const dev = localStorage.getItem('giga.relay'); if (dev) return dev; } catch {}
    return CFG.relay || 'wss://gigachat-relay.fly.dev';
  })();
  const HOST_KEY = 'giga.hostId';
  const SECRET_KEY = 'giga.hostSecret';
  const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
  const KEEPALIVE_MS = 15000;   // пинг посредника
  const DEAD_MS = 45000;        // тишина дольше — соединение считаем оборванным
  const CONNECT_MS = 15000;     // посредник может просыпаться пару секунд

  const rid = (n = 12) => {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return [...a].map(b => ABC[b % 32]).join('');
  };
  const validId = s => typeof s === 'string' && /^[a-z0-9]{6,32}$/.test(s);
  function stored(key, len) {
    try {
      let v = localStorage.getItem(key);
      if (!v || !/^[a-z0-9]+$/.test(v) || v.length < len) { v = rid(len); localStorage.setItem(key, v); }
      return v;
    } catch { return rid(len); }
  }
  const hostId = () => stored(HOST_KEY, 12);

  // WebSocket к посреднику с пингом и детектором «тихого» обрыва.
  // При закрытии — «пока», чтобы посредник сразу освободил место (прокси держит сокет ещё ~10 с)
  const liveSockets = new Set();
  window.addEventListener('pagehide', () => { for (const s of liveSockets) s.close(); });
  function socket(query, onMsg, onClose) {
    const ws = new WebSocket(`${RELAY}/?${query}`);
    let last = Date.now(), timer = 0, closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      liveSockets.delete(api);
      onClose();
    };
    ws.onopen = () => {
      last = Date.now();
      timer = setInterval(() => {
        if (Date.now() - last > DEAD_MS) { try { ws.close(); } catch {} finish(); return; }
        if (ws.readyState === 1) ws.send('{"t":"_ping"}');
      }, KEEPALIVE_MS);
    };
    ws.onmessage = e => {
      last = Date.now();
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && m.t !== '_pong') onMsg(m);
    };
    ws.onclose = finish;
    ws.onerror = () => {};
    const api = {
      send(obj) {
        if (ws.readyState !== 1) return false;
        try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
      },
      close() {
        try { if (ws.readyState === 1) ws.send('{"t":"_bye"}'); ws.close(); } catch {}
        finish();
      },
    };
    liveSockets.add(api);
    return api;
  }

  // Соединение с одним гостем на стороне создателя: те же on/send/close, что у гостя
  function guestConn(c, sock) {
    const ev = {};
    let closed = false;
    const api = {
      peer: c,
      get open() { return !closed; },
      on(type, fn) { ev[type] = fn; return api; },
      send: obj => !closed && sock.send({ t: '_send', c, d: obj }),
      close() { if (closed) return; sock.send({ t: '_close', c }); api._gone(); },
      _data: d => { if (!closed) ev.data?.(d); },
      _gone() { if (closed) return; closed = true; ev.close?.(); },
    };
    return api;
  }

  // Создатель: один адрес на браузер, принимает гостей во все свои общие чаты.
  // state: connecting → online; reconnecting — пропала связь с посредником;
  // busy — этот адрес уже обслуживает другая вкладка с прототипом.
  function createHost({ onConnection, onState }) {
    const id = hostId();
    const secret = stored(SECRET_KEY, 24);
    const conns = new Map();
    let sock = null, stopped = false, tries = 0, timer = 0, busy = 0;
    const set = s => onState && onState(s);

    function start() {
      if (stopped) return;
      set(tries ? 'reconnecting' : 'connecting');
      let verdict = null;
      sock = socket(`role=host&id=${id}&secret=${secret}`, m => {
        switch (m.t) {
          case '_ready': tries = 0; busy = 0; set('online'); break;
          case '_busy': verdict = 'busy'; break;
          case '_taken': verdict = 'taken'; break;
          case '_replaced': verdict = 'replaced'; break;
          case '_open': {
            if (typeof m.c !== 'string') return;
            const conn = guestConn(m.c, sock);
            conns.set(m.c, conn);
            onConnection(conn);
            break;
          }
          case '_data': conns.get(m.c)?._data(m.d); break;
          case '_gone': conns.get(m.c)?._gone(); conns.delete(m.c); break;
        }
      }, () => {
        for (const c of conns.values()) c._gone();
        conns.clear();
        if (stopped) return;
        tries++;
        // чаты подхватила вкладка, открытая позже, — эта больше не переподключается
        if (verdict === 'replaced') { set('busy'); return; }
        if (verdict === 'busy' || verdict === 'taken') {
          // после перезагрузки посредник ещё пару секунд помнит прошлую вкладку
          busy++;
          set(busy > 3 ? 'busy' : 'connecting');
          timer = setTimeout(start, busy > 3 ? 15000 : 3000);
          return;
        }
        set('reconnecting');
        timer = setTimeout(start, Math.min(30000, 1500 * tries));
      });
    }
    start();
    return {
      id,
      stop() { stopped = true; clearTimeout(timer); sock?.close(); },
    };
  }

  // Гость: одно соединение с создателем через посредника. onFail(reason):
  // offline — создателя нет в сети, timeout — посредник не ответил, network — нет связи.
  function join(host, { onOpen, onData, onClose, onFail }) {
    let sock = null, stopped = false, timer = 0, open = false, gen = 0;
    function connect(attempt = 0) {
      if (stopped) return;
      const my = ++gen; // события прежней попытки дальше игнорируются
      clearTimeout(timer);
      const old = sock;
      sock = null;
      open = false;
      old?.close();
      let settled = false;
      const live = () => my === gen && !stopped;
      const fail = reason => {
        if (settled || !live()) return;
        settled = true;
        clearTimeout(timer);
        onFail && onFail(reason);
      };
      timer = setTimeout(() => { if (live()) { fail('timeout'); sock?.close(); } }, CONNECT_MS);
      const s = socket(`role=guest&host=${host}`, m => {
        if (!live()) return;
        if (m.t === '_open') { settled = true; open = true; clearTimeout(timer); onOpen && onOpen(); return; }
        if (m.t === '_offline') { fail('offline'); return; }
        if (m.t === '_ended') { s.close(); return; } // создатель ушёл или отключил гостя
        if (open) onData && onData(m);
      }, () => {
        if (!live()) return;
        const was = open;
        open = false;
        if (was) { onClose && onClose(); return; }
        if (settled) return;
        // соединение сорвалось до ответа посредника — пробуем ещё пару раз, прежде чем показать ошибку
        if (attempt < 2 && navigator.onLine !== false) {
          clearTimeout(timer);
          timer = setTimeout(() => connect(attempt + 1), 700 * (attempt + 1));
          return;
        }
        fail(navigator.onLine === false ? 'network' : 'timeout');
      });
      sock = s;
    }
    connect();
    return {
      send: obj => open && !!sock && sock.send(obj),
      get open() { return open; },
      retry: () => connect(0),
      stop() { stopped = true; clearTimeout(timer); sock?.close(); },
    };
  }

  // #join=<hostId>.<shareId>
  function parseLink(hash) {
    const m = /^#join=([a-z0-9]{6,32})\.([a-z0-9]{6,32})$/.exec(hash || '');
    return m ? { host: m[1], share: m[2] } : null;
  }
  const makeLink = (host, share) => `${location.origin === 'null' ? 'file://' : location.origin}${location.pathname}#join=${host}.${share}`;

  window.GigaShare = { available: typeof WebSocket === 'function', relay: RELAY, rid, validId, hostId, createHost, join, parseLink, makeLink };
})();
