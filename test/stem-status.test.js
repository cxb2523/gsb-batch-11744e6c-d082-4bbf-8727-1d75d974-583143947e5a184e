/**
 * lib/stem-status.js 的离线单元测试。
 * 全部使用自造的纯数据样例：不依赖真实 Python 引擎、网络或真实模型文件。
 * 运行：npm test（node --test，Node 内置测试运行器，无新增依赖）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStemStatus, createEmptyStemStatus, STEM_MODEL_FILES } from '../lib/stem-status.js'

const FOUR = STEM_MODEL_FILES.stems4
const SIX = STEM_MODEL_FILES.stems6

function fullDeps() {
  return { demucs_onnx: true, soundfile: true, soxr: true }
}

test('正常路径：依赖齐全且两个模型都在 → 4 轨/6 轨均可用，检查项全部通过', () => {
  const sizes = { [FOUR]: 157_286_400, [SIX]: 162_529_280 }
  const r = computeStemStatus({ deps: fullDeps(), files: [FOUR, SIX], sizes })

  assert.equal(r.stems4.available, true)
  assert.equal(r.stems6.available, true)
  assert.equal(r.available, true)
  assert.deepEqual(r.stems4.missingDependencies, [])
  assert.deepEqual(r.stems4.missingModels, [])
  assert.deepEqual(r.stems6.missingDependencies, [])
  assert.deepEqual(r.stems6.missingModels, [])

  // 有序检查项：闸门依赖 → 辅助依赖 → 4 轨模型 → 6 轨模型，全部通过且无原因
  assert.equal(r.checks.length, 5)
  assert.deepEqual(r.checks.map(c => c.name), [
    'demucs_onnx', 'soundfile', 'soxr', FOUR, SIX,
  ])
  for (const c of r.checks) {
    assert.equal(c.ok, true)
    assert.equal(c.reason, null)
  }

  // 字节数汇总与 MB 展示（一位小数）
  const total = sizes[FOUR] + sizes[SIX]
  assert.equal(r.totalBytes, total)
  assert.equal(r.totalBytesKnown, true)
  assert.equal(r.totalSizeMb, Math.round((total / 1048576 + Number.EPSILON) * 10) / 10)
  assert.equal(r.totalSizeDisplay, `${r.totalSizeMb} MB`)
  assert.deepEqual(r.missingBytes, [])
})

test('负向路径：demucs_onnx 为 false → 两种分轨都不可用，原因指明依赖缺失', () => {
  const r = computeStemStatus({
    deps: { demucs_onnx: false, soundfile: true, soxr: true },
    files: [FOUR, SIX],
    sizes: { [FOUR]: 100, [SIX]: 200 },
  })

  assert.equal(r.stems4.available, false)
  assert.equal(r.stems6.available, false)
  assert.equal(r.available, false)
  assert.deepEqual(r.stems4.missingDependencies, ['demucs_onnx'])
  assert.deepEqual(r.stems6.missingDependencies, ['demucs_onnx'])
  // 模型其实在，所以缺的是依赖而不是模型
  assert.deepEqual(r.stems4.missingModels, [])
  assert.deepEqual(r.stems6.missingModels, [])
  const gate = r.checks.find(c => c.name === 'demucs_onnx')
  assert.equal(gate.ok, false)
  assert.match(gate.reason, /demucs_onnx/)
  // 单轨检查项里同样要把依赖原因带出来
  assert.equal(r.stems4.checks[0].ok, false)
  assert.match(r.stems4.checks[0].reason, /demucs_onnx/)
  // 历史 components.stems 语义：依赖不真就为 false
  assert.equal(r.available, false)
})

test('demucs_onnx 未探测（undefined）→ 按不可用处理并在原因中说明未探测', () => {
  const r = computeStemStatus({ deps: { soundfile: true, soxr: true }, files: [FOUR] })
  assert.equal(r.stems4.available, false)
  assert.equal(r.stems6.available, false)
  assert.match(r.deps.demucs_onnx.reason, /未探测/)
  assert.match(r.checks.find(c => c.name === 'demucs_onnx').reason, /未探测/)
})

test('边界路径：只有 6 轨模型 → 4 轨不可用（缺模型），6 轨可用，互不顶替', () => {
  const r = computeStemStatus({ deps: fullDeps(), files: [SIX], sizes: { [SIX]: 150_000_000 } })

  assert.equal(r.stems6.available, true)
  assert.equal(r.stems4.available, false)
  assert.equal(r.available, true, '至少一种分轨可用时整体仍为 true')
  assert.deepEqual(r.stems4.missingModels, [FOUR])
  assert.deepEqual(r.stems4.missingDependencies, [])
  assert.deepEqual(r.stems6.missingModels, [])
  const fourModelCheck = r.checks.find(c => c.name === FOUR)
  assert.equal(fourModelCheck.ok, false)
  assert.match(fourModelCheck.reason, /htdemucs_fp16weights\.onnx/)
  const sixModelCheck = r.checks.find(c => c.name === SIX)
  assert.equal(sixModelCheck.ok, true)
})

test('边界路径：只有 4 轨模型 → 4 轨可用，6 轨不可用', () => {
  const r = computeStemStatus({ deps: fullDeps(), files: [FOUR], sizes: { [FOUR]: 150_000_000 } })
  assert.equal(r.stems4.available, true)
  assert.equal(r.stems6.available, false)
  assert.deepEqual(r.stems6.missingModels, [SIX])
  assert.equal(r.available, true)
})

test('空目录：不抛异常，两种分轨都不可用，原因指向缺失模型', () => {
  assert.doesNotThrow(() => computeStemStatus({ deps: fullDeps(), files: [] }))
  const r = computeStemStatus({ deps: fullDeps(), files: [] })
  assert.equal(r.stems4.available, false)
  assert.equal(r.stems6.available, false)
  assert.deepEqual(r.stems4.missingModels, [FOUR])
  assert.deepEqual(r.stems6.missingModels, [SIX])
  assert.equal(r.totalBytes, 0)
  assert.equal(r.totalSizeMb, 0)
  assert.equal(r.totalSizeDisplay, '0 MB')
})

test('目录含无关文件：不抛异常，不被当成模型，分轨不可用', () => {
  const files = ['readme.txt', 'something.onnx.tmp', '.gitkeep', 'sub-dir']
  assert.doesNotThrow(() => computeStemStatus({ deps: fullDeps(), files }))
  const r = computeStemStatus({ deps: fullDeps(), files })
  assert.equal(r.stems4.available, false)
  assert.equal(r.stems6.available, false)
  assert.equal(r.models.stems4.exists, false)
  assert.equal(r.models.stems6.exists, false)
  assert.equal(r.totalBytes, 0)
})

test('字节数缺失：按 0 处理并在原因中说明，不抛异常', () => {
  const r = computeStemStatus({ deps: fullDeps(), files: [FOUR, SIX] }) // 不给 sizes
  assert.equal(r.stems4.available, true, '缺字节数不影响可用性判定')
  assert.equal(r.stems6.available, true)
  assert.equal(r.models.stems4.bytes, 0)
  assert.equal(r.models.stems4.bytesKnown, false)
  assert.equal(r.models.stems4.size_mb, 0)
  assert.match(r.models.stems4.reason, /缺少字节数|按 0 字节/)
  assert.deepEqual(r.missingBytes.sort(), [FOUR, SIX].sort())
  assert.equal(r.totalBytes, 0)
  assert.equal(r.totalBytesKnown, false)
  assert.ok(r.warnings.some(w => /按 0 字节/.test(w)))
  assert.ok(r.stems4.warnings.some(w => /按 0 字节/.test(w)))
})

test('字节数为非法值：同样按 0 处理，不抛异常', () => {
  const r = computeStemStatus({
    deps: fullDeps(),
    files: [FOUR],
    sizes: { [FOUR]: 'not-a-number' },
  })
  assert.equal(r.models.stems4.bytes, 0)
  assert.equal(r.models.stems4.bytesKnown, false)
  assert.equal(r.totalBytesKnown, false)
})

test('残缺/异常输入（null、undefined、类型错误）：一律不抛异常', () => {
  const cases = [undefined, null, {}, { deps: null }, { files: null }, { sizes: null },
    { deps: 'x', files: 'y', sizes: 'z' }, { files: [null, undefined, 123, ''] }]
  for (const c of cases) {
    assert.doesNotThrow(() => computeStemStatus(c))
    const r = computeStemStatus(c)
    assert.equal(typeof r.available, 'boolean')
    assert.equal(r.stems4.available, false)
    assert.equal(r.stems6.available, false)
    assert.equal(Array.isArray(r.checks), true)
  }
})

test('文件名带目录前缀时按 basename 匹配', () => {
  const r = computeStemStatus({
    deps: fullDeps(),
    files: [`D:\\data\\models\\stems\\${FOUR}`, `/data/models/stems/${SIX}`],
    sizes: { [FOUR]: 1, [SIX]: 2 },
  })
  assert.equal(r.stems4.available, true)
  assert.equal(r.stems6.available, true)
})

test('辅助依赖 soundfile/soxr 缺失：产生告警与失败检查项，但不阻断分轨可用性', () => {
  const r = computeStemStatus({
    deps: { demucs_onnx: true, soundfile: false }, // soxr 键完全缺失 → 未探测
    files: [FOUR],
    sizes: { [FOUR]: 1 },
  })
  assert.equal(r.stems4.available, true)
  assert.equal(r.checks.find(c => c.name === 'soundfile').ok, false)
  assert.equal(r.checks.find(c => c.name === 'soxr').ok, false)
  assert.equal(r.deps.soundfile.present, false)
  assert.equal(r.deps.soundfile.probed, true)
  assert.equal(r.deps.soxr.probed, false)
  assert.match(r.deps.soundfile.reason, /未安装/)
  assert.match(r.deps.soxr.reason, /未探测/)
  assert.ok(r.warnings.length >= 2)
})

test('不变量：available 恒等于「至少一种分轨可用」，且输出可 JSON 序列化', () => {
  const scenarios = [
    { deps: fullDeps(), files: [FOUR, SIX] },
    { deps: fullDeps(), files: [FOUR] },
    { deps: fullDeps(), files: [SIX] },
    { deps: fullDeps(), files: [] },
    { deps: { demucs_onnx: false }, files: [FOUR, SIX] },
    {},
  ]
  for (const s of scenarios) {
    const r = computeStemStatus(s)
    assert.equal(r.available, r.stems4.available || r.stems6.available)
    assert.doesNotThrow(() => JSON.stringify(r))
  }
})

test('createEmptyStemStatus：结构完整的全空默认值', () => {
  const r = createEmptyStemStatus()
  assert.equal(r.available, false)
  assert.equal(r.stems4.available, false)
  assert.equal(r.stems6.available, false)
  assert.equal(r.checks.length, 5)
  assert.equal(r.totalBytes, 0)
  assert.equal(r.totalSizeDisplay, '0 MB')
  assert.deepEqual(r, computeStemStatus({}))
})
