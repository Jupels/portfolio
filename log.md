# Лог изменений

## [2026-02-02] session-1738454400

### Базовая вёрстка главной страницы

- Создана структура проекта (index.html, css/styles.css, js/main.js)
- Настроены CSS переменные для light/dark тем
- Подключён шрифт Inter через Google Fonts
- Сверстан Header с адаптивностью (скрыто на мобилках, центрированный логотип)
- Сверстан Hero section: заголовок, кнопка Telegram, опыт, лента логотипов
- Сверстаны карточки кейсов (4 шт) с плашками Coming Soon
- Сверстан Footer с мобильным меню
- Реализована смена языка RU/EN без перезагрузки (JSON + localStorage)
- Подготовлена система тем (CSS переменные для dark mode)

### Детали

- Coming Soon плашки: SVG, 60px на мобилках, 80px на 640px+
- Адаптивные переносы строк `.br-tablet` (display:none → display:inline на 640px+)
- Смена языка сохраняет HTML-разметку при начальной загрузке (не перезаписывает дефолтный язык)

### Файлы

- `index.html` — разметка главной страницы
- `css/styles.css` — все стили + CSS переменные
- `js/main.js` — смена языка, подготовка тем
- `icons/Coming_soon.svg` — плашка Coming Soon
- `data/ru.json`, `data/en.json` — переводы

---

## [2026-02-02] session-1738454400 (продолжение)

### Исправления и доработки

- Исправлена смена языка: `textContent` → `innerHTML` для сохранения HTML-разметки
- Добавлены `<br class="br-tablet">` в JSON переводы (ru.json, en.json)
- Убраны padding у логотипов компаний (`.hero__logo`)
- Добавлены реальные ссылки в навигацию:
  - LinkedIn: linkedin.com/in/alexlygin/
  - Dribbble: dribbble.com/jupel
  - Блог (Instagram): instagram.com/sasha_lygin
  - ТГК: t.me/sasha_lygin
  - Почта: lyginmail@gmail.com
  - Кнопка "Написать в тг": t.me/jupel
