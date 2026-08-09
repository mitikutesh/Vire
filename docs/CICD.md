# Vire — CI/CD: GitHub Actions → AWS via OIDC

Deploys `main` to AWS with **no long-lived AWS keys in GitHub**: the workflow
requests a short-lived OIDC token from GitHub, and an IAM role trusts exactly
this repo + branch. Referenced by BACKLOG E0.1/E0.2 (ships with M0).

## 1. One-time AWS bootstrap (before the first CI run)

Run once with your own credentials. CI can't create the role it needs to assume —
classic chicken-and-egg.

**Use the script:** `./scripts/bootstrap-oidc.sh`. It is idempotent, prints the
AWS account it is about to modify and waits for confirmation, and derives the
subject claims from the GitHub API rather than from a template you have to fill
in. The rest of this section explains what it does and why.

### 1a. The OIDC identity provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

One per AWS account. **No `--thumbprint-list`**: AWS verifies the provider's JWKS
endpoint against its own library of trusted CAs and falls back to thumbprints only
for certificates it cannot verify that way. GitHub's is verifiable, so a pinned
thumbprint is a rotation hazard with no benefit.

### 1b. The deploy role, and the two subject-claim traps

The trust policy is where this goes wrong, in two ways that both produce the same
unhelpful `Not authorized to perform sts:AssumeRoleWithWebIdentity`:

**Trap 1 — the job declares an environment.** `deploy.yml` sets
`environment: production`, and an environment-scoped job's token carries
`...:environment:production`, **not** `...:ref:refs/heads/main`. A branch-shaped
condition looks obviously right and never matches. (This also means the
`workflow_dispatch` trigger works without a second condition, since both triggers
run in the same environment.)

**Trap 2 — GitHub is mid-migration on the subject format.** Repositories created
after **2026-07-15** emit an _immutable_ subject embedding the numeric owner and
repository ids — `repo:OWNER@OWNER-ID/REPO@REPO-ID:...` — so a recycled repository
name can't mint a token an old policy still trusts. Older repositories emit the
name-based form. `mitikutesh/Vire` was created after the cutoff and reports the
immutable prefix, while its `use_immutable_subject` flag reads `false`:

```console
$ gh api repos/mitikutesh/Vire/actions/oidc/customization/sub
{"use_default":true,"use_immutable_subject":false,
 "sub_claim_prefix":"repo:mitikutesh@12127634/Vire@1328864378"}
```

Rather than bet on one, the trust policy accepts **both**. Each is scoped just as
tightly to this repository and this environment, so accepting both grants nothing
extra; it only removes a coin-flip. Tighten to the immutable form alone once a real
run confirms which arrives — the run log prints the claim it presented.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": [
            "repo:mitikutesh/Vire:environment:production",
            "repo:mitikutesh@12127634/Vire@1328864378:environment:production"
          ]
        }
      }
    }
  ]
}
```

```bash
aws iam create-role \
  --role-name vire-github-deploy \
  --assume-role-policy-document file://trust-policy.json \
  --max-session-duration 3600

# Personal project, single account: start broad, tighten later.
aws iam attach-role-policy \
  --role-name vire-github-deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

On `AdministratorAccess`: an SST deploy touches CloudFormation, S3, CloudFront,
Lambda, DynamoDB, Cognito, IAM, SSM, EventBridge and CloudWatch, and enumerating
that up front mostly yields a policy that fails on the eleventh service. It is the
pragmatic start for a single-owner account, and narrowing it is a tracked task
(BACKLOG E0.2) — worth doing **before** this role ever shares an account with
anything else.

### 1c. Store the role ARN in GitHub

Repo → Settings → Secrets and variables → Actions → **Variables**:

| Variable              | Value                                               |
| --------------------- | --------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/vire-github-deploy` |
| `AWS_REGION`          | `eu-north-1`                                        |

Variables, not secrets: a role ARN is not a credential. Only the trust policy
decides who may assume it, and AWS enforces that — hiding the name adds nothing.

## 2. Workflows

### 2a. `.github/workflows/ci.yml` — every PR and push

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --run
      - run: npm run build # proves the SPA builds to pure static assets
```

### 2b. `.github/workflows/deploy.yml` — main only, via OIDC

```yaml
name: Deploy
on:
  push:
    branches: [main]

# OIDC: id-token is the whole trick — no AWS secrets anywhere.
permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy-prod # never two overlapping deploys
  cancel-in-progress: false # let a running deploy finish; queue the next

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production # optional: adds env-level protection/approvals
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm test -- --run # deploy gate: tests must pass on main too

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
          role-session-name: vire-deploy-${{ github.run_id }}

      - name: Deploy (SST)
        run: npx sst deploy --stage prod
```

Notes:

- `permissions: id-token: write` is what lets the job mint the OIDC token;
  without it `configure-aws-credentials` fails with "no OIDC token".
- No `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` exist anywhere in the repo
  or its secrets — credentials are per-run, expire in ≤ 1 h.
- `environment: production` is optional but free insurance: it gives a
  deployment history in the GitHub UI and a place to add a required-reviewer
  gate later.
- AI provider keys (Anthropic/OpenAI) are **not** GitHub secrets — they live
  in SSM (PLAN §3a) and are read by Lambda at runtime; the deploy role only
  writes the parameter names, never prints values.

## 3. Failure modes worth knowing

| Symptom                                                   | Cause                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` doesn't match — check owner/repo casing and that the push was to `main` (not a tag or PR merge ref) |
| `Credentials could not be loaded` / no OIDC token         | Missing `permissions: id-token: write` on the job/workflow                                                             |
| Deploy works locally, fails in CI on a specific service   | Role policy tightened too far — re-check against the services SST manages                                              |
