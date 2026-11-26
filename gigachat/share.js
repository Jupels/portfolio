// Общий чат: транспорт между браузерами (WebRTC через PeerJS).
// Публичный сервер PeerJS только «знакомит» браузеры, дальше они общаются напрямую,
// сообщения шифруются. Логики чата здесь нет — её ведёт app.js.
(() => {
  'use strict';
  const PREFIX = 'giga-proto-';
  const HOST_KEY = 'giga.hostId';
  const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
  const PING_MS = 4000;
  const DEAD_MS = 14000;
  const CONNECT_MS = 12000;

  const rid = (n = 12) => {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return [...a].map(b => ABC[b % 32]).join('');
  };
  const validId = s => typeof s === 'string' && /^[a-z0-9]{6,32}$/.test(s);

  function hostId() {
    try {
      let id = localStorage.getItem(HOST_KEY);
      if (!validId(id)) { id = rid(12); localStorage.setItem(HOST_KEY, id); }
      return id;
    } catch { return rid(12); }
  }

  // Обёртка над DataConnection: JSON-сообщения, пинг и детектор «тихого» обрыва.
  function wrap(conn) {
    const ev = {};
    let closed = false, last = Date.now(), timer = 0;
    const api = {
      peer: conn.peer,
      get open() { return conn.open && !closed; },
      on(type, fn) { ev[type] = fn; return api; },
      send(obj) {
        if (!conn.open || closed) return false;
        try { conn.send(obj); return true; } catch { return false; }
      },
      close() { finish(); try { conn.close(); } catch {} },
    };
    function finish() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      ev.close?.();
    }
    const start = () => {
      last = Date.now();
      timer = setInterval(() => {
        if (Date.now() - last > DEAD_MS) { api.close(); return; }
        api.send({ t: 'ping' });
      }, PING_MS);
      ev.open?.();
    };
    if (conn.open) setTimeout(start, 0); else conn.on('open', start);
    conn.on('data', d => {
      last = Date.now();
      if (d && (d.t === 'ping' || d.t === 'pong')) { if (d.t === 'ping') api.send({ t: 'pong' }); return; }
      ev.data?.(d);
    });
    conn.on('close', finish);
    conn.on('error', finish);
    return api;
  }

  // Хост: один постоянный peer на браузер, принимает гостей во все общие чаты.
  // state: connecting → online; reconnecting — пропала связь с сервером знакомств;
  // busy — этот адрес уже занят (обычно другой вкладкой с прототипом).
  function createHost({ onConnection, onState }) {
    const id = hostId();
    let peer = null, stopped = false, tries = 0, timer = 0;
    const set = s => onState && onState(s);
    const later = (fn, ms) => { clearTimeout(timer); timer = setTimeout(fn, ms); };

    function start() {
      if (stopped) return;
      set(tries ? 'reconnecting' : 'connecting');
      try { peer?.destroy(); } catch {}
      peer = new Peer(PREFIX + id, { debug: 0 });
      peer.on('open', () => { tries = 0; set('online'); });
      peer.on('connection', conn => onConnection(wrap(conn)));
      peer.on('disconnected', () => {
        if (stopped || peer.destroyed) return;
        set('reconnecting');
        later(() => { try { peer.reconnect(); } catch { start(); } }, 2000);
      });
      peer.on('error', err => {
        if (stopped) return;
        const type = err && err.type;
        if (type === 'peer-unavailable') return; // к хосту не относится
        tries++;
        if (type === 'unavailable-id') {
          // после перезагрузки сервер ещё пару секунд помнит прошлую вкладку
          set(tries > 3 ? 'busy' : 'connecting');
          later(start, tries > 3 ? 15000 : 4000);
          return;
        }
        set('reconnecting');
        later(start, Math.min(30000, 2000 * tries));
      });
    }
    start();
    return {
      id,
      stop() { stopped = true; clearTimeout(timer); try { peer?.destroy(); } catch {} },
    };
  }

  // Гость: случайный peer, одно соединение с хостом. onFail(reason):
  // offline — хоста нет в сети, timeout — не удалось соединиться, network — нет связи.
  function join(host, { onOpen, onData, onClose, onFail }) {
    let peer = null, conn = null, stopped = false, timer = 0, wasOpen = false;
    const fail = reason => {
      clearTimeout(timer);
      if (stopped) return;
      onFail && onFail(reason);
    };
    function connect() {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(() => { try { conn?.close(); } catch {} fail('timeout'); }, CONNECT_MS);
      if (!peer || peer.destroyed) {
        peer = new Peer({ debug: 0 });
        peer.on('open', dial);
        peer.on('error', err => {
          const type = err && err.type;
          if (type === 'peer-unavailable') fail('offline');
          else if (!wasOpen || !conn?.open) fail(type === 'browser-incompatible' ? 'browser' : 'network');
        });
        peer.on('disconnected', () => { if (!stopped && !peer.destroyed) { try { peer.reconnect(); } catch {} } });
      } else if (peer.disconnected) {
        try { peer.reconnect(); } catch {}
        peer.once('open', dial);
      } else {
        dial();
      }
    }
    function dial() {
      if (stopped) return;
      const raw = peer.connect(PREFIX + host, { reliable: true, serialization: 'json' });
      conn = wrap(raw)
        .on('open', () => { clearTimeout(timer); wasOpen = true; onOpen && onOpen(); })
        .on('data', d => onData && onData(d))
        .on('close', () => { if (!stopped && wasOpen) onClose && onClose(); });
    }
    connect();
    return {
      send: obj => !!conn && conn.send(obj),
      get open() { return !!conn && conn.open; },
      retry() { try { conn?.close(); } catch {} connect(); },
      stop() { stopped = true; clearTimeout(timer); try { conn?.close(); } catch {} try { peer?.destroy(); } catch {} },
    };
  }

  // #join=<hostId>.<shareId>
  function parseLink(hash) {
    const m = /^#join=([a-z0-9]{6,32})\.([a-z0-9]{6,32})$/.exec(hash || '');
    return m ? { host: m[1], share: m[2] } : null;
  }
  const makeLink = (host, share) => `${location.origin === 'null' ? 'file://' : location.origin}${location.pathname}#join=${host}.${share}`;

  window.GigaShare = { available: typeof window.Peer === 'function', rid, validId, hostId, createHost, join, parseLink, makeLink };
})();
