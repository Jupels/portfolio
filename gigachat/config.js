// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'i1RaClVh0GjGE0MsKLTeNQ==',
    iv: 'AKi0tlNf99rt7w3v',
    iterations: 250000,
    data: '65HKSAjoVfA1Mlp32VWZuxmX0a27vLXyqM8JTUVvzG0wzXcB8IIbAUv7em7+92Pt/O0TjihZUDFI2TBIXXwIRhwh9v0V1mS8vKdXcXFyHd88lYEb67lRkV8=',
  },
};
