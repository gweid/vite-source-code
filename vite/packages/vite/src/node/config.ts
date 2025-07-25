import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import colors from 'picocolors'
import type { Alias, AliasOptions } from 'dep-types/alias'
import aliasPlugin from '@rollup/plugin-alias'
import { build } from 'esbuild'
import type { RollupOptions } from 'rollup'
import type { HookHandler, Plugin } from './plugin'
import type {
  BuildOptions,
  RenderBuiltAssetUrl,
  ResolvedBuildOptions,
} from './build'
import { resolveBuildOptions } from './build'
import type { ResolvedServerOptions, ServerOptions } from './server'
import { resolveServerOptions } from './server'
import type { PreviewOptions, ResolvedPreviewOptions } from './preview'
import { resolvePreviewOptions } from './preview'
import {
  type CSSOptions,
  type ResolvedCSSOptions,
  resolveCSSOptions,
} from './plugins/css'
import {
  asyncFlatten,
  createDebugger,
  createFilter,
  dynamicImport,
  isBuiltin,
  isExternalUrl,
  isNodeBuiltin,
  isObject,
  lookupFile,
  mergeAlias,
  mergeConfig,
  normalizeAlias,
  normalizePath,
  withTrailingSlash,
} from './utils'
import {
  createPluginHookUtils,
  getSortedPluginsByHook,
  resolvePlugins,
} from './plugins'
import type { ESBuildOptions } from './plugins/esbuild'
import {
  CLIENT_ENTRY,
  DEFAULT_ASSETS_RE,
  DEFAULT_CONFIG_FILES,
  DEFAULT_EXTENSIONS,
  DEFAULT_MAIN_FIELDS,
  ENV_ENTRY,
  FS_PREFIX,
} from './constants'
import type { InternalResolveOptions, ResolveOptions } from './plugins/resolve'
import { resolvePlugin, tryNodeResolve } from './plugins/resolve'
import type { LogLevel, Logger } from './logger'
import { createLogger } from './logger'
import type { DepOptimizationConfig, DepOptimizationOptions } from './optimizer'
import type { JsonOptions } from './plugins/json'
import type { PluginContainer } from './server/pluginContainer'
import { createPluginContainer } from './server/pluginContainer'
import type { PackageCache } from './packages'
import { findNearestPackageData } from './packages'
import { loadEnv, resolveEnvPrefix } from './env'
import type { ResolvedSSROptions, SSROptions } from './ssr'
import { resolveSSROptions } from './ssr'
import { getAdditionalAllowedHosts } from './server/middlewares/hostCheck'

const debug = createDebugger('vite:config')
const promisifiedRealpath = promisify(fs.realpath)

export type {
  RenderBuiltAssetUrl,
  ModulePreloadOptions,
  ResolvedModulePreloadOptions,
  ResolveModulePreloadDependenciesFn,
} from './build'

// NOTE: every export in this file is re-exported from ./index.ts so it will
// be part of the public API.

export interface ConfigEnv {
  command: 'build' | 'serve'
  mode: string
  /**
   * @experimental
   */
  ssrBuild?: boolean
}

/**
 * spa: include SPA fallback middleware and configure sirv with `single: true` in preview
 *
 * mpa: only include non-SPA HTML middlewares
 *
 * custom: don't include HTML middlewares
 */
export type AppType = 'spa' | 'mpa' | 'custom'

export type UserConfigFnObject = (env: ConfigEnv) => UserConfig
export type UserConfigFnPromise = (env: ConfigEnv) => Promise<UserConfig>
export type UserConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>

export type UserConfigExport =
  | UserConfig
  | Promise<UserConfig>
  | UserConfigFnObject
  | UserConfigFnPromise
  | UserConfigFn

/**
 * Type helper to make it easier to use vite.config.ts
 * accepts a direct {@link UserConfig} object, or a function that returns it.
 * The function receives a {@link ConfigEnv} object that exposes two properties:
 * `command` (either `'build'` or `'serve'`), and `mode`.
 */
export function defineConfig(config: UserConfig): UserConfig
export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>
export function defineConfig(config: UserConfigFnObject): UserConfigFnObject
export function defineConfig(config: UserConfigExport): UserConfigExport
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}

export type PluginOption =
  | Plugin
  | false
  | null
  | undefined
  | PluginOption[]
  | Promise<Plugin | false | null | undefined | PluginOption[]>

