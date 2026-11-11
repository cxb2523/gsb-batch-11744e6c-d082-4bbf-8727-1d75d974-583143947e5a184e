import { describe, expect, it, beforeAll } from 'vitest'

import { computeHeaderHmac, initSodium } from '@main/vault/crypto'
import { readContainer, verifyHeaderHmac, writeContainer } from '@main/vault/container'

// Field ids are part of the on-disk contract, so the tests pin the raw bytes rather than reuse
// the writer's own enum.
const FIELD = {
  END: 0x00,
  SALT: 0x01,
  TIER: 0x02,
  RECOVERY: 0x03,
  HMAC: 0x04,
  DEV_BUILD: 0x05,
  CREATED_AT: 0x06
} as const

const CREATED_AT_BYTES = 8
const MAGIC = Buffer.from('NVX\0')

const MASTER_KEY = Buffer.alloc(32, 7)
const SALT = Buffer.alloc(16, 1)
const KDF_TIER = 4
const RECOVERY_BLOB = Buffer.alloc(8, 2)
const DB_BYTES = Buffer.from('fake-sqlcipher-body')

function tlv(id: number, data: Buffer): Buffer {
  const field = Buffer.alloc(5 + data.length)
  field.writeUInt8(id, 0)
  field.writeUInt32LE(data.length, 1)
  data.copy(field, 5)
  return field
}

function versionField(): Buffer {
  const version = Buffer.alloc(4)
  version.writeUInt16LE(1, 0)
  version.writeUInt16LE(0, 2)
  return version
}

function createdAtData(ms: number): Buffer {
  const data = Buffer.alloc(CREATED_AT_BYTES)
  data.writeBigUInt64LE(BigInt(ms))
  return data
}

interface CraftOptions {
  includeCreatedAt?: boolean
  // Lets a test place a length-7 / length-9 value on disk while keeping the HMAC valid, so the
  // parser reaches the length check instead of failing the HMAC first.
  createdAtData?: Buffer
  devBuild?: boolean
}

// Builds a complete, HMAC-valid container byte-by-byte from local parts, independent of
// writeContainer(), so header-construction edge cases can be exercised deterministically.
function craftContainer(options: CraftOptions = {}): Buffer {
  const fields = [
    MAGIC,
    versionField(),
    tlv(FIELD.SALT, SALT),
    tlv(FIELD.TIER, Buffer.from([KDF_TIER])),
    tlv(FIELD.RECOVERY, RECOVERY_BLOB)
  ]
  if (options.devBuild) fields.push(tlv(FIELD.DEV_BUILD, Buffer.from([0x01])))
  if (options.includeCreatedAt !== false) {
    fields.push(tlv(FIELD.CREATED_AT, options.createdAtData ?? createdAtData(0)))
  }

  const headerWithoutHmac = Buffer.concat(fields)
  const hmac = computeHeaderHmac(headerWithoutHmac, MASTER_KEY)
  return Buffer.concat([
    headerWithoutHmac,
    tlv(FIELD.HMAC, hmac),
    Buffer.from([FIELD.END]),
    DB_BYTES
  ])
}

interface BaseParams {
  masterKey: Buffer
  salt: Buffer
  kdfTier: number
  recoveryBlob: Buffer
  dbBytes: Buffer
}

function baseParams(): BaseParams {
  return {
    masterKey: MASTER_KEY,
    salt: SALT,
    kdfTier: KDF_TIER,
    recoveryBlob: RECOVERY_BLOB,
    dbBytes: DB_BYTES
  }
}

// Byte offset where the CreatedAt TLV field starts in a written container.
function createdAtFieldStart(bytes: Buffer): number {
  return bytes.indexOf(Buffer.from([FIELD.CREATED_AT, CREATED_AT_BYTES, 0, 0, 0]))
}

beforeAll(async () => {
  await initSodium()
})

