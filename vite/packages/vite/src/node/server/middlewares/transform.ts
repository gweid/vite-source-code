import path from 'node:path'
import fsp from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import type { Connect } from 'dep-types/connect'
import colors from 'picocolors'
import type { ExistingRawSourceMap } from 'rollup'
import type { ViteDevServer } from '..'
import {
  cleanUrl,
  createDebugger,
  fsPathFromId,
  injectQuery,
  isImportRequest,
  isJSRequest,
  normalizePath,
  prettifyUrl,
  removeImportQuery,
  removeTimestampQuery,
  unwrapId,
  withTrailingSlash,
} from '../../utils'
import { send } from '../send'
import {
  ERR_DENIED_ID,
  ERR_LOAD_URL,
  transformRequest,
} from '../transformRequest'
import { applySourcemapIgnoreList } from '../sourcemap'
import { isHTMLProxy } from '../../plugins/html'
import {
  DEP_VERSION_RE,
  FS_PREFIX,
  NULL_BYTE_PLACEHOLDER,
} from '../../constants'
import {
  isCSSRequest,
  isDirectCSSRequest,
  isDirectRequest,
} from '../../plugins/css'
import {
  ERR_OPTIMIZE_DEPS_PROCESSING_ERROR,
  ERR_OUTDATED_OPTIMIZED_DEP,
} from '../../plugins/optimizedDeps'
import { ERR_CLOSED_SERVER } from '../pluginContainer'
import { getDepsOptimizer } from '../../optimizer'
import { checkServingAccess, respondWithAccessDenied } from './static'

const debugCache = createDebugger('vite:cache')

const knownIgnoreList = new Set(['/', '/favicon.ico'])
const trailingQuerySeparatorsRE = /[?&]+$/

// TODO: consolidate this regex pattern with the url, raw, and inline checks in plugins
const urlRE = /[?&]url\b/
const rawRE = /[?&]raw\b/
const inlineRE = /[?&]inline\b/
const svgRE = /\.svg\b/

function deniedServingAccessForTransform(
  url: string,
  server: ViteDevServer,
  res: ServerResponse,
  next: Connect.NextFunction,
) {
  if (
    rawRE.test(url) ||
    urlRE.test(url) ||
    inlineRE.test(url) ||
    svgRE.test(url)
  ) {
    const servingAccessResult = checkServingAccess(url, server)
    if (servingAccessResult === 'denied') {
      respondWithAccessDenied(url, server, res)
      return true
    }
    if (servingAccessResult === 'fallback') {
      next()
      return true
    }
    servingAccessResult satisfies 'allowed'
  }
  return false
}

