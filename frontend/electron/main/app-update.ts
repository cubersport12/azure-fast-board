import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  formatAppVersionLabel,
  isRemoteVersionNewer,
  parseGithubReleaseTag,
} from '../../shared/utils'
import type { AppUpdateCheckResult } from '../../shared/types'
import { azureFetch } from './azure/http'

export const GITHUB_RELEASES_URL = 'https://github.com/cubersport12/azure-fast-board/releases'
const GITHUB_LATEST_URL = `${GITHUB_RELEASES_URL}/latest`

function readBuildNumber() {
  try {
    const raw = readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { buildNumber?: string | number }
    return String(pkg.buildNumber ?? '').trim()
  } catch {
    return ''
  }
}

export function currentAppLabel() {
  return formatAppVersionLabel(app.getVersion(), readBuildNumber())
}

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentLabel = currentAppLabel()
  // Chromium net.fetch (via azureFetch) uses the Windows system proxy; Node fetch does not.
  const response = await azureFetch(GITHUB_LATEST_URL, {
    headers: { Accept: 'text/html', 'User-Agent': 'azure-fast-board' },
    redirect: 'follow',
  })
  if (!response.ok) {
    throw new Error(`GitHub Releases: HTTP ${response.status}`)
  }
  const html = await response.text()
  const latestTag = parseGithubReleaseTag(response.url) || parseGithubReleaseTag(html)
  const latestUrl = latestTag
    ? `${GITHUB_RELEASES_URL}/tag/${latestTag}`
    : GITHUB_RELEASES_URL
  return {
    currentLabel,
    latestTag,
    latestUrl,
    hasUpdate: Boolean(latestTag) && isRemoteVersionNewer(currentLabel, latestTag),
  }
}
