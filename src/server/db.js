import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'instaboard.sqlite');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

// Initialize schema
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sessions (
    code TEXT PRIMARY KEY,
    name TEXT,
    total_following INTEGER DEFAULT 0,
    total_followers INTEGER DEFAULT 0,
    non_followers_count INTEGER DEFAULT 0,
    items_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS completed_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_code TEXT NOT NULL,
    username TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    UNIQUE(session_code, username),
    FOREIGN KEY (session_code) REFERENCES sessions(code) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_completed_session ON completed_actions(session_code);
  CREATE INDEX IF NOT EXISTS idx_completed_time ON completed_actions(completed_at);
`);

/**
 * Generate a friendly 6-8 character alphanumeric sync code e.g. SYNC-8291
 */
export function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoid ambiguous characters
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYNC-${code}`;
}

/**
 * Create or replace a session
 */
export function saveSession({
  code,
  name = 'Instagram Session',
  totalFollowing = 0,
  totalFollowers = 0,
  items = []
}) {
  const syncCode = code || generateSyncCode();
  const now = Date.now();
  const nonFollowersCount = items.length;
  const itemsJson = JSON.stringify(items);

  const stmt = db.prepare(`
    INSERT INTO sessions (code, name, total_following, total_followers, non_followers_count, items_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      total_following = excluded.total_following,
      total_followers = excluded.total_followers,
      non_followers_count = excluded.non_followers_count,
      items_json = excluded.items_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    syncCode,
    name,
    totalFollowing,
    totalFollowers,
    nonFollowersCount,
    itemsJson,
    now,
    now
  );

  return getSession(syncCode);
}

/**
 * Fetch a session with its completed statuses and safety pace analytics
 */
export function getSession(code) {
  const sessionStmt = db.prepare(`
    SELECT code, name, total_following, total_followers, non_followers_count, items_json, created_at, updated_at
    FROM sessions
    WHERE code = ?
  `);
  const session = sessionStmt.get(code);
  if (!session) return null;

  const actionsStmt = db.prepare(`
    SELECT username, completed_at
    FROM completed_actions
    WHERE session_code = ?
    ORDER BY completed_at DESC
  `);
  const actions = actionsStmt.all(code);

  const completedMap = {};
  actions.forEach(a => {
    completedMap[a.username.toLowerCase()] = a.completed_at;
  });

  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const actionsLastHour = actions.filter(a => a.completed_at >= oneHourAgo).length;

  let parsedItems = [];
  try {
    parsedItems = JSON.parse(session.items_json);
  } catch {
    parsedItems = [];
  }

  return {
    code: session.code,
    name: session.name,
    totalFollowing: session.total_following,
    totalFollowers: session.total_followers,
    nonFollowersCount: session.non_followers_count,
    completedCount: actions.length,
    remainingCount: Math.max(0, session.non_followers_count - actions.length),
    actionsLastHour,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    completedMap,
    items: parsedItems
  };
}

/**
 * Toggle or set account completed state
 */
export function setAccountStatus(code, username, isCompleted) {
  const normalizedUser = username.trim().toLowerCase();
  const now = Date.now();

  if (isCompleted) {
    const insertStmt = db.prepare(`
      INSERT INTO completed_actions (session_code, username, completed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(session_code, username) DO UPDATE SET completed_at = excluded.completed_at
    `);
    insertStmt.run(code, normalizedUser, now);
  } else {
    const deleteStmt = db.prepare(`
      DELETE FROM completed_actions
      WHERE session_code = ? AND username = ?
    `);
    deleteStmt.run(code, normalizedUser);
  }

  // Touch session updated_at
  db.prepare(`UPDATE sessions SET updated_at = ? WHERE code = ?`).run(now, code);

  return getSession(code);
}

/**
 * Reset all completed accounts for a session
 */
export function resetSessionActions(code) {
  db.prepare(`DELETE FROM completed_actions WHERE session_code = ?`).run(code);
  db.prepare(`UPDATE sessions SET updated_at = ? WHERE code = ?`).run(Date.now(), code);
  return getSession(code);
}
