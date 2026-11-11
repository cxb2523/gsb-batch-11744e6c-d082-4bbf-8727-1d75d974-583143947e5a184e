// 합성 배경음 스케줄링 감사(BgmAudit) 자동 테스트.
// 네트워크·실제 자격 증명·오디오 장치 없이 Node 의 vm 으로만 실행한다(외부 의존성 0).
//   node tests/run-tests.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJs = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}
function eq(actual, expected, msg) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}

// 브라우저의 클래식 <script> 나열 순서를 vm 한 컨텍스트로 재현한다.
function makeBrowserSandbox(extraGlobals) {
  const listeners = {};
  const sandbox = {
    console,
    Math, JSON, Date, Number, Array, Object, String, Boolean, Set, Map, isNaN, isFinite, parseInt, parseFloat,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    performance: { now: () => 0 },
    location: { protocol: 'file:', origin: 'null' },
    document: { hidden: true, addEventListener: () => {}, removeEventListener: () => {} },
    window: {},
    navigator: {},
    indexedDB: { open: () => { throw new Error('no indexed db in tests'); } },
    Audio: function () { throw new Error('no Audio element in tests'); },
    Promise,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),   // js/defs.js 가 제공하는 전역
  };
  sandbox.window.addEventListener = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  sandbox.globalThis = sandbox;
  if (extraGlobals) Object.assign(sandbox, extraGlobals);
  const ctx = vm.createContext(sandbox);
  ctx.__listeners = listeners;
  return ctx;
}
function load(ctx, rel) {
  vm.runInContext(readJs(rel), ctx, { filename: rel });
}
// vm 컨텍스트 안의 최상위 const/let 은 sandbox 프로퍼티가 아니라 어휘 환경에 살므로
// 표현식 평가로 꺼낸다(컨텍스트 안의 스크립트끼리는 정상적으로 공유된다).
const get = (ctx, name) => vm.runInContext(name, ctx);

// ── 테스트 1: BgmAudit 단독( Sound 없음 ) 동작 ──
const solo = makeBrowserSandbox();
load(solo, 'js/bgmaudit.js');
const BgmAuditSolo = get(solo, 'BgmAudit');

ok(BgmAuditSolo && typeof BgmAuditSolo.auditTheme === 'function', 'BgmAudit exposes auditTheme');
ok(typeof BgmAuditSolo.auditSchedule === 'function', 'BgmAudit exposes auditSchedule');

{
  const r = BgmAuditSolo.auditTheme('town');
  ok(r.degraded === true && r.status === 'unavailable', 'without Sound hooks the theme audit degrades gracefully');
  ok(typeof r.reason === 'string' && r.reason.length > 0, 'unavailable result carries a readable reason');
  ok(Array.isArray(r.affected) && r.affected.length > 0, 'unavailable result names affected fields');
  const s0 = JSON.stringify(r);
  ok(typeof s0 === 'string', 'unavailable result is JSON serializable (no throw)');
  ok(typeof JSON.parse(s0).reason === 'string', 'unavailable result round-trips through JSON');
}

// ── 테스트 2: 실제 Sound 모듈과 함께 로드( bgmaudit → audio 순서: index.html 기준) ──
const ctx = makeBrowserSandbox();
load(ctx, 'js/bgmaudit.js');
load(ctx, 'js/audio.js');
const BgmAudit = get(ctx, 'BgmAudit');
const Sound = get(ctx, 'Sound');

ok(Sound && typeof Sound.auditBgm === 'function', 'Sound exposes read-only auditBgm entry');
ok(!Object.keys(Sound).includes('auditBgm'), 'auditBgm does not alter the enumerable public export list');
ok(!Object.keys(Sound).includes('__bgmAuditHooks'), 'internal audit hooks are non-enumerable');
{
  const desc = Object.getOwnPropertyDescriptor(Sound, 'auditBgm');
  ok(desc && desc.writable === false && desc.configurable === false, 'auditBgm is read-only (non-writable, non-configurable)');
}
// 기존 export 유지 확인
['play', 'bgm', 'title', 'town', 'dungeon', 'boss', 'refresh'].forEach(name => {
  ok(typeof Sound[name] === 'function', 'existing Sound export is unchanged: ' + name);
});

