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



