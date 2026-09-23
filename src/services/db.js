// =============================================================================
// Kanbinou - Stockage Local IndexedDB (Dexie.js)
// =============================================================================

import Dexie from 'dexie';

export const db = new Dexie('KanbinouLocalDB');

db.version(1).stores({
  tasks: 'id, columnId, categoryId, isShared, resourceId, updatedAt',
  resources: 'id, name, category, status, updatedAt',
  allocations: 'id, resourceId, userId, startDate, endDate, updatedAt',
  categories: 'id, name, isRoadmapEligible, requiresResource, order',
  columns: 'id, title, order, isVisible',
  meta: 'key'
});

/**
 * Nettoie et extrait un objet JavaScript pur débarrassé de tout Proxy Vue ou getter non-clonable
 */
export function toPlainObject(data) {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data));
}

// Wrapper universel pour interdire tout objet non-clonable (Proxy Vue 3) dans IndexedDB
['tasks', 'resources', 'allocations', 'categories', 'columns', 'meta'].forEach(tableName => {
  const table = db[tableName];
  const origPut = table.put.bind(table);
  const origAdd = table.add.bind(table);
  const origBulkPut = table.bulkPut.bind(table);

  table.put = (item, key) => origPut(toPlainObject(item), key);
  table.add = (item, key) => origAdd(toPlainObject(item), key);
  table.bulkPut = (items, keys) => origBulkPut(toPlainObject(items), keys);
});

// Valeurs par défaut
export const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'À faire', order: 1, isVisible: true, color: '#0284c7' },
  { id: 'doing', title: 'En cours', order: 2, isVisible: true, color: '#f59e0b' },
  { id: 'waiting', title: 'En attente', order: 3, isVisible: true, color: '#8b5cf6' },
  { id: 'done', title: 'Terminé', order: 4, isVisible: true, color: '#10b981' }
];

export const DEFAULT_CATEGORIES = [
  { id: 'commercial', name: 'Commercial', color: '#c5e1a5', isRoadmapEligible: false, requiresResource: false, order: 1 },
  { id: 'essais', name: 'Essais', color: '#ffcc80', isRoadmapEligible: true, requiresResource: true, order: 2 },
  { id: 'sav', name: 'SAV', color: '#ef9a9a', isRoadmapEligible: false, requiresResource: false, order: 3 },
  { id: 'livraison', name: 'Livraison', color: '#81d4fa', isRoadmapEligible: false, requiresResource: false, order: 4 },
  { id: 'neutre', name: 'Neutre', color: '#e0e0e0', isRoadmapEligible: false, requiresResource: false, order: 5 }
];

export const DEFAULT_TERMINOLOGY = {
  resourceSingular: 'Produit',
  resourcePlural: 'Produits',
  eventSingular: 'Essai',
  eventPlural: 'Essais',
  resourceIcon: '🦼'
};

/**
 * Initialise la base de données locale et effectue la migration automatique
 * depuis l'ancien localStorage si des données existantes sont détectées.
 */
export async function initializeLocalDB() {
  const isInitialized = await db.meta.get('initialized');

  if (!isInitialized) {
    console.log('[DB] Premier démarrage : initialisation des colonnes et catégories...');
    let initialCategories = DEFAULT_CATEGORIES;
    try {
      const storedCats = localStorage.getItem('kanbinou_categories');
      if (storedCats) {
        const parsed = JSON.parse(storedCats);
        if (Array.isArray(parsed) && parsed.length > 0) initialCategories = parsed;
      }
    } catch (e) {}

    let initialColumns = DEFAULT_COLUMNS;
    try {
      const storedCols = localStorage.getItem('kanbinou_columns');
      if (storedCols) {
        const parsed = JSON.parse(storedCols);
        if (Array.isArray(parsed) && parsed.length > 0) initialColumns = parsed;
      }
    } catch (e) {}

    await db.columns.bulkPut(initialColumns);
    await db.categories.bulkPut(initialCategories);
    await db.meta.put({ key: 'terminology', value: DEFAULT_TERMINOLOGY });
    await db.meta.put({ key: 'layoutMode', value: 'nested3' }); // 'nested3' (classique) ou 'flat4' (étendu)
    await db.meta.put({ key: 'initialized', value: true });

    try {
      localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(initialCategories)));
      localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(initialColumns)));
    } catch (e) {}

    // Migration des données historiques de localStorage
    await migrateFromLocalStorage();
  } else {
    // Ne jamais écraser les couleurs personnalisées par l'utilisateur.
    // Ajouter uniquement les catégories indispensables manquantes sans toucher aux existantes.
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await db.categories.get(cat.id);
      if (!existing) {
        await db.categories.put(cat);
      }
    }
  }
}

/**
 * Migre les tâches et produits de l'ancienne version Kanbinou (localStorage)
 */
async function migrateFromLocalStorage() {
  try {
    const rawProducts = localStorage.getItem('products');
    if (rawProducts) {
      const products = JSON.parse(rawProducts);
      if (Array.isArray(products) && products.length > 0) {
        console.log(`[DB Migration] Migration de ${products.length} produits existants...`);
        const formattedResources = products.map(p => ({
          id: p.id || `prod-${crypto.randomUUID()}`,
          name: p.name,
          category: 'Général',
          status: 'available',
          updatedAt: new Date().toISOString()
        }));
        await db.resources.bulkPut(formattedResources);
      }
    }

    const columnKeys = ['todo', 'doing', 'waiting', 'done'];
    const tasksToInsert = [];
    const allocationsToInsert = [];

    columnKeys.forEach(colId => {
      const rawCol = localStorage.getItem(colId);
      if (rawCol) {
        const tasks = JSON.parse(rawCol);
        if (Array.isArray(tasks)) {
          tasks.forEach(t => {
            const taskId = t.id || `task-${crypto.randomUUID()}`;
            const resourceId = Array.isArray(t.products) ? t.products[0] : (t.products || null);
            
            // Si la tâche a un essai avec dates de début et fin, créer une allocation
            let allocationId = null;
            if (t.type === 'essais' && resourceId && t.start && t.end) {
              allocationId = `alloc-${crypto.randomUUID()}`;
              allocationsToInsert.push({
                id: allocationId,
                resourceId: resourceId,
                userId: 'local-user',
                userName: 'Moi',
                startDate: t.start,
                endDate: t.end,
                label: t.text || 'Essai',
                taskId: taskId,
                updatedAt: new Date().toISOString()
              });
            }

            tasksToInsert.push({
              id: taskId,
              title: t.text || 'Sans titre',
              columnId: colId,
              categoryId: t.type || 'neutre',
              isShared: false,
              resourceId: resourceId,
              startDate: t.start || '',
              endDate: t.end || '',
              allocationId: allocationId,
              time: parseFloat(t.time) || 0,
              projection: parseFloat(t.projection) || 0,
              isSold: !!t.sold,
              description: t.description || '',
              sensitive: {
                address: t.address || '',
                email: t.email || '',
                phone: t.phone || '',
                notes: ''
              },
              createdAt: t.date || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          });
        }
      }
    });

    if (tasksToInsert.length > 0) {
      console.log(`[DB Migration] Migration de ${tasksToInsert.length} tâches existantes...`);
      await db.tasks.bulkPut(tasksToInsert);
    }

    if (allocationsToInsert.length > 0) {
      console.log(`[DB Migration] Migration de ${allocationsToInsert.length} créneaux roadmap...`);
      await db.allocations.bulkPut(allocationsToInsert);
    }
  } catch (err) {
    console.error('[DB Migration] Erreur lors de la migration localStorage :', err);
  }
}
