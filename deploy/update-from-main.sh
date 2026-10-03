#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
export PATH=/opt/timuroid-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export GIT_TERMINAL_PROMPT=0
state=/var/lib/timuroid-deploy
repo=$state/repository.git
mkdir -p "$state"
exec 9>"$state/update.lock"
flock -n 9 || exit 0
if [[ ! -d "$repo" ]]; then
  git init --bare "$repo"
  git --git-dir="$repo" remote add origin https://github.com/timuroid/iam-timuroid-site.git
fi
timeout 90 git --git-dir="$repo" fetch --quiet --no-tags origin +refs/heads/main:refs/heads/main
revision=$(git --git-dir="$repo" rev-parse refs/heads/main)
# First installation records the remote baseline without downgrading a newer
# manually deployed site. Subsequent changes to main are deployed automatically.
if [[ ! -f "$state/last-success" ]]; then
  printf '%s\n' "$revision" > "$state/last-success"
  echo "Recorded initial main baseline: $revision"
  exit 0
fi
[[ $(cat "$state/last-success") != "$revision" ]] || { echo "Main unchanged: $revision"; exit 0; }
release=/opt/timuroid/releases/main-$revision
mkdir -p "$release"
git --git-dir="$repo" archive "$revision" | tar -x -C "$release"
chown -R timuroid:timuroid "$release"
runuser -u timuroid -- env PATH="$PATH" HOME=/var/lib/timuroid bash -c '
  set -e
  cd "$1"
  npm ci --no-audit --no-fund
  npm run check
  npm run check:agent
  npm run check:admin
  npm run build
' _ "$release"
# Back up application data only after validation, before any startup migration.
mkdir -p /var/lib/timuroid/backups
python3 - "$release" <<'PY'
import sqlite3, sys
from pathlib import Path
source=Path('/var/lib/timuroid/timuroid.sqlite')
if source.exists():
    target=source.parent/'backups'/('before-'+Path(sys.argv[1]).name+'.sqlite')
    with sqlite3.connect(str(source)) as src, sqlite3.connect(str(target)) as dst:
        src.backup(dst)
        assert dst.execute('PRAGMA quick_check').fetchone()[0]=='ok'
    target.chmod(0o600)
PY
previous=$(readlink -f /opt/timuroid/current)
switched=0
rollback(){
  code=$?
  if [[ $switched == 1 ]]; then
    ln -s "$previous" /opt/timuroid/current.rollback
    mv -Tf /opt/timuroid/current.rollback /opt/timuroid/current
    systemctl restart timuroid || true
    echo "Deployment failed; restored $previous" >&2
  fi
  exit "$code"
}
trap rollback ERR
ln -s "$release" /opt/timuroid/current.next
mv -Tf /opt/timuroid/current.next /opt/timuroid/current
switched=1
systemctl restart timuroid
healthy=0
for attempt in {1..15}; do
  if systemctl is-active --quiet timuroid && curl --fail --silent --max-time 3 http://127.0.0.1:4318/ > /dev/null; then healthy=1; break; fi
  sleep 1
done
[[ $healthy == 1 ]]
curl --fail --silent --max-time 15 https://iam.timuroid.ru/ > /dev/null
printf '%s\n' "$revision" > "$state/last-success.next"
mv "$state/last-success.next" "$state/last-success"
switched=0
trap - ERR
echo "Deployed main $revision to $release"
