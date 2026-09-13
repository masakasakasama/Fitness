(function () {
  'use strict';

  const ACCESSORY_RE = /サイドレイズ|リアレイズ|フライ|カール|トライセ|プレスダウン|アブドミナル|ロータリー|カーフ/;
  const HEAVY_RE = /デッドリフト|スクワット/;
  const COMPOUND_RE = /チェストプレス|インクライン.*プレス|マルチプレス|ショルダープレス|ラットプル|シーテッドロー|懸垂|デッドリフト|レッグプレス|スクワット/;

  function parseDate(iso) {
    if (typeof parseISO === 'function') return parseISO(iso);
    return new Date(`${iso}T00:00:00`);
  }

  function todayIso() {
    return typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0, 10);
  }

  function daysBetween(laterIso, earlierIso) {
    if (!laterIso || !earlierIso) return 999;
    return Math.max(0, Math.floor((parseDate(laterIso) - parseDate(earlierIso)) / 86400000));
  }

  function repRange(name) {
    if (ACCESSORY_RE.test(name || '')) return [10, 15];
    if (HEAVY_RE.test(name || '')) return [5, 8];
    return [8, 12];
  }

  function groupFor(name) {
    if (typeof exerciseGroup === 'function') return exerciseGroup(name);
    const found = state.exercises.find((e) => e.name === name);
    return found ? found.group : '—';
  }

  function modeWeight(sets) {
    const counts = new Map();
    for (const s of sets || []) {
      const w = Number(s.weight);
      if (!Number.isFinite(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    if (!counts.size) return 0;
    return [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
  }

  function median(nums) {
    const arr = (nums || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function snap(weight) {
    return typeof snapWeight === 'function' ? Number(snapWeight(weight)) : Number(weight);
  }

  function nextStep(weight) {
    if (typeof nextWeightStep === 'function') return Number(nextWeightStep(weight));
    if (weight >= 15) return weight + 5;
    if (weight >= 4) return weight + 2;
    return weight + 1;
  }

  function previousStep(weight) {
    const w = Number(weight) || 0;
    let candidate;
    if (w >= 15) candidate = w - 5;
    else if (w >= 4) candidate = w - 2;
    else candidate = w - 1;
    return snap(Math.max(0, candidate));
  }

  function safePreviousStep(weight, maxDropRatio) {
    const w = Number(weight) || 0;
    if (w <= 0) return { weight: w, changed: false, dropRate: 0 };
    const candidate = previousStep(w);
    const dropRate = (w - candidate) / w;
    if (candidate < w && dropRate > 0 && dropRate <= maxDropRatio) {
      return { weight: candidate, changed: true, dropRate };
    }
    return { weight: w, changed: false, dropRate };
  }

  function priorSessions(name, selectedIso) {
    return (state.sessions || [])
      .filter((s) => s.date < selectedIso && s.exercises.some((e) => e.name === name))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function previousGroupLoad(group, selectedIso) {
    const sessions = (state.sessions || [])
      .filter((s) => s.date < selectedIso && s.exercises.some((e) => groupFor(e.name) === group))
      .sort((a, b) => b.date.localeCompare(a.date));
    const session = sessions[0];
    if (!session) return null;
    let sets = 0;
    let limitSets = 0;
    for (const ex of session.exercises) {
      if (groupFor(ex.name) !== group) continue;
      sets += ex.sets.length;
      limitSets += ex.sets.filter((s) => Number(s.rpe) === 3).length;
    }
    return { date: session.date, sets, limitSets };
  }

  function summarizeRpe(sets) {
    const rpes = (sets || []).map((s) => Number(s.rpe)).filter((v) => v >= 1 && v <= 3);
    if (!rpes.length) return { label: '未記録', avg: null, limitRate: 0, easyRate: 0, count: 0 };
    const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
    const limitCount = rpes.filter((v) => v === 3).length;
    const easyCount = rpes.filter((v) => v === 1).length;
    const limitRate = limitCount / rpes.length;
    const easyRate = easyCount / rpes.length;
    let label = '普通';
    if (limitRate >= 0.5) label = `限界 ${limitCount}/${rpes.length}セット`;
    else if (easyRate >= 0.5) label = '余裕多め';
    return { label, avg, limitRate, easyRate, count: rpes.length };
  }

  function recommendRestSec(name, reps, rpe) {
    const n = Number(reps) || 0;
    const effort = Number(rpe) || 0;
    if (effort === 3) return 120;
    if (COMPOUND_RE.test(name || '')) return 120;
    if (ACCESSORY_RE.test(name || '')) {
      if (effort === 1 && n >= 15) return 60;
      return 90;
    }
    return effort >= 2 || n <= 10 ? 120 : 90;
  }

  function starter(name, lo) {
    let weight = 0;
    if (state.profile && typeof starterWeight === 'function') {
      try { weight = Number(starterWeight(name, state.profile)); } catch (_) {}
    }
    return {
      weight: snap(weight || 0),
      reps: lo,
      sets: 3,
    };
  }

  function fmt(n) {
    if (typeof fmtNum === 'function') return fmtNum(Number(n));
    const v = Number(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  }

  function fmtDate(iso) {
    if (typeof fmtDateLong === 'function') return fmtDateLong(iso);
    return iso || '—';
  }

  function recommendExercise(name, selectedIso) {
    const date = selectedIso || todayIso();
    const [lo, hi] = repRange(name);
    const prior = priorSessions(name, date);

    if (!prior.length) {
      const s = starter(name, lo);
      const rest = recommendRestSec(name, s.reps, null);
      return {
        ...s,
        rest,
        daysSince: 999,
        source: 'starter',
        title: s.weight > 0 ? `${fmt(s.weight)}kg × ${s.reps}回 × ${s.sets}セット` : `${lo}〜${hi}回 × ${s.sets}セット`,
        reason: '前回記録なし。フォームを崩さず2〜3回余裕が残る重量から開始',
        lines: [
          '前回記録なし',
          `筋肥大の目安は${lo}〜${hi}回。フォームを崩さず2〜3回余裕が残る重量から開始`,
          '以降は同じ計算エンジンでコーチ画面と記録画面を更新',
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
    const days = daysBetween(date, last.date);
    const group = groupFor(name);
    const groupLoad = previousGroupLoad(group, date);
    const sameGroupYesterday = groupLoad && daysBetween(date, groupLoad.date) <= 1;
    const highGroupFatigue = sameGroupYesterday && (groupLoad.sets >= 6 || groupLoad.limitSets >= 2);

    let weight = workWeight;
    let targetReps = Math.max(lo, Math.min(hi, Math.round(avgReps) || lo));
    let targetSets = Math.max(2, Math.min(3, workSets.length || 3));
    const reasons = [];

    if (days >= 42) {
      const down = safePreviousStep(workWeight, 0.20);
      const hard = rpe.limitRate >= 0.5 || avgReps <= lo + 1;
      if (hard && down.changed) {
        weight = down.weight;
        targetReps = lo;
        targetSets = 2;
        reasons.push(`前回から${days}日空き、前回も高負荷。減量幅${Math.round(down.dropRate * 100)}%なので1段階だけ落とす`);
      } else {
        weight = workWeight;
        targetReps = Math.max(lo, Math.min(hi, Math.floor(avgReps) - 2));
        targetSets = 2;
        reasons.push(`前回から${days}日空いているが、重量は機械的に下げず回数とセット数で復帰負荷を調整`);
      }
    } else if (days >= 28) {
      const down = safePreviousStep(workWeight, 0.15);
      const hard = rpe.limitRate >= 0.5 || avgReps <= lo + 1;
      if (hard && down.changed) {
        weight = down.weight;
        targetReps = lo;
        targetSets = 2;
        reasons.push(`前回から${days}日空き、前回も高負荷。減量幅${Math.round(down.dropRate * 100)}%以内なので1段階だけ落とす`);
      } else {
        weight = workWeight;
        targetReps = Math.max(lo, Math.min(hi, Math.floor(avgReps) - 2));
        targetSets = 2;
        reasons.push(`前回から${days}日空いているため、重量は維持して回数とセット数だけ落として復帰`);
      }
    } else if (days >= 14) {
      weight = workWeight;
      targetReps = Math.max(lo, Math.min(hi, Math.floor(avgReps) - 2));
      targetSets = 2;
      reasons.push(`前回から${days}日。2〜3週間の空白では重量を自動減量せず、前回重量のまま回数・セット数を下げて再評価`);
    } else if (highGroupFatigue) {
      const down = safePreviousStep(workWeight, 0.15);
      if ((rpe.limitRate >= 0.5 || avgReps <= lo + 1) && down.changed) {
        weight = down.weight;
        targetReps = lo;
        reasons.push(`同じ${group}を前日高負荷で実施。減量幅が小さいため1段階軽くする`);
      } else {
        weight = workWeight;
        targetReps = Math.max(lo, Math.floor(avgReps));
        reasons.push(`同じ${group}を前日にも実施。重量アップはせず再現性を優先`);
      }
    } else if (rpe.limitRate >= 0.67 && avgReps <= lo + 1) {
      const down = safePreviousStep(workWeight, 0.20);
      if (down.changed) {
        weight = down.weight;
        targetReps = lo;
        reasons.push(`前回は下限付近で限界が多い。減量幅${Math.round(down.dropRate * 100)}%なので1段階軽くする`);
      } else {
        weight = workWeight;
        targetReps = lo;
        targetSets = 2;
        reasons.push('前回は下限付近で限界が多いが、1段階下げると落としすぎるため重量維持・2セットで再評価');
      }
    } else if (minReps >= hi && rpe.limitRate < 0.5) {
      weight = nextStep(workWeight);
      targetReps = lo;
      targetSets = 3;
      reasons.push(`前回は全セット${hi}回以上。回数上限に到達したため重量を1段階上げる`);
    } else if (rpe.easyRate >= 0.5 && avgReps >= lo + 2) {
      weight = nextStep(workWeight);
      targetReps = lo;
      targetSets = 3;
      reasons.push('前回は余裕が多く回数も十分。重量を1段階上げる');
    } else if (rpe.limitRate >= 0.5) {
      weight = workWeight;
      targetReps = Math.max(lo, Math.min(hi, Math.floor(avgReps)));
      reasons.push('前回は限界寄り。重量は据え置き、同じ回数をより余裕を残して再現');
    } else {
      weight = workWeight;
      targetReps = Math.min(hi, Math.max(lo, Math.floor(avgReps) + 1));
      reasons.push(`重量据え置き。平均${targetReps}回を狙い、上限を安定達成してから重量アップ`);
    }

    weight = snap(weight);
    const rest = recommendRestSec(name, targetReps, null);

    const trend = prior.slice(0, 3).reverse().map((s) => {
      const item = s.exercises.find((e) => e.name === name);
      if (!item || !item.sets.length) return null;
      const w = modeWeight(item.sets);
      const ws = item.sets.filter((x) => Number(x.weight) === w);
      return `${fmt(w)}kg×${Math.round(median(ws.map((x) => Number(x.reps) || 0)))}回`;
    }).filter(Boolean);

    const lines = [
      `前回: ${fmtDate(last.date)}、${fmt(workWeight)}kg × ${minReps === maxReps ? minReps : `${minReps}〜${maxReps}`}回 × ${workSets.length}セット`,
      `きつさ: ${rpe.label}`,
      `前回から: ${days}日`,
    ];
    if (groupLoad && groupLoad.date === last.date) {
      lines.push(`${group}全体: ${groupLoad.sets}セット${groupLoad.limitSets ? `、限界${groupLoad.limitSets}セット` : ''}`);
    }
    lines.push(...reasons);
    if (trend.length >= 2) lines.push(`直近推移: ${trend.join(' → ')}`);
    lines.push(`進行ルール: ${lo}〜${hi}回で回数を先に伸ばし、上限を安定達成したら重量を1段階上げる`);

    return {
      weight,
      reps: targetReps,
      sets: targetSets,
      rest,
      daysSince: days,
      source: 'history',
      lastDate: last.date,
      lastWeight: workWeight,
      lastReps: avgReps,
      lastRpe: rpe,
      title: `${fmt(weight)}kg × ${targetReps}回 × ${targetSets}セット`,
      reason: reasons[0] || '',
      lines,
    };
  }

  window.REPSEngine = Object.freeze({
    recommendExercise,
    recommendRestSec,
    repRange,
    daysBetween,
    modeWeight,
    version: '1.0.0',
  });
})();