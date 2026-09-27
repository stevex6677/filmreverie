# M21 — Owner gallery and visitor-local darkroom review

Status: **Free-Worker publishing cutover implemented locally; hosted and physical-device acceptance remain open.** Owner identity and Access audience remain absent from tracked configuration. The operator reports R2 activation, bucket creation/CORS, nameserver migration, owner-only Access, privately stored R2 signing credentials, a connected public photo domain last shown initializing, a deployed photo-host cache bypass, Worker deployment with all four Worker secrets and a corrected Pages redeployment; these remote changes were not made or configuration-retested here. Read-only hosted requests through Cloudflare's authoritative edge returned an empty gallery catalog and an anonymous owner-session redirect, but local DNS still resolved to old parking addresses. The new Pages preview rendered the guest disclosure at `/guest?welcome=1`, preserving the path; its non-Worker hostname still cannot serve the same-origin gallery API. Apex/www custom-domain setup and hosted publication remain open. This assistant deployed the existing API Worker with explicit approval on 2026-09-26; see the current deployment record below. M21 and M20 acceptance are not inferred from these checks.

**Current approved admin-login Worker deployment (2026-09-26):** Version `6142fc6a-39ba-45f3-a7ca-2bc4a9af07b9` is active on the existing `filmreverie.app/api/*` route, superseding `b5669078-9a61-40a9-af68-5c5528e9b3a6`. The opt-in local bridge returns real Access authentication to the exact initiating dev URL, retains the verified token server-side, and forwards add/delete/restore to the published gallery. PKCE, exact callback allowlists, single-use one-minute codes, opaque HttpOnly sessions and local mutation-origin checks protect the handoff. Build, all 296 integration tests, Worker type check and deployment dry-run passed. Phone-width Chrome exercised the actual bridge and in-memory Worker/R2 end to end: login return, publish/edit, session expiry with draft retention, delete, Undo, Trash restore, public browsing and guest isolation. The actual HTTPS Tailscale preview serves the app/gallery and emits its own callback URL; invalid production exchange proof is rejected. Completed real owner login and physical iPad acceptance remain unverified. Frontend menu/shared-editor changes remain local. See [bridge startup and architecture](CLOUD_GALLERY.md).

Four additional desktop/touch Chrome menu regressions passed. An actual private-preview iPad-size Chrome tap reached `/api/dev-auth/login` (303), then real Cloudflare login in the same tab, with the callback pointing to the private HTTPS dev origin. The reviewed screenshot shows only **Admin Login** in the dropdown. The published catalog remained unchanged after deployment and these read-only hosted checks. This does not establish completed owner authentication or physical iPad/Safari acceptance.

**Current Free-Worker cutover (2026-09-25):** Admin canvas-re-encodes JPEG viewing images and thumbnails before upload; R2 receives derivatives only, never source originals. The Worker signs five-minute private-bucket PUTs, verifies object metadata, seals and streams derivatives without decoding image content, publishes bounded batches via a versioned public R2 catalog with a conditional private pointer, and resumes bounded numeric-generation withdrawal. The paid CPU setting and server JPEG sanitizer were removed. Fresh `/` gallery sessions load current public catalog URLs; `/guest` remains browser-local. Browser E2E exercised an input JPEG bearing `GPS PRIVATE LOCATION` and verified its absence from uploaded derivatives; it cannot prove behavior of a compromised browser. See [current architecture and required hosted CPU measurements](CLOUD_GALLERY.md).

**Current exercised checks:** `npm run build` and `WRANGLER_SEND_METRICS=false npm run check:cloud` passed (Worker dry-run only); the final integration suite passed **285 tests in 39 files**. The desktop Admin flow saved and previewed a real browser-derived draft, published it through a local Worker/Access/R2 simulation, loaded the published image in a new gallery browser context and verified the guest shelf remained separate. The desktop/mobile gallery run passed 11/12 cases; one mobile-WebKit welcome-dialog readiness race was corrected in the test and the failing case then passed in a focused rerun. An in-memory five-photo local route diagnostic measured at most 34 fake R2 calls for a publication invocation, plus one Access-JWKS lookup; see the per-route table in the deployment guide. These local checks are **not** Cloudflare Free CPU measurements or proof of production S3 enforcement.

