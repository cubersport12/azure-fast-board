#!/usr/bin/env bash
# Enable repository ruleset: main accepts changes only via Pull Request.
# Run as the repo owner/admin (gh auth with admin:repo or classic PAT with repo scope).
set -euo pipefail

REPO="${1:-cubersport12/azure-fast-board}"
RULESET_NAME="Protect main — PR only"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is required. Install: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: not logged in. Run: gh auth login" >&2
  exit 1
fi

echo "Repository: $REPO"
echo "Ensuring default branch is main..."
gh api --method PATCH "repos/$REPO" -f default_branch=main >/dev/null

EXISTING_ID="$(
  gh api "repos/$REPO/rulesets" \
    --jq ".[] | select(.name == \"$RULESET_NAME\") | .id" \
    2>/dev/null || true
)"

PAYLOAD='{
  "name": "Protect main — PR only",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ],
  "bypass_actors": []
}'

if [[ -n "${EXISTING_ID}" ]]; then
  echo "Updating existing ruleset #$EXISTING_ID..."
  echo "$PAYLOAD" | gh api --method PUT "repos/$REPO/rulesets/$EXISTING_ID" --input - >/dev/null
else
  echo "Creating ruleset..."
  echo "$PAYLOAD" | gh api --method POST "repos/$REPO/rulesets" --input - >/dev/null
fi

echo "Enabling delete branch on merge..."
gh api --method PATCH "repos/$REPO" -F delete_branch_on_merge=true >/dev/null

echo
echo "Done. main is protected:"
echo "  - direct pushes blocked"
echo "  - force-push / delete main blocked"
echo "  - changes only via Pull Request"
echo "  - merged branches are auto-deleted"
echo
echo "Verify: https://github.com/$REPO/settings/rules"
gh api "repos/$REPO/rulesets" --jq '.[] | {id, name, enforcement, target}'
