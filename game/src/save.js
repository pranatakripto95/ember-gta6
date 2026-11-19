// Ember Vice — save.js
// One job: persist and restore the player's progress in localStorage.
// Save holds cash, mission progress, collectibles found, position and health.
// A missing or corrupt save simply means a fresh game.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
}

export function hasSave() { return loadSave() !== null; }
