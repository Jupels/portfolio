// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'LI7AidNy6JeCOUcL7ZgHUA==',
    iv: 'ynq+QyAUf2VZT3B2',
    iterations: 250000,
    data: 'IiaC++NnM6AVcat35D2dGI7uuBNJVR7G1NQWFpREGIQ/E5D25QogGHpRTsp2oOU0eQvKqUWwaARIf5VqUOdYGRVwoLJVNocOYnTgbY8MrvvCdVXxokO2yh4=',
  },
};
