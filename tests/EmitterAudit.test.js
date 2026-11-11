/**
 * EmitterAudit 本地自动化测试（node:test，零网络、零凭据、零 DOM）。
 *
 * 所有期望值均按 EmitterInstance-BvYBj4SX.js 的源码公式手工推导：
 *   延迟 ms = rangeValue * 1000 / reduceFactor（reduceFactor 真值为 0 时 Infinity）
 *   发射量 = rate.quantity * reduceFactor（for 循环上界）
 *   duration ms = life.duration * 1000，到期后 currentDuration -= duration
 *   不朽判定 lifeCount <= 0；到期时非不朽 lifeCount--，归零则 #destroy()
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditEmitter } from "../assets/EmitterAudit.js";

const baseCanvas = { width: 800, height: 600 };

/** 递归断言结果中不存在函数/类实例等不可 JSON 序列化成分。 */
function assertPlainJsonData(value, path = "$") {
	if (value === null || value === undefined) return;
	const t = typeof value;
	if (t === "function" || t === "bigint" || t === "symbol") {
		throw new Error(`非 JSON 类型 ${t} 位于 ${path}`);
	}
	if (t === "number") {
		if (Number.isNaN(value)) throw new Error(`NaN 位于 ${path}`);
		return;
	}
	if (t === "string" || t === "boolean") return;
	if (Array.isArray(value)) {
		value.forEach((item, i) => assertPlainJsonData(item, `${path}[${i}]`));
		return;
	}
	if (t === "object") {
		for (const [key, item] of Object.entries(value)) {
			assertPlainJsonData(item, `${path}.${key}`);
		}
		return;
	}
	throw new Error(`未知类型 ${t} 位于 ${path}`);
}

function checkById(result, id) {
	const found = result.checks.find((c) => c.id === id);
	assert.ok(found, `检查项 ${id} 应存在`);
	return found;
}

