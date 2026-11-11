/**
 * 宿主装配测试：overview（module 与 legacy 两条分支）是否把分轨诊断
 * 以 stemStatus 字段带出来，并与 components.stems 的旧布尔语义保持一致。
 *
 * 全程离线：venv 里不放 python.exe，probeEngine / engineReady 直接短路返回，
 * 不会 spawn 任何 Python 进程；模型文件只是自造的临时文件，不联网。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { overview, overviewModule, resolvePaths, collectStemSnapshot } from '../lib/index.js'
import { computeStemStatus, STEM_MODEL_FILES } from '../lib/stem-status.js'

const FOUR = STEM_MODEL_FILES.stems4
const SIX = STEM_MODEL_FILES.stems6

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-sc-test-'))
  const dataRoot = join(root, 'data')
  const stemsDir = join(dataRoot, 'models', 'stems')
  mkdirSync(stemsDir, { recursive: true })
  const fakePaths = {
    dataRoot,
    engineVenv: join(root, 'engine-venv'),                 // 无 python.exe：probe 立即短路
    engineResources: join(root, 'engine-resources'),
    legacyEngine: join(root, 'engine'),
    root: join(root, 'engine'),
    env: { TEMP: join(root, 'tmp') },
    install: { runtimeDir: join(root, 'runtime'), engineDist: join(root, 'runtime', 'engine-dist') },
    model: join(root, 'engine', 'yamnet.onnx'),
    musicnn: join(root, 'engine', 'musicnn.onnx'),
    python: join(root, 'engine-venv', 'Scripts', 'python.exe'),
  }
  mkdirSync(fakePaths.env.TEMP, { recursive: true })
  const putStem = (name, bytes = 1024) => writeFileSync(join(stemsDir, name), Buffer.alloc(bytes, 7))
  const putJunk = (name) => writeFileSync(join(stemsDir, name), 'x')
  return { root, fakePaths, stemsDir, putStem, putJunk }
}

let env
before(() => { env = makeRoot() })
after(() => rmSync(env.root, { recursive: true, force: true }))

test('overviewModule：返回对象带结构完整的 stemStatus 字段，且与 components.stems 语义一致', async () => {
  const r = await overviewModule(env.fakePaths)
  assert.ok(r && typeof r === 'object')
  assert.ok('stemStatus' in r, 'overview 返回对象必须包含 stemStatus 字段')
  const s = r.stemStatus
  assert.equal(typeof s.available, 'boolean')
  assert.ok(s.stems4 && s.stems6)
  assert.ok(Array.isArray(s.checks) && s.checks.length === 5)
  assert.ok('totalBytes' in s && 'totalSizeMb' in s && 'totalSizeDisplay' in s)
  assert.ok('components' in r && typeof r.components === 'object')
  assert.equal(r.components.stems, s.available,
    'components.stems 必须保持「至少一种分轨可用」的旧布尔语义')
  assert.equal(r.components.stems, s.stems4.available || s.stems6.available)
})

test('overviewModule：空模型目录 → 两种分轨都不可用，字段仍齐全', async () => {
  const r = await overviewModule(env.fakePaths)
  assert.equal(r.stemStatus.stems4.available, false)
  assert.equal(r.stemStatus.stems6.available, false)
  assert.equal(r.components.stems, false)
  assert.equal(r.stemStatus.totalBytes, 0)
})

test('overviewModule：宿主快照采集 + 仅 6 轨模型 + 依赖齐全 → 6 轨可用、4 轨缺模型，components.stems 与诊断一致', async () => {
  // probeEngine 在无 venv 时拿不到真实依赖，这里直接以「宿主采集函数的产物」喂给纯模块，
  // 验证 index.js 的目录扫描/字节统计与 stem-status 的规则衔接正确。
  env.putStem(SIX, 4096)
  try {
    const snapshot = collectStemSnapshot(env.fakePaths, { demucs_onnx: true, soundfile: true, soxr: true })
    const status = computeStemStatus(snapshot)
    assert.deepEqual(snapshot.files.sort(), [SIX].sort())
    assert.equal(snapshot.sizes[SIX], 4096)
    assert.equal(status.stems6.available, true)
    assert.equal(status.stems4.available, false)
    assert.deepEqual(status.stems4.missingModels, [FOUR])
    assert.equal(status.available, true)
  } finally {
    rmSync(join(env.stemsDir, SIX), { force: true })
  }
})

test('legacy overview：默认带全空 stemStatus；仅 6 轨模型时模型识别正确（离线无引擎 → 依赖闸门仍判不可用）', async () => {
  const legacyPaths = { ...env.fakePaths, engineModule: false }
  const before = await overview(legacyPaths)
  assert.ok('stemStatus' in before, 'legacy overview 也必须包含 stemStatus 字段（带默认值）')
  assert.equal(before.stemStatus.available, false)
  assert.equal(before.components.stems, false)

  env.putStem(SIX, 2048)
  env.putJunk('notes.txt')
  try {
    const r = await overview(legacyPaths)
    // 模型层面：6 轨模型被识别，4 轨模型缺失，互不顶替
    assert.equal(r.stemStatus.models.stems6.exists, true)
    assert.equal(r.stemStatus.models.stems4.exists, false)
    assert.equal(r.stemStatus.stems6.missingModels.length, 0)
    assert.deepEqual(r.stemStatus.stems4.missingModels, [FOUR])
    // 离线无引擎，demucs_onnx 未探测 → 闸门规则下两种分轨都不可用，原因指明依赖
    assert.equal(r.stemStatus.stems6.available, false)
    assert.equal(r.stemStatus.stems4.available, false)
    assert.deepEqual(r.stemStatus.stems6.missingDependencies, ['demucs_onnx'])
    // 无引擎时宿主根本没跑依赖探测 → 快照不带该键，按「未探测」解释
    assert.equal(r.stemStatus.deps.demucs_onnx.probed, false)
    assert.match(r.stemStatus.deps.demucs_onnx.reason, /未探测/)
    assert.equal(r.components.stems, r.stemStatus.available)
    // 无关文件不影响判定，也不进总字节数
    assert.equal(r.stemStatus.totalBytes, 2048)
  } finally {
    rmSync(join(env.stemsDir, SIX), { force: true })
    rmSync(join(env.stemsDir, 'notes.txt'), { force: true })
  }
})

test('legacy overview：依赖未探测时分轨不可用且原因指明依赖问题；两个模型齐时字节统计正确', async () => {
  const legacyPaths = { ...env.fakePaths, engineModule: false }
  env.putStem(FOUR, 1_048_576) // 1 MiB
  env.putStem(SIX, 2_097_152) // 2 MiB
  try {
    const r = await overview(legacyPaths)
    // engine 未安装 → legacy 分支不会探测依赖，demucs_onnx 为 undefined（未探测）
    assert.equal(r.stemStatus.stems4.available, false)
    assert.equal(r.stemStatus.stems6.available, false)
    assert.deepEqual(r.stemStatus.stems4.missingDependencies, ['demucs_onnx'])
    assert.equal(r.components.stems, false)
    assert.equal(r.stemStatus.totalBytes, 3 * 1_048_576)
    assert.equal(r.stemStatus.totalSizeMb, 3)
    assert.equal(r.stemStatus.totalSizeDisplay, '3 MB')
  } finally {
    rmSync(join(env.stemsDir, FOUR), { force: true })
    rmSync(join(env.stemsDir, SIX), { force: true })
  }
})

test('resolvePaths 仍可正常工作（装配入口未被破坏）', () => {
  const paths = resolvePaths({ root: join(env.root, 'engine'), dataRoot: join(env.root, 'data') })
  assert.equal(paths.dataRoot, join(env.root, 'data'))
  assert.ok(paths.env && paths.install)
})
