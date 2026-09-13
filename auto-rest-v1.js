(function () {
  'use strict';

  function isCompound(name) {
    return /チェストプレス|インクライン.*プレス|マルチプレス|ショルダープレス|ラットプル|シーテッドロー|懸垂|デッドリフト|レッグプレス|スクワット/.test(name || '');
  }

  function isIsolation(name) {
    return /サイドレイズ|リアレイズ|フライ|カール|トライセ|プレスダウン|アブドミナル|カーフ/.test(name || '');
  }

  function recommendRestSec(name, reps, rpe) {
    const n = Number(reps) || 0;
    const effort = Number(rpe) || 0;

    if (effort === 3) return 120;
    if (isCompound(name)) return 120;
    if (isIsolation(name)) {
      if (effort === 1 && n >= 15) return 60;
      return 90;
    }
    return effort >= 2 || n <= 10 ? 120 : 90;
  }

  function setAdvisorRest(sec) {
    const value = document.getElementById('hypertrophyRecommendationValue');
    if (value && !/レスト/.test(value.textContent || '')) {
      value.textContent = `${value.textContent} ・ レスト${sec}秒`;
    } else if (value) {
      value.textContent = (value.textContent || '').replace(/レスト\d+秒/, `レスト${sec}秒`);
    }

    const logic = document.getElementById('hypertrophyRecommendationLogic');
    if (logic) {
      const old = logic.querySelector('[data-auto-rest-line]');
      if (old) old.remove();
      const line = document.createElement('div');
      line.dataset.autoRestLine = '1';
      line.textContent = `・セット完了を押した瞬間からレスト${sec}秒を自動開始。きつさはレスト中に入力でき、残り時間だけ補正`;
      logic.appendChild(line);
    }

    document.querySelectorAll('.rest-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.rest) === sec));
      chip.title = Number(chip.dataset.rest) === sec ? '自動おすすめ' : '';
      chip.classList.toggle('running', !!restState && Number(chip.dataset.rest) === sec);
    });
  }

  function refreshAutoRest() {
    if (typeof currentExercise === 'undefined' || !currentExercise) return;
    const reps = typeof inputReps !== 'undefined' ? Number(inputReps.value) : 0;
    const sec = recommendRestSec(currentExercise, reps, null);
    window.__autoRestSec = sec;
    setAdvisorRest(sec);
  }

  function startRecommendedRest(rpe) {
    if (typeof currentExercise === 'undefined' || !currentExercise) return 0;
    if (typeof startRest !== 'function') return 0;
    const reps = typeof inputReps !== 'undefined' ? Number(inputReps.value) : 0;
    const sec = recommendRestSec(currentExercise, reps, rpe);
    window.__autoRestSec = sec;
    window.__autoRestStartedAt = Date.now();
    setAdvisorRest(sec);
    startRest(sec);
    setAdvisorRest(sec);
    return sec;
  }

  function adjustRunningRest(sec) {
    window.__autoRestSec = sec;
    setAdvisorRest(sec);
    if (!restState || !window.__autoRestStartedAt) return;
    restState.sec = sec;
    restState.endAt = window.__autoRestStartedAt + sec * 1000;
    setAdvisorRest(sec);
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    baseSelectExercise(name);
    setTimeout(refreshAutoRest, 0);
  };

  document.querySelectorAll('#rpeRow .rpe-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length) return;
      const idx = Number(window.__awaitingRpeForSetIndex);
      if (!Number.isInteger(idx) || !Array.isArray(pendingSets) || idx < 0 || idx >= pendingSets.length) return;

      const selected = typeof currentRPE !== 'undefined' ? currentRPE : null;
      if (selected) pendingSets[idx].rpe = Number(selected);
      else delete pendingSets[idx].rpe;

      if (typeof commitCurrentExercise === 'function') commitCurrentExercise(false);

      const reps = Number(pendingSets[idx].reps) || Number(inputReps.value) || 0;
      const sec = recommendRestSec(currentExercise, reps, selected);
      adjustRunningRest(sec);
    });
  });

  if (typeof inputReps !== 'undefined' && inputReps) {
    inputReps.addEventListener('input', refreshAutoRest);
  }

  window.recommendRestSec = recommendRestSec;
  window.startRecommendedRest = startRecommendedRest;
  window.adjustRunningRest = adjustRunningRest;
})();