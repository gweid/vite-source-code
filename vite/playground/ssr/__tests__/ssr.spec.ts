import { expect, test } from 'vitest'
import { port, serverLogs } from './serve'
import { browserLogs, editFile, isServe, page, withRetry } from '~utils'

const url = `http://localhost:${port}`

test(`circular dependencies modules doesn't throw`, async () => {
  await page.goto(`${url}/circular-dep`)

  expect(await page.textContent('.circ-dep-init')).toMatch(
    'circ-dep-init-a circ-dep-init-b',
  )
})

test(`deadlock doesn't happen`, async () => {
  await page.goto(`${url}/forked-deadlock`)

  expect(await page.textContent('.forked-deadlock')).toMatch('rendered')
})

test('should restart ssr', async () => {
  editFile('./vite.config.ts', (content) => content)
  await withRetry(async () => {
    expect(serverLogs).toEqual(
      expect.arrayContaining([expect.stringMatching('server restarted')]),
    )
    expect(serverLogs).not.toEqual(
      expect.arrayContaining([expect.stringMatching('error')]),
    )
  })
})

test.runIf(isServe)('html proxy is encoded', async () => {
  await page.goto(
    `${url}?%22%3E%3C/script%3E%3Cscript%3Econsole.log(%27html proxy is not encoded%27)%3C/script%3E`,
  )

  expect(browserLogs).not.toContain('html proxy is not encoded')
})
