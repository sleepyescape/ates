# Freefield Studio for Windows

A Windows desktop build of [Freefield](https://github.com/neuregex/freefield): its web studio and its Node server
packed into one Electron app. The server (`server/server.ts`) is bundled into `server-dist/server.mjs` and runs inside
the app on a free local port; the window shows the studio from it.

Generation still runs on a Freefield GPU backend, as in the original: Modal (`modal deploy infra/modal_app.py`) or
your own ComfyUI (`python tools/local_backend.py serve`). Set its address and token in **File → Backend settings**
(`COMFY_BASE_URL`, `FREEFIELD_TOKEN`), or put Freefield's `.env` next to the `.exe`. History goes to
`%APPDATA%\Freefield Studio\out`.

## Build

The workflow `.github/workflows/freefield-windows.yml` builds it on `windows-latest` when run by hand from the Actions tab:
Freefield at a pinned commit, its tests, the bundle, the NSIS installer and the portable exe, a smoke test of the
packaged app (`--smoke`: the built-in server starts and lists the apps), then a GitHub release.

By hand, with Node 22:

```sh
git clone https://github.com/neuregex/freefield ../freefield && (cd ../freefield && npm ci)
npm ci
node scripts/stage.mjs ../freefield
npx electron-builder --win --x64
```
