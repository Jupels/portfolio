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

---

## [2026-02-02] session-1738519200

### GitHub репозиторий и хостинг

- Создан .gitignore (macOS, IDE, CLAUDE.md, project.mdc)
- Инициализирован git репозиторий
- Создан репозиторий Jupels/portfolio на GitHub
- Настроен GitHub Pages для хостинга

### Исправления мобильной версии (по макету Figma 360px)

- Case-карточки: padding 20→12px, border-radius 20→12px, gap 20→30px, font 16→14px
- Кнопка-стрелка: высота 40→36px на мобилке
- Header: высота 64→56px, padding-x 20→12px
- Hero title: font 24→22px, line-height 28→30px, letter-spacing -0.5→-0.9px, max-width 320px
- Hero experience: font 16→14px, max-width 328px, скрыты <br> на мобилке
- Hero logos: grid 3x3, height 40px, выравнивание по центру
- Footer: font 16→14px
- Cases секция: padding 0 12px

### Мобильное меню

- Добавлен overlay меню (оранжевый фон #ff5900, скругление 20px)
- Ссылки: CV, LinkedIn, Dribbble, Блог, ТГК, Почта, RU
- Шрифт 20px Semi Bold, hover → белый цвет
- Кнопка закрытия (Close_LG.svg 16x16)
- Логотип LGN по центру внизу (lgn.svg)
- JS: открытие/закрытие меню, блокировка скролла

### Файлы

- `.gitignore` — правила игнорирования
- `icons/Close_LG.svg` — иконка закрытия
- `icons/lgn.svg` — логотип LGN

---

## [2026-02-09] session-1770632796

### Виджеты с GIF-анимациями

- Добавлены GIF-анимации в виджеты на главной странице
- Заменены плейсхолдеры на img/gif/gif1.gif и img/gif/gif2.gif
- Обновлены CSS стили: .widget-card__placeholder → .widget-card__gif

---

## [2026-02-09] session-1770638163

### Кейс: Blum.io Trading Hub

- Создана страница кейса `case_hub.html`
- Добавлены стили для страницы кейса в `css/styles.css`
- Добавлены переводы на русском и английском в `data/ru.json`, `data/en.json`
- Реализована адаптивность для 4 брейкпоинтов: 360px, 640px, 1080px, 1440px
- Реализован раскрывающийся блок "Результаты" (toggle)
- Добавлена ссылка на кейс с главной страницы

### Секции кейса

- Intro: теги, заголовок
- Team: аватары и роли команды (C-level, разработчики, дизайн)
- Role: моя роль в проекте
- Cover: задача и результаты + главное изображение
- Problem: проблема с Telegram-ботом
- Rivals: анализ конкурентов
- Intersection: крупная цитата
- MVP: дизайн MVP
- Design System: задача для дизайнеров
- Insight: инсайт о трейдинге (бордер dashed)
- Quickbuy: фича быстрой покупки
- Token pages: анализ и наш дизайн
- Final result: финальный экран
- Buy/Wallet/Waitlist: дополнительные экраны
- Results: блок с метриками + раскрывающаяся детализация

### Файлы

- `case_hub.html` — страница кейса
- `css/styles.css` — стили (секция Case Page)
- `data/ru.json` — русские переводы (секция caseHub)
- `data/en.json` — английские переводы (секция caseHub)
- `img/case_hub/` — изображения для кейса (12 файлов)
- `img/case_hub/team/` — фото команды (7 файлов)

---

## [2026-02-09] session-1770638163 (продолжение)

### Рефакторинг структуры JSON переводов

- Реорганизована структура JSON файлов переводов (ru.json, en.json)
- Новая структура: `links`, `header`, `footer`, `index`, `caseHub`
- Обновлены пути data-i18n в index.html и case_hub.html:
  - `nav.*` → `header.*`
  - `hero.*` → `index.hero.*`
  - `cases.*` → `index.cases.*`
  - `widgets.*` → `index.widgets.*`
- Исправлены пути во всех компонентах: header, footer, mobile menu
