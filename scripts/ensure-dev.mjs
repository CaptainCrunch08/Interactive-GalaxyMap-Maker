import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const port = 5173
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = path.join(os.tmpdir(), 'interactive-galaxy-map-maker-dev.lock')
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function probe(host) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const finish = (open) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

async function portOpen() {
  return (await probe('127.0.0.1')) || (await probe('::1'))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readLock() {
  try {
    return Number(fs.readFileSync(lockPath, 'utf8'))
  } catch {
    return NaN
  }
}

const existing = readLock()
if (pidAlive(existing)) {
  console.log(`  ➜  Local:   http://localhost:${port}/`)
  process.exit(0)
}

fs.writeFileSync(lockPath, String(process.pid))

function removeLock() {
  try {
    if (readLock() === process.pid) fs.unlinkSync(lockPath)
  } catch {
    // The lock file is already gone.
  }
}

let child = null
let stopping = false

function stop() {
  stopping = true
  if (child && !child.killed) child.kill()
  removeLock()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', removeLock)

if (!fs.existsSync(viteBin)) {
  console.error('Vite is not installed. Run npm install in the project folder.')
  process.exit(1)
}

let announced = false
while (!stopping) {
  if (await portOpen()) {
    if (!announced) {
      console.log(`  ➜  Local:   http://localhost:${port}/`)
      announced = true
    }
    await sleep(3000)
    continue
  }

  announced = false
  child = spawn(process.execPath, [viteBin], {
    cwd: root,
    stdio: 'inherit',
  })
  const code = await new Promise((resolve) => {
    child.once('exit', (exitCode) => resolve(exitCode))
  })
  child = null
  if (stopping) break
  console.error(`Dev server stopped (${code ?? 'unknown'}). Starting it again...`)
  await sleep(1000)
}
