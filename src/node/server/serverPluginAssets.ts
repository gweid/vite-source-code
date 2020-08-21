import { ServerPlugin } from '.'
import { isImportRequest, isStaticAsset } from '../utils'

// src/assets 下的静态资源的处理，直接返回图片
export const assetPathPlugin: ServerPlugin = ({ app }) => {
  app.use(async (ctx, next) => {
    if (isStaticAsset(ctx.path) && isImportRequest(ctx)) {
      ctx.type = 'js'
      ctx.body = `export default ${JSON.stringify(ctx.path)}`
      return
    }
    return next()
  })
}
