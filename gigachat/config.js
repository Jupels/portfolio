// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'NecpdEYqU1opHsyjEXyAOg==',
    iv: 'CPcBmkHxg8/DvkGw',
    iterations: 250000,
    data: 'o7PDsudGagGHGTDpTj5srbYBME3Jj+U3B4/kXbrEGArqUgVQz9QZTBPuVvLlSkdxIxypOZwQxJRV/QKzjL6xXDt46i0UMAoqOVUUiw0dAGiFOALQXZY/Syc=',
  },
};