// ---------------------------------------------------------------------------
test("正常路径：不朽发射器多步进的发射次数/累计延迟/发射量与手算一致且全部检查通过", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 1,
		initialPosition: undefined,
		options: {
			autoPlay: true,
			size: { width: 25, height: 50, mode: "percent" },
			life: { count: -1, delay: 0.5, duration: 1, wait: false },
			rate: { delay: 0.2, quantity: 2 },
			draw: true,
			shape: { type: "square" },
			spawn: {
				fill: { color: { value: "#ff0000" }, enable: true, opacity: 0.8 },
				stroke: { color: { value: "#00ff00" }, opacity: 0.5, width: 2 }
			}
		},
		shapeGeneratorExists: true,
		deltas: [100, 160, 240, 640, 700, 760]
	});

	// ---- 初始换算（构造函数） ----
	assert.equal(result.degraded, false, "正常路径不应降级");
	assert.equal(result.initial.immortal, true);
	assert.equal(result.initial.lifeCount, -1);
	assert.equal(result.initial.spawnDelayMs, 500, "spawnDelay = 0.5*1000/1");
	assert.equal(result.initial.spawnDelayInfinite, false);
	assert.equal(result.initial.emitDelayMs, 200, "emitDelay = 0.2*1000/1");
	assert.equal(result.initial.durationMs, 1000, "duration = 1*1000");
	assert.deepEqual(result.initial.size.pixelSize, { width: 200, height: 300 },
		"percent 尺寸: 25%*800=200, 50%*600=300");
	assert.equal(result.initial.size.mode, "percent");
	assert.equal(result.initial.constructorPlayCompleted, true);
	assert.equal(result.initial.shape.willDraw, true, "draw=true 且生成器存在 → willDraw");

	// ---- 逐步累计量（手算，见测试文件头注释公式） ----
	// 注意源码 firstSpawn 首帧把累计器预置为完整延迟（spawnDelay/emitDelay），
	// 因此首帧叠加 delta 后两个计时器都可能立即到期。duration 到期的同一帧会重新
	// 装配 spawnDelay，并立即被紧随其后的 spawn 块消费；play() 还会经 prepareToDie
	// 重新装配下一轮 duration。
	const expected = [
		// [currentDuration, currentSpawnDelay, currentEmitDelay, emitTriggered, emitted, playTriggered, durationExpired]
		[100, 100, 100, true, 2, true, false],    // 首帧预置500/200：600>=500 play、300>=200 emit
		[260, 100, 60, true, 2, false, false],    // spawn 解除武装保持100；emit 100+160=260 ->60
		[500, 100, 100, true, 2, false, false],   // emit 60+240=300 ->100
		[140, 240, 540, true, 2, true, true],     // duration 500+640=1140>=1000 到期；同帧 spawn 重装配并触发
		[840, 240, 1040, true, 2, false, false],  // emit 540+700=1240 ->1040；duration 140+700=840
		[600, 500, 1600, true, 2, true, true]     // duration 840+760=1600>=1000 第二次到期；spawn 240+760=1000>=500
	];
	assert.equal(result.steps.length, 6);
	result.steps.forEach((step, i) => {
		const [dur, spawn, emit, emitTrig, qty, playTrig, expired] = expected[i];
		assert.equal(step.currentDuration, dur, `step${i} currentDuration`);
		assert.equal(step.currentSpawnDelay, spawn, `step${i} currentSpawnDelay`);
		assert.equal(step.currentEmitDelay, emit, `step${i} currentEmitDelay`);
		assert.equal(step.emitTriggered, emitTrig, `step${i} emitTriggered`);
		assert.equal(step.emittedCount, qty, `step${i} emittedCount = quantity*reduceFactor = 2`);
		assert.equal(step.playTriggered, playTrig, `step${i} playTriggered`);
		assert.equal(step.durationExpired, expired, `step${i} durationExpired`);
		assert.equal(step.destroyed, false, "不朽发射器永不销毁");
		assert.equal(step.lifeCountRemaining, -1, "不朽发射器 lifeCount 不递减");
	});

	// step3 到期后不朽：仅重定位+重置 spawnDelay，不销毁
	assert.equal(result.steps[3].repositioned, true);
	assert.equal(result.steps[3].positionSource, "random");

	// ---- 汇总 ----
	assert.equal(result.totals.emitEventCount, 6);
	assert.equal(result.totals.emittedTotal, 12);
	assert.equal(result.totals.playTriggerCount, 3);
	assert.equal(result.totals.durationExpiryCount, 2);
	assert.equal(result.totals.destroyed, false);
	assert.equal(result.totals.lifeCountRemaining, -1);

	// ---- 全部检查项通过 ----
	for (const check of result.checks) {
		assert.equal(check.pass, true, `检查项 ${check.id} 应通过: ${check.reason}`);
	}
	const immortalCheck = checkById(result, "immortal-flag");
	assert.match(immortalCheck.reason, /#immortal=true/);

	// ---- 纯数据 / 可序列化 ----
	assertPlainJsonData(result);
	const text = JSON.stringify(result);
	assert.equal(typeof text, "string");
	// NaN 绝不能出现；Infinity 数值已转 null（"Infinity" 仅允许出现在中文原因文本中）。
	// 真正的保证是 JSON.parse 无损往返：若数值字段是 Infinity/NaN，往返会变成 null 并丢标志。
	assert.equal(text.includes("NaN"), false, "JSON 文本中不得出现 NaN 字面量");
	const roundTrip = JSON.parse(text);
	assert.equal(roundTrip.totals.emittedTotal, 12);
	assert.equal(roundTrip.initial.spawnDelayInfinite, false);
	assert.equal(roundTrip.initial.spawnDelayMs, 500);
	assert.equal(roundTrip.checks.length, result.checks.length);
});

