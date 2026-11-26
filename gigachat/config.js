// Настройки прототипа.
// Ключ OpenRouter зашифрован паролем страницы (AES-GCM + PBKDF2) — без пароля его не прочитать.
// Пароль вводится на экране входа и расшифровывает ключ прямо в браузере.
window.GIGA_CONFIG = {
  model: 'deepseek/deepseek-v4.1-flash',
  encryptedKey: {
    salt: 'A9925wtCPWiF0+qwyALE4w==',
    iv: '9CtOp8nQfj7tNoMy',
    iterations: 250000,
    data: 'JB9zL4ywRmwb//v4p8YB883emZtHcd3G/xcfKHVF0HYu4JJ7PzP2nicvuQ16mrw/wTMPyZNlXpWleF/PjWpb9290Vk89BoJn6ydHbVRNpuKaqR1zRL3Q5hg=',
  },
};
