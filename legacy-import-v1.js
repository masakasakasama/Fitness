(function () {
  'use strict';

  const STORAGE_KEY = 'gym-tracker-v1';

  function decodeBase64Utf8(encoded) {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function setCount(session) {
    return (session?.exercises || []).reduce((sum, ex) => sum + (ex.sets || []).length, 0);
  }

  function mergeExerciseSets(currentEx, legacyEx) {
    if (!currentEx) return legacyEx;
    if (!legacyEx) return currentEx;

    const currentSets = currentEx.sets || [];
    const legacySets = legacyEx.sets || [];

    if (legacySets.length > currentSets.length) return legacyEx;
    if (currentSets.length > legacySets.length) return currentEx;

    const legacyRpe = legacySets.filter(s => s.rpe != null).length;
    const currentRpe = currentSets.filter(s => s.rpe != null).length;
    return legacyRpe >= currentRpe ? legacyEx : currentEx;
  }

  function mergeSession(current, legacy) {
    if (!current) return legacy;
    if (!legacy) return current;

    const byName = new Map();
    for (const ex of current.exercises || []) byName.set(ex.name, ex);
    for (const ex of legacy.exercises || []) {
      byName.set(ex.name, mergeExerciseSets(byName.get(ex.name), ex));
    }

    const merged = {
      ...current,
      ...legacy,
      id: legacy.id || current.id,
      date: legacy.date || current.date,
      exercises: [...byName.values()],
    };

    return setCount(legacy) >= setCount(current) ? { ...merged, ...legacy, exercises: merged.exercises } : merged;
  }

  function mergeState(current, legacy) {
    const merged = { ...(current || {}), ...(legacy || {}) };

    const sessionByDate = new Map();
    for (const s of current?.sessions || []) sessionByDate.set(s.date, s);
    for (const s of legacy?.sessions || []) sessionByDate.set(s.date, mergeSession(sessionByDate.get(s.date), s));
    merged.sessions = [...sessionByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    const weightByDate = new Map();
    for (const w of current?.weights || []) weightByDate.set(w.date, w);
    for (const w of legacy?.weights || []) {
      weightByDate.set(w.date, { ...(weightByDate.get(w.date) || {}), ...w });
    }
    merged.weights = [...weightByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    const exerciseByName = new Map();
    for (const e of current?.exercises || []) exerciseByName.set(e.name, e);
    for (const e of legacy?.exercises || []) exerciseByName.set(e.name, e);
    merged.exercises = [...exerciseByName.values()];

    merged.exerciseObservations = current?.exerciseObservations || legacy?.exerciseObservations || [];
    merged.sessionSummaries = current?.sessionSummaries || legacy?.sessionSummaries || [];

    merged.profile = { ...(current?.profile || {}), ...(legacy?.profile || {}) };
    if (merged.weights.length) merged.profile.weight = merged.weights[merged.weights.length - 1].weight;

    merged.hiit = legacy?.hiit || current?.hiit;
    merged.updatedAt = Math.max(Number(current?.updatedAt) || 0, Number(legacy?.updatedAt) || 0, Date.now());
    return merged;
  }

  function importBase64(encoded) {
    try {
      const raw = decodeBase64Utf8(encoded);
      const legacy = JSON.parse(raw);

      if (!legacy || !Array.isArray(legacy.sessions) || !Array.isArray(legacy.exercises)) {
        throw new Error('invalid legacy data');
      }

      let current = null;
      try {
        current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      } catch {}

      const merged = mergeState(current || window.REPS_BUNDLED_DATA || {}, legacy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem('reps-legacy-migrated-at', String(Date.now()));

      const sessionCount = merged.sessions.length;
      const setTotal = merged.sessions.reduce((sum, s) => sum + setCount(s), 0);
      alert(`旧PWAの全データを移行しました\n${sessionCount}セッション / ${setTotal}セット\nアプリを再読み込みします`);
      location.reload();
      return true;
    } catch (e) {
      alert('旧PWAデータの移行に失敗しました');
      return false;
    }
  }

  window.REPSLegacyImport = Object.freeze({ importBase64, mergeState });
})();