// ── 테스트 3: 정상 경로 — 감사 결과가 makeTheme 와 항목별로 일치하고 모든 검사 통과 ──
function realTheme(key, o) { return Sound.__bgmAuditHooks.makeTheme(key, o || {}); }
const KEY = 'dg:forest-42';
const OVER = { mode: 'dorian', bpm: 112, root: 53, prog: [0, 5, 3, 4], wave: 'sawtooth', bass: 'triangle', drums: true, sparse: 0.4 };

{
  const th = realTheme(KEY, OVER);
  const r = BgmAudit.auditTheme(KEY, OVER);
  ok(r.status === 'ok' && r.degraded === false, 'normal path returns a non-degraded ok result');
  ok(r.checks.every(c => c.pass), 'normal path passes every check: ' + r.checks.filter(c => !c.pass).map(c => c.id).join(','));
  ok(r.ok === true, 'normal path ok flag is true');

  // makeTheme 와 항목별 일치
  eq(r.theme.bpm, th.bpm, 'audited bpm equals makeTheme bpm');
  eq(r.theme.prog, th.prog, 'audited chord progression equals makeTheme prog');
  eq(r.theme.root, th.deg(0, 0), 'audited root equals makeTheme root (deg(0,0))');
  eq(r.theme.wave, th.wave, 'audited wave equals makeTheme wave');
  eq(r.theme.bass, th.bass, 'audited bass equals makeTheme bass');
  eq(r.theme.drums, !!th.drums, 'audited drums flag equals makeTheme drums');
  ok(r.theme.scaleName === OVER.mode, 'scale name is the selected mode: ' + r.theme.scaleName);

  // 멜로디 64칸: 길이·쉼표 수·비쉼 칸의 (step,midi)
  ok(Array.isArray(th.mel) && th.mel.length === 64, 'makeTheme mel length is exactly 64');
  eq(r.theme.stepCount, 64, 'audited step count is 64');
  const expectNotes = [], expectRests = [];
  th.mel.forEach((m, i) => (m === null || m === undefined ? expectRests : expectNotes).push(i));
  eq(r.theme.restCount, expectRests.length, 'rest count matches makeTheme mel');
  eq(r.theme.restSteps, expectRests, 'rest step indexes match makeTheme mel');
  eq(r.theme.noteCount, expectNotes.length, 'non-rest note count matches makeTheme mel');
  eq(r.theme.notes.map(n => n.step), expectNotes, 'non-rest step numbers match makeTheme mel');
  eq(r.theme.notes.map(n => n.midi), expectNotes.map(i => th.mel[i]), 'every non-rest MIDI pitch equals makeTheme mel value');

  // 멜로디 음정을 deg 함수로 재계산 가능
  const degCheck = r.checks.find(c => c.id === 'melody-deg-recompute');
  ok(degCheck && degCheck.pass, 'all melody notes are reproducible via the theme deg function');

  // 카테고리별 이벤트 카운트를 scheduleStep 분기 그대로 재계산해 대조
  const expectTotals = { bass: 0, chord: 0, melody: 0, drums: 0 };
  for (let i = 0; i < 64; i++) {
    const beat = i % 16;
    if (beat % 4 === 0) expectTotals.bass++;
    if (beat % 2 === 0) expectTotals.chord++;
    if (th.mel[i % 64]) expectTotals.melody++;
    if (th.drums) { if (beat % 8 === 4) expectTotals.drums++; if (beat % 2 === 0) expectTotals.drums++; }
  }
  eq(r.events.byCategory, expectTotals, 'per-category event counts match the scheduleStep rules');
  eq(r.events.total, expectTotals.bass + expectTotals.chord + expectTotals.melody + expectTotals.drums,
    'event total equals the sum of category counts');
  eq(r.events.perStep.length, 64, 'per-step event table covers all 64 steps');
  ok(r.events.perStep.every(e => e.bass + e.chord + e.melody + e.drums >= 0), 'per-step rows only contain counts');
  eq(r.theme.stepSeconds, 60 / th.bpm / 4, 'step duration in seconds follows bpm');

  // bpm 양수·음역 검사
  const bpmCheck = r.checks.find(c => c.id === 'bpm-positive');
  ok(bpmCheck && bpmCheck.pass && r.theme.bpm > 0, 'bpm-positive check passes');
  const rangeCheck = r.checks.find(c => c.id === 'midi-range');
  ok(rangeCheck && rangeCheck.pass, 'midi-range check passes for every non-rest note');
  ok(r.theme.notes.every(n => n.midi >= 24 && n.midi <= 108), 'all MIDI pitches lie in the audited sane range');
}