// ---------------------------------------------------------------------------
test("正常路径：startCount 首帧按 quantity 同规则乘 reduceFactor 发射", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 2,
		options: {
			autoPlay: true,
			size: { width: 10, height: 10, mode: "percent" },
			startCount: 4,
			life: { count: -1, delay: 1, duration: 10 },
			rate: { delay: 1, quantity: 3 },
			spawn: {}
		},
		shapeGeneratorExists: false,
		deltas: [100]
	});
	assert.equal(result.steps[0].startParticlesAdded, true);
	assert.equal(result.steps[0].startCountEmitted, 8, "startCount*reduceFactor = 4*2 = 8");
	assert.equal(result.totals.startCountEmittedTotal, 8);
	// emitDelay = 1*1000/2 = 500，但首帧 firstSpawn 把 currentEmitDelay 预置为 500，
	// 首个 delta(100) 后 600>=500，触发一次常规发射 3*2=6
	assert.equal(result.steps[0].emitTriggered, true);
	assert.equal(result.steps[0].emittedCount, 6);
	assert.equal(result.steps[0].currentEmitDelay, 100, "600-500");
	assert.equal(result.initial.spawnDelayMs, 500);
	assert.equal(result.initial.emitDelayMs, 500);
});

// ---------------------------------------------------------------------------
test("负向路径：life.count 为正且 duration 到期时 lifeCount 递减并最终销毁，与源码分支一致", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 2,
		options: {
			autoPlay: true,
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: 2, delay: 0, duration: 0.5, wait: false },
			rate: { delay: 0.1, quantity: 3 }
		},
		shapeGeneratorExists: true,
		deltas: [600, 600, 100]
	});

	assert.equal(result.initial.immortal, false);
	assert.equal(result.initial.spawnDelayMs, 0, "0*1000/2 = 0");
	assert.equal(result.initial.emitDelayMs, 50, "play 执行后 #emitDelay = 0.1*1000/2 = 50");
	assert.equal(result.initial.durationMs, 500);

	// 第一次到期：lifeCount 2->1，重定位并重新 play，随后发生一次发射 3*2=6
	const s0 = result.steps[0];
	assert.equal(s0.durationExpired, true);
	assert.equal(s0.lifeCountRemaining, 1);
	assert.equal(s0.playTriggered, true);
	assert.equal(s0.emitTriggered, true);
	assert.equal(s0.emittedCount, 6, "quantity*reduceFactor = 3*2 = 6");
	assert.equal(s0.destroyed, false);

	// 第二次到期：lifeCount 1->0 -> #destroy()；pause() 已清空 emitDelay，本步不再发射
	const s1 = result.steps[1];
	assert.equal(s1.durationExpired, true);
	assert.equal(s1.lifeCountRemaining, 0);
	assert.equal(s1.destroyed, true);
	assert.equal(s1.emitTriggered, false, "销毁分支中 pause() 清空了 emitDelay");
	assert.equal(s1.playTriggered, false);

	// 销毁后的 delta：实例已被管理器移除，update 不再生效
	const s2 = result.steps[2];
	assert.equal(s2.processed, true);
	assert.match(s2.skipReason, /已销毁/);
	assert.equal(s2.destroyed, true);
	assert.equal(s2.emittedCount, 0);

	assert.equal(result.totals.durationExpiryCount, 2);
	assert.equal(result.totals.emitEventCount, 1);
	assert.equal(result.totals.emittedTotal, 6);
	assert.equal(result.totals.destroyed, true);
	assert.equal(result.totals.lifeCountRemaining, 0);

	const lifecycle = checkById(result, "mortal-lifecycle");
	assert.equal(lifecycle.pass, true);
	const immortalCheck = checkById(result, "immortal-flag");
	assert.equal(immortalCheck.pass, true);
	assert.match(immortalCheck.reason, /#immortal=false/);

	assertPlainJsonData(result);
	JSON.parse(JSON.stringify(result));
});

