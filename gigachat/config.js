// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'auFmS7HNcK7kmxsda5OK3w==',
    iv: 'gx3KEbiU1DNNu/t8',
    iterations: 250000,
    data: 'iR0a5J5H0OrqPkc2S8v6QDrxVzEjibgXFDDCepFsWNTC8FI5gRsbU89NsWepPpsvywnIP1F+IzJuaRTSGcfWdfZampcRJWs9NrIbFNtvSTUjlwmgkOtUhi8=',
  },
};
