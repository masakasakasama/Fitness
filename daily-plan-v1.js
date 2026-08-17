(function () {
  'use strict';

  const GROUP_TARGET = { '胸': 10, '背中': 10, '脚': 10, '肩': 8, '腕': 6 };
  const GROUPS = ['胸', '背中', '脚', '肩', '腕'];
  const PRIORITY = {
    '胸': ['チェストプレス（マシン）', 'チェストプレス', 'インクラインダンベルプレス', 'マルチプレス', 'ダンベルフライ'],
    '背中': ['ラットプルダウン', 'シーテッドロー', '懸垂', 'デッドリフト'],
    '脚': ['レッグプレス', 'スクワット', 'レッグカール', 'レッグエクステンション'],
    '肩': ['ショルダープレス', 'サイドレイズ', 'リアレイズ'],
    '腕': ['ダンベルカール', 'バーベルカール', 'ケーブルプレスダウン', 'トライセプスエクステンション']
  };

  function iso(d) {
    return typeof toISO === 'function' ? toISO(d) : d.toISOString().slice(0, 10);
  }

  function parse(d) {
    return typeof parseISO === 'function' ? parseISO(d) : new Date(`${d}T00:00:00`);
  }

  function daysBetween(a, b) {
    return Math.max(0, Math.floor((parse(a) - parse(b)) / 86400000));
  }

  function groupFor(name) {
    if (typeof exerciseGroup === 'function') return exerciseGroup(name);
    const found = state.exercises.find((x) => x.name === name);
    return found ? found.group : '—';
  }

  function recentWindow(todayIso, days) {
    const d = parse(todayIso);
    d.setDate(d.getDate() - (days - 1));
    return iso(d);
  }

  function weeklyStats(todayIso) {
    const start = recentWindow(todayIso, 7);
    const stats = Object.fromEntries(GROUPS.map((g) => [g, { sets: 0, days: new Set() }]));
    for (const s of state.sessions) {
      if (s.date < start || s.date > todayIso) continue;
      for (const ex of s.exercises) {
        const g = groupFor(ex.name);
        if (!stats[g]) continue;
        stats[g].sets += ex.sets.length;
        if (ex.sets.length) stats[g].days.add(s.date);
      }
    }
    return stats;
  }

  function lastGroupLoad(group, todayIso) {
    const candidates = state.sessions
      .filter((s) => s.date < todayIso && s.exercises.some((e) => groupFor(e.name) === group))
      .sort((a, b) => b.date.localeCompare(a.date));
    const s = candidates[0];
    if (!s) return null;
    let sets = 0;
    let limit = 0;
    for (const ex of s.exercises) {
      if (groupFor(ex.name) !== group) continue;
      sets += ex.sets.length;
      limit += ex.sets.filter((x) => Number(x.rpe) === 3).length;
    }
    return { date: s.date, sets, limit };
  }

  function scoreGroups(todayIso, todaySession) {
    const stats = weeklyStats(todayIso);
    const todayDone = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    if (todaySession) {
      for (const ex of todaySession.exercises) {
        const g = groupFor(ex.name);
        if (todayDone[g] != null) todayDone[g] += ex.sets.length;
      }
    }

    return GROUPS.map((g) => {
      const target = GROUP_TARGET[g];
      const current = stats[g].sets;
      const deficit = Math.max(0, target - current);
      const frequency = stats[g].days.size;
      const last = lastGroupLoad(g, todayIso);
      let recoveryPenalty = 0;
      let recoveryText = '';
      if (last) {
        const gap = daysBetween(todayIso, last.date);
        if (gap === 1 && (last.sets >= 6 || last.limit >= 2)) {
          recoveryPenalty = 8;
          recoveryText = `前日${last.sets}セット${last.limit ? `、限界${last.limit}` : ''}`;
        } else if (gap === 1) {
          recoveryPenalty = 3;
          recoveryText = `前日${last.sets}セット`;
        }
      }
      const frequencyBonus = frequency < 2 ? 2 : 0;
      const score = deficit + frequencyBonus - recoveryPenalty - todayDone[g] * 0.8;
      return { group: g, target, current, deficit, frequency, score, recoveryPenalty, recoveryText, todayDone: todayDone[g] };
    }).sort((a, b) => b.score - a.score);
  }

  function availableNames(group) {
    const all = state.exercises.filter((e) => e.group === group).map((e) => e.name);
    const p = PRIORITY[group] || [];
    return all.sort((a, b) => {
      const ai = p.indexOf(a), bi = p.indexOf(b);
      const ar = ai === -1 ? 999 : ai, br = bi === -1 ? 999 : bi;
      return ar - br;
    });
  }

  function pickExercise(group, used, preferAccessory) {
    const names = availableNames(group).filter((n) => !used.has(n));
    if (!names.length) return null;
    if (preferAccessory) {
      const acc = names.find((n) => /サイドレイズ|リアレイズ|フライ|カール|プレスダウン|エクステンション/.test(n));
      if (acc) return acc;
    }
    return names[0];
  }

  function targetForExercise(name, groupItem) {
    let rec = null;
    if (typeof computeNextSuggestion === 'function') {
      try { rec = computeNextSuggestion(name, state.sessions); } catch (_) {}
    }
    let weight = rec && Number.isFinite(Number(rec.weight)) ? Number(rec.weight) : null;
    let reps = rec && Number(rec.reps) > 0 ? Number(rec.reps) : (/サイドレイズ|リアレイズ|フライ|カール|プレスダウン|エクステンション/.test(name) ? 12 : 8);
    let sets = Math.max(2, Math.min(3, Math.ceil(groupItem.deficit || 2)));
    if (rec && Number(rec.sets) > 0) sets = Math.min(sets, Math.max(2, Number(rec.sets)));
    if (weight == null && state.profile && typeof starterWeight === 'function') {
      try { weight = Number(starterWeight(name, state.profile)); } catch (_) {}
    }
    const rest = typeof recommendRestSec === 'function' ? recommendRestSec(name, reps, 2) : (/サイドレイズ|リアレイズ|フライ|カール|プレスダウン|エクステンション/.test(name) ? 90 : 120);
    return { weight, reps, sets, rest, reason: rec ? rec.reason : '' };
  }

  function buildPlan(todayIso) {
    const todaySession = state.sessions.find((s) => s.date === todayIso) || null;
    const doneNames = new Set(todaySession ? todaySession.exercises.map((e) => e.name) : []);
    const scored = scoreGroups(todayIso, todaySession);
    const totalDoneSets = todaySession ? todaySession.exercises.reduce((a, e) => a + e.sets.length, 0) : 0;

    const yesterday = state.sessions
      .filter((s) => s.date < todayIso)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!todaySession && yesterday && daysBetween(todayIso, yesterday.date) === 1) {
      let ySets = 0, yLimit = 0;
      for (const ex of yesterday.exercises) {
        if (groupFor(ex.name) === '有酸素') continue;
        ySets += ex.sets.length;
        yLimit += ex.sets.filter((s) => Number(s.rpe) === 3).length;
      }
      if (ySets >= 14 && yLimit >= 4) {
        return { restDay: true, items: [], scored, totalDoneSets, reason: `昨日${ySets}セット、限界${yLimit}セット。今日は回復を優先` };
      }
    }

    const candidates = scored.filter((x) => x.score > 0.5 && x.recoveryPenalty < 8);
    const used = new Set(doneNames);
    const items = [];
    let plannedSets = 0;
    const maxRemainingSets = Math.max(0, 12 - totalDoneSets);

    for (const g of candidates.slice(0, 3)) {
      if (plannedSets >= maxRemainingSets) break;
      const name = pickExercise(g.group, used, false);
      if (!name) continue;
      const target = targetForExercise(name, g);
      target.sets = Math.min(target.sets, Math.max(0, maxRemainingSets - plannedSets));
      if (target.sets < 2) break;
      items.push({ ...target, name, group: g.group, priority: g.score, groupReason: g });
      plannedSets += target.sets;
      used.add(name);
    }

    const top = candidates[0];
    if (top && plannedSets + 2 <= maxRemainingSets && top.deficit >= 5) {
      const name = pickExercise(top.group, used, true);
      if (name) {
        const target = targetForExercise(name, top);
        target.sets = 2;
        items.push({ ...target, name, group: top.group, priority: top.score - 0.5, groupReason: top });
        plannedSets += 2;
        used.add(name);
      }
    }

    if (!items.length && totalDoneSets >= 9) {
      return { restDay: false, done: true, items: [], scored, totalDoneSets, reason: `今日は${totalDoneSets}セット完了。追加より回復を優先` };
    }

    return { restDay: false, done: false, items, scored, totalDoneSets, reason: '' };
  }

  function fmtWeight(w) {
    if (w == null || !Number.isFinite(Number(w)) || Number(w) <= 0) return '適正重量';
    return `${typeof fmtNum === 'function' ? fmtNum(Number(w)) : Number(w)}kg`;
  }

  function ensurePlanCard() {
    let card = document.getElementById('dailyPlanCard');
    if (card) return card;
    const focus = document.getElementById('focusCard');
    if (!focus || !focus.parentElement) return null;
    card = document.createElement('div');
    card.id = 'dailyPlanCard';
    card.className = 'diag-card';
    card.style.marginTop = '12px';
    focus.insertAdjacentElement('afterend', card);
    return card;
  }

  function renderDailyPlan() {
    const card = ensurePlanCard();
    if (!card || !state.profile) return;
    const todayIso = typeof todayStr === 'function' ? todayStr() : iso(new Date());
    const plan = buildPlan(todayIso);

    if (plan.restDay) {
      card.innerHTML = `
        <div class="card-title" style="margin-bottom:10px;">今日のプラン</div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;">休息日</div>
        <div style="margin-top:6px;color:var(--muted);font-size:12px;">${escapeHTML(plan.reason)}</div>`;
      return;
    }

    if (plan.done) {
      card.innerHTML = `
        <div class="card-title" style="margin-bottom:10px;">今日のプラン</div>
        <div style="font-size:20px;font-weight:800;">完了</div>
        <div style="margin-top:6px;color:var(--muted);font-size:12px;">${escapeHTML(plan.reason)}</div>`;
      return;
    }

    const rows = plan.items.map((x, i) => `
      <div style="display:grid;grid-template-columns:28px 1fr;gap:10px;padding:${i === 0 ? '4px' : '12px'} 0 12px;${i ? 'border-top:1px solid var(--border-soft);' : ''}">
        <div style="width:26px;height:26px;border-radius:999px;background:${i === 0 ? 'var(--accent)' : 'var(--surface-2)'};color:${i === 0 ? 'var(--bg)' : 'var(--text-soft)'};display:grid;place-items:center;font-size:12px;font-weight:800;">${i + 1}</div>
        <div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
            <div style="font-size:15px;font-weight:750;color:var(--text);">${escapeHTML(x.name)}</div>
            <div style="font-size:10px;color:var(--muted);white-space:nowrap;">${escapeHTML(x.group)}</div>
          </div>
          <div style="margin-top:4px;font-size:13px;color:var(--text-soft);font-variant-numeric:tabular-nums;">${escapeHTML(fmtWeight(x.weight))} × ${x.reps}回 × ${x.sets}セット</div>
          <div style="margin-top:3px;font-size:11px;color:var(--muted);">レスト ${x.rest}秒</div>
        </div>
      </div>`).join('');

    const logic = plan.scored.slice(0, 5).map((g) => {
      const rec = g.recoveryText ? `、${g.recoveryText}` : '';
      return `<div>・${escapeHTML(g.group)}: 今週${g.current}/${g.target}セット、頻度${g.frequency}回${escapeHTML(rec)}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="card-title" style="margin-bottom:10px;">今日のプラン</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">この順番で実施</div>
      <div>${rows || '<div style="color:var(--muted);font-size:12px;">今日は追加トレーニング不要</div>'}</div>
      <details style="margin-top:4px;padding-top:10px;border-top:1px solid var(--border-soft);">
        <summary style="cursor:pointer;color:var(--muted);font-size:11px;font-weight:600;list-style:none;">順番ロジックを見る</summary>
        <div style="margin-top:8px;color:var(--text-soft);font-size:11px;line-height:1.75;">
          <div>・機材数ではなく、直近7日の部位別セット不足と回復状況で決定</div>
          <div>・不足が大きく回復している部位を先頭へ</div>
          <div>・同条件なら複合種目を先、単関節種目を後に配置</div>
          <div>・前日に同部位を高負荷で実施した場合は優先度を下げる</div>
          ${logic}
        </div>
      </details>`;
  }

  const baseRenderCoach = renderCoach;
  renderCoach = function () {
    baseRenderCoach.apply(this, arguments);
    renderDailyPlan();
  };

  window.renderDailyPlan = renderDailyPlan;
})();