export interface UserConfig {
  /**
   * Project root directory. Can be an absolute path, or a path relative from
   * the location of the config file itself.
   * @default process.cwd()
   */
  root?: string
  /**
   * Base public path when served in development or production.
   * @default '/'
   */
  base?: string
  /**
   * Directory to serve as plain static assets. Files in this directory are
   * served and copied to build dist dir as-is without transform. The value
   * can be either an absolute file system path or a path relative to project root.
   *
   * Set to `false` or an empty string to disable copied static assets to build dist dir.
   * @default 'public'
   */
  publicDir?: string | false
  /**
   * Directory to save cache files. Files in this directory are pre-bundled
   * deps or some other cache files that generated by vite, which can improve
   * the performance. You can use `--force` flag or manually delete the directory
   * to regenerate the cache files. The value can be either an absolute file
   * system path or a path relative to project root.
   * Default to `.vite` when no `package.json` is detected.
   * @default 'node_modules/.vite'
   */
  cacheDir?: string
  /**
   * Explicitly set a mode to run in. This will override the default mode for
   * each command, and can be overridden by the command line --mode option.
   */
  mode?: string
  /**
   * Define global variable replacements.
   * Entries will be defined on `window` during dev and replaced during build.
   */
  define?: Record<string, any>
  /**
   * Array of vite plugins to use.
   */
  plugins?: PluginOption[]
  /**
   * Configure resolver
   */
  resolve?: ResolveOptions & { alias?: AliasOptions }
  /**
   * CSS related options (preprocessors and CSS modules)
   */
  css?: CSSOptions
  /**
   * JSON loading options
   */
  json?: JsonOptions
  /**
   * Transform options to pass to esbuild.
   * Or set to `false` to disable esbuild.
   */
  esbuild?: ESBuildOptions | false
  /**
   * Specify additional picomatch patterns to be treated as static assets.
   */
  assetsInclude?: string | RegExp | (string | RegExp)[]
  /**
   * Server specific options, e.g. host, port, https...
   */
  server?: ServerOptions
  /**
   * Build specific options
   */
  build?: BuildOptions
  /**
   * Preview specific options, e.g. host, port, https...
   */
  preview?: PreviewOptions
  /**
   * Dep optimization options
   */
  optimizeDeps?: DepOptimizationOptions
  /**
   * SSR specific options
   */
  ssr?: SSROptions
  /**
   * Experimental features
   *
   * Features under this field could change in the future and might NOT follow semver.
   * Please be careful and always pin Vite's version when using them.
   * @experimental
   */
  experimental?: ExperimentalOptions
  /**
   * Legacy options
   *
   * Features under this field only follow semver for patches, they could be removed in a
   * future minor version. Please always pin Vite's version to a minor when using them.
   */
  legacy?: LegacyOptions
  /**
   * Log level.
   * @default 'info'
   */
  logLevel?: LogLevel
  /**
   * Custom logger.
   */
  customLogger?: Logger
  /**
   * @default true
   */
  clearScreen?: boolean
  /**
   * Environment files directory. Can be an absolute path, or a path relative from
   * root.
   * @default root
   */
  envDir?: string
  /**
   * Env variables starts with `envPrefix` will be exposed to your client source code via import.meta.env.
   * @default 'VITE_'
   */
  envPrefix?: string | string[]
  /**
   * Worker bundle options
   */
  worker?: {
    /**
     * Output format for worker bundle
     * @default 'iife'
     */
    format?: 'es' | 'iife'
    /**
     * Vite plugins that apply to worker bundle
     */
    plugins?: PluginOption[]
    /**
     * Rollup options to build worker bundle
     */
    rollupOptions?: Omit<
      RollupOptions,
      'plugins' | 'input' | 'onwarn' | 'preserveEntrySignatures'
    >
  }
  /**
   * Whether your application is a Single Page Application (SPA),
   * a Multi-Page Application (MPA), or Custom Application (SSR
   * and frameworks with custom HTML handling)
   * @default 'spa'
   */
  appType?: AppType
}

