/**
 * EmitterAudit
 * -----------
 * 纯数据、零副作用的“发射器运行时审计”模块。
 *
 * 该模块不导入 EmitterInstance / Vector，也不访问 DOM、不创建 canvas、
 * 不读写磁盘。输入是一份纯数据快照，输出是可 JSON 序列化的纯数据对象，
 * 其数值与时序与 assets/EmitterInstance-BvYBj4SX.js 中 EmitterInstance
 * 在同一输入下的实际行为逐项对齐（相同的算术表达式、相同的分支顺序）。
 *
 * 与源码的对应关系：
 * - 构造函数：#spawnDelay / size 换算 / #lifeCount / #immortal / 首次 play()
 * - play()：守卫条件、#emitDelay 的惰性初始化、#prepareToDie()
 * - update(delta)：firstSpawn、startCount、duration 到期、spawnDelay 到期、
 *   emitDelay 到期与 #emit() 的 quantity * reduceFactor 发射量
 * - resize()：#positionOverride + isPointInside 的位置来源判定与尺寸重算
 *
 * 对于源码中带随机性的输入（{ min, max } 区间、缺省随机坐标），审计采用
 * 确定性解析（区间取中点，缺省随机百分比取 50），并在 resolved 中给出
 * 解析结果；要与源码逐值相等时，请在快照中直接使用数值型字段。
 */

const MILLISECONDS_TO_SECONDS = 1e3;
const DEFAULT_LIFE_DELAY = 0;
const DEFAULT_SPAWN_DELAY = 0;
const DEFAULT_EMIT_DELAY = 0;
const DEFAULT_LIFE_COUNT = -1;
const MIN_LIFE_COUNT = 0;
const DEFAULT_STROKE_WIDTH = 1;
const PIXEL_MODE_PERCENT = "percent";
const PIXEL_MODE_PRECISE = "precise";

/**
 * 复刻 Utils.getRangeValue：数值直接返回；区间 {min,max} 确定性取中点。
 * @param {number|{min:number,max:number}|undefined} value
 * @returns {number|undefined}
 */
function getRangeValueDeterministic(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "number") return value;
	if (typeof value === "object") {
		const min = typeof value.min === "number" ? value.min : 0;
		const max = typeof value.max === "number" ? value.max : min;
		return (min + max) / 2;
	}
	return Number(value);
}

function isFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}

/** JSON 不支持 NaN：统一转 null，并由调用方附带标志位。 */
function finiteOrNull(value) {
	return Number.isFinite(value) ? value : null;
}

function isInfinite(value) {
	return value === Infinity || value === -Infinity;
}

/**
 * 复刻构造函数 / play() 中的延迟换算：
 * container.retina.reduceFactor ? delay * 1000 / reduceFactor : Infinity
 * 注意源码用的是真值判断：0 与 NaN 都落入 Infinity 分支。
 */
function calcDelayMs(delaySeconds, reduceFactor) {
	return reduceFactor ? delaySeconds * MILLISECONDS_TO_SECONDS / reduceFactor : Infinity;
}

/**
 * 复刻 isPointInside(point, size, Vector.origin)（radius=0, direction 缺省）。
 * 源码 areBoundsInside 的四个条件（注意 offset.x/offset.y 的交叉使用，
 * origin 下均为 0）：
 *   y < height + 0; x > 0; x < width + 0; y > 0
 */
function isPointInsideOrigin(point, size) {
	if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) return false;
	return point.y < size.height && point.x > 0 && point.x < size.width && point.y > 0;
}

/**
 * 确定性版本的 #calcPosition()（domId 元素缺失分支）：
 * calcPositionOrRandomFromSizeRanged -> calcPositionOrRandomFromSize
 *   x = (position.x ?? random*100) * size.width / 100
 *   y = (position.y ?? random*100) * size.height / 100
 */
function calcPositionFromSize(canvasSize, optionsPosition, randomPercent) {
	const rp = randomPercent ?? { x: 50, y: 50 };
	const px = optionsPosition && optionsPosition.x !== undefined
		? getRangeValueDeterministic(optionsPosition.x)
		: rp.x;
	const py = optionsPosition && optionsPosition.y !== undefined
		? getRangeValueDeterministic(optionsPosition.y)
		: rp.y;
	return {
		x: px * canvasSize.width / 100,
		y: py * canvasSize.height / 100
	};
}

