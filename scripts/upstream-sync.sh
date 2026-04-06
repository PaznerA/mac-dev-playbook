#!/usr/bin/env bash
# upstream-sync.sh — Check for updates from the original mac-dev-playbook fork
set -euo pipefail

UPSTREAM_URL="https://github.com/geerlingguy/mac-dev-playbook.git"
UPSTREAM_BRANCH="master"

# Add upstream remote if missing
if ! git remote | grep -q upstream; then
    echo "Adding upstream remote: $UPSTREAM_URL"
    git remote add upstream "$UPSTREAM_URL"
fi

# Fetch upstream
echo "Fetching upstream..."
git fetch upstream "$UPSTREAM_BRANCH"

# Show divergence
AHEAD=$(git rev-list --count "upstream/$UPSTREAM_BRANCH..HEAD")
BEHIND=$(git rev-list --count "HEAD..upstream/$UPSTREAM_BRANCH")

echo ""
echo "=== Upstream Sync Status ==="
echo "  Ahead of upstream:  $AHEAD commits"
echo "  Behind upstream:    $BEHIND commits"
echo ""

if [ "$BEHIND" -gt 0 ]; then
    echo "New upstream commits:"
    git log --oneline "HEAD..upstream/$UPSTREAM_BRANCH" | head -20
    echo ""
    echo "To review changes:"
    echo "  git diff HEAD...upstream/$UPSTREAM_BRANCH -- main.yml"
    echo ""
    echo "To merge (carefully!):"
    echo "  git merge upstream/$UPSTREAM_BRANCH --no-commit"
    echo "  # Review conflicts, then: git commit"
else
    echo "Already up to date with upstream."
fi
