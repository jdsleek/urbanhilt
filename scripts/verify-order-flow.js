#!/usr/bin/env node
/**
 * Verifies DB + order pipeline (run from repo root).
 *
 *   DATABASE_URL=postgres://... node scripts/verify-order-flow.js
 *
 * Optional (live HTTP against running server):
 *   BASE_URL=http://localhost:3000 node scripts/verify-order-flow.js
 */

const { query, initDatabase } = require('../db/database');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL');
    process.exit(1);
  }

  await initDatabase();

  const { rows: counts } = await query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'awaiting_staff')::int AS awaiting
    FROM orders
  `);
  console.log('Orders in DB:', counts[0]);

  const { rows: latest } = await query(
    `SELECT id, order_number, status, payment_method, created_at FROM orders ORDER BY created_at DESC LIMIT 5`
  );
  console.log('Latest 5 orders:', latest);

  const base = process.env.BASE_URL;
  if (base) {
    const url = `${base.replace(/\/$/, '')}/api/health`;
    const res = await fetch(url);
    const j = await res.json().catch(() => ({}));
    console.log('GET /api/health', res.status, j);
  }

  console.log('OK — DB reachable. If admin shows 0 orders but store shows success, compare DATABASE_URL / hostname (www vs apex) on Railway.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
