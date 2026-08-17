(function () {
  'use strict';

  const ADVISOR_ID = 'hypertrophyWeightAdvisor';

  function selectedDate() {
    return document.getElementById('recordDate')?.value || (typeof todayStr === 'function' ? todayStr() : '');
  }

  function repRange(name) {
    if (/サイドレイズ|リアレイズ|フライ|カール|トライセ|プレスダウン|アブドミナル|ロータリー/.test(name)) return [10, 15];
    if (/デッドリフト|スクワット/.test(name)) return [6, 10];
    return [8, 12];
  }

  function weightStep(value, direction) {
    const w = Number(value) || 0;
    if (Array.isArray(WEIGHT_OPTIONS) && WEIGHT_OPTIONS.length) {
      const idx = WEIGHT_OPTIONS.indexOf(snapWeight(w));
      if (idx >= 0) {
        const nextIdx = Math.max(0, Math.min(WEIGHT_OPTIONS.length - 1, idx + direction));
        return WEIGHT_OPTIONS[nextIdx];
      }
    }
    return Math.max(0, w + (w >= 15 ? 5 : 2) * direction);
  }

  function dayDiff(laterIso, earlierIso) {
    if (!laterIso || !earlierIso) return 999;
    return Math.max(0, Math.floor((parseISO(laterIso) - parseISO(earlierIso)) / 86400000));
  }

  function historyFor(name, beforeIso) {
    return state.sessions
      .filter((s) => s.date < beforeIso && s.exercises.some((e) => e.name === name))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function analyzeSession(session, name) {
    const ex = session?.exercises?.find((e) => e.name === name);
    if (!ex || !ex.sets?.length) return null;

    const byWeight = new Map();
    ex.sets.forEach((set, idx) => {
      const w = Number(set.weight) || 0;
      if (!byWeight.has(w)) byWeight.set(w, { weight: w, sets: [], lastIdx: idx });
      const bucket = byWeight.get(w);
      bucket.sets.push(set);
      bucket.lastIdx = idx;
    });
    const main = [...byWeight.values()].sort((a, b) =>
      (b.sets.length - a.sets.length) || (b.lastIdx - a.lastIdx)
    )[0];
    const reps = main.sets.map((s) => Number(s.reps) || 0).filter((n) => n > 0);
    const avgReps = reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;
    const rpes = main.sets.map((s) => Number(s.rpe)).filter((n) => n >= 1 && n <= 3);
    const limitRate = rpes.length ? rpes.filter((r) => r === 3).length / rpes.length : null;
    const easyRate = rpes.length ? rpes.filter((r) => r === 1).length / rpes.length : null;
    const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;

    let effortLabel = '未記録';
    if (rpes.length) {
      if (limitRate >= 0.5) effortLabel = '限界多め';
      else if (avgRpe <= 1.4) effortLabel = '余裕';
      else effortLabel = '普通';
    }

    return {
      date: session.date,
      weight: main.weight,
      reps: avgReps,
      sets: main.sets.length,
      totalSets: ex.sets.length,
      limitRate,
      easyRate,
      avgRpe,
      effortLabel,
    };
  }

  function recommend(name, beforeIso) {
    const [lo, hi] = repRange(name);
    const history = historyFor(name, beforeIso);

    if (!history.length) {
      const fallback = state.profile && typeof starterWeight === 'function'
        ? starterWeight(name, state.profile)
        : 0;
      return {
        weight: fallback,
        reps: Math.round((lo + hi) / 2),
        sets: 3,
        previous: null,
        days: null,
        decision: '履歴がないため初回の仮設定。フォームを崩さず、上限回数まで余裕が出たら次回から増量',
        range: [lo, hi],
      };
    }

    const last = analyzeSession(history[history.length - 1], name);
    const prev = history.length >= 2 ? analyzeSession(history[history.length - 2], name) : null;
    const days = dayDiff(beforeIso, last.date);
    let weight = last.weight;
    let reps = Math.max(lo, Math.min(hi, Math.round(last.reps) || lo));
    let decision = '';

    const limitHeavy = last.limitRate !== null && last.limitRate >= 0.5;
    const easy = last.easyRate !== null && last.easyRate >= 0.5;
    const rpeUnknown = last.limitRate === null;

    if (days >= 21) {
      weight = weightStep(last.weight, -1);
      reps = Math.max(lo, Math.min(hi, Math.round(last.reps) || lo));
      decision = `${days}日空いているため1段軽く再開。筋肥大より先にフォームと出力を戻す`;
    } else if (days <= 1 && limitHeavy) {
      if (last.reps <= lo + 0.5) {
        weight = weightStep(last.weight, -1);
        reps = Math.min(hi, lo + 2);
        decision = '前日トレーニングかつ前回は限界多め。1段軽くして失速を避ける';
      } else {
        weight = last.weight;
        reps = Math.max(lo, Math.min(hi, Math.round(last.reps)));
        decision = '前日トレーニングかつ限界多め。今日は重量を上げず同重量で再現性を優先';
      }
    } else if (limitHeavy) {
      if (last.reps < lo) {
        weight = weightStep(last.weight, -1);
        reps = Math.min(hi, lo + 2);
        decision = '前回は目標回数未満かつ限界多め。1段軽くして有効レップを確保';
      } else if (last.reps <= lo + 1) {
        weight = last.weight;
        reps = Math.max(lo, Math.round(last.reps));
        decision = '前回は下限付近で限界。重量は据え置き、まず同回数を安定させる';
      } else if (last.reps >= hi) {
        weight = weightStep(last.weight, 1);
        reps = lo;
        decision = '限界でも上限回数を達成。次の重量へ1段上げて下限回数から再スタート';
      } else {
        weight = last.weight;
        reps = Math.max(lo, Math.min(hi, Math.round(last.reps)));
        decision = '前回は限界寄り。重量は据え置き、同じ回数を安定してから増量';
      }
    } else if (last.reps >= hi) {
      weight = weightStep(last.weight, 1);
      reps = lo;
      decision = `前回${Math.round(last.reps)}回で上限${hi}回に到達。重量を1段上げて${lo}回から再スタート`;
    } else if (easy && last.reps >= hi - 2) {
      weight = weightStep(last.weight, 1);
      reps = lo;
      decision = '前回は余裕があり上限に近い。重量を1段上げても筋肥大レンジを維持できる見込み';
    } else {
      weight = last.weight;
      reps = Math.min(hi, Math.max(lo, Math.floor(last.reps) + 1));
      decision = rpeUnknown
        ? 'きつさ未記録なので重量は据え置き。まず前回より1回増やし、上限達成後に重量UP'
        : '重量は据え置き。前回より1回増やすダブルプログレッションを優先';
    }

    if (prev && prev.weight === last.weight) {
      const repDelta = last.reps - prev.reps;
      if (repDelta >= 1) decision += `。同重量で前々回より約${Math.round(repDelta)}回伸びており進歩あり`;
      else if (repDelta <= -1 && limitHeavy) decision += '。同重量で回数も低下しているため無理な増量はしない';
    }

    return {
      weight: snapWeight(weight),
      reps,
      sets: Math.max(2, Math.min(3, last.totalSets || 3)),
      previous: last,
      previous2: prev,
      days,
      decision,
      range: [lo, hi],
    };
  }

  function fmtDateShort(iso) {
    const d = parseISO(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function fmtRep(n) {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function ensureStyle() {
    if (document.getElementById('hypertrophyAdvisorStyle')) return;
    const style = document.createElement('style');
    style.id = 'hypertrophyAdvisorStyle';
    style.textContent = `
      .hwa-card { margin:-2px 0 14px; padding:12px 14px; border:1px solid var(--border); border-radius:var(--r-sm); background:var(--surface-2); }
      .hwa-main { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .hwa-label { font-size:10.5px; color:var(--accent); font-weight:800; letter-spacing:.08em; }
      .hwa-value { font-size:15px; color:var(--text); font-weight:800; white-space:nowrap; }
      .hwa-value strong { font-size:20px; }
      .hwa-details { margin-top:8px; border-top:1px solid var(--border-soft); padding-top:8px; }
      .hwa-details summary { color:var(--muted); font-size:11px; font-weight:700; cursor:pointer; list-style:none; }
      .hwa-details summary::-webkit-details-marker { display:none; }
      .hwa-details summary::after { content:'⌄'; float:right; color:var(--muted-soft); }
      .hwa-details[open] summary::after { content:'⌃'; }
      .hwa-logic { margin-top:8px; color:var(--muted); font-size:11px; line-height:1.7; }
      .hwa-logic strong { color:var(--text-soft); font-weight:700; }
    `;
    document.head.appendChild(style);
  }

  function ensureCard() {
    ensureStyle();
    let card = document.getElementById(ADVISOR_ID);
    if (card) return card;
    const weightButton = document.getElementById('weightPickerButton');
    const weightWrap = weightButton?.parentElement;
    if (!weightWrap || !weightWrap.parentElement) return null;
    card = document.createElement('div');
    card.id = ADVISOR_ID;
    card.className = 'hwa-card';
    weightWrap.insertAdjacentElement('afterend', card);
    return card;
  }

  function renderAdvisor(name, applySuggestion) {
    const card = ensureCard();
    if (!card || !name) {
      if (card) card.style.display = 'none';
      return;
    }
    const iso = selectedDate();
    if (!iso) return;
    const rec = recommend(name, iso);
    const p = rec.previous;
    const previousText = p
      ? `${fmtDateShort(p.date)} ・ ${fmtNum(p.weight)}kg × ${fmtRep(p.reps)}回 ・ ${p.totalSets}セット ・ ${p.effortLabel}`
      : '履歴なし';
    const intervalText = rec.days == null ? '初回' : rec.days === 0 ? '同日' : `${rec.days}日ぶり`;

    card.style.display = 'block';
    card.innerHTML = `
      <div class="hwa-main">
        <span class="hwa-label">筋肥大おすすめ</span>
        <span class="hwa-value"><strong>${fmtNum(rec.weight)}</strong>kg × ${rec.reps}回</span>
      </div>
      <details class="hwa-details">
        <summary>提案ロジックを見る</summary>
        <div class="hwa-logic">
          <div><strong>前回</strong> ${escapeHTML(previousText)}</div>
          <div><strong>間隔</strong> ${escapeHTML(intervalText)}</div>
          <div><strong>目標</strong> ${rec.range[0]}〜${rec.range[1]}回 × ${rec.sets}セット</div>
          <div><strong>判定</strong> ${escapeHTML(rec.decision)}</div>
        </div>
      </details>
    `;

    if (applySuggestion) {
      const currentSession = state.sessions.find((s) => s.date === iso);
      const already = currentSession?.exercises?.find((e) => e.name === name)?.sets?.length > 0;
      if (!already) {
        setInputWeight(rec.weight);
        inputReps.value = rec.reps;
        inputSets.value = rec.sets;
        if (typeof refreshAddBtnLabel === 'function') refreshAddBtnLabel();
      }
    }
  }

  const baseSelectExercise = selectExercise;
  selectExercise = function (name) {
    baseSelectExercise(name);
    if (!name) {
      const card = document.getElementById(ADVISOR_ID);
      if (card) card.style.display = 'none';
      return;
    }
    renderAdvisor(name, true);
  };

  const dateEl = document.getElementById('recordDate');
  if (dateEl) {
    dateEl.addEventListener('change', () => {
      if (currentExercise) setTimeout(() => renderAdvisor(currentExercise, true), 0);
    });
  }

  const addBtn = document.getElementById('addSetBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (currentExercise) setTimeout(() => renderAdvisor(currentExercise, false), 0);
    });
  }
})();