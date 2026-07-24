import { mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'dist')
mkdirSync(dist, { recursive: true })

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const src = join(root, 'src', 'cli.js')
const out = join(dist, 'cli.js')

copyFileSync(src, out)
if (platform() !== 'win32') {
  try {
    chmodSync(out, 0o755)
  } catch {
    // ignore
  }
}

writeFileSync(
  join(dist, 'version.json'),
  JSON.stringify({ name: pkg.name, version: pkg.version }, null, 2) + '\n',
  'utf8',
)

const bin = join(root, 'bin', 'teralexi')
if (platform() !== 'win32') {
  try {
    chmodSync(bin, 0o755)
  } catch {
    // ignore
  }
}

console.log(`built packages/cli/dist/cli.js (v${pkg.version})`)