**Pages routing correction (2026-09-26):** The first hosted preview's `/guest` response was HTTP 308 to `/`, so the Pages `_redirects` file was removed. Cloudflare's documented SPA fallback applies when no top-level `404.html` exists. A rebuilt local `wrangler pages dev dist` returned HTTP 200 without redirects for `/guest` and `/guest/`; the browser kept `/guest?welcome=1` and displayed the guest darkroom disclosure. The operator redeployed this build to `https://5be64739.filmreverie.pages.dev/`, where a browser again kept `/guest?welcome=1` and displayed the disclosure. The local Pages preview serves HTML on `/api/gallery`; the deployed apex Worker route must handle that path in production.

**Apex activation in progress (2026-09-26):** After the operator confirmed replacement of the two imported parking A records, the Pages dashboard showed `filmreverie.app` Initializing. Read-only forced-edge HTTPS requests returned Film Reverie HTML and an empty JSON catalog from `/api/gallery`; an ordinary browser connection still failed TLS because the local recursive resolver returned parking addresses. Pages activation, ordinary-DNS reachability and owner/photo workflows remain unverified.

**Historical record below:** Earlier M21 reviews measured a different server-sanitized, original-retaining implementation and gallery layout. Their test counts, workerd reports, screenshots and acceptance blockers are historical facts, **not** validation of this Free-Worker cutover. The current path is `/` for published rolls and `/guest` for local rolls. Do not infer acceptance from historical results.

## Historical route verification (before Free-Worker cutover)

- `npm run build` passed with a 65-asset offline release; `npm run
  test:integration` passed 281 tests in 38 files; `WRANGLER_SEND_METRICS=false
  npm run check:cloud` passed TypeScript and Wrangler dry-run. No deployment.
- `PLAYWRIGHT_WORKERS=1 npm run test:e2e -- m21-gallery --project=desktop
  --project=mobile-chrome --project=mobile-webkit` passed 9 cases. Real HTTP
  fixtures exercised the public catalog/cover/viewing path, denied anonymous
  owner editing, new-tab guest entry, first-visit disclosure, deletion across
  reload, browser isolation and explicit previous-library copy without
  changing the source database.
- Three selected historical desktop viewer/import/shelf cases passed after
  migrating local editing tests to `/guest`. A captured public cabinet frame
  was inspected: the published fixture cover appears in the physical first
  cell, with no owner image on the table until it is opened. Desktop and phone
  browser reviews inspected the guest privacy card and backup controls.
- Built static preview served `/guest` and `/guest/` as HTML and kept
  `/api/gallery` outside the app-shell fallback. Localhost and the configured
  private Tailscale hostname returned 200 for `/guest`.
- On the final production build, `PLAYWRIGHT_STATIC_PREVIEW=1
  PLAYWRIGHT_PORT=5199 PLAYWRIGHT_WORKERS=1 npm run test:e2e --
  m21-gallery --project=desktop` passed all 3 route cases.
- A broader one-worker desktop run was started and stopped after the first 21
  cases passed to avoid prolonged WebGL CPU load. The full cumulative browser
  gate remains open; those partial results do not count as a full pass.

Real owner Access authentication, hosted publication, current-domain public
photographs and physical phone/iPad acceptance remain unverified until the
operator authorizes and configures the Cloudflare account and domain.

## Delivered source

- `cloudflare/` now contains Access JWT authorization, short-lived signed private R2 derivative PUTs, metadata-only validation, immutable derivative drafts, bounded streaming publication, conditional versioned catalog updates and resumable withdrawal. **Historical version at the time of the checks below** instead retained exact private originals and ran a server-side sanitizer; those observations do not describe the current source.
- `src/cloud/`: explicit owner photo/archive workflow, saved preview and publication confirmation, public thumbnail-first gallery, existing-viewer adapters, and a separate atomic `darkroom-gallery` offline database.
- `src/App.tsx`, `src/components/RollEditor.tsx`: Gallery / My darkroom / Owner entry points, cloud-viewer resource ownership, visitor-local privacy explanation, and no cloud-roll writes into the local library. The local-roll error path uses the existing loading lifecycle so recovery navigation remains reachable.
- `src/components/ShelfRollCard.tsx`, `src/index.css`: viewport-anchored card portal and 44 px controls; viewer layout containment no longer shifts phone edit/delete controls below the viewport.
- `src/offline/worker.js`, `scripts/build-offline.mjs`, Pages files and Vite configuration: authenticated/Access network bypass, unchanged verified release bytes, hosting configuration excluded from offline inventory, optional same-origin local API proxy.
- Regression coverage in `tests/integration/m21-*` and `tests/e2e/m21-gallery.spec.ts`; `validate:m21` includes application build, Worker type-check/dry-run, cumulative integration/browser suites and all three standalone viewer gates.
- `tests/e2e/helpers/viewing.ts` and the M10–M13 browser cases: framebuffer synchronization, consistent page/canvas loupe coordinates, geometry-based image sampling and asynchronous editor/image readiness. Viewer keyboard focus no longer depends on a globally unique heading. Optical tolerances, artwork and assets remain unchanged.
- [Cloud deployment/privacy/recovery guide](CLOUD_GALLERY.md), [offline migration/download guide](OFFLINE.md), README and implementation plan.

