const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['state', 'search', 'saveStory', 'deleteStory', 'addNote', 'deleteNote', 'asset', 'importPreview', 'importCommit', 'removeSource', 'toggleSource', 'export', 'connect', 'cancelSignIn', 'selectAccount', 'disconnect', 'acknowledge', 'models', 'recommend', 'cancelRecommendation', 'dismiss', 'openExternal', 'openDataFolder']);
contextBridge.exposeInMainWorld('aftertaste', {
  invoke: (action, payload) => {
    if (!actions.has(action)) return Promise.reject(new Error('Unsupported action.'));
    return ipcRenderer.invoke('aftertaste:action', action, payload);
  },
  onUpdate: (listener) => {
    const fn = (_event, data) => listener(data);
    ipcRenderer.on('aftertaste:update', fn);
    return () => ipcRenderer.removeListener('aftertaste:update', fn);
  }
});
