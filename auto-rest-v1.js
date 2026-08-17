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
      line.textContent = `・セット間レスト: ${sec}秒を自動設定`;
      logic.appendChild(line);
    }

    document.querySelectorAll('.rest-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(Number(chip.dataset.rest) === sec));
      chip.title = Number(chip.dataset.rest) === sec ? '自動おすすめ' : '';
    });
  }

  function refreshAutoRest() {
    if (typeof currentExercise === 'undefined' || !currentExercise) return;
    const reps = typeof inputReps !== 'undefined' ? Number(inputReps.value) : 0;
    const rpe = typeof currentRPE !== 'undefined' ? currentRPE : null;
    const sec = recommendRestSec(currentExercise, reps, rpe);
    window.__autoRestSec = sec;
    setAdvisorRest(sec);
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    baseSelectExercise(name);
    setTimeout(refreshAutoRest, 0);
  };

  document.querySelectorAll('#rpeRow .rpe-chip').forEach((btn) => {
    btn.addEventListener('click', () => setTimeout(refreshAutoRest, 0));
  });
  if (typeof inputReps !== 'undefined' && inputReps) {
    inputReps.addEventListener('input', refreshAutoRest);
  }

  let addContext = null;
  const addBtn = document.getElementById('addSetBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const reps = typeof inputReps !== 'undefined' ? Number(inputReps.value) : 0;
      const rpe = typeof currentRPE !== 'undefined' ? currentRPE : null;
      const name = typeof currentExercise !== 'undefined' ? currentExercise : '';
      const weight = typeof inputWeight !== 'undefined' ? Number(inputWeight.value) : NaN;
      const editing = typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length > 0;
      addContext = {
        valid: !!name && Number.isFinite(weight) && reps > 0 && !editing,
        sec: recommendRestSec(name, reps, rpe),
      };
    }, true);

    addBtn.addEventListener('click', () => {
      const ctx = addContext;
      addContext = null;
      if (!ctx || !ctx.valid || typeof startRest !== 'function') return;
      startRest(ctx.sec);
      const chip = document.querySelector(`.rest-chip[data-rest="${ctx.sec}"]`);
      if (chip) chip.classList.add('running');
    });
  }

  window.recommendRestSec = recommendRestSec;
})();
