// =============================================================================
// Kanbinou - Store Principal Pinia (Gestion d'État Réactif)
// =============================================================================

import { defineStore } from 'pinia';
import { db, initializeLocalDB, toPlainObject } from '../services/db.js';
import { api } from '../services/api.js';
import { encryptData, decryptData } from '../services/crypto.js';

// Utilitaires de gestion des suppressions pour garantir la cohérence multi-postes
function getDeletedTaskIds() {
  try {
    return JSON.parse(localStorage.getItem('kanbinou_deleted_task_ids') || '[]');
  } catch (e) {
    return [];
  }
}

function markTaskAsDeleted(id) {
  if (!id) return;
  try {
    const list = getDeletedTaskIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem('kanbinou_deleted_task_ids', JSON.stringify(list.slice(-300)));
    }
  } catch (e) {}
}

function unmarkTaskAsDeleted(id) {
  if (!id) return;
  try {
    const list = getDeletedTaskIds();
    const filtered = list.filter(x => x !== id);
    localStorage.setItem('kanbinou_deleted_task_ids', JSON.stringify(filtered));
  } catch (e) {}
}

function getDeletedAllocIds() {
  try {
    return JSON.parse(localStorage.getItem('kanbinou_deleted_alloc_ids') || '[]');
  } catch (e) {
    return [];
  }
}

function markAllocAsDeleted(id) {
  if (!id) return;
  try {
    const list = getDeletedAllocIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem('kanbinou_deleted_alloc_ids', JSON.stringify(list.slice(-300)));
    }
  } catch (e) {}
}

