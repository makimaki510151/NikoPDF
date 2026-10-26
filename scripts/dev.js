import * as esbuild from 'esbuild'
import { build } from './build.js'
import { startServer } from './server.js'

const port = Number(process.env.PORT || 4173)
await build({ dev: true })
const ctx = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  outfile: 'js/app.js',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
})
await ctx.watch()
const server = await startServer({ port })
console.log(`NikoPDF http://127.0.0.1:${port}/`)

process.on('SIGINT', async () => {
  server.close()
  await ctx.dispose()
  process.exit(0)
})
