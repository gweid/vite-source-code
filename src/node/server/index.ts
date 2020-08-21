import path from 'path'
import fs from 'fs-extra'
import { RequestListener, Server } from 'http'
import { ServerOptions } from 'https'
import Koa, { DefaultState, DefaultContext } from 'koa'
import chokidar from 'chokidar'
import { createResolver, InternalResolver } from '../resolver'
import { moduleRewritePlugin } from './serverPluginModuleRewrite'
import { moduleResolvePlugin } from './serverPluginModuleResolve'
import { vuePlugin } from './serverPluginVue'
import { hmrPlugin, HMRWatcher } from './serverPluginHmr'
import { serveStaticPlugin } from './serverPluginServeStatic'
import { jsonPlugin } from './serverPluginJson'
import { cssPlugin } from './serverPluginCss'
import { assetPathPlugin } from './serverPluginAssets'
import { esbuildPlugin } from './serverPluginEsbuild'
import { ServerConfig } from '../config'
import { createServerTransformPlugin } from '../transform'
import { htmlRewritePlugin } from './serverPluginHtml'
import { proxyPlugin } from './serverPluginProxy'
import { createCertificate } from '../utils/createCertificate'
import { cachedRead } from '../utils'
import { envPlugin } from './serverPluginEnv'
export { rewriteImports } from './serverPluginModuleRewrite'
import { sourceMapPlugin, SourceMap } from './serverPluginSourceMap'
import { webWorkerPlugin } from './serverPluginWebWorker'
import { wasmPlugin } from './serverPluginWasm'
import { clientPlugin } from './serverPluginClient'

export type ServerPlugin = (ctx: ServerPluginContext) => void

export interface ServerPluginContext {
  root: string
  app: Koa<State, Context>
  server: Server
  watcher: HMRWatcher
  resolver: InternalResolver
  config: ServerConfig & { __path?: string }
  port: number
}

export interface State extends DefaultState {}

export type Context = DefaultContext &
  ServerPluginContext & {
    read: (filePath: string) => Promise<Buffer | string>
    map?: SourceMap | null
  }

export function createServer(config: ServerConfig): Server {
  const {
    root = process.cwd(),
    configureServer = [],
    resolvers = [],
    alias = {},
    transforms = [],
    vueCustomBlockTransforms = {},
    optimizeDeps = {},
    enableEsbuild = true
  } = config

  const app = new Koa<State, Context>()
  const server = resolveServer(config, app.callback())

  // chokidar.watch   chokidar 包的作用就是监听文件变化
  // chokidar.watch(paths, [options]) 返回一个 chokidar 构造监听实例
  // chokidar 构造监听实例的 on 事件
  //   - add 新增文件时触发
  //   - addDir 新增文件夹的时候触发
  //   - unlink 对应的文件的删除
  //   - unlinkDir 对应的文件夹的删除
  //   - change 文件内容改变时触发
  const watcher = chokidar.watch(root, {
    ignored: [/\bnode_modules\b/, /\b\.git\b/]
  }) as HMRWatcher
  const resolver = createResolver(root, resolvers, alias)

  const context: ServerPluginContext = {
    root,
    app,
    server,
    watcher,
    resolver,
    config,
    // port is exposed on the context for hmr client connection
    // in case the files are served under a different port
    port: config.port || 3000
  }

  // attach server context to koa context
  app.use((ctx, next) => {
    Object.assign(ctx, context)
    ctx.read = cachedRead.bind(null, ctx)
    return next()
  })

  const resolvedPlugins = [
    // rewrite and source map plugins take highest priority and should be run
    // after all other middlewares have finished
    sourceMapPlugin,
    moduleRewritePlugin, // 对 js 文件 或者 src='xx.js' 这种方式引入的 js 文件重写
    htmlRewritePlugin, // 重写 index.html, 主要是插入 client.js
    // user plugins
    ...(Array.isArray(configureServer) ? configureServer : [configureServer]),
    envPlugin,
    moduleResolvePlugin, // 解析文件路径
    proxyPlugin,
    clientPlugin, // 拦截 client.js 返回给客户端，然客户端开启 socket
    hmrPlugin, // 启动服务端的 socket
    ...(transforms.length || Object.keys(vueCustomBlockTransforms).length
      ? [
          createServerTransformPlugin(
            transforms,
            vueCustomBlockTransforms,
            resolver
          )
        ]
      : []),
    vuePlugin, // 重写 vue 文件，拆分为三大块
    cssPlugin, // 处理 css 文件
    enableEsbuild ? esbuildPlugin : null,
    jsonPlugin,
    assetPathPlugin,
    webWorkerPlugin,
    wasmPlugin,
    serveStaticPlugin
  ]
  // 拿出来逐个执行
  resolvedPlugins.forEach((m) => m && m(context))

  const listen = server.listen.bind(server)
  // 监听端口
  server.listen = (async (port: number, ...args: any[]) => {
    if (optimizeDeps.auto !== false) {
      await require('../optimizer').optimizeDeps(config)
    }
    context.port = port
    return listen(port, ...args)
  }) as any

  return server
}

function resolveServer(
  { https = false, httpsOptions = {}, proxy }: ServerConfig,
  requestListener: RequestListener
) {
  if (https) {
    if (proxy) {
      // #484 fallback to http1 when proxy is needed.
      return require('https').createServer(
        resolveHttpsConfig(httpsOptions),
        requestListener
      )
    } else {
      return require('http2').createSecureServer(
        {
          ...resolveHttpsConfig(httpsOptions),
          allowHTTP1: true
        },
        requestListener
      )
    }
  } else {
    return require('http').createServer(requestListener)
  }
}

function resolveHttpsConfig(httpsOption: ServerOptions) {
  const { ca, cert, key, pfx } = httpsOption
  Object.assign(httpsOption, {
    ca: readFileIfExists(ca),
    cert: readFileIfExists(cert),
    key: readFileIfExists(key),
    pfx: readFileIfExists(pfx)
  })
  if (!httpsOption.key || !httpsOption.cert) {
    httpsOption.cert = httpsOption.key = createCertificate()
  }
  return httpsOption
}

function readFileIfExists(value?: string | Buffer | any) {
  if (value && !Buffer.isBuffer(value)) {
    try {
      return fs.readFileSync(path.resolve(value as string))
    } catch (e) {
      return value
    }
  }
  return value
}