export const useAppStore = defineStore('app', {
  state: () => ({
    teamKey: localStorage.getItem('kanbinou_team_key') || '',
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
    activeCategoryFilter: null,
    activeModal: null, // null | 'task' | 'resources' | 'sync' | 'export' | 'settings'
    settingsTab: 'layout', // 'layout' | 'terminology' | 'categories'
    selectedTaskId: null,
    newTaskDefaultColumnId: null,
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
      grayBottomBackground: true,
      graySubcolumnIds: ['waiting']
    },
    isOnline: navigator.onLine,
    isSyncing: false,
    user: (() => {
      try {
        const stored = localStorage.getItem('kanbinou_user') || sessionStorage.getItem('kanbinou_user');
        return stored ? JSON.parse(stored) : null;
      } catch (e) {
        return null;
      }
    })(),
    currentRoadmapMonth: new Date(),
    isMobile: typeof window !== 'undefined' ? (window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) : false
  }),

  getters: {
    // Tâches appartenant à l'utilisateur courant (ou locales si déconnecté)
    myTasks(state) {
      if (!state.user) return state.tasks;
      return state.tasks.filter(t => !t.userId || t.userId === state.user.id);
    },

    // Tâches filtrées par la recherche, la catégorie active et triées (pour le Kanban personnel)
    filteredTasks(state) {
      let result = this.myTasks;

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

      return result;
    },

    // Total d'heures par colonne (calculé sur les tâches visibles de l'utilisateur)
    columnTimeTotals(state) {
      const totals = {};
      const visible = this.myTasks;
      state.columns.forEach(col => {
        const tasksInCol = visible.filter(t => t.columnId === col.id);
        const sum = tasksInCol.reduce((acc, t) => acc + (parseFloat(t.time) || 0), 0);
        totals[col.id] = sum.toFixed(1);
      });
      return totals;
    },

    // Répartition pour la barre de catégories (calculé sur les tâches visibles de l'utilisateur)
    categoryStats(state) {
      const myTasksList = this.myTasks;
      const total = myTasksList.length;
      if (total === 0) return [];

      const counts = {};
      state.categories.forEach(c => { counts[c.id] = 0; });
      myTasksList.forEach(t => {
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

      // 2. Écouter les événements réseau (en ligne / hors ligne) et responsive
      const updateMobile = () => {
        this.isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
      };
      updateMobile();
      window.addEventListener('resize', updateMobile);

      window.addEventListener('online', () => {
        this.isOnline = true;
        this.syncWithServer();
      });
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });

      // 3. Vérifier la session utilisateur existante (si une API est configurée)
      if (api.isAvailable() && api.token) {
        try {
          const res = await api.getMe();
          if (res && res.user) {
            const isRemembered = api.isRemembered();
            this.setUser(res.user, isRemembered);
            if (res.token) {
              api.setToken(res.token, isRemembered); // Session glissante : renouvellement transparent
            }
            this.syncWithServer();
          }
        } catch (err) {
          // On ne déconnecte QUE si le token a été expressément rejeté par le serveur avec une erreur 401
          if (err && err.status === 401) {
            console.warn('[Auth] Session expirée ou token invalidé');
            this.logout();
          } else {
            console.warn('[Auth] Serveur injoignable pour le moment, session locale maintenue en continu :', err?.message);
          }
        }
      }

      // 4. Se connecter aux Server-Sent Events (SSE) pour le temps réel
      if (api.isAvailable()) {
        api.connectEvents(this.handleRealtimeEvent);
      }
    },

    setUser(user, remember = true) {
      this.user = user;
      if (user) {
        const json = JSON.stringify(user);
        if (remember) {
          localStorage.setItem('kanbinou_user', json);
          sessionStorage.removeItem('kanbinou_user');
        } else {
          sessionStorage.setItem('kanbinou_user', json);
          localStorage.removeItem('kanbinou_user');
        }
      } else {
        localStorage.removeItem('kanbinou_user');
        sessionStorage.removeItem('kanbinou_user');
      }
    },

    logout() {
      api.setToken(null);
      this.setUser(null);
    },

    setTeamKey(key) {
      this.teamKey = (key || '').trim();
      if (this.teamKey) {
        localStorage.setItem('kanbinou_team_key', this.teamKey);
      } else {
        localStorage.removeItem('kanbinou_team_key');
      }
    },

    // Filtrage à la source & Chiffrement E2EE pour le serveur
    async prepareTaskForServer(task) {
      const plain = toPlainObject(task);
      const hasSensitive = plain.sensitive && (
        (plain.sensitive.address && plain.sensitive.address.trim()) ||
        (plain.sensitive.email && plain.sensitive.email.trim()) ||
        (plain.sensitive.phone && plain.sensitive.phone.trim()) ||
        (plain.sensitive.notes && plain.sensitive.notes.trim())
      );

      if (hasSensitive) {
        if (this.teamKey) {
          try {
            plain.sensitive = await encryptData(plain.sensitive, this.teamKey);
          } catch (err) {
            console.warn('[E2EE] Échec chiffrement, vidage du bloc sensible par précaution :', err);
            plain.sensitive = {};
          }
        } else {
          // Filtrage à la source : en l'absence de clé secrète d'équipe, NE JAMAIS exposer les coordonnées en clair
          plain.sensitive = {};
        }
      } else if (plain.sensitive && plain.sensitive.cipher) {
        // Déjà chiffré
      } else {
        plain.sensitive = {};
      }
      return plain;
    },

    // Déchiffrement transparent à la réception du serveur
    async processTaskFromServer(serverTask, localTasksMap) {
      const isEncrypted = serverTask.sensitive && serverTask.sensitive.cipher && serverTask.sensitive.salt && serverTask.sensitive.iv;
      if (isEncrypted) {
        if (this.teamKey) {
          try {
            serverTask.sensitive = await decryptData(serverTask.sensitive, this.teamKey);
          } catch (err) {
            console.warn('[E2EE] Clé d\'équipe différente ou invalide pour cette tâche :', err);
            const localCopy = localTasksMap ? localTasksMap.get(serverTask.id) : null;
            if (localCopy && localCopy.sensitive && !localCopy.sensitive.cipher) {
              serverTask.sensitive = localCopy.sensitive;
            }
          }
        } else {
          // Sans clé d'équipe, préserver la version déchiffrée locale si l'utilisateur en est l'auteur
          const localCopy = localTasksMap ? localTasksMap.get(serverTask.id) : null;
          if (localCopy && localCopy.sensitive && !localCopy.sensitive.cipher) {
            serverTask.sensitive = localCopy.sensitive;
          } else {
            serverTask.sensitive = { address: '', email: '', phone: '', notes: '' };
          }
        }
      }
      return serverTask;
    },

    // Charger les données depuis IndexedDB et synchroniser avec localStorage
    async loadLocalData() {
      let rawCols = await db.columns.orderBy('order').toArray();
      // Utiliser localStorage uniquement en secours si IndexedDB est vide (hors-ligne initiale)
      try {
        const storedCols = localStorage.getItem('kanbinou_columns');
        if (storedCols && (!rawCols || rawCols.length === 0)) {
          const parsedCols = JSON.parse(storedCols);
          if (Array.isArray(parsedCols) && parsedCols.length > 0) {
            rawCols = parsedCols;
            await db.columns.bulkPut(parsedCols);
          }
        }
      } catch (e) {
        console.warn('[Storage] Erreur lecture localStorage colonnes :', e);
      }

      const seenColIds = new Set();
      this.columns = (rawCols || []).filter(c => {
        if (!c || !c.id || seenColIds.has(c.id)) return false;
        seenColIds.add(c.id);
        if (c.parentId === undefined) {
          c.parentId = c.id === 'waiting' ? 'doing' : null;
        }
        return true;
      });
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}

      let rawCats = await db.categories.orderBy('order').toArray();
      // Utiliser localStorage uniquement en secours si IndexedDB est vide
      try {
        const storedCats = localStorage.getItem('kanbinou_categories');
        if (storedCats && (!rawCats || rawCats.length === 0)) {
          const parsedCats = JSON.parse(storedCats);
          if (Array.isArray(parsedCats) && parsedCats.length > 0) {
            rawCats = parsedCats;
            await db.categories.bulkPut(parsedCats);
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
        userId: this.user ? this.user.id : null,
        userName: this.user ? (this.user.displayName || this.user.username) : null,
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
      if (!task.userId && this.user) {
        task.userId = this.user.id;
        task.userName = this.user.displayName || this.user.username;
      }

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
          userId: task.userId || (this.user ? this.user.id : 'local-user'),
          userName: task.userName || (this.user ? (this.user.displayName || this.user.username) : 'Moi'),
          startDate: task.startDate,
          endDate: task.endDate,
          label: task.title,
          taskId: task.id,
          taskRef: task.id,
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
      } else {
        this.tasks.push({ ...task });
      }

      unmarkTaskAsDeleted(task.id);

      if (this.isOnline && this.user && (task.resourceId || task.allocationId)) {
        try {
          const payload = await this.prepareTaskForServer(task);
          await api.createTask(payload);
          task._synced = true;
          await db.tasks.put(toPlainObject(task));
        } catch (err) {
          console.warn('[Sync] Échec envoi tâche roadmap sécurisée :', err);
        }
      }

      await this.loadLocalData();
    },

    async deleteTask(taskId) {
      const task = this.tasks.find(t => t.id === taskId);
      const allocId = task ? task.allocationId : null;

      // Marquer définitivement comme supprimé pour empêcher toute résurrection
      markTaskAsDeleted(taskId);
      if (allocId) {
        markAllocAsDeleted(allocId);
        await db.allocations.delete(allocId);
      }

      await db.tasks.delete(taskId);
      this.tasks = this.tasks.filter(t => t.id !== taskId);

      if (this.isOnline && this.user) {
        if (allocId) {
          api.deleteAllocation(allocId).catch(() => {});
        }
        try {
          await api.deleteTask(taskId);
        } catch (err) {
          console.warn('[Sync] Échec suppression tâche serveur :', err);
        }
      }
    },

    async moveTask(taskId, targetColumnId) {
      const task = this.tasks.find(t => t.id === taskId);
      if (task && task.columnId !== targetColumnId) {
        task.columnId = targetColumnId;
        task.updatedAt = new Date().toISOString();
        await db.tasks.put(toPlainObject(task));
        if (this.isOnline && this.user && (task.resourceId || task.allocationId)) {
          try {
            const payload = await this.prepareTaskForServer(task);
            api.createTask(payload).catch(() => {});
          } catch (err) {
            console.warn('[Sync] Échec déplacement tâche roadmap sécurisée :', err);
          }
        }
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

        // 1. Assigner automatiquement les tâches locales créées ou importées hors connexion
        if (this.user) {
          const localTasks = await db.tasks.toArray();
          for (const t of localTasks) {
            if (!t.userId) {
              t.userId = this.user.id;
              t.userName = this.user.displayName || this.user.username;
              await db.tasks.put(toPlainObject(t));
            }
          }
          this.tasks = await db.tasks.toArray();
        }

        // 2. Ressources : Préservation absolue des données locales et synchronisation cloud
        let localResources = await db.resources.toArray();
        if (localResources.length === 0 && this.resources.length > 0) {
          await db.resources.bulkPut(toPlainObject(this.resources));
          localResources = await db.resources.toArray();
        }

        let serverResources = [];
        try {
          const res = await api.getResources();
          if (Array.isArray(res)) serverResources = res;
        } catch (err) {
          console.warn('[Sync] Impossible de récupérer les ressources du serveur :', err);
        }

        // Détecter les ressources locales à envoyer au serveur
        const missingResources = localResources.filter(
          lr => lr && lr.id && !serverResources.some(sr => sr.id === lr.id)
        );

        if (missingResources.length > 0) {
          try {
            await api.createResource(toPlainObject(missingResources));
            serverResources.push(...missingResources);
          } catch (batchErr) {
            console.warn('[Sync] Push groupé ressources échoué, tentative unitaire :', batchErr);
            for (const item of missingResources) {
              try {
                await api.createResource(toPlainObject(item));
                if (!serverResources.some(sr => sr.id === item.id)) {
                  serverResources.push(item);
                }
              } catch (singleErr) {
                console.warn('[Sync] Échec unitaire ressource :', item.name, singleErr);
              }
            }
          }
        }

        // Fusionner dans IndexedDB (SANS JAMAIS EFFACER LES DONNÉES LOCALES)
        if (serverResources.length > 0) {
          await db.resources.bulkPut(toPlainObject(serverResources));
        }
        this.resources = await db.resources.toArray();

        // 3. Allocations : Créer les réservations pour les tâches éligibles et synchroniser la Roadmap
        let localAllocations = await db.allocations.toArray();
        const currentTasks = await db.tasks.toArray();

        for (const task of currentTasks) {
          const category = this.categories.find(c => c.id === task.categoryId);
          const isEligible = category ? category.isRoadmapEligible : (task.resourceId && task.startDate && task.endDate);
          if (isEligible && task.resourceId && task.startDate && task.endDate) {
            let alloc = localAllocations.find(a => a.id === task.allocationId || a.taskRef === task.id || a.taskId === task.id);
            if (!alloc) {
              alloc = {
                id: task.allocationId || `alloc-${crypto.randomUUID()}`,
                resourceId: task.resourceId,
                userId: task.userId || (this.user ? this.user.id : 'local-user'),
                userName: task.userName || (this.user ? (this.user.displayName || this.user.username) : 'Moi'),
                startDate: task.startDate,
                endDate: task.endDate,
                label: task.title,
                taskId: task.id,
                taskRef: task.id,
                updatedAt: new Date().toISOString()
              };
              task.allocationId = alloc.id;
              await db.tasks.put(toPlainObject(task));
              await db.allocations.put(toPlainObject(alloc));
              localAllocations.push(alloc);
            }
          }
        }

        // Réconciliation des allocations supprimées en attente
        const pendingDeletedAllocs = getDeletedAllocIds();
        for (const delId of pendingDeletedAllocs) {
          await api.deleteAllocation(delId).catch(() => {});
          await db.allocations.delete(delId);
        }

        let serverAllocations = [];
        try {
          const aRes = await api.getAllocations();
          if (Array.isArray(aRes)) {
            serverAllocations = aRes.filter(a => a && a.id && !pendingDeletedAllocs.includes(a.id));
          }
        } catch (err) {
          console.warn('[Sync] Impossible de récupérer les allocations serveur :', err);
        }

        localAllocations = (await db.allocations.toArray()).filter(
          a => a && a.id && !pendingDeletedAllocs.includes(a.id)
        );
        const serverAllocIds = new Set(serverAllocations.map(sa => sa.id));

        // Supprimer en local les allocations supprimées sur le serveur par un autre compte
        for (const la of localAllocations) {
          if (la._synced && !serverAllocIds.has(la.id)) {
            await db.allocations.delete(la.id);
          }
        }

        // Pousser UNIQUEMENT les nouvelles allocations locales créées hors connexion
        const missingAllocs = localAllocations.filter(
          la => !la._synced && !serverAllocIds.has(la.id)
        );

        if (missingAllocs.length > 0) {
          try {
            await api.createAllocation(toPlainObject(missingAllocs));
            for (const item of missingAllocs) {
              item._synced = true;
              await db.allocations.put(toPlainObject(item));
            }
          } catch (batchErr) {
            console.warn('[Sync] Push groupé allocations échoué, tentative unitaire :', batchErr);
            for (const item of missingAllocs) {
              try {
                await api.createAllocation(toPlainObject(item));
                item._synced = true;
                await db.allocations.put(toPlainObject(item));
              } catch (singleErr) {
                console.warn('[Sync] Échec unitaire allocation :', item.label, singleErr);
              }
            }
          }
        }

        if (serverAllocations.length > 0) {
          const allocsToStore = serverAllocations.map(sa => ({ ...sa, _synced: true }));
          await db.allocations.bulkPut(toPlainObject(allocsToStore));
        }
        this.allocations = await db.allocations.toArray();

        // 4. Synchronisation des Tâches (Exclusivement les tâches de la roadmap)
        // Réconciliation des tâches supprimées en attente
        const pendingDeletedTasks = getDeletedTaskIds();
        for (const delId of pendingDeletedTasks) {
          await api.deleteTask(delId).catch(() => {});
          await db.tasks.delete(delId);
        }

        const allLocalTasks = (await db.tasks.toArray()).filter(
          t => t && t.id && !pendingDeletedTasks.includes(t.id)
        );
        const localRoadmapTasks = allLocalTasks.filter(t => 
          t && (t.resourceId || t.allocationId)
        );

        let serverTasks = [];
        try {
          const tRes = await api.getTasks();
          if (Array.isArray(tRes)) {
            serverTasks = tRes.filter(st => st && st.id && !pendingDeletedTasks.includes(st.id));
          }
        } catch (err) {
          console.warn('[Sync] Impossible de récupérer les tâches serveur :', err);
        }

        const serverTaskIdSet = new Set(serverTasks.map(st => st.id));

        // Supprimer en local les tâches roadmap supprimées sur le serveur par un autre utilisateur
        for (const lt of localRoadmapTasks) {
          if (lt._synced && !serverTaskIdSet.has(lt.id)) {
            await db.tasks.delete(lt.id);
            if (lt.allocationId) {
              await db.allocations.delete(lt.allocationId);
            }
          }
        }

        // Déchiffrer les tâches de la roadmap reçues du serveur
        const localTasksMap = new Map(allLocalTasks.map(t => [t.id, t]));
        const processedServerTasks = [];
        for (const st of serverTasks) {
          const processed = await this.processTaskFromServer(st, localTasksMap);
          processed._synced = true;
          processedServerTasks.push(processed);
        }

        // Pousser UNIQUEMENT les tâches roadmap locales non encore synchronisées (!lt._synced)
        const missingTasksOnServer = localRoadmapTasks.filter(
          lt => !lt._synced && !serverTaskIdSet.has(lt.id)
        );

        if (missingTasksOnServer.length > 0) {
          const payloadToPush = [];
          for (const item of missingTasksOnServer) {
            payloadToPush.push(await this.prepareTaskForServer(item));
          }

          try {
            await api.createTask(toPlainObject(payloadToPush));
            for (const item of missingTasksOnServer) {
              item._synced = true;
              await db.tasks.put(toPlainObject(item));
            }
          } catch (batchErr) {
            console.warn('[Sync] Push groupé tâches échoué, tentative unitaire :', batchErr);
            for (const item of payloadToPush) {
              try {
                await api.createTask(toPlainObject(item));
                const orig = missingTasksOnServer.find(m => m.id === item.id);
                if (orig) {
                  orig._synced = true;
                  await db.tasks.put(toPlainObject(orig));
                }
              } catch (singleErr) {
                console.warn('[Sync] Échec unitaire tâche :', item.title, singleErr);
              }
            }
          }
        }

        if (processedServerTasks.length > 0) {
          await db.tasks.bulkPut(toPlainObject(processedServerTasks));
        }
        this.tasks = await db.tasks.toArray();

        // 5. Configurations communes (catégories, colonnes, terminologie)
        const config = await api.getConfig();
        if (config) {
          if (Array.isArray(config.columns) && config.columns.length > 0) {
            await db.columns.bulkPut(config.columns);
            this.columns = await db.columns.orderBy('order').toArray();
            try {
              localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
            } catch (e) {}
          } else if (this.user.role === 'admin' && this.columns.length > 0) {
            await api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
          }

          if (Array.isArray(config.categories) && config.categories.length > 0) {
            await db.categories.bulkPut(config.categories);
            this.categories = await db.categories.orderBy('order').toArray();
            try {
              localStorage.setItem('kanbinou_categories', JSON.stringify(toPlainObject(this.categories)));
            } catch (e) {}
          } else if (this.user.role === 'admin' && this.categories.length > 0) {
            await api.saveConfig({ categories: toPlainObject(this.categories) }).catch(() => {});
          }

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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut créer ou modifier les étiquettes communes.');
        return null;
      }
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut modifier les étiquettes communes.');
        return;
      }
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut supprimer des étiquettes communes.');
        return;
      }
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut réinitialiser les étiquettes.');
        return;
      }
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
    async createColumn(title, color = '#64748b', parentId = null) {
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut créer ou modifier les colonnes.');
        return null;
      }
      if (!title || !title.trim()) return null;
      const cleanTitle = title.trim();
      const id = `col-${Date.now().toString(36)}`;
      const order = this.columns.length + 1;
      const newCol = {
        id,
        title: cleanTitle,
        color: color || '#64748b',
        order,
        isVisible: true,
        parentId: parentId || null
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut modifier les colonnes.');
        return;
      }
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

    async toggleColumnGray(columnId, isGray) {
      const col = this.columns.find(c => c.id === columnId);
      if (col) {
        col.isGrayBackground = isGray;
        await db.columns.put(toPlainObject(col));
      }
      let list = Array.isArray(this.nestedConfig?.graySubcolumnIds) 
        ? [...this.nestedConfig.graySubcolumnIds] 
        : ['waiting'];
      if (isGray) {
        if (!list.includes(columnId)) list.push(columnId);
      } else {
        list = list.filter(id => id !== columnId);
      }
      await this.setNestedConfig({ graySubcolumnIds: list });
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
    },

    async nestColumn(childId, parentId) {
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut modifier l\'organisation des colonnes.');
        return;
      }
      const child = this.columns.find(c => c.id === childId);
      if (!child) return;

      if (!parentId) {
        child.parentId = null;
      } else {
        // Empêcher l'auto-imbrication ou l'imbrication dans une colonne déjà enfant (2 étages max)
        const parent = this.columns.find(c => c.id === parentId);
        if (!parent || parent.id === childId || parent.parentId) return;
        // Si le parent avait déjà un autre enfant, libérer cet ancien enfant
        const existingChild = this.columns.find(c => c.parentId === parentId && c.id !== childId);
        if (existingChild) {
          existingChild.parentId = null;
          await db.columns.put(toPlainObject(existingChild));
        }
        child.parentId = parentId;
      }

      await db.columns.put(toPlainObject(child));
      try {
        localStorage.setItem('kanbinou_columns', JSON.stringify(toPlainObject(this.columns)));
      } catch (e) {}
      if (this.isOnline && this.user) {
        api.saveConfig({ columns: toPlainObject(this.columns) }).catch(() => {});
      }
    },

    async deleteColumn(id) {
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut supprimer des colonnes.');
        return;
      }
      if (['todo', 'doing', 'waiting', 'done'].includes(id)) {
        alert('Les colonnes fondamentales (À faire, En cours, En attente, Terminé) ne peuvent pas être supprimées.');
        return;
      }
      // 1. Déplacer les tâches vers la colonne 'todo'
      const affected = this.tasks.filter(t => t.columnId === id);
      for (const t of affected) {
        t.columnId = 'todo';
        await db.tasks.put(toPlainObject(t));
      }
      // 2. Désimbriquer les éventuelles sous-colonnes enfants
      const children = this.columns.filter(c => c.parentId === id);
      for (const child of children) {
        child.parentId = null;
        await db.columns.put(toPlainObject(child));
      }
      // 3. Supprimer la colonne
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut réinitialiser les colonnes.');
        return;
      }
      const defaults = [
        { id: 'todo', title: 'À faire', order: 1, isVisible: true, color: '#0284c7', parentId: null },
        { id: 'doing', title: 'En cours', order: 2, isVisible: true, color: '#f59e0b', parentId: null },
        { id: 'waiting', title: 'En attente', order: 3, isVisible: true, color: '#8b5cf6', parentId: 'doing' },
        { id: 'done', title: 'Terminé', order: 4, isVisible: true, color: '#10b981', parentId: null }
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
      if (this.user && this.user.role !== 'admin') {
        alert('Seul un administrateur peut réorganiser les colonnes.');
        return;
      }
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
      this.newTaskDefaultColumnId = null;
      this.activeModal = 'task';
    },

    openNewTaskModal(columnId = 'todo') {
      this.selectedTaskId = 'new';
      this.newTaskDefaultColumnId = columnId;
      this.activeModal = 'task';
    },

    closeModal() {
      this.activeModal = null;
      this.selectedTaskId = null;
      this.newTaskDefaultColumnId = null;
    }
  }
});
