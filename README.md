# vite 源码阅读

基于 vite@4.5.14 版本



## 调试 vite

需要将 vite下载下来，开启 sourcemap，并 build 构建出产物 dist，然后替换调试项目的 node_modules/vite/dist。具体参考：https://juejin.cn/book/7070324244772716556/section/7159194044663332872



首先，查看 vite

```js
"bin": {
  "vite": "bin/vite.js"
},
```



可以看到，vite 命令在 `bin/vite.js` 下



进入 `vite-debug/node_modules/vite/bin/vite.js` 下，主要使用 start 函数，启动打包：

```js
function start() {
  return import('../dist/node/cli.js')
}

start()
```



start 函数主要是引入了 `../dist/node/cli.js` 文件，进入这里文件，可以看到定义了一堆 Command 命令



如果是 dev 方式启动，那么找到：

```js
cli
    .command('[root]', 'start dev server') // default command
    .alias('serve') // the command is called 'serve' in Vite's API
    .alias('dev') // alias to align with the script name
    .option('--host [host]', `[string] specify hostname`, { type: [convertHost] })
    .option('--port <port>', `[number] specify port`)
    .option('--https', `[boolean] use TLS + HTTP/2`)
    .option('--open [path]', `[boolean | string] open browser on startup`)
    .option('--cors', `[boolean] enable CORS`)
    .option('--strictPort', `[boolean] exit if specified port is already in use`)
    .option('--force', `[boolean] force the optimizer to ignore the cache and re-bundle`)
    .action(async (root, options) => {
        filterDuplicateOptions(options);

        const { createServer } = await import('./chunks/dep-827b23df.js').then(function (n) { return n.J; });
        try {
            const server = await createServer({
                root,
                base: options.base,
                mode: options.mode,
                configFile: options.config,
                logLevel: options.logLevel,
                clearScreen: options.clearScreen,
                optimizeDeps: { force: options.force },
                server: cleanOptions(options),
            });

        }
        catch (e) {

        }
});
```

在这里面打断点即可



如果是 build 命令，找到：

```js
cli
    .command('build [root]', 'build for production')
    .option('--target <target>', `[string] transpile target (default: 'modules')`)
    .option('--outDir <dir>', `[string] output directory (default: dist)`)
    .option('--assetsDir <dir>', `[string] directory under outDir to place assets in (default: assets)`)
    .option('--assetsInlineLimit <number>', `[number] static asset base64 inline threshold in bytes (default: 4096)`)
    .option('--ssr [entry]', `[string] build specified entry for server-side rendering`)
    .option('--sourcemap [output]', `[boolean | "inline" | "hidden"] output source maps for build (default: false)`)
    .option('--minify [minifier]', `[boolean | "terser" | "esbuild"] enable/disable minification, ` +
    `or specify minifier to use (default: esbuild)`)
    .option('--manifest [name]', `[boolean | string] emit build manifest json`)
    .option('--ssrManifest [name]', `[boolean | string] emit ssr manifest json`)
    .option('--force', `[boolean] force the optimizer to ignore the cache and re-bundle (experimental)`)
    .option('--emptyOutDir', `[boolean] force empty outDir when it's outside of root`)
    .option('-w, --watch', `[boolean] rebuilds when modules have changed on disk`)
    .action(async (root, options) => {

        filterDuplicateOptions(options);
        const { build } = await import('./chunks/dep-827b23df.js').then(function (n) { return n.I; });
        const buildOptions = cleanOptions(options);
        try {
            await build({
                root,
                base: options.base,
                mode: options.mode,
                configFile: options.config,
                logLevel: options.logLevel,
                clearScreen: options.clearScreen,
                optimizeDeps: { force: options.force },
                build: buildOptions,
            });
        }
        catch (e) {
            createLogger(options.logLevel).error(colors.red(`error during build:\n${e.stack}`), { error: e });
            process.exit(1);
        }
        finally {
            stopProfiler((message) => createLogger(options.logLevel).info(message));
        }
});
```

在这里面打断点即可



## 目录结构

```text
vite-source-code
├── vite                         // vite 源码
├── vite-debug                   // 调试 vite 源码的项目
│   ├── src
│   │   ├── App.tsx
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── vite.config.js
├── .gitignore
└── readme.md
```



## Vite 源码



### createServer

`createServer` 是 Vite 的核心，它整合了配置解析、插件系统、模块转换、HMR、文件监听等所有开发时需要的功能，为开发提供了快速、高效的开发服务器。



#### npm run dev 启动



在 package.json 文件中：

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
  "preview": "vite preview"
},
```



当执行 `npm run dev` 命令时，会执行 vite。这个 vite 会执行 `vite/packages/vite/src/node/cli.ts` 下