// ---------------------------------------------------------------------------
test("边界：reduceFactor=0 时延迟为 Infinity，不抛异常且结果可读", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 0,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1, delay: 0.5, duration: 1 },
			rate: { delay: 0.2, quantity: 2 }
		},
		shapeGeneratorExists: true,
		deltas: [100]
	});

	assert.equal(result.initial.spawnDelayMs, null);
	assert.equal(result.initial.spawnDelayInfinite, true, "reduceFactor=0 -> spawnDelay=Infinity");
	assert.equal(result.initial.emitDelayInfinite, true, "reduceFactor=0 -> emitDelay=Infinity");

	// Infinity 累计相减产生 NaN，审计以 null 表达（不写 NaN），两个标志位均为 false
	const step = result.steps[0];
	assert.equal(step.processed, true);
	assert.equal(step.emitTriggered, true, "Infinity>=Infinity 触发一次 #emit");
	assert.equal(step.emittedCount, 0, "quantity*0=0，for 循环迭代 0 次");
	assert.equal(step.currentSpawnDelay, null);
	assert.equal(step.currentSpawnDelayInfinite, false, "Infinity-Infinity=NaN，非有限也非 Infinity");
	assert.equal(step.currentEmitDelay, null);
	assert.equal(step.currentEmitDelayInfinite, false);

	const rfCheck = checkById(result, "reduce-factor-valid");
	assert.equal(rfCheck.pass, true);
	assert.match(rfCheck.reason, /Infinity/);
	const qtyCheck = checkById(result, "emit-quantity-non-negative-integer");
	assert.equal(qtyCheck.pass, true, "0 仍是合法非负整数发射量");

	assertPlainJsonData(result);
	const text = JSON.stringify(result);
	// 数值字段不得序列化为 NaN；Infinity 仅允许出现在中文原因文本中，
	// 真正的保证是 JSON.parse 能无损往返（Infinity/NaN 作为数值会使往返失真）
	assert.equal(text.includes("NaN"), false);
	const parsed = JSON.parse(text);
	assert.equal(parsed.initial.spawnDelayMs, null);
	assert.equal(parsed.initial.spawnDelayInfinite, true);
	assert.equal(parsed.steps[0].currentSpawnDelay, null);
});

// ---------------------------------------------------------------------------
test("边界：duration=0 时不装配计时器，不产生到期与销毁", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: 3, delay: 1, duration: 0 },
			rate: { delay: 0.1, quantity: 1 }
		},
		deltas: [150, 150]
	});

	assert.equal(result.initial.durationMs, null, "#prepareToDie 的 duration>0 条件不成立");
	assert.equal(result.totals.durationExpiryCount, 0);
	assert.equal(result.totals.destroyed, false);
	assert.equal(result.totals.lifeCountRemaining, 3);
	for (const step of result.steps) assert.equal(step.durationExpired, false);

	const check = checkById(result, "duration-zero-or-missing-no-expiry");
	assert.equal(check.pass, true);
	assert.match(check.reason, /duration=0/);
	assertPlainJsonData(result);
});

// ---------------------------------------------------------------------------
test("边界：delta 含 NaN 时返回可读降级结果且不抛异常", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: 1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1, delay: 1, duration: 1 },
			rate: { delay: 0.2, quantity: 2 }
		},
		deltas: [100, Number.NaN, 100]
	});

	assert.equal(result.degraded, true);
	assert.ok(result.degradedReasons.some((r) => r.includes("deltas[1]")));
	assert.ok(result.affectedFields.includes("deltas"));

	assert.equal(result.steps.length, 3);
	assert.equal(result.steps[0].processed, true);
	assert.equal(result.steps[1].processed, false);
	assert.match(result.steps[1].skipReason, /非有限/);
	assert.equal(result.steps[2].processed, false);
	assert.match(result.steps[2].skipReason, /非有限值/);

	const check = checkById(result, "deltas-finite");
	assert.equal(check.pass, false);
	assert.ok(check.reason.length > 0);

	assertPlainJsonData(result);
	const parsed = JSON.parse(JSON.stringify(result));
	assert.equal(parsed.degraded, true);
});

