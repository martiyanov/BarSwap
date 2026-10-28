# BarSwap (Chrome-расширение)

Репозиторий: <https://github.com/martiyanov/BarSwap>

Несколько наборов закладок на панели закладок Chrome — работа, дом, проекты,
клиенты, «презентационная» панель для демонстрации экрана — при **одной**
учётной записи Google.

- **Наборы (профили) хранятся в `chrome.storage.sync`** — синхронизируются вместе
  с аккаунтом и одинаковы на всех компьютерах.
- **Активный профиль хранится в `chrome.storage.local`** — на каждом компьютере
  свой: дома горит «Дом», на работе — «Работа», и они друг другу не мешают.
- При переключении расширение **сохраняет текущую панель в «её» профиль** и
  заменяет панель содержимым выбранного. Правки между переключениями не теряются.

## Установка

1. Откройте `chrome://extensions`, включите **«Режим разработчика»**.
2. Нажмите **«Загрузить распакованное расширение»** и выберите эту папку
   (`bookmark-profiles`).
3. Повторите на втором компьютере: расширения, установленные из папки, Chrome
   между машинами не синхронизирует — скопируйте папку туда, откуда удобно
   (Google Drive, флешка).

## Важно: выключите синхронизацию закладок Chrome

Панель закладок — единая папка, которую Chrome сам синхронизирует между всеми
компьютерами с вашим аккаунтом. Пока она включена, Chrome будет перетаскивать
содержимое панели между машинами и конфликтовать с расширением.

Выключите только этот тип данных: **Настройки → «Вы и Google» → «Синхронизация
и сервисы Google» → «Управление тем, что вы синхронизируете» → тумблер
«Закладки» — выкл.** Пароли, история, расширения и прочее продолжат
синхронизироваться. Профили расширения при этом тоже синхронизируются —
они живут в хранилище расширения, а не в закладках.

## Как пользоваться

1. Откройте панель расширения (иконка на панели инструментов; на бейдже —
   первая буква активного профиля).
2. Введите название («Работа», «Дом», …) → **«Создать»** — текущая панель
   сохранится как профиль.
3. Клик по профилю в списке — переключение. ✎ — переименовать, 🗑 — удалить
   (с подтверждением вторым кликом).
4. Если панель менялась вручную вне переключений, попап предложит
   «Сохранить панель в профиль» или «Восстановить профиль».
5. «Экспорт»/«Импорт» внизу попапа — резервные копии в JSON.

При первом запуске открывается страница-инструкция (`welcome.html`).

## Ограничения

- Суммарный объём профилей — до ~100 КБ (`chrome.storage.sync`); данные
  сжимаются (LZ), этого обычно хватает на полторы–две тысячи закладок во всех
  профилях суммарно. Занятый объём виден внизу попапа; при превышении лимита
  расширение сообщает об этом понятным текстом.
- Иконка бейджа показывает первую букву профиля.

## Разработка

```
manifest.json      — Manifest V3 (имя и описание локализованы)
_locales/          — словари en/ru (chrome.i18n)
background.js      — service worker: вся логика (переключение, профили, бейдж)
lib/store.js       — профили в chrome.storage.sync (чанками по ~3.5 КБ)
lib/bookmarks.js   — чтение/замена панели через chrome.bookmarks
lib/lz-string.js   — LZ-сжатие профилей (lz-string 1.5.0, лицензия WTFPL)
lib/i18n-dom.js    — заполнение data-i18n строк на статичных страницах
popup/             — интерфейс (только отображение, логика через сообщения)
welcome.html       — страница-инструкция при установке (en/ru)
tools/gen_icons.py — генератор иконок (python3, без зависимостей)
tools/test.mjs     — тесты логики с моками chrome.* (node tools/test.mjs)
tools/demo.html    — демо попапа для скриншотов (?state=…&lang=en|ru)
```

Интерфейс — на русском и английском: язык подстраивается под язык браузера
(`chrome.i18n`, словари в `_locales/`).

Тесты: `node tools/test.mjs` — покрывают чанкование хранилища, замену панели
(вложенность и порядок), изоляцию профилей и сценарий «работа/дом» на двух
машинах.

`tools/demo.html?state=normal|diff|empty` — демо-страница попапа с моком
`chrome.*` (используется для скриншотов листинга, см. `docs/`).

## English

**BarSwap** — a Chrome extension (Manifest V3) that keeps several
bookmark-bar sets under a single Google account: e.g. work links at the office,
personal links at home.

- Profiles are stored in `chrome.storage.sync` — they sync with your account and
  are available on every machine.
- The **active profile is stored per device** (`chrome.storage.local`), so each
  computer keeps its own bar.
- Switching saves the current bar into its profile first, then replaces the bar
  with the selected set — nothing is lost.

Setup: load unpacked via `chrome://extensions`, then turn **off** Chrome's
"Bookmarks" sync datatype (Settings → You and Google → Sync → Manage what you
sync). The bookmarks bar is a single synced folder; while that toggle is on,
Chrome itself fights the extension by dragging bar contents between machines.
Everything else keeps syncing; profiles sync through extension storage.

MIT License — see [LICENSE](LICENSE). Privacy — see [PRIVACY.md](PRIVACY.md). The UI is localized via `chrome.i18n` (English and Russian).
