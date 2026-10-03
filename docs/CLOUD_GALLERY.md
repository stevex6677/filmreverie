# Owner cloud gallery and visitor-local darkroom (M21)

## Deployment configuration

Cloudflare is optional for local guest use. The public Wrangler and CORS files
contain generic examples. Production settings are read from ignored
`cloudflare/deployment.local.json`, or `CLOUDFLARE_DEPLOYMENT_CONFIG` in CI.
See [deployment setup and commands](AUTO_DEPLOY.md). Account-specific deployment
records are kept privately; the [M21 review](M21_REVIEW.md) retains historical
behavior and validation results with deployment identifiers omitted.

Examples below use `example.com`, `gallery-private` and `gallery-public`; use
your own private settings when provisioning. Configuration generation and build
checks do not create cloud resources or change existing secrets.

## Data boundaries and use

- **Home `/`:** account-free read-only published rolls on the physical film shelf. Only selected roll metadata, metadata-stripped viewing JPEGs and thumbnails are public. Originals, filenames, source hashes, private object keys and saved viewer positions are excluded from public catalogs. Anonymous visitors see no add/edit/delete action. Authenticated admins use the guest-style shelf and roll editor: saving publishes the reviewed roll, deletion withdraws it and retains cloud Trash, and restoration republishes it. The shelf loads catalog metadata and cover thumbnails first, then a selected roll's viewing images when opened. Its room header uses the guest darkroom's controls, with **Create Your Own** immediately after **Room lights** (called **Lights** on phones), followed by a three-dot menu showing **Admin Login** or **Logged in**; these actions remain inside the same header when it wraps on narrow screens.
- **Guest `/guest`:** **Create Your Own** opens `/guest?welcome=1` in a new tab and shows the introduction on every click; direct `/guest` visits show it only until dismissed. The guest darkroom starts with one deletable example roll. Guest imports, edits and originals stay at best effort in this browser's `darkroom-guest-rolls` IndexedDB; there is no account or cloud synchronization. Roll creation and deletion are available only in film shelf mode. Backup, migration and offline/storage controls are not offered. The older `darkroom-rolls` database is left intact and never imported automatically.
- **Admin:** open the three-dot menu to the right of **Create Your Own** and choose **Admin Login** to authenticate through Access in the same tab. Returning to the darkroom checks the session automatically; the menu then shows **Logged in**. Use **New roll** on the shelf to choose JPEG/PNG photographs, edit roll details and review frames in the shared roll editor. The owner's starting film effect strength for new rolls is stored privately at `GET`/`PUT /api/owner/preferences`. Image conversion runs in a worker where supported, leaving roll details and existing frames editable. Prepared derivatives upload privately in the background, with up to six photographs uploading at once; completed uploads are reused after a retry. **Save** publishes the reviewed roll and closes the editor without navigating to the light table. **Save and open** also opens the roll. Publication reuses unchanged committed image URLs within the active withdrawal generation, so metadata edits do not copy the whole roll again. Opening after save reuses the editor’s in-memory derivatives; they are released when the editor closes. Select a saved roll to edit it or delete it; deletion withdraws its public images and retains the roll in cloud Trash. **Undo** or **Restore roll** republishes it. **Arrange** on the shelf stores the owner's cubbies in one private record (`PUT /api/owner/shelf`) without changing drafts; the Worker writes a new public catalog version whose rolls carry `shelfSlot`, so visitors see the same arrangement. Rolls published after the last arrangement fill free cubbies. The server denies unauthenticated writes.
- Admin re-encodes selected JPEG/PNG or imported archive originals **in the browser** into viewing JPEGs (at most 2,048 pixels per side) and thumbnails (at most 256 pixels per side). Canvas JPEG output does not carry source EXIF/GPS metadata. Admin retains the original locally; **no original is uploaded to R2**, even as a private draft. Keep the source photographs and `.darkroom` backups yourself. Private R2 holds only staged and sealed derivatives, completed-upload metadata and immutable draft snapshots.
- Five-minute S3 PUT grants bind each derivative to one private-bucket key, method, exact byte count and `image/jpeg` content type. Presigned URLs use the S3 `UNSIGNED-PAYLOAD` canonical value; the expected SHA-256 stays in the private pending grant. Browser PUTs go directly to R2. Worker completion verifies R2 object headers and size, then supplies the expected SHA-256 to R2 when streaming each sealed copy. R2 rejects mismatched bytes before a completed-upload record can be saved; it does **not** decode, sanitize or inspect the image body. A compromised browser could submit a JPEG with metadata despite the normal Admin re-encode; the Worker cannot independently prove its absence. Completion seals private derivative copies to prevent staging replay from changing a saved photograph.
- The existing local importer constrains sources to 40 MiB, 40 megapixels and 16,384 pixels per side; cloud upload limits are 5 MiB per viewing JPEG and 512 KiB per thumbnail. Drafts retain film-length checks and the browser's 300 MiB import limit. PNG originals are accepted locally but sent only as JPEG derivatives; HEIC conversion is not part of cloud import.
- A cloud save uses optimistic concurrency. A second session cannot silently overwrite a newer saved draft. Publication requires the saved version's server-generated `updatedAt`, streams private derivative bytes to complete versioned public objects in bounded batches, then conditionally replaces a private R2 catalog pointer referencing an immutable public catalog version. Readers load that pointer on every gallery request; failed or conflicting publication preserves the prior complete catalog revision. No Pages rebuild is needed.
- Withdrawal removes the current catalog entry before deleting public images in bounded numeric-generation batches. Failed deletion leaves a resumable tombstone; repeat withdrawal. Later explicit republication gets a new generation and is not removed by an earlier withdrawal. Private derivative drafts remain; originals exist only in the owner's local files/backups.
- Public photographs can be downloaded or captured. Withdrawal cannot revoke screenshots, downloaded files, browser caches or previously saved offline copies. Configure photo-domain caching as described below; deleting R2 objects alone does not purge an independently cached CDN copy.

