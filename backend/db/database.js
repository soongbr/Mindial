const path = require('path');
const fs = require('fs');

// 确保 data 目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'users.db');
const DB_RAW_PATH = path.join(__dirname, '..', 'data', 'users.db');

// 注意：better-sqlite3 需要使用绝对路径或相对于 cwd 的路径
const Database = require('better-sqlite3');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_RAW_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * 初始化数据库表
 */
function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      used INTEGER NOT NULL DEFAULT 0,
      used_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (used_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_invite_codes_used ON invite_codes(used);
  `);

  console.log('🗄️  数据库表初始化完成');
}

module.exports = { getDb, initDb };
