#!/usr/bin/env node
/**
 * Cut a release: bump package.json, commit, tag vX.Y.Z, and push. The tag triggers the Release
 * workflow, which waits for approval before deploying to production.
 *   pnpm release patch|minor|major
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const kind = process.argv[2]
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('usage: pnpm release <patch|minor|major>')
  process.exit(1)
}
const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

if (sh('git rev-parse --abbrev-ref HEAD') !== 'main') throw new Error('Release from main.')
if (sh('git status --porcelain')) throw new Error('Working tree is not clean.')
sh('git fetch origin main')
if (sh('git rev-parse HEAD') !== sh('git rev-parse origin/main')) throw new Error('Local main differs from origin/main. Pull or push first.')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [maj, min, pat] = pkg.version.split('.').map(Number)
const next = kind === 'major' ? `${maj + 1}.0.0` : kind === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`
pkg.version = next
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')

sh('git add package.json')
sh(`git commit -m "Release v${next}"`)
sh(`git tag -a v${next} -m "v${next}"`)
sh('git push origin main')
sh(`git push origin v${next}`)
console.log(`Tagged v${next}. Approve the deploy at https://github.com/jakeknowlton/cadence/actions`)
