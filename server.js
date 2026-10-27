// =============================================================================
// Kanbinou - Serveur Léger Node.js / Express & Base SQLite Autonome
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Support du dossier de données persistant (idéal pour Docker / volumes NAS)
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Gestion robuste du secret JWT : persistance automatique dans un fichier local protégé
const SECRET_FILE = process.env.SECRET_FILE || path.join(DATA_DIR, '.jwt_secret');
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (fs.existsSync(SECRET_FILE)) {
    JWT_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } else {
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
    try {
      fs.writeFileSync(SECRET_FILE, JWT_SECRET, { mode: 0o600 });
    } catch (err) {
      console.warn('Impossible de persister .jwt_secret :', err.message);
    }
  }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialisation de la base SQLite locale
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'kanbinou.sqlite');
const db = new Database(DB_FILE);

// Optimisation WAL (Write-Ahead Logging) pour de hautes performances concurrentes
db.pragma('journal_mode = WAL');

// Initialisation des tables SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Général',
    status TEXT DEFAULT 'available',
    attributes_json TEXT DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS allocations (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    label TEXT,
    task_ref TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#64748b',
    is_roadmap_eligible INTEGER DEFAULT 0,
    requires_resource INTEGER DEFAULT 0,
    order_idx INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    color TEXT DEFAULT '#0284c7',
    order_idx INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    column_id TEXT NOT NULL,
    category_id TEXT DEFAULT 'neutre',
    resource_id TEXT,
    start_date TEXT,
    end_date TEXT,
    allocation_id TEXT,
    user_id TEXT,
    user_name TEXT,
    time REAL DEFAULT 0,
    projection REAL DEFAULT 0,
    is_sold INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    sensitive_json TEXT DEFAULT '{}',
    is_shared INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shared_tasks (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    encrypted_payload TEXT,
    allocation_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS workspace_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Données initiales pour les colonnes, catégories et terminologie si la base est neuve
const countCols = db.prepare('SELECT COUNT(*) as c FROM columns').get().c;
if (countCols === 0) {
  // Colonnes par défaut
  const insertCol = db.prepare('INSERT OR IGNORE INTO columns (id, title, color, order_idx, is_visible) VALUES (?, ?, ?, ?, 1)');
  insertCol.run('todo', 'À faire', '#0284c7', 1);
  insertCol.run('doing', 'En cours', '#f59e0b', 2);
  insertCol.run('waiting', 'En attente', '#8b5cf6', 3);
  insertCol.run('done', 'Terminé', '#10b981', 4);

  // Catégories par défaut (Couleurs historiques de Kanbinou)
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (id, name, color, is_roadmap_eligible, requires_resource, order_idx) VALUES (?, ?, ?, ?, ?, ?)');
  insertCat.run('commercial', 'Commercial', '#c5e1a5', 0, 0, 1);
  insertCat.run('essais', 'Essais', '#ffcc80', 1, 1, 2);
  insertCat.run('sav', 'SAV', '#ef9a9a', 0, 0, 3);
  insertCat.run('livraison', 'Livraison', '#81d4fa', 0, 0, 4);
  insertCat.run('neutre', 'Neutre', '#e0e0e0', 0, 0, 5);

  // Configuration métier
  db.prepare('INSERT OR IGNORE INTO workspace_config (key, value_json) VALUES (?, ?)').run(
    'terminology',
    JSON.stringify({
      resourceSingular: 'Produit',
      resourcePlural: 'Produits',
      eventSingular: 'Essai',
      eventPlural: 'Essais'
    })
  );
}

// -----------------------------------------------------------------------------
// TEMPS RÉEL : Server-Sent Events (SSE) natif (~25 lignes)
// -----------------------------------------------------------------------------
let sseClients = [];

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Message de bienvenue
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

function broadcastEvent(type, payload) {
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  sseClients.forEach(c => c.res.write(`data: ${data}\n\n`));
}

// -----------------------------------------------------------------------------
// AUTHENTIFICATION & MIDDLEWARES
// -----------------------------------------------------------------------------
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

app.post('/api/auth/login', (req, res) => {
  const { username, password, remember = true } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }

  const expiresIn = remember ? '90d' : '1d';
  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
    JWT_SECRET,
    { expiresIn }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
  });
});

