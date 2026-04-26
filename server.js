// Wedding Vote — tiny self-hosted vote server
// Fastify + better-sqlite3, runs in Docker on Unraid behind Cloudflare Tunnel
//
// Auth model:
//   - Voter enters their name to vote
//   - Browser cookie ties that name to the device (stops casual double-voting)
//   - GET /api/votes returns only the total count publicly
//   - Full results (counts per dress, voter names, comments) require the RESULTS_PASSWORD

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- config ----------
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.DB_PATH || '/data/votes.db';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const RESULTS_PASSWORD = process.env.RESULTS_PASSWORD || '';
const VALID_DRESSES = new Set(['azazie', 'etsy', 'vinted']);

// ---------- database ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    voter_id   TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    dress_id   TEXT NOT NULL,
    comment    TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dress ON votes(dress_id);
  CREATE INDEX IF NOT EXISTS idx_name  ON votes(name COLLATE NOCASE);
`);

const stmts = {
  upsert: db.prepare(`
    INSERT INTO votes (voter_id, name, dress_id, comment)
    VALUES (@voter_id, @name, @dress_id, @comment)
    ON CONFLICT(voter_id) DO UPDATE SET
      name       = excluded.name,
      dress_id   = excluded.dress_id,
      comment    = excluded.comment,
      updated_at = datetime('now')
  `),
  list:   db.prepare(`SELECT voter_id, name, dress_id, comment, updated_at FROM votes ORDER BY updated_at DESC`),
  byVoter: db.prepare(`SELECT * FROM votes WHERE voter_id = ?`),
  reset:  db.prepare(`DELETE FROM votes`),
};

// ---------- server ----------
const app = Fastify({
  logger: { transport: { target: 'pino-pretty' } },
  trustProxy: true, // we're behind Cloudflare Tunnel
});

await app.register(fastifyCookie);
await app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
});

function ensureVoterId(req, reply) {
  let voterId = req.cookies?.voter_id;
  if (!voterId) {
    voterId = randomUUID();
    reply.setCookie('voter_id', voterId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true, // we're always served over HTTPS via Cloudflare
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }
  return voterId;
}

// ---------- routes ----------

// Returns only the total count publicly; full results require the RESULTS_PASSWORD query param.
app.get('/api/votes', (req, reply) => {
  const voterId = ensureVoterId(req, reply);
  const rows = stmts.list.all();

  const counts = { azazie: 0, etsy: 0, vinted: 0 };
  for (const r of rows) {
    if (counts.hasOwnProperty(r.dress_id)) counts[r.dress_id]++;
  }
  const total = counts.azazie + counts.etsy + counts.vinted;

  const mine = stmts.byVoter.get(voterId);

  const pw = req.query?.pw ?? '';
  const resultsRevealed = RESULTS_PASSWORD !== '' && pw === RESULTS_PASSWORD;

  if (!resultsRevealed) {
    return {
      hasVoted: !!mine,
      total,
      resultsRevealed: false,
      me: mine ? { name: mine.name, dress: mine.dress_id, comment: mine.comment || '' } : null,
    };
  }

  // Password correct: full reveal
  const voters = { azazie: [], etsy: [], vinted: [] };
  const comments = [];
  for (const r of rows) {
    if (voters[r.dress_id]) voters[r.dress_id].push(r.name);
    if (r.comment) comments.push({ name: r.name, dress: r.dress_id, comment: r.comment });
  }

  return {
    hasVoted: !!mine,
    counts,
    total,
    voters,
    comments,
    resultsRevealed: true,
    me: mine ? { name: mine.name, dress: mine.dress_id, comment: mine.comment || '' } : null,
  };
});

// Cast or update a vote
app.post('/api/votes', (req, reply) => {
  const voterId = ensureVoterId(req, reply);
  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 40);
  const dress = String(body.dress || '').toLowerCase().trim();
  const comment = String(body.comment || '').trim().slice(0, 500);

  if (!name) return reply.code(400).send({ error: 'Name is required' });
  if (!VALID_DRESSES.has(dress)) return reply.code(400).send({ error: 'Invalid dress' });

  stmts.upsert.run({
    voter_id: voterId,
    name,
    dress_id: dress,
    comment: comment || null,
  });

  return { ok: true };
});

// Admin reset — set ADMIN_TOKEN env var, send X-Admin-Token header
app.delete('/api/votes', (req, reply) => {
  if (!ADMIN_TOKEN || req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  stmts.reset.run();
  return { ok: true };
});

// Healthcheck (for Docker / Unraid container monitoring)
app.get('/healthz', () => ({ ok: true, ts: new Date().toISOString() }));

// ---------- start ----------
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`✓ Wedding vote server listening on ${HOST}:${PORT}`);
  console.log(`  Database: ${DB_PATH}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