// ── 테스트 4: 오버라이드 없이 호출 — 기본 모드에서도 makeTheme 와 일치 ──
{
  const th = realTheme('title', {});
  const r = BgmAudit.auditTheme('title');
  ok(r.status === 'ok' && r.checks.every(c => c.pass), 'default-override audit passes all checks');
  eq(r.theme.bpm, th.bpm, 'default bpm equals makeTheme bpm');
  eq(r.theme.prog, th.prog, 'default prog equals makeTheme prog');
  eq(r.theme.notes.map(n => n.midi), th.mel.filter(m => m !== null).map(m => m), 'default melody pitches match');
  ok(r.theme.scaleName === 'major', 'default mode is major');
}

// 결정성: 같은 입력으로 두 번 감사해도 동일
{
  const a = BgmAudit.auditTheme(KEY, OVER), b = BgmAudit.auditTheme(KEY, OVER);
  eq(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'same key+overrides yield identical audits');
}

// ── 테스트 5: 부정 경로 — 같은 카테고리가 같은 시각에 중복 트리거되면 검사 실패 ──
{
  const scheduled = [
    { step: 0, time: 0.0, events: [{ category: 'bass' }, { category: 'chords_typo' }, { category: 'drums' }] },
    { step: 1, time: 0.125, events: [{ category: 'drums' }, { category: 'drums' }] },   // 같은 시각 drums 중복
    { step: 2, time: 0.25, events: [{ category: 'melody' }] },
    { step: 3, time: 9.0, events: [{ category: 'bass' }] },                             // 창 밖
  ];
  const r = BgmAudit.auditSchedule(scheduled, [0, 1.0]);
  ok(r.kind === 'schedule', 'schedule audit returns a schedule-kind report');
  eq(r.events.total, 6, 'window event total counts only in-window events');
  eq(r.events.byCategory, { bass: 1, chord: 0, melody: 1, drums: 3, other: 1 }, 'window category counts are correct');
  eq(r.stepsConsidered, 3, 'three scheduled steps fall inside the window');
  eq(r.firstEventTime, 0.0, 'first event time reported');
  eq(r.lastEventTime, 0.25, 'last event time reported');
  ok(r.duplicateSameCategorySameTime === true, 'duplicate same-category same-time trigger is flagged');
  const dupCheck = r.checks.find(c => c.id === 'no-duplicate-category-same-time');
  ok(dupCheck && dupCheck.pass === false && typeof dupCheck.reason === 'string',
    'duplicate check fails with a readable reason');
  ok(r.duplicates.some(d => d.category === 'drums' && d.time === 0.125), 'duplicate detail names category and time');
  ok(r.ok === false, 'overall ok is false when a check fails');

  // 같은 입력이라도 중복이 없으면 통과
  const clean = [
    { step: 0, time: 0.0, events: [{ category: 'bass' }, { category: 'drums' }] },
    { step: 2, time: 0.25, events: [{ category: 'melody' }] },
  ];
  const r2 = BgmAudit.auditSchedule(clean, [0, 1.0]);
  ok(r2.checks.every(c => c.pass) && r2.ok === true, 'a schedule without duplicates passes all checks');
  eq(r2.events.total, 3, 'clean schedule event total');
  eq(r2.firstEventTime, 0.0, 'clean schedule first event time');
  eq(r2.lastEventTime, 0.25, 'clean schedule last event time');
}

