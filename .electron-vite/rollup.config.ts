import path from 'path'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import { builtinModules } from 'module'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'
import alias from '@rollup/plugin-alias'
import json from '@rollup/plugin-json'
import esbuild from 'rollup-plugin-esbuild'
import obfuscator from 'rollup-plugin-obfuscator'
import { defineConfig } from 'rollup'
import { applyBuildEnvFromArgv, getConfig } from './utils'

applyBuildEnvFromArgv()
const config = getConfig()

/** Native / heavy deps loaded from node_modules at runtime (not bundled). */
const EXTERNAL_PACKAGES = new Set([
  'electron',
  'esbuild',
  'better-sqlite3',
  'bindings',
  'express',
  'ffi-napi',
  'ref-napi',
  'ref-struct-napi',
  'semver',
  'glob',
  'playwright-core',
  'playwright',
  '@playwright/mcp',
  'cloakbrowser',
  'discord.js',
  'zlib-sync',
  'grammy',
  '@whiskeysockets/baileys',
  'node-pty',
  'fsevents',
  'crawlee',
  'jsdom',
])

function isRollupExternal(id: string): boolean {
  if (id.endsWith('.node')) return true
  if (EXTERNAL_PACKAGES.has(id)) return true
  for (const pkg of EXTERNAL_PACKAGES) {
    if (id.startsWith(`${pkg}/`)) return true
  }
  if (id.startsWith('@crawlee/')) return true
  if (id.startsWith('@slack/')) return true
  if (builtinModules.includes(id)) return true
  if (id.startsWith('node:')) {
    const bare = id.slice(5)
    if (builtinModules.includes(bare)) return true
  }
  return false
}

const pathAliases = {
  entries: [
    {
      find: '@main',
      replacement: path.join(__dirname, '..', 'src', 'main'),
    },
    {
      find: '@teralexi/skill-sdk',
      replacement: path.join(__dirname, '..', 'skill-sdk'),
    },
    {
      find: '@toolSet',
      replacement: path.join(__dirname, '..', 'toolSet'),
    },
    {
      find: '@skills',
      replacement: path.join(__dirname, '..', 'skills'),
    },
    {
      find: '@config',
      replacement: path.join(__dirname, '..', 'config'),
    },
    {
      find: '@ipcManager',
      replacement: path.join(__dirname, '..', 'src', 'ipc'),
    },
    {
      find: '@shared',
      replacement: path.join(__dirname, '..', 'src', 'shared'),
    },
    {
      find: '@logging',
      replacement: path.join(__dirname, '..', 'src', 'logging'),
    },
    {
      find: 'pkce-challenge',
      replacement: path.join(
        __dirname,
        '..',
        'node_modules',
        'pkce-challenge',
        'dist',
        'index.node.cjs',
      ),
    },
    {
      find: '@teralexi-ai/vue',
      replacement: path.join(__dirname, '..', 'src', 'teralexi-ai', 'vue.ts'),
    },
    {
      find: '@teralexi-ai/mcp',
      replacement: path.join(__dirname, '..', 'src', 'teralexi-ai', 'mcp.ts'),
    },
    {
      find: '@teralexi-ai/llm-adapter',
      replacement: path.join(
        __dirname,
        '..',
        'src',
        'teralexi-ai',
        'llm-adapter.ts',
      ),
    },
    {
      find: '@teralexi-ai',
      replacement: path.join(
        __dirname,
        '..',
        'src',
        'teralexi-ai',
        'index.ts',
      ),
    },
  ],
}

const MAIN_ENTRY_FILES = {
  bootstrap: path.join(__dirname, '..', 'src', 'main', 'bootstrap.ts'),
  'main-app': path.join(__dirname, '..', 'src', 'main', 'main-app.ts'),
} as const

type MainBuildType = keyof typeof MAIN_ENTRY_FILES | 'preload' | 'main'

