#!/usr/bin/env bash
# Vercel ignoreCommand: exit 0 = skip build, exit 1 = build.
# Skips the build when nothing under web/ changed since the last deploy.
if [ -z "$VERCEL_GIT_PREVIOUS_SHA" ]; then exit 1; fi
git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . && exit 0 || exit 1
