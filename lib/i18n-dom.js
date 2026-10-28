// Заполнение статичных строк страниц (popup, welcome) из _locales.
// В разметке: data-i18n (текст), data-i18n-title (подсказка),
// data-i18n-placeholder (плейсхолдер поля ввода).

export function applyI18n(root = document) {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = chrome.i18n.getMessage(el.getAttribute('data-i18n-title'));
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    el.placeholder = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
  }
}