```js
// dev
cli
  .command('[root]', 'start dev server') // default command
  .alias('serve') // the command is called 'serve' in Vite's API
  .alias('dev') // alias to align with the script name
  .option('--host [host]', `[string] specify hostname`, { type: [convertHost] })
  .option('--port <port>', `[number] specify port`)
  .option('--https', `[boolean] use TLS + HTTP/2`)
  .option('--open [path]', `[boolean | string] open browser on startup`)
  .option('--cors', `[boolean] enable CORS`)
  .option('--strictPort', `[boolean] exit if specified port is already in use`)
  .option(
    '--force',
    `[boolean] force the optimizer to ignore the cache and re-bundle`,
  )
  .action(async (root: string, options: ServerOptions & GlobalCLIOptions) => {
    	filterDuplicateOptions(options)

      const { createServer } = await import('./server')
      try {

        // 通过 createServer 创建一个 server 对象
        const server = await createServer({
          root,
          base: options.base,
          mode: options.mode,
          configFile: options.config,
          logLevel: options.logLevel,
          clearScreen: options.clearScreen,
          optimizeDeps: { force: options.force },
          // 执行 createServer 之前，先执行了 cleanOptions 函数，规范化用户的命令输入
          server: cleanOptions(options),
        })

    } catch (e) {
      // ...
    }
  })
```



可以看到，通过 createServer 创建一个 server 对象。



#### createServer 逻辑

>  vite/packages/vite/src/node/server/index.ts

```js 
export function createServer(inlineConfig = {}) {
    return _createServer(inlineConfig, { ws: true });
}


export async function _createServer(
  inlineConfig: InlineConfig = {},
  options: { ws: boolean },
): Promise<ViteDevServer> {
  // ...
}
```

整个 createServer 的逻辑集中在了 _createServer 函数中



**_createServer 函数解释：**

>  vite/packages/vite/src/node/server/index.ts

