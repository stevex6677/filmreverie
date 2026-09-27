# App caching, updates and browser storage

Guest rolls are stored at best effort in the browser's `darkroom-guest-rolls`
IndexedDB database, without uploads or synchronization. Roll creation, editing
and deletion are available in film shelf mode. There are no guest backup,
migration, offline status or persistent-storage controls. Older `darkroom-rolls`
data remains separate and untouched.

Development/HMR does not install a service worker. Opening a secure production
address online automatically caches the app and built-in photographs. First
visits need a working server. App caching and update delivery remain automatic;
guest storage does not depend on an offline setup flow.

## Updates and recovery

A new worker downloads and SHA-256 verifies a complete release into a separate
cache. The existing app keeps its own cache until the update is ready and the
user presses the single **Update Available** button. The notice
occupies its own row above the viewer, reserving space for all existing controls
on desktop, tablet and phone. It disappears after the update. The app checks for
new releases every minute while visible, on returning to the app and on reconnect.
Save/cancel drafts and close the library
first. Other Darkroom tabs/windows must be closed. The current saved view is
committed before activation. Automatic activation after all old pages are closed
uses the browser's normal worker lifecycle. Activation only cleans Darkroom app
caches; it never changes or deletes IndexedDB photos.

## Private serving

Build and serve production output locally from the active checkout. The tracked
runtime images and camera GLBs require no private asset store or authoring
converter. Inspect existing port owners and Tailscale Serve mappings before
changing them. Use a stable origin and never enable
Funnel. No SSH tunnel or remote execution setup is needed.

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 5178
```

Open the actual localhost URL printed by the server. For private device access,
use the connected local Tailscale CLI and inspect `tailscale status --json` and
`tailscale serve status` first. On macOS the app-bundled CLI may be
`/Applications/Tailscale.app/Contents/MacOS/Tailscale`; use it if the command on
PATH addresses a different or stopped daemon.

In a separate terminal, after confirming the ports and private hostname:

```sh
# Both mappings proxy directly to the local production app.
tailscale serve --bg --http=5178 http://127.0.0.1:5178
tailscale serve --bg --https=443 http://127.0.0.1:5178
```

Verify localhost and private-hostname responses before sharing links. Retain the
existing mappings; use HTTPS for device access and app caching.

The previously used private origin is `https://macbook.tail2b1388.ts.net`; its
mapping, certificate and app responses were verified on 2026-09-16. That is
historical evidence, not a guarantee of the current host or mapping. Use the
hostname reported by the connected local tailnet. HTTPS may require enabling
certificates in tailnet admin settings. Keep the verified hostname in Vite's
allowlist (`FILM_PHOTO_ALLOWED_HOSTS` can override it). Use the full hostname for
HTTPS; a short `https://macbook` name does not match the certificate.

Implementation references: [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Validation

`npm run validate:m18` builds production output, runs every integration test and
the cumulative E2E suites, including `m18-offline.spec.ts`.
The offline suite uses actual service workers, browser Cache Storage and IndexedDB;
isolated HTTP servers allow real server shutdown and interrupted downloads without
stopping another worktree's app.

The build creates installation PNGs and a content-addressed `sw.js` in ignored
production output; review captures also stay untracked. Required published
runtime images and GLBs under `public/assets/` are tracked separately.
`src/offline/worker.js` is the worker source and `scripts/build-offline.mjs`
inventories every file in production output.

The Linux Playwright WebKit build rejects even cached worker fetches when
`context.setOffline(true)` is enabled (confirmed with a controlled page, an
activated worker and a populated cache). Chrome tests disable networking; WebKit
executes the same full photo/import/reopen journey with its isolated server
stopped. This is not a physical iOS airplane-mode claim or a skipped test.
Actual iPhone/iPad Safari and Home Screen offline relaunch still need review.

On a host with a low thread/process quota, set `PLAYWRIGHT_WORKERS=1` and
`PLAYWRIGHT_STATIC_PREVIEW=1` for the same cumulative gate. The latter serves
the exact production `dist` with `scripts/serve-production.mjs`, avoiding Vite's
bundler worker pool. The static server binds only loopback and uses the same
hostname allowlist (`FILM_PHOTO_ALLOWED_HOSTS`). `PORT=5178 node
scripts/serve-production.mjs` can also serve the private production preview.
Keep development on a different origin/port from the installed production PWA.

## Published gallery and guest offline storage

The app/sample cache and camera model cache remain separate
from published owner photographs. The public home requests catalog metadata
and cover thumbnails, not every viewing image. Opening a published roll requests
its viewing derivatives. The public shelf is read-only and offers no browser
download/edit action. Previously saved `darkroom-gallery` offline copies remain
in browser storage but are not surfaced by this route; do not clear the old
origin if those downloads matter. A withdrawn public image may remain in
screenshots, caches or old offline copies.

Guest rolls are browser-local and stored at best effort, without backup export
or import.

Owner drafts, authenticated originals, Access navigation and upload credentials
are excluded from the service-worker cache. The Admin workspace blocks app
updates while open. Owner browser memory is not cloud backup; follow
[cloud backup and recovery](CLOUD_GALLERY.md).
