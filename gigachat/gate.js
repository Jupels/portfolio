// Экран пароля. Ключ OpenRouter хранится в config.js зашифрованным (AES-GCM, ключ из пароля
// через PBKDF2) — без пароля его не достать ни из кода страницы, ни из репозитория.
// Верный пароль расшифровывает ключ и открывает прототип.
(() => {
  'use strict';
  const CFG = window.GIGA_CONFIG || (window.GIGA_CONFIG = {});
  const enc = CFG.encryptedKey;
  if (!enc) return;

  const PASS_KEY = 'giga.pass';
  const root = document.documentElement;
  const gate = document.getElementById('gate');
  const form = document.getElementById('gateForm');
  const field = document.getElementById('gatePass');
  const remember = document.getElementById('gateRemember');
  const error = document.getElementById('gateError');

  root.classList.add('is-locked');
  gate.hidden = false;

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

  async function unlock(password, keep) {
    try { CFG.openrouterKey = await decrypt(password); } catch { return false; }
    if (keep) { try { localStorage.setItem(PASS_KEY, password); } catch {} }
    root.classList.remove('is-locked');
    gate.classList.add('is-leaving');
    setTimeout(() => { gate.hidden = true; }, 400);
    return true;
  }

  function showForm() {
    gate.classList.remove('is-checking');
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

  // Пароль, запомненный на этом устройстве, — пробуем молча
  let saved = null;
  try { saved = localStorage.getItem(PASS_KEY); } catch {}
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