/** 复刻 #calcSize + 构造函数中的 this.size 像素换算。 */
function resolveSize(options, canvasSize, pixelRatio, domElementPresent, domRect) {
	const notes = [];
	let sizeSpec;
	let source = "options.size";
	if (options.domId) {
		if (domElementPresent && domRect) {
			source = "domId.element.getBoundingClientRect";
			sizeSpec = {
				width: domRect.width * pixelRatio,
				height: domRect.height * pixelRatio,
				mode: PIXEL_MODE_PRECISE
			};
		} else {
			notes.push(`domId="${options.domId}" 存在但 DOM 元素缺失，#calcSize 回退到 options.size`);
			if (options.size) {
				sizeSpec = options.size;
			} else {
				source = "default EmitterSize {width:0,height:0,mode:percent}";
				sizeSpec = { width: 0, height: 0, mode: PIXEL_MODE_PERCENT };
				notes.push("options.size 同时缺失，使用源码默认零尺寸 EmitterSize");
			}
		}
	} else if (options.size) {
		sizeSpec = options.size;
	} else {
		source = "default EmitterSize {width:0,height:0,mode:percent}";
		sizeSpec = { width: 0, height: 0, mode: PIXEL_MODE_PERCENT };
		notes.push("options.size 缺失，使用源码默认零尺寸 EmitterSize");
	}

	const mode = sizeSpec.mode === PIXEL_MODE_PERCENT ? PIXEL_MODE_PERCENT : PIXEL_MODE_PRECISE;
	const pixelSize = mode === PIXEL_MODE_PERCENT
		? {
			width: sizeSpec.width / 100 * canvasSize.width,
			height: sizeSpec.height / 100 * canvasSize.height
		}
		: { width: sizeSpec.width, height: sizeSpec.height };

	return { spec: sizeSpec, mode, pixelSize, source, notes };
}

function makeCheck(id, name, pass, reason, affectedFields) {
	return {
		id,
		name,
		pass: !!pass,
		reason: reason ?? "",
		affectedFields: affectedFields ? [...affectedFields] : []
	};
}

/**
 * 对一份纯数据快照执行发射器运行时审计。
 *
 * @param {object} snapshot
 * @param {{width:number,height:number}} snapshot.canvas 画布像素尺寸
 * @param {number} snapshot.pixelRatio container.retina.pixelRatio
 * @param {number} snapshot.reduceFactor container.retina.reduceFactor
 * @param {object} snapshot.options Emitter 纯数据选项
 * @param {{x:number,y:number}|undefined} snapshot.initialPosition 构造 position 参数
 * @param {number[]} snapshot.deltas 按时间递增的 delta.value（毫秒）
 * @param {object} [snapshot.resize] 可选 resize 事件
 * @param {boolean} [snapshot.domElementPresent] domId 对应元素是否存在
 * @param {object} [snapshot.domRect] 存在元素的 getBoundingClientRect 结果
 * @param {{x:number,y:number}} [snapshot.randomPercent] 确定性随机百分比（默认 50/50）
 * @returns {object} 可 JSON 序列化的审计结果
 */
export function auditEmitter(snapshot) {
	const degradedReasons = [];
	const affectedFields = [];
	const note = (message, fields) => {
		degradedReasons.push(message);
		if (fields) for (const field of fields) if (!affectedFields.includes(field)) affectedFields.push(field);
	};

	try {
		return runAudit(snapshot, note, degradedReasons, affectedFields);
	} catch (error) {
		// 兜底：审计自身永不抛出未捕获异常。
		const message = error && error.message ? String(error.message) : String(error);
		return {
			degraded: true,
			degradedReasons: [`审计过程中发生未预期异常，已降级返回: ${message}`, ...degradedReasons],
			affectedFields: [...new Set(["audit", ...affectedFields])],
			resolved: null,
			initial: null,
			steps: [],
			resize: null,
			totals: null,
			checks: [
				makeCheck("no-uncaught-exception", "审计不抛出未捕获异常", false,
					`审计内部异常: ${message}`, ["audit"])
			]
		};
	}
}

