(function () {
  'use strict';

  // One-time data migration from the latest ChocoZAP measurement supplied on 2026-08-10.
  // Keeps any body-composition fields already stored for the same date.
  const LATEST_WEIGHT = { date: '2026-08-10', weight: 69.6, source: 'chocozap' };

  function applyLatestWeight() {
    if (typeof state === 'undefined' || !state) return false;
    if (!Array.isArray(state.weights)) state.weights = [];

    let changed = false;
    const idx = state.weights.findIndex((x) => x && x.date === LATEST_WEIGHT.date);

    if (idx >= 0) {
      const current = state.weights[idx] || {};
      if (Number(current.weight) !== LATEST_WEIGHT.weight || current.source !== LATEST_WEIGHT.source) {
        state.weights[idx] = { ...current, ...LATEST_WEIGHT };
        changed = true;
      }
    } else {
      state.weights.push({ ...LATEST_WEIGHT });
      changed = true;
    }

    state.weights.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    if (state.profile && Number(state.profile.weight) !== LATEST_WEIGHT.weight) {
      state.profile.weight = LATEST_WEIGHT.weight;
      changed = true;
    }

    if (!changed) return false;

    state.updatedAt = Date.now();
    if (typeof STORAGE_KEY !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    if (typeof renderWeightChart === 'function') renderWeightChart();
    if (typeof renderWeightEntryList === 'function') renderWeightEntryList();
    if (typeof loadProfileForm === 'function') loadProfileForm();
    if (typeof renderCoach === 'function') renderCoach();

    // If this device has GitHub write credentials, persist the migration to data.json.
    if (typeof scheduleSync === 'function') scheduleSync();
    return true;
  }

  // Ensure the measurement is applied after remote data has been loaded, not before it.
  if (typeof performInitialSync === 'function') {
    const baseInitialSync = performInitialSync;
    performInitialSync = async function () {
      const result = await baseInitialSync.apply(this, arguments);
      applyLatestWeight();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(applyLatestWeight, 0);
  });

  window.addEventListener('load', () => {
    setTimeout(applyLatestWeight, 500);
  });
})();
