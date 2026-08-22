CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  pass TEXT,
  name TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  avatar_kind TEXT DEFAULT 'none',
  role TEXT DEFAULT 'user',
  settings TEXT DEFAULT '{}',
  bookmarks TEXT DEFAULT '[]',
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id TEXT,
  expires INTEGER
);

CREATE TABLE IF NOT EXISTS friends(
  a TEXT,
  b TEXT,
  status TEXT DEFAULT 'pending',
  created_at INTEGER,
  PRIMARY KEY(a,b)
);

CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  receiver TEXT,
  kind TEXT,
  content TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_msg ON messages(sender, receiver, id);
CREATE INDEX IF NOT EXISTS idx_msg2 ON messages(receiver, sender, id);
