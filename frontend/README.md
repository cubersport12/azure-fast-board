# Azure Fast Board

Fast desktop client for **Azure DevOps Server (on-premises)**: Kanban board, Work Items list, and rich work item cards with discussion + screenshot paste.

Built with Electron + React + TypeScript + Tailwind.

## Goals

- Stay in the system tray and appear instantly via hotkey
- Create work items in seconds (`C` or `Ctrl+Shift+N`)
- Move cards on a Kanban board with drag-and-drop
- Browse the same cards as a Work Items list
- Paste screenshots into discussions with `Ctrl+V`

## Quick start

```bash
cd frontend
npm install
npm run dev
```

### Connect to Azure DevOps Server

1. Open **Connect**
2. Enter server URL, collection, project, team
3. Paste a Personal Access Token (PAT)
4. Click **Test**, then **Save**

Required PAT scopes:

- **Work Items**: Read & write
- **Project and Team**: Read

PAT is stored encrypted via Electron `safeStorage` (Windows DPAPI / Credential protection). The renderer never receives the token.

Without a connection the app runs in **demo mode** with sample cards so UI/hotkeys can be tried offline.

## Hotkeys

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+Space` | Show / hide window |
| `Ctrl+Shift+N` | Global quick create |
| `C` | Quick create |
| `Ctrl+K` | Command palette |
| `/` | Focus search |
| `Esc` | Close dialogs |
| `Ctrl+V` | Paste screenshot on work item |
| `?` | Shortcuts help |

## Scripts

```bash
npm run dev          # development
npm run typecheck    # TypeScript
npm test             # unit tests
npm run build        # production build + Windows installer
npm run build:dir    # unpackaged build
```

## Architecture

- `electron/main` — tray, global shortcuts, secure settings/PAT, Azure DevOps REST
- `electron/preload` — typed IPC bridge (`window.azureFastBoard`)
- `shared` — IPC contracts and domain types
- `src/features` — Board, Work Items, Detail, Quick Create, Connection

Azure specifics handled:

- Collection/project/team URLs for on-prem Server
- WIQL + work item batch fetch
- JSON Patch updates with revision concurrency
- Board columns / state mappings
- Dynamic work item types
- Comments + attachment upload

## Corporate TLS

If your server uses a private CA / self-signed certificate, enable **Allow insecure TLS** in Settings (development/trusted networks only).
