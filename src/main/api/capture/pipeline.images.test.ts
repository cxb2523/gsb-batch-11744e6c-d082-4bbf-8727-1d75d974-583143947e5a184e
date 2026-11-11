import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))

import { net } from 'electron'
import { downloadImages, downloadImageToAssets } from './pipeline'

const fetchMock = vi.mocked(net.fetch)

/** PNG magic bytes followed by padding — big enough to pass the minimum
 *  size floor, small enough to keep the test fast. */
function pngBytes(size = 256): Buffer {
  const buf = Buffer.alloc(size)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf)
  return buf
}

const htmlBody = (label: string) =>
  `<!DOCTYPE html><html><body><form>${label}</form></body></html>`.padEnd(200, ' ')

let workspace: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'melo-capture-test-'))
  fetchMock.mockReset()
})

afterEach(async () => {
  await fs.remove(workspace)
})

describe('downloadImageToAssets', () => {
  it('returns null and writes nothing for a 200 HTML login page', async () => {
    fetchMock.mockResolvedValue(
      new Response(htmlBody('login'), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    )

    const result = await downloadImageToAssets('https://example.com/avatar.png', workspace)

    expect(result).toBeNull()
    expect(await fs.pathExists(path.join(workspace, '.assets'))).toBe(false)
  })

  it('returns null when an HTML body is served with a forged image Content-Type', async () => {
    fetchMock.mockResolvedValue(
      new Response(htmlBody('captcha'), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const result = await downloadImageToAssets('https://example.com/avatar.png', workspace)

    expect(result).toBeNull()
    expect(await fs.pathExists(path.join(workspace, '.assets'))).toBe(false)
  })

  it('returns null without streaming when Content-Length exceeds the cap', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(pngBytes()), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(31 * 1024 * 1024),
        },
      }),
    )

    const result = await downloadImageToAssets('https://example.com/huge.png', workspace)

    expect(result).toBeNull()
    expect(await fs.pathExists(path.join(workspace, '.assets'))).toBe(false)
  })

  it('aborts the stream and returns null when the body grows past the cap', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    fetchMock.mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'image/png' } }),
    )

    const result = await downloadImageToAssets('https://example.com/huge.png', workspace)

    expect(result).toBeNull()
    expect(cancelled).toBe(true)
    expect(await fs.pathExists(path.join(workspace, '.assets'))).toBe(false)
  })

  it('falls back to magic bytes for the extension when Content-Type is missing', async () => {
    const body = pngBytes()
    fetchMock.mockResolvedValue(new Response(new Uint8Array(body), { status: 200 }))

    const result = await downloadImageToAssets('https://example.com/avatar', workspace)

    expect(result).toMatch(/^\.assets\/\d{4}\/\d{2}\/[\w-]+\.png$/)
    const saved = await fs.readFile(path.join(workspace, result!))
    expect(saved.equals(body)).toBe(true)
  })
})

describe('downloadImages', () => {
  it('keeps the original remote URL when the download fails', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))
    const markdown = '![alt](https://example.com/a.png)\n\nsome text'

    const out = await downloadImages(markdown, 'https://example.com/post', workspace, null)

    expect(out).toBe(markdown)
  })

  it('skips data: inline images without fetching', async () => {
    const markdown =
      '![pixel](data:image/png;base64,iVBORw0KGgo=)\n\n![a](https://example.com/a.png)'
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(pngBytes()), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const out = await downloadImages(markdown, 'https://example.com/post', workspace, null)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.com/a.png')
    expect(out).toContain('![pixel](data:image/png;base64,iVBORw0KGgo=)')
    expect(out).toMatch(/!\[a\]\(\.assets\/\d{4}\/\d{2}\/[\w-]+\.png\)/)
  })

  it('rewrites the URL to the local asset path on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(pngBytes()), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )

    const out = await downloadImages(
      '![alt](https://example.com/a.png)',
      'https://example.com/post',
      workspace,
      null,
    )

    expect(out).toMatch(/^!\[alt\]\(\.assets\/\d{4}\/\d{2}\/[\w-]+\.png\)$/)
  })
})
