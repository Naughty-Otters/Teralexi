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
import { getConfig } from './utils'
const config = getConfig()

/** Native / heavy deps loaded from node_modules at runtime (not bundled). */
const EXTERNAL_PACKAGES = new Set([
  'electron',
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
      find: '@openfde/skill-sdk',
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
      find: '@openfde-ai/vue',
      replacement: path.join(__dirname, '..', 'src', 'openfde-ai', 'vue.ts'),
    },
    {
      find: '@openfde-ai/mcp',
      replacement: path.join(__dirname, '..', 'src', 'openfde-ai', 'mcp.ts'),
    },
    {
      find: '@openfde-ai/llm-adapter',
      replacement: path.join(
        __dirname,
        '..',
        'src',
        'openfde-ai',
        'llm-adapter.ts',
      ),
    },
    {
      find: '@openfde-ai',
      replacement: path.join(
        __dirname,
        '..',
        'src',
        'openfde-ai',
        'index.ts',
      ),
    },
  ],
}

export default (env = 'production', type = 'main') => {
  return defineConfig({
    input:
      type === 'main'
        ? path.join(__dirname, '..', 'src', 'main', 'index.ts')
        : path.join(__dirname, '..', 'src', 'preload', 'index.ts'),
    output: {
      file: path.join(
        __dirname,
        '..',
        'dist',
        'electron',
        'main',
        `${type === 'main' ? type : 'preload'}.js`,
      ),
      format: 'cjs',
      name: type === 'main' ? 'MainProcess' : 'MainPreloadProcess',
      inlineDynamicImports: true,
      sourcemap: env !== 'production',
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.userConfig': config ? JSON.stringify(config) : '{}',
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
      process.env.NODE_ENV == 'production' && obfuscator({}),
    ],
    external: isRollupExternal,
  })
}