No production accounts, DNS records, public buckets, hosting services or photos were provisioned/deployed. No Git commit was made. Existing runtime model/photo assets and private authoring storage were not changed.

## Exercised checks

- `npm run build`: passed application TypeScript and Vite build; final offline release `07b1633e81e995a07be3` contains 65 required assets. Existing large-chunk warning remains (main JS approximately 1.36 MB before gzip).
- `WRANGLER_SEND_METRICS=false npm run check:cloud`: passed Worker TypeScript and real Wrangler dry-run bundling, approximately 169 KiB uncompressed / 37 KiB gzip. No deployment.
- `npm run test:integration`: **281 tests passed in 38 files**. Coverage includes signed-owner identity/claims, grant signing scope, invalid media and expiry, private/public separation, publication failures and conflicts, withdrawal concurrency, gallery integrity/cancellation/quota rollback and local-storage isolation.
- `PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_STATIC_PREVIEW=1 PLAYWRIGHT_PORT=5199 PLAYWRIGHT_OUTPUT_DIR=artifacts/m21-final npm run test:e2e -- m21-gallery`: **6 passed** across desktop Chromium, mobile Chromium and mobile WebKit (117 seconds). Real local HTTP fixtures cover CORS and service-worker-controlled requests; checks include server-stopped offline reload, saved-copy removal isolation, visitor import/edit/reopen with zero API traffic, independent browser libraries and actual HTTP 401 leaving owner editing/publication unavailable.
- **Final affected-path run on the final build: 19 passed (559 seconds)**, including all six M21 desktop/mobile cases, the repaired M11/M12/M13 paths and update-notice/reload geometry on all three browser projects. Report: `artifacts/m21-final-affected.json`; captures: `artifacts/m21-final-affected/`. This is scoped regression evidence, not a substitute for the incomplete cumulative gate.
- A throwaway script ran the actual bundled Worker in **workerd with real local Miniflare R2 bindings**, generated RSA Access JWTs and a local trusted-JWKS response. It exercised owner session, denied anonymous/wrong-owner/expired-JWT access, exact private-original retention, sensitive APP1 removal, private draft invisibility, publication/revision without redeployment, stale-preview 409, withdrawal of all public versions, and retained private originals. Both a real 1536×1024 harbor photograph and a 2048×1365 derivative passed.
- The actual workerd smoke found an incompatibility hidden by Node fetch: Workers rejects `redirect: 'error'`. JWKS retrieval now uses `manual` and rejects non-success responses, preserving the no-redirect trust boundary; the real runtime then passed.
- The app's 0–100 film-strength domain initially conflicted with the gallery parser's 0–1 bound. A 50-strength catalog reproduced rejection; the parser and regression fixture now use the existing 0–100 domain.
- Standalone gates: **catalog 3 passed; reuse passed; full browser passed on desktop and emulated iPad Chromium**, with drag/zoom/auto-rotation and no page errors. Final combined run completed in 270 seconds; evidence is in `artifacts/model-viewer/2026-09-25T07-45-40-015Z/`. Earlier timeout/interruption did not produce a pass. The initial Playwright 1.58.2 install required `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium` on this host.
- Actual Chrome optical diagnostics exercised all 80 loupe comparisons, both film modes, 30%/100% brightness and 1.5×/2.5×/4×/8×/10× magnification. Maximum RGB difference was 1.866 against the unchanged `<16` bound. Transmission/detail at 30/60/100, real workbench spill, full-roll endpoints and keyboard navigation also passed. Evidence: `artifacts/m21-review/cumulative-optics-smoke.json`.
- Additional real-Chrome M13 diagnostics preserved all original optical bounds: projected wall luminance was 0 / 8.957 / 21.9224 / 43.1957; the lights-off diffuser and safelight remained illuminated. All 18 stock/mode/table-brightness combinations had zero photo/loupe difference across room-light endpoints after using the public Fit roll control for equal framing. Evidence: `artifacts/m21-m13-optical-smoke.json`. The tests now sample physical geometry rather than obsolete fixed screen coordinates.
- Removed the M11 fixture's incidental “exactly five startup detail requests” assertion: the essential offline installer legitimately fetches the same files separately. Photometry/detail/loupe/error assertions remain; request logs remain diagnostic evidence.