function resolveMainBuildType(type: MainBuildType): keyof typeof MAIN_ENTRY_FILES | 'preload' {
  if (type === 'main') return 'main-app'
  return type
}

function isBootstrapMainAppExternal(id: string): boolean {
  return id === './main-app.js' || id === './main-app'
}

export default (env = 'production', type: MainBuildType = 'main-app') => {
  const resolvedType = resolveMainBuildType(type)
  const isPreload = resolvedType === 'preload'

  return defineConfig({
    input: isPreload
      ? path.join(__dirname, '..', 'src', 'preload', 'index.ts')
      : MAIN_ENTRY_FILES[resolvedType],
    output: {
      file: path.join(
        __dirname,
        '..',
        'dist',
        'electron',
        'main',
        `${isPreload ? 'preload' : resolvedType}.js`,
      ),
      format: 'cjs',
      name: isPreload
        ? 'MainPreloadProcess'
        : resolvedType === 'bootstrap'
          ? 'MainBootstrapProcess'
          : 'MainAppProcess',
      inlineDynamicImports: true,
      sourcemap: env !== 'production',
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.userConfig': config ? JSON.stringify(config) : '{}',
        'process.env.TERALEXI_BUILD_ENV': JSON.stringify(
          process.env.TERALEXI_BUILD_ENV ?? 'dev',
        ),
        __TERALEXI_BUILD_ENV__: JSON.stringify(
          process.env.TERALEXI_BUILD_ENV ?? 'dev',
        ),
        __TERALEXI_BASE_API__: JSON.stringify(config?.BASE_API ?? ''),
        __TERALEXI_DESKTOP_UPDATE_FORCE_DEV__: JSON.stringify(
          config?.DESKTOP_UPDATE_FORCE_DEV ?? '',
        ),
        __TERALEXI_ENTITLEMENT_PUBLIC_KEY_PEM__: JSON.stringify(
          config?.ENTITLEMENT_SIGNING_PUBLIC_KEY_PEM ?? '',
        ),
      }),
      alias(pathAliases),
      nodeResolve({
        preferBuiltins: true,
        browser: false,
        extensions: ['.mjs', '.ts', '.js', '.json'],
        exportConditions: ['node', 'import', 'require', 'default'],
      }),
      commonjs({
        sourceMap: env !== 'production',
      }),
      json(),
      esbuild({
        // All options are optional
        include: /\.[jt]s?$/, // default, inferred from `loaders` option
        exclude: /node_modules/, // default
        tsconfig: path.join(__dirname, '..', 'tsconfig.json'),
        // watch: process.argv.includes('--watch'), // configured in rollup
        sourceMap: env !== 'production',
        minify: env === 'production',
        target: 'es2020', // Electron 38 supports modern JS features used by pino
        // Like @rollup/plugin-replace
        define: {
          __VERSION__: '"x.y.z"',
        },
        // Add extra loaders
        loaders: {
          // Add .json files support
          // require @rollup/plugin-commonjs
          '.json': 'json',
          // Enable JSX in .js files too
          '.js': 'jsx',
        },
      }),
      process.env.NODE_ENV == 'production' &&
        obfuscator({
          // Keep relative dynamic-import specifiers intact. String-array encoding
          // previously left paths like ../steps/.../planned-todo-strategy in the
          // asar bundle, which then failed at runtime inside Electron.
          reservedStrings: [
            '\\.\\.\\/',
            '^\\./',
            '^@main/',
            '^@toolSet/',
            '^@config/',
            '^node:',
            // Positive packaging marker for planned-todo strategy (verify-main-bundle).
            'teralexi:planned-todo-strategy-bundled',
            'teralexi:executable-tool-registry-bundled',
            'teralexi:mid-loop-budget-bundled',
            'teralexi:active-tools-tier-bundled',
          ],
        }),
    ],
    external: (id) => {
      if (resolvedType === 'bootstrap' && isBootstrapMainAppExternal(id)) {
        return true
      }
      return isRollupExternal(id)
    },
  })
}
