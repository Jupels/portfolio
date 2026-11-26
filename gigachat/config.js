// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'TjU/wHoyJXOLT26MuGxDfQ==',
    iv: 'lIspD8q2Vuxr0hGx',
    iterations: 250000,
    data: 'NiUtfcHnN+7J9R9vEIpX8PTMnVmrokwwPFqTtp+vk4MjRZN0ZHkBHILy/CddDqYsvvtgLK7y38ynyzMamyh+DFfGnNO6t8maHPwlFiVflLauxIz2KuRoE0Q=',
  },
};
