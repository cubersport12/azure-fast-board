# Azure Fast Board root

Desktop app lives in [`frontend`](frontend).

```bash
cd frontend
npm install
npm run dev
```

See [`frontend/README.md`](frontend/README.md) for connection setup, hotkeys, and packaging.

## Windows builds (CI)

On every push to `main`, GitHub Actions builds Windows packages:

- **Setup** (`.exe` installer via NSIS)
- **Portable** (`.exe` — run without install)

Download from the repository **Releases** page, or from the workflow **Artifacts**.