export interface ExperimentalOptions {
  /**
   * Append fake `&lang.(ext)` when queries are specified, to preserve the file extension for following plugins to process.
   *
   * @experimental
   * @default false
   */
  importGlobRestoreExtension?: boolean
  /**
   * Allow finegrain control over assets and public files paths
   *
   * @experimental
   */
  renderBuiltUrl?: RenderBuiltAssetUrl
  /**
   * Enables support of HMR partial accept via `import.meta.hot.acceptExports`.
   *
   * @experimental
   * @default false
   */
  hmrPartialAccept?: boolean
  /**
   * Skips SSR transform to make it easier to use Vite with Node ESM loaders.
   * @warning Enabling this will break normal operation of Vite's SSR in development mode.
   *
   * @experimental
   * @default false
   */
  skipSsrTransform?: boolean
}

export interface LegacyOptions {
  /**
   * Revert vite build --ssr to the v2.9 strategy. Use CJS SSR build and v2.9 externalization heuristics
   *
   * @experimental
   * @deprecated
   * @default false
   */
  buildSsrCjsExternalHeuristics?: boolean
  /**
   * In Vite 6.0.8 / 5.4.11 / 4.5.5 and below, WebSocket server was able to connect from any web pages. However,
   * that could be exploited by a malicious web page.
   *
   * In Vite 6.0.9+ / 5.4.12+ / 4.5.6+ the WebSocket server now requires a token to connect from a web page.
   * But this may break some plugins and frameworks that connects to the WebSocket server
   * on their own. Enabling this option will make Vite skip the token check.
   *
   * **We do not recommend enabling this option unless you are sure that you are fine with
   * that security weakness.**
   */
  skipWebSocketTokenCheck?: boolean
}

export interface ResolveWorkerOptions extends PluginHookUtils {
  format: 'es' | 'iife'
  plugins: Plugin[]
  rollupOptions: RollupOptions
}

export interface InlineConfig extends UserConfig {
  configFile?: string | false
  envFile?: false
}

export type ResolvedConfig = Readonly<
  Omit<
    UserConfig,
    'plugins' | 'css' | 'assetsInclude' | 'optimizeDeps' | 'worker' | 'build'
  > & {
    configFile: string | undefined
    configFileDependencies: string[]
    inlineConfig: InlineConfig
    root: string
    base: string
    /** @internal */
    rawBase: string
    publicDir: string
    cacheDir: string
    command: 'build' | 'serve'
    mode: string
    isWorker: boolean
    // in nested worker bundle to find the main config
    /** @internal */
    mainConfig: ResolvedConfig | null
    isProduction: boolean
    envDir: string
    env: Record<string, any>
    resolve: Required<ResolveOptions> & {
      alias: Alias[]
    }
    plugins: readonly Plugin[]
    css: ResolvedCSSOptions | undefined
    esbuild: ESBuildOptions | false
    server: ResolvedServerOptions
    build: ResolvedBuildOptions
    preview: ResolvedPreviewOptions
    ssr: ResolvedSSROptions
    assetsInclude: (file: string) => boolean
    logger: Logger
    createResolver: (options?: Partial<InternalResolveOptions>) => ResolveFn
    optimizeDeps: DepOptimizationOptions
    /** @internal */
    packageCache: PackageCache
    worker: ResolveWorkerOptions
    appType: AppType
    experimental: ExperimentalOptions
    /**
     * The token to connect to the WebSocket server from browsers.
     *
     * We recommend using `import.meta.hot` rather than connecting
     * to the WebSocket server directly.
     * If you have a usecase that requires connecting to the WebSocket
     * server, please create an issue so that we can discuss.
     *
     * @deprecated use `import.meta.hot`
     */
    webSocketToken: string
    /** @internal */
    additionalAllowedHosts: string[]
  } & PluginHookUtils
>

export interface PluginHookUtils {
  getSortedPlugins: (hookName: keyof Plugin) => Plugin[]
  getSortedPluginHooks: <K extends keyof Plugin>(
    hookName: K,
  ) => NonNullable<HookHandler<Plugin[K]>>[]
}

export type ResolveFn = (
  id: string,
  importer?: string,
  aliasOnly?: boolean,
  ssr?: boolean,
) => Promise<string | undefined>

