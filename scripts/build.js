import * as esbuild from 'esbuild'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'))

export async function copyAssets() {
  await mkdir('js', { recursive: true })
  await mkdir('cmaps', { recursive: true })
  await mkdir('standard_fonts', { recursive: true })
  await copyFile(join(pdfjsDir, 'build/pdf.worker.min.mjs'), 'js/pdf.worker.js')
  await cp(join(pdfjsDir, 'cmaps'), 'cmaps', { recursive: true })
  await cp(join(pdfjsDir, 'standard_fonts'), 'standard_fonts', { recursive: true })
  const index = await readFile(new URL('../index.html', import.meta.url))
  await writeFile(new URL('../404.html', import.meta.url), index)
}

export async function build({ dev = false } = {}) {
  await copyAssets()
  await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'esm',
    outfile: 'js/app.js',
    platform: 'browser',
    target: ['es2022'],
    minify: !dev,
    sourcemap: dev,
    legalComments: 'none',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
    },
  })
}

if (process.argv[1]?.endsWith('build.js')) {
  await build({ dev: process.argv.includes('--dev') })
}
