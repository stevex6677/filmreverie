# Offline use and portable roll backups

Use the production app. Development/HMR deliberately does not install a worker.
After opening a secure production address online, wait for **Available offline**.
This means the active worker has the HTML, JS/CSS, stock resources, installation
icons, and all built-in photo thumbnails and full viewing images. Imported rolls
and originals remain in the existing `darkroom-rolls` IndexedDB database.

The offline details separately report server reachability. A stopped server or
SSH tunnel does not prevent viewing already downloaded content. First visits
need a working server. Files available only in iCloud or on another server must
be downloaded to the device before importing offline. Browser storage is not a
backup: clearing site data or storage eviction can remove photos and app caches.
Use **Protect saved storage** where supported and keep exported backups.

## Preserve the old library before changing addresses

Protocol, hostname and port are all part of an origin. `http://macbook:5178`,
`http://localhost:5178`, and `https://macbook.tail2b1388.ts.net` have separate
libraries. Adding HTTPS does not transfer or delete the old library.

1. Open the **exact old address** in the same browser/profile where the rolls live.
   The production app with backup controls must be served there first. Do not
   clear its site data or uninstall its browser profile.
2. In **Rolls**, choose **Export all rolls**, or **Actions → Export [roll]**.
   Save the `.darkroom` download in Files. Exports include Trash, original bytes,
   viewing images, thumbnails, crop/rotation, frame order, stock/format/sizing,
   timestamps, cover and saved view. Each file is limited to 512 MB; export
   individual rolls when a library is larger. Photos stay on the device.
3. Open the new HTTPS address. In **Rolls → Import backup**, select the file.
   All rolls are imported atomically as independent copies with fresh IDs.
   Importing twice creates two copies. Existing rolls are never overwritten.
   Damaged, truncated or unsupported backups are rejected before writing.
4. Open the imported rolls and verify photos, frame order, crop and saved views.
   Check Trash separately. Keep both the old library and backup until verified.
5. Wait for **Available offline** at the new origin before disconnecting.

Backup exports also work at the old insecure HTTP address. New photo import and
service-worker offline access require HTTPS or loopback localhost. In particular,
`http://macbook:5178` is useful for exporting an existing library but cannot make
an offline app. Archives use a versioned binary format with CRC32 corruption
checks, not encryption; keep the files as private as the original photographs.

## iPhone / iPad

Open the private HTTPS address in Safari while connected to the tailnet. Safari's
Share menu → **Add to Home Screen** is optional. Open the installed app online,
import the backup there if its library is separate, and check **Available offline**.
Then test a full relaunch with Wi-Fi/cellular disabled and the server stopped.
Verify actual photos, Focus/Overview, source detail, loupe, brightness and gestures.
Browser emulation is not evidence of physical Safari/Home Screen behavior.

## Updates and recovery

A new worker downloads and SHA-256 verifies a complete release into a separate
cache. The existing app keeps its own cache until the update is ready and the
user chooses **Apply update and reload**. Save/cancel drafts and close the library
first. Other Darkroom tabs/windows must be closed. The current saved view is
committed before activation. Automatic activation after all old pages are closed
uses the browser's normal worker lifecycle. Activation only cleans Darkroom app
caches; it never changes or deletes IndexedDB photos.

If preparation is interrupted, **Retry offline preparation** can retry the
installation or repair missing entries for the active release. Repairs verify
content hashes and will not mix assets from another release. If a release is no
longer on the server, its missing cache entries cannot be repaired: reconnect and
prepare the current release. Export your library before clearing site data.

## Private serving

Follow AGENTS.md: build/test in the mapped remote worktree, flush `orca-worktrees`,
then start a production preview there. Inspect existing port owners and Serve
mappings before changing them. Use a stable origin, preserve HTTP for migration,
and never enable Funnel.

On this Mac the connected Tailscale CLI is
`/Applications/Tailscale.app/Contents/MacOS/Tailscale`; the command at
`/usr/local/bin/tailscale` may address a different, stopped daemon. Recheck
`status --json` and `serve status`; do not infer connection state from the wrong CLI.

Example setup after confirming the ports and hostname:

```sh
# The app process runs remotely; localhost is an SSH forward.
ssh -N -L 5178:127.0.0.1:5178 remote
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --http=5178 http://127.0.0.1:5178
/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg --https=443 http://127.0.0.1:5178
```

The stable private origin is `https://macbook.tail2b1388.ts.net` when that mapping
and its certificate have been verified. HTTPS may require enabling certificates
in the tailnet's admin settings. Keep the verified hostname in Vite's allowlist
(`FILM_PHOTO_ALLOWED_HOSTS` can override it). Use the full hostname for HTTPS;
a short `https://macbook` name does not match the certificate.

Implementation references: [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers),
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Validation

`npm run validate:m18` builds production output, runs every integration test and
all existing E2E suites plus `m18-offline.spec.ts`. No retry or skip is added.
The offline suite uses actual service workers, browser Cache Storage and IndexedDB;
isolated HTTP servers allow real server shutdown and interrupted downloads without
stopping another worktree's app. A temporary self-signed HTTPS origin tests archive
migration separately from the real Tailscale certificate/device review.

The build creates installation PNGs and a content-addressed `sw.js`; generated
binaries and review captures stay untracked. `src/offline/worker.js` is the worker
source and `scripts/build-offline.mjs` inventories every file in production output.

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
