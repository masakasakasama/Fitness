(function () {
  'use strict';

  const TARGETS = {
    compound: [8, 12],
    accessory: [10, 15],
  };

  function isAccessory(name) {
    return /サイドレイズ|リアレイズ|フライ|カール|トライセ|プレスダウン|アブドミナル|ロータリー|カーフ/.test(name || '');
  }

  function repRange(name) {
    return isAccessory(name) ? TARGETS.accessory : TARGETS.compound;
  }

  function daysBetween(laterIso, earlierIso) {
    if (!laterIso || !earlierIso) return 999;
    return Math.max(0, Math.floor((parseISO(laterIso) - parseISO(earlierIso)) / 86400000));
  }

  function median(nums) {
    const arr = nums.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function modeWeight(sets) {
    const counts = new Map();
    for (const s of sets) {
      const w = Number(s.weight);
      if (!Number.isFinite(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    if (!counts.size) return 0;
    return [...counts.entries()]
      .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
  }

  function prevStep(weight) {
    if (weight >= 15) return Math.max(0, weight - 5);
    if (weight >= 4) return Math.max(0, weight - 2);
    return Math.max(0, weight - 1);
  }

  function nextStep(weight) {
    if (typeof nextWeightStep === 'function') return nextWeightStep(weight);
    if (weight >= 15) return weight + 5;
    if (weight >= 4) return weight + 2;
    return weight + 1;
  }

  function snap(weight) {
    return typeof snapWeight === 'function' ? snapWeight(weight) : weight;
  }

  function priorSessionsFor(name, beforeIso) {
    return state.sessions
      .filter((s) => s.date < beforeIso && s.exercises.some((e) => e.name === name))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function groupFor(name) {
    if (typeof exerciseGroup === 'function') return exerciseGroup(name);
    const found = state.exercises.find((e) => e.name === name);
    return found ? found.group : '—';
  }

  function previousGroupLoad(group, beforeIso) {
    const candidates = state.sessions
      .filter((s) => s.date < beforeIso && s.exercises.some((e) => groupFor(e.name) === group))
      .sort((a, b) => b.date.localeCompare(a.date));
    const session = candidates[0];
    if (!session) return null;
    let sets = 0;
    let limitSets = 0;
    for (const ex of session.exercises) {
      if (groupFor(ex.name) !== group) continue;
      sets += ex.sets.length;
      limitSets += ex.sets.filter((s) => s.rpe === 3).length;
    }
    return { date: session.date, sets, limitSets };
  }

  function summarizeRpe(sets) {
    const rpes = sets.map((s) => Number(s.rpe)).filter((v) => v >= 1 && v <= 3);
    if (!rpes.length) return { label: '未記録', avg: null, limitRate: 0, easyRate: 0, count: 0 };
    const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    const limitRate = rpes.filter((v) => v === 3).length / rpes.length;
    const easyRate = rpes.filter((v) => v === 1).length / rpes.length;
    let label = '普通';
    if (limitRate >= 0.5) label = `限界 ${rpes.filter((v) => v === 3).length}/${rpes.length}セット`;
    else if (easyRate >= 0.5) label = '余裕多め';
    return { label, avg, limitRate, easyRate, count: rpes.length };
  }

  function buildRecommendation(name, selectedIso) {
    const prior = priorSessionsFor(name, selectedIso);
    const [lo, hi] = repRange(name);
    if (!prior.length) {
      const currentWeight = Number(inputWeight.value);
      const starter = Number.isFinite(currentWeight) && currentWeight > 0
        ? currentWeight
        : (state.profile && typeof starterWeight === 'function' ? starterWeight(name, state.profile) : 0);
      return {
        weight: snap(starter || 0), reps: lo, sets: 3,
        title: starter ? `${fmtNum(snap(starter))}kg × ${lo}回 × 3セット` : `${lo}〜${hi}回 × 3セット`,
        lines: [
          '前回記録なし',
          `筋肥大用の初回目安は${lo}〜${hi}回。フォームを崩さず2〜3回余裕が残る重量から開始`,
          '次回以降は回数ときつさを見て重量を自動調整',
        ],
      };
    }

    const last = prior[0];
    const ex = last.exercises.find((e) => e.name === name);
    const workWeight = modeWeight(ex.sets);
    const workSets = ex.sets.filter((s) => Number(s.weight) === workWeight);
    const reps = workSets.map((s) => Number(s.reps) || 0);
    const avgReps = reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;
    const minReps = reps.length ? Math.min(...reps) : 0;
    const maxReps = reps.length ? Math.max(...reps) : 0;
    const rpe = summarizeRpe(workSets);
    const days = daysBetween(selectedIso, last.date);
    const group = groupFor(name);
    const groupLoad = previousGroupLoad(group, selectedIso);
    const sameGroupYesterday = groupLoad && daysBetween(selectedIso, groupLoad.date) <= 1;
    const highGroupFatigue = sameGroupYesterday && (groupLoad.sets >= 6 || (groupLoad.limitSets >= 2));

    let weight = workWeight;
    let targetReps = Math.max(lo, Math.min(hi, Math.round(avgReps) || lo));
    let targetSets = Math.max(2, Math.min(3, workSets.length || 3));
    const reasons = [];

    if (days >= 21) {
      weight = prevStep(workWeight);
      targetReps = lo;
      targetSets = 3;
      reasons.push(`前回から${days}日空いているため、復帰初回は1段階落として再開`);
    } else if (days >= 14) {
      weight = prevStep(workWeight);
      targetReps = Math.max(lo, Math.min(hi, Math.round(avgReps)));
      targetSets = 3;
      reasons.push(`前回から${days}日空いているため、筋力低下を見込み1段階落とす`);
    } else if (highGroupFatigue) {
      if (rpe.limitRate >= 0.5 || avgReps <= lo + 1) {
        weight = prevStep(workWeight);
        targetReps = Math.min(hi, lo + 2);
        reasons.push(`同じ${group}を前日にも高負荷で実施しているため、今日は1段階軽くする`);
      } else {
        weight = workWeight;
        targetReps = Math.max(lo, Math.floor(avgReps));
        reasons.push(`同じ${group}を前日にも実施しているため、重量アップはしない`);
      }
    } else if (rpe.limitRate >= 0.67 && avgReps <= lo + 1) {
      weight = prevStep(workWeight);
      targetReps = Math.min(hi, lo + 2);
      reasons.push(`前回は下限付近で限界が多いため、1段階軽くして有効回数を確保`);
    } else if (minReps >= hi && rpe.limitRate < 0.5) {
      weight = nextStep(workWeight);
      targetReps = lo;
      reasons.push(`前回は全セット${hi}回以上。回数上限に到達したため重量を1段階上げる`);
    } else if (rpe.easyRate >= 0.5 && avgReps >= lo + 2) {
      weight = nextStep(workWeight);
      targetReps = lo;
      reasons.push('前回は余裕が多く、回数も十分。重量を1段階上げる');
    } else if (rpe.limitRate >= 0.5) {
      weight = workWeight;
      targetReps = Math.max(lo, Math.min(hi, Math.floor(avgReps)));
      reasons.push('前回は限界寄り。重量は据え置き、同じ回数を余裕を残して再現する');
    } else {
      weight = workWeight;
      targetReps = Math.min(hi, Math.max(lo, Math.floor(avgReps) + 1));
      reasons.push(`重量は据え置き。まず平均${targetReps}回まで伸ばし、${hi}回を安定してから重量アップ`);
    }

    weight = snap(weight);

    const trendSessions = prior.slice(0, 3).reverse();
    if (trendSessions.length >= 2) {
      const trend = trendSessions.map((s) => {
        const item = s.exercises.find((e) => e.name === name);
        if (!item || !item.sets.length) return null;
        const w = modeWeight(item.sets);
        const ws = item.sets.filter((x) => Number(x.weight) === w);
        return `${fmtNum(w)}kg×${Math.round(median(ws.map((x) => Number(x.reps) || 0)))}回`;
      }).filter(Boolean);
      if (trend.length >= 2) reasons.push(`直近推移: ${trend.join(' → ')}`);
    }

    const lines = [
      `前回: ${fmtDateLong(last.date)}、${fmtNum(workWeight)}kg × ${minReps === maxReps ? minReps : `${minReps}〜${maxReps}`}回 × ${workSets.length}セット`,
      `きつさ: ${rpe.label}`,
      `前回から: ${days}日`,
    ];
    if (groupLoad && groupLoad.date === last.date) {
      lines.push(`${group}全体: ${groupLoad.sets}セット${groupLoad.limitSets ? `、限界${groupLoad.limitSets}セット` : ''}`);
    }
    lines.push(...reasons);
    lines.push(`進行ルール: ${lo}〜${hi}回の範囲で回数を先に伸ばし、上限を安定達成したら重量を1段階上げる`);

    return {
      weight,
      reps: targetReps,
      sets: targetSets,
      title: `${fmtNum(weight)}kg × ${targetReps}回 × ${targetSets}セット`,
      lines,
    };
  }

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

  function renderRecommendation(name) {
    const box = ensureRecommendationBox();
    if (!box || !name) {
      if (box) box.style.display = 'none';
      return;
    }
    const selectedIso = dateInput.value || todayStr();
    const rec = buildRecommendation(name, selectedIso);
    box.style.display = 'block';
    const value = document.getElementById('hypertrophyRecommendationValue');
    const logic = document.getElementById('hypertrophyRecommendationLogic');
    const details = document.getElementById('hypertrophyRecommendationDetails');
    if (value) value.textContent = rec.title;
    if (logic) logic.innerHTML = rec.lines.map((line) => `<div>・${escapeHTML(line)}</div>`).join('');
    if (details) details.open = false;
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    baseSelectExercise(name);
    renderRecommendation(name);
  };

  const baseOnDateChange = onDateChange;
  onDateChange = function () {
    baseOnDateChange();
    if (currentExercise) renderRecommendation(currentExercise);
  };

  const baseCommitCurrentExercise = commitCurrentExercise;
  commitCurrentExercise = function () {
    const result = baseCommitCurrentExercise.apply(this, arguments);
    if (currentExercise) renderRecommendation(currentExercise);
    return result;
  };
})();
