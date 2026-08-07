# Vire — CI/CD: GitHub Actions → AWS via OIDC

Deploys `main` to AWS with **no long-lived AWS keys in GitHub**: the workflow
requests a short-lived OIDC token from GitHub, and an IAM role trusts exactly
this repo + branch. Referenced by BACKLOG E0.1/E0.2 (ships with M0).

## 1. One-time AWS bootstrap (before the first CI run)

Run once with your own credentials (console or CLI). CI can't create the role
it needs to assume — classic chicken-and-egg.

### 1a. Create the GitHub OIDC identity provider

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

(One per AWS account. Skip if it already exists.)

### 1b. Create the deploy role with a trust policy scoped to repo + main

`trust-policy.json` — replace `<ACCOUNT_ID>` and `<OWNER>/<REPO>`:

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
          "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:ref:refs/heads/main"
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

Key points:

- The `sub` condition means **only workflows on `main` of this repo** can
  assume the role — a PR from a fork or another branch is refused by AWS
  itself, regardless of what the workflow YAML says.
- SST/CDK deployments touch many services (CloudFormation, S3, CloudFront,
  Lambda, DynamoDB, Cognito, IAM, SSM, EventBridge, CloudWatch), so
  `AdministratorAccess` is the pragmatic start for a single-owner account.
  Tightening to a scoped policy is a listed hardening task (E0.2), not a
  blocker.

### 1c. Store the role ARN in GitHub

Repo → Settings → Secrets and variables → Actions → **Variables**:

| Variable              | Value                                               |
| --------------------- | --------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/vire-github-deploy` |
| `AWS_REGION`          | `eu-north-1`                                        |

(It's a role ARN, not a secret — a variable is fine; only the trust policy
gates who can use it.)

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
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
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
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm test -- --run # deploy gate: tests must pass on main too

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
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
