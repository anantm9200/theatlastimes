#!/usr/bin/env bash
set -euo pipefail
umask 077
atlas_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$atlas_root"
atlas_archive=${1:-$(find backups -maxdepth 1 -name 'news-*.archive.gz' -type f | sort | tail -1)}
test -n "$atlas_archive" && test -s "$atlas_archive"
atlas_restore="atlas-backup-check-$$"
trap 'docker rm --force --volumes "$atlas_restore" >/dev/null 2>&1 || true' EXIT
# No network or published port: this disposable database cannot receive traffic.
docker run --detach --name "$atlas_restore" --network none --memory 512m --cpus 1 mongo:8.2 --bind_ip 127.0.0.1 --wiredTigerCacheSizeGB 0.25 >/dev/null
atlas_ready=0
for atlas_attempt in {1..30}; do
  if docker exec "$atlas_restore" mongosh --quiet --eval 'quit(db.adminCommand({ping: 1}).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then atlas_ready=1; break; fi
  sleep 1
done
test "$atlas_ready" = 1
docker cp "$atlas_archive" "$atlas_restore:/tmp/restore.archive.gz"
docker exec "$atlas_restore" mongorestore --archive=/tmp/restore.archive.gz --gzip --oplogReplay
docker exec "$atlas_restore" mongosh --quiet --eval '
const names = db.adminCommand({listDatabases: 1, nameOnly: true}).databases.map(d => d.name).filter(n => !["admin", "local", "config"].includes(n));
if (names.length !== 1) throw new Error("Expected exactly one application database");
const restored = db.getSiblingDB(names[0]);
const counts = Object.fromEntries(restored.getCollectionNames().sort().map(n => [n, restored.getCollection(n).countDocuments()]));
if (!counts.news_articles || !counts.news_identifiers || !counts.news_audit) throw new Error("Restored news inventory is incomplete");
print(JSON.stringify({restoredDatabase: names[0], counts}));'
echo 'Backup restore rehearsal completed; disposable database removed on exit'
