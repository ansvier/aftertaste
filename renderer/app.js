'use strict';
const $ = s => document.querySelector(s), I = window.AftertasteI18n, L = window.LibraryTools;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (key, values) => I.t(key, values), tx = (key, values) => esc(t(key, values));
const date = value => new Date(value).toLocaleString(I.language, { dateStyle: 'medium', timeStyle: 'short' });
const safeURL = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const types = ['book', 'manga', 'game', 'video', 'film', 'article', 'podcast'];
const statuses = ['want', 'active', 'finished', 'paused'];
let current, section = 'library', filter = 'all', focused = '', find = '', busy = false, progress = '', recommendationError = '';
let noteLimit = 30;
let searchResults = [], pendingItems = [], recorder, recordingStream, audioBlob, audioURL, recordingTimer, toastTimer, modalCleanup;
async function api(action, payload) {
  if (!window.aftertaste) throw new Error('Open Aftertaste as a desktop app to use your library.');
  const result = await window.aftertaste.invoke(action, payload);
  if (!result.ok) throw new Error(result.error || 'This action could not be completed.');
  return result.data;
}
function translatedError(message) {
  if (I.language === 'en') return message;
  const cases = [
    [/catalog.*unavailable/i, 'error.catalogUnavailable'],
    [/This note changed|note no longer exists/i, 'error.noteChanged'], [/usage limit|rate.limit|429/i, 'error.usage'], [/sign.in|session|401|permission.*plan|plan usage|403/i, 'error.signin'],
    [/context changed|library changed/i, 'error.changed'], [/cancelled/i, 'error.cancelled'], [/already in your library/i, 'error.duplicate'],
    [/title first/i, 'error.title'], [/Leave a thought/i, 'error.note'], [/HTTPS/i, 'error.link'], [/image up to|audio up to/i, 'error.asset'],
    [/Import up to/i, 'error.tooMany'], [/at least one/i, 'error.select'], [/context is full/i, 'error.contextFull'],
    [/Import a few|save a story.*thought/i, 'error.emptyContext'], [/catalogs did not return/i, 'error.retrieval'],
    [/file|backup|JSON|\.txt|conversations.json/i, 'error.import'], [/permissions|local action/i, 'error.permissions']
  ];
  return t(cases.find(([re]) => re.test(message))?.[1] || 'error.generic');
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000); }
function error(message) { const el = $('#dialog-error'); if (el) el.textContent = message; else toast(message); }
function fail(e) { error(translatedError(e.message)); }
function asset(name) { return /^[a-f0-9-]{36}\.(png|jpg|webp|webm|ogg|mp3|m4a|wav)$/.test(name || '') ? `aftertaste://app/local-assets/${name}` : ''; }
function cover(item) {
  const remote = safeURL(item.cover);
  const preview = L.catalogCoverURL(remote) ? `aftertaste://app/catalog-cover?${new URLSearchParams({ url: remote, source: safeURL(item.sourceUrl) })}` : remote;
  const src = asset(item.coverAsset) || preview || L.videoThumbnail(item);
  const video = item.type === 'video';
  return `<span class="cover${video ? ' video-cover' : ''}"><span class="cover-fallback" aria-hidden="true"><small>${tx(`type.${item.type || 'book'}`)}</small><strong>${esc(item.title)}</strong><span>✦</span></span>${src ? `<img class="cover-image" src="${esc(src)}" alt="${tx('library.cover', { title: item.title })}" loading="lazy" referrerpolicy="no-referrer">` : ''}${video ? `<span class="video-badge">▶ ${tx('type.video')}</span><span class="video-play" aria-hidden="true">▶</span>` : ''}</span>`;
}
// Keep the fixed frame and its fallback when a remote image is unavailable.
document.addEventListener('error', e => { if (e.target.matches?.('img.cover-image')) e.target.remove(); }, true);
function modal(title, html, cleanup) {
  if ($('#modal').open) { $('#modal').close(); modalCleanup?.(); }
  modalCleanup = cleanup;
  $('#modal-body').innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button class="close" data-action="close" aria-label="${tx('close')}">×</button></div><div class="dialog-content">${html}<p class="error" id="dialog-error" role="alert"></p></div>`;
  $('#modal').showModal();
}
function closeModal() { if ($('#modal').open) $('#modal').close(); modalCleanup?.(); modalCleanup = null; }
$('#modal').addEventListener('cancel', () => { modalCleanup?.(); modalCleanup = null; });
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
async function refresh() { current = await api('state'); busy = !!current.busy; render(); }
function render() {
  I.apply(); document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.action === section));
  $('#footer-status').textContent = `${t('footer.local')} · v${current.version}`;
  if (section === 'for-you') renderRecommendations(); else renderLibrary();
}
function renderLibrary() {
  const materials = current.library.materials;
  const result = L.search(materials, find, filter, id => t(`topic.${id}`)), items = result.stories;
  if (!items.some(m => m.id === focused)) focused = items[0]?.id || '';
  const chosen = items.find(m => m.id === focused);
  const tags = chosen ? [...new Set([...(chosen.tags || []).slice(0, 6), ...L.autoTags(chosen).map(id => t(`topic.${id}`))])] : [];
  $('#content').innerHTML = `<div class="section-head"><div class="filters" aria-label="${tx('nav.library')}">${[['all','filter.all'],['book','filter.books'],['manga','filter.manga'],['game','filter.games'],['video','filter.video']].map(([k, label]) => `<button data-filter="${k}" class="${filter === k ? 'selected' : ''}" aria-pressed="${filter === k}">${tx(label)}</button>`).join('')}</div><input class="search-input" id="library-search" aria-label="${tx('search.label')}" placeholder="${tx('search.placeholder')}" value="${esc(find)}"></div>
  ${result.notes.length ? `<section class="note-results"><h2>${tx('search.notes', { count: result.notes.length })}</h2>${result.notes.slice(0, noteLimit).map(({ item, note }) => `<button class="note-result" data-story="${esc(item.id)}" data-note="${esc(note.id)}"><strong>${esc(item.title)}</strong><span>${esc(L.excerpt(note.text, find))}</span><small>${tx('search.open')} →</small></button>`).join('')}${result.notes.length > noteLimit ? `<button class="quiet-button" data-action="more-notes">${tx('search.more')}</button>` : ''}</section>` : ''}
  ${!items.length ? `<div class="empty-library"><div class="empty-cover" aria-hidden="true"><b>＋</b></div><div class="empty-copy"><h2>${tx(materials.length ? 'search.none' : 'empty.title')}</h2><p>${tx(materials.length ? 'search.retry' : 'empty.body')}</p><button class="button" data-action="add">${tx('empty.add')}</button></div></div>` : `<div class="shelf" aria-label="${tx('nav.library')}">${items.map(m => `<button class="shelf-card ${m.id === focused ? 'active' : ''}" data-focus="${esc(m.id)}" aria-label="${tx('library.select', { title: m.title })}" aria-pressed="${m.id === focused}">${cover(m)}<span class="caption">${esc(m.title)}</span></button>`).join('')}</div><article class="focused"><span class="tag">${tx(`type.${chosen.type}`)} / ${tx(`status.${chosen.type === 'book' || chosen.type === 'manga' ? '' : 'generic.'}${chosen.status}`)}</span><h2>${esc(chosen.title)}</h2><p class="creator">${esc(chosen.creator)}</p><div class="tag-list" aria-label="${tx('tags.label')}">${tags.map(tag => `<button class="tag-chip" data-tag="${esc(tag)}">#${esc(tag)}</button>`).join('')}</div><div class="inline-actions"><button class="button" data-story="${esc(chosen.id)}">${tx('library.notes')}${chosen.notes?.length ? ` · ${chosen.notes.length}` : ''}</button><button class="quiet-button" data-edit="${esc(chosen.id)}">${tx('library.details')}</button>${safeURL(chosen.sourceUrl) ? `<button class="quiet-button" data-url="${esc(chosen.sourceUrl)}">${tx('library.source')}</button>` : ''}</div>${chosen.notes?.find(n => n.text) ? `<p class="thought">${esc(chosen.notes.find(n => n.text).text.slice(0, 500))}</p>` : ''}</article>`}`;
  $('#library-search').addEventListener('input', e => { find = e.target.value; noteLimit = 30; const at = e.target.selectionStart; renderLibrary(); $('#library-search').focus(); $('#library-search').setSelectionRange(at, at); });
}
function renderRecommendations() {
  const recs = current.library.recommendations || [], connected = current.auth.connected && current.auth.planEnabled;
  $('#content').innerHTML = `<div class="reco-top"><div><p class="pixel eyebrow">CHATGPT</p><h2>${tx('reco.title')}</h2><p>${tx('reco.intro')}</p></div>${connected ? `<button class="button" data-action="recommend" ${busy ? 'disabled' : ''}>${tx('reco.find')} ✦</button>` : ''}</div>
  ${!connected ? `<div class="optional-panel"><h3>${tx('reco.offlineTitle')}</h3><p>${tx('reco.offlineInfo')}</p><div class="inline-actions"><button class="button secondary" data-action="add">${tx('reco.browse')}</button><button class="quiet-button" data-action="connect">${tx('settings.connect')}</button></div></div>` : `<div class="status-line"><b></b><span>${tx('settings.connected')}</span><button class="quiet-button" data-action="usage">${tx('settings.usage')}</button></div>`}
  ${current.library.recommendationsStale ? `<p class="notice">${tx('reco.stale')}</p>` : ''}
  ${recommendationError ? `<p class="notice error" role="alert">${esc(translatedError(recommendationError))}</p>` : ''}
  ${busy ? `<div class="busy-line"><span id="progress">${esc(progress || t('reco.preparing'))}</span><button class="quiet-button" data-action="cancel-recommendation">${tx('cancel')}</button></div>` : ''}
  ${current.library.recommendationIntro && recs.length ? `<p class="muted">${esc(current.library.recommendationIntro)}</p>` : ''}
  ${recs.map((r, i) => `<article class="reco-card"><div>${cover(r)}</div><div><p class="pixel eyebrow">0${i + 1} / ${tx(`type.${r.type}`)}</p><h3>${esc(r.title)}</h3><p class="creator">${esc(r.creator)}</p><p>${esc(r.reason)}</p><details><summary>${tx('reco.why')}</summary><p>${esc(r.experience)}</p>${r.caveat ? `<p><strong>${tx('reco.caveat')}</strong> ${esc(r.caveat)}</p>` : ''}<div>${(r.evidence || []).map(e => `<span class="evidence">${esc(e.title)}</span>`).join('')}</div></details><div class="inline-actions"><button class="button compact" data-save-pick="${i}">${tx('reco.save')}</button><button class="quiet-button" data-url="${esc(r.sourceUrl)}">${tx('reco.catalog')}</button><button class="quiet-button" data-dismiss="${esc(r.externalId)}">${tx('reco.dismiss')}</button></div></div></article>`).join('')}
  ${connected && !recs.length && !busy ? `<div class="empty-copy"><h3>${tx('reco.empty')}</h3><p>${tx('reco.emptyInfo')}</p><button class="quiet-button" data-action="import">${tx('context.import')}</button></div>` : ''}`;
}
function addDialog(mode = 'search') {
  searchResults = [];
  modal(t('add.title'), `<div class="tabs">${[['search','add.catalog'],['link','add.link'],['manual','add.manual']].map(([k,label]) => `<button data-add-tab="${k}" class="${mode === k ? 'selected' : ''}">${tx(label)}</button>`).join('')}</div>${mode === 'search' ? `<p class="muted">${tx('add.hint')}</p><form id="search-form"><label class="field"><span>${tx('form.format')}</span><select id="catalog-type">${['book','manga','game'].map(k => `<option value="${k}">${tx(`type.${k}`)}</option>`).join('')}</select></label><div class="row"><input id="catalog-query" aria-label="${tx('add.query')}" placeholder="${tx('add.query')}" minlength="2" maxlength="200" required autofocus><button class="button" type="submit">${tx('search')}</button></div></form><div id="search-results" class="result-list"></div>` : mode === 'link' ? `<p class="muted">${tx('add.linkHint')}</p><form id="link-form"><label class="field"><span>${tx('form.link')}</span><input name="url" type="url" placeholder="https://…" required></label><label class="field"><span>${tx('form.title')}</span><input name="title" required maxlength="300"></label><label class="field"><span>${tx('form.format')}</span><select name="type">${types.map(k => `<option value="${k}" ${k === 'video' ? 'selected' : ''}>${tx(`type.${k}`)}</option>`).join('')}</select></label><div class="form-end"><button class="button" type="submit">${tx('library.details')} →</button></div></form>` : `<p class="muted">${tx('add.manualHint')}</p><button class="button" data-action="manual-story">${tx('add.manual')}</button>`}`);
  $('#search-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true; $('#search-results').textContent = t('add.searching'); $('#dialog-error').textContent = '';
    try { searchResults = await api('search', { query: $('#catalog-query').value, type: $('#catalog-type').value }); if (!$('#search-results')) return; $('#search-results').innerHTML = searchResults.length ? searchResults.map((r, i) => `<button class="search-result" data-result="${i}">${cover(r)}<div><strong>${esc(r.title)}</strong><p>${esc(r.creator)}${r.year ? ` · ${esc(r.year)}` : ''}</p></div><span>＋</span></button>`).join('') : `<p class="muted">${tx('add.none')}</p>`; }
    catch (e) { if ($('#search-results')) $('#search-results').textContent = ''; fail(e); } finally { button.disabled = false; }
  });
  $('#link-form')?.addEventListener('submit', e => { e.preventDefault(); const f = new FormData(e.target); if (!safeURL(f.get('url'))) return error(t('error.link')); storyForm({ title: f.get('title'), sourceUrl: f.get('url'), type: f.get('type') }); });
}
function storyForm(item = {}) {
  let coverAsset = item.coverAsset || '';
  const formType = item.type || 'book';
  modal(t(item.id ? 'form.edit' : 'form.new'), `<form id="story-form"><div class="form-columns"><label class="field"><span>${tx('form.title')}</span><input name="title" value="${esc(item.title || '')}" maxlength="300" required autofocus></label><label class="field"><span>${tx('form.creator')}</span><input name="creator" value="${esc(item.creator || '')}" maxlength="300"></label><label class="field"><span>${tx('form.format')}</span><select name="type">${types.map(k => `<option value="${k}" ${formType === k ? 'selected' : ''}>${tx(`type.${k}`)}</option>`).join('')}</select></label><label class="field"><span>${tx('form.status')}</span><select name="status">${statuses.map(k => `<option value="${k}" ${item.status === k ? 'selected' : ''}>${tx(`status.${['book','manga'].includes(formType) ? '' : 'generic.'}${k}`)}</option>`).join('')}</select></label></div><label class="field"><span>${tx('form.link')}</span><input name="sourceUrl" type="url" value="${esc(item.sourceUrl || '')}" placeholder="https://…"></label><details><summary class="quiet-button">${tx('form.coverDetails')}</summary><label class="field"><span>${tx('form.coverURL')}</span><input name="cover" type="url" value="${esc(item.cover || '')}" placeholder="https://…"></label><label class="field"><span>${tx('form.coverFile')}</span><input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="small muted" id="cover-feedback"></p><div class="form-columns"><label class="field"><span>${tx('form.year')}</span><input name="year" value="${esc(item.year || '')}" maxlength="10"></label><label class="field"><span>${tx('form.tags')}</span><input name="tags" value="${esc((item.tags || []).join(', '))}"></label></div><p class="small muted">${tx('tags.hint')}</p><label class="field"><span>${tx('form.description')}</span><textarea name="description" maxlength="3000">${esc(item.description || '')}</textarea></label></details><div class="form-end">${item.id ? `<button class="quiet-button danger" type="button" data-delete-story="${esc(item.id)}">${tx('form.delete')}</button>` : ''}<button class="button" type="submit">${tx(item.id ? 'form.saveChanges' : 'save')}</button></div></form>`);
  $('#story-form [name="type"]').addEventListener('change', e => { const prefix = ['book','manga'].includes(e.target.value) ? '' : 'generic.'; for (const opt of $('#story-form [name="status"]').options) opt.textContent = t(`status.${prefix}${opt.value}`); });
  $('#cover-file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { coverAsset = (await api('asset', { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type })).name; $('#cover-feedback').textContent = t('form.ready'); } catch (e) { fail(e); } });
  $('#story-form').addEventListener('submit', async e => {
    e.preventDefault(); e.submitter.disabled = true; const form = e.target, values = Object.fromEntries(new FormData(form));
    try { if ((values.sourceUrl && !safeURL(values.sourceUrl)) || (values.cover && !safeURL(values.cover))) return error(t('error.link')); await api('saveStory', { ...item, ...values, coverAsset, tags: values.tags.split(',').map(s => s.trim()).filter(Boolean) }); if ($('#story-form') === form) closeModal(); await refresh(); toast(t('library.saved')); }
    catch (e) { fail(e); } finally { if (e.submitter) e.submitter.disabled = false; }
  });
}
function stopRecording() { if (recorder?.state === 'recording') recorder.stop(); recordingStream?.getTracks().forEach(s => s.stop()); clearTimeout(recordingTimer); }
function cleanAudio() { stopRecording(); if (audioURL) URL.revokeObjectURL(audioURL); audioURL = ''; audioBlob = null; }
function thoughtsDialog(id, noteId) {
  const item = current.library.materials.find(m => m.id === id); if (!item) return; cleanAudio();
  modal(t('notes.title'), `<p class="muted">${esc(item.title)}${item.creator ? ` · ${esc(item.creator)}` : ''}</p><form id="note-form"><label class="field"><span>${tx('notes.label')}</span><textarea id="note-text" maxlength="50000" placeholder="${tx('notes.placeholder')}" autofocus></textarea></label><div class="inline-actions"><button class="quiet-button" id="record" type="button">${tx('notes.record')}</button><label class="quiet-button">${tx('notes.attach')}<input id="audio-file" type="file" accept="audio/*" hidden></label></div><p id="audio-status" class="small muted"></p><audio id="audio-preview" class="audio-preview" controls hidden></audio><p class="small muted">${tx('notes.audioInfo')}</p><div class="form-end"><button class="button" type="submit">${tx('notes.save')}</button></div></form><div>${(item.notes || []).map(n => `<article class="note ${n.id === noteId ? 'matched-note' : ''}" id="note-${esc(n.id)}"><div class="note-top"><time>${esc(date(n.createdAt))}${n.updatedAt ? ` · ${tx('notes.edited')}` : ''}</time><div class="note-actions"><button class="quiet-button" data-edit-note="${esc(n.id)}" data-parent="${esc(id)}">${tx('notes.edit')}</button><button class="quiet-button danger" data-delete-note="${esc(n.id)}" data-parent="${esc(id)}">${tx('remove')}</button></div></div>${n.text ? `<p>${esc(n.text)}</p>` : ''}${n.audioAsset ? `<audio controls src="${esc(asset(n.audioAsset))}"></audio>` : ''}</article>`).join('')}</div>`, cleanAudio);
  if (noteId) document.getElementById(`note-${noteId}`)?.scrollIntoView({ block: 'nearest' });
  const showAudio = () => { if (audioURL) URL.revokeObjectURL(audioURL); audioURL = URL.createObjectURL(audioBlob); if ($('#audio-preview')) { $('#audio-preview').src = audioURL; $('#audio-preview').hidden = false; $('#audio-status').textContent = t('notes.ready'); } };
  $('#record').addEventListener('click', async () => {
    if (recorder?.state === 'recording') { stopRecording(); return; }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      recorder = new MediaRecorder(recordingStream, { mimeType }); const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); if (chunks.reduce((n, c) => n + c.size, 0) > 19 * 1024 * 1024) stopRecording(); };
      recorder.onstop = () => { audioBlob = new Blob(chunks, { type: 'audio/webm' }); showAudio(); if ($('#record')) $('#record').textContent = t('notes.again'); recordingStream?.getTracks().forEach(s => s.stop()); };
      recorder.start(1000); $('#record').textContent = t('notes.stop'); $('#audio-status').textContent = t('notes.recording'); recordingTimer = setTimeout(stopRecording, 10 * 60 * 1000);
    } catch { stopRecording(); error(t('notes.microphone')); }
  });
  $('#audio-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; if (f.size > 20 * 1024 * 1024) return error(t('notes.audioSize')); stopRecording(); audioBlob = f; showAudio(); });
  $('#note-form').addEventListener('submit', async e => {
    e.preventDefault(); if (recorder?.state === 'recording') return error(t('notes.stopFirst')); e.submitter.disabled = true;
    try { await api('addNote', { storyId: id, text: $('#note-text').value, audio: audioBlob ? { bytes: new Uint8Array(await audioBlob.arrayBuffer()), mime: audioBlob.type } : null }); await refresh(); thoughtsDialog(id); toast(t('notes.saved')); }
    catch (e) { fail(e); } finally { if (e.submitter) e.submitter.disabled = false; }
  });
}
function editNoteDialog(storyId, noteId) {
  const item = current.library.materials.find(m => m.id === storyId), note = item?.notes?.find(n => n.id === noteId);
  if (!note) return;
  cleanAudio();
  modal(t('notes.editTitle'), `<p class="muted">${esc(item.title)}</p><form id="edit-note-form"><label class="field"><span>${tx('notes.label')}</span><textarea id="edit-note-text" maxlength="50000" autofocus>${esc(note.text || '')}</textarea></label>${note.audioAsset ? `<audio class="audio-preview" controls src="${esc(asset(note.audioAsset))}"></audio><p class="small muted">${tx('notes.keepAudio')}</p>` : ''}<div class="form-end"><button class="quiet-button" type="button" data-story="${esc(storyId)}">${tx('cancel')}</button><button class="button" type="submit">${tx('notes.saveChanges')}</button></div></form>`);
  $('#edit-note-form').addEventListener('submit', async e => {
    e.preventDefault(); e.submitter.disabled = true; const form = e.target;
    try { await api('editNote', { storyId, id: noteId, text: $('#edit-note-text').value, expectedText: note.text || '' }); await refresh(); if ($('#edit-note-form') === form) thoughtsDialog(storyId, noteId); toast(t('notes.saved')); }
    catch (e) { fail(e); } finally { if (e.submitter) e.submitter.disabled = false; }
  });
}
function settingsDialog() {
  const a = current.auth, lib = current.library, chat = current.chatBridge || {};
  modal(t('settings.title'), `<p class="notice">${tx('settings.core')}</p><section class="settings-block"><h3>${tx('settings.chat')}</h3><p class="muted">${tx('settings.chatInfo')}</p><div class="inline-actions">${a.connected ? `<span>${tx('settings.connected')} · ${esc(a.email || 'ChatGPT')}</span><button class="quiet-button" data-action="disconnect">${tx('settings.disconnect')}</button>` : `<button class="button secondary" data-action="connect">${tx(a.active ? 'settings.reconnect' : 'settings.connect')}</button>`}${a.connected ? `<button class="quiet-button" data-action="usage">${tx('settings.usage')}</button>` : ''}</div><p class="small muted">${tx('settings.limits')}</p>${a.accounts.length ? `<details><summary>${tx('settings.accounts')}</summary><div class="account-row"><span>${tx('settings.local')}</span><button class="quiet-button" data-select-account="local">${tx(a.active ? 'settings.open' : 'settings.active')}</button></div>${a.accounts.map(acc => `<div class="account-row"><span>${esc(acc.email || acc.label)}</span><button class="quiet-button" data-select-account="${esc(acc.key)}">${tx(acc.key === a.active ? 'settings.active' : 'settings.open')}</button></div>`).join('')}</details>` : ''}</section>
  <section class="settings-block"><h3>${tx('context.title')}</h3><p class="muted">${tx('context.hint')}</p><p class="small muted">${tx('context.count', { count: lib.sources.length })}</p><div class="inline-actions"><button class="button secondary" data-action="import">${tx('context.import')}</button><button class="quiet-button" data-action="export-context">${tx('context.export')}</button></div><details class="settings-details"><summary>${tx('context.manage')}</summary>${lib.contextSummary ? `<details class="source"><summary>${tx('context.summary')}</summary><p class="source-body">${esc(lib.contextSummary)}</p></details>` : ''}${lib.sources.map(s => `<div class="source"><div class="source-head"><label class="checkline"><input type="checkbox" data-source-toggle="${esc(s.id)}" ${s.enabled !== false ? 'checked' : ''}><span class="source-title">${esc(s.title)}</span></label><button class="quiet-button danger" data-remove-source="${esc(s.id)}">${tx('remove')}</button></div><details><summary>${tx('context.review')}</summary><p class="source-body">${esc(s.body)}</p></details></div>`).join('') || `<p class="muted">${tx('context.empty')}</p>`}</details><details class="settings-details"><summary>${tx('bridge.title')}</summary><p class="small muted">${tx('bridge.info')}</p><p class="small muted">${tx(chat.enabled ? chat.paired ? 'bridge.connected' : 'bridge.paused' : 'bridge.off')}</p><div class="inline-actions">${!chat.paired ? `<button class="quiet-button" data-action="chat-enable">${tx('bridge.enable')}</button>` : ''}${chat.enabled ? `<button class="quiet-button" data-action="chat-disable">${tx('bridge.disable')}</button>` : ''}</div></details></section>
  <section class="settings-block"><h3>${tx('backup.title')}</h3><p class="muted">${tx('backup.info')}</p><div class="inline-actions"><button class="button secondary" data-action="export">${tx('backup.download')}</button><button class="quiet-button" data-action="restore">${tx('backup.restore')}</button></div><p class="small muted">${tx('backup.automatic')}</p>${current.latestBackup ? `<p class="small muted">${tx('backup.latest', { date: date(current.latestBackup.createdAt) })}</p>` : ''}<details class="settings-details"><summary>${tx('backup.recovery')}</summary><p class="small muted">${tx('backup.recoveryHint')}</p><div class="inline-actions"><button class="quiet-button" data-action="open-backups">${tx('backup.open')}</button><button class="quiet-button" data-action="restore">${tx('backup.restore')}</button></div></details></section><p class="small muted">Aftertaste ${esc(current.version)} · ${tx('about')}</p><button class="quiet-button" data-action="github">GitHub ↗</button>`);
}
async function importDialog(restore = false) {
  const result = await api('importPreview', { restore }); if (result.cancelled) return;
  if (result.backup) { modal(t('backup.restore'), `<p>${tx('backup.confirm', { count: result.count })}</p><div class="inline-actions"><button class="quiet-button" data-action="export">${tx('backup.download')}</button><button class="button" data-action="restore-backup">${tx('backup.replace')}</button></div>`); return; }
  pendingItems = result.items || [];
  modal(t('context.select'), `<p class="muted">${tx('context.selectHint')}</p><p class="small muted">${tx('context.ownWords')}</p><input id="import-search" aria-label="${tx('context.find')}" placeholder="${tx('context.find')}" class="field"><div class="import-list">${pendingItems.map(s => `<label class="checkline" data-import-title="${esc(L.normalize(s.title))}"><input type="checkbox" name="import-source" value="${esc(s.id)}"><span><strong>${esc(s.title)}</strong><p>${tx('context.characters', { count: s.length.toLocaleString(I.language) })}</p><details><summary>${tx('context.preview')}</summary><p class="source-body">${esc(s.preview)}</p></details></span></label>`).join('') || `<p class="muted">${tx('context.noneFound')}</p>`}</div><div class="form-end"><button class="button" data-action="commit-import">${tx('context.commit')}</button></div>`);
  $('#import-search').addEventListener('input', e => document.querySelectorAll('[data-import-title]').forEach(el => { el.hidden = !el.dataset.importTitle.includes(L.normalize(e.target.value)); }));
}
async function recommendationDialog() {
  if (!current.auth.connected || !current.auth.planEnabled) { section = 'for-you'; render(); return; }
  modal(t('reco.dialog'), `<p class="muted">${tx('reco.sendInfo')}</p><form id="recommend-form"><label class="field"><span>${tx('reco.request')}</span><input id="reco-query" placeholder="${tx('reco.placeholder')}" maxlength="2000"></label><label class="field"><span>${tx('form.format')}</span><select id="reco-format">${['book','manga','game'].map(k => `<option value="${k}">${tx(`type.${k}`)}</option>`).join('')}</select></label><details><summary>${tx('reco.review')}</summary><p class="small muted">${tx('reco.bounds')}</p><div class="source-body">${current.library.sources.filter(s => s.enabled !== false).map(s => `<p>• ${esc(s.title)}</p>`).join('')}${current.library.materials.map(m => `<p>• ${esc(m.title)}</p>`).join('')}</div></details><p class="small muted">${tx('settings.limits')}</p><div class="form-end"><button class="button" id="start-reco" type="submit">${tx('reco.start')}</button></div></form>`);
  $('#recommend-form').addEventListener('submit', async e => {
    e.preventDefault(); const payload = { query: $('#reco-query').value, format: $('#reco-format').value };
    closeModal(); section = 'for-you'; busy = true; recommendationError = ''; progress = t('reco.preparing'); render();
    try { await api('recommend', payload); toast(t('reco.done')); } catch (e) { recommendationError = e.message; } finally { busy = false; progress = ''; await refresh(); }
  });
}
async function connect() {
  const key = current.auth.active || 'new';
  modal(t('auth.title'), `<p class="muted">${tx('auth.finish')}</p><p class="notice">${tx('auth.history')}</p><button class="quiet-button" data-action="cancel-signin">${tx('auth.cancel')}</button>`, () => { api('cancelSignIn').catch(() => {}); });
  try { await api('connect', { key }); closeModal(); await api('acknowledge'); await refresh(); toast(t('auth.connected')); }
  catch (e) { fail(e); }
}
document.addEventListener('change', async e => {
  try {
    if (e.target.id === 'language-select') {
      const language = e.target.value; e.target.disabled = true;
      try { await api('preferences', { language }); await I.load(language); await refresh(); }
      finally { e.target.disabled = false; }
    } else if (e.target.dataset.sourceToggle) {
      await api('toggleSource', { id: e.target.dataset.sourceToggle, enabled: e.target.checked }); await refresh();
    }
  } catch (err) { I.apply(); fail(err); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled || !current) return;
  try {
    const d = b.dataset;
    if (d.filter) { filter = d.filter; renderLibrary(); return; }
    if (d.tag) { closeModal(); section = 'library'; find = d.tag; noteLimit = 30; render(); return; }
    if (d.focus) { focused = d.focus; renderLibrary(); return; }
    if (d.story) return thoughtsDialog(d.story, d.note);
    if (d.edit) return storyForm(current.library.materials.find(m => m.id === d.edit));
    if (d.addTab) return addDialog(d.addTab);
    if (d.result !== undefined) return storyForm(searchResults[Number(d.result)]);
    if (d.url) return await api('openExternal', { url: d.url });
    if (d.selectAccount) { await api('selectAccount', { key: d.selectAccount }); await refresh(); return settingsDialog(); }
    if (d.removeSource) { if (!confirm(t('context.removeConfirm'))) return; await api('removeSource', { id: d.removeSource }); await refresh(); return settingsDialog(); }
    if (d.savePick !== undefined) { await api('saveStory', current.library.recommendations[Number(d.savePick)]); await refresh(); return toast(t('library.saved')); }
    if (d.dismiss) { await api('dismiss', { id: d.dismiss }); return await refresh(); }
    if (d.deleteStory) { if (!confirm(t('library.deleteConfirm'))) return; await api('deleteStory', { id: d.deleteStory }); closeModal(); await refresh(); return toast(t('library.deleted')); }
    if (d.editNote) return editNoteDialog(d.parent, d.editNote);
    if (d.deleteNote) { if (!confirm(t('notes.deleteConfirm'))) return; await api('deleteNote', { storyId: d.parent, id: d.deleteNote }); await refresh(); return thoughtsDialog(d.parent); }
    const action = d.action;
    if (action === 'library' || action === 'for-you') { section = action; render(); }
    else if (action === 'more-notes') { noteLimit += 30; renderLibrary(); }
    else if (action === 'close') closeModal();
    else if (action === 'add') addDialog();
    else if (action === 'manual-story') storyForm();
    else if (action === 'settings') settingsDialog();
    else if (action === 'chat-enable' || action === 'chat-disable') { await api('setChatBridge', { enabled: action === 'chat-enable' }); await refresh(); settingsDialog(); }
    else if (action === 'import' || action === 'restore') await importDialog(action === 'restore');
    else if (action === 'commit-import') { await api('importCommit', { ids: [...document.querySelectorAll('[name="import-source"]:checked')].map(x => x.value) }); closeModal(); await refresh(); toast(t('context.imported')); }
    else if (action === 'restore-backup') { await api('importCommit', { restore: true }); closeModal(); await refresh(); toast(t('backup.done')); }
    else if (action === 'export' || action === 'export-context') { const r = await api(action === 'export' ? 'export' : 'exportContext'); if (r.saved) toast(t(action === 'export' ? 'backup.saved' : 'context.exported')); }
    else if (action === 'open-backups') await api('openBackups');
    else if (action === 'recommend') await recommendationDialog();
    else if (action === 'cancel-recommendation') await api('cancelRecommendation');
    else if (action === 'connect') await connect();
    else if (action === 'cancel-signin') { await api('cancelSignIn'); closeModal(); }
    else if (action === 'disconnect') { const r = await api('disconnect'); await refresh(); settingsDialog(); if (r.warning) error(translatedError(r.warning)); }
    else if (action === 'usage') await api('openExternal', { url: current.auth.usageUrl || 'https://chatgpt.com/#settings/Usage' });
    else if (action === 'github') await api('openExternal', { url: 'https://github.com/ansvier/aftertaste' });
  } catch (err) { fail(err); }
});
window.aftertaste?.onUpdate(async data => {
  if (!current) return;
  if (data.selectionStarted) { section = 'for-you'; busy = true; recommendationError = ''; progress = t('reco.preparing'); render(); }
  else if (data.selectionError) { recommendationError = data.selectionError; render(); }
  else if (data.progress) { const key = /themes/.test(data.progress) ? 'themes' : /catalogs/.test(data.progress) ? 'catalogs' : 'choosing'; progress = t(`reco.progress.${key}`); if ($('#progress')) $('#progress').textContent = progress; }
  else { try { await refresh(); if (data.contextUpdated) toast(t('bridge.updated')); } catch (e) { fail(e); } }
});
(async () => { current = await api('state'); await I.load(current.preferences?.language || 'en'); L.configure(await (await fetch('locales/tag-rules.json')).json()); busy = !!current.busy; render(); })().catch(e => { $('#content').textContent = e.message; });