function runAudit(snapshotInput, note, degradedReasons, affectedFields) {
	const snapshot = snapshotInput && typeof snapshotInput === "object" ? snapshotInput : {};
	const options = snapshot.options && typeof snapshot.options === "object" ? snapshot.options : {};
	const life = options.life ?? {};
	const rate = options.rate ?? {};
	const spawn = options.spawn ?? {};
	const shapeOptions = options.shape ?? {};

	const canvas = isFiniteNumber(snapshot.canvas?.width) && isFiniteNumber(snapshot.canvas?.height)
		? { width: snapshot.canvas.width, height: snapshot.canvas.height }
		: { width: 0, height: 0 };
	if (!(isFiniteNumber(snapshot.canvas?.width) && isFiniteNumber(snapshot.canvas?.height))) {
		note("快照缺少有效的 canvas.size，按 {width:0,height:0} 降级处理", ["canvas"]);
	}

	const pixelRatio = isFiniteNumber(snapshot.pixelRatio) ? snapshot.pixelRatio : 1;
	const reduceFactor = typeof snapshot.reduceFactor === "number" ? snapshot.reduceFactor : 1;
	const autoPlay = options.autoPlay !== false;
	const wait = life.wait === true;
	const initialPosition = snapshot.initialPosition && isFiniteNumber(snapshot.initialPosition.x) && isFiniteNumber(snapshot.initialPosition.y)
		? { x: snapshot.initialPosition.x, y: snapshot.initialPosition.y }
		: undefined;
	const domElementPresent = snapshot.domElementPresent === true;
	const shapeGeneratorExists = snapshot.shapeGeneratorExists === true;
	const randomPercent = snapshot.randomPercent;

	// ---- 输入合法性（降级路径） ---------------------------------------------
	if (!isFiniteNumber(reduceFactor) || reduceFactor < 0) {
		note(`reduceFactor=${reduceFactor} 非法（要求非负有限数），延迟与发射量计算结果不可信`,
			["retina.reduceFactor", "spawnDelayMs", "emitDelayMs", "emittedCount"]);
	}
	const rawDeltas = Array.isArray(snapshot.deltas) ? snapshot.deltas : [];
	const firstNonFiniteDeltaIndex = rawDeltas.findIndex((d) => !isFiniteNumber(d));
	if (firstNonFiniteDeltaIndex >= 0) {
		note(`deltas[${firstNonFiniteDeltaIndex}]=${rawDeltas[firstNonFiniteDeltaIndex]} 不是有限毫秒数，该步及其后步骤不参与时序模拟`,
			["deltas"]);
	}
	let deltaOrderBroken = -1;
	for (let i = 1; i < rawDeltas.length; i++) {
		if (isFiniteNumber(rawDeltas[i]) && isFiniteNumber(rawDeltas[i - 1]) && rawDeltas[i] <= rawDeltas[i - 1]) {
			deltaOrderBroken = i;
			break;
		}
	}
	const durationOption = life.duration !== undefined ? getRangeValueDeterministic(life.duration) : undefined;
	if (durationOption !== undefined && !isFiniteNumber(durationOption)) {
		note(`life.duration 解析值 ${durationOption} 非有限数，duration 计时器不会被装配`, ["life.duration"]);
	}
	if (isFiniteNumber(durationOption) && durationOption < 0) {
		note(`life.duration=${durationOption} 为负值，#prepareToDie 不会装配 #duration，不会产生到期销毁`,
			["life.duration", "duration"]);
	}
	if (!options.size) {
		note("options.size 缺失，尺寸回退到源码默认 EmitterSize {width:0,height:0,mode:percent}",
			["options.size", "size"]);
	}

	// ---- 确定性解析后的标量值 ------------------------------------------------
	const lifeDelayValue = getRangeValueDeterministic(life.delay ?? DEFAULT_LIFE_DELAY) ?? DEFAULT_LIFE_DELAY;
	const rateDelayValue = rate.delay !== undefined ? getRangeValueDeterministic(rate.delay) : 0.1;
	const rateQuantity = rate.quantity !== undefined ? getRangeValueDeterministic(rate.quantity) : 1;
	const startCount = options.startCount !== undefined ? getRangeValueDeterministic(options.startCount) : 0;
	const lifeCount = life.count !== undefined ? getRangeValueDeterministic(life.count) : DEFAULT_LIFE_COUNT;
	const immortal = lifeCount <= MIN_LIFE_COUNT;

	const fillOpacity = spawn.fill?.opacity === undefined ? 1 : getRangeValueDeterministic(spawn.fill.opacity);
	const strokeOpacity = spawn.stroke?.opacity === undefined ? 1 : getRangeValueDeterministic(spawn.stroke.opacity);
	const strokeWidth = spawn.stroke?.width === undefined ? DEFAULT_STROKE_WIDTH : getRangeValueDeterministic(spawn.stroke.width);

	// ---- 构造函数阶段 --------------------------------------------------------
	const spawnDelayInitial = calcDelayMs(lifeDelayValue, reduceFactor);
	const sizeResolution = resolveSize(options, canvas, pixelRatio, domElementPresent, snapshot.domRect);
	for (const msg of sizeResolution.notes) note(msg, ["options.size", "size"]);

	const initialCalcPosition = calcPositionFromSize(canvas, options.position, randomPercent);
	const position = initialPosition ? { ...initialPosition } : { ...initialCalcPosition };
	const positionOrigin = initialPosition ? "initial-position" : "calc-position";

	let paused = !autoPlay;
	const firstSpawn = !wait;

	// 构造函数末尾的 this.play()
	let constructorPlayCompleted = false;
	let constructorPlayBlockedReason = "";
	let emitDelay = undefined;
	let duration = undefined;
	{
		const guard = (lifeCount > MIN_LIFE_COUNT || immortal || life.count === undefined)
			&& (firstSpawn || 0 >= (spawnDelayInitial ?? DEFAULT_SPAWN_DELAY));
		if (paused) {
			constructorPlayBlockedReason = "autoPlay=false，#paused=true，play() 直接返回";
		} else if (!guard) {
			constructorPlayBlockedReason = "life.wait=true 且 currentSpawnDelay 尚未达到 spawnDelay，play() 守卫不通过";
		} else {
			constructorPlayCompleted = true;
			emitDelay = calcDelayMs(rateDelayValue, reduceFactor);
			// #prepareToDie()
			const d = life.duration !== undefined ? durationOption : undefined;
			if ((lifeCount > 0 || immortal) && d !== undefined && isFiniteNumber(d) && d > 0) {
				duration = d * MILLISECONDS_TO_SECONDS;
			}
		}
	}
	// 构造阶段快照值：模拟过程中 emitDelay/duration 会被 pause()/到期逻辑改写，
	// 但 initial.* 必须反映构造函数结束时的状态，故先固化。
	const constructorEmitDelay = emitDelay;
	const constructorDuration = duration;

	// 形状：源码仅在 getShapeGenerator 返回真值时生成 #shape
	const willDrawShape = options.draw === true && shapeGeneratorExists;

	// ---- 时序模拟（严格按 update() 分支顺序） --------------------------------
	let currentDuration = 0;
	let currentEmitDelay = 0;
	let currentSpawnDelay = 0;
	let spawnDelay = spawnDelayInitial;
	let startParticlesAdded = false;
	let positionOverride = false;
	let currentPosition = { ...position };
	let destroyed = false;
	let workingLifeCount = lifeCount;
	// 源码 #firstSpawn 在首次 update() 后置 false；此处用可变标志保持同一语义。
	let firstSpawnLive = firstSpawn;

	const steps = [];
	let emitEventCount = 0;
	let emittedTotal = 0;
	let startCountEmittedTotal = 0;
	let durationExpiryCount = 0;

	const resizeEvent = snapshot.resize && typeof snapshot.resize === "object" ? snapshot.resize : null;
	const resizeAfterStep = resizeEvent && isFiniteNumber(resizeEvent.afterStep)
		? resizeEvent.afterStep
		: rawDeltas.length;
	let resizeResult = null;
	let workingCanvas = { ...canvas };

	for (let i = 0; i < rawDeltas.length; i++) {
		// resize 在指定步进之前应用（默认所有 delta 之后）
		if (resizeEvent && i === resizeAfterStep) {
			resizeResult = applyResize({
				resizeEvent, workingCanvas, options, pixelRatio, domElementPresent,
				snapshot, initialPosition, positionOverride, currentPosition,
				setPositionOverride(value) { positionOverride = value; },
				setPosition(value) { currentPosition = value; },
				setCanvas(value) { workingCanvas = value; },
				randomPercent
			});
		}

		const deltaValue = rawDeltas[i];
		const step = {
			index: i,
			deltaMs: finiteOrNull(deltaValue),
			processed: false,
			skipReason: "",
			currentSpawnDelay: null,
			currentSpawnDelayInfinite: false,
			currentEmitDelay: null,
			currentEmitDelayInfinite: false,
			currentDuration: null,
			spawnDelayArmed: spawnDelay !== undefined,
			emitDelayArmed: emitDelay !== undefined,
			durationArmed: duration !== undefined,
			playTriggered: false,
			playCompleted: false,
			playBlockedReason: "",
			emitTriggered: false,
			emittedCount: 0,
			rawQuantityProduct: finiteOrNull(rateQuantity * reduceFactor),
			startParticlesAdded: startParticlesAdded,
			startCountEmitted: 0,
			durationExpired: false,
			repositioned: false,
			positionSource: "",
			lifeCountRemaining: finiteOrNull(workingLifeCount),
			immortal,
			paused,
			destroyed,
			positionAfter: { ...currentPosition }
		};

		if (!isFiniteNumber(deltaValue)) {
			step.skipReason = `delta 非有限值 (${String(deltaValue)})，update() 结果不可审计，跳过该步及其后步骤`;
			step.currentSpawnDelay = finiteOrNull(currentSpawnDelay);
			step.currentSpawnDelayInfinite = isInfinite(currentSpawnDelay);
			step.currentEmitDelay = finiteOrNull(currentEmitDelay);
			step.currentEmitDelayInfinite = isInfinite(currentEmitDelay);
			step.currentDuration = finiteOrNull(currentDuration);
			steps.push(step);
			// 与源码不同：审计拒绝把 NaN 继续传播，后续步骤同样跳过
			for (let j = i + 1; j < rawDeltas.length; j++) {
				steps.push({
					index: j,
					deltaMs: finiteOrNull(rawDeltas[j]),
					processed: false,
					skipReason: `前序 deltas[${i}] 非有限值，审计已中止时序模拟`,
					currentSpawnDelay: finiteOrNull(currentSpawnDelay),
					currentSpawnDelayInfinite: isInfinite(currentSpawnDelay),
					currentEmitDelay: finiteOrNull(currentEmitDelay),
					currentEmitDelayInfinite: isInfinite(currentEmitDelay),
					currentDuration: finiteOrNull(currentDuration),
					spawnDelayArmed: spawnDelay !== undefined,
					emitDelayArmed: emitDelay !== undefined,
					durationArmed: duration !== undefined,
					playTriggered: false,
					playCompleted: false,
					playBlockedReason: "",
					emitTriggered: false,
					emittedCount: 0,
					rawQuantityProduct: finiteOrNull(rateQuantity * reduceFactor),
					startParticlesAdded,
					startCountEmitted: 0,
					durationExpired: false,
					repositioned: false,
					positionSource: "",
					lifeCountRemaining: finiteOrNull(workingLifeCount),
					immortal,
					paused,
					destroyed,
					positionAfter: { ...currentPosition }
				});
			}
			break;
		}

		if (destroyed) {
			step.skipReason = "发射器已销毁，update() 不再被管理器调用";
			step.processed = true;
			step.currentSpawnDelay = finiteOrNull(currentSpawnDelay);
			step.currentSpawnDelayInfinite = isInfinite(currentSpawnDelay);
			step.currentEmitDelay = finiteOrNull(currentEmitDelay);
			step.currentEmitDelayInfinite = isInfinite(currentEmitDelay);
			step.currentDuration = finiteOrNull(currentDuration);
			step.positionAfter = { ...currentPosition };
			steps.push(step);
			continue;
		}

		if (paused) {
			step.skipReason = "#paused=true，update() 首行直接返回";
			step.processed = true;
			step.currentSpawnDelay = finiteOrNull(currentSpawnDelay);
			step.currentSpawnDelayInfinite = isInfinite(currentSpawnDelay);
			step.currentEmitDelay = finiteOrNull(currentEmitDelay);
			step.currentEmitDelayInfinite = isInfinite(currentEmitDelay);
			step.currentDuration = finiteOrNull(currentDuration);
			step.positionAfter = { ...currentPosition };
			steps.push(step);
			continue;
		}

		step.processed = true;

		// update() 第 1 段：firstSpawn
		// 源码在首帧把 #firstSpawn 置 false，并用预置值初始化两个累计器；
		// 该字段在本次 update 后续的 play() 调用中读到的已是 false。
		if (firstSpawnLive) {
			firstSpawnLive = false;
			currentSpawnDelay = spawnDelay ?? DEFAULT_SPAWN_DELAY;
			currentEmitDelay = emitDelay ?? DEFAULT_EMIT_DELAY;
		}

		// update() 第 2 段：startCount（仅一次）
		if (!startParticlesAdded) {
			startParticlesAdded = true;
			const startProduct = startCount * reduceFactor;
			const startEmitted = Number.isInteger(startProduct) && startProduct > 0 ? startProduct : 0;
			step.startParticlesAdded = true;
			step.startCountEmitted = startEmitted;
			startCountEmittedTotal += startEmitted;
		}

		// update() 第 3 段：duration 到期
		if (duration !== undefined) {
			currentDuration += deltaValue;
			if (currentDuration >= duration) {
				step.durationExpired = true;
				durationExpiryCount++;
				// this.pause()：仅清空 #emitDelay，不修改 #paused
				emitDelay = undefined;
				if (spawnDelay !== undefined) spawnDelay = undefined;
				if (!immortal) workingLifeCount--;
				if (workingLifeCount > MIN_LIFE_COUNT || immortal) {
					if (!positionOverride) {
						currentPosition = calcPositionFromSize(workingCanvas, options.position, randomPercent);
						step.repositioned = true;
						step.positionSource = "random";
					} else {
						step.positionSource = "setPosition-preserved";
					}
					spawnDelay = calcDelayMs(lifeDelayValue, reduceFactor);
				} else {
					destroyed = true;
					step.positionSource = positionOverride ? "setPosition-preserved" : "none-destroyed";
				}
				currentDuration -= duration;
				duration = undefined;
			}
		}

		// update() 第 4 段：spawnDelay 到期 -> dispatchEvent + play()
		if (spawnDelay !== undefined) {
			currentSpawnDelay += deltaValue;
			if (currentSpawnDelay >= spawnDelay) {
				step.playTriggered = true;
				// 源码 play() 读取的是此刻的 #firstSpawn 字段（首帧后恒 false）
				const playResult = invokePlay({
					paused, workingLifeCount, immortal, lifeCountDefined: life.count !== undefined,
					firstSpawn: false, currentSpawnDelay, spawnDelay,
					rateDelayValue, reduceFactor, durationOption, life,
					emitDelayDefined: emitDelay !== undefined,
					setEmitDelay(value) { emitDelay = value; },
					setDuration(value) { duration = value; }
				});
				step.playCompleted = playResult.completed;
				step.playBlockedReason = playResult.blockedReason;
				currentSpawnDelay -= spawnDelay;
				spawnDelay = undefined;
			}
		}

		// update() 第 5 段：emitDelay 到期 -> #emit()
		if (emitDelay !== undefined) {
			currentEmitDelay += deltaValue;
			if (currentEmitDelay >= emitDelay) {
				step.emitTriggered = true;
				// #emit() 首行还有 #paused 守卫；pause() 不会置 #paused，此处保持源码语义
				if (!paused) {
					const product = rateQuantity * reduceFactor;
					const emitted = Number.isInteger(product) && product > 0 ? product : 0;
					step.emittedCount = emitted;
					emitEventCount++;
					emittedTotal += emitted;
				}
				currentEmitDelay -= emitDelay;
			}
		}

		step.currentSpawnDelay = finiteOrNull(currentSpawnDelay);
		step.currentSpawnDelayInfinite = isInfinite(currentSpawnDelay);
		step.currentEmitDelay = finiteOrNull(currentEmitDelay);
		step.currentEmitDelayInfinite = isInfinite(currentEmitDelay);
		step.currentDuration = finiteOrNull(currentDuration);
		step.spawnDelayArmed = spawnDelay !== undefined;
		step.emitDelayArmed = emitDelay !== undefined;
		step.durationArmed = duration !== undefined;
		step.lifeCountRemaining = finiteOrNull(workingLifeCount);
		step.paused = paused;
		step.destroyed = destroyed;
		step.positionAfter = { ...currentPosition };
		steps.push(step);

		if (destroyed) {
			// 销毁后管理器将移除该实例；后续 delta 仅记录“不再更新”
		}
	}

	// resize 在所有 delta 之后应用
	if (resizeEvent && resizeAfterStep >= rawDeltas.length && !resizeResult) {
		resizeResult = applyResize({
			resizeEvent, workingCanvas, options, pixelRatio, domElementPresent,
			snapshot, initialPosition, positionOverride, currentPosition,
			setPositionOverride(value) { positionOverride = value; },
			setPosition(value) { currentPosition = value; },
			setCanvas(value) { workingCanvas = value; },
			randomPercent
		});
	}

	// ---- 检查项 --------------------------------------------------------------
	const checks = [];

	checks.push(makeCheck(
		"immortal-flag",
		"life.count<=0 时标注为不朽且不因 duration 到期销毁",
		immortal ? lifeCount <= MIN_LIFE_COUNT : lifeCount > MIN_LIFE_COUNT,
		immortal
			? `lifeCount=${lifeCount} <= 0，#immortal=true；duration 到期仅重置生命周期，不会调用 #destroy()`
			: `lifeCount=${lifeCount} > 0，#immortal=false，每次 duration 到期 lifeCount 递减`,
		["life.count"]
	));

	const allProducts = [];
	if (startCount !== 0) allProducts.push({ where: "startCount", value: startCount * reduceFactor });
	for (const step of steps) if (step.emitTriggered) allProducts.push({ where: `delta[${step.index}]`, value: rateQuantity * reduceFactor });
	const quantityValid = allProducts.every((p) => Number.isInteger(p.value) && p.value >= 0);
	checks.push(makeCheck(
		"emit-quantity-non-negative-integer",
		"rate.quantity * reduceFactor 必须为非负整数发射量",
		quantityValid,
		quantityValid
			? `rate.quantity=${rateQuantity}, reduceFactor=${reduceFactor}，循环上界 quantity*reduceFactor=${rateQuantity * reduceFactor}`
			: `存在非非负整数的发射量: ${allProducts.filter((p) => !(Number.isInteger(p.value) && p.value >= 0)).map((p) => `${p.where}=${p.value}`).join("; ")}；源码 for 循环实际迭代 0 次`,
		["rate.quantity", "retina.reduceFactor", "emittedCount"]
	));

	const noDurationGiven = life.duration === undefined || life.duration === null;
	const durationZero = durationOption === 0;
	checks.push(makeCheck(
		"duration-zero-or-missing-no-expiry",
		"duration 未给出或为 0 时不得产生到期销毁",
		(noDurationGiven || durationZero) ? durationExpiryCount === 0 : true,
		noDurationGiven
			? "life.duration 未配置，#prepareToDie 不装配 #duration，不存在到期逻辑"
			: durationZero
				? "life.duration=0，#prepareToDie 的 duration>0 条件不成立，不装配 #duration"
				: `life.duration=${durationOption}，审计期内到期 ${durationExpiryCount} 次`,
		["life.duration"]
	));

	if (options.domId) {
		const fallbackOk = !domElementPresent && sizeResolution.source !== "domId.element.getBoundingClientRect";
		checks.push(makeCheck(
			"dom-id-missing-size-fallback",
			"domId 存在但元素缺失时 size 回退到 options.size 并标注",
			fallbackOk,
			domElementPresent
				? `domId="${options.domId}" 元素存在，尺寸取自 getBoundingClientRect * pixelRatio`
				: `domId="${options.domId}" 元素缺失，#calcSize 回退到 ${sizeResolution.source}（${sizeResolution.notes.join("；") || "options.size"}）`,
			["domId", "options.size", "size"]
		));
	}

	checks.push(makeCheck(
		"shape-generator-drawability",
		"shape.type 无生成器时不得声称会绘制形状",
		willDrawShape === (options.draw === true && shapeGeneratorExists),
		shapeGeneratorExists
			? `shape.type="${shapeOptions.type ?? "square"}" 存在生成器，#shape 已生成；options.draw=${options.draw === true}，willDraw=${willDrawShape}`
			: `shape.type="${shapeOptions.type ?? "square"}" 无对应生成器，源码 #shape 保持 undefined，draw() 首行即返回；willDraw=false`,
		["shape.type", "draw"]
	));

	checks.push(makeCheck(
		"size-options-present",
		"options.size 缺失时降级标注受影响字段",
		!!options.size,
		options.size
			? `尺寸来源: ${sizeResolution.source}，模式=${sizeResolution.mode}，像素尺寸=${JSON.stringify(sizeResolution.pixelSize)}`
			: "options.size 缺失，已按源码默认零尺寸 EmitterSize 降级处理",
		["options.size", "size"]
	));

	checks.push(makeCheck(
		"reduce-factor-valid",
		"reduceFactor 必须为非负有限数（0 时延迟为 Infinity）",
		isFiniteNumber(reduceFactor) && reduceFactor >= 0,
		reduceFactor === 0
			? "reduceFactor=0：源码真值判断落入 Infinity 分支，spawnDelay/emitDelay=Infinity，发射器不会再次发射"
			: `reduceFactor=${reduceFactor}${isFiniteNumber(reduceFactor) && reduceFactor > 0 ? "" : "（非法：负值或非有限数）"}`,
		["retina.reduceFactor", "spawnDelayMs", "emitDelayMs"]
	));

	checks.push(makeCheck(
		"deltas-finite",
		"delta 序列必须全部为有限毫秒数",
		firstNonFiniteDeltaIndex < 0,
		firstNonFiniteDeltaIndex < 0
			? `共 ${rawDeltas.length} 个 delta，全部有限`
			: `deltas[${firstNonFiniteDeltaIndex}]=${rawDeltas[firstNonFiniteDeltaIndex]} 非有限，已在该步中止模拟并降级`,
		["deltas"]
	));

	checks.push(makeCheck(
		"duration-non-negative",
		"duration 不得为负值",
		!(isFiniteNumber(durationOption) && durationOption < 0),
		isFiniteNumber(durationOption) && durationOption < 0
			? `life.duration=${durationOption} 为负，#prepareToDie 不装配 #duration，已降级标注`
			: `life.duration 解析值=${durationOption ?? "undefined"}`,
		["life.duration"]
	));

	checks.push(makeCheck(
		"delta-order",
		"delta 序列按时间严格递增",
		deltaOrderBroken < 0,
		deltaOrderBroken < 0
			? "delta 严格递增"
			: `deltas[${deltaOrderBroken}]=${rawDeltas[deltaOrderBroken]} 未大于前值 ${rawDeltas[deltaOrderBroken - 1]}`,
		["deltas"]
	));

	const spawnConfigOk = (spawn.fill === undefined || spawn.fill.opacity === undefined || isFiniteNumber(getRangeValueDeterministic(spawn.fill.opacity)))
		&& (spawn.stroke === undefined || (
			(spawn.stroke.opacity === undefined || isFiniteNumber(getRangeValueDeterministic(spawn.stroke.opacity)))
			&& (spawn.stroke.width === undefined || isFiniteNumber(getRangeValueDeterministic(spawn.stroke.width)))
		));
	checks.push(makeCheck(
		"spawn-fill-stroke-config",
		"spawn.fill / spawn.stroke 的 color/enable/opacity 配置可解析",
		spawnConfigOk,
		`fill: color=${spawn.fill?.color ? "present" : "absent"}, enable=${spawn.fill?.enable ?? (spawn.fill?.color ? true : true)}, opacity=${fillOpacity}; `
			+ `stroke: color=${spawn.stroke?.color ? "present" : "absent"}, opacity=${strokeOpacity}, width=${strokeWidth}`,
		["spawn.fill", "spawn.stroke"]
	));

	const mortalConsistent = immortal || (() => {
		const expirySteps = steps.filter((s) => s.durationExpired).length;
		if (destroyed) return expirySteps === lifeCount;
		return workingLifeCount === lifeCount - expirySteps;
	})();
	checks.push(makeCheck(
		"mortal-lifecycle",
		"有限生命发射器的 lifeCount 递减与销毁时机与源码分支一致",
		mortalConsistent,
		immortal
			? "不朽发射器不适用"
			: `初始 lifeCount=${lifeCount}，到期 ${durationExpiryCount} 次，剩余 ${finiteOrNull(workingLifeCount)}，destroyed=${destroyed}`,
		["life.count", "life.duration"]
	));

	const result = {
		degraded: degradedReasons.length > 0,
		degradedReasons,
		affectedFields,
		resolved: {
			lifeDelaySeconds: lifeDelayValue,
			lifeDurationSeconds: durationOption ?? null,
			rateDelaySeconds: rateDelayValue,
			rateQuantity,
			startCount,
			lifeCount: finiteOrNull(lifeCount),
			fillOpacity,
			strokeOpacity,
			strokeWidth,
			randomPercent: randomPercent ?? { x: 50, y: 50 }
		},
		initial: {
			canvas: { ...canvas },
			pixelRatio,
			reduceFactor,
			autoPlay,
			wait,
			size: {
				mode: sizeResolution.mode,
				spec: { ...sizeResolution.spec },
				pixelSize: { ...sizeResolution.pixelSize },
				source: sizeResolution.source
			},
			immortal,
			lifeCount: finiteOrNull(lifeCount),
			spawnDelayMs: finiteOrNull(spawnDelayInitial),
			spawnDelayInfinite: isInfinite(spawnDelayInitial),
			// 与源码一致：#emitDelay 仅在 play() 首次执行时惰性初始化
			emitDelayMs: constructorPlayCompleted ? finiteOrNull(constructorEmitDelay) : null,
			emitDelayInfinite: constructorPlayCompleted ? isInfinite(constructorEmitDelay) : false,
			// play() 若被守卫拦截，报告其按公式本应得到的值，便于审计对照
			emitDelayMsIfPlayed: finiteOrNull(calcDelayMs(rateDelayValue, reduceFactor)),
			emitDelayIfPlayedInfinite: isInfinite(calcDelayMs(rateDelayValue, reduceFactor)),
			durationMs: constructorDuration ?? null,
			position: { ...currentPosition },
			positionOrigin,
			firstSpawn,
			paused,
			constructorPlayCompleted,
			constructorPlayBlockedReason,
			shape: {
				type: shapeOptions.type ?? "square",
				generatorExists: shapeGeneratorExists,
				willDraw: willDrawShape
			},
			startParticlesAdded: false
		},
		steps,
		resize: resizeResult,
		totals: {
			deltaCount: rawDeltas.length,
			processedCount: steps.filter((s) => s.processed).length,
			playTriggerCount: steps.filter((s) => s.playTriggered).length,
			emitEventCount,
			emittedTotal,
			startCountEmittedTotal,
			durationExpiryCount,
			lifeCountRemaining: finiteOrNull(workingLifeCount),
			destroyed
		},
		checks
	};

	// 自证可序列化（不使用任何函数/类实例，仅 JSON 数据）
	try {
		const roundTrip = JSON.parse(JSON.stringify(result));
		const jsonOk = roundTrip && Array.isArray(roundTrip.steps) && Array.isArray(roundTrip.checks);
		checks.push(makeCheck(
			"json-serializable",
			"审计结果可经 JSON.stringify 序列化且不含函数/类引用",
			!!jsonOk,
			jsonOk ? "JSON.stringify + JSON.parse 往返成功" : "序列化往返结构异常",
			[]
		));
	} catch (error) {
		checks.push(makeCheck(
			"json-serializable",
			"审计结果可经 JSON.stringify 序列化且不含函数/类引用",
			false,
			`序列化失败: ${error && error.message ? error.message : String(error)}`,
			[]
		));
	}

	return result;
}

