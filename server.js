// سرور Node.js — بدون هیچ وابستگی خارجی (فقط ماژول‌های داخلی: http, fs, path, url, crypto)
// اجرا: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 8000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  banks: path.join(DATA_DIR, 'banks.json'),
  transactions: path.join(DATA_DIR, 'transactions.json'),
  meta: path.join(DATA_DIR, 'meta.json'),
  notes: path.join(DATA_DIR, 'notes.json'),
  budget: path.join(DATA_DIR, 'budget.json'),
};

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
}
ensureFile(FILES.transactions, []);
ensureFile(FILES.banks, []);
ensureFile(FILES.meta, { lastUpdate: null });
ensureFile(FILES.notes, { general: '' });
ensureFile(FILES.budget, []);

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function touchMeta() {
  writeJSON(FILES.meta, { lastUpdate: new Date().toISOString() });
}

// ---------------- Auth helpers ----------------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyUser(role, username, password) {
  const users = readJSON(FILES.users);
  if (!users || !users[role]) return false;
  const rec = users[role];
  if (rec.username !== username) return false;
  const hash = hashPassword(password, rec.salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
  } catch (e) {
    return false;
  }
}

function setUserPassword(role, newPassword) {
  const users = readJSON(FILES.users);
  const salt = crypto.randomBytes(16).toString('hex');
  users[role].salt = salt;
  users[role].hash = hashPassword(newPassword, salt);
  writeJSON(FILES.users, users);
}

// in-memory sessions: token -> { role, createdAt }
const sessions = new Map();
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function createSession(role) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { role, createdAt: Date.now() });
  return token;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.sid;
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > SESSION_MAX_AGE_MS) {
    sessions.delete(token);
    return null;
  }
  return sess;
}

// ---------------- HTTP helpers ----------------
function sendJSON(res, statusCode, data, extraHeaders) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
  }, extraHeaders || {}));
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('صفحه پیدا نشد');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function collectBody(req, callback) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      callback(null, body ? JSON.parse(body) : {});
    } catch (e) {
      callback(e);
    }
  });
}

