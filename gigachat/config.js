// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'mvEkqSKBhxhXrkc0robIlA==',
    iv: 'WG+n/Eu/PV415Nos',
    iterations: 250000,
    data: 'fm8fqY2ctxZAL2P6imHe9L8r8YGvQloEhQBp9vc6ZoT0AJyONnud/eslCMHJETk6aqNIXKhLBFKMKqtTPb86oHCOoo+zHW2NwE7MKVSNmJqseZRsYDk3iiU=',
  },
};