/** 复刻 play() 在 spawnDelay 到期时的行为（构造函数 play 的守卫同理）。 */
function invokePlay(params) {
	const {
		paused, workingLifeCount, immortal, lifeCountDefined,
		firstSpawn, currentSpawnDelay, spawnDelay,
		rateDelayValue, reduceFactor, durationOption, life,
		emitDelayDefined, setEmitDelay, setDuration
	} = params;
	if (paused) return { completed: false, blockedReason: "#paused=true，play() 直接返回" };
	const guard = (workingLifeCount > MIN_LIFE_COUNT || immortal || !lifeCountDefined)
		&& (firstSpawn || currentSpawnDelay >= (spawnDelay ?? DEFAULT_SPAWN_DELAY));
	if (!guard) return { completed: false, blockedReason: "play() 守卫条件不通过" };
	if (!emitDelayDefined) {
		setEmitDelay(calcDelayMs(rateDelayValue, reduceFactor));
	}
	if (workingLifeCount > MIN_LIFE_COUNT || immortal) {
		// #prepareToDie()
		const d = life.duration !== undefined ? durationOption : undefined;
		if ((workingLifeCount > 0 || immortal) && d !== undefined && isFiniteNumber(d) && d > 0) {
			setDuration(d * MILLISECONDS_TO_SECONDS);
		}
	}
	return { completed: true, blockedReason: "" };
}

