# Troubleshooting

See [Rollup's troubleshooting guide](https://rollupjs.org/troubleshooting/) for more information too.

If the suggestions here don't work, please try posting questions on [GitHub Discussions](https://github.com/vitejs/vite/discussions) or in the `#help` channel of [Vite Land Discord](https://chat.vitejs.dev).

## CLI

### `Error: Cannot find module 'C:\foo\bar&baz\vite\bin\vite.js'`

The path to your project folder may include `&`, which doesn't work with `npm` on Windows ([npm/cmd-shim#45](https://github.com/npm/cmd-shim/issues/45)).

You will need to either:

- Switch to another package manager (e.g. `pnpm`, `yarn`)
- Remove `&` from the path to your project

## Config

### This package is ESM only

When importing a ESM only package by `require`, the following error happens.

> Failed to resolve "foo". This package is ESM only but it was tried to load by `require`.

> "foo" resolved to an ESM file. ESM file cannot be loaded by `require`.

ESM files cannot be loaded by [`require`](<https://nodejs.org/docs/latest-v18.x/api/esm.html#require:~:text=Using%20require%20to%20load%20an%20ES%20module%20is%20not%20supported%20because%20ES%20modules%20have%20asynchronous%20execution.%20Instead%2C%20use%20import()%20to%20load%20an%20ES%20module%20from%20a%20CommonJS%20module.>).

We recommend converting your config to ESM by either:

- adding `"type": "module"` to the nearest `package.json`
- renaming `vite.config.js`/`vite.config.ts` to `vite.config.mjs`/`vite.config.mts`

## Dev Server

### Requests are stalled forever

If you are using Linux, file descriptor limits and inotify limits may be causing the issue. As Vite does not bundle most of the files, browsers may request many files which require many file descriptors, going over the limit.

To solve this:

- Increase file descriptor limit by `ulimit`

  ```shell
  # Check current limit
  $ ulimit -Sn
  # Change limit (temporary)
  $ ulimit -Sn 10000 # You might need to change the hard limit too
  # Restart your browser
  ```

- Increase the following inotify related limits by `sysctl`

  ```shell
  # Check current limits
  $ sysctl fs.inotify
  # Change limits (temporary)
  $ sudo sysctl fs.inotify.max_queued_events=16384
  $ sudo sysctl fs.inotify.max_user_instances=8192
  $ sudo sysctl fs.inotify.max_user_watches=524288
  ```

If the above steps don't work, you can try adding `DefaultLimitNOFILE=65536` as an un-commented config to the following files:

- /etc/systemd/system.conf
- /etc/systemd/user.conf

For Ubuntu Linux, you may need to add the line `* - nofile 65536` to the file `/etc/security/limits.conf` instead of updating systemd config files.

Note that these settings persist but a **restart is required**.

### Network requests stop loading

When using a self-signed SSL certificate, Chrome ignores all caching directives and reloads the content. Vite relies on these caching directives.

To resolve the problem use a trusted SSL cert.

See: [Cache problems](https://helpx.adobe.com/mt/experience-manager/kb/cache-problems-on-chrome-with-SSL-certificate-errors.html), [Chrome issue](https://bugs.chromium.org/p/chromium/issues/detail?id=110649#c8)

#### macOS

You can install a trusted cert via the CLI with this command:

```
security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db your-cert.cer
```

Or, by importing it into the Keychain Access app and updating the trust of your cert to "Always Trust."

### 431 Request Header Fields Too Large

When the server / WebSocket server receives a large HTTP header, the request will be dropped and the following warning will be shown.

> Server responded with status code 431. See https://vitejs.dev/guide/troubleshooting.html#_431-request-header-fields-too-large.

This is because Node.js limits request header size to mitigate [CVE-2018-12121](https://www.cve.org/CVERecord?id=CVE-2018-12121).

To avoid this, try to reduce your request header size. For example, if the cookie is long, delete it. Or you can use [`--max-http-header-size`](https://nodejs.org/api/cli.html#--max-http-header-sizesize) to change max header size.

## HMR

### Vite detects a file change but the HMR is not working

You may be importing a file with a different case. For example, `src/foo.js` exists and `src/bar.js` contains:

```js
import './Foo.js' // should be './foo.js'
```

Related issue: [#964](https://github.com/vitejs/vite/issues/964)

### Vite does not detect a file change

If you are running Vite with WSL2, Vite cannot watch file changes in some conditions. See [`server.watch` option](/config/server-options.md#server-watch).

### A full reload happens instead of HMR

If HMR is not handled by Vite or a plugin, a full reload will happen.

Also if there is a dependency loop, a full reload will happen. To solve this, try removing the loop.

### High number of HMR updates in console

This can be caused by a circular dependency. To solve this, try breaking the loop.

## Build

### Built file does not work because of CORS error

If the HTML file output was opened with `file` protocol, the scripts won't run with the following error.

> Access to script at 'file:///foo/bar.js' from origin 'null' has been blocked by CORS policy: Cross origin requests are only supported for protocol schemes: http, data, isolated-app, chrome-extension, chrome, https, chrome-untrusted.

> Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///foo/bar.js. (Reason: CORS request not http).

See [Reason: CORS request not HTTP - HTTP | MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSRequestNotHttp) for more information about why this happens.

You will need to access the file with `http` protocol. The easiest way to achieve this is to run `npx vite preview`.

## Optimized Dependencies

### Outdated pre-bundled deps when linking to a local package

The hash key used to invalidate optimized dependencies depend on the package lock contents, the patches applied to dependencies, and the options in the Vite config file that affects the bundling of node modules. This means that Vite will detect when a dependency is overridden using a feature as [npm overrides](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides), and re-bundle your dependencies on the next server start. Vite won't invalidate the dependencies when you use a feature like [npm link](https://docs.npmjs.com/cli/v9/commands/npm-link). In case you link or unlink a dependency, you'll need to force re-optimization on the next server start by using `vite --force`. We recommend using overrides instead, which are supported now by every package manager (see also [pnpm overrides](https://pnpm.io/package_json#pnpmoverrides) and [yarn resolutions](https://yarnpkg.com/configuration/manifest/#resolutions)).

## Others

### Module externalized for browser compatibility

When you use a Node.js module in the browser, Vite will output the following warning.

> Module "fs" has been externalized for browser compatibility. Cannot access "fs.readFile" in client code.

This is because Vite does not automatically polyfill Node.js modules.

We recommend avoiding Node.js modules for browser code to reduce the bundle size, although you can add polyfills manually. If the module is imported from a third-party library (that's meant to be used in the browser), it's advised to report the issue to the respective library.

### Syntax Error / Type Error happens

Vite cannot handle and does not support code that only runs on non-strict mode (sloppy mode). This is because Vite uses ESM and it is always [strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) inside ESM.

For example, you might see these errors.

> [ERROR] With statements cannot be used with the "esm" output format due to strict mode

> TypeError: Cannot create property 'foo' on boolean 'false'

If these code are used inside dependencies, you could use [`patch-package`](https://github.com/ds300/patch-package) (or [`yarn patch`](https://yarnpkg.com/cli/patch) or [`pnpm patch`](https://pnpm.io/cli/patch)) for an escape hatch.

### Browser extensions

Some browser extensions (like ad-blockers) may prevent the Vite client from sending requests to the Vite dev server. You may see a white screen without logged errors in this case. Try disabling extensions if you have this issue.

### Cross drive links on Windows

If there's a cross drive links in your project on Windows, Vite may not work.

An example of cross drive links are:

- a virtual drive linked to a folder by `subst` command
- a symlink/junction to a different drive by `mklink` command (e.g. Yarn global cache)

Related issue: [#10802](https://github.com/vitejs/vite/issues/10802)
