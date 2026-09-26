# Offline use and portable roll backups

Use `/guest` for personal rolls. Development/HMR deliberately does not install a
worker. Opening a secure production address online automatically downloads the
app. There is no persistent offline badge. In the guest darkroom, **Rolls →
Backups & offline → Offline & storage** contains download details, recovery and
storage options. Completed preparation means the active worker has the HTML,
JS/CSS, stock resources, installation icons, and all built-in photo thumbnails
and full viewing images. New guest rolls and originals remain in the
`darkroom-guest-rolls` IndexedDB database. Older `darkroom-rolls` data is
preserved separately, not read by the public home and not automatically copied.

These details separately report server reachability. A stopped local server does
not prevent viewing already downloaded content. First visits need a working
server. Files available only in iCloud or on another server must
be downloaded to the device before importing offline. Browser storage is not a
backup: clearing site data or storage eviction can remove photos and app caches.
Use **Protect saved storage** where supported and keep exported backups.

## Preserve the old library before changing addresses

Protocol, hostname and port are all part of an origin. `http://macbook:5178`,
`http://localhost:5178`, and `https://macbook.tail2b1388.ts.net` have separate
libraries. Adding HTTPS does not transfer or delete the old library.

1. Open the **exact old address** in the same browser/profile where the rolls
   live. Do not clear its site data or uninstall its browser profile.
2. If the old version still runs there, export a `.darkroom` backup first.
   Export includes Trash, original bytes, viewing images, thumbnails, edits,
   frame order, stock/format/sizing, timestamps, cover and saved view. A file
   is limited to 512 MB; export individual rolls if needed.
3. On the **same origin**, open `/guest`, enter the guest darkroom and choose
   **Rolls → Backups & offline → Copy previous darkroom rolls**. This copies
   all old rolls as independent guest copies without changing the old database;
   no migration happens merely by visiting `/` or `/guest`. Repeating the
   action creates duplicates. Export the new guest rolls and verify frames,
   views and Trash before clearing anything.
4. For a **different origin**, export the `.darkroom` file at the old exact
   address first. At the new address, open `/guest` and choose **Rolls →
   Backups & offline → Import backup**. Imported rolls have fresh IDs and
   existing rolls are not overwritten. You cannot copy an old browser database
   across origins without exporting it at the old origin.
5. In **Rolls → Backups & offline → Offline & storage**, confirm that the app
   and built-in photographs downloaded at the new origin before disconnecting.

Backup exports also work at the old insecure HTTP address. New photo import and
service-worker offline access require HTTPS or loopback localhost. In particular,
`http://macbook:5178` is useful for exporting an existing library but cannot make
an offline app. Archives use a versioned binary format with CRC32 corruption
checks, not encryption; keep the files as private as the original photographs.

## iPhone / iPad

Open the private HTTPS address in Safari while connected to the tailnet. Safari's
Share menu → **Add to Home Screen** is optional. Open the installed app online,
import the backup there if its library is separate, and confirm the downloads
in **Rolls → Backups & offline → Offline & storage**.
Then test a full relaunch with Wi-Fi/cellular disabled and the server stopped.
Verify actual photos, Focus/Overview, source detail, loupe, brightness and gestures.
Browser emulation is not evidence of physical Safari/Home Screen behavior.

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

If preparation is interrupted,
**Rolls → Backups & offline → Offline & storage → Retry offline preparation** can retry the
installation or repair missing entries for the active release. Repairs verify
content hashes and will not mix assets from another release. If a release is no
longer on the server, its missing cache entries cannot be repaired: reconnect and
prepare the current release. Export your library before clearing site data.

## Private serving

Build and serve production output locally from the active checkout. The tracked
runtime images and camera GLBs require no private asset store or authoring
converter. Inspect existing port owners and Tailscale Serve mappings before
changing them. Use a stable origin, preserve HTTP for migration, and never enable
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
HTTP mapping only as needed for existing-library migration; use HTTPS for new
device imports and offline installation.

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
all existing E2E suites plus `m18-offline.spec.ts`. No retry or skip is added.
The offline suite uses actual service workers, browser Cache Storage and IndexedDB;
isolated HTTP servers allow real server shutdown and interrupted downloads without
stopping another worktree's app. A temporary self-signed HTTPS origin tests archive
migration separately from the real Tailscale certificate/device review.

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

The app/sample offline inventory and optional camera download remain separate
from published owner photographs. The public home requests catalog metadata
and cover thumbnails, not every viewing image. Opening a published roll requests
its viewing derivatives. The public shelf is read-only and offers no browser
download/edit action. Previously saved `darkroom-gallery` offline copies remain
in browser storage but are not surfaced by this route; do not clear the old
origin if those downloads matter. A withdrawn public image may remain in
screenshots, caches or old offline copies.

Guest rolls are browser-local, not synchronized or uploaded. Their backups
include originals and Trash. Browser eviction or site clearing can erase both
guest rolls and retained earlier `darkroom-rolls`/`darkroom-gallery` data.

Owner drafts, authenticated originals, Access navigation and upload credentials
are excluded from the service-worker cache. The Admin workspace blocks app
updates while open. Owner browser memory is not cloud backup; follow
[cloud backup and recovery](CLOUD_GALLERY.md).

Before moving to `https://filmreverie.app`, export at the exact old origin and
import at the new one using the migration steps above. For owner cloud migration,
choose the backup explicitly in Owner; opening it prepares an independent draft
without reading or changing the visitor library, and uploads only on **Save
private draft**. Verify order, crops, rotation, cover and saved view before
publication. Never clear or retire the old origin until its backup is verified.
