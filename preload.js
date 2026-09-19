'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wordnest', {
  desktop: true,
  getState: () => ipcRenderer.invoke('store:get'),
  addWords: (bookId, words) => ipcRenderer.invoke('store:addWords', { bookId, words }),
  updateWord: (bookId, id, patch) => ipcRenderer.invoke('store:updateWord', { bookId, id, patch }),
  deleteWord: (bookId, id) => ipcRenderer.invoke('store:deleteWord', { bookId, id }),
  deleteWords: (bookId, ids) => ipcRenderer.invoke('store:deleteWords', { bookId, ids }),
  reviewWord: (bookId, id, rating) => ipcRenderer.invoke('store:reviewWord', { bookId, id, rating }),
  updateSettings: (patch) => ipcRenderer.invoke('store:updateSettings', patch),
  exportData: () => ipcRenderer.invoke('store:export'),
  importData: () => ipcRenderer.invoke('store:import'),
  getDataInfo: () => ipcRenderer.invoke('store:info'),
  openDataFolder: () => ipcRenderer.invoke('store:openFolder'),
  recognizeImage: (payload) => ipcRenderer.invoke('ocr:recognize', payload),
  lookupWord: (word) => ipcRenderer.invoke('dict:lookup', word),
  lookupExamples: (word, sense) => ipcRenderer.invoke('dict:examples', { word, sense }),
  onStartReview: (handler) => {
    const wrapped = () => handler();
    ipcRenderer.on('review:start', wrapped);
    return () => ipcRenderer.removeListener('review:start', wrapped);
  },
});
