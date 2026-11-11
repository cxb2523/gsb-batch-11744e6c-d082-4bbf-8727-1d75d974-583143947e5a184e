// 합성 배경음 스케줄링 감사 (BgmAudit):
// Sound.makeTheme 가 만드는 합성 테마와 scheduleStep 의 이벤트 분류를
// AudioContext·OscillatorNode·함수·타이머 없이 순수 데이터(JSON 직렬화 가능)로
// 분석·검증하는 읽기 전용 모듈. 음계/화성 공식을 따로 두지 않고
// Sound 가 노출하는 실제 makeTheme·SCALES 훅만 사용한다.
'use strict';

const BgmAudit = (() => {
  const SCHEMA = 'bgm-audit/v1';
  const STEPS = 64;                       // makeTheme 의 멜로디 칸 수와 동일
  const CATEGORIES = ['bass', 'chord', 'melody', 'drums'];
  const MIDI_MIN = 24, MIDI_MAX = 108;    // 합성 테마가 닿는 합리적인 음역(약 C1~C8)
  const VALID_MODES = ['major', 'minor', 'dorian', 'lydian', 'phryg'];
  const OVERRIDE_KEYS = ['mode', 'bpm', 'root', 'prog', 'wave', 'bass', 'drums', 'sparse'];

  // ── Sound(js/audio.js) 측에서 실제 makeTheme·SCALES 훅을 주입하는 연결부 ──
  // 양쪽 모두 로드 순서에 관계 없이 동작하게 한다(bgmaudit 가 audio 보다 먼저/나중 로드 모두 지원).
  let factory = null;
  function attach(hooks) {
    if (hooks && typeof hooks.makeTheme === 'function') factory = hooks;
  }
  function getFactory() {
    if (factory && typeof factory.makeTheme === 'function') return factory;
    if (typeof Sound !== 'undefined' && Sound.__bgmAuditHooks &&
      typeof Sound.__bgmAuditHooks.makeTheme === 'function') {
      factory = Sound.__bgmAuditHooks;
      return factory;
    }
    return null;
  }

  const isInt = v => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
  const check = (id, label, pass, reason, detail) => {
    const c = { id, label, pass: !!pass };
    if (reason) c.reason = reason;
    if (detail !== undefined) c.detail = detail;
    return c;
  };
  const allPass = checks => checks.every(c => c.pass);

  // 검증 실패·모듈 미연결 등 정상 테마를 만들 수 없는 경우의 강등 결과.
  // 조용히 멀쩡한 테마처럼 보이지 않게 status/degraded/errors 로 드러낸다.
  function degraded(kind, reason, affected, extra) {
    const out = {
      schema: SCHEMA,
      kind: 'theme',
      status: kind,
      ok: false,
      degraded: true,
      reason,
      affected: Array.isArray(affected) ? affected.slice() : (affected ? [affected] : []),
      errors: [{ reason, fields: Array.isArray(affected) ? affected.slice() : (affected ? [affected] : []) }],
      checks: [],
    };
    if (extra) for (const k of Object.keys(extra)) out[k] = extra[k];
    return out;
  }
  function disabledTheme(reason, extra) {
    const out = degraded('disabled', reason, [], { disabled: true });
    delete out.errors[0].fields;
    if (extra) for (const k of Object.keys(extra)) out[k] = extra[k];
    return out;
  }

  // ── 진입 1 입력 검증: makeTheme 오버라이드 파라미터 ──
  function sanitizeOverrides(o) {
    const errs = [];
    const safe = {};
    if (o === undefined || o === null) return { safe, errs };
    if (typeof o !== 'object' || Array.isArray(o)) {
      return { safe, errs: [{ field: 'overrides', reason: 'overrides must be a plain object' }] };
    }
    const f = getFactory();
    const modeKnown = name => {
      const scales = f && f.SCALES;
      if (scales && typeof scales === 'object') return Object.prototype.hasOwnProperty.call(scales, name);
      return VALID_MODES.indexOf(name) !== -1;   // 훅이 없을 때의 보수적 기본 목록
    };
    if (o.mode !== undefined) {
      if (typeof o.mode !== 'string' || !modeKnown(o.mode)) {
        errs.push({ field: 'mode', reason: 'unknown scale mode: ' + String(o.mode) });
      } else safe.mode = o.mode;
    }
    if (o.bpm !== undefined) {
      if (typeof o.bpm !== 'number' || !Number.isFinite(o.bpm) || o.bpm <= 0) {
        errs.push({ field: 'bpm', reason: 'bpm must be a positive finite number, got: ' + String(o.bpm) });
      } else safe.bpm = o.bpm;
    }
    if (o.root !== undefined) {
      if (!isInt(o.root)) errs.push({ field: 'root', reason: 'root must be an integer MIDI note, got: ' + String(o.root) });
      else safe.root = o.root;
    }
    if (o.prog !== undefined) {
      if (!Array.isArray(o.prog) || o.prog.length !== 4 || !o.prog.every(isInt) || o.prog.some(v => v < 0)) {
        errs.push({ field: 'prog', reason: 'prog must be an array of 4 non-negative integer scale degrees' });
      } else safe.prog = o.prog.slice();
    }
    if (o.wave !== undefined) {
      if (typeof o.wave !== 'string') errs.push({ field: 'wave', reason: 'wave must be a string oscillator type' });
      else safe.wave = o.wave;
    }
    if (o.bass !== undefined) {
      if (typeof o.bass !== 'string') errs.push({ field: 'bass', reason: 'bass must be a string oscillator type' });
      else safe.bass = o.bass;
    }
    if (o.drums !== undefined) {
      if (typeof o.drums !== 'boolean') errs.push({ field: 'drums', reason: 'drums must be a boolean' });
      else safe.drums = o.drums;
    }
    if (o.sparse !== undefined) {
      if (typeof o.sparse !== 'number' || !Number.isFinite(o.sparse)) {
        errs.push({ field: 'sparse', reason: 'sparse must be a finite number, got: ' + String(o.sparse) });
      } else safe.sparse = o.sparse;
    }
    return { safe, errs };
  }

  // scheduleStep 의 분기 조건을 그대로 옮긴 "이벤트 카운트" 계산.
  // 음정·화성 공식은 쓰지 않고 어떤 카테고리가 몇 번 울리는지만 센다(순수 데이터).
  function eventsForStep(th, i) {
    const beat = i % 16;
    const ev = { step: i, bass: 0, chord: 0, melody: 0, drums: 0 };
    if (beat % 4 === 0) ev.bass += 1;                                   // 베이스
    if (beat % 2 === 0) ev.chord += 1;                                  // 화음 아르페지오
    if (th.mel[i % STEPS]) ev.melody += 1;                              // 멜로디(0/null 은 쉼)
    if (th.drums) {                                                     // 리듬: 두 조건이 같은 칸에 겹칠 수 있음
      if (beat % 8 === 4) ev.drums += 1;
      if (beat % 2 === 0) ev.drums += 1;
    }
    return ev;
  }

  // 진입 1: 장소 key 와 makeTheme 오버라이드 → 테마 구조·검사 결과를 담은 순수 데이터
  function auditTheme(key, overrides) {
    try {
      if (typeof key !== 'string' || key === '') {
        return degraded('invalid-input', 'key must be a non-empty string', ['key'], { key: key === '' ? '' : key });
      }
      const f = getFactory();
      if (!f) {
        return degraded('unavailable', 'synthesizer hooks are not available (Sound module not loaded)', ['theme']);
      }
      const { safe, errs } = sanitizeOverrides(overrides);
      if (errs.length) {
        return degraded('invalid-input', 'invalid makeTheme override parameter(s)',
          errs.map(e => e.field), { key, overrideErrors: errs, overrides: safe });
      }
      let th, th2;
      try {
        th = f.makeTheme(key, safe);
        // 같은 입력으로 다시 만들어도 완전히 같은 결정적 테마가 나오는지 확인
        th2 = f.makeTheme(key, safe);
      } catch (e) {
        return degraded('theme-build-failed', 'makeTheme threw: ' + (e && e.message ? e.message : String(e)),
          ['theme'], { key, overrides: safe });
      }
      if (!th || !Array.isArray(th.mel)) {
        return degraded('theme-build-failed', 'makeTheme returned a theme without a mel array',
          ['mel'], { key, overrides: safe });
      }
      const mel = th.mel;
      const mode = safe.mode || 'major';
      const scaleName = f.SCALES && f.SCALES[mode] ? mode : 'unknown:' + mode;
      // root 는 테마 객체에 직접 없으므로 deg 공식의 0번 음(root + scale[0] = root)으로부터 꺼낸다.
      const root = typeof th.deg === 'function' ? th.deg(0, 0) : safe.root;

      // 64칸 멜로디의 모든 비쉼 칸: 칸 번호 + MIDI 음정
      const notes = [];
      const rests = [];
      const outOfRange = [];
      for (let i = 0; i < mel.length; i++) {
        if (mel[i] === null || mel[i] === undefined) { rests.push(i); continue; }
        const midi = mel[i];
        notes.push({ step: i, midi });
        if (typeof midi !== 'number' || !Number.isFinite(midi) || midi < MIDI_MIN || midi > MIDI_MAX) {
          outOfRange.push({ step: i, midi });
        }
      }
      // 멜로디 음정이 테마 자신의 deg 함수로 다시 계산 가능한지(deg/mel 재계산 일치) 검증.
      // 음계 공식을 새로 쓰지 않고 th.deg 만 호출해 열린 음역에서 대응하는 deg 를 찾는다.
      const recomputeFailures = [];
      if (typeof th.deg === 'function') {
        for (const n of notes) {
          let hit = false;
          for (let d = 0; d <= 20 && !hit; d++) {
            for (let oct = -2; oct <= 4; oct++) {
              if (th.deg(d, oct) === n.midi) { hit = true; break; }
            }
          }
          if (!hit) recomputeFailures.push({ step: n.step, midi: n.midi });
        }
      }

      // 카테고리별 64칸 이벤트 카운트( scheduleStep 분기와 동일)
      const stepEvents = [];
      const totals = { bass: 0, chord: 0, melody: 0, drums: 0 };
      for (let i = 0; i < STEPS; i++) {
        const ev = eventsForStep(th, i);
        stepEvents.push(ev);
        totals.bass += ev.bass; totals.chord += ev.chord;
        totals.melody += ev.melody; totals.drums += ev.drums;
      }
      const totalEvents = totals.bass + totals.chord + totals.melody + totals.drums;

      const checks = [
        check('bpm-positive', 'bpm is a positive finite number',
          typeof th.bpm === 'number' && Number.isFinite(th.bpm) && th.bpm > 0,
          undefined, { bpm: th.bpm }),
        check('mel-length-64', 'melody array has exactly 64 steps',
          mel.length === STEPS, undefined, { length: mel.length, expected: STEPS }),
        check('midi-range', 'every non-rest melody MIDI note is within ' + MIDI_MIN + '..' + MIDI_MAX,
          outOfRange.length === 0,
          outOfRange.length ? outOfRange.length + ' note(s) outside range' : undefined,
          { outOfRange, min: MIDI_MIN, max: MIDI_MAX }),
        check('melody-deg-recompute', 'every melody note is reproducible from the theme deg function and mel',
          recomputeFailures.length === 0,
          recomputeFailures.length ? recomputeFailures.length + ' note(s) not reproducible via deg' : undefined,
          { failures: recomputeFailures }),
        check('deterministic', 'same key and overrides produce an identical theme on rebuild',
          !!th2 && Array.isArray(th2.mel) && th2.mel.length === mel.length && th2.mel.every((m, i) => m === mel[i]) &&
          th2.bpm === th.bpm && JSON.stringify(th2.prog) === JSON.stringify(th.prog),
          undefined, undefined),
        check('event-counts', 'per-step event counts sum to the category totals',
          stepEvents.length === STEPS &&
          stepEvents.reduce((s, e) => s + e.bass, 0) === totals.bass &&
          stepEvents.reduce((s, e) => s + e.chord, 0) === totals.chord &&
          stepEvents.reduce((s, e) => s + e.melody, 0) === totals.melody &&
          stepEvents.reduce((s, e) => s + e.drums, 0) === totals.drums,
          undefined, { totals }),
      ];
      if (typeof root === 'number' && Number.isFinite(root)) {
        checks.push(check('root-in-range', 'root MIDI note is within a sane range',
          root >= MIDI_MIN && root <= MIDI_MAX, undefined, { root }));
      }

      return {
        schema: SCHEMA,
        kind: 'theme',
        status: 'ok',
        ok: allPass(checks),
        degraded: false,
        key,
        overrides: safe,
        theme: {
          bpm: th.bpm,
          scaleName,
          prog: Array.isArray(th.prog) ? th.prog.slice() : th.prog,
          root,
          wave: th.wave,
          bass: th.bass,
          drums: !!th.drums,
          stepCount: STEPS,
          noteCount: notes.length,
          restCount: rests.length,
          restSteps: rests,
          notes,
          stepSeconds: 60 / th.bpm / 4,
        },
        events: {
          byCategory: totals,
          total: totalEvents,
          perStep: stepEvents,
        },
        checks,
      };
    } catch (e) {
      return degraded('error', 'unexpected audit failure: ' + (e && e.message ? e.message : String(e)),
        ['theme'], { key: typeof key === 'string' ? key : null });
    }
  }

  // ── 진입 2 입력 보정 ──
  // window 는 [start, end] 숫자 쌍, {start,end}, 또는 생략(전체) 가능.
  function normalizeWindow(win) {
    if (win === undefined || win === null) return { start: -Infinity, end: Infinity };
    let start, end;
    if (Array.isArray(win)) { start = win[0]; end = win[1]; }
    else if (typeof win === 'object') { start = win.start; end = win.end; }
    return {
      start: typeof start === 'number' && Number.isFinite(start) ? start : -Infinity,
      end: typeof end === 'number' && Number.isFinite(end) ? end : Infinity,
    };
  }

  // 진입 2: 이미 스케줄된 보( {step,time,events} 목록)와 시간 창 → 창 안 이벤트 집계·중복 트리거 검사
  function auditSchedule(steps, win) {
    try {
      const w0 = normalizeWindow(win);
      const windowValid =
        Number.isFinite(w0.start) && Number.isFinite(w0.end)
          ? (w0.start >= 0 && w0.end >= 0 && w0.start <= w0.end)
          : true;   // 한쪽이 무한이면(생략된 경계) 음이 아닌 유한 경계만 검사
      const finiteNonNegative = v => v === -Infinity || v === Infinity || (Number.isFinite(v) && v >= 0);
      const winOk = windowValid && finiteNonNegative(w0.start) && finiteNonNegative(w0.end);
      if (!winOk) {
        return degraded('invalid-input',
          'time window must be non-negative with start not later than end',
          ['window'], { window: { start: w0.start, end: w0.end } });
      }
      if (!Array.isArray(steps)) {
        return degraded('invalid-input', 'scheduled steps must be an array', ['steps'],
          { window: { start: w0.start, end: w0.end } });
      }

      const malformed = [];
      const counts = { bass: 0, chord: 0, melody: 0, drums: 0 };
      let otherCount = 0, inWindow = 0, firstTime = null, lastTime = null;
      const seen = new Map();          // "time|category" → 첫 발생 정보
      const duplicates = [];

      for (let idx = 0; idx < steps.length; idx++) {
        const rec = steps[idx];
        if (!rec || typeof rec !== 'object' || typeof rec.time !== 'number' || !Number.isFinite(rec.time) ||
          !Array.isArray(rec.events)) {
          malformed.push({ index: idx, reason: 'step must be an object with numeric time and events array' });
          continue;
        }
        const t = rec.time;
        if (t < w0.start || t > w0.end) continue;
        inWindow++;
        if (firstTime === null || t < firstTime) firstTime = t;
        if (lastTime === null || t > lastTime) lastTime = t;
        for (let j = 0; j < rec.events.length; j++) {
          const ev = rec.events[j];
          const cat = ev && typeof ev === 'object' ? ev.category : ev;
          if (typeof cat !== 'string' || !cat) { malformed.push({ index: idx, eventIndex: j, reason: 'event has no category string' }); continue; }
          const known = CATEGORIES.indexOf(cat) !== -1;
          if (known) counts[cat]++; else otherCount++;
          const key = t + '|' + cat;
          if (seen.has(key)) {
            const first = seen.get(key);
            duplicates.push({ category: cat, time: t, step: typeof rec.step === 'number' ? rec.step : null, firstStep: first.step });
          } else {
            seen.set(key, { step: typeof rec.step === 'number' ? rec.step : null });
          }
        }
      }

      const total = counts.bass + counts.chord + counts.melody + counts.drums + otherCount;
      const checks = [
        check('window-valid', 'time window is non-negative and start is not later than end', true),
        check('no-duplicate-category-same-time',
          'no category is triggered more than once at the same absolute time within the window',
          duplicates.length === 0,
          duplicates.length ? duplicates.length + ' duplicate trigger(s) of the same category at the same time' : undefined,
          { duplicates: duplicates.slice(0, 50) }),
        check('well-formed-steps', 'every scheduled step and event is well formed',
          malformed.length === 0,
          malformed.length ? malformed.length + ' malformed entry/entries' : undefined,
          { malformed: malformed.slice(0, 50) }),
      ];
      return {
        schema: SCHEMA,
        kind: 'schedule',
        status: malformed.length ? 'invalid-input' : 'ok',
        ok: allPass(checks),
        degraded: malformed.length > 0,
        window: { start: w0.start, end: w0.end },
        stepsConsidered: inWindow,
        events: {
          total,
          byCategory: {
            bass: counts.bass, chord: counts.chord, melody: counts.melody, drums: counts.drums,
            other: otherCount,
          },
        },
        firstEventTime: firstTime,
        lastEventTime: lastTime,
        duplicateSameCategorySameTime: duplicates.length > 0,
        duplicates: duplicates.slice(0, 50),
        checks,
      };
    } catch (e) {
      return degraded('error', 'unexpected audit failure: ' + (e && e.message ? e.message : String(e)), ['schedule']);
    }
  }

  const api = {
    SCHEMA,
    CATEGORIES,
    attach,
    auditTheme,
    auditSchedule,
    disabled: reason => disabledTheme(reason),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
