#!/bin/sh
set -e

# The app's files survive a deploy.
#
# The views are loaded on demand and their file names carry a content hash. When the
# image was replaced wholesale, the files of the old version were gone in the same
# moment — a device that still had the app open was running JavaScript pointing at files
# that no longer existed. The navigation item then apparently did nothing.
#
# So /assets lives in a directory that outlives the rebuild: new files are ADDED, old
# ones stay. A device on the old version keeps working until it reloads by itself. The
# emergency exit in the router still exists — it is just no longer the normal case.
#
# index.html, sw.js and the manifest, by contrast, are ALWAYS replaced: they carry no
# hash and have to show the new version.

DIST=/opt/app-dist
ROOT=/usr/share/nginx/html
KEEP_DAYS="${ASSET_KEEP_DAYS:-30}"

mkdir -p "$ROOT/assets"

# Copy without ever deleting: new files are added, same-named ones overwritten (with an
# identical hash the content is identical anyway), old ones stay.
#
# Explicitly WITHOUT `-n`: the BusyBox `cp` in this image does create the files with
# `-Rn` but writes NO content — everything ends up at 0 bytes. Ship that once and the
# page stays blank.
#
# The side effect of copying is wanted here: every file of this version gets today's
# date. That is exactly how the cleanup below knows what is still needed.
cp -R "$DIST/assets/." "$ROOT/assets/"

# Cleanup: whatever has not appeared in any version for KEEP_DAYS is no longer needed.
# Without this the directory would grow with every deploy.
removed=$(find "$ROOT/assets" -type f -mtime "+$KEEP_DAYS" -print -delete | wc -l)

# Replace everything else.
find "$DIST" -maxdepth 1 -type f -exec cp {} "$ROOT/" \;

echo "web: $(find "$ROOT/assets" -type f | wc -l) files available, $removed stale ones removed"

exec nginx -g 'daemon off;'
