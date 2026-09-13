(function () {
  'use strict';

  const addBtn = document.getElementById('addSetBtn');
  const addLabel = document.getElementById('addSetLabel');
  const rpeButtons = Array.from(document.querySelectorAll('#rpeRow .rpe-chip'));

  function targetSets() {
    return Math.max(1, Math.min(10, parseInt(inputSets.value, 10) || 1));
  }

  function setRpeEnabled(enabled) {
    rpeButtons.forEach((b) => { b.disabled = !enabled; });
  }

  function clearRpeSelection() {
    if (typeof resetRPE === 'function') resetRPE();
    else {
      currentRPE = null;
      rpeButtons.forEach((b) => b.classList.remove('active'));
    }
  }

  function showLastSetRpe() {
    const idx = Number(window.__awaitingRpeForSetIndex);
    const set = Number.isInteger(idx) && Array.isArray(pendingSets) ? pendingSets[idx] : null;
    const rpe = set && Number(set.rpe);
    currentRPE = rpe >= 1 && rpe <= 3 ? rpe : null;
    rpeButtons.forEach((b) => b.classList.toggle('active', Number(b.dataset.rpe) === currentRPE));
  }

  function updateFlowUi() {
    if (!addBtn || !addLabel) return;
    if (typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length) return;

    const done = Array.isArray(pendingSets) ? pendingSets.length : 0;
    const target = targetSets();

    if (done >= target) {
      addLabel.textContent = `✓ 種目完了 ${done}/${target}`;
      addBtn.dataset.flowDone = '1';
    } else {
      addLabel.textContent = `1セット完了 ${done}/${target}`;
      addBtn.dataset.flowDone = '0';
    }

    window.__awaitingRpeForSetIndex = done > 0 ? done - 1 : -1;
    setRpeEnabled(done > 0);
    showLastSetRpe();
  }

  function relabelControls() {
    const setsWrap = inputSets && inputSets.parentElement && inputSets.parentElement.parentElement;
    const setsLabel = setsWrap && setsWrap.querySelector('label');
    if (setsLabel) setsLabel.textContent = '目標セット数';

    const rpeRow = document.getElementById('rpeRow');
    const rpeWrap = rpeRow && rpeRow.parentElement;
    const rpeLabel = rpeWrap && rpeWrap.querySelector('label');
    if (rpeLabel) rpeLabel.innerHTML = '直前セットのきつさ <span style="text-transform:none; letter-spacing:0; font-weight:400; color:var(--muted-soft);">（任意・レスト中）</span>';
  }

  const baseRefreshAddBtnLabel = refreshAddBtnLabel;
  refreshAddBtnLabel = function () {
    if (typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length) {
      return baseRefreshAddBtnLabel();
    }
    updateFlowUi();
  };

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    const result = baseSelectExercise(name);
    relabelControls();
    setTimeout(updateFlowUi, 0);
    return result;
  };

  inputSets.addEventListener('input', () => setTimeout(updateFlowUi, 0));

  addBtn.addEventListener('click', (event) => {
    if (typeof editingGroupIndices !== 'undefined' && Array.isArray(editingGroupIndices) && editingGroupIndices.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const w = parseFloat(inputWeight.value);
    const r = parseInt(inputReps.value, 10);
    if (isNaN(w) || isNaN(r) || r <= 0) {
      toast('重量と実際の回数を入力してください');
      return;
    }

    const target = targetSets();
    const doneBefore = pendingSets.length;
    if (doneBefore >= target) {
      toast('目標セット完了。追加するなら目標セット数を増やしてください');
      return;
    }

    clearRpeSelection();
    const completedSet = { weight: w, reps: r };
    pendingSets.push(completedSet);
    window.__awaitingRpeForSetIndex = pendingSets.length - 1;

    renderPending();
    commitCurrentExercise(false);

    const doneNow = pendingSets.length;
    setRpeEnabled(true);
    showLastSetRpe();

    if (doneNow < target) {
      if (typeof window.startRecommendedRest === 'function') window.startRecommendedRest(null);
      toast(`${doneNow}セット目完了・レスト開始`);
    } else {
      if (typeof stopRest === 'function') stopRest();
      window.__autoRestStartedAt = null;
      toast(`${doneNow}/${target}セット完了`);
    }

    updateFlowUi();
  }, true);

  relabelControls();
  updateFlowUi();
})();