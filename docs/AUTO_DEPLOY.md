# Automatic Cloudflare deployment

The workflow [Deploy to Cloudflare](../.github/workflows/deploy-cloudflare.yml)
runs on pushes to GitHub `master`. It can also be started from GitHub Actions
with **Run workflow**, selecting `master`.

It installs the locked dependencies with Node 24, builds the website, runs the
integration tests, and type-checks/bundles the Worker. Only successful checks
proceed to deployment: first the existing `filmreverie-cloud` API Worker, then
the existing `filmreverie` Pages project. It checks the public gallery API after
deployment. Concurrent production runs are serialized; an active deployment
is not cancelled midway through the Worker/Pages pair.

GitHub uses `master`. The existing direct-upload Pages project has production
branch `main`, so the workflow explicitly uploads with `--branch main`. This
deploys production at `https://filmreverie.app`; it does not create a new Pages
project or change its domains. Other branches do not deploy production.

## One-time credential setup

1. Authorize GitHub CLI if installing/checking the workflow with `gh`.
2. Create a dedicated deployment token in
   [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens).
   Scope account permissions to the existing Film Reverie account and zone
   permissions to `filmreverie.app`:
   - Account: **Cloudflare Pages — Edit**, **Workers Scripts — Edit**,
     **Account Settings — Read**.
   - Zone: **Workers Routes — Edit**, **Zone — Read**.
3. Save the token as **CLOUDFLARE_API_TOKEN** in the repository's
   [Actions secrets](https://github.com/stevex6677/filmreverie/settings/secrets/actions).
   The account ID is already public Wrangler configuration and is configured
   directly in the workflow.
4. Push the workflow and application commits to GitHub `master`, then inspect
   [Actions](https://github.com/stevex6677/filmreverie/actions).

Cloudflare's [Pages CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
and [Workers CI guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
describe API-token authentication. A developer's interactive Wrangler OAuth
session is not a CI credential. Keep the deployment token in GitHub secrets;
do not commit it or copy it into chat. The existing owner identity, Access
audience and R2 signing credentials stay in Worker secrets; the workflow does
not replace or copy them to GitHub or the frontend.

## Deployment failures

Open the failing Actions step before retrying. Validation failure leaves both
deployments unchanged. Worker deployment failure prevents the Pages upload.
If Pages upload fails after the Worker succeeds, the updated Worker and previous
website remain live; rerun the workflow on the same commit after fixing the
upload issue. The two Cloudflare deployments are not an atomic transaction.

Do not rotate or delete existing owner/upload secrets to fix CI authentication.
Replace the GitHub deployment token if it expires or its permissions are wrong.
This pipeline does not provision DNS, Access policies, R2 buckets, or signing
credentials, and its public smoke check does not establish real admin sign-in
or physical iPad acceptance.