The workerd script inserted bytes into **local R2 staging** using the paths in actual grants. It did not send a production S3 PUT, verify hosted R2 signature enforcement/CORS, authenticate with the real Cloudflare Access service or validate production CDN behavior. Those are separate blocked acceptance checks, not implied by local success.

## Cumulative browser gate — not passed

`PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_STATIC_PREVIEW=1 PLAYWRIGHT_PORT=5199 PLAYWRIGHT_OUTPUT_DIR=artifacts/m21-cumulative-results npm run test:e2e -- --reporter=line,json` invoked all **257** configured cases. The command reached its **3,600-second deadline after starting case 112**, with **29 reported failures**. There is no completed aggregate pass. Failure captures remain in `artifacts/m21-cumulative-results/`; both desktop M21 cases passed within this attempt.

Corrections made from that evidence cover M11's incidental startup-fetch count, M12 image/editor readiness and focus restoration, and M13 geometry/equal-framing assumptions. The M18 update test also no longer assumes the viewer starts at y=0 and occupies the entire window: it retains the actual non-overlap and update/reload checks with the new navigation row present.

All eleven failing desktop cases addressed above passed in the final 19-case run. Reproduction command:

```sh
PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_STATIC_PREVIEW=1 PLAYWRIGHT_PORT=5201 \
PLAYWRIGHT_OUTPUT_DIR=artifacts/m21-final-affected \
PLAYWRIGHT_JSON_OUTPUT_NAME=artifacts/m21-final-affected.json \
npm run test:e2e -- m11-full-roll-navigation m12-roll-library \
  m13-room-exploration m18-offline m21-gallery \
  --grep 'M21|combined stocks|M12 real import|M12 cancellation during|M12 crop fills|M13 room illumination|M13 photo independence|M18 update notice' \
  --reporter=line,json
```

Other reported failures remain in M16 zoom/focus, M17 loupe drag/touch/keyboard/optics, M18 shelf/angle interaction, M19 resize/framing, M2/M3 optical sampling and M20 camera interaction/touch/viewport checks. Their complete attribution and repair are not established by the scoped M21 pass. No visual baseline was automatically approved, and no old milestone was re-accepted. The outstanding complete cumulative run remains part of M21 acceptance.

## Actual surface review

An isolated Vite process ran locally from this checkout at `http://127.0.0.1:5191/`; no existing service or Tailscale mapping was repointed. Chromium review used an explicitly local gallery-catalog response with the tracked harbor photograph, not a claimed live publication.

Inspected desktop (1280×900), phone-sized (390×844) and iPad-sized (834×1194) views. The card showed the actual harbor thumbnail, separate live/saved state, bytes and controls. Explicit save opened the photograph in the existing film viewer; positive mode showed the boats, buildings and water rather than a blank/error surface. Turning network emulation offline still opened the saved copy. Phone content scrolled without horizontal overflow; tablet controls remained reachable. Unconfigured Owner displayed an error and disabled editing/import actions; failed-session progress was cleared rather than left indefinitely “Checking”.

The phone shelf card initially extended to y=886 in an 844 px viewport because its viewport-based coordinates were relative to the newly contained viewer. After portaling the card to the document body, its bottom was y=831 and Edit was a reachable 44 px control. A real local harbor import was renamed, saved, reloaded and reopened; the edited name and photograph remained. The missing-local-roll recovery link was also clicked through to a ready room after fixing its loader lifecycle.