// ── 테스트 6: 경계·강등 경로 — 빈 key, 불법 mode, bpm 0 ──
{
  const empty = BgmAudit.auditTheme('');
  ok(empty.degraded === true && empty.status === 'invalid-input', 'empty key returns a degraded result (no throw)');
  ok(empty.affected.includes('key') && typeof empty.reason === 'string', 'empty-key degradation names key and gives a reason');

  const badMode = BgmAudit.auditTheme('town', { mode: 'pentatonic' });
  ok(badMode.degraded === true && badMode.status === 'invalid-input', 'illegal mode returns a degraded result');
  ok(badMode.affected.includes('mode'), 'illegal-mode degradation marks the mode field');
  ok(badMode.overrideErrors.some(e => e.field === 'mode'), 'illegal-mode error detail is present');
  ok(!badMode.theme, 'illegal mode does not silently produce a normal theme');

  const zeroBpm = BgmAudit.auditTheme('town', { bpm: 0 });
  ok(zeroBpm.degraded === true && zeroBpm.status === 'invalid-input', 'bpm=0 returns a degraded result');
  ok(zeroBpm.affected.includes('bpm') && typeof zeroBpm.reason === 'string', 'bpm=0 degradation marks bpm with a reason');
  ok(!zeroBpm.theme, 'bpm=0 does not silently produce a normal theme');

  const negBpm = BgmAudit.auditTheme('town', { bpm: -5 });
  ok(negBpm.degraded === true && negBpm.affected.includes('bpm'), 'negative bpm also degrades');

  const badProg = BgmAudit.auditTheme('town', { prog: [0, 1] });
  ok(badProg.degraded === true && badProg.affected.includes('prog'), 'malformed prog degrades and marks prog');

  // 강등 결과도 예외 없이 JSON 직렬화 가능
  [empty, badMode, zeroBpm, negBpm, badProg].forEach((r, i) => {
    const s = JSON.stringify(r);
    ok(typeof s === 'string' && s.length > 0, 'degraded result #' + i + ' is JSON serializable');
    const back = JSON.parse(s);
    ok(back.degraded === true && typeof back.reason === 'string', 'degraded result #' + i + ' round-trips with reason intact');
  });
}

// ── 테스트 7: 시간 창 경계값 ──
{
  const scheduled = [
    { step: 0, time: 0, events: [{ category: 'bass' }] },
    { step: 4, time: 0.5, events: [{ category: 'melody' }] },
  ];
  const all = BgmAudit.auditSchedule(scheduled);   // 창 생략 → 전체
  ok(all.status === 'ok' && all.events.total === 2, 'omitted window covers every event');
  const edge = BgmAudit.auditSchedule(scheduled, [0.5, 0.5]);   // start === end 허용
  ok(edge.status === 'ok' && edge.events.total === 1, 'zero-width window (start === end) is valid and inclusive');

  const negWin = BgmAudit.auditSchedule(scheduled, [-1, 1]);
  ok(negWin.degraded && negWin.affected.includes('window'), 'negative window start degrades');
  const reversed = BgmAudit.auditSchedule(scheduled, [1, 0]);
  ok(reversed.degraded && reversed.affected.includes('window'), 'window with start later than end degrades');

  const malformed = BgmAudit.auditSchedule([{ step: 0, time: 'now', events: [] }], [0, 1]);
  ok(malformed.degraded === true, 'malformed step entry produces a degraded schedule report');
}

