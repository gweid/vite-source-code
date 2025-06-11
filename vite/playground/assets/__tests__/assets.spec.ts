import path from 'node:path'
import fetch from 'node-fetch'
import { describe, expect, test } from 'vitest'
import {
  browserLogs,
  editFile,
  findAssetFile,
  getBg,
  getColor,
  isBuild,
  listAssets,
  notifyRebuildComplete,
  page,
  readFile,
  readManifest,
  untilUpdated,
  viteTestUrl,
  watcher,
} from '~utils'

const assetMatch = isBuild
  ? /\/foo\/assets\/asset-\w{8}\.png/
  : '/foo/nested/asset.png'

const iconMatch = `/foo/icon.png`

const fetchPath = (p: string) => {
  return fetch(path.posix.join(viteTestUrl, p), {
    headers: { Accept: 'text/html,*/*' },
  })
}

test('should have no 404s', () => {
  browserLogs.forEach((msg) => {
    expect(msg).not.toMatch('404')
  })
})

test('should get a 404 when using incorrect case', async () => {
  expect((await fetchPath('icon.png')).status).toBe(200)
  // won't be wrote to index.html because the url includes `.`
  expect((await fetchPath('ICON.png')).status).toBe(404)

  expect((await fetchPath('bar')).status).toBe(200)
  // fallback to index.html
  const incorrectBarFetch = await fetchPath('BAR')
  expect(incorrectBarFetch.status).toBe(200)
  expect(incorrectBarFetch.headers.get('Content-Type')).toContain('text/html')
})

describe('injected scripts', () => {
  test('@vite/client', async () => {
    const hasClient = await page.$(
      'script[type="module"][src="/foo/@vite/client"]',
    )
    if (isBuild) {
      expect(hasClient).toBeFalsy()
    } else {
      expect(hasClient).toBeTruthy()
    }
  })

  test('html-proxy', async () => {
    const hasHtmlProxy = await page.$(
      'script[type="module"][src^="/foo/index.html?html-proxy"]',
    )
    if (isBuild) {
      expect(hasHtmlProxy).toBeFalsy()
    } else {
      expect(hasHtmlProxy).toBeTruthy()
    }
  })
})

describe('raw references from /public', () => {
  test('load raw js from /public', async () => {
    expect(await page.textContent('.raw-js')).toMatch('[success]')
  })

  test('load raw css from /public', async () => {
    expect(await getColor('.raw-css')).toBe('red')
  })
})

test('import-expression from simple script', async () => {
  expect(await page.textContent('.import-expression')).toMatch(
    '[success][success]',
  )
})

describe('asset imports from js', () => {
  test('relative', async () => {
    expect(await page.textContent('.asset-import-relative')).toMatch(assetMatch)
  })

  test('absolute', async () => {
    expect(await page.textContent('.asset-import-absolute')).toMatch(assetMatch)
  })

  test('from /public', async () => {
    expect(await page.textContent('.public-import')).toMatch(iconMatch)
  })

  test('from /public (json)', async () => {
    expect(await page.textContent('.public-json-import')).toMatch(
      '/foo/foo.json',
    )
    expect(await page.textContent('.public-json-import-content'))
      .toMatchInlineSnapshot(`
      "{
        \\"foo\\": \\"bar\\"
      }
      "
    `)
  })
})

