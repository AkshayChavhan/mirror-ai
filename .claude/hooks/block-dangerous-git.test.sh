#!/bin/bash
# Tests for block-dangerous-git.sh. Run: bash .claude/hooks/block-dangerous-git.test.sh
# Expect exit 2 (blocked) or 0 (allowed) for each command.

HOOK="$(dirname "$0")/block-dangerous-git.sh"
FAILS=0

check() {
  local cmd=$1 expected=$2
  jq -n --arg c "$cmd" '{tool_input:{command:$c}}' | "$HOOK" 2>/dev/null
  local actual=$?
  if [ "$actual" = "$expected" ]; then
    echo "PASS ($actual) $cmd"
  else
    echo "FAIL (got $actual, want $expected) $cmd"
    FAILS=$((FAILS + 1))
  fi
}

# Blocked
check "git push origin main" 2
check "git push" 2
check "git push --force origin 07_adding_skills" 2
check "git push -f origin 07_adding_skills" 2
check "git push origin --delete 01_installation_setup" 2
check "git push origin 07_adding_skills:main" 2
check "git push -u origin 07_adding_skills && git push origin main" 2
check "git reset --hard HEAD~1" 2
check "git clean -fd" 2
check "git branch -D 01_installation_setup" 2
check "git checkout ." 2
check "git restore ." 2

# Allowed
check "git push -u origin 07_adding_skills" 0
check "git -c credential.helper= push -u origin 08_adding_rules_reviewer_subagent 2>&1 | tail -2" 0
check "git status" 0
check "git checkout -b 08_adding_rules_reviewer_subagent" 0
check "git commit -m 'x'" 0

echo "Failures: $FAILS"
[ "$FAILS" = 0 ]