// ── 테스트 8: 모든 정상 감사 객체의 JSON 직렬화(함수·노드 등 비직렬화 요소 없음) ──
{
  const r1 = BgmAudit.auditTheme(KEY, OVER);
  const r2 = BgmAudit.auditTheme('boss', { mode: 'minor', bpm: 150, root: 45, prog: [0, 5, 6, 4], drums: false });
  const r3 = BgmAudit.auditSchedule([{ step: 0, time: 0, events: [{ category: 'bass' }] }], [0, 10]);
  [r1, r2, r3].forEach((r, i) => {
    const s = JSON.stringify(r);
    ok(typeof s === 'string', 'audit object #' + i + ' stringifies without throwing');
    // 직렬화된 값 어디에도 함수(또는 함수 결과)가 남아 있지 않은지 값 단위로 재확인
    const scan = v => {
      if (typeof v === 'function') return true;
      if (v && typeof v === 'object') for (const k of Object.keys(v)) if (scan(v[k])) return true;
      return false;
    };
    ok(scan(r) === false, 'audit object #' + i + ' contains no function values');
    const back = JSON.parse(s);
    ok(back && back.schema === 'bgm-audit/v1', 'audit object #' + i + ' survives JSON round-trip');
  });
  ok(r2.events.byCategory.drums === 0, 'drums disabled theme reports zero drum events');
}

// ── 테스트 9: Sound.auditBgm 통합 — 꺼짐/테마 없음/정상 ──
{
  // 아직 bgm() 호출 전: 활성 테마 없음
  const none = Sound.auditBgm();
  ok(none.degraded === true && /no synthesized background music/i.test(none.reason), 'auditBgm with no want reports disabled (no throw)');

  // 합성 테마 활성화( files 없음 → 파일 검색 없음, 오디오 컨텍스트 없아도 startLoop 는 조용히 종료)
  Sound.bgm('auditplace', { mode: 'lydian', bpm: 100, root: 50, prog: [0, 3, 0, 4], sparse: 0.5 });
  const live = Sound.auditBgm();
  ok(live.status === 'ok' && live.degraded === false, 'auditBgm uses the active want theme parameters');
  eq(live.theme.bpm, 100, 'auditBgm bpm matches the active theme');
  eq(live.theme.prog, [0, 3, 0, 4], 'auditBgm prog matches the active theme');
  eq(live.key, 'auditplace', 'auditBgm reports the active key');
  ok(live.checks.every(c => c.pass), 'auditBgm result passes all checks');
  ok(typeof JSON.stringify(live) === 'string', 'auditBgm result is JSON serializable');

  // 다른 key 요청
  const other = Sound.auditBgm('somewhere-else');
  ok(other.degraded === true && /no active synthesized theme/.test(other.reason), 'auditBgm for a non-active key degrades with a reason');

  // 설정에서 배경음 끔
  ctx.Game = { save: { settings: { bgm: false } } };
  const off = Sound.auditBgm();
  ok(off.degraded === true && /disabled in settings/.test(off.reason), 'auditBgm reports disabled when settings.bgm === false');
  delete ctx.Game;
}

// ── 테스트 10: 반대 로드 순서( audio 보다 bgmaudit 를 나중에 로드)도 훅 자동 연결 ──
{
  const ctx2 = makeBrowserSandbox();
  load(ctx2, 'js/audio.js');
  ok(vm.runInContext('typeof BgmAudit', ctx2) === 'undefined', 'second sandbox starts without BgmAudit');
  load(ctx2, 'js/bgmaudit.js');
  vm.runInContext('Sound.__bgmAuditHooks && BgmAudit.attach(Sound.__bgmAuditHooks)', ctx2);
  const r = vm.runInContext('BgmAudit.auditTheme("late-load", { bpm: 99 })', ctx2);
  ok(r.status === 'ok' && r.theme.bpm === 99, 'BgmAudit attaches to Sound even when loaded after audio.js');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { process.exit(1); }