```js
export async function _createServer(
  inlineConfig: InlineConfig = {},
  options: { ws: boolean },
): Promise<ViteDevServer> {
  //  解析和标准化用户配置，将命令行参数、配置文件（vite.config.js）和默认配置合并为统一的 ResolvedConfig 对象
  const config = await resolveConfig(inlineConfig, 'serve')

  const { root, server: serverConfig } = config

  // resolveHttpsConfig 处理是否开启 https
  // 如果开启了 https，会加载证书（支持自定义或自动生成）
  const httpsOptions = await resolveHttpsConfig(config.server.https)

  // middlewareMode：以中间件模式创建 Vite 服务器
  // 主要用于与后端服务集成、ssr 等
  const { middlewareMode } = serverConfig

  const resolvedWatchOptions = resolveChokidarOptions(config, {
    disableGlobbing: true,
    ...serverConfig.watch,
  })

  // connect 是一个中间件框架，Express 的中间件就是基于 connect 的
  // const app = connect();
  // app.use((req, res, next) => {
  //   console.log(`${req.method} ${req.url}`);
  //   next();
  // })
  const middlewares = connect() as Connect.Server

  // resolveHttpServer 用于 ​​创建和配置 HTTP/HTTPS 服务器实例​​ 的核心函数
  // 根据用户配置（server.https 和 server.proxy 等）生成一个可用的 Node.js HTTP 或 HTTPS、HTTP2 服务器
  const httpServer = middlewareMode
    ? null
    : await resolveHttpServer(serverConfig, middlewares, httpsOptions)

  // 创建一个 websocket 服务器（与 HMR 模块热更新相关）
  const ws = createWebSocketServer(httpServer, config, httpsOptions)

  if (httpServer) {
    setClientErrorHandler(httpServer, config.logger)
  }

  // chokidar 是一个文件监听库，用于监听文件变化
  const watcher = chokidar.watch(
    // config file dependencies and env file might be outside of root
    [root, ...config.configFileDependencies, config.envDir],
    resolvedWatchOptions,
  ) as FSWatcher

  // 创建一个模块依赖图（记录模块之间的关系）
  const moduleGraph: ModuleGraph = new ModuleGraph((url, ssr) =>
    container.resolveId(url, undefined, { ssr }),
  )

  // 创建一个 pluginContainer
  // 开发环境中，Vite 模拟了 Rollup 的插件机制，设计了一个 PluginContainer 对象来调度各个插件
  const container = await createPluginContainer(config, moduleGraph, watcher)

  // 创建一个关闭 http 服务器的函数
  const closeHttpServer = createServerCloseFn(httpServer)

  let exitProcess: () => void

  // 创建一个 server 对象
  const server: ViteDevServer = {
    config,
    middlewares,
    httpServer,
    watcher,
    pluginContainer: container,
    ws,
    moduleGraph,
    resolvedUrls: null, // will be set on listen
    ssrTransform(
      code: string,
      inMap: SourceMap | null,
      url: string,
      originalCode = code,
    ) {
      return ssrTransform(code, inMap, url, originalCode, server.config)
    },
    transformRequest(url, options) {
      return transformRequest(url, server, options)
    },
    transformIndexHtml: null!, // to be immediately set
    async ssrLoadModule(url, opts?: { fixStacktrace?: boolean }) {
      if (isDepsOptimizerEnabled(config, true)) {
        await initDevSsrDepsOptimizer(config, server)
      }
      if (config.legacy?.buildSsrCjsExternalHeuristics) {
        await updateCjsSsrExternals(server)
      }
      return ssrLoadModule(
        url,
        server,
        undefined,
        undefined,
        opts?.fixStacktrace,
      )
    },
    ssrFixStacktrace(e) {
      ssrFixStacktrace(e, moduleGraph)
    },
    ssrRewriteStacktrace(stack: string) {
      return ssrRewriteStacktrace(stack, moduleGraph)
    },
    async reloadModule(module) {
      if (serverConfig.hmr !== false && module.file) {
        updateModules(module.file, [module], Date.now(), server)
      }
    },
    // 启动 http 服务
    async listen(port?: number, isRestart?: boolean) {
      await startServer(server, port)
      if (httpServer) {
        server.resolvedUrls = await resolveServerUrls(
          httpServer,
          config.server,
          config,
        )
        if (!isRestart && config.server.open) server.openBrowser()
      }
      return server
    },
    // 自动打开浏览器
    openBrowser() {
      const options = server.config.server
      const url =
        server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0]
      if (url) {
        const path =
          typeof options.open === 'string'
            ? new URL(options.open, url).href
            : url

        _openBrowser(path, true, server.config.logger)
      } else {
        server.config.logger.warn('No URL available to open in browser')
      }
    },
    async close() {
      if (!middlewareMode) {
        process.off('SIGTERM', exitProcess)
        if (process.env.CI !== 'true') {
          process.stdin.off('end', exitProcess)
        }
      }
      await Promise.allSettled([
        watcher.close(),
        ws.close(),
        container.close(),
        getDepsOptimizer(server.config)?.close(),
        getDepsOptimizer(server.config, true)?.close(),
        closeHttpServer(),
      ])

      while (server._pendingRequests.size > 0) {
        await Promise.allSettled(
          [...server._pendingRequests.values()].map(
            (pending) => pending.request,
          ),
        )
      }
      server.resolvedUrls = null
    },
    printUrls() {
      if (server.resolvedUrls) {
        printServerUrls(
          server.resolvedUrls,
          serverConfig.host,
          config.logger.info,
        )
      } else if (middlewareMode) {
        throw new Error('cannot print server URLs in middleware mode.')
      } else {
        throw new Error(
          'cannot print server URLs before server.listen is called.',
        )
      }
    },
    async restart(forceOptimize?: boolean) {
      if (!server._restartPromise) {
        server._forceOptimizeOnRestart = !!forceOptimize
        server._restartPromise = restartServer(server).finally(() => {
          server._restartPromise = null
          server._forceOptimizeOnRestart = false
        })
      }
      return server._restartPromise
    },

    _ssrExternals: null,
    _restartPromise: null,
    _importGlobMap: new Map(),
    _forceOptimizeOnRestart: false,
    _pendingRequests: new Map(),
    _fsDenyGlob: picomatch(
      config.server.fs.deny.map((pattern) =>
        pattern.includes('/') ? pattern : `**/${pattern}`,
      ),
      {
        matchBase: false,
        nocase: true,
        dot: true,
      },
    ),
    _shortcutsOptions: undefined,
  }

  // 插件如果使用了这个钩子，会在这里出发
  server.transformIndexHtml = createDevHtmlTransformFn(server)

  if (!middlewareMode) {
    exitProcess = async () => {
      try {
        await server.close()
      } finally {
        process.exit()
      }
    }
    process.once('SIGTERM', exitProcess)
    if (process.env.CI !== 'true') {
      process.stdin.on('end', exitProcess)
    }
  }

  // 触发 HMR 更新
  const onHMRUpdate = async (file: string, configOnly: boolean) => {
    if (serverConfig.hmr !== false) {
      try {
        await handleHMRUpdate(file, server, configOnly)
      } catch (err) {
        ws.send({
          type: 'error',
          err: prepareError(err),
        })
      }
    }
  }

  const onFileAddUnlink = async (file: string) => {
    file = normalizePath(file)
    await handleFileAddUnlink(file, server)
    await onHMRUpdate(file, true)
  }

  // 监听文件变化
  watcher.on('change', async (file) => {
    file = normalizePath(file)
    // invalidate module graph cache on file change
    moduleGraph.onFileChange(file)

    // 触发 HMR 更新
    await onHMRUpdate(file, false)
  })

  // 监听文件添加
  watcher.on('add', onFileAddUnlink)
  // 监听文件删除
  watcher.on('unlink', onFileAddUnlink)

  // 通过 vite:invalidate 事件通知浏览器，哪些模块需要失效
  ws.on('vite:invalidate', async ({ path, message }: InvalidatePayload) => {
    const mod = moduleGraph.urlToModuleMap.get(path)
    if (mod && mod.isSelfAccepting && mod.lastHMRTimestamp > 0) {
      config.logger.info(
        colors.yellow(`hmr invalidate `) +
          colors.dim(path) +
          (message ? ` ${message}` : ''),
        { timestamp: true },
      )
      const file = getShortName(mod.file!, config.root)
      updateModules(
        file,
        [...mod.importers],
        mod.lastHMRTimestamp,
        server,
        true,
      )
    }
  })

  if (!middlewareMode && httpServer) {
    httpServer.once('listening', () => {
      // update actual port since this may be different from initial value
      serverConfig.port = (httpServer.address() as net.AddressInfo).port
    })
  }

  /**
   * config.getSortedPluginHooks('configureServer')： 获取所有插件中注册的 configureServer 钩子函数，按插件顺序排序（遵循 Vite 的插件顺序规则，如 pre/normal/post 阶段）
   * 
   * hook(server)： 执行插件中的 configureServer 钩子函数
   * 
   * postHooks.push：收集钩子函数可能返回的清理函数（() => void）。如果钩子未返回内容（void），则忽略
   *  - 每个 configureServer 钩子可以返回一个函数（也可以不返回）
   *  - 返回的函数会被收集到 postHooks 数组中
   *  - 这些函数会在服务器中间件安装完成后执行
   */
  const postHooks: ((() => void) | void)[] = []
  for (const hook of config.getSortedPluginHooks('configureServer')) {
    postHooks.push(await hook(server))
  }

  // Internal middlewares ------------------------------------------------------
  // 这后面就是使用中间件，处理请求
  // vite 从 <script type="module" src="/src/main.tsx"></script> 这个入口开始解析
  // 每当有一个 import，就有一个请求，下面的中间件就是处理这些请求的

  // request timer
  if (process.env.DEBUG) {
    middlewares.use(timeMiddleware(root))
  }

  // disallows request that contains `#` in the URL
  middlewares.use(rejectInvalidRequestMiddleware())

  // 处理 cors
  const { cors } = serverConfig
  if (cors !== false) {
    middlewares.use(
      corsMiddleware(
        typeof cors === 'boolean'
          ? {}
          : cors ?? { origin: defaultAllowedOrigins },
      ),
    )
  }

  const { allowedHosts } = serverConfig
  if (allowedHosts !== true && !serverConfig.https) {
    middlewares.use(hostCheckMiddleware(config, false))
  }

  // proxy
  const { proxy } = serverConfig
  if (proxy) {
    middlewares.use(proxyMiddleware(httpServer, proxy, config))
  }

  // base
  if (config.base !== '/') {
    middlewares.use(baseMiddleware(server))
  }

  // open in editor support
  middlewares.use('/__open-in-editor', launchEditorMiddleware())

  // ping request handler
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  middlewares.use(function viteHMRPingMiddleware(req, res, next) {
    if (req.headers['accept'] === 'text/x-vite-ping') {
      res.writeHead(204).end()
    } else {
      next()
    }
  })

  // 处理 public 目录下的静态文件
  if (config.publicDir) {
    middlewares.use(
      servePublicMiddleware(config.publicDir, server, config.server.headers),
    )
  }

  // main transform middleware
  // 对模块进行编译
  middlewares.use(transformMiddleware(server))

  // serve static files
  middlewares.use(serveRawFsMiddleware(server))
  middlewares.use(serveStaticMiddleware(root, server))

  // html fallback
  if (config.appType === 'spa' || config.appType === 'mpa') {
    middlewares.use(htmlFallbackMiddleware(root, config.appType === 'spa'))
  }

  // 执行上面收集到的 configureServer 钩子函数返回的回调函数
  postHooks.forEach((fn) => fn && fn())

  // spa 或 mpa 应用
  if (config.appType === 'spa' || config.appType === 'mpa') {
    // transform index.html
    middlewares.use(indexHtmlMiddleware(server))

    // 处理路由刷新 404 问题
    middlewares.use(function vite404Middleware(_, res) {
      res.statusCode = 404
      res.end()
    })
  }

  // error handler
  middlewares.use(errorMiddleware(server, middlewareMode))

  // 通过 serverInited 和 initingServer 两个标志位，避免并发调用导致的重复初始化
  let initingServer: Promise<void> | undefined
  let serverInited = false
  const initServer = async () => {
    // 如果服务器已经初始化，则返回
    if (serverInited) return
    // 如果服务器正在初始化，则返回正在初始化的 Promise
    if (initingServer) return initingServer

    initingServer = (async function () {
      // 执行插件的 buildStart 钩子
      await container.buildStart({})
      // start deps optimizer after all container plugins are ready
      if (isDepsOptimizerEnabled(config, false)) {
        // 依赖预构建：如果启用了依赖预构建，调用 initDepsOptimizer 预编译 node_modules 中的依赖
        await initDepsOptimizer(config, server)
      }
      initingServer = undefined
      serverInited = true
    })()
    return initingServer
  }

  if (!middlewareMode && httpServer) {
    const listen = httpServer.listen.bind(httpServer)
    // 当浏览器访问开发服务器时，Vite 在响应请求前会调用 httpServer.listen 方法
    httpServer.listen = (async (port: number, ...args: any[]) => {
      try {
        // ensure ws server started
        // 开启 websocket 服务
        ws.listen()
        await initServer()
      } catch (e) {
        httpServer.emit('error', e)
        return
      }
      return listen(port, ...args)
    }) as any
  } else {
    if (options.ws) {
      ws.listen()
    }
    await initServer()
  }

  // 将创建的 server 对象返回
  return server
}
```



_createServer 函数流程：

1. 通过 resolveConfig 结合用户输入的命令，以及 vite.config.js 和默认配置，生成一个 config 对象

2. 通过 resolveHttpsConfig 处理配置是否开启 https

3. 通过 connect 创建中间件

   - connect 是一个中间件框架，Express 的中间件就是基于 connect 的。基本使用

     ```js
     const app = connect();
     
     app.use((req, res, next) => {
       console.log(`${req.method} ${req.url}`);
       next();
     })
     ```

4. resolveHttpServer 根据场景，创建服务器

   - 没有开启 https，那么使用 http 创建一个服务器
   - 开启了 https，使用 http2 创建一个服务器
   - 开启了 https，同时开启了 proxy，回退使用 https 创建一个服务器

5. 通过 createWebSocketServer 创建一个 websocket 服务器（与 HMR 相关）

6. 通过 chokidar.watch 创建文件变化监听器

   - chokidar 是一个文件监听库，用于监听文件变化

7. 通过 new ModuleGraph 创建模块依赖图，记录模块之间的关系

8. 通过 createPluginContainer 创建 pluginContainer

   - 开发环境中，Vite 模拟了 Rollup 的插件机制，设计了一个 PluginContainer 对象来调度各个插件

9. 创建 server 对象，包含以下属性：

   ```js
   const server: ViteDevServer = {
     config,
     middlewares,
     httpServer,
     watcher,
     pluginContainer: container,
     ws,
     moduleGraph,
     resolvedUrls: null, // will be set on listen
     ssrTransform(
       code: string,
       inMap: SourceMap | null,
       url: string,
       originalCode = code,
     ) {
       return ssrTransform(code, inMap, url, originalCode, server.config)
     },
     transformRequest(url, options) {
       return transformRequest(url, server, options)
     },
     transformIndexHtml: null!, // to be immediately set
     async ssrLoadModule(url, opts?: { fixStacktrace?: boolean }) {
   
     },
     ssrFixStacktrace(e) {
       ssrFixStacktrace(e, moduleGraph)
     },
     ssrRewriteStacktrace(stack: string) {
       return ssrRewriteStacktrace(stack, moduleGraph)
     },
     async reloadModule(module) {
   
     },
     // 启动 http 服务
     async listen(port?: number, isRestart?: boolean) {
   
     },
     // 自动打开浏览器
     openBrowser() {
   
     },
     async close() {
   
     },
     printUrls() {
   
     },
     async restart(forceOptimize?: boolean) {
   
     },
   }
   ```

10. 通过 `watcher.on('change'`、`watcher.on('add'`、`watcher.on('unlink'` 监听文件变化，更新依赖图，触发 HMR 更新

11. 处理插件的 configureServer 钩子

    ```js
    /**
     * config.getSortedPluginHooks('configureServer')： 获取所有插件中注册的 configureServer 钩子函数，按插件顺序排序（遵循 Vite 的插件顺序规则，如 pre/normal/post 阶段）
     * 
     * hook(server)： 执行插件中的 configureServer 钩子函数
     * 
     * postHooks.push：收集钩子函数可能返回的回调函数。如果钩子未返回内容（void），则忽略
     *  - 每个 configureServer 钩子可以返回一个函数（也可以不返回）
     *  - 返回的函数会被收集到 postHooks 数组中
     *  - 这些函数会在服务器中间件安装完成后执行
     */
    const postHooks: ((() => void) | void)[] = []
    for (const hook of config.getSortedPluginHooks('configureServer')) {
      postHooks.push(await hook(server))
    }
    ```

12. 后面就是各种 middlewares.use，这后面就是使用中间件，处理请求。

    - vite 从`<script type="module" src="/src/main.tsx"></script>` 这个入口开始解析
    - 每当有一个 import，就有一个请求，下面的中间件就是处理这些请求的
    - 比如：middlewares.use(transformMiddleware(server)) 这个会对模块进行编译

13. 最后，通过 httpServer.listen 启动服务器监听

    - 当浏览器访问开发服务器时，vite 便会调用监听函数
    - 监听函数主要做的事：
      - 开启 ws 服务
      - 执行插件 buildStart 钩子
      - 如果开启了依赖与构建，调用 initDepsOptimizer 预构建第三方模块



#### createServer 总结

| **功能模块**   | **作用**                                                     |
| -------------- | ------------------------------------------------------------ |
| 合并配置       | 将命令行参数、配置文件（vite.config.js）和默认配置合并为统一的配置 |
| 服务器实例化   | 创建 HTTP/HTTPS 服务器，支持 HTTP/2 和代理配置               |
| 模块依赖图     | 构建 `ModuleGraph` 管理模块间的依赖关系，实现精准 HMR        |
| 插件系统初始化 | 加载并排序插件，执行 `configureServer` 等钩子                |
| 中间件流水线   | 挂载代码转换、静态资源服务、代理等中间件                     |
| WebSocket 服务 | 建立 HMR 通信通道，实现浏览器与服务器的实时交互              |
| 文件监听       | 通过 `chokidar` 监听文件变动，触发模块重编译和热更新         |
| 依赖预构建     | 预编译 node_modules 中的依赖                                 |



### resolveConfig

主要作用：解析和标准化用户配置，将命令行参数、配置文件（vite.config.js）和默认配置合并为统一的 ResolvedConfig 对象



#### resolveConfig 函数

> vite/packages/vite/src/node/config.ts

```js
export async function resolveConfig(
  inlineConfig: InlineConfig, // 命令行配置
  command: 'build' | 'serve',
  defaultMode = 'development',
  defaultNodeEnv = 'development',
): Promise<ResolvedConfig> {
  // ! 命令行配置
  let config = inlineConfig
  let configFileDependencies: string[] = []
  let mode = inlineConfig.mode || defaultMode

  // ! 判断是否设置了 NODE_ENV
  const isNodeEnvSet = !!process.env.NODE_ENV
  const packageCache: PackageCache = new Map()

  // ! 没有设置 NODE_ENV 时，设置为默认环境
  if (!isNodeEnvSet) {
    process.env.NODE_ENV = defaultNodeEnv
  }

  const configEnv = {
    mode,
    command,
    ssrBuild: !!config.build?.ssr,
  }

  let { configFile } = config
  if (configFile !== false) {
    // ! 加载 vite.config.js 配置文件
    const loadResult = await loadConfigFromFile(
      configEnv,
      configFile,
      config.root,
      config.logLevel,
    )

    if (loadResult) {
      // ! 合并命令行配置和 vite.config.js 配置
      config = mergeConfig(loadResult.config, config)
      configFile = loadResult.path
      configFileDependencies = loadResult.dependencies
    }
  }

  // ! 命令行的 mode 优先级高于 vite.config.js 的 mode
  mode = inlineConfig.mode || config.mode || mode
  configEnv.mode = mode

  const filterPlugin = (p: Plugin) => {
    if (!p) {
      return false
    } else if (!p.apply) {
      return true
    } else if (typeof p.apply === 'function') {
      return p.apply({ ...config, mode }, configEnv)
    } else {
      return p.apply === command
    }
  }

  // ! 从配置中提取并过滤出适用于 Worker 环境的插件列表。明确区分 Worker 和主线程的插件
  const rawWorkerUserPlugins = (
    (await asyncFlatten(config.worker?.plugins || [])) as Plugin[]
  ).filter(filterPlugin)

  // resolve plugins
  // ! 将配置的插件（config.plugins）进行​​扁平化、过滤无效项​​，最终生成一个纯净的插件数组
  // 可能是 plugins = [ plugin1, [plugin2] ]
  const rawUserPlugins = (
    (await asyncFlatten(config.plugins || [])) as Plugin[]
  ).filter(filterPlugin)

  // ! sortUserPlugins 会根据 enforce 属性，将插件分为 pre、normal、post 三类
  const [prePlugins, normalPlugins, postPlugins] =
    sortUserPlugins(rawUserPlugins)

  // ! 将 pre、normal、post 三类插件合并为一个数组，这样就实现了排序
  // 插件执行顺序：prePlugins -> normalPlugins -> postPlugins
  const userPlugins = [...prePlugins, ...normalPlugins, ...postPlugins]

  // ! 执行所有插件的 config 钩子
  config = await runConfigHook(config, userPlugins, configEnv)

  if (
    !config.build?.commonjsOptions &&
    process.env.VITE_TEST_WITHOUT_PLUGIN_COMMONJS
  ) {
    config = mergeConfig(config, {
      optimizeDeps: { disabled: false },
      ssr: { optimizeDeps: { disabled: false } },
    })
    config.build ??= {}
    config.build.commonjsOptions = { include: [] }
  }

  // Define logger
  const logger = createLogger(config.logLevel, {
    allowClearScreen: config.clearScreen,
    customLogger: config.customLogger,
  })

  // resolve root
  const resolvedRoot = normalizePath(
    config.root ? path.resolve(config.root) : process.cwd(),
  )

  // ! 默认的 alias
  const clientAlias = [
    {
      find: /^\/?@vite\/env/,
      replacement: path.posix.join(FS_PREFIX, normalizePath(ENV_ENTRY)),
    },
    {
      find: /^\/?@vite\/client/,
      replacement: path.posix.join(FS_PREFIX, normalizePath(CLIENT_ENTRY)),
    },
  ]

  // resolve alias with internal client alias
  // ! 将 vite.config.js 的 alias 和 默认的 alias 合并
  const resolvedAlias = normalizeAlias(
    mergeAlias(clientAlias, config.resolve?.alias || []),
  )

  // ! Vite 中模块解析配置对象的初始化，它定义了 Vite 如何解析和查找模块文件
  const resolveOptions: ResolvedConfig['resolve'] = {
    mainFields: config.resolve?.mainFields ?? DEFAULT_MAIN_FIELDS,
    browserField: config.resolve?.browserField ?? true,
    conditions: config.resolve?.conditions ?? [],
    extensions: config.resolve?.extensions ?? DEFAULT_EXTENSIONS,
    dedupe: config.resolve?.dedupe ?? [],
    preserveSymlinks: config.resolve?.preserveSymlinks ?? false,
    alias: resolvedAlias,
  }

  // load .env files
  // ! 加载对应的 .env 文件
  const envDir = config.envDir
    ? normalizePath(path.resolve(resolvedRoot, config.envDir))
    : resolvedRoot
  const userEnv =
    inlineConfig.envFile !== false &&
    loadEnv(mode, envDir, resolveEnvPrefix(config))

  const userNodeEnv = process.env.VITE_USER_NODE_ENV
  if (!isNodeEnvSet && userNodeEnv) {
    if (userNodeEnv === 'development') {
      process.env.NODE_ENV = 'development'
    } else {
      // NODE_ENV=production is not supported as it could break HMR in dev for frameworks like Vue
      logger.warn(
        `NODE_ENV=${userNodeEnv} is not supported in the .env file. ` +
          `Only NODE_ENV=development is supported to create a development build of your project. ` +
          `If you need to set process.env.NODE_ENV, you can set it in the Vite config instead.`,
      )
    }
  }

  // ! 判断是否是生产环境
  const isProduction = process.env.NODE_ENV === 'production'

  // resolve public base url
  const isBuild = command === 'build'
  const relativeBaseShortcut = config.base === '' || config.base === './'

  // During dev, we ignore relative base and fallback to '/'
  // For the SSR build, relative base isn't possible by means
  // of import.meta.url.
  // ! 处理 base
  const resolvedBase = relativeBaseShortcut
    ? !isBuild || config.build?.ssr
      ? '/'
      : './'
    : resolveBaseUrl(config.base, isBuild, logger) ?? '/'

  /**
   * ! 通过 resolveBuildOptions 生成一个构建配置对象(config.build)
   * 
   * build: {
   *   assetsInlineLimit: 8 *1024,
   *   rollupOptions: {
   *     output: {
   *       manualChunks: {
   *         'react-vendor': ['react', 'react-dom']
   *     }
   *   }
   * }
  }
   */
  const resolvedBuildOptions = resolveBuildOptions(
    config.build,
    logger,
    resolvedRoot,
  )

  // resolve cache directory
  // ! 设置缓存目录。如果有设置 config.cacheDir，使用设置的，没有，使用默认的 node_modules/.vite
  const pkgDir = findNearestPackageData(resolvedRoot, packageCache)?.dir
  const cacheDir = normalizePath(
    config.cacheDir
      ? path.resolve(resolvedRoot, config.cacheDir)
      : pkgDir
      ? path.join(pkgDir, `node_modules/.vite`)
      : path.join(resolvedRoot, `.vite`),
  )

  // ! 处理 assetsInclude
  // ! assetsInclude 作用：配置 vite 可以额外解析哪些静态文件（vite有默认支持的文件类型）
  const assetsFilter =
    config.assetsInclude &&
    (!Array.isArray(config.assetsInclude) || config.assetsInclude.length)
      ? createFilter(config.assetsInclude)
      : () => false

  // ! 用于创建内部模块解析器，主要用于特殊场景如依赖优化和处理 CSS @imports
  const createResolver: ResolvedConfig['createResolver'] = (options) => {
    let aliasContainer: PluginContainer | undefined
    let resolverContainer: PluginContainer | undefined
    return async (id, importer, aliasOnly, ssr) => {
      let container: PluginContainer
      if (aliasOnly) {
        container =
          aliasContainer ||
          (aliasContainer = await createPluginContainer({
            ...resolved,
            plugins: [aliasPlugin({ entries: resolved.resolve.alias })],
          }))
      } else {
        container =
          resolverContainer ||
          (resolverContainer = await createPluginContainer({
            ...resolved,
            plugins: [
              aliasPlugin({ entries: resolved.resolve.alias }),
              resolvePlugin({
                ...resolved.resolve,
                root: resolvedRoot,
                isProduction,
                isBuild: command === 'build',
                ssrConfig: resolved.ssr,
                asSrc: true,
                preferRelative: false,
                tryIndex: true,
                ...options,
                idOnly: true,
              }),
            ],
          }))
      }
      return (
        await container.resolveId(id, importer, {
          ssr,
          scan: options?.scan,
        })
      )?.id
    }
  }

  // ! 处理 config.publicDir，默认使用 public
  const { publicDir } = config
  const resolvedPublicDir =
    publicDir !== false && publicDir !== ''
      ? path.resolve(
          resolvedRoot,
          typeof publicDir === 'string' ? publicDir : 'public',
        )
      : ''

  const server = resolveServerOptions(resolvedRoot, config.server, logger)
  const ssr = resolveSSROptions(
    config.ssr,
    resolveOptions.preserveSymlinks,
    config.legacy?.buildSsrCjsExternalHeuristics,
  )

  const preview = resolvePreviewOptions(config.preview, server)

  const middlewareMode = config?.server?.middlewareMode

  const optimizeDeps = config.optimizeDeps || {}

  const BASE_URL = resolvedBase

  // ~ --------------------- 处理 workerPlugin start-----------------------
  // resolve worker
  let workerConfig = mergeConfig({}, config)
  const [workerPrePlugins, workerNormalPlugins, workerPostPlugins] =
    sortUserPlugins(rawWorkerUserPlugins)

  // run config hooks
  const workerUserPlugins = [
    ...workerPrePlugins,
    ...workerNormalPlugins,
    ...workerPostPlugins,
  ]
  // ! 执行 workerUserPlugin 的 config 钩子
  workerConfig = await runConfigHook(workerConfig, workerUserPlugins, configEnv)
  const resolvedWorkerOptions: ResolveWorkerOptions = {
    format: workerConfig.worker?.format || 'iife',
    plugins: [],
    rollupOptions: workerConfig.worker?.rollupOptions || {},
    getSortedPlugins: undefined!,
    getSortedPluginHooks: undefined!,
  }

  // ~ --------------------- 处理 workerPlugin end-----------------------


  // ! Vite 默认的已解析配置对象，包含了所有标准化和默认值处理后的配置项
  // ! 可以简单理解为 vite 的默认配置
  const resolvedConfig: ResolvedConfig = {
    configFile: configFile ? normalizePath(configFile) : undefined,
    configFileDependencies: configFileDependencies.map((name) =>
      normalizePath(path.resolve(name)),
    ),
    inlineConfig,
    root: resolvedRoot,
    base: withTrailingSlash(resolvedBase),
    rawBase: resolvedBase,
    resolve: resolveOptions,
    publicDir: resolvedPublicDir,
    cacheDir,
    command,
    mode,
    ssr,
    isWorker: false,
    mainConfig: null,
    isProduction,
    plugins: userPlugins,
    css: resolveCSSOptions(config.css),
    esbuild:
      config.esbuild === false
        ? false
        : {
            jsxDev: !isProduction,
            ...config.esbuild,
          },
    server,
    build: resolvedBuildOptions,
    preview,
    envDir,
    env: {
      ...userEnv,
      BASE_URL,
      MODE: mode,
      DEV: !isProduction,
      PROD: isProduction,
    },
    assetsInclude(file: string) {
      return DEFAULT_ASSETS_RE.test(file) || assetsFilter(file)
    },
    logger,
    packageCache,
    createResolver,
    optimizeDeps: {
      disabled: 'build',
      ...optimizeDeps,
      esbuildOptions: {
        preserveSymlinks: resolveOptions.preserveSymlinks,
        ...optimizeDeps.esbuildOptions,
      },
    },
    worker: resolvedWorkerOptions,
    appType: config.appType ?? (middlewareMode === 'ssr' ? 'custom' : 'spa'),
    experimental: {
      importGlobRestoreExtension: false,
      hmrPartialAccept: false,
      ...config.experimental,
    },
    webSocketToken: Buffer.from(
      crypto.randomFillSync(new Uint8Array(9)),
    ).toString('base64url'),
    additionalAllowedHosts: getAdditionalAllowedHosts(server, preview),
    getSortedPlugins: undefined!,
    getSortedPluginHooks: undefined!,
  }


  // ! 合并经过处理的 用户配置 和 vite 默认配置
  const resolved: ResolvedConfig = {
    ...config, // ! 用户配置（已部分处理）
    ...resolvedConfig, // ! 完全解析后的配置（优先级更高）
  }

  // ! 加载所有 vite 默认插件
  ;(resolved.plugins as Plugin[]) = await resolvePlugins(
    resolved,
    prePlugins,
    normalPlugins,
    postPlugins,
  )
  Object.assign(resolved, createPluginHookUtils(resolved.plugins))

  const workerResolved: ResolvedConfig = {
    ...workerConfig,
    ...resolvedConfig,
    isWorker: true,
    mainConfig: resolved,
  }
  resolvedConfig.worker.plugins = await resolvePlugins(
    workerResolved,
    workerPrePlugins,
    workerNormalPlugins,
    workerPostPlugins,
  )
  Object.assign(
    resolvedConfig.worker,
    createPluginHookUtils(resolvedConfig.worker.plugins),
  )

  // ! 执行插件的 configResolved 钩子
  await Promise.all([
    ...resolved
      .getSortedPluginHooks('configResolved')
      .map((hook) => hook(resolved)),
    ...resolvedConfig.worker
      .getSortedPluginHooks('configResolved')
      .map((hook) => hook(workerResolved)),
  ])

  // validate config
  // ~ ------------------ 后面都是一些检验，控制台告警
  
  // ...

  // ! 将最终配置返回
  return resolved
}
```



**resolveConfig 具体逻辑：**

1. 首先是对环境的判断，没有设置 NODE_ENV，那么设置为默认 `development`

2. 加载 vite.confog 配置文件
   - bundleConfigFile 使用 esbuild 将 vite.confog 编译成 js 文件（因为配置文件可能有多种格式，比如：.mjs、.mts、.cjs 等）
   - loadConfigFromBundledFile 读取编译后的配置文件的配置
   - 最后，合并用户配置（vite.config.js）和命令行配置
3. 解释用户插件
   - 分离普通插件和 Worker 环境的插件
   - 将插件按照 enforce（pre、normal、post）进行排序
   - 遍历执行所有插件的 config 钩子
4. 将用户配置的 alias 和 vite 默认的 alias 合并
5. 加载环境变量，加载处理对应的 .env 文件
6. 设置缓存目录。如果有设置 config.cacheDir，使用设置的，没有，使用默认的 node_modules/.vite
7. 处理 assetsInclude。assetsInclude 作用：配置 vite 可以额外解析哪些静态文件（vite有默认支持的文件类型）
8. 通过 createResolver 创建内部模块解析器，主要用于特殊场景如依赖优化和处理 CSS @imports
9. 处理 config.publicDir，默认使用 public
10. 合并经过处理的 用户配置 和 vite 默认配置为最终配置
11. 加载所有 vite 默认插件
12. 返回最终配置



#### resolveConfig 总结

| **步骤**       | **具体操作**                                                 |
| -------------- | ------------------------------------------------------------ |
| 加载配置文件   | 读取并编译配置文件为 js                                      |
| 路径标准化     | 将相对路径转为绝对路径（如 `root: './src'` → `root: '/project/src'`） |
| 解析用户插件   | 扁平化插件数组，按 `enforce` 排序（`pre` → `normal` → `post`），执行所有插件 config 钩子 |
| 加载环境变量   | 加载 `.env` 文件，填充 `import.meta.env`                     |
| 生成插件流水线 | 加载所有 vite 内置插件                                       |
| 合并最终配置   | 合并命令行配置、用户配置、默认配置为最终配置                 |



### pluginContainer





### HMR





### 预编译