// ! ​解析和标准化用户配置​​，将命令行参数、配置文件（vite.config.js）和默认配置合并为统一的配置对象
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

  // some dependencies e.g. @vue/compiler-* relies on NODE_ENV for getting
  // production-specific behavior, so set it early on
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

  // user config may provide an alternative mode. But --mode has a higher priority
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

  // Some plugins that aren't intended to work in the bundling of workers (doing post-processing at build time for example).
  // And Plugins may also have cached that could be corrupted by being used in these extra rollup calls.
  // So we need to separate the worker plugin from the plugin that vite needs to run.
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

  // run config hooks
  // ! 将 pre、normal、post 三类插件合并为一个数组，这样就实现了排序
  // 插件执行顺序：prePlugins -> normalPlugins -> postPlugins
  const userPlugins = [...prePlugins, ...normalPlugins, ...postPlugins]

  // ! 执行所有插件的 config 钩子
  config = await runConfigHook(config, userPlugins, configEnv)

  // If there are custom commonjsOptions, don't force optimized deps for this test
  // even if the env var is set as it would interfere with the playground specs.
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

  // Note it is possible for user to have a custom mode, e.g. `staging` where
  // development-like behavior is expected. This is indicated by NODE_ENV=development
  // loaded from `.staging.env` and set by us as VITE_USER_NODE_ENV
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

  // create an internal resolver to be used in special scenarios, e.g.
  // optimizer & handling css @imports
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
    // random 72 bits (12 base64 chars)
    // at least 64bits is recommended
    // https://owasp.org/www-community/vulnerabilities/Insufficient_Session-ID_Length
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

  // call configResolved hooks
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
  if (middlewareMode === 'ssr') {
    logger.warn(
      colors.yellow(
        `Setting server.middlewareMode to 'ssr' is deprecated, set server.middlewareMode to \`true\`${
          config.appType === 'custom' ? '' : ` and appType to 'custom'`
        } instead`,
      ),
    )
  }
  if (middlewareMode === 'html') {
    logger.warn(
      colors.yellow(
        `Setting server.middlewareMode to 'html' is deprecated, set server.middlewareMode to \`true\` instead`,
      ),
    )
  }

  if (
    config.server?.force &&
    !isBuild &&
    config.optimizeDeps?.force === undefined
  ) {
    resolved.optimizeDeps.force = true
    logger.warn(
      colors.yellow(
        `server.force is deprecated, use optimizeDeps.force instead`,
      ),
    )
  }

  debug?.(`using resolved config: %O`, {
    ...resolved,
    plugins: resolved.plugins.map((p) => p.name),
    worker: {
      ...resolved.worker,
      plugins: resolved.worker.plugins.map((p) => p.name),
    },
  })

  if (config.build?.terserOptions && config.build.minify !== 'terser') {
    logger.warn(
      colors.yellow(
        `build.terserOptions is specified but build.minify is not set to use Terser. ` +
          `Note Vite now defaults to use esbuild for minification. If you still ` +
          `prefer Terser, set build.minify to "terser".`,
      ),
    )
  }

  // Check if all assetFileNames have the same reference.
  // If not, display a warn for user.
  const outputOption = config.build?.rollupOptions?.output ?? []
  // Use isArray to narrow its type to array
  if (Array.isArray(outputOption)) {
    const assetFileNamesList = outputOption.map(
      (output) => output.assetFileNames,
    )
    if (assetFileNamesList.length > 1) {
      const firstAssetFileNames = assetFileNamesList[0]
      const hasDifferentReference = assetFileNamesList.some(
        (assetFileNames) => assetFileNames !== firstAssetFileNames,
      )
      if (hasDifferentReference) {
        resolved.logger.warn(
          colors.yellow(`
assetFileNames isn't equal for every build.rollupOptions.output. A single pattern across all outputs is supported by Vite.
`),
        )
      }
    }
  }

  // Warn about removal of experimental features
  if (
    config.legacy?.buildSsrCjsExternalHeuristics ||
    config.ssr?.format === 'cjs'
  ) {
    resolved.logger.warn(
      colors.yellow(`
(!) Experimental legacy.buildSsrCjsExternalHeuristics and ssr.format: 'cjs' are going to be removed in Vite 5.
    Find more information and give feedback at https://github.com/vitejs/vite/discussions/13816.
`),
    )
  }

  // ! 将最终配置返回
  return resolved
}

/**
 * Resolve base url. Note that some users use Vite to build for non-web targets like
 * electron or expects to deploy
 */
