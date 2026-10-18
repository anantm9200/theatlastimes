#!/usr/bin/env bash
set -euo pipefail
umask 077
atlas_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$atlas_root"
mkdir -p backups
exec 9>backups/.backup.lock
flock -n 9 || exit 0
atlas_backup="backups/news-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
atlas_temporary="${atlas_backup}.partial"
trap 'rm -f -- "$atlas_temporary"' EXIT
# This dedicated replica set contains only Atlas Times data. Include its oplog
# so restores can replay writes made during the dump to a consistent point.
# Feed the password through a private pipe, never a process argument.
docker compose --env-file .env.dgx -f compose.dgx.yaml exec -T mongo bash -ec 'printf "password: %s\n" "$MONGO_INITDB_ROOT_PASSWORD" | mongodump --config=/dev/stdin --host=127.0.0.1 --port=27019 --username="$MONGO_INITDB_ROOT_USERNAME" --authenticationDatabase=admin --oplog --archive --gzip' > "$atlas_temporary"
test -s "$atlas_temporary"
mv -- "$atlas_temporary" "$atlas_backup"
find backups -maxdepth 1 -type f -name 'news-*.archive.gz' -mtime +7 -delete
echo "Local MongoDB backup completed"
