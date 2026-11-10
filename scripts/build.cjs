const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'out')
if (path.dirname(output) !== root || path.basename(output) !== 'out') {
  throw new Error('Build output must be the project out directory.')
}
fs.rmSync(output, { recursive: true, force: true })
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', root], {
  cwd: root,
  stdio: 'inherit'
})