/** 复刻 resize()：位置来源判定 + 尺寸重算（不触碰延迟/生命周期状态）。 */
function applyResize(params) {
	const {
		resizeEvent, workingCanvas, options, pixelRatio, domElementPresent,
		snapshot, initialPosition, positionOverride, currentPosition,
		setPositionOverride, setPosition, setCanvas, randomPercent
	} = params;

	const newCanvas = resizeEvent.canvas && isFiniteNumber(resizeEvent.canvas.width) && isFiniteNumber(resizeEvent.canvas.height)
		? { width: resizeEvent.canvas.width, height: resizeEvent.canvas.height }
		: { ...workingCanvas };
	setCanvas(newCanvas);

	let source;
	let inside = null;
	let nextPosition = { ...currentPosition };

	if (resizeEvent.positionOverrideSet === true) {
		// 外部已调用 setPosition()：#positionOverride=true，resize 只保留该位置
		setPositionOverride(true);
		if (resizeEvent.position && isFiniteNumber(resizeEvent.position.x) && isFiniteNumber(resizeEvent.position.y)) {
			nextPosition = { x: resizeEvent.position.x, y: resizeEvent.position.y };
		}
		source = "setPosition";
	} else if (positionOverride) {
		source = "setPosition";
	} else {
		const candidate = initialPosition;
		if (candidate) {
			inside = isPointInsideOrigin(candidate, newCanvas);
			if (inside) {
				nextPosition = { ...candidate };
				source = "initial-position-retained";
			} else {
				nextPosition = calcPositionFromSize(newCanvas, options.position, randomPercent);
				source = "recalculated-random";
			}
		} else {
			nextPosition = calcPositionFromSize(newCanvas, options.position, randomPercent);
			source = "recalculated-random";
		}
	}
	setPosition(nextPosition);

	const sizeResolution = resolveSize(options, newCanvas, pixelRatio, domElementPresent, snapshot.domRect);

	return {
		appliedAfterStep: isFiniteNumber(resizeEvent.afterStep) ? resizeEvent.afterStep : null,
		previousCanvas: { ...workingCanvas },
		canvas: { ...newCanvas },
		position: { ...nextPosition },
		positionSource: source,
		positionSourceLabel: source === "setPosition"
			? "已被 setPosition 覆盖（#positionOverride=true）"
			: source === "initial-position-retained"
				? "初始位置保留（isPointInside=true）"
				: "重新随机（初始位置缺失或 isPointInside=false）",
		initialPositionInside: inside,
		size: {
			mode: sizeResolution.mode,
			spec: { ...sizeResolution.spec },
			pixelSize: { ...sizeResolution.pixelSize },
			source: sizeResolution.source
		}
	};
}

export default { auditEmitter };