export function resolveBaseUrl(
  base: UserConfig['base'] = '/',
  isBuild: boolean,
  logger: Logger,
): string {
  if (base[0] === '.') {
    logger.warn(
      colors.yellow(
        colors.bold(
          `(!) invalid "base" option: ${base}. The value can only be an absolute ` +
            `URL, ./, or an empty string.`,
        ),
      ),
    )
    return '/'
  }

  // external URL flag
  const isExternal = isExternalUrl(base)
  // no leading slash warn
  if (!isExternal && base[0] !== '/') {
    logger.warn(
      colors.yellow(
        colors.bold(`(!) "base" option should start with a slash.`),
      ),
    )
  }

  // parse base when command is serve or base is not External URL
  if (!isBuild || !isExternal) {
    base = new URL(base, 'http://vitejs.dev').pathname
    // ensure leading slash
    if (base[0] !== '/') {
      base = '/' + base
    }
  }

  return base
}

// 根据 enforce 属性，将插件分为 pre、normal、post 三类
export function sortUserPlugins(
  plugins: (Plugin | Plugin[])[] | undefined,
): [Plugin[], Plugin[], Plugin[]] {
  const prePlugins: Plugin[] = []
  const postPlugins: Plugin[] = []
  const normalPlugins: Plugin[] = []

  if (plugins) {
    plugins.flat().forEach((p) => {
      if (p.enforce === 'pre') prePlugins.push(p)
      else if (p.enforce === 'post') postPlugins.push(p)
      else normalPlugins.push(p)
    })
  }

  return [prePlugins, normalPlugins, postPlugins]
}

// 加载 vite.config.js 配置文件
export async function loadConfigFromFile(
  configEnv: ConfigEnv,
  configFile?: string,
  configRoot: string = process.cwd(), // 执行 npm dev 命令的根目录
  logLevel?: LogLevel,
): Promise<{
  path: string
  config: UserConfig
  dependencies: string[]
} | null> {
  const start = performance.now()
  const getTime = () => `${(performance.now() - start).toFixed(2)}ms`

  let resolvedPath: string | undefined

  if (configFile) {
    // explicit config path is always resolved from cwd
    resolvedPath = path.resolve(configFile)
  } else {
    // implicit config file loaded from inline root (if present)
    // otherwise from cwd
    // const DEFAULT_CONFIG_FILES = [
    //   'vite.config.js',
    //   'vite.config.mjs',
    //   'vite.config.ts',
    //   'vite.config.cjs',
    //   'vite.config.mts',
    //   'vite.config.cts',
    // ]
    for (const filename of DEFAULT_CONFIG_FILES) {
      const filePath = path.resolve(configRoot, filename)
      if (!fs.existsSync(filePath)) continue

      resolvedPath = filePath
      break
    }
  }

  // 如果没有 vite.config.js 配置文件，则返回 null
  if (!resolvedPath) {
    debug?.('no config file found.')
    return null
  }

  /**
   * ! 下面主要判断是否是 ESModule
   *  - 如果 vite 配置文件是 .mjs 或 .mts 文件，则认为是 ESModule
   *  - 如果 vite 配置文件是 .cjs 或 .cts 文件，则认为是 CommonJS
   *  - 否则，检查 package.json 中的 type 字段，如果为 module，则认为是 ESModule
   */
  let isESM = false
  if (/\.m[jt]s$/.test(resolvedPath)) {
    isESM = true
  } else if (/\.c[jt]s$/.test(resolvedPath)) {
    isESM = false
  } else {
    // check package.json for type: "module" and set `isESM` to true
    try {
      const pkg = lookupFile(configRoot, ['package.json'])
      isESM =
        !!pkg && JSON.parse(fs.readFileSync(pkg, 'utf-8')).type === 'module'
    } catch (e) {}
  }

  try {
    /**
     * ! 将 vite.config 配置文件编译为 js。为什么需要这样做？
     * ! 因为 vite 配置文件可以是：
     *  - 'vite.config.js'
     *  - 'vite.config.mjs'
     *  - 'vite.config.ts'
     *  - 'vite.config.cjs'
     *  - 'vite.config.mts'
     *  - 'vite.config.cts'
     */
    const bundled = await bundleConfigFile(resolvedPath, isESM)

    // 将 bundleConfigFile 编译后的配置文件代码（如 vite.config.ts 的编译结果）​​动态加载为用户配置对象
    const userConfig = await loadConfigFromBundledFile(
      resolvedPath,
      bundled.code,
      isESM,
    )

    debug?.(`bundled config file loaded in ${getTime()}`)

    // 如果 userConfig 是一个函数，则调用该函数，否则直接返回用户配置
    const config = await (typeof userConfig === 'function'
      ? userConfig(configEnv)
      : userConfig)

    if (!isObject(config)) {
      throw new Error(`config must export or return an object.`)
    }

    /**
     * ! 返回配置
     * {
     *  path: '/Users/gweid/Desktop/study/vite-source-code/vite-debug/vite.config.ts',
     *  config: { plugins: [...] },
     *  dependencies: 'vite.config.ts',
     * }
     */
    return {
      path: normalizePath(resolvedPath),
      config,
      dependencies: bundled.dependencies,
    }
  } catch (e) {
    createLogger(logLevel).error(
      colors.red(`failed to load config from ${resolvedPath}`),
      { error: e },
    )
    throw e
  }
}