Import cancellation also exposed an existing focus-restoration bug: the opener had already unmounted when the dialog effect captured `document.activeElement`, so Close restored BODY. The editor now retains a valid opener/fallback and suppresses StrictMode replay restoration; actual Close/Cancel restored New roll, successful Save focused Film viewer, rotation persisted, and cancelling a real 72-file batch released all draft object URLs without committing a new roll. M12 helpers now wait for decoded thumbnails and asynchronously loaded edit actions instead of assuming visibility means readiness.

Review also found the cloud-source status overlapping phone viewing controls. It now reserves a second row in the navigation instead of overlaying the canvas. In the corrected 390×844 surface, the status ended at y=66 and the viewer began at y=70; Adjust view, Loupe and Adjust remained unobscured, and positive mode visibly showed the harbor photograph.

The existing Mamiya inspection was also opened through the actual camera shelf and resized to 844×390. In the settled surface, the model stage occupied y=97–390 and every preset/reset/zoom/rotation control remained within the viewport below the new navigation. The camera was visibly rendered. This individual observation does not clear the timed-out/timing-sensitive M20 suite cases; no camera source or assets were changed.

Mobile WebKit production proof used two real local HTTP origins with CORS, not intercepted fake domains. After all 65 essential assets were ready (without preparing optional cameras), the harbor roll was saved. A replacement revision whose thumbnail returned 503 preserved the previous complete revision and both image hashes. Both HTTP servers were then stopped: reload returned 200 **from the service worker**, the saved photograph rendered, removal succeeded and visitor-library records were unchanged. `artifacts/m21-offline-proof.json` records the checks; `artifacts/m21-offline-webkit.png` was visually inspected. Playwright's `setOffline(true)` reload produced an internal WebKit navigation error on this host; actual server shutdown is the exercised offline evidence.

The original WebKit gallery test used `page.route` for a nonexistent photo hostname. Once the production service worker controlled the page, those image requests bypassed the route and failed DNS. The regression fixture now uses real app/catalog and cross-origin image servers and verifies CORS, rather than disabling the worker or weakening offline assertions.

Review captures (ignored, not release assets):

- `artifacts/m21-review/gallery-desktop.png`
- `artifacts/m21-review/gallery-viewer-desktop.png`
- `artifacts/m21-review/gallery-phone.png`
- `artifacts/m21-review/gallery-ipad.png`
- `artifacts/m21-review/owner-unconfigured.png`
- `artifacts/m21-review/visitor-phone-card.png`
- `artifacts/m21-review/gallery-phone-viewer.png`
- `artifacts/m21-review/camera-landscape.png`

The **historical** owner-workflow subagent exercised the former OwnerPanel on desktop/mobile against a local API simulation: two-photo partial upload and retry, then-existing exact-original retention, ordering/cover/rotation/free sizing, saved preview, publication version payload and withdrawal. Those exact-original observations no longer apply: the current browser flow uploads only regenerated JPEG derivatives. The present desktop cutover E2E is recorded above.

## Remaining acceptance prerequisites for the Free-Worker cutover

- The operator reports R2 activation, two buckets/CORS, an active Cloudflare zone, exact-email owner-only Access policy, private-bucket-scoped R2 keys stored outside Git, a public photo custom domain last shown initializing, a photo-host cache bypass, Worker deployment with all four secrets and a corrected Pages deployment at `https://5be64739.filmreverie.pages.dev/`. These remote actions were not rechecked. The hosted guest view renders at `/guest?welcome=1`, but on `pages.dev` the same-origin gallery API is not served by the apex Worker route. Direct read-only requests to Cloudflare's authoritative edge returned **200** for an empty public catalog and **302** for an anonymous owner session; the local resolver still returned old parking addresses and failed TLS. Apex/www Pages binding, actual owner login, signed uploads, public-photo delivery and Free-plan measurements remain unverified.
- Production HTTPS, apex/www redirects, DNS/email preservation, Access login/policy, signed S3 PUT/expiry/CORS, anonymous private-read/write denial and CDN cache behavior remain unverified.
- Measure each hosted route with a representative five-photo roll, second revision and withdrawal on Workers Free; collect invocation CPU/wall times and R2 subrequests. The 10 ms CPU and 50 subrequest limits cannot be established from Node tests or Wrangler dry-run. Procedure: [cloud deployment guide](CLOUD_GALLERY.md#current-costlimit-expectations-and-hosted-measurements).
- Physical iPhone/iPad Safari and Home Screen acceptance remain required. Browser emulation does not establish device acceptance. Human acceptance remains open.
