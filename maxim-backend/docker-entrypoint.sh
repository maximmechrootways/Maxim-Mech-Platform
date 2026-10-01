#!/bin/sh
set -e

echo "[backend] Generating Prisma client..."
npx prisma generate

# Local Docker uses schema push. Production/staging should set PRISMA_MIGRATE_DEPLOY=true.
if [ "${PRISMA_MIGRATE_DEPLOY:-false}" = "true" ]; then
  echo "[backend] Applying migrations (migrate deploy)..."
  attempt=1
  max_attempts=30
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[backend] migrate deploy failed after ${max_attempts} attempts"
      exit 1
    fi
    echo "[backend] Database not ready (attempt ${attempt}/${max_attempts}); retrying in 2s..."
    attempt=$((attempt + 1))
    sleep 2
  done
else
  echo "[backend] Syncing schema with prisma db push..."
  attempt=1
  max_attempts=30
  until npx prisma db push --accept-data-loss --skip-generate; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "[backend] db push failed after ${max_attempts} attempts"
      exit 1
    fi
    echo "[backend] Database not ready (attempt ${attempt}/${max_attempts}); retrying in 2s..."
    attempt=$((attempt + 1))
    sleep 2
  done
fi

if [ "${SEED_DEMO_USERS:-false}" = "true" ]; then
  echo "[backend] Seeding demo users..."
  npx ts-node scripts/seed-demo-users.ts || echo "[backend] Demo user seed skipped/failed (non-fatal)."
fi

echo "[backend] Starting application..."
exec "$@"
