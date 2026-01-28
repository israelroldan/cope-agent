import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('timerAPI', {
  dismiss: () => ipcRenderer.send('timer-dismiss'),
  onFadeOut: (callback: () => void) => ipcRenderer.on('timer-fade-out', callback),
});
