const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { LibraryStore, atomicWrite } = require('../src/storage.cjs');
const { prepareUpdateBackup, snapshotLibraries, portableBackup, copyOfflineLibrary } = require('../src/backups.cjs');
const { parseImport } = require('../src/import.cjs');
const L = require('../renderer/library-tools.js');
const root = path.resolve(__dirname, '..');
test('translations have matching keys and interpolation fields; UI keys resolve in every language', async () => {
  const dictionaries = await Promise.all(['en','ru','fr'].map(async l => JSON.parse(await fs.readFile(path.join(root,'renderer','locales',`${l}.json`),'utf8'))));
  const variables = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const d of dictionaries) {
    assert.deepEqual(Object.keys(d).sort(), Object.keys(dictionaries[0]).sort());
    for (const key of Object.keys(d)) { assert.equal(typeof d[key], 'string'); assert(d[key].trim()); assert.deepEqual(variables(d[key]), variables(dictionaries[0][key]), key); }
  }
  const app = await fs.readFile(path.join(root,'renderer','app.js'),'utf8');
  const html = await fs.readFile(path.join(root,'renderer','index.html'),'utf8');
  const keys = [...app.matchAll(/\b(?:t|tx)\('([a-zA-Z][a-zA-Z.]+)'/g),...html.matchAll(/data-i18n(?:-[\w-]+)?="([\w.]+)"/g)].map(m=>m[1]);
  for (const key of keys) assert(key in dictionaries[0], key);
});
test('notes are searchable across languages and auto tags work locally without an AI account', async () => {
  const dictionaries = JSON.parse(await fs.readFile(path.join(root,'renderer','locales','fr.json'),'utf8'));
  const rules = JSON.parse(await fs.readFile(path.join(root,'renderer','locales','tag-rules.json'),'utf8')); L.configure(rules);
  const tag = dictionaries['topic.philosophy'];
  const materials = [{ id:'test', title:'Synthetic story', creator:'Test', type:'book', tags:[], notes:[{id:'note',text:`${tag} and science-fiction: a useful thought.`}] }];
  const found = L.search(materials,tag.toUpperCase(),'all',id=>dictionaries[`topic.${id}`]);
  assert.equal(found.stories.length,1); assert.equal(found.notes[0].note.id,'note'); assert(L.autoTags(materials[0]).includes('philosophy'));
  assert.equal(L.search(materials,'unrelated','all').stories.length,0); assert.equal(L.search(materials,tag,'game').stories.length,0);
  assert.equal(L.search(materials,'#Science-fiction','book',id=>dictionaries[`topic.${id}`]).stories.length,1);
  assert(L.excerpt('a'.repeat(80)+' matching thought','matching').includes('matching'));
});
test('upgrading snapshots all shelves and media once, preserves originals and excludes credentials', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'at-backup-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const store = new LibraryStore(dir), key='a'.repeat(64), bytes=Buffer.from('Synthetic audio bytes');
  const asset = await store.saveAsset('local',bytes,'audio/webm');
  await store.update('local',d=>d.materials.push({id:'story',title:'Synthetic',notes:[{id:'note',text:'A thought',audioAsset:asset}]}));
  await store.update(key,d=>d.sources.push({id:'source',body:'Chosen synthetic context'}));
  await atomicWrite(path.join(dir,'credentials.enc'),Buffer.from('synthetic-credential-marker'));
  const before=await store.read('local');const first=await prepareUpdateBackup(dir,'0.3.0'); assert.equal(first.shelves,2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(first.folder,'libraries','local','library.json'),'utf8')),before);
  assert.deepEqual(await fs.readFile(path.join(first.folder,'libraries','local','assets',asset)),bytes);
  await assert.rejects(fs.stat(path.join(first.folder,'credentials.enc')), {code:'ENOENT'});
  assert.equal(await prepareUpdateBackup(dir,'0.3.0'),null);
  assert.deepEqual(await store.read('local'),before);
  const next=await prepareUpdateBackup(dir,'0.4.0');assert(next.folder!==first.folder);
  const portable=await portableBackup(store,'local'); assert.deepEqual(Buffer.from(portable.assets[asset],'base64'),bytes); assert.deepEqual(portable.library,before);
  assert.equal((await fs.stat(path.join(first.folder,'snapshot.json'))).mode&0o777,process.platform==='win32'? (await fs.stat(path.join(first.folder,'snapshot.json'))).mode&0o777:0o600);
});
test('snapshot failure cannot mark an update safe or alter library data', async t => {
  if(process.platform==='win32') return;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'at-backup-fail-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new LibraryStore(dir);
  await store.update('local',d=>d.materials.push({id:'s',title:'Synthetic',notes:[]}));
  const file=path.join(store.folder('local'),'library.json'),target=path.join(dir,'source.json');await fs.rename(file,target);await fs.symlink(target,file);
  await assert.rejects(prepareUpdateBackup(dir,'new'),/unsupported file/);await assert.rejects(fs.stat(path.join(dir,'app-version.json')),{code:'ENOENT'});
  assert.equal((await store.read('local')).materials[0].title,'Synthetic');
});
test('first connection copies the offline library and media without overwriting another account', async t => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'at-connect-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=new LibraryStore(dir),key='b'.repeat(64);
  const image=await store.saveAsset('local',Buffer.from('synthetic-cover'),'image/png');
  await store.update('local',d=>d.materials.push({id:'s',title:'Synthetic',coverAsset:image,notes:[{text:'My existing note'}]}));
  assert.equal(await copyOfflineLibrary(store,key),true);assert.equal((await store.read(key)).materials[0].notes[0].text,'My existing note');
  assert.deepEqual(await store.asset(key,image),await store.asset('local',image));assert.equal((await store.read('local')).materials.length,1);
  await store.update('local',d=>d.materials.push({id:'other',title:'Later',notes:[]}));
  assert.equal(await copyOfflineLibrary(store,key),false);assert.equal((await store.read(key)).materials.length,1);
});
test('exported context can be imported without a ChatGPT account or a full backup restore', () => {
  const result=parseImport('aftertaste-context.json',JSON.stringify({application:'aftertaste-context',version:1,sources:[{title:'Chosen',body:'My synthetic words.',kind:'document'}]}));
  assert.equal(result.length,1);assert.equal(result[0].body,'My synthetic words.');
});
