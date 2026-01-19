/**
 * Preload script for debug window
 * Exposes IPC methods to renderer process
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openStudio: () => ipcRenderer.invoke('open-studio'),
  getStudioStatus: () => ipcRenderer.invoke('get-studio-status'),
});
