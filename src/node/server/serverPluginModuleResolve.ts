import path from 'path'
import chalk from 'chalk'
import fs from 'fs-extra'
import { ServerPlugin } from '.'
import { resolveVue } from '../utils'
import { URL } from 'url'
import { resolveOptimizedModule, resolveNodeModuleFile } from '../resolver'

const debug = require('debug')('vite:resolve')

export const moduleIdToFileMap = new Map()
export const moduleFileToIdMap = new Map()

export const moduleRE = /^\/@modules\//

const getDebugPath = (root: string, p: string) => {
  const relative = path.relative(root, p)
  return relative.startsWith('..') ? p : relative
}

// plugin for resolving /@modules/:id requests.
export const moduleResolvePlugin: ServerPlugin = ({ root, app, resolver }) => {
  const vueResolved = resolveVue(root)

  app.use(async (ctx, next) => {
    if (!moduleRE.test(ctx.path)) {
      return next()
    }

    // path maybe contain encode chars
    const id = decodeURIComponent(ctx.path.replace(moduleRE, ''))
    ctx.type = 'js'

    const serve = async (id: string, file: string, type: string) => {
      moduleIdToFileMap.set(id, file)
      moduleFileToIdMap.set(file, ctx.path)
      debug(`(${type}) ${id} -> ${getDebugPath(root, file)}`)
      await ctx.read(file)
      return next()
    }

    // special handling for vue runtime in case it's not installed
    if (!vueResolved.isLocal && id in vueResolved) {
      return serve(id, (vueResolved as any)[id], 'non-local vue')
    }

    // already resolved and cached
    const cachedPath = moduleIdToFileMap.get(id)
    // 有缓存，直接从缓存路径返回
    if (cachedPath) {
      return serve(id, cachedPath, 'cached')
    }

    // resolve from vite optimized modules
    const optimized = resolveOptimizedModule(root, id)
    if (optimized) {
      return serve(id, optimized, 'optimized')
    }

    const referer = ctx.get('referer')
    let importer: string | undefined
    // this is a map file request from browser dev tool
    const isMapFile = ctx.path.endsWith('.map')
    if (referer) {
      importer = new URL(referer).pathname
    } else if (isMapFile) {
      // for some reason Chrome doesn't provide referer for source map requests.
      // do our best to reverse-infer the importer.
      importer = ctx.path.replace(/\.map$/, '')
    }

    const importerFilePath = importer ? resolver.requestToFile(importer) : root
    const nodeModulePath = resolveNodeModuleFile(importerFilePath, id)
    // 从 node_modules 中找到模块内容并返回
    if (nodeModulePath) {
      return serve(id, nodeModulePath, 'node_modules')
    }

    if (isMapFile && importer) {
      // the resolveNodeModuleFile doesn't work with linked pkg
      // our last try: infer from the dir of importer
      const inferMapPath = path.join(
        path.dirname(importerFilePath),
        path.basename(ctx.path)
      )
      if (fs.existsSync(inferMapPath)) {
        return serve(id, inferMapPath, 'map file in linked pkg')
      }
    }

    console.error(
      chalk.red(
        `[vite] Failed to resolve module import "${id}". ` +
          `(imported by ${importer || 'unknown'})`
      )
    )
    // 找不到 404
    ctx.status = 404
  })
}
