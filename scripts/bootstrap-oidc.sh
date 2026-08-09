#!/usr/bin/env bash
#
# One-time bootstrap: let GitHub Actions deploy Vire to AWS without any
# long-lived AWS keys in GitHub.
#
# Creates, in the AWS account your CLI is currently authenticated to:
#   1. an IAM OIDC identity provider for token.actions.githubusercontent.com
#   2. an IAM role whose trust policy admits only this repo's `production`
#      deployment environment
#   3. the GitHub Actions variables the deploy workflow reads
#
# CI cannot create the role it needs to assume, so this runs once with your own
# credentials. Safe to re-run: every step checks before it writes.
#
#   ./scripts/bootstrap-oidc.sh
#
set -euo pipefail

REPO_OWNER="mitikutesh"
REPO_NAME="Vire"
ROLE_NAME="vire-github-deploy"
REGION="eu-north-1"
# The workflow job declares `environment: production`, which is what decides the
# token's subject claim — see the note on SUBJECTS below.
ENVIRONMENT="production"

PROVIDER_HOST="token.actions.githubusercontent.com"
PROVIDER_URL="https://${PROVIDER_HOST}"
# Deliberately no --thumbprint-list: AWS verifies the provider's JWKS endpoint
# against its own library of trusted CAs and only falls back to thumbprints for
# certificates it cannot verify that way. GitHub's is verifiable.

die() {
  echo "error: $*" >&2
  exit 1
}

# Only aws and gh. `gh api --jq` uses gh's own embedded jq, so a fresh machine
# needs nothing else installed.
command -v aws >/dev/null || die "the AWS CLI is not installed"
command -v gh >/dev/null || die "the GitHub CLI is not installed"

# ─────────────────────────── who are we ───────────────────────────

CALLER=$(aws sts get-caller-identity --query '[Account,Arn]' --output text 2>&1) || die "AWS credentials are not valid.
Authenticate first (aws configure, aws configure sso, or aws sso login), then re-run.
The CLI said: ${CALLER}"

ACCOUNT_ID=$(printf '%s' "${CALLER}" | cut -f1)
CALLER_ARN=$(printf '%s' "${CALLER}" | cut -f2)

GH_USER=$(gh api user --jq .login) || die "the GitHub CLI is not authenticated"
[ "${GH_USER}" = "${REPO_OWNER}" ] || die "gh is acting as '${GH_USER}', not '${REPO_OWNER}'.
Run: gh auth switch --user ${REPO_OWNER}"

OWNER_ID=$(gh api "users/${REPO_OWNER}" --jq .id)
REPO_ID=$(gh api "repos/${REPO_OWNER}/${REPO_NAME}" --jq .id)

# Two accepted subjects, because GitHub is mid-migration between formats.
#
# Repositories created after 2026-07-15 emit an *immutable* subject that embeds
# the numeric owner and repository ids, so a recycled repository name cannot mint
# a token that an old trust policy still accepts. Older repositories emit the
# name-based form. This repository reports the immutable prefix while its
# `use_immutable_subject` flag reads false, so rather than guess which arrives,
# the trust policy accepts both — each is scoped just as tightly to this
# repository and this deployment environment, so accepting both grants nothing
# extra. Tighten to the immutable one alone once a real run confirms it.
SUB_MUTABLE="repo:${REPO_OWNER}/${REPO_NAME}:environment:${ENVIRONMENT}"
SUB_IMMUTABLE="repo:${REPO_OWNER}@${OWNER_ID}/${REPO_NAME}@${REPO_ID}:environment:${ENVIRONMENT}"

cat <<EOF

About to modify AWS account ${ACCOUNT_ID}
  as            ${CALLER_ARN}
  region        ${REGION}

It will create (or update):
  OIDC provider ${PROVIDER_URL}
  IAM role      ${ROLE_NAME}  [AdministratorAccess]

The role will be assumable only by GitHub Actions presenting one of:
  ${SUB_MUTABLE}
  ${SUB_IMMUTABLE}

EOF

echo "Is ${ACCOUNT_ID} the right account for a personal project? Type 'yes' to continue."
read -r CONFIRM
[ "${CONFIRM}" = "yes" ] || die "aborted; nothing was changed"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

# ───────────────────── 1. OIDC identity provider ─────────────────────

PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${PROVIDER_HOST}"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${PROVIDER_ARN}" >/dev/null 2>&1; then
  echo "✓ OIDC provider already exists"
else
  aws iam create-open-id-connect-provider \
    --url "${PROVIDER_URL}" \
    --client-id-list sts.amazonaws.com >/dev/null
  echo "✓ OIDC provider created"
fi

# ───────────────────── 2. the deploy role ─────────────────────

cat >"${WORK_DIR}/trust-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${PROVIDER_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${PROVIDER_HOST}:aud": "sts.amazonaws.com",
          "${PROVIDER_HOST}:sub": ["${SUB_MUTABLE}", "${SUB_IMMUTABLE}"]
        }
      }
    }
  ]
}
EOF

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "file://${WORK_DIR}/trust-policy.json"
  echo "✓ role ${ROLE_NAME} already existed — trust policy updated"
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --description "GitHub Actions deploys ${REPO_OWNER}/${REPO_NAME} to AWS" \
    --assume-role-policy-document "file://${WORK_DIR}/trust-policy.json" \
    --max-session-duration 3600 >/dev/null
  echo "✓ role ${ROLE_NAME} created"
fi

# AdministratorAccess is the pragmatic start for a single-owner account: an SST
# deploy touches CloudFormation, S3, CloudFront, Lambda, DynamoDB, Cognito, IAM,
# SSM, EventBridge and CloudWatch, and enumerating that up front mostly produces
# a policy that fails on the eleventh service. Narrowing it is a tracked task
# (BACKLOG E0.2), and it is worth doing before this role ever shares an account
# with anything else.
aws iam attach-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
echo "✓ AdministratorAccess attached"

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# ───────────────────── 3. GitHub side ─────────────────────

# Created explicitly rather than left to the first run, so protection rules —
# required reviewers, for one — have somewhere to be configured.
if gh api "repos/${REPO_OWNER}/${REPO_NAME}/environments/${ENVIRONMENT}" >/dev/null 2>&1; then
  echo "✓ environment '${ENVIRONMENT}' already exists"
else
  gh api -X PUT "repos/${REPO_OWNER}/${REPO_NAME}/environments/${ENVIRONMENT}" >/dev/null
  echo "✓ environment '${ENVIRONMENT}' created"
fi

# Variables, not secrets: a role ARN is not a credential. Only the trust policy
# decides who may assume it, and that is enforced by AWS rather than by hiding
# the name.
gh variable set AWS_DEPLOY_ROLE_ARN --repo "${REPO_OWNER}/${REPO_NAME}" --body "${ROLE_ARN}"
gh variable set AWS_REGION --repo "${REPO_OWNER}/${REPO_NAME}" --body "${REGION}"
echo "✓ GitHub variables set"

cat <<EOF

Done.

  role ARN   ${ROLE_ARN}
  region     ${REGION}

Still to do before a deploy can succeed — the three SST secrets, which this
script deliberately does not touch because they are real credentials:

  npx sst secret set AnthropicApiKey  <key> --stage prod
  npx sst secret set OpenaiApiKey     <key> --stage prod
  npx sst secret set SignupAllowlist  <your-email> --stage prod

Then either push to main, or trigger the workflow by hand:

  gh workflow run deploy.yml --repo ${REPO_OWNER}/${REPO_NAME}

If the assume-role step fails, the subject claim is the thing to check. The run
log prints the claim it presented; compare it with the two above.
EOF