describe('css url() references', () => {
  test('fonts', async () => {
    expect(
      await page.evaluate(() => {
        return (document as any).fonts.check('700 32px Inter')
      }),
    ).toBe(true)
  })

  test('relative', async () => {
    expect(await getBg('.css-url-relative')).toMatch(assetMatch)
  })

  test('image-set relative', async () => {
    const imageSet = await getBg('.css-image-set-relative')
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('image-set without the url() call', async () => {
    const imageSet = await getBg('.css-image-set-without-url-call')
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('image-set with var', async () => {
    const imageSet = await getBg('.css-image-set-with-var')
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('image-set with mix', async () => {
    const imageSet = await getBg('.css-image-set-mix-url-var')
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('image-set with base64', async () => {
    const imageSet = await getBg('.css-image-set-base64')
    expect(imageSet).toContain('image-set(url("data:image/png;base64,')
  })

  test('image-set with gradient', async () => {
    const imageSet = await getBg('.css-image-set-gradient')
    expect(imageSet).toContain('image-set(url("data:image/png;base64,')
  })

  test('image-set with multiple descriptor', async () => {
    const imageSet = await getBg('.css-image-set-multiple-descriptor')
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('image-set with multiple descriptor as inline style', async () => {
    const imageSet = await getBg(
      '.css-image-set-multiple-descriptor-inline-style',
    )
    imageSet.split(', ').forEach((s) => {
      expect(s).toMatch(assetMatch)
    })
  })

  test('relative in @import', async () => {
    expect(await getBg('.css-url-relative-at-imported')).toMatch(assetMatch)
  })

  test('absolute', async () => {
    expect(await getBg('.css-url-absolute')).toMatch(assetMatch)
  })

  test('from /public', async () => {
    expect(await getBg('.css-url-public')).toMatch(iconMatch)
  })

  test('base64 inline', async () => {
    const match = isBuild ? `data:image/png;base64` : `/foo/nested/icon.png`
    expect(await getBg('.css-url-base64-inline')).toMatch(match)
    expect(await getBg('.css-url-quotes-base64-inline')).toMatch(match)
    const icoMatch = isBuild ? `data:image/x-icon;base64` : `favicon.ico`
    const el = await page.$(`link.ico`)
    const href = await el.getAttribute('href')
    expect(href).toMatch(icoMatch)
  })

  test('multiple urls on the same line', async () => {
    const bg = await getBg('.css-url-same-line')
    expect(bg).toMatch(assetMatch)
    expect(bg).toMatch(iconMatch)
  })

  test('aliased', async () => {
    const bg = await getBg('.css-url-aliased')
    expect(bg).toMatch(assetMatch)
  })

  test.runIf(isBuild)('generated paths in CSS', () => {
    const css = findAssetFile(/\.css$/, 'foo')

    // preserve postfix query/hash
    expect(css).toMatch(`woff2?#iefix`)

    // generate non-relative base for public path in CSS
    expect(css).not.toMatch(`../icon.png`)
  })
})

describe('image', () => {
  test('srcset', async () => {
    const img = await page.$('.img-src-set')
    const srcset = await img.getAttribute('srcset')
    srcset.split(', ').forEach((s) => {
      expect(s).toMatch(
        isBuild
          ? /\/foo\/assets\/asset-\w{8}\.png \dx/
          : /\/foo\/nested\/asset.png \dx/,
      )
    })
  })
})

describe('svg fragments', () => {
  // 404 is checked already, so here we just ensure the urls end with #fragment
  test('img url', async () => {
    const img = await page.$('.svg-frag-img')
    expect(await img.getAttribute('src')).toMatch(/svg#icon-clock-view$/)
  })

  test('via css url()', async () => {
    const bg = await page.evaluate(() => {
      return getComputedStyle(document.querySelector('.icon')).backgroundImage
    })
    expect(bg).toMatch(/svg#icon-clock-view"\)$/)
  })

  test('from js import', async () => {
    const img = await page.$('.svg-frag-import')
    expect(await img.getAttribute('src')).toMatch(/svg#icon-heart-view$/)
  })
})

test('Unknown extension assets import', async () => {
  expect(await page.textContent('.unknown-ext')).toMatch(
    isBuild ? 'data:application/octet-stream;' : '/nested/foo.unknown',
  )
})

test('?raw import', async () => {
  expect(await page.textContent('.raw')).toMatch('SVG')
})

test('?url import', async () => {
  const src = readFile('foo.js')
  expect(await page.textContent('.url')).toMatch(
    isBuild
      ? `data:application/javascript;base64,${Buffer.from(src).toString(
          'base64',
        )}`
      : `/foo/foo.js`,
  )
})

test('?url import on css', async () => {
  const src = readFile('css/icons.css')
  const txt = await page.textContent('.url-css')
  expect(txt).toEqual(
    isBuild
      ? `data:text/css;base64,${Buffer.from(src).toString('base64')}`
      : '/foo/css/icons.css',
  )
})

describe('unicode url', () => {
  test('from js import', async () => {
    const src = readFile('テスト-測試-white space.js')
    expect(await page.textContent('.unicode-url')).toMatch(
      isBuild
        ? `data:application/javascript;base64,${Buffer.from(src).toString(
            'base64',
          )}`
        : `/foo/テスト-測試-white space.js`,
    )
  })
})

describe.runIf(isBuild)('encodeURI', () => {
  test('img src with encodeURI', async () => {
    const img = await page.$('.encodeURI')
    expect(
      (await img.getAttribute('src')).startsWith('data:image/png;base64'),
    ).toBe(true)
  })
})

test('new URL(..., import.meta.url)', async () => {
  expect(await page.textContent('.import-meta-url')).toMatch(assetMatch)
})

test('new URL("@/...", import.meta.url)', async () => {
  expect(await page.textContent('.import-meta-url-dep')).toMatch(assetMatch)
})

test('new URL("/...", import.meta.url)', async () => {
  expect(await page.textContent('.import-meta-url-base-path')).toMatch(
    iconMatch,
  )
})

test('new URL(..., import.meta.url) without extension', async () => {
  expect(await page.textContent('.import-meta-url-without-extension')).toMatch(
    isBuild ? 'data:application/javascript' : 'nested/test.js',
  )
  expect(
    await page.textContent('.import-meta-url-content-without-extension'),
  ).toContain('export default class')
})

test('new URL(`${dynamic}`, import.meta.url)', async () => {
  expect(await page.textContent('.dynamic-import-meta-url-1')).toMatch(
    isBuild ? 'data:image/png;base64' : '/foo/nested/icon.png',
  )
  expect(await page.textContent('.dynamic-import-meta-url-2')).toMatch(
    assetMatch,
  )
  expect(await page.textContent('.dynamic-import-meta-url-js')).toMatch(
    isBuild ? 'data:application/javascript;base64' : '/foo/nested/test.js',
  )
})

test('new URL(`./${dynamic}?abc`, import.meta.url)', async () => {
  expect(await page.textContent('.dynamic-import-meta-url-1-query')).toMatch(
    isBuild ? 'data:image/png;base64' : '/foo/nested/icon.png?abc',
  )
  expect(await page.textContent('.dynamic-import-meta-url-2-query')).toMatch(
    isBuild
      ? /\/foo\/assets\/asset-\w{8}\.png\?abc/
      : '/foo/nested/asset.png?abc',
  )
})

test('new URL(`./${1 === 0 ? static : dynamic}?abc`, import.meta.url)', async () => {
  expect(await page.textContent('.dynamic-import-meta-url-1-ternary')).toMatch(
    isBuild ? 'data:image/png;base64' : '/foo/nested/icon.png?abc',
  )
  expect(await page.textContent('.dynamic-import-meta-url-2-ternary')).toMatch(
    isBuild
      ? /\/foo\/assets\/asset-\w{8}\.png\?abc/
      : '/foo/nested/asset.png?abc',
  )
})

test('new URL(`non-existent`, import.meta.url)', async () => {
  expect(await page.textContent('.non-existent-import-meta-url')).toMatch(
    new URL('non-existent', page.url()).pathname,
  )
})

test.runIf(isBuild)('manifest', async () => {
  const manifest = readManifest('foo')
  const entry = manifest['index.html']

  for (const file of listAssets('foo')) {
    if (file.endsWith('.css')) {
      expect(entry.css).toContain(`assets/${file}`)
    } else if (!file.endsWith('.js')) {
      expect(entry.assets).toContain(`assets/${file}`)
    }
  }
})

describe.runIf(isBuild)('css and assets in css in build watch', () => {
  test('css will not be lost and css does not contain undefined', async () => {
    editFile('index.html', (code) => code.replace('Assets', 'assets'), true)
    await notifyRebuildComplete(watcher)
    const cssFile = findAssetFile(/index-\w+\.css$/, 'foo')
    expect(cssFile).not.toBe('')
    expect(cssFile).not.toMatch(/undefined/)
  })

  test('import module.css', async () => {
    expect(await getColor('#foo')).toBe('red')
    editFile('css/foo.module.css', (code) => code.replace('red', 'blue'), true)
    await notifyRebuildComplete(watcher)
    await page.reload()
    expect(await getColor('#foo')).toBe('blue')
  })

  test('import with raw query', async () => {
    expect(await page.textContent('.raw-query')).toBe('foo')
    editFile('static/foo.txt', (code) => code.replace('foo', 'zoo'), true)
    await notifyRebuildComplete(watcher)
    await page.reload()
    expect(await page.textContent('.raw-query')).toBe('zoo')
  })
})

test('inline style test', async () => {
  expect(await getBg('.inline-style')).toMatch(assetMatch)
  expect(await getBg('.style-url-assets')).toMatch(assetMatch)
})

if (!isBuild) {
  test('@import in html style tag hmr', async () => {
    await untilUpdated(() => getColor('.import-css'), 'rgb(0, 136, 255)')
    const loadPromise = page.waitForEvent('load')
    editFile(
      './css/import.css',
      (code) => code.replace('#0088ff', '#00ff88'),
      true,
    )
    await loadPromise
    await untilUpdated(() => getColor('.import-css'), 'rgb(0, 255, 136)')
  })
}

test('html import word boundary', async () => {
  expect(await page.textContent('.obj-import-express')).toMatch(
    'ignore object import prop',
  )
  expect(await page.textContent('.string-import-express')).toMatch('no load')
})

test('relative path in html asset', async () => {
  expect(await page.textContent('.relative-js')).toMatch('hello')
  expect(await getColor('.relative-css')).toMatch('red')
})

test('url() contains file in publicDir, in <style> tag', async () => {
  expect(await getBg('.style-public-assets')).toContain(iconMatch)
})

test.skip('url() contains file in publicDir, as inline style', async () => {
  // TODO: To investigate why `await getBg('.inline-style-public') === "url("http://localhost:5173/icon.png")"`
  // It supposes to be `url("http://localhost:5173/foo/icon.png")`
  // (I built the playground to verify)
  expect(await getBg('.inline-style-public')).toContain(iconMatch)
})

test.runIf(isBuild)('assets inside <noscript> is rewrote', async () => {
  const indexHtml = readFile('./dist/foo/index.html')
  expect(indexHtml).toMatch(
    /<img class="noscript" src="\/foo\/assets\/asset-\w+\.png" \/>/,
  )
})
