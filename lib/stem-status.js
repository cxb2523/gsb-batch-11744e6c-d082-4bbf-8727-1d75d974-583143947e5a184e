/**
 * 分轨能力状态判定 —— 纯函数模块。
 *
 * 只吃纯数据快照、只吐纯数据，不访问文件系统、不 spawn 进程、不读环境变量，
 * 因此可以在宿主（lib/index.js）、面板数据装配与离线单元测试里共用同一套规则。
 *
 * 判定规则与历史 overview 保持一致：
 * - 依赖 demucs_onnx 不为 true（false / undefined 未探测）时，4 轨与 6 轨都不可用；
 * - 4 轨要求 htdemucs_fp16weights.onnx 存在；
 * - 6 轨要求 htdemucs_6s_fp16weights.onnx 存在；
 * - 两个模型各自独立判定，6 轨模型不能顶替 4 轨模型，反之亦然。
 * soundfile / soxr 是分轨运行时的辅助依赖：只做可解释检查与告警，不参与可用性闸门，
 * 以免改变历史 components.stems 的布尔语义。
 */

export const STEM_DEPENDENCIES = ['demucs_onnx', 'soundfile', 'soxr']

/** 闸门依赖：不为 true 即视为不可用（含 undefined 未探测）。 */
export const STEM_GATING_DEPENDENCY = 'demucs_onnx'

export const STEM_MODEL_FILES = {
  stems4: 'htdemucs_fp16weights.onnx',
  stems6: 'htdemucs_6s_fp16weights.onnx',
}

const MB = 1048576

/** 只保留文件名本身：调用方给目录全路径也能匹配。 */
function baseName(name) {
  return String(name ?? '').split(/[\\/]/).pop()
}

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10
}

function depPresent(deps, name) {
  return Object.prototype.hasOwnProperty.call(deps, name) && deps[name] === true
}

function depProbed(deps, name, probedSet) {
  return probedSet.has(name)
}

function depReason(name, deps, probedSet) {
  if (depPresent(deps, name)) return null
  if (!depProbed(deps, name, probedSet)) return `依赖 ${name} 未探测（探测结果缺失，按不可用处理）`
  return `依赖 ${name} 未安装（分轨依赖缺失）`
}

function auxDepReason(name, deps, probedSet) {
  if (depPresent(deps, name)) return null
  if (!depProbed(deps, name, probedSet)) return `辅助依赖 ${name} 未探测（按未安装处理，不阻断分轨判定）`
  return `辅助依赖 ${name} 未安装（不阻断判定，但分轨运行时可能失败）`
}

function modelReason(file, exists, bytesKnown) {
  if (!exists) return `模型文件 ${file} 不存在`
  if (!bytesKnown) return `模型文件 ${file} 已存在，但缺少字节数信息，按 0 字节统计`
  return null
}

/**
 * 计算分轨能力状态。
 *
 * @param {object}   snapshot
 * @param {object}   [snapshot.deps]  依赖探测结果，键为 demucs_onnx / soundfile / soxr，
 *                                    值为 true / false；键缺失或值为 undefined 表示未探测。
 * @param {string[]} [snapshot.files] 分轨模型目录（dataRoot/models/stems）下已存在的文件名列表。
 * @param {object}   [snapshot.sizes] 可选：文件名 -> 字节数；缺失或非有限数字按 0 处理并在原因中说明。
 * @returns {object} 结构化纯数据（可 JSON 序列化）。
 */