## Cloudflare provisioning checklist — requires authorization

1. Onboard `example.com` as a Cloudflare zone. Compare every imported DNS record with the current Porkbun zone, including mail and verification records, before changing nameservers. Check the existing DNSSEC state and follow the migration procedure below.
2. Record the authorized owner email, Cloudflare account ID, Access team issuer and application audience. Select an owner-only Access allow policy, preferably with MFA at the identity provider. Do not use an Everyone allow rule, a bypass policy, visitor accounts or service-token-only authentication.
3. Create separate Standard R2 buckets named `gallery-private` and `gallery-public`, matching the private deployment settings. Disable `r2.dev` and custom domains on the private bucket. Keep `r2.dev` disabled on the public bucket too; serve it only through `photos.example.com`. Never bind both names to one bucket.
4. Create an R2 S3 API credential restricted to object read/write in the **private** bucket only. Store its two values in Worker secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`. Store `OWNER_EMAIL` and the Access application's audience tag as `ACCESS_AUDIENCE` Worker secrets too. The Worker verifies the Access JWT email and audience and returns 503 for API requests when required configuration is missing. Never put these four values in tracked Wrangler `vars`, `VITE_*` variables, source, GitHub Actions plaintext variables or committed `.env` files. Keep deploy credentials separate from upload signing credentials.
5. Configure these non-secret Worker variables: `APP_ORIGIN`, `PHOTO_ORIGIN`, `ACCESS_ISSUER`, `R2_ACCOUNT_ID` and `PRIVATE_BUCKET_NAME`. The Access issuer is `accessIssuer` in the private deployment settings; verify it against the actual Access team domain before deploying. The R2 bindings are `PRIVATE_BUCKET` and `PUBLIC_BUCKET`. Supply `ACCESS_AUDIENCE` and `OWNER_EMAIL` only through Cloudflare Worker secret bindings or an ignored local `cloudflare/.dev.vars` file; never publish their values in config.
6. Run `npm run cloud:configure`, then configure private-bucket CORS from `.cache/cloudflare-deploy/private-cors.json`: only the app origin, PUT, the signed headers. Configure public-bucket CORS from `.cache/cloudflare-deploy/public-cors.json`: app-origin GET/HEAD. CORS is not authorization. Worker owner APIs remain same-origin and independently verify Access JWT signatures, issuer, audience, lifetime and owner email on every request.
7. Create an Access self-hosted application covering `example.com/api/owner/*`. Leave `/api/gallery`, the static app and photo domain publicly readable. Admin shelf data is loaded only after successful API authentication. Disable Worker preview URLs and `workers.dev` as configured. Apply an API cache bypass for `/api/*` and Access endpoints; never cache authenticated responses.
8. Configure an explicit **cache bypass on the photo hostname**, preserving direct R2 custom-domain delivery and CORS. Objects also request `max-age=0, must-revalidate`. If an operator later enables edge caching, withdrawal requires purging every affected versioned URL (or disabling/purging the photo-host cache); retest old image URLs anonymously before claiming withdrawal complete. Do not rewrite image bodies.
9. Use the Worker CPU configuration checked into `cloudflare/wrangler.jsonc`; no paid CPU allowance or server-side image transformation is configured. Cloudflare Free limits include 10 ms CPU and 50 external subrequests per invocation. The local tests bound R2 calls per publication/withdrawal batch, but do not establish hosted CPU, real R2 latency or production signed-PUT/CORS behavior. Before releasing production publication, measure each route with a representative roll on the authorized account as detailed below. Do not enable a paid plan without separate authorization.
10. Create the Pages project with the name and production branch specified by `pagesProject` and `pagesBranch` in your private settings. Build with `npm ci --include=dev && npm run build`, Node 24 LTS recommended; publish `dist` to that configured production branch. This preserves tracked models, packaging, sample photos, content-hashed app bytes and the existing service worker. `_headers` configures static hosting and is intentionally excluded from the offline asset inventory.
11. Route `example.com/api/*` to the Worker as configured. Bind Pages to the apex and `www`; bind the public R2 bucket to the photo hostname. With no top-level `404.html` or `/guest` rewrite, [Pages' SPA fallback](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering) serves the app shell for `/guest` and `/guest/` while preserving the path for client routing. Do not rewrite `/guest` to `/index.html`: Pages canonicalizes that target to `/` and loses the guest route. Configure the `www`→apex redirect with a zone Redirect Rule rather than a Pages `_redirects` domain-level rule, which [Pages does not support](https://developers.cloudflare.com/pages/configuration/redirects/#advanced-redirects). Verify both guest deep links, the `www` redirect and that `/api/gallery` stays on the Worker. Enable HTTPS redirects and verify certificates before importing at the production origin. Do not enable HTML/JS/image rewriting or another application-shell worker over the generated offline worker.
12. Optionally expire only private `staging/` and `uploads/pending/` after at least one day. Never expire `sealed/`, `uploads/completed/`, `drafts/` or `catalog/` as disposable uploads. Unreferenced sealed uploads and old draft snapshots are retained intentionally; review references and take a backup before operator-led retention cleanup.

The operator reports completing bucket, CORS, zone, Access, initial Worker and four-secret deployment steps below; do not rerun provisioning commands for resources already created. [Cloudflare documents](https://developers.cloudflare.com/workers/configuration/secrets/#adding-secrets-to-your-project) that each `wrangler secret put` immediately deploys a new Worker version. Enter secret values only at Wrangler's interactive prompt, not in shell arguments or source. All four secrets are reported set, but hosted authentication, uploads and Free-plan limits still require verification.

Wrangler's local interactive [OAuth login](https://developers.cloudflare.com/workers/wrangler/commands/general/#login) does not require `CLOUDFLARE_API_TOKEN`. If a terminal reports that variable missing, use the same local checkout and shell as your Wrangler login (or run `npx wrangler login --device` there); do not add an API token to this repository or paste it into chat. A token-only runner needs its own appropriately scoped credential outside Git.

```sh
# Create these only if they are absent, after confirming the account and R2 terms.
# Replace example bucket names with your private deployment settings.
npm run cloud:configure
npx wrangler r2 bucket create gallery-private --storage-class Standard
npx wrangler r2 bucket create gallery-public --storage-class Standard
npx wrangler r2 bucket cors set gallery-private --file .cache/cloudflare-deploy/private-cors.json
npx wrangler r2 bucket cors set gallery-public --file .cache/cloudflare-deploy/public-cors.json
# Create the private-bucket-only R2 S3 credential in the dashboard.
# Verify accessIssuer in cloudflare/deployment.local.json matches the Access team.
# Retain the Access application's audience tag outside Git for secret entry.
npm run build
npm run test:integration
npm run check:cloud  # Type-check and bundle only; does not deploy.
npm run check:cloud:production
npm run deploy:worker
# The initial Worker fails closed until all four secrets exist.
# Each command below immediately deploys another Worker version.
npx wrangler secret put ACCESS_AUDIENCE --config .cache/cloudflare-deploy/worker.json
npx wrangler secret put OWNER_EMAIL --config .cache/cloudflare-deploy/worker.json
npx wrangler secret put R2_ACCESS_KEY_ID --config .cache/cloudflare-deploy/worker.json
npx wrangler secret put R2_SECRET_ACCESS_KEY --config .cache/cloudflare-deploy/worker.json
npm run deploy:pages
```

Bucket creation, custom-domain setup, Access policy and DNS changes are deliberate dashboard/operator steps, not implicit effects of local build scripts. `.dev.vars*` and `.wrangler/` are ignored; never commit secret files. `npm run dev:cloud` runs local workerd/R2 without production authentication bypass. To proxy same-origin API requests during local development, set `FILM_PHOTO_CLOUD_API=http://127.0.0.1:8787` when starting Vite. Missing configuration returns 503; actual owner login still requires a configured Access origin, not an insecure local bypass.

When private deployment settings exist, `npm run dev` and `npm run preview` automatically connect to the **published Cloudflare gallery** through the local bridge:

```sh
npm run dev -- --host 0.0.0.0 --port 5180
```

The bridge reads application/photo origins and allowed dev origins from the private deployment settings. Anonymous visitors can browse published rolls and photos without logging in. Set `devLoginOrigins` to your actual origins; `FILM_PHOTO_DEV_ADMIN_ORIGINS` can override the local bridge list, but must still match the deployed Worker allowlist. Preserve existing private HTTPS access configuration. The Worker `DEV_LOGIN_ORIGINS` must list permitted origins; callbacks must use `/api/dev-auth/callback`. HTTP is supported on `localhost`, loopback IPs, `macbook` and `macbook.tail2b1388.ts.net`. Port patterns such as `http://macbook:*` and `http://macbook.tail2b1388.ts.net:*` allow different local app ports on those specific private hosts; arbitrary host wildcards are rejected. Deploy the updated Worker and private settings before using those login callbacks. Existing exact HTTPS origins take precedence over port patterns. **Admin Login** visits real Cloudflare Access in the same tab, then returns to the initiating dev origin, path, query and fragment. A one-minute, single-use PKCE code transfers the verified application session to the local server. Private R2 stores only code-encrypted token material, and redeemed/expired grants are deleted; abandoned ciphertext has no valid exchange after one minute. The server retains the Access token in memory and gives the browser an opaque HttpOnly, SameSite=Lax cookie (Secure on HTTPS). Restarting the server requires logging in again. No token is placed in browser storage or a callback URL.

The bridge forwards authenticated owner requests to the production API, rejects foreign mutation origins, proxies session-bound signed uploads, and serves published photos through the dev origin. **New roll** can stage private derivative uploads; **Save**, **Save and open**, delete, Trash and Undo change the published gallery. Guest rolls remain local. The bridge runs in Vite development and Vite preview when private settings are present. Static build files do not contain the bridge or its credentials. Set `FILM_PHOTO_DEV_ADMIN_BRIDGE=0` to disable it, or `=1` to require configuration explicitly. An explicit `FILM_PHOTO_CLOUD_API` selects that backend instead of the automatic bridge. Fresh clones without private settings still build and run locally. The dropdown contains only **Admin Login** or **Logged in**. Do not set the previous hosted-only `VITE_FILM_PHOTO_ADMIN_LOGIN_URL` override for this flow. A hosted production build continues to use its same-origin Access session endpoint.

## Porkbun → Cloudflare DNS migration

For subsequent application releases, use the
[GitHub push deployment workflow](AUTO_DEPLOY.md) to validate and deploy both
the API Worker and existing Pages project. GitHub `master` deploys to the Pages
production branch specified by the private `pagesBranch` setting. Dedicated GitHub
repository deployment token and configuration secrets are required; the workflow
does not change DNS, Access or R2 provisioning.

Registration and renewal stay at Porkbun. Before changing nameservers, export the current zone and record all A/AAAA/CNAME, MX, TXT, SPF, DKIM, DMARC, CAA and verification records, TTLs and current DNSSEC state. Import and compare the complete zone in Cloudflare; do not overwrite mail records with app records. Check CAA allows certificate issuance required by the chosen services.

If DNSSEC is currently enabled, remove the old DS at Porkbun and allow its TTL to expire **before** changing delegation; stale DS records can make the entire domain fail validation. Use the actual nameservers assigned to this zone, not example names. Change only the authoritative nameservers at Porkbun, verify delegation/resolution and preserved email records, then enable Cloudflare DNSSEC and publish its new DS at Porkbun. Verify validating resolvers before calling migration complete. Keep the old zone export and a rollback plan; do not toggle nameservers and DS records together blindly.

Verify `https://example.com`, HTTP→HTTPS, `https://www.example.com`→apex, photo-domain HTTPS/CORS and Access login from independent browsers. HTTPS origin changes never transfer browser storage automatically.

## Backups, restore and withdrawal recovery

The private R2 bucket is authoritative for **cloud drafts and derivative images**, not for source photographs. Keep the owner's original photographs and `.darkroom` backups independently. Back up the private bucket with an independently retained encrypted object-store export, including `sealed/` derivative objects, `uploads/completed/` manifests, `drafts/heads/`, `drafts/snapshots/` and `catalog/head.json`. Also retain public catalog versions and versioned objects referenced by the catalog. Keep backups outside disposable `.cache/`, browser caches and temporary worktrees. Store signing/deploy credentials separately; do not include them in public photo exports.

For a consistent backup or restore, temporarily deny owner mutations in Access and let in-flight requests finish; public browsing may remain available. Snapshot the full private bucket plus current public objects, verify object checksums/counts, and retain a dated manifest in private backup storage. Do not restore a catalog head until all referenced immutable objects exist. Restoring an older head can republish previously withdrawn material: inspect `withdrawals` and `generations`, and obtain explicit publication approval. Prefer loading retained private drafts, previewing and republishing deliberately over manually editing catalog JSON.

After an interrupted withdrawal, repeat the Owner withdrawal action; the tombstone keeps the roll out of the gallery while deletion resumes. If final catalog cleanup returns a conflict, retry withdrawal rather than deleting private catalog state. After a failed publication, the old complete revision remains the public version; reload/review the saved draft and publish again. Restore local originals from the owner's separate file backups, not R2.

## Current cost/limit expectations and hosted measurements

Checked 2026-09-25; recheck before provisioning. Vendor allowances are not a guarantee that this deployment stays free:

- [R2 Standard pricing](https://developers.cloudflare.com/r2/pricing/): monthly free tier lists 10 GB-month, 1 million Class A and 10 million Class B operations; standard excess prices and terms are in the linked schedule. Only staged/sealed derivatives, public revisions and metadata count toward this app's R2 usage; originals are not stored there. Uncached image reads still consume operations.
- [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/) and [pricing](https://developers.cloudflare.com/workers/platform/pricing/): 10 ms CPU, 50 external subrequests per invocation and 100,000 requests/day. The Worker has no paid CPU setting. Photo bytes go directly to/from R2; each owner publish/withdraw response processes a bounded page and the browser continues if pending.
- [Pages limits](https://developers.cloudflare.com/pages/platform/limits/): Free lists 500 builds/month, 20,000 files and 25 MiB per asset. Photo publishing does not trigger Pages builds. Tracked camera models remain app assets.
- [Cloudflare Zero Trust plans](https://www.cloudflare.com/plans/zero-trust-services/): check Free Access seat eligibility for the single owner in the actual account. Visitors need no Access seats. Porkbun domain renewal remains separate.

**Cloudflare Free measurements are not yet available:** the operator reports deploying the Worker with its four secrets; a read-only hosted gallery request returned an empty catalog, but no CPU/subrequest measurements have been collected. Wrangler dry-run and local in-memory R2 tests are not hosted Free measurements. Before production publication, enable [Workers invocation logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) or [real-time logs](https://developers.cloudflare.com/workers/observability/logs/real-time-logs/) and record `cpuTimeMs`, `wallTimeMs`, outcome and R2 subrequest count for: anonymous `GET /api/gallery`, owner `GET /api/owner/session`, `POST /api/owner/uploads`, `POST /api/owner/uploads/:id/complete`, `GET /api/owner/uploads/:id/viewing` and `/thumbnail`, `PUT /api/owner/drafts/:id`, `GET /api/owner/drafts/:id`, `GET /api/owner/drafts`, every `POST /api/owner/drafts/:id/publish` continuation, and each `DELETE /api/owner/publications/:id` withdrawal continuation. Use at least a five-frame representative roll with real 2,048-pixel viewing derivatives and 256-pixel thumbnails, including a second revision and withdrawal; sample repeated successful invocations and errors. The hosted budget is **<10 ms CPU** and **≤50 external subrequests** on each invocation. Logs/metrics must confirm this rather than extrapolating Node or dry-run timings. Check account-wide requests, R2 operations/storage and photo-domain cache behavior before promising free operation. [Workers timing fields](https://developers.cloudflare.com/changelog/post/2025-04-09-workers-timing/) distinguish CPU from wall time.

**Local diagnostic only (Node/Vitest, in-memory R2):** a five-frame roll using 2,048×1,365 viewing JPEGs and 256×171 thumbnails, two publication revisions and withdrawal produced the following per-invocation observations. CPU is Node `process.cpuUsage` including local JWT verification and test-fake I/O; it is **not workerd or hosted Workers CPU**. R2 counts omit the one external Access-JWKS lookup for owner routes. The throwaway measuring test was removed after the run.

| Worker route | Node CPU ms | Fake R2 calls |
| --- | ---: | ---: |
| `GET /api/gallery` (empty, published, withdrawn) | 0.06–1.11 | 1–2 |
| `GET /api/owner/session` | 7.52 | 0 |
| `POST /api/owner/uploads` (5 calls) | 0.78–9.43 | 1 |
| `POST /api/owner/uploads/:id/complete` (5 calls) | 0.49–1.53 | 9 |
| `GET /api/owner/uploads/:id/viewing`, `/thumbnail` | 0.67–1.84 | 2 |
| `PUT /api/owner/drafts/:id` (initial, revision) | 0.62–1.02 | 8–9 |
| `GET /api/owner/drafts`, `GET /api/owner/drafts/:id` | 0.38–0.47 | 2–3 |
| `POST /api/owner/drafts/:id/publish` (each revision) | 2.40–3.52 | 33–34 |
| `DELETE /api/owner/publications/:id` | 1.17 | 8 |

In the separate 13-frame bounded-publication and multi-generation withdrawal regression, each continuation used at most 50 fake R2 calls. These numbers demonstrate call-count design under a local mock, not actual Cloudflare Free eligibility.

## Acceptance checks still required on the hosted account

Use separate owner and anonymous browser profiles against actual R2. Verify direct signed PUTs and preflights, expired/tampered grant denial, anonymous private reads/writes denied, that only metadata-free browser JPEG derivatives reach private/public R2 (not originals), private draft invisibility, complete publication and revision without a build, stale-preview conflict and interrupted-publication preservation, then withdrawal of current and historical image URLs. Check no secret/private references in public catalog, HTML or bundles. Exercise desktop, phone and iPad-sized owner/gallery flows; record physical Safari/Home Screen evidence separately. See [M21 review](M21_REVIEW.md).
