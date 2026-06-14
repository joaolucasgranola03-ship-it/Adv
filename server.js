const express = require('express');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

// Create tables (users now have confirmed flag) and tokens
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      confirmed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS hires (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount REAL,
      pix_key TEXT,
      payer_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS gateway_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      provider TEXT,
      provider_id TEXT,
      amount REAL,
      status TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      token TEXT,
      type TEXT,
      expires_at DATETIME
    )`
  );
});

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'm4l9c10u5-secret-change',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// Rate limiter for auth endpoints
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Configure nodemailer transporter using env vars
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

function sendMail(mailOptions){
  if(!process.env.SMTP_HOST) return Promise.resolve(); // skip if not configured
  return transporter.sendMail(mailOptions);
}

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email e senha (mín 6) são obrigatórios' });
    }
    const hash = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    stmt.run(email.toLowerCase(), hash, function (err) {
      if (err) {
        return res.status(400).json({ error: 'Usuário já existe ou dados inválidos' });
      }
      const userId = this.lastID;
      // generate confirmation token
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 24*60*60*1000).toISOString();
      db.run('INSERT INTO tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)', userId, token, 'confirm', expires);
      const confirmUrl = `${process.env.APP_URL || 'http://localhost:3000'}/confirm.html?token=${token}`;
      // send email (best-effort)
      sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@medeiros.adv',
        to: email,
        subject: 'Confirme seu e-mail - Medeiros Advocacia',
        text: `Clique para confirmar: ${confirmUrl}`,
        html: `<p>Confirme seu e-mail clicando <a href="${confirmUrl}">aqui</a>.</p>`
      }).catch(e=>console.error('mail error',e));
      req.session.userId = userId;
      return res.json({ success: true });
    });
    stmt.finalize();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/api/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
  db.get('SELECT id, password_hash, confirmed FROM users WHERE email = ?', email.toLowerCase(), async (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'Credenciais inválidas' });
    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(400).json({ error: 'Credenciais inválidas' });
    if (!row.confirmed) return res.status(403).json({ error: 'E-mail não confirmado. Verifique sua caixa de entrada.' });
    req.session.userId = row.id;
    res.json({ success: true });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  db.get('SELECT id, email, confirmed, created_at FROM users WHERE id = ?', req.session.userId, (err, row) => {
    if (err || !row) return res.json({ user: null });
    res.json({ user: { id: row.id, email: row.email, confirmed: !!row.confirmed, created_at: row.created_at } });
  });
});

app.post('/api/hire', requireAuth, (req, res) => {
  const { service, message } = req.body;
  const stmt = db.prepare('INSERT INTO hires (user_id, service, message) VALUES (?, ?, ?)');
  stmt.run(req.session.userId, service || 'Serviço não especificado', message || '', function (err) {
    if (err) return res.status(500).json({ error: 'Não foi possível registrar contratação' });
    res.json({ success: true, hireId: this.lastID });
  });
  stmt.finalize();
});

// Confirm email endpoint
app.get('/api/confirm', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Token inválido');
  db.get('SELECT id, user_id, expires_at FROM tokens WHERE token = ? AND type = ?', token, 'confirm', (err, row) => {
    if (err || !row) return res.status(400).send('Token inválido ou expirado');
    if (new Date(row.expires_at) < new Date()) return res.status(400).send('Token expirado');
    db.run('UPDATE users SET confirmed = 1 WHERE id = ?', row.user_id);
    db.run('DELETE FROM tokens WHERE id = ?', row.id);
    return res.send('E-mail confirmado. Você já pode fazer login.');
  });
});

// Request password reset
app.post('/api/request-reset', authLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });
  db.get('SELECT id FROM users WHERE email = ?', email.toLowerCase(), (err, row) => {
    if (err || !row) return res.status(200).json({ success: true }); // don't reveal
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date(Date.now() + 60*60*1000).toISOString();
    db.run('INSERT INTO tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)', row.id, token, 'reset', expires);
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset.html?token=${token}`;
    sendMail({
      from: process.env.FROM_EMAIL || 'no-reply@medeiros.adv',
      to: email,
      subject: 'Redefinir senha - Medeiros Advocacia',
      text: `Redefina sua senha: ${resetUrl}`,
      html: `<p>Redefina sua senha clicando <a href="${resetUrl}">aqui</a>. Link válido por 1 hora.</p>`
    }).catch(e=>console.error('mail error',e));
    return res.json({ success: true });
  });
});

