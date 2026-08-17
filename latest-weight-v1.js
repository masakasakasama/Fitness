(function () {
  'use strict';

  // One-time data migration from the latest ChocoZAP body-composition measurement.
  // Extra body-composition fields are stored alongside the weight entry even if the
  // current UI only renders weight, so future coach logic can use them without data loss.
  const LATEST_MEASUREMENT = {
    date: '2026-08-17',
    weight: 69.4,
    bmi: 20.7,
    bodyFatPct: 14.4,
    bodyWaterPct: 57.1,
    skeletalMusclePct: 46.1,
    boneMassKg: 3.3,
    bmrKcal: 1669,
    visceralFatLevel: 4,
    bodyAge: 20,
    proteinPct: 23.7,
    fatFreeMassKg: 59.4,
    source: 'chocozap'
  };

  function sameMeasurement(current) {
    return Object.keys(LATEST_MEASUREMENT).every((key) => current && current[key] === LATEST_MEASUREMENT[key]);
  }

  function applyLatestWeight() {
    if (typeof state === 'undefined' || !state) return false;
    if (!Array.isArray(state.weights)) state.weights = [];

    let changed = false;
    const idx = state.weights.findIndex((x) => x && x.date === LATEST_MEASUREMENT.date);

    if (idx >= 0) {
      const current = state.weights[idx] || {};
      if (!sameMeasurement(current)) {
        state.weights[idx] = { ...current, ...LATEST_MEASUREMENT };
        changed = true;
      }
    } else {
      state.weights.push({ ...LATEST_MEASUREMENT });
      changed = true;
    }

    state.weights.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    if (state.profile && Number(state.profile.weight) !== LATEST_MEASUREMENT.weight) {
      state.profile.weight = LATEST_MEASUREMENT.weight;
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
