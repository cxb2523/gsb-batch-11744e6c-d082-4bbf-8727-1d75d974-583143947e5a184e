import { describe, expect, it } from 'vitest'
import { builtinAdapters } from './index'
import { medium } from './medium'

const resolve = (raw: string) => builtinAdapters.find((a) => a.match(new URL(raw))) ?? null

describe('medium adapter', () => {
  it('matches medium.com and its subdomains', () => {
    expect(medium.match(new URL('https://medium.com/@jane/some-post-abc123'))).toBe(true)
    expect(medium.match(new URL('https://blog.medium.com/some-post'))).toBe(true)
  })

  it('does not match look-alike or unrelated hosts', () => {
    expect(medium.match(new URL('https://notmedium.com/post'))).toBe(false)
    expect(medium.match(new URL('https://medium.com.evil.example/post'))).toBe(false)
    expect(medium.match(new URL('https://github.com/medium/medium-repo'))).toBe(false)
    expect(medium.match(new URL('https://zhuanlan.zhihu.com/p/123'))).toBe(false)
  })

  it('strips Medium title suffixes', () => {
    const url = new URL('https://medium.com/@jane/some-post-abc123')
    expect(medium.cleanTitle?.('How React Works | by Jane Doe | Medium', url)).toBe(
      'How React Works',
    )
    // Readability may already have dropped the trailing "| Medium".
    expect(medium.cleanTitle?.('How React Works | by Jane Doe', url)).toBe('How React Works')
    expect(medium.cleanTitle?.('How React Works | Medium', url)).toBe('How React Works')
    expect(medium.cleanTitle?.('How React Works', url)).toBe('How React Works')
  })

  it('keeps the original title when cleaning would empty it', () => {
    const url = new URL('https://medium.com/@jane/some-post-abc123')
    expect(medium.cleanTitle?.('| Medium', url)).toBe('| Medium')
  })
})

describe('adapter registry order', () => {
  it('keeps the pre-existing adapters matching their own hosts', () => {
    expect(resolve('https://github.com/user/repo')?.name).toBe('GitHub')
    expect(resolve('https://mp.weixin.qq.com/s/abc')?.name).toBe('WeChat')
    expect(resolve('https://zhuanlan.zhihu.com/p/123')?.name).toBe('Zhihu')
  })

  it('resolves medium.com URLs to the medium adapter', () => {
    expect(resolve('https://medium.com/@jane/some-post-abc123')?.name).toBe('Medium')
  })

  it('registers medium after the pre-existing adapters', () => {
    const names = builtinAdapters.map((a) => a.name)
    expect(names.indexOf('Medium')).toBeGreaterThan(names.indexOf('WeChat'))
    expect(names.indexOf('Medium')).toBeGreaterThan(names.indexOf('Zhihu'))
    expect(names.indexOf('Medium')).toBeGreaterThan(names.indexOf('GitHub'))
  })
})
