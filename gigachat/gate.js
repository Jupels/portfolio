// Экран пароля. Ключ OpenRouter хранится в config.js зашифрованным (AES-GCM, ключ из пароля
// через PBKDF2) — без пароля его не достать ни из кода страницы, ни из репозитория.
// Верный пароль расшифровывает ключ и открывает прототип.
// По ссылке-приглашению в общий чат (#join=…) пароль не нужен: страницу открывает
// экран входа гостя в app.js, когда создатель чата принял подключение.
(() => {
  'use strict';
  const CFG = window.GIGA_CONFIG || (window.GIGA_CONFIG = {});
  const enc = CFG.encryptedKey;
  const root = document.documentElement;
  const join = /^#join=[a-z0-9]{6,32}\.[a-z0-9]{6,32}$/.test(location.hash);
  if (join) root.classList.add('is-locked');
  if (!enc) {
    window.GIGA_GATE = { ensure: async () => true };
    return;
  }

  const PASS_KEY = 'giga.pass';
  const gate = document.getElementById('gate');
  const form = document.getElementById('gateForm');
  const field = document.getElementById('gatePass');
  const remember = document.getElementById('gateRemember');
  const error = document.getElementById('gateError');
  const back = document.getElementById('gateBack');
  let waiters = [];

  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decrypt(password) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(enc.salt), iterations: enc.iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(enc.iv) }, key, bytes(enc.data));
    return new TextDecoder().decode(plain);
  }

  function hideGate() {
    if (gate.hidden) return;
    gate.classList.add('is-leaving');
    setTimeout(() => { gate.hidden = true; gate.classList.remove('is-leaving', 'is-modal'); }, 400);
  }
  function settle(ok) {
    const list = waiters;
    waiters = [];
    list.forEach(fn => fn(ok));
  }

  async function unlock(password, keep, quiet) {
    try { CFG.openrouterKey = await decrypt(password); } catch { return false; }
    if (keep) { try { localStorage.setItem(PASS_KEY, password); } catch {} }
    if (!quiet) {
      if (!join) root.classList.remove('is-locked');
      hideGate();
    }
    settle(true);
    return true;
  }

  function showForm() {
    gate.hidden = false;
    gate.classList.remove('is-checking', 'is-leaving');
    setTimeout(() => field.focus(), 50);
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const password = field.value;
    if (!password) return;
    form.classList.add('is-busy');
    error.textContent = '';
    const ok = await unlock(password, remember.checked);
    form.classList.remove('is-busy');
    if (!ok) {
      error.textContent = 'Неверный пароль';
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
      field.select();
    }
  });
  back.addEventListener('click', () => { hideGate(); settle(false); });

  // Для гостя общего чата: свой чат требует пароля — показываем экран поверх переписки.
  window.GIGA_GATE = {
    ensure() {
      if (CFG.openrouterKey) return Promise.resolve(true);
      return new Promise(resolve => {
        waiters.push(resolve);
        form.querySelector('p').textContent = 'Чтобы начать свой чат, введите пароль от прототипа';
        gate.classList.add('is-modal');
        back.hidden = false;
        showForm();
      });
    },
  };

  // Пароль, запомненный на этом устройстве, — пробуем молча
  let saved = null;
  try { saved = localStorage.getItem(PASS_KEY); } catch {}

  if (join) {
    // гостевой вход ведёт app.js; запомненный пароль (если это сам создатель) расшифруем тихо
    if (saved) unlock(saved, false, true);
    return;
  }

  root.classList.add('is-locked');
  gate.hidden = false;
  if (saved) {
    gate.classList.add('is-checking');
    unlock(saved, false).then(ok => {
      if (ok) return;
      try { localStorage.removeItem(PASS_KEY); } catch {}
      showForm();
    });
  } else {
    showForm();
  }
})();
