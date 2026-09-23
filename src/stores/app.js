// =============================================================================
// Kanbinou - Store Principal Pinia (Gestion d'État Réactif)
// =============================================================================

import { defineStore } from 'pinia';
import { db, initializeLocalDB, toPlainObject } from '../services/db.js';
import { api } from '../services/api.js';

export const useAppStore = defineStore('app', {
  state: () => ({
    tasks: [],
    columns: [],
    categories: [],
    resources: [],
    allocations: [],
    terminology: {
      resourceSingular: 'Produit',
      resourcePlural: 'Produits',
      eventSingular: 'Essai',
      eventPlural: 'Essais',
      resourceIcon: '🦼'
    },
    currentView: 'kanban', // 'kanban' | 'roadmap'
    searchQuery: '',
    sortBy: localStorage.getItem('kanbinou_sort') || 'manual', // 'manual' | 'date-desc' | 'date-asc' | 'alpha' | 'time-desc'
    activeCategoryFilter: null,
    activeModal: null, // null | 'task' | 'resources' | 'sync' | 'export' | 'settings'
    settingsTab: 'layout', // 'layout' | 'terminology' | 'categories'
    selectedTaskId: null,
    layoutMode: 'nested3', // 'nested3' | 'flat4'
    nestedConfig: {
      colLeftId: 'todo',
      colCenterTopId: 'doing',
      colCenterBottomId: 'waiting',
      colRightId: 'done',
      leftColumnIds: ['todo'],
      centerColumnIds: ['doing', 'waiting'],
      rightColumnIds: ['done'],
      splitRatio: '50-50', // '50-50' | '65-35' | '35-65' | 'auto' | 'equal'
      separatorThickness: 3, // 2 | 3 | 5
      grayBottomBackground: true,
      graySubcolumnIds: ['waiting'],
      collapsedSubcol: null // null | 'top' | 'bottom'
    },
    isOnline: navigator.onLine,
    isSyncing: false,
    user: null,
    currentRoadmapMonth: new Date()
  }),

  getters: {
    // Tâches filtrées par la recherche, la catégorie active et triées
    filteredTasks(state) {
      let result = state.tasks;

      if (state.activeCategoryFilter) {
        result = result.filter(t => t.categoryId === state.activeCategoryFilter);
      }

      if (state.searchQuery.trim()) {
        const query = state.searchQuery.toLowerCase().trim();
        result = result.filter(t => 
          (t.title && t.title.toLowerCase().includes(query)) ||
          (t.description && t.description.toLowerCase().includes(query)) ||
          (t.sensitive && t.sensitive.address && t.sensitive.address.toLowerCase().includes(query))
        );
      }

      // Application du tri
      if (state.sortBy === 'date-desc') {
        result = [...result].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      } else if (state.sortBy === 'date-asc') {
        result = [...result].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      } else if (state.sortBy === 'alpha') {
        result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      } else if (state.sortBy === 'time-desc') {
        result = [...result].sort((a, b) => (parseFloat(b.time) || 0) - (parseFloat(a.time) || 0));
      }

      return result;
    },

    // Total d'heures par colonne
    columnTimeTotals(state) {
      const totals = {};
      state.columns.forEach(col => {
        const tasksInCol = state.tasks.filter(t => t.columnId === col.id);
        const sum = tasksInCol.reduce((acc, t) => acc + (parseFloat(t.time) || 0), 0);
        totals[col.id] = sum.toFixed(1);
      });
      return totals;
    },

    // Répartition pour la barre de catégories
    categoryStats(state) {
      const total = state.tasks.length;
      if (total === 0) return [];

      const counts = {};
      state.categories.forEach(c => { counts[c.id] = 0; });
      state.tasks.forEach(t => {
        if (counts[t.categoryId] !== undefined) {
          counts[t.categoryId]++;
        } else {
          counts[t.categoryId] = 1;
        }
      });

      return state.categories.map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        count: counts[c.id] || 0,
        percentage: ((counts[c.id] || 0) / total) * 100
      }));
    },

    // Détection des conflits sur la roadmap
    conflictingAllocations(state) {
      const conflicts = new Set();
      const list = state.allocations;

      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.resourceId === b.resourceId) {
            const startA = new Date(a.startDate);
            const endA = new Date(a.endDate);
            const startB = new Date(b.startDate);
            const endB = new Date(b.endDate);

            if (startA <= endB && endA >= startB) {
              conflicts.add(a.id);
              conflicts.add(b.id);
            }
          }
        }
      }
      return conflicts;
    }
  },

  actions: {
    // Initialisation au démarrage
    async initialize() {
      // 1. Initialiser IndexedDB et migrer les données localStorage si besoin
      await initializeLocalDB();
      await this.loadLocalData();

      // 2. Écouter les événements réseau (en ligne / hors ligne)
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncWithServer();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });

      // 3. Vérifier la session utilisateur existante
      if (api.token) {
        try {
          const res = await api.getMe();
          this.user = res.user;
          this.syncWithServer();
        } catch (err) {
          console.warn('[Auth] Session expirée');
          api.setToken(null);
        }
      }

      // 4. Se connecter aux Server-Sent Events (SSE) pour le temps réel
      api.connectEvents(this.handleRealtimeEvent);
    },

    // Charger les données depuis IndexedDB et synchroniser avec localStorage
    async loadLocalData() {
      let rawCols = await db.columns.orderBy('order').toArray();
      // Vérifier si localStorage contient des colonnes
      try {
        const storedCols = localStorage.getItem('kanbinou_columns');
        if (storedCols) {
          const parsedCols = JSON.parse(storedCols);
          if (Array.isArray(parsedCols) && parsedCols.length > 0) {
            if (!rawCols || rawCols.length === 0) {
              rawCols = parsedCols;
              await db.columns.bulkPut(parsedCols);
            } else {
              for (const sc of parsedCols) {
                const inDb = rawCols.find(c => c.id === sc.id);
                if (inDb && sc.color && inDb.color !== sc.color) {
                  inDb.color = sc.color;
                  await db.columns.update(inDb.id, { color: sc.color });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Storage] Erreur lecture localStorage colonnes :', e);
      }

      const seenColIds = new Set();
      this.columns = (rawCols || []).filter(c => {
        if (!c || !c.id || seenColIds.has(c.id)) return false;
        seenColIds.add(c.id);
        return true;
      });
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}

      let rawCats = await db.categories.orderBy('order').toArray();
      // Vérifier et synchroniser les couleurs sauvegardées en localStorage
      try {
        const storedCats = localStorage.getItem('kanbinou_categories');
        if (storedCats) {
          const parsedCats = JSON.parse(storedCats);
          if (Array.isArray(parsedCats) && parsedCats.length > 0) {
            if (!rawCats || rawCats.length === 0) {
              rawCats = parsedCats;
              await db.categories.bulkPut(parsedCats);
            } else {
              // Si une couleur a été enregistrée en localStorage, l'appliquer en priorité
              for (const sc of parsedCats) {
                const inDb = rawCats.find(c => c.id === sc.id);
                if (inDb && sc.color && inDb.color !== sc.color) {
                  inDb.color = sc.color;
                  await db.categories.update(inDb.id, { color: sc.color });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[Storage] Erreur lecture localStorage catégories :', e);
      }

      this.categories = rawCats || [];
      try {
        localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
      } catch (e) {}

      this.resources = await db.resources.toArray();
      this.allocations = await db.allocations.toArray();
      this.tasks = await db.tasks.toArray();

      const term = await db.meta.get('terminology');
      if (term) this.terminology = term.value;

      const layout = await db.meta.get('layoutMode');
      if (layout && layout.value) this.layoutMode = layout.value;

      const nested = await db.meta.get('nestedConfig');
      if (nested && nested.value) {
        this.nestedConfig = { ...this.nestedConfig, ...nested.value };
      }
      // Migration / synchronisation des listes imbriquées avec garantie de non-doublon
      let left = Array.isArray(this.nestedConfig.leftColumnIds) && this.nestedConfig.leftColumnIds.length > 0
        ? [...new Set(this.nestedConfig.leftColumnIds)]
        : [this.nestedConfig.colLeftId || 'todo'];
      left = left.filter(id => this.columns.some(c => c.id === id));
      if (left.length === 0 && this.columns.length > 0) left = [this.columns[0].id];

      let center = Array.isArray(this.nestedConfig.centerColumnIds) && this.nestedConfig.centerColumnIds.length > 0
        ? [...new Set(this.nestedConfig.centerColumnIds)]
        : [this.nestedConfig.colCenterTopId || 'doing', this.nestedConfig.colCenterBottomId || 'waiting'];
      // Retirer les colonnes déjà présentes à gauche
      center = center.filter(id => !left.includes(id) && this.columns.some(c => c.id === id));
      if (center.length === 0) {
        const candidate = this.columns.find(c => !left.includes(c.id));
        if (candidate) center = [candidate.id];
      }

      let right = Array.isArray(this.nestedConfig.rightColumnIds) && this.nestedConfig.rightColumnIds.length > 0
        ? [...new Set(this.nestedConfig.rightColumnIds)]
        : [this.nestedConfig.colRightId || 'done'];
      // Retirer les colonnes déjà présentes à gauche ou au centre
      right = right.filter(id => !left.includes(id) && !center.includes(id) && this.columns.some(c => c.id === id));
      if (right.length === 0) {
        const candidate = this.columns.find(c => !left.includes(c.id) && !center.includes(c.id));
        if (candidate) right = [candidate.id];
      }

      this.nestedConfig.leftColumnIds = left;
      this.nestedConfig.centerColumnIds = center;
      this.nestedConfig.rightColumnIds = right;
      this.nestedConfig.colLeftId = left[0] || 'todo';
      this.nestedConfig.colCenterTopId = center[0] || 'doing';
      this.nestedConfig.colCenterBottomId = center[1] || center[0] || 'waiting';
      this.nestedConfig.colRightId = right[0] || 'done';

      if (!Array.isArray(this.nestedConfig.graySubcolumnIds)) {
        this.nestedConfig.graySubcolumnIds = [this.nestedConfig.colCenterBottomId || 'waiting'];
      }
    },

    // Traitement des notifications SSE en temps réel
    async handleRealtimeEvent(event) {
      const { type, payload } = event;
      console.log('[SSE Event]', type, payload);

      if (type === 'RESOURCE_CREATED' || type === 'RESOURCE_UPDATED') {
        await db.resources.put(payload);
        await this.loadLocalData();
      } else if (type === 'RESOURCE_DELETED') {
        await db.resources.delete(payload.id);
        await this.loadLocalData();
      } else if (type === 'ALLOCATION_CREATED' || type === 'ALLOCATION_UPDATED') {
        await db.allocations.put(payload);
        await this.loadLocalData();
      } else if (type === 'ALLOCATION_DELETED') {
        await db.allocations.delete(payload.id);
        await this.loadLocalData();
      }
    },

    // --- Actions Tâches ---
    async createTask(title, columnId = 'todo') {
      if (!title || !title.trim()) return;

      const newTask = {
        id: `task-${crypto.randomUUID()}`,
        title: title.trim(),
        columnId,
        categoryId: 'neutre',
        isShared: false,
        resourceId: null,
        startDate: '',
        endDate: '',
        allocationId: null,
        time: 0,
        projection: 0,
        isSold: false,
        description: '',
        sensitive: {
          address: '',
          email: '',
          phone: '',
          notes: ''
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await db.tasks.add(newTask);
      this.tasks.push(newTask);
    },

    async saveTask(task) {
      task.updatedAt = new Date().toISOString();

      // Gestion de la réservation / essai sur la roadmap
      const category = this.categories.find(c => c.id === task.categoryId);
      const isRoadmapEligible = category && category.isRoadmapEligible;

      if (isRoadmapEligible && task.resourceId && task.startDate && task.endDate) {
        if (!task.allocationId) {
          task.allocationId = `alloc-${crypto.randomUUID()}`;
        }

        const allocation = {
          id: task.allocationId,
          resourceId: task.resourceId,
          userId: this.user ? this.user.id : 'local-user',
          userName: this.user ? this.user.displayName : 'Moi',
          startDate: task.startDate,
          endDate: task.endDate,
          label: task.title,
          taskId: task.id,
          updatedAt: new Date().toISOString()
        };

        await db.allocations.put(allocation);

        // Si en ligne et connecté, synchroniser l'allocation sur le serveur
        if (this.isOnline && this.user) {
          try {
            await api.createAllocation(allocation).catch(() => api.updateAllocation(allocation.id, allocation));
          } catch (err) {
            console.warn('[Sync] Échec création allocation serveur :', err);
          }
        }
      } else if (task.allocationId) {
        // Si la tâche n'est plus éligible ou plus de dates, supprimer l'allocation
        await db.allocations.delete(task.allocationId);
        if (this.isOnline && this.user) {
          api.deleteAllocation(task.allocationId).catch(() => {});
        }
        task.allocationId = null;
      }

      await db.tasks.put(toPlainObject(task));
      const index = this.tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        this.tasks[index] = { ...task };
      }
      await this.loadLocalData();
    },

    async deleteTask(taskId) {
      const task = this.tasks.find(t => t.id === taskId);
      if (task && task.allocationId) {
        await db.allocations.delete(task.allocationId);
        if (this.isOnline && this.user) {
          api.deleteAllocation(task.allocationId).catch(() => {});
        }
      }
      await db.tasks.delete(taskId);
      this.tasks = this.tasks.filter(t => t.id !== taskId);
    },

    async moveTask(taskId, targetColumnId) {
      const task = this.tasks.find(t => t.id === taskId);
      if (task && task.columnId !== targetColumnId) {
        task.columnId = targetColumnId;
        task.updatedAt = new Date().toISOString();
        await db.tasks.put(toPlainObject(task));
      }
    },

    // --- Actions Ressources ---
    async createResource(name, category = 'Général') {
      const newRes = {
        id: `res-${crypto.randomUUID()}`,
        name: name.trim(),
        category,
        status: 'available',
        attributes: {},
        updatedAt: new Date().toISOString()
      };

      await db.resources.put(toPlainObject(newRes));
      this.resources.push(newRes);

      if (this.isOnline && this.user) {
        try {
          await api.createResource(newRes);
        } catch (err) {
          console.warn('[Sync] Échec sync ressource serveur :', err);
        }
      }
    },

    async updateResource(id, name) {
      const res = this.resources.find(r => r.id === id);
      if (res) {
        res.name = name;
        res.updatedAt = new Date().toISOString();
        await db.resources.put(toPlainObject(res));

        if (this.isOnline && this.user) {
          api.updateResource(id, res).catch(() => {});
        }
      }
    },

    async deleteResource(id) {
      await db.resources.delete(id);
      this.resources = this.resources.filter(r => r.id !== id);

      if (this.isOnline && this.user) {
        api.deleteResource(id).catch(() => {});
      }
    },

    // Synchronisation complète avec le serveur
    async syncWithServer() {
      if (!this.isOnline || !this.user || this.isSyncing) return;

      this.isSyncing = true;
      try {
        console.log('[Sync] Synchronisation avec le cloud...');

        // 1. Récupérer les ressources partagées du serveur
        const serverResources = await api.getResources();
        if (Array.isArray(serverResources)) {
          await db.resources.bulkPut(serverResources);
        }

        // 2. Récupérer les créneaux de roadmap (allocations)
        const serverAllocations = await api.getAllocations();
        if (Array.isArray(serverAllocations)) {
          await db.allocations.bulkPut(serverAllocations);
        }

        // 3. Récupérer les configurations communes
        const config = await api.getConfig();
        if (config) {
          if (config.columns) await db.columns.bulkPut(config.columns);
          if (config.categories) await db.categories.bulkPut(config.categories);
          if (config.terminology) {
            await db.meta.put({ key: 'terminology', value: config.terminology });
            this.terminology = config.terminology;
          }
          if (config.layoutMode) {
            await db.meta.put({ key: 'layoutMode', value: config.layoutMode });
            this.layoutMode = config.layoutMode;
          }
          if (config.nestedConfig) {
            await db.meta.put({ key: 'nestedConfig', value: config.nestedConfig });
            this.nestedConfig = { ...this.nestedConfig, ...config.nestedConfig };
          }
        }

        await this.loadLocalData();
        console.log('[Sync] Synchronisation réussie !');
      } catch (err) {
        console.error('[Sync] Erreur lors de la synchronisation :', err);
      } finally {
        this.isSyncing = false;
      }
    },

    setSortBy(sortKey) {
      this.sortBy = sortKey;
      localStorage.setItem('kanbinou_sort', sortKey);
    },

    // Configuration de disposition
    async setLayoutMode(mode) {
      this.layoutMode = mode;
      await db.meta.put({ key: 'layoutMode', value: mode });
      if (this.user && this.isOnline) {
        try {
          await api.saveConfig({ layoutMode: mode });
        } catch (e) {
          console.warn('[Config] Erreur sauvegarde layout cloud:', e);
        }
      }
    },

    // Affinement des paramètres de la colonne centrale imbriquée avec exclusion mutuelle stricte
    async setNestedConfig(updates) {
      this.nestedConfig = { ...this.nestedConfig, ...updates };

      // Assurer l'unicité stricte entre gauche, centre et droite
      let left = Array.isArray(this.nestedConfig.leftColumnIds) && this.nestedConfig.leftColumnIds.length > 0
        ? [...new Set(this.nestedConfig.leftColumnIds)]
        : [this.nestedConfig.colLeftId || 'todo'];

      let center = Array.isArray(this.nestedConfig.centerColumnIds) && this.nestedConfig.centerColumnIds.length > 0
        ? [...new Set(this.nestedConfig.centerColumnIds)]
        : [this.nestedConfig.colCenterTopId || 'doing', this.nestedConfig.colCenterBottomId || 'waiting'];

      let right = Array.isArray(this.nestedConfig.rightColumnIds) && this.nestedConfig.rightColumnIds.length > 0
        ? [...new Set(this.nestedConfig.rightColumnIds)]
        : [this.nestedConfig.colRightId || 'done'];

      if (updates.leftColumnIds || updates.colLeftId) {
        center = center.filter(id => !left.includes(id));
        right = right.filter(id => !left.includes(id));
      } else if (updates.rightColumnIds || updates.colRightId) {
        center = center.filter(id => !right.includes(id));
        left = left.filter(id => !right.includes(id));
      } else if (updates.centerColumnIds) {
        left = left.filter(id => !center.includes(id));
        right = right.filter(id => !center.includes(id));
      } else {
        center = center.filter(id => !left.includes(id));
        right = right.filter(id => !left.includes(id) && !center.includes(id));
      }

      if (left.length === 0 && this.columns.length > 0) {
        const cand = this.columns.find(c => !center.includes(c.id) && !right.includes(c.id));
        if (cand) left.push(cand.id);
        else left.push(this.columns[0].id);
      }
      if (center.length === 0 && this.columns.length > 0) {
        const cand = this.columns.find(c => !left.includes(c.id) && !right.includes(c.id));
        if (cand) center.push(cand.id);
        else center.push(this.columns[1]?.id || 'doing');
      }
      if (right.length === 0 && this.columns.length > 0) {
        const cand = this.columns.find(c => !left.includes(c.id) && !center.includes(c.id));
        if (cand) right.push(cand.id);
        else right.push(this.columns[this.columns.length - 1]?.id || 'done');
      }

      this.nestedConfig.leftColumnIds = left;
      this.nestedConfig.centerColumnIds = center;
      this.nestedConfig.rightColumnIds = right;
      this.nestedConfig.colLeftId = left[0] || 'todo';
      this.nestedConfig.colCenterTopId = center[0] || 'doing';
      this.nestedConfig.colCenterBottomId = center[1] || center[0] || 'waiting';
      this.nestedConfig.colRightId = right[0] || 'done';

      await db.meta.put({ key: 'nestedConfig', value: toPlainObject(this.nestedConfig) });
      if (this.user && this.isOnline) {
        try {
          await api.saveConfig({ nestedConfig: toPlainObject(this.nestedConfig) });
        } catch (e) {
          console.warn('[Config] Erreur sauvegarde nestedConfig cloud:', e);
        }
      }
    },

    // Configuration de la terminologie & modèle métier
    async setTerminology(newTerminology) {
      const plainTerm = toPlainObject(newTerminology);
      this.terminology = { ...this.terminology, ...plainTerm };
      await db.meta.put({ key: 'terminology', value: this.terminology });
      if (this.user && this.isOnline) {
        try {
          await api.saveConfig({ terminology: this.terminology });
        } catch (e) {
          console.warn('[Config] Erreur sauvegarde terminologie cloud:', e);
        }
      }
    },

    // --- Actions Catégories / Tags ---
    async createCategory(name, color = '#60a5fa', isRoadmapEligible = false) {
      if (!name || !name.trim()) return null;
      const cleanName = name.trim();
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const id = `cat-${slug}-${Date.now().toString(36)}`;
      const order = this.categories.length + 1;
      const newCat = {
        id,
        name: cleanName,
        color: color || '#60a5fa',
        isRoadmapEligible: !!isRoadmapEligible,
        requiresResource: !!isRoadmapEligible,
        order
      };
      await db.categories.put(toPlainObject(newCat));
      this.categories.push(newCat);
      try {
        localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ categories: toPlainObject(this.categories) }).catch(() => {});
      }
      return newCat;
    },

    async updateCategory(id, updates) {
      const cat = this.categories.find(c => c.id === id);
      if (!cat) return;
      Object.assign(cat, updates);
      await db.categories.put(toPlainObject(cat));
      try {
        localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ categories: toPlainObject(this.categories) }).catch(() => {});
      }
    },

    async deleteCategory(id) {
      if (id === 'neutre') {
        alert('Le tag "Neutre" sert de catégorie par défaut et ne peut être supprimé.');
        return;
      }
      // Réassigner les tâches concernées vers 'neutre'
      const affected = this.tasks.filter(t => t.categoryId === id);
      for (const t of affected) {
        t.categoryId = 'neutre';
        await db.tasks.put(toPlainObject(t));
      }
      await db.categories.delete(id);
      this.categories = this.categories.filter(c => c.id !== id);
      try {
        localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ categories: toPlainObject(this.categories) }).catch(() => {});
      }
    },

    // Réinitialiser les couleurs de catégories aux teintes historiques Kanbinou
    async resetCategoryColors() {
      const defaults = [
        { id: 'commercial', name: 'Commercial', color: '#c5e1a5', isRoadmapEligible: false, requiresResource: false, order: 1 },
        { id: 'essais', name: 'Essais', color: '#ffcc80', isRoadmapEligible: true, requiresResource: true, order: 2 },
        { id: 'sav', name: 'SAV', color: '#ef9a9a', isRoadmapEligible: false, requiresResource: false, order: 3 },
        { id: 'livraison', name: 'Livraison', color: '#81d4fa', isRoadmapEligible: false, requiresResource: false, order: 4 },
        { id: 'neutre', name: 'Neutre', color: '#e0e0e0', isRoadmapEligible: false, requiresResource: false, order: 5 }
      ];
      await db.categories.clear();
      await db.categories.bulkPut(defaults);
      this.categories = defaults;
      try {
        localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ categories: toPlainObject(this.categories) }).catch(() => {});
      }
    },

    // --- Actions Colonnes ---
    async createColumn(title, color = '#64748b') {
      if (!title || !title.trim()) return null;
      const cleanTitle = title.trim();
      const id = `col-${Date.now().toString(36)}`;
      const order = this.columns.length + 1;
      const newCol = {
        id,
        title: cleanTitle,
        color: color || '#64748b',
        order,
        isVisible: true
      };
      await db.columns.put(toPlainObject(newCol));
      this.columns.push(newCol);
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
      return newCol;
    },

    async updateColumn(id, updates) {
      const col = this.columns.find(c => c.id === id);
      if (!col) return;
      Object.assign(col, updates);
      await db.columns.put(toPlainObject(col));
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
    },

    async deleteColumn(id) {
      if (['todo', 'doing', 'waiting', 'done'].includes(id)) {
        alert('Les colonnes fondamentales (À faire, En cours, En attente, Terminé) ne peuvent pas être supprimées.');
        return;
      }
      // Déplacer les tâches vers la colonne 'todo'
      const affected = this.tasks.filter(t => t.columnId === id);
      for (const t of affected) {
        t.columnId = 'todo';
        await db.tasks.put(toPlainObject(t));
      }
      await db.columns.delete(id);
      this.columns = this.columns.filter(c => c.id !== id);
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
    },

    async resetDefaultColumns() {
      const defaults = [
        { id: 'todo', title: 'À faire', order: 1, isVisible: true, color: '#0284c7' },
        { id: 'doing', title: 'En cours', order: 2, isVisible: true, color: '#f59e0b' },
        { id: 'waiting', title: 'En attente', order: 3, isVisible: true, color: '#8b5cf6' },
        { id: 'done', title: 'Terminé', order: 4, isVisible: true, color: '#10b981' }
      ];
      await db.columns.clear();
      await db.columns.bulkPut(defaults);
      this.columns = defaults;
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
    },

    async reorderColumns(newOrderList) {
      for (let i = 0; i < newOrderList.length; i++) {
        newOrderList[i].order = i + 1;
        await db.columns.put(toPlainObject(newOrderList[i]));
      }
      this.columns = [...newOrderList];
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
    },

    // Modal navigation
    openTaskModal(taskId) {
      this.selectedTaskId = taskId;
      this.activeModal = 'task';
    },

    closeModal() {
      this.activeModal = null;
      this.selectedTaskId = null;
    }
  }
});
