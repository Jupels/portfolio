// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'j1v+9RUJMFslI0jn2uAq4g==',
    iv: 'rLgUR6P7qAvv0nfg',
    iterations: 250000,
    data: 'vFi22s8m8dCzwFE4Zcb4U9qzfNi4moQVFrWAwcMcOdlCF3ceVo9E2aWBN+Jx6dNW+0h0B1pYIpjxmMxhEBoCQr1YvLprUPQKmpU2AtfZAlP6tdam41z+QCQ=',
  },
};
