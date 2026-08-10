(function () {
  'use strict';

  // Recommendation engine v2
  // Keeps the existing UI/CSS/HTML intact and only replaces recommendation logic.
  // 2026 ACSM guidance emphasizes weekly muscle-group volume (~10 sets) and
  // training major muscle groups at least twice weekly over arbitrary machine counts.

  const MAJOR_GROUPS = ['胸', '背中', '脚', '肩'];
  const ALL_RESISTANCE_GROUPS = ['胸', '背中', '脚', '肩', '腕', '体幹'];
  const WEEKLY_TARGET = { 胸: 10, 背中: 10, 脚: 10, 肩: 8, 腕: 6, 体幹: 4 };
  const NEAR_TARGET_RATIO = 0.8;
  const MAX_SESSION_SETS = 14;

  const EXERCISE_PRIORITY = {
    胸: ['チェストプレス（マシン）', 'チェストプレス', 'インクラインダンベルプレス', 'マルチプレス', 'ダンベルフライ', 'ペクトラルフライ'],
    背中: ['ラットプルダウン', 'シーテッドロー', '懸垂', 'デッドリフト'],
    脚: ['レッグプレス', 'スクワット', 'レッグカール', 'レッグエクステンション'],
    肩: ['ショルダープレス', 'サイドレイズ', 'リアレイズ'],
    腕: ['ダンベルカール', 'バーベルカール', 'ケーブルプレスダウン', 'トライセプスエクステンション'],
    体幹: ['アブドミナル', 'プランク', 'アブローラー', 'バックエクステンション'],
  };

  function groupForExercise(name) {
    const found = state.exercises.find((e) => e.name === name);
    return found ? found.group : '—';
  }

  function dateDiffDays(laterIso, earlierIso) {
    if (!laterIso || !earlierIso) return 999;
    return Math.max(0, Math.floor((parseISO(laterIso) - parseISO(earlierIso)) / 86400000));
  }

  function cutoffIso(endDate, days) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - (days - 1));
    return toISO(d);
  }

  function contributionFor(name, primaryGroup) {
    const c = {};
    const add = (g, v) => { c[g] = (c[g] || 0) + v; };
    if (primaryGroup && ALL_RESISTANCE_GROUPS.includes(primaryGroup)) add(primaryGroup, 1);

    // Conservative secondary-muscle credit. This avoids asking for excessive
    // direct shoulder/arm work after compound pressing/pulling.
    if (/チェストプレス|ベンチ|インクライン.*プレス|マルチプレス/.test(name)) {
      add('肩', 0.35); add('腕', 0.35);
    } else if (/ショルダープレス/.test(name)) {
      add('腕', 0.35);
    } else if (/ラットプル|シーテッドロー|懸垂/.test(name)) {
      add('腕', 0.35);
    } else if (/デッドリフト/.test(name)) {
      add('脚', 0.35);
    }
    return c;
  }

  function weeklyStimulus(endDate) {
    const endIso = toISO(endDate);
    const startIso = cutoffIso(endDate, 7);
    const sets = Object.fromEntries(ALL_RESISTANCE_GROUPS.map((g) => [g, 0]));
    const days = Object.fromEntries(ALL_RESISTANCE_GROUPS.map((g) => [g, new Set()]));
    const directSets = Object.fromEntries(ALL_RESISTANCE_GROUPS.map((g) => [g, 0]));

    for (const s of state.sessions) {
      if (s.date < startIso || s.date > endIso) continue;
      for (const ex of s.exercises) {
        const primary = groupForExercise(ex.name);
        if (!ALL_RESISTANCE_GROUPS.includes(primary)) continue;
        const n = ex.sets.length;
        directSets[primary] += n;
        const contrib = contributionFor(ex.name, primary);
        for (const [g, factor] of Object.entries(contrib)) {
          if (!ALL_RESISTANCE_GROUPS.includes(g)) continue;
          sets[g] += n * factor;
          if (factor >= 0.5 || g === primary) days[g].add(s.date);
        }
      }
    }

    return {
      sets,
      directSets,
      frequency: Object.fromEntries(ALL_RESISTANCE_GROUPS.map((g) => [g, days[g].size])),
    };
  }

  function todayGroupSets(todaySession) {
    const out = Object.fromEntries(ALL_RESISTANCE_GROUPS.map((g) => [g, 0]));
    if (!todaySession) return out;
    for (const ex of todaySession.exercises) {
      const g = groupForExercise(ex.name);
      if (out[g] != null) out[g] += ex.sets.length;
    }
    return out;
  }

  function lastGroupSession(group, beforeOrOnIso) {
    let best = null;
    for (const s of state.sessions) {
      if (beforeOrOnIso && s.date > beforeOrOnIso) continue;
      let sets = 0;
      let limitSets = 0;
      for (const ex of s.exercises) {
        if (groupForExercise(ex.name) !== group) continue;
        sets += ex.sets.length;
        limitSets += ex.sets.filter((x) => x.rpe === 3).length;
      }
      if (sets && (!best || s.date > best.date)) best = { date: s.date, sets, limitSets };
    }
    return best;
  }

  function recoveryPenalty(group, todayIso) {
    const last = lastGroupSession(group, todayIso);
    if (!last) return 0;
    const days = dateDiffDays(todayIso, last.date);
    if (days === 0) return 0;
    if (days >= 2) return 0;
    const failureRate = last.sets ? last.limitSets / last.sets : 0;
    if (last.sets >= 6 || failureRate >= 0.5) return 5;
    if (last.sets >= 3) return 2;
    return 0;
  }

  function recentUseScore(name) {
    let score = 0;
    const sorted = state.sessions.slice().sort((a, b) => b.date.localeCompare(a.date));
    sorted.slice(0, 12).forEach((s, idx) => {
      if (s.exercises.some((e) => e.name === name)) score += Math.max(1, 12 - idx);
    });
    return score;
  }

  function pickExercise(group, doneTodayNames) {
    const available = state.exercises.filter((e) => e.group === group).map((e) => e.name);
    if (!available.length) return null;
    const priority = EXERCISE_PRIORITY[group] || [];
    return available
      .map((name) => ({
        name,
        donePenalty: doneTodayNames.has(name) ? 100 : 0,
        priority: priority.includes(name) ? priority.length - priority.indexOf(name) : 0,
        use: recentUseScore(name),
      }))
      .sort((a, b) => (a.donePenalty - b.donePenalty) || (b.priority - a.priority) || (b.use - a.use))[0].name;
  }

  function groupDeficits(today, todayIso, todaySession) {
    const weekly = weeklyStimulus(today);
    const todaySets = todayGroupSets(todaySession);
    return MAJOR_GROUPS.map((g) => {
      const target = WEEKLY_TARGET[g];
      const current = weekly.sets[g] || 0;
      const deficit = Math.max(0, target - current);
      const frequency = weekly.frequency[g] || 0;
      const recovery = todaySets[g] > 0 ? 0 : recoveryPenalty(g, todayIso);
      const frequencyBonus = frequency < 2 ? 2 : 0;
      return { g, target, current, deficit, frequency, recovery, frequencyBonus, todaySets: todaySets[g] || 0 };
    }).sort((a, b) => {
      const sa = a.deficit + a.frequencyBonus - a.recovery;
      const sb = b.deficit + b.frequencyBonus - b.recovery;
      return sb - sa;
    });
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function weeklySummaryText(weekly) {
    return MAJOR_GROUPS.map((g) => `${g}${round1(weekly.sets[g] || 0)}`).join('・');
  }

  function focusTag(text) {
    return `<span class="focus-tag">${escapeHTML(text)}</span>`;
  }

  function setFocus(title, tags, reason) {
    const focusValue = document.getElementById('focusValue');
    const focusTags = document.getElementById('focusTags');
    const focusReason = document.getElementById('focusReason');
    if (!focusValue || !focusTags || !focusReason) return;
    focusValue.textContent = title;
    focusTags.innerHTML = tags.map(focusTag).join('');
    focusReason.textContent = reason;
  }

  function failureLoad(session) {
    if (!session) return { totalSets: 0, limitSets: 0, ratio: 0 };
    let totalSets = 0, limitSets = 0;
    for (const ex of session.exercises) {
      const g = groupForExercise(ex.name);
      if (!ALL_RESISTANCE_GROUPS.includes(g)) continue;
      totalSets += ex.sets.length;
      limitSets += ex.sets.filter((s) => s.rpe === 3).length;
    }
    return { totalSets, limitSets, ratio: totalSets ? limitSets / totalSets : 0 };
  }

  function buildActionForGroup(item, doneTodayNames) {
    const ex = pickExercise(item.g, doneTodayNames);
    if (!ex) return null;
    const sets = Math.max(2, Math.min(3, Math.ceil(item.deficit || 2)));
    return { group: item.g, exercise: ex, sets };
  }

  function renderTodayFocusV2(profile, goal, today, todayIso, todaySession, lastSession) {
    const weekly = weeklyStimulus(today);
    const doneTodayNames = new Set(todaySession ? todaySession.exercises.map((e) => e.name) : []);
    const deficits = groupDeficits(today, todayIso, todaySession);
    const last30Start = cutoffIso(today, 30);
    const last30 = state.sessions.filter((s) => s.date >= last30Start && s.date <= todayIso);

    if (!last30.length) {
      const actions = MAJOR_GROUPS.slice(0, 3)
        .map((g) => buildActionForGroup({ g, deficit: 3 }, doneTodayNames))
        .filter(Boolean);
      setFocus(
        '全身を3種目',
        actions.map((a) => `${a.exercise} ${a.sets}set`),
        '最初は機材数を増やすより、胸・背中・脚を各2〜3セット。週2回を先に固定する'
      );
      return;
    }

    if (todaySession) {
      const totalSets = sessionSetCount(todaySession);
      const viable = deficits.filter((x) => x.deficit >= 1.5 && x.recovery < 5);
      const untouched = viable.filter((x) => x.todaySets === 0);
      const pool = untouched.length ? untouched : viable;
      const room = Math.max(0, MAX_SESSION_SETS - totalSets);

      if (totalSets >= 12 || room < 2 || !pool.length) {
        setFocus(
          '今日は終了でOK',
          [`${totalSets}セット完了`],
          `今週の有効セットは ${weeklySummaryText(weekly)}。機材数ではなく週ボリュームで判定。今日は追加せず、次回は不足部位を優先`
        );
        return;
      }

      const actions = pool.slice(0, room >= 5 ? 2 : 1)
        .map((x) => buildActionForGroup(x, doneTodayNames))
        .filter(Boolean);
      if (!actions.length) {
        setFocus(
          '今日は終了でOK',
          [`${totalSets}セット完了`],
          `今週の有効セットは ${weeklySummaryText(weekly)}。追加するなら疲労より次回の質を優先`
        );
        return;
      }

      const actionSets = actions.reduce((a, x) => a + x.sets, 0);
      const title = actions.length === 1 ? `${actions[0].group}を追加` : `${actions[0].group}＋${actions[1].group}`;
      setFocus(
        title,
        actions.map((a) => `${a.exercise} ${a.sets}set`),
        `現在${totalSets}セット。今週は ${weeklySummaryText(weekly)}。不足が大きい部位だけ${Math.min(room, actionSets)}セット足して終了で十分`
      );
      return;
    }

    const daysSinceLast = lastSession ? dateDiffDays(todayIso, lastSession.date) : 999;
    const lastFatigue = failureLoad(lastSession);
    const fullBodyYesterday = daysSinceLast === 1 && lastFatigue.totalSets >= 12 && lastFatigue.ratio >= 0.35;

    if (fullBodyYesterday) {
      setFocus(
        '今日は休息優先',
        ['高疲労セッション翌日'],
        `昨日${lastFatigue.totalSets}セット、うち限界${lastFatigue.limitSets}セット。今日は休み、次回に不足部位を回した方が総量を伸ばしやすい`
      );
      return;
    }

    const viable = deficits.filter((x) => x.deficit >= 1.5 && x.recovery < 5);
    const actions = viable.slice(0, 2)
      .map((x) => buildActionForGroup(x, doneTodayNames))
      .filter(Boolean);

    if (actions.length) {
      const title = actions.length === 1 ? `${actions[0].group}中心` : `${actions[0].group}＋${actions[1].group}`;
      setFocus(
        title,
        actions.map((a) => `${a.exercise} ${a.sets}set`),
        `今週の有効セットは ${weeklySummaryText(weekly)}。少ない部位から埋める。目安は1部位週8〜10セット、同じ部位は週2回に分散`
      );
      return;
    }

    setFocus(
      '全身を軽く',
      ['各2セット'],
      `今週の有効セットは ${weeklySummaryText(weekly)}。大きな不足はないので、追い込みより継続とフォームを優先`
    );
  }

  function repRangeForExercise(name) {
    if (/サイドレイズ|リアレイズ|フライ|カール|トライセ|プレスダウン|アブドミナル/.test(name)) return [10, 15];
    if (/デッドリフト|スクワット/.test(name)) return [5, 8];
    return [6, 12];
  }

  function median(nums) {
    const a = nums.slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function previousWeightStep(w) {
    if (w > 14) return Math.max(0, w - 5);
    if (w > 4) return Math.max(0, w - 2);
    return Math.max(0, w - 2);
  }

  function computeNextSuggestionV2(name, sessions) {
    const relevant = sessions
      .filter((s) => s.exercises.some((e) => e.name === name))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!relevant.length) return null;

    const lastSess = relevant[relevant.length - 1];
    const lastEx = lastSess.exercises.find((e) => e.name === name);
    if (!lastEx || !lastEx.sets.length) return null;

    const sets = lastEx.sets;
    const lastWeight = median(sets.map((s) => Number(s.weight) || 0));
    const reps = sets.map((s) => Number(s.reps) || 0);
    const avgReps = reps.reduce((a, b) => a + b, 0) / reps.length;
    const rpes = sets.map((s) => s.rpe).filter(Boolean);
    const limitRate = rpes.length ? rpes.filter((x) => x === 3).length / rpes.length : 0;
    const easyRate = rpes.length ? rpes.filter((x) => x === 1).length / rpes.length : 0;
    const [lo, hi] = repRangeForExercise(name);

    let weight = lastWeight;
    let targetReps = Math.max(lo, Math.min(hi, Math.round(avgReps)));
    let targetSets = Math.max(2, Math.min(4, sets.length));
    let reason = '';

    if (avgReps < lo || (limitRate >= 0.67 && avgReps <= lo + 1)) {
      weight = previousWeightStep(lastWeight);
      targetReps = lo;
      targetSets = 3;
      reason = `前回は${Math.round(avgReps)}回平均で限界寄り。1段下げて${lo}回から積み直す`;
    } else if (reps.every((r) => r >= hi) && limitRate < 0.5) {
      weight = nextWeightStep(lastWeight);
      targetReps = lo;
      targetSets = 3;
      reason = `前回は全セット${hi}回以上。重量を1段上げ、${lo}回から再スタート`;
    } else if (avgReps >= hi - 1 && easyRate >= 0.5) {
      weight = nextWeightStep(lastWeight);
      targetReps = lo;
      targetSets = 3;
      reason = '前回は余裕あり。重量を1段上げるタイミング';
    } else {
      weight = lastWeight;
      targetReps = Math.min(hi, Math.max(lo, Math.floor(avgReps) + 1));
      targetSets = Math.max(2, Math.min(3, sets.length));
      reason = `重量は据え置き。まず平均${targetReps}回まで伸ばし、上限到達後に重量UP`;
    }

    return {
      weight: snapWeight(weight),
      reps: targetReps,
      sets: targetSets,
      reason,
      daysSince: dateDiffDays(toISO(new Date()), lastSess.date),
    };
  }

  function patchDiagnosis(profile, goal) {
    const diagQuality = document.getElementById('diagQuality');
    if (!diagQuality) return;
    const weekly = weeklyStimulus(new Date());
    const vals = MAJOR_GROUPS.map((g) => ({ g, value: weekly.sets[g] || 0, target: WEEKLY_TARGET[g] }));
    const near = vals.filter((x) => x.value >= x.target * NEAR_TARGET_RATIO).length;
    const total = vals.reduce((a, x) => a + x.value, 0);

    let cls = 'bad', label = '偏り大';
    if (near >= 4) { cls = 'good'; label = '良好'; }
    else if (near >= 2 || total >= 24) { cls = 'warn'; label = '偏り'; }

    diagQuality.innerHTML = `週セット ${vals.map((x) => `${x.g}${round1(x.value)}`).join('・')} <span class="verdict ${cls}">${label}</span>`;

    const diagFreq = document.getElementById('diagFreq');
    if (diagFreq) {
      const today = new Date();
      const todayIso = toISO(today);
      const c7 = cutoffIso(today, 7);
      const c30 = cutoffIso(today, 30);
      const n7 = state.sessions.filter((s) => s.date >= c7 && s.date <= todayIso).length;
      const n30 = state.sessions.filter((s) => s.date >= c30 && s.date <= todayIso).length;
      const perWeek = (n30 / 30) * 7;
      const target = 2;
      let fCls = 'good', fLabel = '十分';
      if (perWeek < 1.2) { fCls = 'bad'; fLabel = '不足'; }
      else if (perWeek < 1.7) { fCls = 'warn'; fLabel = 'もう少し'; }
      diagFreq.innerHTML = `直近7日 <span class="num">${n7}</span>回 ・ 30日 <span class="num">${n30}</span>回<span class="verdict ${fCls}">${fLabel}</span>`;

      const freqTarget = document.getElementById('freqTarget');
      if (freqTarget) freqTarget.textContent = target;
    }
  }

  renderTodayFocus = renderTodayFocusV2;
  computeNextSuggestion = computeNextSuggestionV2;
  freqTargetFor = function () { return 2; };

  const renderCoachBase = renderCoach;
  renderCoach = function () {
    renderCoachBase();
    const profile = state.profile;
    if (!profile || !document.getElementById('coachWithProfile')) return;
    patchDiagnosis(profile, getGoalKind(profile));
  };
})();