// 使用 esbuild 将 .ts 、mts 等结尾的 vite.config 编译为 js
async function bundleConfigFile(
  fileName: string,
  isESM: boolean,
): Promise<{ code: string; dependencies: string[] }> {
  const dirnameVarName = '__vite_injected_original_dirname'
  const filenameVarName = '__vite_injected_original_filename'
  const importMetaUrlVarName = '__vite_injected_original_import_meta_url'

  // 使用 esbuild 将 vite.config.js 配置文件编译为 js
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [fileName],
    outfile: 'out.js',
    write: false,
    target: ['node14.18', 'node16'],
    platform: 'node',
    bundle: true,
    format: isESM ? 'esm' : 'cjs',
    mainFields: ['main'],
    sourcemap: 'inline',
    metafile: true,
    define: {
      __dirname: dirnameVarName,
      __filename: filenameVarName,
      'import.meta.url': importMetaUrlVarName,
    },
    plugins: [
      {
        name: 'externalize-deps',
        setup(build) {
          const packageCache = new Map()
          const resolveByViteResolver = (
            id: string,
            importer: string,
            isRequire: boolean,
          ) => {
            return tryNodeResolve(
              id,
              importer,
              {
                root: path.dirname(fileName),
                isBuild: true,
                isProduction: true,
                preferRelative: false,
                tryIndex: true,
                mainFields: [],
                browserField: false,
                conditions: [],
                overrideConditions: ['node'],
                dedupe: [],
                extensions: DEFAULT_EXTENSIONS,
                preserveSymlinks: false,
                packageCache,
                isRequire,
              },
              false,
            )?.id
          }
          const isESMFile = (id: string): boolean => {
            if (id.endsWith('.mjs')) return true
            if (id.endsWith('.cjs')) return false

            const nearestPackageJson = findNearestPackageData(
              path.dirname(id),
              packageCache,
            )
            return (
              !!nearestPackageJson && nearestPackageJson.data.type === 'module'
            )
          }

          // externalize bare imports
          build.onResolve(
            { filter: /^[^.].*/ },
            async ({ path: id, importer, kind }) => {
              if (
                kind === 'entry-point' ||
                path.isAbsolute(id) ||
                isNodeBuiltin(id)
              ) {
                return
              }

              // With the `isNodeBuiltin` check above, this check captures if the builtin is a
              // non-node built-in, which esbuild doesn't know how to handle. In that case, we
              // externalize it so the non-node runtime handles it instead.
              if (isBuiltin(id)) {
                return { external: true }
              }

              const isImport = isESM || kind === 'dynamic-import'
              let idFsPath: string | undefined
              try {
                idFsPath = resolveByViteResolver(id, importer, !isImport)
              } catch (e) {
                if (!isImport) {
                  let canResolveWithImport = false
                  try {
                    canResolveWithImport = !!resolveByViteResolver(
                      id,
                      importer,
                      false,
                    )
                  } catch {}
                  if (canResolveWithImport) {
                    throw new Error(
                      `Failed to resolve ${JSON.stringify(
                        id,
                      )}. This package is ESM only but it was tried to load by \`require\`. See http://vitejs.dev/guide/troubleshooting.html#this-package-is-esm-only for more details.`,
                    )
                  }
                }
                throw e
              }
              if (idFsPath && isImport) {
                idFsPath = pathToFileURL(idFsPath).href
              }
              if (idFsPath && !isImport && isESMFile(idFsPath)) {
                throw new Error(
                  `${JSON.stringify(
                    id,
                  )} resolved to an ESM file. ESM file cannot be loaded by \`require\`. See http://vitejs.dev/guide/troubleshooting.html#this-package-is-esm-only for more details.`,
                )
              }
              return {
                path: idFsPath,
                external: true,
              }
            },
          )
        },
      },
      {
        name: 'inject-file-scope-variables',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async (args) => {
            const contents = await fsp.readFile(args.path, 'utf8')
            const injectValues =
              `const ${dirnameVarName} = ${JSON.stringify(
                path.dirname(args.path),
              )};` +
              `const ${filenameVarName} = ${JSON.stringify(args.path)};` +
              `const ${importMetaUrlVarName} = ${JSON.stringify(
                pathToFileURL(args.path).href,
              )};`

            return {
              loader: args.path.endsWith('ts') ? 'ts' : 'js',
              contents: injectValues + contents,
            }
          })
        },
      },
    ],
  })
  const { text } = result.outputFiles[0]
  return {
    code: text,
    dependencies: result.metafile ? Object.keys(result.metafile.inputs) : [],
  }
}

