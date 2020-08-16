import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { ServerPlugin } from '.'
import { defaultDefines } from '../config'

export const clientFilePath = path.resolve(__dirname, '../../client/client.js')

// 新版公共路径
export const clientPublicPath = `/vite/client` 

// 旧版公共路径（已经抛弃的路径）
const legacyPublicPath = '/vite/hmr'

export const clientPlugin: ServerPlugin = ({ app, config }) => {
  const clientCode = fs
    .readFileSync(clientFilePath, 'utf-8')
    .replace(`__MODE__`, JSON.stringify(config.mode || 'development'))
    .replace(
      `__DEFINES__`,
      JSON.stringify({
        ...defaultDefines,
        ...config.define
      })
    )

  // <script type="module">import "/vite/client"</script>
  // 拦截 import "/vite/client" 请求返回给浏览器
  app.use(async (ctx, next) => {
    if (ctx.path === clientPublicPath) {
      ctx.type = 'js'
      ctx.status = 200
      ctx.body = clientCode.replace(`__PORT__`, ctx.port.toString())
    } else {
      // 抛出错误：客户端路径更改为 /vite/client
      if (ctx.path === legacyPublicPath) {
        console.error(
          chalk.red(
            `[vite] client import path has changed from "/vite/hmr" to "/vite/client". ` +
              `please update your code accordingly.`
          )
        )
      }
      return next()
    }
  })
}
