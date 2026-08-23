# Deploying

One-time setup for continuous deployment, and the reasoning behind how it authenticates.
Split out of `README.md`, which keeps the mechanism and the trigger table — this is the runbook
behind them: performed once, by one person, and not read again.

See **ADR 0010** in `docs/DESIGN.md` for why staging tracks `main` and production is promoted by
hand, and `README.md` under "Continuous deployment" for what each trigger does.

## One-time setup

1. Create the two deployments once, and keep the IDs they print:

   ```bash
   npx clasp create-deployment -d "staging"
   npx clasp create-deployment -d "production"
   npx clasp deployments   # every ID, with its version and description
   ```

   Leave the implicit `@HEAD` deployment alone — that is the `/dev` URL, not a slot.

2. Log in locally, and take the credentials clasp writes:

   ```bash
   npx clasp login
   cat ~/.clasprc.json
   ```

3. Populate the repository's Actions configuration:

   | Where | Name | Value |
   | --- | --- | --- |
   | Repository secret | `CLASPRC_JSON` | the whole contents of `~/.clasprc.json` |
   | Repository variable | `SCRIPT_ID` | the Apps Script project ID |
   | Environment `staging` → variable | `CLASP_DEPLOYMENT_ID` | the staging deployment ID |
   | Environment `production` → variable | `CLASP_DEPLOYMENT_ID` | the production deployment ID |

`CLASP_DEPLOYMENT_ID` is **environment-scoped**, which is what lets one job body serve both slots —
and it means production can carry required reviewers (Settings → Environments) without the workflow
knowing anything about it. `SCRIPT_ID` is repository-wide because both slots live on one script
project; defining it on an environment overrides it, should the slots ever need to be separate
projects. Neither ID is secret: the deployment ID *is* the public web app URL.

A missing value fails the job's first step with a message naming what to add, before anything is
built or uploaded. A value that is *present but wrong* fails just before the push, for the same
reason: a deployment ID can be valid and still belong to a different script project — nothing
requires the two slots to share one — and that pairing is only visible by listing the project's
deployments. The job lists them first and names both halves of any mismatch, so it never gets as far
as changing the wrong project's content.

## Why a stored refresh token rather than a service account

`clasp --adc` looks like the keyless answer and is not. Two independent obstacles, both measured
against clasp 3.4.0:

- **Workload Identity Federation is silently discarded.** clasp's ADC path ends in
  `if (defaultCreds instanceof OAuth2Client)`, and the `external_account` credentials that
  `google-github-actions/auth` writes in keyless mode resolve to an `IdentityPoolClient` — which
  extends `AuthClient`, not `OAuth2Client`. clasp drops it and reports `No credentials found.`
  (`authorized_user`, `service_account` and `impersonated_service_account` all pass that check.)
- **The Apps Script API is gated per user**, at <https://script.google.com/home/usersettings> — a
  page no service account principal can visit. Domain-wide delegation impersonating a real user is
  the only way round it.

One consequence worth knowing if you ever move off clasp's built-in OAuth client with `--creds`:
refresh tokens issued by an app in "Testing" publishing status expire after seven days, so CD would
break weekly. Keep the consent screen in production, or internal to the Workspace domain.

Note also that clasp resolves its auth file to `~/.clasprc.json` and **does not fall back to a local
one**, contrary to its own `docs/config-files.md`. The workflow sets `clasp_config_auth` for exactly
this reason; without it a perfectly good `.clasprc.json` sitting beside `.clasp.json` still yields
`No credentials found.` It has to name the file, too — pointed at a directory, clasp dies with
`EISDIR` despite `--help` advertising folder support.