// Reset password using token
app.post('/api/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 6) return res.status(400).json({ error: 'Token e nova senha (mín 6) são necessários' });
  db.get('SELECT id, user_id, expires_at FROM tokens WHERE token = ? AND type = ?', token, 'reset', async (err, row) => {
    if (err || !row) return res.status(400).json({ error: 'Token inválido ou expirado' });
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expirado' });
    const hash = await bcrypt.hash(password, 12);
    db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, row.user_id);
    db.run('DELETE FROM tokens WHERE id = ?', row.id);
    return res.json({ success: true });
  });
});

// PIX endpoint enhanced: register and send receipt email
app.post('/api/pix', requireAuth, (req, res) => {
  const { amount, payer_email } = req.body;
  const PIX_KEY = 'joaolucasayressoares953@gmail.com';
  const stmt = db.prepare('INSERT INTO payments (user_id, amount, pix_key, payer_email) VALUES (?, ?, ?, ?)');
  stmt.run(req.session.userId, amount || 0, PIX_KEY, payer_email || null, function (err) {
    if (err) return res.status(500).json({ error: 'Erro ao registrar pagamento' });
    const paymentId = this.lastID;
    // send receipt email if payer_email provided
    if (payer_email) {
      const receiptHtml = `<p>Recibo de pagamento</p><p>ID: ${paymentId}</p><p>Valor: R$ ${amount}</p><p>Chave PIX: ${PIX_KEY}</p>`;
      sendMail({
        from: process.env.FROM_EMAIL || 'no-reply@medeiros.adv',
        to: payer_email,
        subject: 'Recibo de pagamento - Medeiros Advocacia',
        html: receiptHtml,
      }).catch(e=>console.error('mail error',e));
    }
    res.json({ success: true, pix_key: PIX_KEY, paymentId });
  });
  stmt.finalize();
});

// Mock gateway integration endpoints
app.post('/api/gateway/create-charge', requireAuth, (req, res) => {
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: 'Valor obrigatório' });
  // Se houver um provedor externo configurado, encaminha a requisição
  if (process.env.GATEWAY_PROVIDER && process.env.GATEWAY_ENDPOINT) {
    // chama endpoint externo (ex: Gerencianet ou outro) com API_KEY
    const endpoint = process.env.GATEWAY_ENDPOINT;
    const apiKey = process.env.GATEWAY_API_KEY;
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ amount, user_id: req.session.userId })
    }).then(r=>r.json()).then(data=>{
      const providerId = data.provider_id || ('EXT-' + Date.now());
      const qr = data.qr || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('pix:'+providerId+':'+amount)}`;
      db.run('INSERT INTO gateway_charges (user_id, provider, provider_id, amount, status, payload) VALUES (?, ?, ?, ?, ?, ?)', req.session.userId, process.env.GATEWAY_PROVIDER, providerId, amount, data.status || 'PENDING', JSON.stringify(data), function(err){
        if(err) return res.status(500).json({ error: 'Erro ao criar cobrança' });
        return res.json({ success: true, charge: { id: this.lastID, provider_id: providerId, amount }, qr });
      });
    }).catch(err=>{
      console.error('gateway error', err);
      return res.status(502).json({ error: 'Erro no gateway' });
    });
    return;
  }
  // fallback: Simula criação de cobrança no provedor
  const providerId = 'MOCK-' + Date.now();
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('pix:'+providerId+':'+amount)}`;
  db.run('INSERT INTO gateway_charges (user_id, provider, provider_id, amount, status, payload) VALUES (?, ?, ?, ?, ?, ?)', req.session.userId, 'mock', providerId, amount, 'PENDING', JSON.stringify({qr}), function(err){
    if(err) return res.status(500).json({ error: 'Erro ao criar cobrança' });
    return res.json({ success: true, charge: { id: this.lastID, provider_id: providerId, amount }, qr });
  });
});

// Webhook endpoint para receber notificações do provedor (simulado)
app.post('/api/gateway/webhook', (req, res) => {
  const { provider_id, status } = req.body || {};
  if(!provider_id) return res.status(400).json({ error: 'provider_id required' });
  db.get('SELECT id, user_id FROM gateway_charges WHERE provider_id = ?', provider_id, (err,row)=>{
    if(!row) return res.status(404).json({ error: 'charge not found' });
    db.run('UPDATE gateway_charges SET status = ? WHERE id = ?', status || 'PAID', row.id);
    // Optionally: create payment record
    if(status === 'PAID' || !status){
      db.run('INSERT INTO payments (user_id, amount, pix_key, payer_email) VALUES (?, ?, ?, ?)', row.user_id, 0, 'pix', null);
    }
    res.json({ ok: true });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
