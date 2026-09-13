(function () {
  'use strict';

  function ensureRecommendationBox() {
    let box = document.getElementById('hypertrophyRecommendation');
    if (box) return box;
    const card = document.querySelector('#setEntryCard .card');
    if (!card) return null;
    const weightWrap = document.getElementById('weightPickerButton')?.parentElement;
    if (!weightWrap) return null;

    box = document.createElement('div');
    box.id = 'hypertrophyRecommendation';
    box.style.cssText = 'margin:0 0 12px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-sm);';
    box.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;">
        <span style="font-size:10.5px;color:var(--muted);font-weight:700;letter-spacing:.12em;">筋肥大おすすめ</span>
        <span id="hypertrophyRecommendationValue" class="num" style="font-size:18px;color:var(--accent);font-weight:800;text-align:right;"></span>
      </div>
      <details id="hypertrophyRecommendationDetails" style="margin-top:8px;border-top:1px solid var(--border-soft);padding-top:8px;">
        <summary style="cursor:pointer;color:var(--muted);font-size:11px;font-weight:600;list-style:none;">提案ロジックを見る</summary>
        <div id="hypertrophyRecommendationLogic" style="margin-top:8px;color:var(--text-soft);font-size:11px;line-height:1.7;"></div>
      </details>`;
    card.insertBefore(box, weightWrap);
    return box;
  }

  function getRecommendation(name) {
    if (!window.REPSEngine || typeof window.REPSEngine.recommendExercise !== 'function') return null;
    const selectedIso = dateInput.value || todayStr();
    return window.REPSEngine.recommendExercise(name, selectedIso);
  }

  function renderRecommendation(name) {
    const box = ensureRecommendationBox();
    if (!box || !name) {
      if (box) box.style.display = 'none';
      return;
    }

    const rec = getRecommendation(name);
    if (!rec) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'block';
    const value = document.getElementById('hypertrophyRecommendationValue');
    const logic = document.getElementById('hypertrophyRecommendationLogic');
    const details = document.getElementById('hypertrophyRecommendationDetails');

    if (value) value.textContent = `${rec.title} ・ レスト${rec.rest}秒`;
    if (logic) logic.innerHTML = rec.lines.map((line) => `<div>・${escapeHTML(line)}</div>`).join('');
    if (details) details.open = false;

    // One canonical recommendation drives the plan, record form and coach cards.
    // Only prefill before this exercise has any sets today, so actual workout input is never overwritten mid-session.
    if (Array.isArray(pendingSets) && pendingSets.length === 0
        && !(Array.isArray(editingGroupIndices) && editingGroupIndices.length)) {
      if (Number.isFinite(Number(rec.weight)) && Number(rec.weight) >= 0) setInputWeight(rec.weight);
      if (Number(rec.reps) > 0) inputReps.value = rec.reps;
      if (Number(rec.sets) > 0) inputSets.value = rec.sets;
      if (typeof refreshAddBtnLabel === 'function') refreshAddBtnLabel();
    }

    window.__currentExerciseRecommendation = rec;
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    const result = baseSelectExercise(name);
    renderRecommendation(name);
    return result;
  };

  const baseOnDateChange = onDateChange;
  onDateChange = function () {
    const result = baseOnDateChange();
    if (currentExercise) renderRecommendation(currentExercise);
    return result;
  };

  // Do not recompute a different target after every completed set.
  // The prescription is fixed for the exercise session and is recalculated next time the exercise is opened.
  window.renderExerciseRecommendation = renderRecommendation;
})();