// ---------------------------------------------------------------------------
test("降级：reduceFactor 为负 / duration 为负 / options.size 缺失均不抛异常并标注字段", () => {
	const negativeRf = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 1,
		reduceFactor: -1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1 },
			rate: { delay: 0.2, quantity: 2 }
		},
		deltas: [100]
	});
	assert.equal(negativeRf.degraded, true);
	assert.ok(negativeRf.affectedFields.includes("retina.reduceFactor"));
	assert.equal(checkById(negativeRf, "reduce-factor-valid").pass, false);
	// 负发射量：源码 for(i<负数) 不迭代
	assert.equal(negativeRf.steps[0].emittedCount, 0);
	assert.equal(checkById(negativeRf, "emit-quantity-non-negative-integer").pass, false);
	assertPlainJsonData(negativeRf);

	const negativeDuration = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: 2, duration: -5 },
			rate: { delay: 0.2, quantity: 1 }
		},
		deltas: [100, 100]
	});
	assert.equal(negativeDuration.degraded, true);
	assert.ok(negativeDuration.affectedFields.includes("life.duration"));
	assert.equal(negativeDuration.totals.durationExpiryCount, 0);
	assert.equal(negativeDuration.totals.destroyed, false);
	assert.equal(checkById(negativeDuration, "duration-non-negative").pass, false);
	assertPlainJsonData(negativeDuration);

	const missingSize = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		options: {
			life: { count: -1 },
			rate: { delay: 0.2, quantity: 1 }
		},
		deltas: [50]
	});
	assert.equal(missingSize.degraded, true);
	assert.ok(missingSize.affectedFields.includes("options.size"));
	assert.deepEqual(missingSize.initial.size.pixelSize, { width: 0, height: 0 });
	assert.equal(checkById(missingSize, "size-options-present").pass, false);
	assertPlainJsonData(missingSize);
});

// ---------------------------------------------------------------------------
test("domId 元素缺失：size 回退 options.size 并标注；shape 无生成器时不声称会绘制", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		pixelRatio: 2,
		reduceFactor: 1,
		options: {
			domId: "missing-box",
			draw: true,
			size: { width: 40, height: 20, mode: "precise" },
			life: { count: -1 },
			rate: { delay: 0.2, quantity: 1 },
			shape: { type: "triangle" }
		},
		domElementPresent: false,
		shapeGeneratorExists: false,
		deltas: [50]
	});

	assert.equal(result.degraded, true, "元素缺失属于可解释降级标注");
	assert.equal(result.initial.size.source, "options.size");
	assert.deepEqual(result.initial.size.pixelSize, { width: 40, height: 20 },
		"precise 模式直接取 width/height，不乘画布尺寸");
	const domCheck = checkById(result, "dom-id-missing-size-fallback");
	assert.equal(domCheck.pass, true);
	assert.match(domCheck.reason, /回退/);

	assert.equal(result.initial.shape.generatorExists, false);
	assert.equal(result.initial.shape.willDraw, false, "无生成器 -> #shape=undefined -> 不得声称绘制");
	assert.equal(checkById(result, "shape-generator-drawability").pass, true);

	assertPlainJsonData(result);
});

// ---------------------------------------------------------------------------
test("resize：初始位置保留 / 重新随机 / setPosition 覆盖三种来源与尺寸重算", () => {
	// 1) 初始位置在新画布内 -> 保留
	const retained = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		initialPosition: { x: 100, y: 100 },
		options: {
			size: { width: 25, height: 50, mode: "percent" },
			life: { count: -1 },
			rate: { delay: 1, quantity: 1 }
		},
		deltas: [100],
		resize: { canvas: { width: 1000, height: 800 } }
	});
	assert.equal(retained.resize.positionSource, "initial-position-retained");
	assert.equal(retained.resize.initialPositionInside, true);
	assert.deepEqual(retained.resize.position, { x: 100, y: 100 });
	assert.deepEqual(retained.resize.size.pixelSize, { width: 250, height: 400 },
		"25%*1000=250, 50%*800=400");

	// 2) 初始位置落在新画布外（isPointInside 为严格 0..size） -> 重新随机
	const recalculated = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		initialPosition: { x: 900, y: 700 },
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1 },
			rate: { delay: 1, quantity: 1 }
		},
		deltas: [100],
		resize: { canvas: { width: 400, height: 300 } }
	});
	assert.equal(recalculated.resize.initialPositionInside, false);
	assert.equal(recalculated.resize.positionSource, "recalculated-random");
	// 确定性随机百分比 50/50：50%*400=200, 50%*300=150
	assert.deepEqual(recalculated.resize.position, { x: 200, y: 150 });

	// 3) 已 setPosition：resize 不触碰位置
	const overridden = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		initialPosition: { x: 900, y: 700 },
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1 },
			rate: { delay: 1, quantity: 1 }
		},
		deltas: [100],
		resize: {
			canvas: { width: 400, height: 300 },
			positionOverrideSet: true,
			position: { x: 12, y: 34 }
		}
	});
	assert.equal(overridden.resize.positionSource, "setPosition");
	assert.deepEqual(overridden.resize.position, { x: 12, y: 34 });

	for (const r of [retained, recalculated, overridden]) assertPlainJsonData(r);
});

