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
      line.textContent = `・セット間レスト: ${sec}秒。各セット終了後、きつさを記録した時点で自動開始`;
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

  function startRecommendedRest(rpe) {
    if (typeof currentExercise === 'undefined' || !currentExercise) return;
    if (typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length) return;
    if (typeof startRest !== 'function') return;

    const reps = typeof inputReps !== 'undefined' ? Number(inputReps.value) : 0;
    const sec = recommendRestSec(currentExercise, reps, rpe);
    window.__autoRestSec = sec;
    setAdvisorRest(sec);
    startRest(sec);
    const chip = document.querySelector(`.rest-chip[data-rest="${sec}"]`);
    if (chip) chip.classList.add('running');
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    baseSelectExercise(name);
    setTimeout(refreshAutoRest, 0);
  };

  // A set physically ends before the final batch-save action. Use the effort tap
  // as the per-set completion signal, then start the recommended rest immediately.
  // Keep the same effort selected so the user can tap the same chip after each set.
  document.querySelectorAll('#rpeRow .rpe-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = Number(btn.dataset.rpe);
      if (typeof currentRPE !== 'undefined') currentRPE = selected;
      document.querySelectorAll('#rpeRow .rpe-chip').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.rpe) === selected);
      });
      refreshAutoRest();
      startRecommendedRest(selected);
    });
  });

  if (typeof inputReps !== 'undefined' && inputReps) {
    inputReps.addEventListener('input', refreshAutoRest);
  }

  // Intentionally do not start rest from #addSetBtn. That action is the final
  // record/save step after the working sets are already finished.

  window.recommendRestSec = recommendRestSec;
})();