function inRange(dateStr, from, to) {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// ---------------- Server ----------------
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // ---------- Auth endpoints ----------
  if (pathname === '/api/login' && req.method === 'POST') {
    return collectBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
      const { role, username, password } = body;
      if (role !== 'viewer' && role !== 'editor') {
        return sendJSON(res, 400, { error: 'نقش نامعتبر است' });
      }
      if (!verifyUser(role, username, password)) {
        return sendJSON(res, 401, { error: 'نام کاربری یا رمز عبور اشتباه است' });
      }
      const token = createSession(role);
      return sendJSON(res, 200, { ok: true, role }, {
        'Set-Cookie': `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_MS / 1000}; SameSite=Lax`,
      });
    });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    if (cookies.sid) sessions.delete(cookies.sid);
    return sendJSON(res, 200, { ok: true }, {
      'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax',
    });
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    const sess = getSession(req);
    return sendJSON(res, 200, { role: sess ? sess.role : null });
  }

  if (pathname === '/api/change-password' && req.method === 'POST') {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'ابتدا وارد شوید' });
    return collectBody(req, (err, body) => {
      if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
      const users = readJSON(FILES.users);
      const rec = users[sess.role];
      if (!verifyUser(sess.role, rec.username, body.oldPassword)) {
        return sendJSON(res, 401, { error: 'رمز فعلی اشتباه است' });
      }
      if (!body.newPassword || String(body.newPassword).length < 4) {
        return sendJSON(res, 400, { error: 'رمز جدید باید حداقل ۴ کاراکتر باشد' });
      }
      setUserPassword(sess.role, String(body.newPassword));
      return sendJSON(res, 200, { ok: true });
    });
  }

  // All routes below require a valid session
  const protectedApi = pathname.startsWith('/api/banks') || pathname.startsWith('/api/transactions') || pathname === '/api/summary' || pathname === '/api/meta' || pathname.startsWith('/api/notes') || pathname.startsWith('/api/budget');
  if (protectedApi) {
    const sess = getSession(req);
    if (!sess) return sendJSON(res, 401, { error: 'لازم است ابتدا وارد شوید' });

    const isWrite = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
    if (isWrite && sess.role !== 'editor') {
      return sendJSON(res, 403, { error: 'شما فقط دسترسی مشاهده دارید' });
    }

    // ---- notes (single free-text note, no length limit) ----
    if (pathname === '/api/notes' && req.method === 'GET') {
      return sendJSON(res, 200, readJSON(FILES.notes) || { general: '' });
    }
    if (pathname === '/api/notes/general' && req.method === 'PUT') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const notes = readJSON(FILES.notes) || {};
        notes.general = String(body.text || '');
        writeJSON(FILES.notes, notes);
        touchMeta();
        return sendJSON(res, 200, notes);
      });
    }

    // ---- budget table (editable like banks) ----
    if (pathname === '/api/budget' && req.method === 'GET') {
      return sendJSON(res, 200, readJSON(FILES.budget));
    }
    if (pathname === '/api/budget' && req.method === 'POST') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const rows = readJSON(FILES.budget);
        const row = {
          id: 'g' + Date.now().toString(36),
          name: String(body.name || 'ردیف جدید').slice(0, 150),
          expense: Number(body.expense) || 0,
          financing: Number(body.financing) || 0,
        };
        rows.push(row);
        writeJSON(FILES.budget, rows);
        touchMeta();
        return sendJSON(res, 201, row);
      });
    }
    const budgetMatch = pathname.match(/^\/api\/budget\/([a-zA-Z0-9]+)$/);
    if (budgetMatch && req.method === 'PUT') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const rows = readJSON(FILES.budget);
        const idx = rows.findIndex((r) => r.id === budgetMatch[1]);
        if (idx === -1) return sendJSON(res, 404, { error: 'ردیف یافت نشد' });
        if (body.name !== undefined) rows[idx].name = String(body.name).slice(0, 150);
        if (body.expense !== undefined) rows[idx].expense = Number(body.expense) || 0;
        if (body.financing !== undefined) rows[idx].financing = Number(body.financing) || 0;
        writeJSON(FILES.budget, rows);
        touchMeta();
        return sendJSON(res, 200, rows[idx]);
      });
    }
    if (budgetMatch && req.method === 'DELETE') {
      const rows = readJSON(FILES.budget).filter((r) => r.id !== budgetMatch[1]);
      writeJSON(FILES.budget, rows);
      touchMeta();
      return sendJSON(res, 200, { ok: true });
    }

    // ---- meta ----
    if (pathname === '/api/meta' && req.method === 'GET') {
      return sendJSON(res, 200, readJSON(FILES.meta));
    }

    // ---- banks ----
    if (pathname === '/api/banks' && req.method === 'GET') {
      return sendJSON(res, 200, readJSON(FILES.banks));
    }
    const bankMatch = pathname.match(/^\/api\/banks\/([a-zA-Z0-9]+)$/);
    if (bankMatch && req.method === 'PUT') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const banks = readJSON(FILES.banks);
        const idx = banks.findIndex((b) => b.id === bankMatch[1]);
        if (idx === -1) return sendJSON(res, 404, { error: 'بانک یافت نشد' });
        if (body.name !== undefined) banks[idx].name = String(body.name).slice(0, 100);
        if (body.balance !== undefined) banks[idx].balance = Number(body.balance) || 0;
        banks[idx].lastUpdate = new Date().toISOString();
        writeJSON(FILES.banks, banks);
        touchMeta();
        return sendJSON(res, 200, banks[idx]);
      });
    }
    if (pathname === '/api/banks' && req.method === 'POST') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const banks = readJSON(FILES.banks);
        const bank = {
          id: 'b' + Date.now().toString(36),
          name: String(body.name || 'بانک جدید').slice(0, 100),
          balance: Number(body.balance) || 0,
          lastUpdate: new Date().toISOString(),
        };
        banks.push(bank);
        writeJSON(FILES.banks, banks);
        touchMeta();
        return sendJSON(res, 201, bank);
      });
    }
    if (bankMatch && req.method === 'DELETE') {
      const banks = readJSON(FILES.banks).filter((b) => b.id !== bankMatch[1]);
      writeJSON(FILES.banks, banks);
      touchMeta();
      return sendJSON(res, 200, { ok: true });
    }

    // ---- transactions ----
    if (pathname === '/api/transactions' && req.method === 'GET') {
      let records = readJSON(FILES.transactions);
      const { from, to } = query;
      if (from || to) records = records.filter((r) => inRange(r.date, from, to));
      return sendJSON(res, 200, records);
    }
    if (pathname === '/api/transactions' && req.method === 'POST') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const records = readJSON(FILES.transactions);
        const record = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: String(body.title || '').slice(0, 200),
          amount: Number(body.amount) || 0,
          type: body.type === 'income' ? 'income' : 'expense',
          category: String(body.category || 'سایر').slice(0, 100),
          date: body.date || new Date().toISOString().slice(0, 10),
          createdAt: new Date().toISOString(),
        };
        records.unshift(record);
        writeJSON(FILES.transactions, records);
        touchMeta();
        return sendJSON(res, 201, record);
      });
    }
    const txMatch = pathname.match(/^\/api\/transactions\/([a-zA-Z0-9]+)$/);
    if (txMatch && req.method === 'DELETE') {
      const records = readJSON(FILES.transactions).filter((r) => r.id !== txMatch[1]);
      writeJSON(FILES.transactions, records);
      touchMeta();
      return sendJSON(res, 200, { ok: true });
    }
    if (txMatch && req.method === 'PUT') {
      return collectBody(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: 'داده نامعتبر است' });
        const records = readJSON(FILES.transactions);
        const idx = records.findIndex((r) => r.id === txMatch[1]);
        if (idx === -1) return sendJSON(res, 404, { error: 'یافت نشد' });
        records[idx] = Object.assign({}, records[idx], body, { id: records[idx].id });
        writeJSON(FILES.transactions, records);
        touchMeta();
        return sendJSON(res, 200, records[idx]);
      });
    }

    // ---- summary ----
    if (pathname === '/api/summary' && req.method === 'GET') {
      let records = readJSON(FILES.transactions);
      const { from, to } = query;
      if (from || to) records = records.filter((r) => inRange(r.date, from, to));
      const income = records.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const expense = records.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      const banks = readJSON(FILES.banks);
      const banksTotal = banks.reduce((s, b) => s + b.balance, 0);
      const ratio = income > 0 ? Math.round((expense / income) * 100) : 0;
      return sendJSON(res, 200, { income, expense, ratio, banksTotal, count: records.length });
    }

    return sendJSON(res, 404, { error: 'مسیر API یافت نشد' });
  }

  if (pathname.startsWith('/api/')) {
    return sendJSON(res, 404, { error: 'مسیر API یافت نشد' });
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✔ سرور روی پورت ${PORT} اجرا شد → http://localhost:${PORT}`);
});