app.get('/api/auth/status', (req, res) => {
  const countUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  res.json({ initialized: countUsers > 0 });
});

app.post('/api/auth/register', (req, res) => {
  const countUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  let role = 'user';
  let isFirstUser = false;

  if (countUsers === 0) {
    // Premier utilisateur du système : devient obligatoirement l'Administrateur principal
    role = 'admin';
    isFirstUser = true;
  } else {
    // Si la base contient déjà des utilisateurs, seul un Administrateur authentifié peut créer des comptes
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Seul un administrateur connecté peut créer de nouveaux comptes collaborateurs' });
    }
    const token = authHeader.split(' ')[1];
    let currentUser;
    try {
      currentUser = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé : seul un administrateur peut créer des comptes' });
    }
    role = (req.body.role === 'admin') ? 'admin' : 'user';
  }

  const { username, password, displayName, remember = true } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Cet identifiant existe déjà' });

  const id = `usr-${crypto.randomUUID()}`;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, hash, displayName, role);

  if (isFirstUser) {
    const expiresIn = remember ? '90d' : '1d';
    const token = jwt.sign({ id, username, displayName, role }, JWT_SECRET, { expiresIn });
    return res.json({ token, user: { id, username, displayName, role } });
  }

  res.status(201).json({ success: true, message: `Compte collaborateur ${username} créé avec succès.` });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const token = jwt.sign(
    { id: req.user.id, username: req.user.username, displayName: req.user.displayName, role: req.user.role },
    JWT_SECRET,
    { expiresIn: '90d' }
  );
  res.json({ user: req.user, token });
});

// -----------------------------------------------------------------------------
// CRUD RESSOURCES (PRODUITS / MATÉRIEL / PARC)
// -----------------------------------------------------------------------------
app.get('/api/resources', authMiddleware, (req, res) => {
  const resources = db.prepare('SELECT * FROM resources ORDER BY name ASC').all();
  res.json(resources.map(r => ({
    ...r,
    attributes: JSON.parse(r.attributes_json || '{}')
  })));
});

app.post('/api/resources', authMiddleware, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insertStmt = db.prepare(`
    INSERT INTO resources (id, name, category, status, attributes_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      status = excluded.status,
      attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const saved = [];
  const insertMany = db.transaction((rows) => {
    for (const item of rows) {
      if (!item) continue;
      const newId = item.id || `res-${crypto.randomUUID()}`;
      const name = (item.name || '').trim() || 'Sans nom';
      const category = item.category || 'Général';
      const status = item.status || 'available';
      const attrs = JSON.stringify(item.attributes || {});
      insertStmt.run(newId, name, category, status, attrs);
      saved.push({ id: newId, name, category, status, attributes: item.attributes || {} });
    }
  });

  insertMany(items);
  saved.forEach(r => broadcastEvent('RESOURCE_CREATED', r));
  res.status(201).json(Array.isArray(req.body) ? saved : (saved[0] || {}));
});

app.put('/api/resources/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { name, category, status, attributes } = req.body;
  db.prepare(`
    UPDATE resources SET name = ?, category = ?, status = ?, attributes_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, category, status, JSON.stringify(attributes || {}), id);

  broadcastEvent('RESOURCE_UPDATED', { id, name, category, status, attributes });
  res.json({ success: true });
});

app.delete('/api/resources/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM resources WHERE id = ?').run(id);
  broadcastEvent('RESOURCE_DELETED', { id });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// CRUD ALLOCATIONS (CRÉNEAUX ROADMAP / ESSAIS)
// -----------------------------------------------------------------------------
app.get('/api/allocations', authMiddleware, (req, res) => {
  const allocations = db.prepare(`
    SELECT a.*, r.name as resource_name 
    FROM allocations a 
    LEFT JOIN resources r ON a.resource_id = r.id
    ORDER BY a.start_date ASC
  `).all();
  res.json(allocations.map(a => ({
    id: a.id,
    resourceId: a.resource_id,
    resourceName: a.resource_name,
    userId: a.user_id,
    userName: a.user_name,
    startDate: a.start_date,
    endDate: a.end_date,
    label: a.label,
    taskRef: a.task_ref
  })));
});

