# Cloudflare deployment

The public repository includes the Worker, Pages build settings, R2 bindings and
local configuration. Production account identifiers, domains, bucket names and
development login origins belong in private deployment settings. Use Node 24 or
newer for the deployment commands.

## Local configuration

For a new deployment, copy the example and fill in your own settings:

```sh
cp cloudflare/deployment.example.json cloudflare/deployment.local.json
```

`cloudflare/deployment.local.json` is ignored by Git. Back it up privately before
deleting a checkout; a fresh clone or another worktree does not contain it. If
this file already exists, preserve it rather than overwriting it with the example.
The example is intentionally incomplete and production commands reject it.

| Setting | Meaning |
| --- | --- |
| `accountId` | Cloudflare account owning the Worker, Pages project and buckets |
| `workerName` | Existing API Worker name |
| `zoneName` | Cloudflare DNS zone containing the application hostname |
| `pagesProject` | Existing Pages project name |
| `pagesBranch` | Pages production branch; independent of the GitHub branch |
| `appOrigin` / `photoOrigin` | HTTPS origins, without a trailing slash |
| `accessIssuer` | Your Access team's HTTPS `cloudflareaccess.com` origin |
| `privateBucket` / `publicBucket` | Two distinct existing R2 buckets |
| `devLoginOrigins` | Exact allowed development origins; use `[]` to disable |

Keep API tokens, R2 keys, owner identity and Access audience out of this JSON.
The four Worker secrets remain in Cloudflare: `ACCESS_AUDIENCE`, `OWNER_EMAIL`,
`R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Local secret values may go in ignored
`cloudflare/.dev.vars`; the committed `.dev.vars.example` lists only placeholders.

```sh
npm run build
npm run test:integration
npm run check:cloud
npm run check:cloud:production

# Run only when deployment is intended, after validation and the intended Git push.
npm run deploy:worker
# Continue only if the Worker succeeded.
npm run deploy:pages
npm run verify:cloud
```

`check:cloud` uses generic checked-in settings and needs no production configuration.
`check:cloud:production` generates the real configuration and performs only a
Wrangler dry run. `cloud:configure` generates the files without invoking Wrangler.
Generated Worker, Pages and CORS files live under ignored `.cache/cloudflare-deploy/`.
Both deployment commands regenerate them from the private settings. Do not deploy
using the generic `cloudflare/wrangler.jsonc` or `wrangler.pages.jsonc` directly.
The `.jsonc` templates intentionally use plain JSON so the generator can read them.

Wrangler uses local interactive authentication for manual deployment, or
`CLOUDFLARE_API_TOKEN` supplied outside Git. The helpers preserve the configured
Worker/Pages names, bucket bindings, routes and Pages production branch. They do
not provision buckets, set secrets, edit Access policies, or change DNS/CORS.

## GitHub Actions

The [deployment workflow](../.github/workflows/deploy-cloudflare.yml) runs on
`master` pushes or **Run workflow** on `master`. It builds, tests and validates
before deploying the Worker, then Pages. It verifies the public website and
`/api/gallery` without changing rolls. Runs are serialized; failure stops later
steps. Forks must configure their own account and secrets before deployment works.

Configure these two repository Actions secrets before pushing this workflow:

- `CLOUDFLARE_API_TOKEN`: a dedicated deployment token scoped to your account/zone.
  Typical permissions are Account: Cloudflare Pages Edit, Workers Scripts Edit,
  Account Settings Read; Zone: Workers Routes Edit, Zone Read.
- `CLOUDFLARE_DEPLOYMENT_CONFIG`: the complete JSON from your private
  `cloudflare/deployment.local.json`. This keeps deployment identifiers out of
  source control. It contains settings, not the four Worker secrets.

For an existing installation, retain its current API token and add the configuration
secret. With an authenticated GitHub CLI, the explicit setup command is:

```sh
gh secret set CLOUDFLARE_DEPLOYMENT_CONFIG < cloudflare/deployment.local.json
```

Check the CLI's selected repository before running that command. The migration
of local files does not set this remote secret automatically. CI fails before
any deployment if the configuration secret is missing or invalid. The environment
variable takes precedence over the local file, including when explicitly empty.
Do not print the JSON or upload generated production configs as public artifacts.
Wrangler deployment output can still include resource names; this is configuration
privacy, not a promise to hide all infrastructure identifiers from Actions logs.

Cloudflare documents [secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Worker CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
and [Pages CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

## Deployment failures

Validation or Worker failure leaves Pages unchanged. If Pages fails after the
Worker succeeds, report the partial deployment and retry the same source revision
after fixing the issue. These deployments are not an atomic transaction.
Do not rotate owner/upload secrets to fix CI configuration. No history rewriting
is performed by these helpers; old committed settings remain in Git history.
