import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'instaboard.sqlite');
const FALLBACK_JSON_PATH = path.join(DATA_DIR, 'instaboard_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// 1. Try loading native node:sqlite (Node.js >= 22.5.0)
// ---------------------------------------------------------------------------
let sqliteDb = null;
let useSqlite = false;

try {
  const sqliteMod = await import('node:sqlite');
  if (sqliteMod && sqliteMod.DatabaseSync) {
    sqliteDb = new sqliteMod.DatabaseSync(DB_PATH);
    sqliteDb.exec(`
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
    useSqlite = true;
    console.log('✓ Using native node:sqlite database at', DB_PATH);
  }
} catch {
  useSqlite = false;
  console.warn(`⚠️ node:sqlite not available on this Node version (${process.version}).`);
  console.warn('✓ Automatically falling back to persistent JSON storage at', FALLBACK_JSON_PATH);
}

// ---------------------------------------------------------------------------
// 2. Fallback File-Backed Storage (for Node.js < 22.5.0 e.g. Node 18)
// ---------------------------------------------------------------------------
function loadJsonStore() {
  try {
    if (fs.existsSync(FALLBACK_JSON_PATH)) {
      const raw = fs.readFileSync(FALLBACK_JSON_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading fallback JSON store:', e);
  }
  return { sessions: {}, actions: {} };
}

function saveJsonStore(store) {
  try {
    const tmpPath = `${FALLBACK_JSON_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmpPath, FALLBACK_JSON_PATH);
  } catch (e) {
    console.error('Error writing fallback JSON store:', e);
  }
}

// ---------------------------------------------------------------------------
// 3. Sync Code Generator
// ---------------------------------------------------------------------------
export function generateSyncCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYNC-${code}`;
}

// ---------------------------------------------------------------------------
// 4. Session Operations
// ---------------------------------------------------------------------------
export function saveSession({
  code,
  name = 'Instagram Session',
  totalFollowing = 0,
  totalFollowers = 0,
  items = []
}) {
  const syncCode = (code || generateSyncCode()).toUpperCase().trim();
  const now = Date.now();
  const nonFollowersCount = items.length;

  if (useSqlite && sqliteDb) {
    const itemsJson = JSON.stringify(items);
    const stmt = sqliteDb.prepare(`
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

  // JSON Fallback
  const store = loadJsonStore();
  store.sessions[syncCode] = {
    code: syncCode,
    name,
    totalFollowing: Number(totalFollowing) || 0,
    totalFollowers: Number(totalFollowers) || 0,
    nonFollowersCount,
    items,
    createdAt: store.sessions[syncCode]?.createdAt || now,
    updatedAt: now
  };
  saveJsonStore(store);
  return getSession(syncCode);
}

export function getSession(code) {
  if (!code) return null;
  const syncCode = code.toUpperCase().trim();

  if (useSqlite && sqliteDb) {
    const sessionStmt = sqliteDb.prepare(`
      SELECT code, name, total_following, total_followers, non_followers_count, items_json, created_at, updated_at
      FROM sessions
      WHERE code = ?
    `);
    const session = sessionStmt.get(syncCode);
    if (!session) return null;

    const actionsStmt = sqliteDb.prepare(`
      SELECT username, completed_at
      FROM completed_actions
      WHERE session_code = ?
      ORDER BY completed_at DESC
    `);
    const actions = actionsStmt.all(syncCode);

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

  // JSON Fallback
  const store = loadJsonStore();
  const session = store.sessions[syncCode];
  if (!session) return null;

  const sessionActions = store.actions[syncCode] || {};
  const completedMap = {};
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  let actionsLastHour = 0;
  let completedCount = 0;

  for (const [user, timestamp] of Object.entries(sessionActions)) {
    completedMap[user.toLowerCase()] = timestamp;
    completedCount++;
    if (timestamp >= oneHourAgo) {
      actionsLastHour++;
    }
  }

  return {
    code: session.code,
    name: session.name,
    totalFollowing: session.totalFollowing,
    totalFollowers: session.totalFollowers,
    nonFollowersCount: session.nonFollowersCount,
    completedCount,
    remainingCount: Math.max(0, session.nonFollowersCount - completedCount),
    actionsLastHour,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedMap,
    items: session.items || []
  };
}

export function setAccountStatus(code, username, isCompleted) {
  const syncCode = code.toUpperCase().trim();
  const normalizedUser = username.trim().toLowerCase();
  const now = Date.now();

  if (useSqlite && sqliteDb) {
    if (isCompleted) {
      const insertStmt = sqliteDb.prepare(`
        INSERT INTO completed_actions (session_code, username, completed_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_code, username) DO UPDATE SET completed_at = excluded.completed_at
      `);
      insertStmt.run(syncCode, normalizedUser, now);
    } else {
      const deleteStmt = sqliteDb.prepare(`
        DELETE FROM completed_actions
        WHERE session_code = ? AND username = ?
      `);
      deleteStmt.run(syncCode, normalizedUser);
    }
    sqliteDb.prepare(`UPDATE sessions SET updated_at = ? WHERE code = ?`).run(now, syncCode);
    return getSession(syncCode);
  }

  // JSON Fallback
  const store = loadJsonStore();
  if (!store.actions[syncCode]) {
    store.actions[syncCode] = {};
  }
  if (isCompleted) {
    store.actions[syncCode][normalizedUser] = now;
  } else {
    delete store.actions[syncCode][normalizedUser];
  }
  if (store.sessions[syncCode]) {
    store.sessions[syncCode].updatedAt = now;
  }
  saveJsonStore(store);
  return getSession(syncCode);
}

export function resetSessionActions(code) {
  const syncCode = code.toUpperCase().trim();
  const now = Date.now();

  if (useSqlite && sqliteDb) {
    sqliteDb.prepare(`DELETE FROM completed_actions WHERE session_code = ?`).run(syncCode);
    sqliteDb.prepare(`UPDATE sessions SET updated_at = ? WHERE code = ?`).run(now, syncCode);
    return getSession(syncCode);
  }

  // JSON Fallback
  const store = loadJsonStore();
  store.actions[syncCode] = {};
  if (store.sessions[syncCode]) {
    store.sessions[syncCode].updatedAt = now;
  }
  saveJsonStore(store);
  return getSession(syncCode);
}
