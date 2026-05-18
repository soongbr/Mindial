const path = require('path');
const fs = require('fs');

// 确保 data 目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'users.db');

// sql.js 是异步的，我们用初始化好的 db 实例
let db = null;
let initSqlJs = null;

function getDb() {
  return db;
}

async function initDb() {
  if (!initSqlJs) {
    initSqlJs = require('sql.js');
  }
  
  const SQL = await initSqlJs();
  
  // 尝试读取已存在的数据库文件
  let dbBuffer = null;
  if (fs.existsSync(DB_PATH)) {
    try {
      dbBuffer = fs.readFileSync(DB_PATH);
    } catch (e) {
      console.log('读取现有数据库失败，将创建新数据库');
    }
  }
  
  db = new SQL.Database(dbBuffer);
  
  db.run(`
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
  
  // 保存到文件
  saveDb();
  
  console.log('🗄️  数据库初始化完成');
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 关闭数据库时保存
process.on('exit', () => saveDb());

module.exports = { getDb, initDb, saveDb };