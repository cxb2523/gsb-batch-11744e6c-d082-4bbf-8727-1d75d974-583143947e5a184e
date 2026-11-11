import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }))
vi.mock('../indexer', () => ({ indexFile: vi.fn() }))

import { net } from 'electron'
import { capture, previewUrl } from './index'

const fetchMock = vi.mocked(net.fetch)

const ARTICLE_URL = 'https://medium.com/@jane/how-react-works-abc123'
const ARTICLE_HTML = `<!DOCTYPE html><html><head><title>How React Works | by Jane Doe | Medium</title></head>
<body><article><h1>How React Works</h1><p>${'React renders UI from state. '.repeat(20)}</p></article></body></html>`

let workspace: string
let destFolder: string

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'melo-capture-test-'))
  destFolder = path.join(workspace, 'inbox')
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => {
    if (String(input).includes('favicon')) return new Response('not found', { status: 404 })
    return new Response(ARTICLE_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  })
})

afterEach(async () => {
  await fs.remove(workspace)
})

describe('capture and previewUrl on a medium.com article', () => {
  it('applies the same adapter title cleaning and preprocessing on both paths', async () => {
    const preview = await previewUrl(ARTICLE_URL)
    const result = await capture(ARTICLE_URL, destFolder, workspace)

    expect(preview.title).toBe('How React Works')
    expect(result.title).toBe(preview.title)

    const written = await fs.readFile(result.filePath, 'utf-8')
    expect(written).toContain('title: "How React Works"')
    // Same pipeline output on both paths — the captured body is the
    // previewed body.
    expect(preview.bodyPreview.length).toBeGreaterThan(0)
    expect(written).toContain(preview.bodyPreview)
  })
})