// ---------------------------------------------------------------------------
test("wait=true：构造期 play 被守卫拦截，spawnDelay 到期后才 play 并发射", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1, delay: 0.5, duration: 1, wait: true },
			rate: { delay: 0.2, quantity: 2 }
		},
		deltas: [600]
	});

	assert.equal(result.initial.constructorPlayCompleted, false);
	assert.match(result.initial.constructorPlayBlockedReason, /wait=true/);
	assert.equal(result.initial.emitDelayMs, null, "play 未执行 -> emitDelay 未惰性初始化");

	const step = result.steps[0];
	assert.equal(step.playTriggered, true, "600 >= spawnDelay 500");
	assert.equal(step.playCompleted, true);
	assert.equal(step.emitTriggered, true);
	assert.equal(step.emittedCount, 2);
	assert.equal(step.currentSpawnDelay, 100, "600-500");
	assert.equal(step.currentEmitDelay, 400, "600-200");
	assertPlainJsonData(result);
});

// ---------------------------------------------------------------------------
test("autoPlay=false：构造与 update 均不推进时序，结果可读且可序列化", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		options: {
			autoPlay: false,
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1 },
			rate: { delay: 0.2, quantity: 2 }
		},
		deltas: [100, 100]
	});
	assert.equal(result.initial.paused, true);
	assert.equal(result.initial.constructorPlayCompleted, false);
	for (const step of result.steps) {
		assert.equal(step.processed, true);
		assert.match(step.skipReason, /#paused/);
		assert.equal(step.emitTriggered, false);
		assert.equal(step.emittedCount, 0);
	}
	assert.equal(result.totals.emittedTotal, 0);
	assertPlainJsonData(result);
});

// ---------------------------------------------------------------------------
test("快照整体缺失或为 null：返回降级结果而非抛异常", () => {
	const result = auditEmitter(null);
	assert.equal(result.degraded, true);
	assert.equal(Array.isArray(result.checks), true);
	assert.ok(result.checks.length > 0, "常规降级仍应产出检查项列表");
	assert.equal(result.checks.some((c) => c.id === "no-uncaught-exception"), false,
		"未真正抛异常时不应出现兜底异常检查项");
	assert.doesNotThrow(() => JSON.stringify(result));
});

// ---------------------------------------------------------------------------
test("区间型 range 输入被确定性解析（中点），并在 resolved 中披露", () => {
	const result = auditEmitter({
		canvas: baseCanvas,
		reduceFactor: 1,
		options: {
			size: { width: 10, height: 10, mode: "percent" },
			life: { count: -1, delay: { min: 0.4, max: 0.6 }, duration: 1 },
			rate: { delay: { min: 0.1, max: 0.3 }, quantity: { min: 1, max: 3 } }
		},
		deltas: []
	});
	assert.equal(result.resolved.lifeDelaySeconds, 0.5, "(0.4+0.6)/2");
	assert.equal(result.resolved.rateDelaySeconds, 0.2, "(0.1+0.3)/2");
	assert.equal(result.resolved.rateQuantity, 2, "(1+3)/2");
	assert.equal(result.initial.spawnDelayMs, 500);
	assertPlainJsonData(result);
});
