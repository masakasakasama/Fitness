(function () {
  'use strict';

  const CHEST_NAMES = ['チェストプレス（マシン）', 'チェストプレス'];
  const CHEST_SESSIONS_PER_WEEK = 2;
  const CHEST_REST_HOURS = '48〜72時間';

  function parseDate(iso) {
    if (!iso) return null;
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

  function addDays(iso, days) {
    const d = parseDate(iso);
    if (!d) return '';
    d.setDate(d.getDate() + days);
    return toIso(d);
  }

  function daysBetween(a, b) {
    const da = parseDate(a), db = parseDate(b);
    if (!da || !db) return null;
    return Math.round((da - db) / 86400000);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = parseDate(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fmtNum(n, digits) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(digits == null ? (Number.isInteger(v) ? 0 : 1) : digits).replace(/\.0$/, '');
  }

  function chestExerciseIn(session) {
    if (!session || !Array.isArray(session.exercises)) return null;
    return session.exercises.find((e) => CHEST_NAMES.includes(e.name)) || null;
  }

  function workSetSummary(ex) {
    if (!ex || !Array.isArray(ex.sets) || !ex.sets.length) return null;
    const counts = new Map();
    ex.sets.forEach((s) => {
      const w = Number(s.weight);
      if (!Number.isFinite(w)) return;
      counts.set(w, (counts.get(w) || 0) + 1);
    });
    if (!counts.size) return null;
    const weight = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))[0][0];
    const sets = ex.sets.filter((s) => Number(s.weight) === weight);
    const reps = sets.map((s) => Number(s.reps) || 0);
    const rpes = sets.map((s) => Number(s.rpe)).filter((x) => x >= 1 && x <= 3);
    const minReps = reps.length ? Math.min(...reps) : 0;
    const avgReps = reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;
    const limitSets = rpes.filter((x) => x === 3).length;
    return { weight, sets: sets.length, minReps, avgReps, limitSets, rpeCount: rpes.length };
  }

  function chestHistory() {
    return (state.sessions || [])
      .map((s) => {
        const ex = chestExerciseIn(s);
        const work = workSetSummary(ex);
        return ex && work ? { date: s.date, name: ex.name, ...work } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function chestBaseline(history) {
    if (!history.length) return null;
    const recent = history.slice(0, 8);
    const qualified = recent
      .filter((x) => x.sets >= 2 && x.minReps >= 8)
      .sort((a, b) => (b.weight - a.weight) || b.date.localeCompare(a.date));
    return qualified[0] || recent[0];
  }

  function nextAvailableWeight(raw, current) {
    let target = Number(raw);
    if (!Number.isFinite(target)) return Number(current) || 0;
    if (typeof snapWeight === 'function') {
      let snapped = Number(snapWeight(target));
      if (snapped < target && typeof nextWeightStep === 'function') snapped = Number(nextWeightStep(snapped));
      target = snapped;
    } else {
      target = Math.ceil(target / 5) * 5;
    }
    if (Number.isFinite(Number(current)) && target <= Number(current)) {
      if (typeof nextWeightStep === 'function') return Number(nextWeightStep(Number(current)));
      return Number(current) + 5;
    }
    return target;
  }

  function chestMilestones(currentWeight, bodyWeight) {
    const bw = Number(bodyWeight) || 70;
    const current = Number(currentWeight) || 0;
    const m1 = nextAvailableWeight(Math.max(current + 5, bw * 0.65), current);
    const m2 = nextAvailableWeight(Math.max(m1 + 5, bw * 0.75), m1);
    const m3 = nextAvailableWeight(Math.max(m2 + 5, bw * 0.85), m2);
    return [
      { label: '次', weeks: '2〜8週', weight: m1, ratio: m1 / bw },
      { label: '3か月', weeks: '8〜16週', weight: m2, ratio: m2 / bw },
      { label: '6か月', weeks: '16〜32週', weight: m3, ratio: m3 / bw },
    ];
  }

  function promotionProgress(history, baseline) {
    if (!baseline) return { count: 0, needed: 2 };
    let count = 0;
    for (const h of history) {
      if (h.weight !== baseline.weight) break;
      const enoughReps = h.sets >= 3 && h.minReps >= 12;
      const notMostlyLimit = h.rpeCount === 0 || h.limitSets <= 1;
      if (enoughReps && notMostlyLimit) count += 1;
      else break;
    }
    return { count: Math.min(2, count), needed: 2 };
  }

  function latestWeightEntry() {
    const weights = Array.isArray(state.weights) ? state.weights.slice() : [];
    weights.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (weights.length) return weights[0];
    const profileWeight = state.profile && Number(state.profile.weight);
    return Number.isFinite(profileWeight) ? { date: todayIso(), weight: profileWeight } : null;
  }

  function weeklyWeightTrend() {
    const weights = (Array.isArray(state.weights) ? state.weights : [])
      .filter((x) => Number.isFinite(Number(x.weight)) && x.date)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (weights.length < 2) return null;
    const latest = weights[weights.length - 1];
    const candidates = weights.filter((x) => {
      const d = daysBetween(latest.date, x.date);
      return d != null && d >= 14 && d <= 42;
    });
    const anchor = candidates.length ? candidates[candidates.length - 1] : weights[0];
    const days = daysBetween(latest.date, anchor.date);
    if (!days || days < 7) return null;
    return (Number(latest.weight) - Number(anchor.weight)) / (days / 7);
  }

  function weightPlan(latest) {
    const current = latest ? Number(latest.weight) : Number(state.profile && state.profile.weight);
    const configuredGoal = Number(state.profile && state.profile.goalWeight);
    const goal = Number.isFinite(configuredGoal) && configuredGoal > current ? configuredGoal : current;
    const bodyFat = latest && Number(latest.bodyFatPct);
    let low = 0.10, high = 0.20;
    if (Number.isFinite(bodyFat) && bodyFat >= 18) { low = 0.05; high = 0.15; }
    if (Number.isFinite(bodyFat) && bodyFat < 12) { low = 0.15; high = 0.25; }
    const remaining = Math.max(0, goal - current);
    const minWeeks = remaining > 0 ? Math.ceil(remaining / high) : 0;
    const maxWeeks = remaining > 0 ? Math.ceil(remaining / low) : 0;
    return { current, goal, low, high, remaining, minWeeks, maxWeeks, bodyFat };
  }

  function targetWeightAtWeeks(plan, weeks) {
    if (!plan) return null;
    if (plan.goal <= plan.current) return plan.current;
    const middle = (plan.low + plan.high) / 2;
    return Math.min(plan.goal, plan.current + middle * weeks);
  }

  function nextChestDate(history) {
    if (!history.length) return '';
    const last = history[0];
    const extra = last.limitSets >= 2 ? 3 : 2;
    return addDays(last.date, extra);
  }

  function ensureCard() {
    let card = document.getElementById('longTermGrowthCard');
    if (card) return card;
    const daily = document.getElementById('dailyPlanCard');
    const focus = document.getElementById('focusCard');
    const anchor = daily || focus;
    if (!anchor || !anchor.parentElement) return null;
    card = document.createElement('div');
    card.id = 'longTermGrowthCard';
    card.className = 'diag-card';
    card.style.marginTop = '12px';
    anchor.insertAdjacentElement('afterend', card);
    return card;
  }

  function axisBar(current, target) {
    const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
    return `<div style="height:5px;background:var(--surface-3);border-radius:999px;overflow:hidden;margin-top:8px;"><div style="height:100%;width:${Math.round(ratio * 100)}%;background:var(--accent);border-radius:inherit;"></div></div>`;
  }

  function renderLongTermPlan() {
    const card = ensureCard();
    if (!card || !state || !state.profile) return;

    const latest = latestWeightEntry();
    const weight = weightPlan(latest);
    const history = chestHistory();
    const baseline = chestBaseline(history);
    const bodyWeight = weight && Number.isFinite(weight.current) ? weight.current : 70;
    const milestones = chestMilestones(baseline ? baseline.weight : 0, bodyWeight);
    const promotion = promotionProgress(history, baseline);
    const trend = weeklyWeightTrend();
    const nextDate = nextChestDate(history);
    const today = todayIso();

    const currentChestText = baseline
      ? `${fmtNum(baseline.weight)}kg × ${fmtNum(baseline.minReps)}回 × ${baseline.sets}セット`
      : '記録なし';
    const chestNext = milestones[0];
    const chestRatio = baseline ? baseline.weight / bodyWeight : 0;

    let weightStatus = '';
    if (trend == null) weightStatus = '体重トレンド判定は記録2点以上から';
    else if (trend < weight.low) weightStatus = `直近 ${trend >= 0 ? '+' : ''}${fmtNum(trend, 2)}kg/週 → 増量ペース不足`;
    else if (trend > weight.high) weightStatus = `直近 +${fmtNum(trend, 2)}kg/週 → 速すぎるので抑える`;
    else weightStatus = `直近 +${fmtNum(trend, 2)}kg/週 → 目標範囲内`;

    const timeline = [4, 12, 24].map((weeks, idx) => {
      const chest = milestones[Math.min(idx, milestones.length - 1)];
      const wt = targetWeightAtWeeks(weight, weeks);
      return `
        <div style="display:grid;grid-template-columns:54px 1fr;gap:10px;padding:${idx ? '11px' : '4px'} 0 11px;${idx ? 'border-top:1px solid var(--border-soft);' : ''}">
          <div style="font-size:11px;color:var(--muted);font-weight:700;">${weeks === 4 ? '1か月' : weeks === 12 ? '3か月' : '6か月'}</div>
          <div>
            <div style="font-size:13px;color:var(--text-soft);">体重 <span class="num" style="color:var(--text);font-weight:750;">${fmtNum(wt)}kg</span></div>
            <div style="font-size:13px;color:var(--text-soft);margin-top:2px;">チェスト <span class="num" style="color:var(--text);font-weight:750;">${fmtNum(chest.weight)}kg × 8〜12回 × 3セット</span></div>
          </div>
        </div>`;
    }).join('');

    card.innerHTML = `
      <div class="card-title" style="margin-bottom:10px;">長期プラン</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">体重とチェストプレスの2軸で進捗管理</div>

      <div style="padding:12px 0;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
          <div style="font-size:12px;color:var(--muted);font-weight:700;">体重</div>
          <div class="num" style="font-size:17px;font-weight:800;">${fmtNum(weight.current)} → ${fmtNum(weight.goal)}kg</div>
        </div>
        ${axisBar(weight.current, weight.goal || weight.current)}
        <div style="margin-top:8px;font-size:11px;color:var(--text-soft);">目標 +${fmtNum(weight.low, 2)}〜${fmtNum(weight.high, 2)}kg/週 ・ 7日平均で判定</div>
        <div style="margin-top:3px;font-size:11px;color:var(--muted);">${weight.remaining > 0 ? `到達目安 ${weight.minWeeks}〜${weight.maxWeeks}週` : '設定目標に到達済み。4週間は±0.5kgで維持して筋力を伸ばす'} ・ ${weightStatus}</div>
      </div>

      <div style="padding:14px 0 12px;border-bottom:1px solid var(--border-soft);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;">
          <div style="font-size:12px;color:var(--muted);font-weight:700;">チェストプレス</div>
          <div class="num" style="font-size:15px;font-weight:800;text-align:right;">${currentChestText}</div>
        </div>
        ${baseline ? axisBar(baseline.weight, chestNext.weight) : ''}
        <div style="margin-top:8px;font-size:11px;color:var(--text-soft);">次の壁 ${fmtNum(chestNext.weight)}kg × 8〜12回 × 3セット ・ 現在 体重比 ${fmtNum(chestRatio, 2)}倍</div>
        <div style="margin-top:3px;font-size:11px;color:var(--muted);">週${CHEST_SESSIONS_PER_WEEK}回、${CHEST_REST_HOURS}空ける${nextDate ? ` ・ 次回目安 ${fmtDate(nextDate)}${nextDate < today ? '以降' : ''}` : ''}</div>
        <div style="margin-top:3px;font-size:11px;color:var(--muted);">重量UP判定 ${promotion.count}/${promotion.needed}回クリア</div>
      </div>

      <div style="padding-top:13px;">
        <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:6px;">マイルストーン</div>
        ${timeline}
      </div>

      <details style="margin-top:4px;padding-top:10px;border-top:1px solid var(--border-soft);">
        <summary style="cursor:pointer;color:var(--muted);font-size:11px;font-weight:600;list-style:none;">長期ロジックを見る</summary>
        <div style="margin-top:8px;color:var(--text-soft);font-size:11px;line-height:1.8;">
          <div>・チェストは同じマシンを週2回、48〜72時間空けて継続</div>
          <div>・同重量で12回×3セットを達成し、「限界」が1セット以下の状態を2回連続で作ったら次の重量へ</div>
          <div>・重量を上げた直後は8回から再開し、8→9→10→11→12回と先に回数を伸ばす</div>
          <div>・新重量で8回を2セット以上できなければ、次回は1段階戻して再構築</div>
          <div>・3回連続で回数も重量も伸びない場合は、重量を無理に上げず、体重トレンドと回復を先に確認</div>
          <div>・体重は単日の値ではなく7日平均。目標ペースを2週間外れた時だけ食事量を調整</div>
          <div>・チェスト目標は同じマシン内での体重比を基準に、約0.65倍 → 0.75倍 → 0.85倍を長期目標として自動更新</div>
        </div>
      </details>`;
  }

  if (typeof renderCoach === 'function') {
    const baseRenderCoach = renderCoach;
    renderCoach = function () {
      const result = baseRenderCoach.apply(this, arguments);
      renderLongTermPlan();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(renderLongTermPlan, 0));
  window.addEventListener('load', () => setTimeout(renderLongTermPlan, 700));

  window.renderLongTermPlan = renderLongTermPlan;
})();
