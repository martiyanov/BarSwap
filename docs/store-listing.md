# Публикация в Chrome Web Store — шпаргалка

Всё готово к загрузке. Ниже — готовые тексты на двух языках (копировать/вставить) и шаги.

## Пошагово

1. Откройте [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) под вашим Google-аккаунтом.
2. При первом входе: подтвердите согласие с условиями и заплатите **разовый взнос $5** (картой; действует на все будущие расширения).
3. Кнопка **«+ Новый элемент»** → загрузите файл **`bookmark-profiles-webstore.zip`** (лежит рядом с папкой проекта).
4. Заполните поля: сначала русский листинг (раздел ниже), затем добавьте английский — в списке полей найдите выбор языка и кнопку добавления языка, вставьте тексты из раздела «English listing».
5. Внизу формы нажмите **«Отправить на проверку»**. Проверка обычно занимает от нескольких часов до нескольких дней.
6. После одобрения установите расширение из магазина **на обоих компьютерах** (версия из магазина синхронизируется с аккаунтом сама) и удалите «распакованную», если ставили её.

## Листинг, русский (основной язык)

- **Название:** Профили закладок — работа и дом
- **Краткое описание (до 132 знаков):**
  Несколько наборов закладок на панели: на работе — одни, дома — другие, при одной учётной записи. Переключение в один клик.
- **Подробное описание:**

  ```
  Свои закладки на работе, свои — дома, при одном аккаунте Google.

  Как работает:
  • Профили (наборы закладок) синхронизируются с вашим аккаунтом и доступны на всех компьютерах.
  • Какой профиль активен — запоминается на каждом компьютере отдельно: на работе горит «Работа», дома — «Дом».
  • При переключении текущая панель автоматически сохраняется в свой профиль — правки не теряются.

  Возможности:
  • Переключение панели закладок в один клик.
  • Переименование и удаление профилей.
  • Сохранение/восстановление панели, если вы правили её вручную.
  • Экспорт и импорт профилей в JSON для резервных копий.
  • Первая буква активного профиля — на бейдже иконки.
  • Интерфейс на русском и английском.
  • Без аналитики, рекламы и доступа к посещаемым страницам.

  ВАЖНО после установки: выключите синхронизацию закладок Chrome
  (Настройки → «Вы и Google» → «Синхронизация и сервисы Google» → «Управление тем, что вы синхронизируете» → тумблер «Закладки» — выкл).
  Панель закладок — одна синхронизируемая папка, и пока тумблер включён, Chrome сам перетаскивает её содержимое между компьютерами.
  Остальные данные (пароли, история и т.д.) продолжат синхронизироваться как раньше; профили расширения синхронизируются отдельно.

  Открытый исходный код — ссылка на сайт расширения.
  ```

## English listing (добавить вторым языком в форме)

- **Name:** Bookmark Profiles — work & home
- **Summary (≤132 chars):**
  Several bookmark bar sets under one Google account: work links at the office, personal ones at home. One-click switching.
- **Detailed description:**

  ```
  Your work bookmarks at the office, your personal ones at home — under a single Google account.

  How it works:
  • Profiles (bookmark sets) sync with your account and are available on every computer.
  • Which profile is active is remembered per computer: “Work” at the office, “Home” at home.
  • On switching, the current bar is automatically saved back to its own profile — nothing is lost.

  Features:
  • One-click switching of the bookmarks bar.
  • Rename and delete profiles.
  • Save/restore the bar if you edited it manually.
  • JSON export/import for backups.
  • The first letter of the active profile shows on the icon badge.
  • UI in English and Russian.
  • No analytics, no ads, no access to the pages you visit.

  IMPORTANT after install: turn off Chrome's bookmark sync
  (Settings → “You and Google” → “Sync and Google services” → “Manage what you sync” → toggle “Bookmarks” off).
  The bookmarks bar is a single synced folder; while the toggle is on, Chrome itself drags its contents between your computers.
  Everything else (passwords, history, …) keeps syncing as before; the extension's profiles sync separately.

  Open source — see the extension website link.
  ```

## Общие поля

- **Категория:** Инструменты для повышения продуктивности / Productivity
- **Скриншоты (1280×800):** набор один на все языки — рекомендую английский:
  `docs/screenshots/screenshot-en-1.png`, `docs/screenshots/screenshot-en-2.png`.
  Русская пара лежит рядом (`screenshot-1.png`, `screenshot-2.png`) — если хотите, загрузите её вместо английской.
- **Иконка 128×128:** `icons/icon128.png`
- **Ссылка на сайт:** URL репозитория на GitHub (после публикации репозитория)
- **Промо-изображения:** необязательны (маленькая плитка 440×280 может увеличить показы — можно сгенерировать позже)

## Вкладка «Конфиденциальность»

- **Обоснование разрешений:**
  - `bookmarks` — единственное назначение расширения: чтение панели закладок и замена её содержимым выбранного профиля при переключении. / The extension's single purpose: read the bookmarks bar and replace it with the selected profile's contents on switch.
  - `storage` — сохранение профилей закладок в хранилище расширения (`chrome.storage.sync` — синхронизация через аккаунт Google) и метки активного профиля на устройстве. / Storing bookmark profiles in extension storage (`chrome.storage.sync`, synced via the Google account) and the per-device active profile flag.
- **Использование данных** (галочки «собираются/не собираются»):
  - Данные не собираются. Не продаются. Не передаются третьим лицам. Не используются для рекламы/кредитования/идентификации.
  - Расширение не совершает сетевых запросов; код открыт.
- **Политика конфиденциальности (URL):** ссылка на `PRIVACY.md` в репозитории.

## Вкладка «Распространение»

- **Видимость:** Опубликовано — все пользователи (или «Непубликовано», пока тестируете сами).
- **Регионы:** все страны.
- **Специальные категории:** не применимо.

## Что где лежит

- Upload zip: `bookmark-profiles-webstore.zip` (manifest.json в корне архива, только рабочие файлы + `_locales`)
- Скриншоты EN: `docs/screenshots/screenshot-en-*.png`; RU: `docs/screenshots/screenshot-[12].png`
- Иконка: `icons/icon128.png`
