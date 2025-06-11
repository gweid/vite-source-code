# vite 源码阅读

基于 vite@4.5.14 版本



## 调试 vite

怎么添加 sourcemap 参考：https://juejin.cn/book/7070324244772716556/section/7159194044663332872



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



#### npm run dev



package.json

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



#### createServer 的逻辑

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



_createServer 函数解释：

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
      // Await pending requests. We throw early in transformRequest
      // and in hooks if the server is closing for non-ssr requests,
      // so the import analysis plugin stops pre-transforming static
      // imports and this block is resolved sooner.
      // During SSR, we let pending requests finish to avoid exposing
      // the server closed error to the users.
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
      // matchBase: true does not work as it's documented
      // https://github.com/micromatch/picomatch/issues/89
      // convert patterns without `/` on our side for now
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

  // apply server configuration hooks from plugins
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

  // host check (to prevent DNS rebinding attacks)
  const { allowedHosts } = serverConfig
  // no need to check for HTTPS as HTTPS is not vulnerable to DNS rebinding attacks
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

  // serve static files under /public
  // this applies before the transform middleware so that these files are served
  // as-is without transforms.
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

  // run post config hooks
  // This is applied before the html middleware so that user middleware can
  // serve custom content instead of index.html.
  // 执行上面收集到的 configureServer 钩子函数返回的回调函数
  postHooks.forEach((fn) => fn && fn())

  // spa 或 mpa 应用
  if (config.appType === 'spa' || config.appType === 'mpa') {
    // transform index.html
    middlewares.use(indexHtmlMiddleware(server))

    // handle 404s
    // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
    // 处理路由刷新 404 问题
    middlewares.use(function vite404Middleware(_, res) {
      res.statusCode = 404
      res.end()
    })
  }

  // error handler
  middlewares.use(errorMiddleware(server, middlewareMode))

  // httpServer.listen can be called multiple times
  // when port when using next port number
  // this code is to avoid calling buildStart multiple times
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
    // overwrite listen to init optimizer before server start
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

总结 _createServer 函数比较核心的点：

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



### resolveConfig

主要作用：解析和标准化用户配置，将命令行参数、配置文件（vite.config.js）和默认配置合并为统一的 ResolvedConfig 对象







### pluginContainer





### HMR





### 预编译