app.post('/api/allocations', authMiddleware, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insertStmt = db.prepare(`
    INSERT INTO allocations (id, resource_id, user_id, user_name, start_date, end_date, label, task_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      resource_id = excluded.resource_id,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      label = excluded.label,
      task_ref = excluded.task_ref,
      updated_at = CURRENT_TIMESTAMP
  `);

  const saved = [];
  const insertMany = db.transaction((rows) => {
    for (const item of rows) {
      if (!item) continue;
      const newId = item.id || `alloc-${crypto.randomUUID()}`;
      const resourceId = item.resourceId || '';
      const uId = item.userId || req.user.id;
      const uName = item.userName || req.user.displayName;
      const startDate = item.startDate || '';
      const endDate = item.endDate || '';
      const label = item.label || 'Essai';
      const taskRef = item.taskRef || null;
      insertStmt.run(newId, resourceId, uId, uName, startDate, endDate, label, taskRef);
      saved.push({
        id: newId,
        resourceId,
        userId: uId,
        userName: uName,
        startDate,
        endDate,
        label,
        taskRef
      });
    }
  });

  insertMany(items);
  saved.forEach(a => broadcastEvent('ALLOCATION_CREATED', a));
  res.status(201).json(Array.isArray(req.body) ? saved : (saved[0] || {}));
});

app.put('/api/allocations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { resourceId, startDate, endDate, label } = req.body;
  db.prepare(`
    UPDATE allocations 
    SET resource_id = ?, start_date = ?, end_date = ?, label = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(resourceId, startDate, endDate, label, id);

  broadcastEvent('ALLOCATION_UPDATED', { id, resourceId, startDate, endDate, label });
  res.json({ success: true });
});

const deleteAllocationHandler = (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM allocations WHERE id = ?').run(id);
  broadcastEvent('ALLOCATION_DELETED', { id });
  res.json({ success: true });
};
app.delete('/api/allocations/:id', authMiddleware, deleteAllocationHandler);
app.post('/api/allocations/:id/delete', authMiddleware, deleteAllocationHandler);

// -----------------------------------------------------------------------------
// CRUD TÂCHES PARTAGÉES & ROADMAP
// -----------------------------------------------------------------------------
app.get('/api/tasks', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM tasks 
    WHERE (resource_id IS NOT NULL AND resource_id != '' AND start_date != '' AND end_date != '')
       OR user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id);

  res.json(rows.map(t => ({
    id: t.id,
    title: t.title,
    columnId: t.column_id,
    categoryId: t.category_id,
    resourceId: t.resource_id,
    startDate: t.start_date,
    endDate: t.end_date,
    allocationId: t.allocation_id,
    userId: t.user_id,
    userName: t.user_name,
    time: t.time,
    projection: t.projection,
    isSold: !!t.is_sold,
    description: t.description || '',
    sensitive: JSON.parse(t.sensitive_json || '{}'),
    isShared: !!t.is_shared,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  })));
});

app.post('/api/tasks', authMiddleware, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      id, title, column_id, category_id, resource_id, start_date, end_date,
      allocation_id, user_id, user_name, time, projection, is_sold,
      description, sensitive_json, is_shared, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      column_id = excluded.column_id,
      category_id = excluded.category_id,
      resource_id = excluded.resource_id,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      allocation_id = excluded.allocation_id,
      user_id = excluded.user_id,
      user_name = excluded.user_name,
      time = excluded.time,
      projection = excluded.projection,
      is_sold = excluded.is_sold,
      description = excluded.description,
      sensitive_json = excluded.sensitive_json,
      is_shared = excluded.is_shared,
      updated_at = excluded.updated_at
  `);

  const saved = [];
  const insertMany = db.transaction((rows) => {
    for (const item of rows) {
      if (!item) continue;
      const id = item.id || `task-${crypto.randomUUID()}`;
      const title = (item.title || '').trim() || 'Sans titre';
      const colId = item.columnId || 'todo';
      const catId = item.categoryId || 'neutre';
      const resId = item.resourceId || null;
      const startDate = item.startDate || '';
      const endDate = item.endDate || '';
      const allocId = item.allocationId || null;
      const uId = item.userId || req.user.id;
      const uName = item.userName || req.user.displayName;
      const time = item.time || 0;
      const proj = item.projection || 0;
      const isSold = item.isSold ? 1 : 0;
      const desc = item.description || '';
      const sensitive = JSON.stringify(item.sensitive || {});
      const isShared = item.isShared ? 1 : 0;
      const createdAt = item.createdAt || new Date().toISOString();
      const updatedAt = item.updatedAt || new Date().toISOString();

      insertStmt.run(id, title, colId, catId, resId, startDate, endDate, allocId, uId, uName, time, proj, isSold, desc, sensitive, isShared, createdAt, updatedAt);
      saved.push({ id, title });
    }
  });

  insertMany(items);
  res.status(201).json(Array.isArray(req.body) ? saved : (saved[0] || {}));
});