describe('container CreatedAt field', () => {
  it('round-trips an explicitly provided millisecond timestamp', () => {
    const createdAtMs = 1_700_000_000_123
    const bytes = writeContainer({ ...baseParams(), createdAtMs })

    const metadata = readContainer(bytes)
    expect(metadata.createdAtMs).toBe(createdAtMs)
  })

  it('writes the timestamp as an id-0x06 TLV holding 8 little-endian bytes', () => {
    const createdAtMs = 1_700_000_000_123
    const bytes = writeContainer({ ...baseParams(), createdAtMs })

    const start = createdAtFieldStart(bytes)
    expect(start).toBeGreaterThan(-1)
    expect(bytes.readUInt8(start)).toBe(0x06)
    expect(bytes.readUInt32LE(start + 1)).toBe(CREATED_AT_BYTES)
    expect(Number(bytes.readBigUInt64LE(start + 5))).toBe(createdAtMs)
  })

  it('defaults to the current time when createdAtMs is omitted', () => {
    const before = Date.now()
    const bytes = writeContainer(baseParams())
    const after = Date.now()

    const metadata = readContainer(bytes)
    expect(metadata.createdAtMs).not.toBeNull()
    expect(metadata.createdAtMs).toBeGreaterThanOrEqual(before)
    expect(metadata.createdAtMs).toBeLessThanOrEqual(after)
  })

  it('writes an explicit 0 rather than treating it as omission', () => {
    const bytes = writeContainer({ ...baseParams(), createdAtMs: 0 })

    expect(readContainer(bytes).createdAtMs).toBe(0)
  })

  it('reads null for a hand-built header that has no 0x06 field, without throwing', () => {
    const bytes = craftContainer({ includeCreatedAt: false })

    const metadata = readContainer(bytes)
    expect(metadata.createdAtMs).toBeNull()
    expect(verifyHeaderHmac(metadata.hmacCoveredBytes, metadata.storedHmac, MASTER_KEY)).toBe(true)
  })

  it('fails HMAC verification when any of the 8 timestamp bytes is flipped', () => {
    const bytes = writeContainer({ ...baseParams(), createdAtMs: 1_700_000_000_123 })
    const start = createdAtFieldStart(bytes)
    expect(start).toBeGreaterThan(-1)

    for (let dataIndex = 0; dataIndex < CREATED_AT_BYTES; dataIndex++) {
      const tampered = Buffer.from(bytes)
      tampered[start + 5 + dataIndex] = tampered[start + 5 + dataIndex] ^ 0xff

      const metadata = readContainer(tampered)
      expect(verifyHeaderHmac(metadata.hmacCoveredBytes, metadata.storedHmac, MASTER_KEY)).toBe(
        false
      )
    }
  })

  it('still verifies the HMAC of an untampered container carrying the field', () => {
    const bytes = writeContainer({ ...baseParams(), createdAtMs: 1_700_000_000_123 })

    const metadata = readContainer(bytes)
    expect(verifyHeaderHmac(metadata.hmacCoveredBytes, metadata.storedHmac, MASTER_KEY)).toBe(true)
  })

  it('rejects a 0x06 field that is only 7 bytes long', () => {
    const bytes = craftContainer({
      createdAtData: Buffer.alloc(7, 0xab)
    })

    expect(() => readContainer(bytes)).toThrow('HEADER_BAD_CREATED_AT')
  })

  it('rejects a 0x06 field that is 9 bytes long', () => {
    const bytes = craftContainer({
      createdAtData: Buffer.alloc(9, 0xab)
    })

    expect(() => readContainer(bytes)).toThrow('HEADER_BAD_CREATED_AT')
  })

  it('points dbOffset exactly at the DB start with the field present', () => {
    const bytes = writeContainer({ ...baseParams(), createdAtMs: 1_700_000_000_123 })

    const metadata = readContainer(bytes)
    expect(bytes.subarray(metadata.dbOffset)).toEqual(DB_BYTES)
    expect(metadata.dbOffset).toBe(bytes.length - DB_BYTES.length)
  })

  it('points dbOffset exactly at the DB start with the field absent', () => {
    const bytes = craftContainer({ includeCreatedAt: false })

    const metadata = readContainer(bytes)
    expect(bytes.subarray(metadata.dbOffset)).toEqual(DB_BYTES)
    expect(metadata.dbOffset).toBe(bytes.length - DB_BYTES.length)
  })

  it('parses the pre-existing fields identically whether or not the 0x06 field is present', () => {
    const withField = readContainer(writeContainer({ ...baseParams(), createdAtMs: 42 }))
    const withoutField = readContainer(craftContainer({ includeCreatedAt: false }))

    expect(withoutField.kdfInput.salt).toEqual(withField.kdfInput.salt)
    expect(withoutField.kdfInput.kdfTier).toBe(withField.kdfInput.kdfTier)
    expect(withoutField.recoveryBlob).toEqual(withField.recoveryBlob)
    expect(withoutField.versionMaj).toBe(withField.versionMaj)
    expect(withoutField.versionMin).toBe(withField.versionMin)
    expect(withoutField.devBuild).toBe(withField.devBuild)
    // Only the new field differs between the two layouts.
    expect(withField.createdAtMs).toBe(42)
    expect(withoutField.createdAtMs).toBeNull()
  })

  it('preserves createdAtMs across a writeContainer repack round trip', () => {
    const original = writeContainer({ ...baseParams(), createdAtMs: 1_700_000_000_123 })
    const firstRead = readContainer(original)

    const repacked = writeContainer({
      ...baseParams(),
      recoveryBlob: firstRead.recoveryBlob,
      salt: firstRead.kdfInput.salt,
      kdfTier: firstRead.kdfInput.kdfTier,
      existingVersionMin: firstRead.versionMin,
      devBuild: firstRead.devBuild,
      createdAtMs: firstRead.createdAtMs
    })

    const secondRead = readContainer(repacked)
    expect(secondRead.createdAtMs).toBe(1_700_000_000_123)
    expect(secondRead.dbOffset).toBe(repacked.length - DB_BYTES.length)
  })

  it('keeps the field omitted when repacking a pre-field vault (null stays null)', () => {
    const legacy = craftContainer({ includeCreatedAt: false })
    const legacyMeta = readContainer(legacy)
    expect(legacyMeta.createdAtMs).toBeNull()
    // The legacy file itself never carried the field.
    expect(createdAtFieldStart(legacy)).toBe(-1)

    // Passing the read value straight through mirrors the vault.ts repack call sites: a pre-field
    // vault reads back null, and null keeps the field omitted rather than inventing a timestamp.
    const repacked = writeContainer({
      ...baseParams(),
      createdAtMs: legacyMeta.createdAtMs
    })

    const repackedMeta = readContainer(repacked)
    expect(repackedMeta.createdAtMs).toBeNull()
    expect(createdAtFieldStart(repacked)).toBe(-1)
    expect(
      verifyHeaderHmac(repackedMeta.hmacCoveredBytes, repackedMeta.storedHmac, MASTER_KEY)
    ).toBe(true)
  })

  it('omits the field entirely when createdAtMs is explicitly null', () => {
    const bytes = writeContainer({ ...baseParams(), createdAtMs: null })

    expect(createdAtFieldStart(bytes)).toBe(-1)
    expect(readContainer(bytes).createdAtMs).toBeNull()
  })

  it('survives the field sitting alongside a devBuild field, inside the HMAC region', () => {
    const createdAtMs = 1_700_000_000_123
    const bytes = writeContainer({ ...baseParams(), devBuild: true, createdAtMs })

    const metadata = readContainer(bytes)
    expect(metadata.devBuild).toBe(true)
    expect(metadata.createdAtMs).toBe(createdAtMs)
    expect(verifyHeaderHmac(metadata.hmacCoveredBytes, metadata.storedHmac, MASTER_KEY)).toBe(true)
  })
})
