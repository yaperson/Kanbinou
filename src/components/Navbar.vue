<template>
  <header class="app-header">
    <div class="header-main-row">
      <!-- Marque & Compteur -->
      <div class="header-brand">
        <img src="/icons/icon.svg" alt="Kanbinou" class="brand-logo" />
        <h1 class="brand-title">Kanbinou</h1>
        <span class="tasks-counter" title="Total des tâches">
          <strong>{{ store.tasks.length }}</strong> tâches
        </span>
        <span 
          class="badge" 
          :class="store.isOnline ? 'badge-shared' : 'badge-private'"
          :title="store.isOnline ? 'Connecté au réseau' : 'Mode hors-ligne (PWA)'"
        >
          {{ store.isOnline ? '● En ligne' : '○ Hors-ligne' }}
        </span>
      </div>

      <!-- Barre de recherche -->
      <div class="header-search">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          v-model="store.searchQuery" 
          placeholder="Rechercher une tâche, adresse, client..."
        />
      </div>

      <!-- Actions & Navigation de vue -->
      <div class="header-actions">
        <!-- Vues -->
        <button 
          class="btn" 
          :class="{ 'btn-active': store.currentView === 'kanban' }"
          @click="store.currentView = 'kanban'"
        >
          Kanban
        </button>
        <button 
          class="btn" 
          :class="{ 'btn-active': store.currentView === 'roadmap' }"
          @click="store.currentView = 'roadmap'"
        >
          Roadmap
        </button>

        <!-- Création rapide d'une tâche -->
        <button 
          class="btn btn-primary btn-nav-create-task" 
          @click="createNewTask" 
          title="Créer une nouvelle tâche"
        >
          ＋ Tâche
        </button>

        <!-- Modales d'action -->
        <button class="btn" @click="store.activeModal = 'resources'">
          {{ store.terminology.resourceIcon || '🦼' }} {{ store.terminology.resourcePlural }}
        </button>
        <button class="btn" @click="store.activeModal = 'export'">
          Sauvegarde & CSV
        </button>
        <button class="btn" @click="store.activeModal = 'settings'" title="Paramètres d'affichage et disposition (Admin)">
          Paramètres
        </button>
        <button 
          class="btn" 
          :class="{ 'btn-primary': store.user }"
          @click="store.activeModal = 'sync'"
          :title="store.user ? `Connecté : ${store.user.displayName}` : 'Se connecter au cloud'"
        >
          <span v-if="store.isSyncing">Sync...</span>
          <span v-else-if="store.user">{{ store.user.displayName }}</span>
          <span v-else>Connexion Cloud</span>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { useAppStore } from '../stores/app.js';
const store = useAppStore();

function createNewTask() {
  store.openNewTaskModal(store.columns[0]?.id || 'todo');
}
</script>