const deleteTaskHandler = (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT allocation_id FROM tasks WHERE id = ?').get(id);
  if (task && task.allocation_id) {
    db.prepare('DELETE FROM allocations WHERE id = ?').run(task.allocation_id);
    broadcastEvent('ALLOCATION_DELETED', { id: task.allocation_id });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  broadcastEvent('TASK_DELETED', { id });
  res.json({ success: true });
};
app.delete('/api/tasks/:id', authMiddleware, deleteTaskHandler);
app.post('/api/tasks/:id/delete', authMiddleware, deleteTaskHandler);

// -----------------------------------------------------------------------------
// CONFIGURATION DE L'ESPACE (COLONNES, CATÉGORIES, TERMINOLOGIE)
// -----------------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  const columns = db.prepare('SELECT * FROM columns ORDER BY order_idx ASC').all().map(c => ({
    id: c.id,
    title: c.title,
    color: c.color,
    order: c.order_idx,
    isVisible: !!c.is_visible
  }));

  const categories = db.prepare('SELECT * FROM categories ORDER BY order_idx ASC').all().map(cat => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    isRoadmapEligible: !!cat.is_roadmap_eligible,
    requiresResource: !!cat.requires_resource,
    order: cat.order_idx
  }));

  const terminologyRow = db.prepare('SELECT value_json FROM workspace_config WHERE key = ?').get('terminology');
  const terminology = terminologyRow ? JSON.parse(terminologyRow.value_json) : {};

  const layoutRow = db.prepare('SELECT value_json FROM workspace_config WHERE key = ?').get('layoutMode');
  const layoutMode = layoutRow ? JSON.parse(layoutRow.value_json) : 'nested3';

  const nestedRow = db.prepare('SELECT value_json FROM workspace_config WHERE key = ?').get('nestedConfig');
  const nestedConfig = nestedRow ? JSON.parse(nestedRow.value_json) : null;

  res.json({ columns, categories, terminology, layoutMode, nestedConfig });
});

app.post('/api/config', authMiddleware, (req, res) => {
  const { terminology, layoutMode, nestedConfig, columns, categories } = req.body;
  if (terminology) {
    db.prepare('INSERT INTO workspace_config (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json')
      .run('terminology', JSON.stringify(terminology));
  }
  if (layoutMode) {
    db.prepare('INSERT INTO workspace_config (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json')
      .run('layoutMode', JSON.stringify(layoutMode));
  }
  if (nestedConfig) {
    db.prepare('INSERT INTO workspace_config (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json')
      .run('nestedConfig', JSON.stringify(nestedConfig));
  }
  if (Array.isArray(columns)) {
    db.prepare('DELETE FROM columns').run();
    const insertCol = db.prepare('INSERT INTO columns (id, title, color, order_idx, is_visible) VALUES (?, ?, ?, ?, ?)');
    columns.forEach(c => {
      insertCol.run(c.id, c.title, c.color || '#64748b', c.order || 1, c.isVisible !== false ? 1 : 0);
    });
  }
  if (Array.isArray(categories)) {
    db.prepare('DELETE FROM categories').run();
    const insertCat = db.prepare('INSERT INTO categories (id, name, color, is_roadmap_eligible, requires_resource, order_idx) VALUES (?, ?, ?, ?, ?, ?)');
    categories.forEach(cat => {
      insertCat.run(cat.id, cat.name, cat.color || '#e0e0e0', cat.isRoadmapEligible ? 1 : 0, cat.requiresResource ? 1 : 0, cat.order || 1);
    });
  }
  res.json({ success: true });
});



// Servir le front-end compilé en production
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const indexDist = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexDist)) {
    return res.sendFile(indexDist);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Serveur Kanbinou opérationnel : http://localhost:${PORT}`);
});