export function computeStemStatus(snapshot = {}) {
  // ── 输入兜底：任何形态的空输入都不得抛异常 ──
  const rawDeps = snapshot && typeof snapshot === 'object' && snapshot.deps && typeof snapshot.deps === 'object'
    ? snapshot.deps
    : {}
  // 先记录原始探测面：键缺失（undefined 未探测）与显式 false 必须区分开，
  // 不能在归一化时把缺失的键补成 undefined 后再判断，否则两者无法分辨。
  const probedDeps = new Set()
  for (const name of STEM_DEPENDENCIES) {
    if (Object.prototype.hasOwnProperty.call(rawDeps, name)) probedDeps.add(name)
  }
  const deps = {}
  for (const name of STEM_DEPENDENCIES) {
    deps[name] = probedDeps.has(name) ? rawDeps[name] : undefined
  }

  const rawFiles = snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.files) ? snapshot.files : []
  const presentNames = new Set()
  for (const f of rawFiles) {
    const name = baseName(f)
    if (name) presentNames.add(name)
  }

  const rawSizes = snapshot && typeof snapshot === 'object' && snapshot.sizes && typeof snapshot.sizes === 'object'
    ? snapshot.sizes
    : {}

  // ── 依赖检查项（demucs_onnx 为闸门，soundfile/soxr 仅告警）──
  const depChecks = {}
  const depEntries = {}
  for (const name of STEM_DEPENDENCIES) {
    const gating = name === STEM_GATING_DEPENDENCY
    const present = depPresent(deps, name)
    const probed = depProbed(deps, name, probedDeps)
    const reason = gating ? depReason(name, deps, probedDeps) : auxDepReason(name, deps, probedDeps)
    depChecks[name] = { name, ok: present, reason }
    depEntries[name] = {
      name,
      ok: present,
      present,
      probed,
      required: gating,
      reason,
    }
  }

  // ── 模型检查项（4 轨 / 6 轨各认各的文件，互不顶替）──
  const warnings = []
  const missingBytes = []
  const modelEntries = {}
  let totalBytes = 0
  for (const [key, file] of Object.entries(STEM_MODEL_FILES)) {
    const exists = presentNames.has(file)
    const hasSize = Object.prototype.hasOwnProperty.call(rawSizes, file)
    const parsed = Number(rawSizes[file])
    const bytesKnown = hasSize && Number.isFinite(parsed)
    const bytes = exists && bytesKnown ? parsed : 0
    if (exists) {
      totalBytes += bytes
      if (!bytesKnown) missingBytes.push(file)
    }
    const reason = modelReason(file, exists, bytesKnown)
    if (reason && exists) warnings.push(reason)
    modelEntries[key] = {
      name: file,
      exists,
      bytes,
      bytesKnown: exists && bytesKnown,
      size_mb: exists && bytesKnown ? round1(bytes / MB) : 0,
      reason,
    }
  }

  // 辅助依赖告警（不阻断，但面板要能解释「为什么装了还可能跑不起来」）
  for (const name of STEM_DEPENDENCIES) {
    if (name === STEM_GATING_DEPENDENCY) continue
    const reason = auxDepReason(name, deps, probedDeps)
    if (reason) warnings.push(reason)
  }

  /** 组装单轨（4 轨 / 6 轨）结论。 */
  function buildStem(key, label) {
    const file = STEM_MODEL_FILES[key]
    const model = modelEntries[key]
    const gatingOk = depChecks[STEM_GATING_DEPENDENCY].ok
    const missingDependencies = gatingOk ? [] : [STEM_GATING_DEPENDENCY]
    const missingModels = model.exists ? [] : [file]
    const checks = [
      { ...depChecks[STEM_GATING_DEPENDENCY] },
      { name: file, ok: model.exists, reason: model.exists ? null : `模型文件 ${file} 不存在` },
    ]
    const stemWarnings = []
    for (const name of STEM_DEPENDENCIES) {
      if (name === STEM_GATING_DEPENDENCY) continue
      const reason = auxDepReason(name, deps, probedDeps)
      if (reason) stemWarnings.push(reason)
    }
    if (model.exists && !model.bytesKnown) {
      stemWarnings.push(`模型文件 ${file} 已存在，但缺少字节数信息，按 0 字节统计`)
    }
    return {
      key,
      label,
      modelFile: file,
      available: gatingOk && model.exists,
      missingDependencies,
      missingModels,
      checks,
      warnings: stemWarnings,
    }
  }

  const stems4 = buildStem('stems4', '4 轨')
  const stems6 = buildStem('stems6', '6 轨')

  return {
    // 与历史 components.stems 同义：至少一种分轨可用
    available: stems4.available || stems6.available,
    deps: depEntries,
    models: modelEntries,
    stems4,
    stems6,
    // 有序检查项：先闸门依赖，再辅助依赖，最后两个模型文件
    checks: [
      depChecks.demucs_onnx,
      depChecks.soundfile,
      depChecks.soxr,
      { name: STEM_MODEL_FILES.stems4, ok: modelEntries.stems4.exists, reason: modelEntries.stems4.reason },
      { name: STEM_MODEL_FILES.stems6, ok: modelEntries.stems6.exists, reason: modelEntries.stems6.reason },
    ],
    warnings,
    missingBytes,
    totalBytes,
    totalBytesKnown: missingBytes.length === 0,
    totalSizeMb: round1(totalBytes / MB),
    totalSizeDisplay: `${round1(totalBytes / MB)} MB`,
  }
}

/**
 * 默认（全空）分轨状态：overview 在拿不到探测结果时用它兜底，
 * 保证返回对象里始终带着结构完整的分轨状态字段。
 */
export function createEmptyStemStatus() {
  return computeStemStatus({ deps: {}, files: [], sizes: {} })
}
