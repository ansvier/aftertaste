'use strict';
// The website never reads library data or account credentials.
const languagePreference = {
  get() { try { return localStorage.getItem('aftertaste-language'); } catch { return null; } },
  set(value) { try { localStorage.setItem('aftertaste-language', value); } catch {} }
};
async function setLanguage(value) {
  await window.AftertasteI18n.load(value); window.AftertasteI18n.apply();
  document.title = window.AftertasteI18n.t('site.title');
  document.querySelector('meta[name="description"]').content = window.AftertasteI18n.t('site.description');
  languagePreference.set(window.AftertasteI18n.language);
}
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => { setLanguage(button.dataset.language).catch(() => {}); }));
document.querySelectorAll('a[href^="https://github.com/"]').forEach(link => { link.rel = 'noopener noreferrer'; });
const preferred = languagePreference.get() || navigator.language.split('-')[0];
setLanguage(['en', 'ru', 'fr'].includes(preferred) ? preferred : 'en').catch(() => {});
