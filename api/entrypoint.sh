#!/bin/sh
set -e

# The data directory arrives as a bind mount from the host and typically belongs to root
# there — the permissions from the image are covered by it. So straighten them out once
# here and only then drop privileges.
#
# The alternative would be to demand a `chown` from the user before the first start. A
# deployment that fails on a forgotten manual step is a bad
# Deployment.
if [ -d "${DATA_DIR:-/data}" ]; then
  chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
fi

exec su-exec node "$@"
