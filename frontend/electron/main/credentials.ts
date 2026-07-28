import { safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'secrets.enc'
const LEGACY_PAT = 'pat.enc'

interface StoredSecrets {
  pat?: string
  password?: string
}

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME)
}

function legacyPatPath() {
  return path.join(app.getPath('userData'), LEGACY_PAT)
}

function writeSecrets(secrets: StoredSecrets) {
  const payload = JSON.stringify(secrets)
  if (!safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(filePath(), Buffer.from(payload, 'utf8'))
    return
  }
  fs.writeFileSync(filePath(), safeStorage.encryptString(payload))
}

function readSecrets(): StoredSecrets {
  const target = filePath()
  if (fs.existsSync(target)) {
    const raw = fs.readFileSync(target)
    try {
      const text = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8')
      return JSON.parse(text) as StoredSecrets
    } catch {
      return {}
    }
  }

  // migrate legacy PAT file
  const legacy = legacyPatPath()
  if (fs.existsSync(legacy)) {
    const raw = fs.readFileSync(legacy)
    try {
      const pat = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8')
      const secrets = { pat }
      writeSecrets(secrets)
      fs.unlinkSync(legacy)
      return secrets
    } catch {
      return {}
    }
  }

  return {}
}

export function savePat(pat: string) {
  const secrets = readSecrets()
  secrets.pat = pat
  writeSecrets(secrets)
}

export function loadPat(): string | null {
  return readSecrets().pat || null
}

export function savePassword(password: string) {
  const secrets = readSecrets()
  secrets.password = password
  writeSecrets(secrets)
}

export function loadPassword(): string | null {
  return readSecrets().password || null
}

export function clearSecrets() {
  for (const target of [filePath(), legacyPatPath()]) {
    if (fs.existsSync(target)) fs.unlinkSync(target)
  }
}

/** @deprecated use clearSecrets */
export function clearPat() {
  clearSecrets()
}
