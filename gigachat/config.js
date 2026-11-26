// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'jYsqcqCeqKQM8tVaAj4PeQ==',
    iv: 'cWIZwa6ckjRIQ2NI',
    iterations: 250000,
    data: 'SiAT5gPAtuVq35KPMO01Z03BZeaYLb68FQiYl7dU+NyfPfcTUNyx1mkj779jx3qz6R1uATAC+g0DudUobWtHmaHlqRApTL+U2tYFzrkZmvL2z77WiKfXswo=',
  },
};