// ! 负责处理模块转换请求
// ! 拦截对 JavaScript、CSS、HTML 等资源的请求，并通过插件系统对这些资源进行转换处理
export function transformMiddleware(
  server: ViteDevServer,
): Connect.NextHandleFunction {
  const {
    config: { root, logger },
    moduleGraph,
  } = server

  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  return async function viteTransformMiddleware(req, res, next) {
    // ! 过滤请求
    if (req.method !== 'GET' || knownIgnoreList.has(req.url!)) {
      return next()
    }

    // ! url 处理
    let url: string
    try {
      url = decodeURI(removeTimestampQuery(req.url!)).replace(
        NULL_BYTE_PLACEHOLDER,
        '\0',
      )
    } catch (e) {
      return next(e)
    }

    const withoutQuery = cleanUrl(url)

    try {
      // ! sourceMap 处理
      const isSourceMap = withoutQuery.endsWith('.map')
      // since we generate source map references, handle those requests here
      if (isSourceMap) {
        const depsOptimizer = getDepsOptimizer(server.config, false) // non-ssr
        if (depsOptimizer?.isOptimizedDepUrl(url)) {
          // If the browser is requesting a source map for an optimized dep, it
          // means that the dependency has already been pre-bundled and loaded
          const sourcemapPath = url.startsWith(FS_PREFIX)
            ? fsPathFromId(url)
            : normalizePath(path.resolve(root, url.slice(1)))
          try {
            const map = JSON.parse(
              await fsp.readFile(sourcemapPath, 'utf-8'),
            ) as ExistingRawSourceMap

            applySourcemapIgnoreList(
              map,
              sourcemapPath,
              server.config.server.sourcemapIgnoreList,
              logger,
            )

            return send(req, res, JSON.stringify(map), 'json', {
              headers: server.config.server.headers,
            })
          } catch (e) {
            // Outdated source map request for optimized deps, this isn't an error
            // but part of the normal flow when re-optimizing after missing deps
            // Send back an empty source map so the browser doesn't issue warnings
            const dummySourceMap = {
              version: 3,
              file: sourcemapPath.replace(/\.map$/, ''),
              sources: [],
              sourcesContent: [],
              names: [],
              mappings: ';;;;;;;;;',
            }
            return send(req, res, JSON.stringify(dummySourceMap), 'json', {
              cacheControl: 'no-cache',
              headers: server.config.server.headers,
            })
          }
        } else {
          const originalUrl = url.replace(/\.map($|\?)/, '$1')
          const map = (await moduleGraph.getModuleByUrl(originalUrl, false))
            ?.transformResult?.map
          if (map) {
            return send(req, res, JSON.stringify(map), 'json', {
              headers: server.config.server.headers,
            })
          } else {
            return next()
          }
        }
      }

      // check if public dir is inside root dir
      const publicDir = normalizePath(server.config.publicDir)
      const rootDir = normalizePath(server.config.root)
      if (publicDir.startsWith(withTrailingSlash(rootDir))) {
        const publicPath = `${publicDir.slice(rootDir.length)}/`
        // warn explicit public paths
        if (url.startsWith(withTrailingSlash(publicPath))) {
          let warning: string

          if (isImportRequest(url)) {
            const rawUrl = removeImportQuery(url)
            if (urlRE.test(url)) {
              warning =
                `Assets in the public directory are served at the root path.\n` +
                `Instead of ${colors.cyan(rawUrl)}, use ${colors.cyan(
                  rawUrl.replace(publicPath, '/'),
                )}.`
            } else {
              warning =
                'Assets in public directory cannot be imported from JavaScript.\n' +
                `If you intend to import that asset, put the file in the src directory, and use ${colors.cyan(
                  rawUrl.replace(publicPath, '/src/'),
                )} instead of ${colors.cyan(rawUrl)}.\n` +
                `If you intend to use the URL of that asset, use ${colors.cyan(
                  injectQuery(rawUrl.replace(publicPath, '/'), 'url'),
                )}.`
            }
          } else {
            warning =
              `files in the public directory are served at the root path.\n` +
              `Instead of ${colors.cyan(url)}, use ${colors.cyan(
                url.replace(publicPath, '/'),
              )}.`
          }

          logger.warn(colors.yellow(warning))
        }
      }

      const urlWithoutTrailingQuerySeparators = url.replace(
        trailingQuerySeparatorsRE,
        '',
      )
      if (
        deniedServingAccessForTransform(
          urlWithoutTrailingQuerySeparators,
          server,
          res,
          next,
        )
      ) {
        return
      }

      // ! 识别请求的资源类型，并针对不同类型进行特定处理
      if (
        isJSRequest(url) ||
        isImportRequest(url) ||
        isCSSRequest(url) ||
        isHTMLProxy(url)
      ) {
        // strip ?import
        url = removeImportQuery(url)
        // Strip valid id prefix. This is prepended to resolved Ids that are
        // not valid browser import specifiers by the importAnalysis plugin.
        url = unwrapId(url)

        // for CSS, we need to differentiate between normal CSS requests and
        // imports
        if (
          isCSSRequest(url) &&
          !isDirectRequest(url) &&
          req.headers.accept?.includes('text/css')
        ) {
          url = injectQuery(url, 'direct')
        }

        // check if we can return 304 early
        // ! 检查请求头中的 If-None-Match 与模块的 ETag 是否匹配，如果匹配则返回 304 状态码，告诉浏览器使用缓存。
        const ifNoneMatch = req.headers['if-none-match']
        if (
          ifNoneMatch &&
          (await moduleGraph.getModuleByUrl(url, false))?.transformResult
            ?.etag === ifNoneMatch
        ) {
          debugCache?.(`[304] ${prettifyUrl(url, root)}`)
          res.statusCode = 304
          return res.end()
        }

        // resolve, load and transform using the plugin container
        // ! 调用 transformRequest 函数进行实际的模块转换，这是整个中间件的核心部分
        const result = await transformRequest(url, server, {
          html: req.headers.accept?.includes('text/html'),
          allowId(id) {
            return !deniedServingAccessForTransform(id, server, res, next)
          },
        })

        // ! 将转换结果发送给浏览器，设置适当的 MIME 类型、缓存控制和 ETag
        if (result) {
          const depsOptimizer = getDepsOptimizer(server.config, false) // non-ssr
          const type = isDirectCSSRequest(url) ? 'css' : 'js'
          const isDep =
            DEP_VERSION_RE.test(url) || depsOptimizer?.isOptimizedDepUrl(url)
          return send(req, res, result.code, type, {
            etag: result.etag,
            // allow browser to cache npm deps!
            cacheControl: isDep ? 'max-age=31536000,immutable' : 'no-cache',
            headers: server.config.server.headers,
            map: result.map,
          })
        }
      }
    } catch (e) {
      if (e?.code === ERR_OPTIMIZE_DEPS_PROCESSING_ERROR) {
        // Skip if response has already been sent
        if (!res.writableEnded) {
          res.statusCode = 504 // status code request timeout
          res.statusMessage = 'Optimize Deps Processing Error'
          res.end()
        }
        // This timeout is unexpected
        logger.error(e.message)
        return
      }
      if (e?.code === ERR_OUTDATED_OPTIMIZED_DEP) {
        // Skip if response has already been sent
        if (!res.writableEnded) {
          res.statusCode = 504 // status code request timeout
          res.statusMessage = 'Outdated Optimize Dep'
          res.end()
        }
        // We don't need to log an error in this case, the request
        // is outdated because new dependencies were discovered and
        // the new pre-bundle dependencies have changed.
        // A full-page reload has been issued, and these old requests
        // can't be properly fulfilled. This isn't an unexpected
        // error but a normal part of the missing deps discovery flow
        return
      }
      if (e?.code === ERR_CLOSED_SERVER) {
        // Skip if response has already been sent
        if (!res.writableEnded) {
          res.statusCode = 504 // status code request timeout
          res.statusMessage = 'Outdated Request'
          res.end()
        }
        // We don't need to log an error in this case, the request
        // is outdated because new dependencies were discovered and
        // the new pre-bundle dependencies have changed.
        // A full-page reload has been issued, and these old requests
        // can't be properly fulfilled. This isn't an unexpected
        // error but a normal part of the missing deps discovery flow
        return
      }
      if (e?.code === ERR_LOAD_URL) {
        // Let other middleware handle if we can't load the url via transformRequest
        return next()
      }
      if (e?.code === ERR_DENIED_ID) {
        // next() is called in ensureServingAccess
        return
      }
      return next(e)
    }

    next()
  }
}
