'use strict';
window.AftertasteI18n = {
  language: 'en', messages: {},
  async load(language) {
    this.language = ['en', 'ru', 'fr'].includes(language) ? language : 'en';
    const response = await fetch(`locales/${this.language}.json`);
    if (!response.ok) throw new Error('Language files could not be loaded.');
    this.messages = await response.json(); document.documentElement.lang = this.language;
  },
  t(key, values = {}) { return String(this.messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`)); },
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });
    for (const attribute of ['placeholder', 'aria-label', 'title']) document.querySelectorAll(`[data-i18n-${attribute}]`).forEach(el => { el.setAttribute(attribute, this.t(el.getAttribute(`data-i18n-${attribute}`))); });
    document.querySelectorAll('[data-language]').forEach(el => { el.setAttribute('aria-pressed', String(el.dataset.language === this.language)); });
  }
};