interface NodeModuleWithCompile extends NodeModule {
  _compile(code: string, filename: string): any
}

const _require = createRequire(import.meta.url)

// 将 bundleConfigFile 编译后的配置文件代码，​​动态执行并提取出用户配置对象​​
async function loadConfigFromBundledFile(
  fileName: string,
  bundledCode: string,
  isESM: boolean,
): Promise<UserConfigExport> {
  // for esm, before we can register loaders without requiring users to run node
  // with --experimental-loader themselves, we have to do a hack here:
  // write it to disk, load it with native Node ESM, then delete the file.
  if (isESM) {
    const fileBase = `${fileName}.timestamp-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
    const fileNameTmp = `${fileBase}.mjs`
    const fileUrl = `${pathToFileURL(fileBase)}.mjs`
    // 写入一个临时 vite.config.mjs 文件
    await fsp.writeFile(fileNameTmp, bundledCode)
    try {
      // 动态导入临时文件，得到 vit.config
      return (await dynamicImport(fileUrl)).default
    } finally {
      // 删除临时 vite.config.mjs 文件
      fs.unlink(fileNameTmp, () => {}) // Ignore errors
    }
  }
  // for cjs, we can register a custom loader via `_require.extensions`
  else {
    const extension = path.extname(fileName)
    // We don't use fsp.realpath() here because it has the same behaviour as
    // fs.realpath.native. On some Windows systems, it returns uppercase volume
    // letters (e.g. "C:\") while the Node.js loader uses lowercase volume letters.
    // See https://github.com/vitejs/vite/issues/12923
    const realFileName = await promisifiedRealpath(fileName)
    const loaderExt = extension in _require.extensions ? extension : '.js'
    const defaultLoader = _require.extensions[loaderExt]!
    _require.extensions[loaderExt] = (module: NodeModule, filename: string) => {
      if (filename === realFileName) {
        ;(module as NodeModuleWithCompile)._compile(bundledCode, filename)
      } else {
        defaultLoader(module, filename)
      }
    }
    // clear cache in case of server restart
    delete _require.cache[_require.resolve(fileName)]
    const raw = _require(fileName)
    _require.extensions[loaderExt] = defaultLoader
    return raw.__esModule ? raw.default : raw
  }
}

// 执行所有插件的 config 钩子
async function runConfigHook(
  config: InlineConfig,
  plugins: Plugin[],
  configEnv: ConfigEnv,
): Promise<InlineConfig> {
  let conf = config

  // 循环执行每个插件的 config 钩子
  for (const p of getSortedPluginsByHook('config', plugins)) {
    const hook = p.config
    const handler = hook && 'handler' in hook ? hook.handler : hook
    if (handler) {
      const res = await handler(conf, configEnv)
      if (res) {
        conf = mergeConfig(conf, res)
      }
    }
  }

  return conf
}

export function getDepOptimizationConfig(
  config: ResolvedConfig,
  ssr: boolean,
): DepOptimizationConfig {
  return ssr ? config.ssr.optimizeDeps : config.optimizeDeps
}
export function isDepsOptimizerEnabled(
  config: ResolvedConfig,
  ssr: boolean,
): boolean {
  const { command } = config
  const { disabled } = getDepOptimizationConfig(config, ssr)
  return !(
    disabled === true ||
    (command === 'build' && disabled === 'build') ||
    (command === 'serve' && disabled === 'dev')
  )
}
