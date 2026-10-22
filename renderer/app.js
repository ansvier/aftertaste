'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeURL = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const statusNames = { want: 'Want to explore', active: 'In progress', finished: 'Finished', paused: 'On hold' };
const typeNames = { book: 'Book', manga: 'Manga', game: 'Game', video: 'Video', film: 'Film', article: 'Article', podcast: 'Podcast' };
let current = { library: { materials: [], sources: [], recommendations: [] }, auth: { accounts: [] } };
let section = 'library', filter = 'all', focused = '', find = '', busy = false, progress = '', selectedModel = '', recommendationError = '';
let searchResults = [], pendingItems = [], recorder, recordingStream, audioBlob, audioURL, recordingTimer, recordChunks = [], recordingStarted = 0;
let toastTimer, modalCleanup;
async function api(action, payload) {
  if (!window.aftertaste) throw new Error('Open Aftertaste as a desktop app to use your library.');
  const response = await window.aftertaste.invoke(action, payload);
  if (!response.ok) throw new Error(response.error || 'This action could not be completed.');
  return response.data;
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function error(message) { const target = $('#dialog-error'); if (target) target.textContent = message; else toast(message); }
function asset(name) { return /^[a-f0-9-]{36}\.(png|jpg|webp|webm|ogg|mp3|m4a|wav)$/.test(name || '') ? `aftertaste://app/local-assets/${name}` : ''; }
function cover(item) {
  const src = asset(item.coverAsset) || safeURL(item.cover);
  return src ? `<img class="cover" src="${esc(src)}" alt="Cover of ${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="cover cover-fallback"><small>${esc(typeNames[item.type] || 'STORY')}</small><strong>${esc(item.title)}</strong><span>✦</span></div>`;
}
function modal(title, content, cleanup) {
  if ($('#modal').open) { $('#modal').close(); modalCleanup?.(); }
  modalCleanup = cleanup;
  $('#modal-body').innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div><div class="dialog-content">${content}<p class="error" id="dialog-error" role="alert"></p></div>`;
  $('#modal').showModal();
}
function closeModal() { if ($('#modal').open) $('#modal').close(); modalCleanup?.(); modalCleanup = null; }
$('#modal').addEventListener('cancel', () => { modalCleanup?.(); modalCleanup = null; });
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) closeModal(); });
async function refresh() {
  current = await api('state'); busy = !!current.busy; render();
  $('#footer-status').textContent = `${current.auth.email || 'Offline shelf'} · saved on this computer · v${current.version}`;
}
function render() {
  document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b.dataset.action === section));
  if (section === 'for-you') renderRecommendations(); else renderLibrary();
}
function renderLibrary() {
  const materials = current.library.materials;
  const items = materials.filter(m => (filter === 'all' || m.type === filter || (filter === 'video' && ['film', 'podcast', 'article'].includes(m.type))) && `${m.title} ${m.creator} ${(m.notes || []).map(n => n.text).join(' ')}`.toLowerCase().includes(find.toLowerCase()));
  if (!items.some(m => m.id === focused)) focused = items[0]?.id || '';
  const chosen = items.find(m => m.id === focused);
  $('#content').innerHTML = `<div class="section-head"><div class="filters" aria-label="Filter your library">${[['all', 'All stories'], ['book', 'Books'], ['manga', 'Manga'], ['game', 'Games'], ['video', 'Videos & more']].map(([k, v]) => `<button data-filter="${k}" class="${filter === k ? 'selected' : ''}" aria-pressed="${filter === k}">${v}</button>`).join('')}</div><input class="search-input" id="library-search" aria-label="Search your library" placeholder="Title, creator, or thought…" value="${esc(find)}"></div>
  ${!items.length ? `<div class="empty-library"><div class="empty-cover" aria-hidden="true"><b>＋</b><small>EMPTY SLOT</small></div><div class="empty-copy"><h2>${materials.length ? 'No matching story yet.' : 'Your first story starts here.'}</h2><p>${materials.length ? 'Try a different title, thought, or filter.' : 'A favourite, one left unfinished, or something you want to discover. The thoughts can come later.'}</p><div class="inline-actions"><button class="button" data-action="add">Add a story</button><button class="quiet-button" data-action="import">Import context</button></div></div></div>` : `<div class="shelf" aria-label="Your cover shelf">${items.map(m => `<button class="shelf-card ${m.id === focused ? 'active' : ''}" data-focus="${esc(m.id)}" aria-label="Select ${esc(m.title)}" aria-pressed="${m.id === focused}">${cover(m)}<span class="caption">${esc(m.title)}</span></button>`).join('')}</div><article class="focused"><span class="tag">${esc(typeNames[chosen.type])} / ${esc(statusNames[chosen.status])}</span><h2>${esc(chosen.title)}</h2><p class="creator">${esc(chosen.creator)}</p><div class="inline-actions"><button class="button" data-story="${esc(chosen.id)}">My thoughts${chosen.notes?.length ? ` · ${chosen.notes.length}` : ''}</button><button class="quiet-button" data-edit="${esc(chosen.id)}">Details</button>${safeURL(chosen.sourceUrl) ? `<button class="quiet-button" data-url="${esc(chosen.sourceUrl)}">Open source ↗</button>` : ''}</div>${chosen.notes?.find(n => n.text) ? `<p class="thought">“${esc(chosen.notes.find(n => n.text).text.slice(0, 500))}”</p>` : ''}</article>`}`;
  $('#library-search')?.addEventListener('input', e => {
    find = e.target.value; const position = e.target.selectionStart; renderLibrary(); $('#library-search').focus(); $('#library-search').setSelectionRange(position, position);
  });
  document.querySelectorAll('img.cover').forEach(img => img.addEventListener('error', () => { img.replaceWith(Object.assign(document.createElement('div'), { className: 'cover cover-fallback', textContent: img.alt.replace(/^Cover of /, '') })); }, { once: true }));
}
function renderRecommendations() {
  const recs = current.library.recommendations || [];
  const connected = current.auth.connected && current.auth.planEnabled;
  $('#content').innerHTML = `<div class="reco-top"><div><p class="pixel eyebrow">YOUR NEXT STORY</p><h2>Something for this moment.</h2><p>A few stories, chosen from public catalogs with your library, thoughts, and the context you choose to share.</p></div><button class="button" data-action="recommend" ${busy ? 'disabled' : ''}>${recs.length ? 'Find my next story' : 'Find something for me'} ✦</button></div>
  <div class="status-line"><b></b><span>${connected ? 'Using ChatGPT plan' : 'Connect ChatGPT for personal recommendations'}</span><button class="quiet-button" data-action="${connected ? 'usage' : 'settings'}">${connected ? 'Manage usage ↗' : 'Connect →'}</button></div>
  ${recommendationError ? `<div class="notice" role="alert"><p class="error">${esc(recommendationError)}</p><button class="quiet-button" data-action="usage">Manage usage ↗</button></div>` : ''}
  ${busy ? `<div class="busy-line"><span id="progress">${esc(progress || 'Preparing your selection…')}</span><button class="quiet-button" data-action="cancel-recommendation">Cancel</button></div>` : ''}
  ${current.library.recommendationIntro && recs.length ? `<p class="muted">${esc(current.library.recommendationIntro)}</p>` : ''}
  ${recs.length ? recs.map((r, i) => `<article class="reco-card"><div>${cover(r)}</div><div><p class="pixel eyebrow">0${i + 1} / ${esc(typeNames[r.type])}</p><h3>${esc(r.title)}</h3><p class="creator">${esc(r.creator)}</p><p>${esc(r.reason)}</p><details><summary>Why this story?</summary><p>${esc(r.experience)}</p>${r.caveat ? `<p><strong>A small caveat:</strong> ${esc(r.caveat)}</p>` : ''}<div>${(r.evidence || []).map(e => `<span class="evidence">${esc(e.title)}</span>`).join('')}</div></details><div class="inline-actions"><button class="button compact" data-save-pick="${i}">＋ Add to library</button><button class="quiet-button" data-url="${esc(r.sourceUrl)}">Catalog ↗</button><button class="quiet-button" data-dismiss="${esc(r.externalId)}">Not for me</button></div></div></article>`).join('') : `<div class="empty-library"><div class="empty-cover" aria-hidden="true"><b>✦</b><small>NEXT CHAPTER</small></div><div class="empty-copy"><h2>Let a story find you.</h2><p>Import a few conversations or documents you choose. Your own impressions matter too. No questionnaire, no daily upkeep.</p><div class="inline-actions"><button class="quiet-button" data-action="import">Choose context →</button></div></div></div>`}`;
}
function addDialog(mode = 'search') {
  searchResults = [];
  modal('Add a story', `<div class="tabs"><button data-add-tab="search" class="${mode === 'search' ? 'selected' : ''}">Search catalogs</button><button data-add-tab="link" class="${mode === 'link' ? 'selected' : ''}">From a link</button><button data-add-tab="manual" class="${mode === 'manual' ? 'selected' : ''}">Manually</button></div>${mode === 'search' ? `<p class="muted">Find a title. Bring its cover and details along.</p><form id="search-form"><label class="field"><span>Catalog</span><select id="catalog-type"><option value="book">Books</option><option value="manga">Manga</option><option value="game">Games on Steam</option></select></label><div class="row"><input id="catalog-query" aria-label="Title or creator" placeholder="A title or creator…" minlength="2" maxlength="200" required autofocus><button class="button" type="submit">Search</button></div></form><div id="search-results" class="result-list"></div>` : mode === 'link' ? `<p class="muted">A video, film, podcast, or something worth returning to.</p><form id="link-form"><label class="field"><span>Link</span><input name="url" type="url" placeholder="https://…" required></label><label class="field"><span>Title</span><input name="title" required maxlength="300" placeholder="What is it called?"></label><label class="field"><span>Format</span><select name="type"><option value="video">Video</option><option value="film">Film</option><option value="podcast">Podcast</option><option value="article">Article</option><option value="game">Game</option><option value="book">Book</option></select></label><div class="form-end"><button class="button" type="submit">Add details →</button></div></form>` : `<p class="muted">Just the title is enough to start.</p><div class="inline-actions"><button class="button" data-action="manual-story">Add story details →</button></div>`}`);
  $('#search-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true; $('#search-results').textContent = 'Searching catalogs…'; $('#dialog-error').textContent = '';
    try {
      searchResults = await api('search', { query: $('#catalog-query').value, type: $('#catalog-type').value });
      if (!$('#search-results')) return;
      $('#search-results').innerHTML = searchResults.length ? searchResults.map((r, i) => `<button class="search-result" data-result="${i}">${cover(r)}<div><strong>${esc(r.title)}</strong><p>${esc(r.creator)}${r.year ? ` · ${esc(r.year)}` : ''}</p></div><span>＋</span></button>`).join('') : '<p class="muted">Nothing found. Try another title, or add it manually.</p>';
    } catch (e) { if ($('#search-results')) $('#search-results').textContent = ''; error(e.message); }
    finally { button.disabled = false; }
  });
  $('#link-form')?.addEventListener('submit', e => { e.preventDefault(); const form = new FormData(e.target); if (!safeURL(form.get('url'))) return error('Use a complete HTTPS link.'); storyForm({ title: form.get('title'), sourceUrl: form.get('url'), type: form.get('type') }); });
}
function storyForm(item = {}) {
  let coverAsset = item.coverAsset || '', uploadedName = '';
  modal(item.id ? 'Story details' : 'A new story', `<form id="story-form"><div class="form-columns"><label class="field"><span>Title</span><input name="title" value="${esc(item.title || '')}" maxlength="300" required autofocus></label><label class="field"><span>Author or creator</span><input name="creator" value="${esc(item.creator || '')}" maxlength="300"></label><label class="field"><span>Format</span><select name="type">${Object.entries(typeNames).map(([k, v]) => `<option value="${k}" ${item.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="field"><span>Status</span><select name="status">${Object.entries(statusNames).map(([k, v]) => `<option value="${k}" ${item.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div><label class="field"><span>Source link</span><input name="sourceUrl" type="url" value="${esc(item.sourceUrl || '')}" placeholder="https://…"></label><details><summary class="quiet-button">Cover & other details</summary><label class="field"><span>Cover image URL</span><input name="cover" type="url" value="${esc(item.cover || '')}" placeholder="https://…"></label><label class="field"><span>Or choose a cover · JPG, PNG, WebP, up to 8 MB</span><input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp"></label><p class="small muted" id="cover-feedback"></p><div class="form-columns"><label class="field"><span>Year</span><input name="year" value="${esc(item.year || '')}" maxlength="10"></label><label class="field"><span>Topics, separated by commas</span><input name="tags" value="${esc((item.tags || []).join(', '))}"></label></div><label class="field"><span>Description</span><textarea name="description" maxlength="3000">${esc(item.description || '')}</textarea></label></details><div class="form-end">${item.id ? `<button class="quiet-button danger" type="button" data-delete-story="${esc(item.id)}">Delete story</button>` : ''}<button class="button" type="submit">${item.id ? 'Save changes' : 'Save to library'}</button></div></form>`);
  $('#cover-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const result = await api('asset', { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type }); coverAsset = result.name; uploadedName = file.name; $('#cover-feedback').textContent = `${uploadedName} · ready`; } catch (e) { error(e.message); }
  });
  $('#story-form').addEventListener('submit', async e => {
    e.preventDefault(); e.submitter.disabled = true;
    const values = Object.fromEntries(new FormData(e.target));
    try {
      if ((values.sourceUrl && !safeURL(values.sourceUrl)) || (values.cover && !safeURL(values.cover))) throw new Error('Use HTTPS links for the source and cover.');
      await api('saveStory', { ...item, ...values, coverAsset, tags: values.tags.split(',').map(s => s.trim()).filter(Boolean) });
      closeModal(); await refresh(); toast('Saved to your library.');
    } catch (e) { error(e.message); }
    finally { if (e.submitter) e.submitter.disabled = false; }
  });
}
function stopRecording() {
  if (recorder?.state === 'recording') recorder.stop();
  recordingStream?.getTracks().forEach(t => t.stop()); clearTimeout(recordingTimer);
}
function cleanAudio() { stopRecording(); if (audioURL) URL.revokeObjectURL(audioURL); audioURL = ''; audioBlob = null; }
function thoughtsDialog(id) {
  const item = current.library.materials.find(m => m.id === id); if (!item) return;
  cleanAudio();
  modal('What stayed with you?', `<p class="muted">${esc(item.title)}${item.creator ? ` · ${esc(item.creator)}` : ''}</p><form id="note-form"><label class="field"><span>A thought, a feeling, or just “not sure yet”.</span><textarea id="note-text" maxlength="50000" placeholder="No need to turn it into a review…" autofocus></textarea></label><div class="inline-actions"><button class="quiet-button" id="record" type="button">● Record a voice impression</button><label class="quiet-button">Attach audio<input id="audio-file" type="file" accept="audio/*" hidden></label></div><p id="audio-status" class="small muted"></p><audio id="audio-preview" class="audio-preview" controls hidden></audio><p class="small muted">Voice recordings stay local. AI recommendations use written notes; this release does not transcribe audio.</p><div class="form-end"><button class="button" type="submit">Save impression</button></div></form><div>${(item.notes || []).map(n => `<article class="note"><div class="note-top"><time>${esc(new Date(n.createdAt).toLocaleDateString('en', { dateStyle: 'medium' }))}</time><button class="quiet-button danger" data-delete-note="${esc(n.id)}" data-parent="${esc(id)}">Delete</button></div>${n.text ? `<p>${esc(n.text)}</p>` : ''}${n.audioAsset ? `<audio controls src="${esc(asset(n.audioAsset))}"></audio>` : ''}</article>`).join('')}</div>`, cleanAudio);
  const showAudio = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = URL.createObjectURL(audioBlob);
    if ($('#audio-preview')) { $('#audio-preview').src = audioURL; $('#audio-preview').hidden = false; $('#audio-status').textContent = 'Voice impression ready to save.'; }
  };
  $('#record').addEventListener('click', async () => {
    if (recorder?.state === 'recording') { stopRecording(); return; }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      recorder = new MediaRecorder(recordingStream, { mimeType }); recordChunks = []; recordingStarted = Date.now();
      recorder.ondataavailable = e => { if (e.data.size) recordChunks.push(e.data); if (recordChunks.reduce((n, b) => n + b.size, 0) > 19 * 1024 * 1024) stopRecording(); };
      recorder.onstop = () => { audioBlob = new Blob(recordChunks, { type: 'audio/webm' }); showAudio(); if ($('#record')) $('#record').textContent = '● Record again'; recordingStream?.getTracks().forEach(t => t.stop()); };
      recorder.start(1000); $('#record').textContent = '■ Stop recording'; $('#audio-status').textContent = 'Recording… up to 10 minutes.';
      recordingTimer = setTimeout(stopRecording, 10 * 60 * 1000);
    } catch { stopRecording(); error('Microphone access is unavailable. You can attach an audio file instead.'); }
  });
  $('#audio-file').addEventListener('change', e => { const file = e.target.files[0]; if (!file) return; if (file.size > 20 * 1024 * 1024) return error('Choose audio up to 20 MB.'); stopRecording(); audioBlob = file; showAudio(); });
  $('#note-form').addEventListener('submit', async e => {
    e.preventDefault(); if (recorder?.state === 'recording') return error('Stop the recording before saving.');
    e.submitter.disabled = true;
    try {
      await api('addNote', { storyId: id, text: $('#note-text').value, audio: audioBlob ? { bytes: new Uint8Array(await audioBlob.arrayBuffer()), mime: audioBlob.type } : null });
      await refresh(); thoughtsDialog(id); toast('Impression saved.');
    } catch (e) { error(e.message); } finally { if (e.submitter) e.submitter.disabled = false; }
  });
}
function settingsDialog() {
  const a = current.auth, library = current.library;
  modal('Your space', `<h3>ChatGPT connection</h3><p class="muted">Use your ChatGPT plan for eligible recommendations. No separate API key. Available access and limits depend on your plan and workspace.</p><div class="inline-actions"><button class="button secondary" data-action="connect">Continue with ChatGPT</button><button class="quiet-button" data-action="usage">Manage usage ↗</button></div><p class="small muted">Signing in does not reveal your ChatGPT history. Choose the conversations you want to import.</p><div class="account-row"><div><strong>Offline shelf</strong><small>No account required</small></div><button class="quiet-button" data-select-account="local">${a.active ? 'Open shelf' : 'Active'}</button></div>${a.accounts.map(acc => `<div class="account-row"><div><strong>${esc(acc.email || acc.label)}</strong><small>${esc(acc.label)} · ${acc.connected ? 'Connected' : 'Signed out'}${acc.key === a.active ? ' · Active shelf' : ''}</small></div><button class="quiet-button" data-select-account="${esc(acc.key)}">${acc.key === a.active ? 'Active' : 'Open shelf'}</button>${!acc.connected ? `<button class="quiet-button" data-reconnect="${esc(acc.key)}">Reconnect</button>` : ''}</div>`).join('')}${a.connected ? '<div class="inline-actions"><button class="quiet-button danger" data-action="disconnect">Sign out of the active ChatGPT account</button></div>' : ''}<p class="small muted">Each ChatGPT account has a separate shelf. Your offline shelf stays separate too.</p><hr class="divider"><h3>Context you chose</h3><p class="muted">Nothing is collected in the background. Import chosen conversations from a ChatGPT export, or a text / Markdown document.</p><div class="inline-actions"><button class="button secondary" data-action="import">Choose a file</button><button class="quiet-button" data-action="export-help">How to export ChatGPT chats ↗</button></div>${library.contextSummary ? `<details class="source"><summary>Latest context summary</summary><p class="source-body">${esc(library.contextSummary)}</p></details>` : ''}${library.sources.length ? library.sources.map(s => `<div class="source"><div class="source-head"><label class="checkline"><input type="checkbox" data-source-toggle="${esc(s.id)}" ${s.enabled !== false ? 'checked' : ''}><span class="source-title">${esc(s.title)}</span></label><button class="quiet-button danger" data-remove-source="${esc(s.id)}">Remove</button></div><details><summary class="quiet-button">Review source</summary><p class="source-body">${esc(s.body)}</p></details></div>`).join('') : '<p class="small muted">No imported sources yet.</p>'}<hr class="divider"><h3>Your data</h3><p class="muted">Saved on this computer. Your library is not synced to an Aftertaste server.</p><div class="inline-actions"><button class="quiet-button" data-action="export">Export library & audio</button><button class="quiet-button" data-action="open-data">Open data folder</button></div><p class="small muted">Backups include your chosen context and notes. Keep them private. ChatGPT tokens are never exported. Restore a backup with Choose a file.</p><hr class="divider"><p class="small muted">Aftertaste ${esc(current.version)} · public preview · English edition.<br>Independent open-source project. Not affiliated with OpenAI.</p><button class="quiet-button" data-action="github">Source code & release notes ↗</button>`);
}
async function importDialog() {
  const result = await api('importPreview'); if (result.cancelled) return;
  if (result.backup) {
    modal('Restore a backup', `<p>This backup contains ${result.count} stories. Restoring replaces the library in the active shelf, including its sources and notes.</p><p class="notice">Export your current shelf first if you want to keep a copy.</p><div class="inline-actions"><button class="quiet-button" data-action="export">Export current shelf</button><button class="button" data-action="restore-backup">Replace this shelf</button></div>`); return;
  }
  pendingItems = result.items || [];
  modal('Choose your context', `<p class="muted">Select only what you want Aftertaste to use. This preview is local. Importing does not send anything to ChatGPT.</p><p class="small muted">For ChatGPT exports, only your own messages are extracted. Review quoted or sensitive passages before using them as context.</p><input id="import-search" aria-label="Find conversations" placeholder="Find a conversation…" class="field"><div class="import-list" id="import-list">${pendingItems.map(s => `<label class="checkline" data-import-title="${esc(s.title.toLowerCase())}"><input type="checkbox" name="import-source" value="${esc(s.id)}"><span><strong>${esc(s.title)}</strong><p>${s.length.toLocaleString('en')} characters</p><details><summary>Preview your messages</summary><p class="source-body">${esc(s.preview)}</p></details></span></label>`).join('') || '<p class="muted">No readable user messages were found in this file.</p>'}</div><div class="form-end"><button class="button" data-action="commit-import">Import selected sources</button></div>`);
  $('#import-search').addEventListener('input', e => { document.querySelectorAll('[data-import-title]').forEach(el => { el.hidden = !el.dataset.importTitle.includes(e.target.value.toLowerCase()); }); });
}
async function recommendationDialog() {
  if (!current.auth.connected || !current.auth.planEnabled) return settingsDialog();
  modal('Find your next story', `<p class="muted">Your chosen context and written impressions go directly from this app to OpenAI when you start. Eligible requests use your ChatGPT plan.</p><form id="recommend-form"><label class="field"><span>What are you in the mood for? · optional</span><input id="reco-query" placeholder="Something for myself, a strange world to disappear into…" maxlength="2000"></label><div class="form-columns"><label class="field"><span>Format</span><select id="reco-format"><option value="book">Books</option><option value="manga">Manga</option><option value="game">Games</option></select></label><label class="field"><span>ChatGPT model</span><select id="reco-model" disabled><option>Loading available models…</option></select></label></div><details><summary class="quiet-button">Review what will be sent</summary><p class="small muted">Up to 120 context items, 20,000 characters per item and 160,000 characters in total. Written library notes are included; audio files are not sent. Library entries and written impressions come first.</p><div class="source-body">${current.library.sources.filter(s => s.enabled !== false).map(s => `<p>• ${esc(s.title)}</p>`).join('')}${current.library.materials.map(m => `<p>• Library: ${esc(m.title)}${m.notes?.length ? ` · ${m.notes.filter(n => n.text).length} written impressions` : ''}</p>`).join('') || ''}</div><button class="quiet-button" type="button" data-action="settings">Change sources</button></details><div class="status-line"><b></b>Using ChatGPT plan <button class="quiet-button" type="button" data-action="usage">Manage usage ↗</button></div><div class="form-end"><button class="button" id="start-reco" type="submit" disabled>Choose a few stories ✦</button></div></form>`);
  try {
    const list = await api('models');
    if (!$('#reco-model')) return;
    $('#reco-model').innerHTML = list.map(m => `<option value="${esc(m.id)}" ${m.id === selectedModel ? 'selected' : ''}>${esc(m.name)}</option>`).join(''); $('#reco-model').disabled = false; $('#start-reco').disabled = false;
  } catch (e) { error(e.message); }
  $('#recommend-form')?.addEventListener('submit', async e => {
    e.preventDefault(); selectedModel = $('#reco-model').value;
    const payload = { model: selectedModel, query: $('#reco-query').value, format: $('#reco-format').value };
    closeModal(); section = 'for-you'; busy = true; recommendationError = ''; progress = 'Preparing your selection…'; render();
    try { await api('recommend', payload); toast('Your next stories are ready.'); }
    catch (e) { recommendationError = e.message; }
    finally { busy = false; progress = ''; await refresh(); }
  });
}
async function connect(key = 'new') {
  modal('Continue with ChatGPT', `<p class="muted">Finish sign-in and review permissions in your browser. Your current shelf stays here.</p><p class="notice">Aftertaste uses eligible ChatGPT plan access. Your chat history is not shared by signing in.</p><div class="inline-actions"><button class="quiet-button" data-action="cancel-signin">Cancel sign-in</button></div>`, () => { api('cancelSignIn').catch(() => {}); });
  try {
    await api('connect', { key }); closeModal(); await refresh();
    if (current.auth.planEnabled && current.auth.welcome) {
      modal('Connected', `<div class="welcome"><h3>You’re using your ChatGPT plan.</h3><p>Eligible AI requests in Aftertaste use your ChatGPT plan. Manage access and usage limits in ChatGPT settings.</p><p>Your new account has its own shelf. The offline shelf remains available in Settings.</p><div class="inline-actions"><button class="button" data-action="acknowledge">Got it</button><button class="quiet-button" data-action="usage">Manage usage ↗</button></div></div>`);
    } else { settingsDialog(); if (!current.auth.planEnabled) error('ChatGPT plan usage was not enabled. Reconnect and review the permission.'); }
  } catch (e) { if ($('#modal').open) error(e.message); else toast(e.message); }
}
document.addEventListener('change', async e => {
  if (e.target.dataset.sourceToggle) {
    try { await api('toggleSource', { id: e.target.dataset.sourceToggle, enabled: e.target.checked }); await refresh(); } catch (err) { error(err.message); }
  }
});
document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button || button.disabled) return;
  try {
    const d = button.dataset;
    if (d.filter) { filter = d.filter; renderLibrary(); return; }
    if (d.focus) { focused = d.focus; renderLibrary(); return; }
    if (d.story) return thoughtsDialog(d.story);
    if (d.edit) return storyForm(current.library.materials.find(m => m.id === d.edit));
    if (d.addTab) return addDialog(d.addTab);
    if (d.result !== undefined) return storyForm(searchResults[Number(d.result)]);
    if (d.url) return await api('openExternal', { url: d.url });
    if (d.selectAccount) { await api('selectAccount', { key: d.selectAccount }); await refresh(); return settingsDialog(); }
    if (d.reconnect) return connect(d.reconnect);
    if (d.removeSource) { if (!confirm('Remove this context source and clear recommendations based on it?')) return; await api('removeSource', { id: d.removeSource }); await refresh(); return settingsDialog(); }
    if (d.savePick !== undefined) { await api('saveStory', current.library.recommendations[Number(d.savePick)]); await refresh(); return toast('Saved to your library.'); }
    if (d.dismiss) { await api('dismiss', { id: d.dismiss }); return await refresh(); }
    if (d.deleteStory) { if (!confirm('Delete this story and its impressions from this shelf?')) return; await api('deleteStory', { id: d.deleteStory }); closeModal(); return await refresh(); }
    if (d.deleteNote) { if (!confirm('Delete this impression?')) return; await api('deleteNote', { storyId: d.parent, id: d.deleteNote }); await refresh(); return thoughtsDialog(d.parent); }
    const action = d.action;
    if (action === 'library' || action === 'for-you') { section = action; render(); }
    if (action === 'close') closeModal();
    if (action === 'add') addDialog();
    if (action === 'manual-story') storyForm();
    if (action === 'settings') settingsDialog();
    if (action === 'import') await importDialog();
    if (action === 'commit-import') { await api('importCommit', { ids: [...document.querySelectorAll('[name="import-source"]:checked')].map(el => el.value) }); closeModal(); await refresh(); toast('Chosen context imported locally.'); }
    if (action === 'restore-backup') { await api('importCommit', { restore: true }); closeModal(); await refresh(); toast('Backup restored to this shelf.'); }
    if (action === 'export') { const result = await api('export'); if (result.saved) toast('Your library backup is saved.'); }
    if (action === 'open-data') await api('openDataFolder');
    if (action === 'recommend') await recommendationDialog();
    if (action === 'cancel-recommendation') await api('cancelRecommendation');
    if (action === 'connect') await connect();
    if (action === 'cancel-signin') { await api('cancelSignIn'); closeModal(); }
    if (action === 'disconnect') { const result = await api('disconnect'); await refresh(); settingsDialog(); if (result.warning) error(result.warning); }
    if (action === 'acknowledge') { await api('acknowledge'); closeModal(); await refresh(); }
    if (action === 'usage') await api('openExternal', { url: current.auth.usageUrl || 'https://chatgpt.com/#settings/Usage' });
    if (action === 'github') await api('openExternal', { url: 'https://github.com/ansvier/aftertaste' });
    if (action === 'export-help') await api('openExternal', { url: 'https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data' });
  } catch (err) { error(err.message); }
});
window.aftertaste?.onUpdate(async data => {
  if (data.progress) { progress = data.progress; if ($('#progress')) $('#progress').textContent = progress; }
  else { try { await refresh(); } catch (e) { toast(e.message); } }
});
refresh().catch(e => { $('#content').innerHTML = `<p class="notice">${esc(e.message)}</p>`; });
