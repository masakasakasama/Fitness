(function () {
  'use strict';

  const MIN_FAMILIAR_SESSIONS = 2;
  const GROUP_TARGET = { '胸': 10, '背中': 10, '脚': 10, '肩': 8, '腕': 6 };
  const GROUPS = Object.keys(GROUP_TARGET);

  function parseDate(iso) {
    if (typeof parseISO === 'function') return parseISO(iso);
    return new Date(`${iso}T00:00:00`);
  }

  function toIso(date) {
    if (typeof toISO === 'function') return toISO(date);
    return date.toISOString().slice(0, 10);
  }

  function todayIso() {
    return typeof todayStr === 'function' ? todayStr() : toIso(new Date());
  }

  function groupFor(name) {
    if (typeof exerciseGroup === 'function') return exerciseGroup(name);
    const found = state.exercises.find((e) => e.name === name);
    return found ? found.group : '—';
  }

  function isCompound(name) {
    return /チェストプレス|インクライン.*プレス|マルチプレス|ショルダープレス|ラットプル|シーテッドロー|懸垂|デッドリフト|レッグプレス|スクワット/.test(name || '');
  }

  function usageStats(name, endIso) {
    const used = state.sessions
      .filter((s) => s.date <= endIso && s.exercises.some((e) => e.name === name))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      count: used.length,
      lastDate: used.length ? used[0].date : '',
    };
  }

  function familiarExerciseEntries(group, endIso) {
    return state.exercises
      .filter((e) => e.group === group)
      .map((e) => ({ name: e.name, ...usageStats(e.name, endIso) }))
      .filter((e) => e.count >= MIN_FAMILIAR_SESSIONS)
      .sort((a, b) => {
        const compoundDiff = Number(isCompound(b.name)) - Number(isCompound(a.name));
        if (compoundDiff) return compoundDiff;
        if (b.count !== a.count) return b.count - a.count;
        return b.lastDate.localeCompare(a.lastDate);
      });
  }

  function familiarSet(endIso) {
    const out = new Set();
    for (const g of GROUPS) {
      familiarExerciseEntries(g, endIso).forEach((e) => out.add(e.name));
    }
    return out;
  }

  function weeklyStats(endIso) {
    const end = parseDate(endIso);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startIso = toIso(start);
    const stats = Object.fromEntries(GROUPS.map((g) => [g, { sets: 0, days: new Set() }]));

    for (const s of state.sessions) {
      if (s.date < startIso || s.date > endIso) continue;
      for (const ex of s.exercises) {
        const g = groupFor(ex.name);
        if (!stats[g]) continue;
        stats[g].sets += ex.sets.length;
        if (ex.sets.length) stats[g].days.add(s.date);
      }
    }
    return stats;
  }

  function lastGroupLoad(group, endIso) {
    const sessions = state.sessions
      .filter((s) => s.date < endIso && s.exercises.some((e) => groupFor(e.name) === group))
      .sort((a, b) => b.date.localeCompare(a.date));
    const s = sessions[0];
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

  function dayDiff(a, b) {
    return Math.max(0, Math.round((parseDate(a) - parseDate(b)) / 86400000));
  }

  function scoreGroups(endIso, todaySession) {
    const weekly = weeklyStats(endIso);
    const todayDone = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    if (todaySession) {
      for (const ex of todaySession.exercises) {
        const g = groupFor(ex.name);
        if (todayDone[g] != null) todayDone[g] += ex.sets.length;
      }
    }

    return GROUPS.map((group) => {
      const target = GROUP_TARGET[group];
      const current = weekly[group].sets;
      const deficit = Math.max(0, target - current);
      const frequency = weekly[group].days.size;
      const last = lastGroupLoad(group, endIso);
      let recoveryPenalty = 0;
      let recoveryText = '';
      if (last && dayDiff(endIso, last.date) === 1) {
        if (last.sets >= 6 || last.limit >= 2) recoveryPenalty = 8;
        else recoveryPenalty = 3;
        recoveryText = `前日${last.sets}セット${last.limit ? `・限界${last.limit}` : ''}`;
      }
      const hasFamiliar = familiarExerciseEntries(group, endIso).length > 0;
      const score = hasFamiliar ? deficit + (frequency < 2 ? 2 : 0) - recoveryPenalty - todayDone[group] * 0.8 : -999;
      return { group, target, current, deficit, frequency, recoveryPenalty, recoveryText, score, hasFamiliar };
    }).sort((a, b) => b.score - a.score);
  }

  function bestFamiliarExercise(group, endIso, used) {
    return familiarExerciseEntries(group, endIso).find((e) => !used.has(e.name)) || null;
  }

  function targetFor(name, groupItem) {
    let rec = null;
    if (typeof computeNextSuggestion === 'function') {
      try { rec = computeNextSuggestion(name, state.sessions); } catch (_) {}
    }
    const recent = state.sessions
      .filter((s) => s.date <= todayIso() && s.exercises.some((e) => e.name === name))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const recentEx = recent && recent.exercises.find((e) => e.name === name);
    const recentSet = recentEx && recentEx.sets && recentEx.sets[recentEx.sets.length - 1];

    let weight = rec && Number.isFinite(Number(rec.weight)) ? Number(rec.weight) : (recentSet ? Number(recentSet.weight) : null);
    let reps = rec && Number(rec.reps) > 0 ? Number(rec.reps) : (recentSet ? Number(recentSet.reps) : (isCompound(name) ? 8 : 12));
    let sets = rec && Number(rec.sets) > 0 ? Number(rec.sets) : 3;
    sets = Math.max(2, Math.min(3, sets, Math.ceil(groupItem.deficit || 2)));
    const rest = typeof recommendRestSec === 'function' ? recommendRestSec(name, reps, 2) : (isCompound(name) ? 120 : 90);
    return { weight, reps, sets, rest };
  }

  function buildPlan(endIso) {
    const todaySession = state.sessions.find((s) => s.date === endIso) || null;
    const used = new Set(todaySession ? todaySession.exercises.map((e) => e.name) : []);
    const totalDoneSets = todaySession ? todaySession.exercises.reduce((sum, e) => sum + e.sets.length, 0) : 0;
    const scored = scoreGroups(endIso, todaySession);
    const maxRemaining = Math.max(0, 12 - totalDoneSets);
    const items = [];
    let planned = 0;

    for (const g of scored) {
      if (g.score <= 0.5 || g.recoveryPenalty >= 8 || planned >= maxRemaining) continue;
      const ex = bestFamiliarExercise(g.group, endIso, used);
      if (!ex) continue;
      const target = targetFor(ex.name, g);
      target.sets = Math.min(target.sets, maxRemaining - planned);
      if (target.sets < 2) continue;
      items.push({ ...target, name: ex.name, group: g.group, useCount: ex.count, lastDate: ex.lastDate });
      planned += target.sets;
      used.add(ex.name);
      if (items.length >= 3) break;
    }

    return { items, scored, totalDoneSets };
  }

  function fmtWeight(w) {
    if (!Number.isFinite(Number(w)) || Number(w) <= 0) return '前回重量';
    return `${typeof fmtNum === 'function' ? fmtNum(Number(w)) : Number(w)}kg`;
  }

  function renderPlan() {
    if (typeof state === 'undefined' || !state || !state.profile) return;
    const card = document.getElementById('dailyPlanCard');
    if (!card) return;
    const endIso = todayIso();
    const plan = buildPlan(endIso);

    if (!plan.items.length) {
      card.innerHTML = `
        <div class="card-title" style="margin-bottom:10px;">今日のプラン</div>
        <div style="font-size:18px;font-weight:800;">追加候補なし</div>
        <div style="margin-top:6px;color:var(--muted);font-size:12px;">普段使っている機材だけで判定。新しい機材は自動提案しない</div>`;
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

    const logic = plan.scored.filter((g) => g.hasFamiliar).slice(0, 5).map((g) => {
      const recovery = g.recoveryText ? `、${g.recoveryText}` : '';
      return `<div>・${escapeHTML(g.group)}: 今週${g.current}/${g.target}セット、頻度${g.frequency}回${escapeHTML(recovery)}</div>`;
    }).join('');

    card.innerHTML = `
      <div class="card-title" style="margin-bottom:10px;">今日のプラン</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">この順番で実施</div>
      <div>${rows}</div>
      <details style="margin-top:4px;padding-top:10px;border-top:1px solid var(--border-soft);">
        <summary style="cursor:pointer;color:var(--muted);font-size:11px;font-weight:600;list-style:none;">順番ロジックを見る</summary>
        <div style="margin-top:8px;color:var(--text-soft);font-size:11px;line-height:1.75;">
          <div>・過去2回以上使った機材だけを提案候補にする</div>
          <div>・未使用、1回だけ使用した機材は自動提案しない</div>
          <div>・候補内では複合種目を先にし、使用回数と直近使用日も優先</div>
          <div>・直近7日の不足セットと前日の疲労から部位順を決定</div>
          ${logic}
        </div>
      </details>`;
  }

  function sanitizeFocus() {
    if (typeof state === 'undefined' || !state) return;
    const endIso = todayIso();
    const familiar = familiarSet(endIso);
    const done = new Set((state.sessions.find((s) => s.date === endIso)?.exercises || []).map((e) => e.name));
    const tags = [...document.querySelectorAll('#focusTags .focus-tag')];

    for (const tag of tags) {
      const text = tag.textContent || '';
      const matched = state.exercises.find((e) => text.includes(e.name));
      if (!matched || familiar.has(matched.name)) continue;
      const replacement = bestFamiliarExercise(matched.group, endIso, done);
      if (!replacement) {
        tag.remove();
        continue;
      }
      tag.textContent = text.replace(matched.name, replacement.name);
      done.add(replacement.name);
    }
  }

  function apply() {
    renderPlan();
    sanitizeFocus();
  }

  if (typeof renderCoach === 'function') {
    const baseRenderCoach = renderCoach;
    renderCoach = function () {
      const result = baseRenderCoach.apply(this, arguments);
      setTimeout(apply, 0);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 50));
  window.addEventListener('load', () => setTimeout(apply, 150));
})();
