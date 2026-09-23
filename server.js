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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kanbinou-super-secret-key-2026';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialisation de la base SQLite locale
const DB_FILE = path.join(__dirname, 'kanbinou.sqlite');
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

// Données initiales si la base est vide
const countUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (countUsers === 0) {
  console.log('⚡ Initialisation du compte administrateur initial (admin / admin)...');
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role)
    VALUES ('usr-admin', 'admin', ?, 'Administrateur', 'admin')
  `).run(hash);

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
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiants requis' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Cet identifiant existe déjà' });

  const id = `usr-${crypto.randomUUID()}`;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, username, password_hash, display_name, role)
    VALUES (?, ?, ?, ?, 'user')
  `).run(id, username, hash, displayName);

  const token = jwt.sign({ id, username, displayName, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, displayName, role: 'user' } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// -----------------------------------------------------------------------------
// CRUD RESSOURCES (PRODUITS / MATÉRIEL / PARC)
// -----------------------------------------------------------------------------
app.get('/api/resources', (req, res) => {
  const resources = db.prepare('SELECT * FROM resources ORDER BY name ASC').all();
  res.json(resources.map(r => ({
    ...r,
    attributes: JSON.parse(r.attributes_json || '{}')
  })));
});

app.post('/api/resources', authMiddleware, (req, res) => {
  const { id, name, category, status, attributes } = req.body;
  const newId = id || `res-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO resources (id, name, category, status, attributes_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(newId, name, category || 'Général', status || 'available', JSON.stringify(attributes || {}));

  const resource = { id: newId, name, category, status, attributes };
  broadcastEvent('RESOURCE_CREATED', resource);
  res.status(201).json(resource);
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
app.get('/api/allocations', (req, res) => {
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
  const { id, resourceId, startDate, endDate, label, taskRef } = req.body;
  const newId = id || `alloc-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO allocations (id, resource_id, user_id, user_name, start_date, end_date, label, task_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newId, resourceId, req.user.id, req.user.displayName, startDate, endDate, label || 'Essai', taskRef || null);

  const allocation = {
    id: newId,
    resourceId,
    userId: req.user.id,
    userName: req.user.displayName,
    startDate,
    endDate,
    label,
    taskRef
  };

  broadcastEvent('ALLOCATION_CREATED', allocation);
  res.status(201).json(allocation);
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

app.delete('/api/allocations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM allocations WHERE id = ?').run(id);
  broadcastEvent('ALLOCATION_DELETED', { id });
  res.json({ success: true });
});

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

// -----------------------------------------------------------------------------
// COMPATIBILITÉ AVEC L'ANCIENNE API (/api/save & /api/load)
// -----------------------------------------------------------------------------
const BACKUP_FILE = path.join(__dirname, 'kanbinou-backup.secure.json');
app.post('/api/save', (req, res) => {
  try {
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(req.body));
    res.sendStatus(200);
  } catch (err) {
    res.status(500).send('Erreur serveur');
  }
});

app.get('/api/load', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_FILE)) return res.status(404).send('Aucune sauvegarde');
    res.sendFile(BACKUP_FILE);
  } catch (err) {
    res.status(500).send('Erreur serveur');
  }
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
