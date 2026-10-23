<template>
  <nav class="mobile-bottom-nav" aria-label="Navigation mobile">
    <!-- 1. Onglet Kanban -->
    <button 
      class="nav-tab-item" 
      :class="{ 'is-active': store.currentView === 'kanban' && !store.activeModal }"
      @click="goToView('kanban')"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18" />
        </svg>
      </span>
      <span class="tab-label">Kanban</span>
    </button>

    <!-- 2. Onglet Roadmap -->
    <button 
      class="nav-tab-item" 
      :class="{ 'is-active': store.currentView === 'roadmap' && !store.activeModal }"
      @click="goToView('roadmap')"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </span>
      <span class="tab-label">Roadmap</span>
    </button>

    <!-- 3. Bouton Central d'Action Rapide : Ajouter une Tâche -->
    <button 
      class="nav-tab-action" 
      @click="createNewTask"
      title="Créer une nouvelle tâche"
    >
      <span class="action-btn-circle">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
      <span class="tab-label">Créer</span>
    </button>

    <!-- 4. Onglet Produits / Ressources -->
    <button 
      class="nav-tab-item" 
      :class="{ 'is-active': store.activeModal === 'resources' }"
      @click="openModal('resources')"
    >
      <span class="tab-icon emoji-icon">
        {{ store.terminology.resourceIcon || '🦼' }}
      </span>
      <span class="tab-label">{{ store.terminology.resourcePlural || 'Produits' }}</span>
    </button>

    <!-- 5. Onglet Menu & Réglages -->
    <button 
      class="nav-tab-item" 
      :class="{ 'is-active': store.activeModal === 'mobileMenu' }"
      @click="openModal('mobileMenu')"
    >
      <span class="tab-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </span>
      <span class="tab-label">Menu</span>
    </button>
  </nav>
</template>

<script setup>
import { useAppStore } from '../stores/app.js';

const store = useAppStore();

function goToView(view) {
  store.closeModal();
  store.currentView = view;
}

function createNewTask() {
  store.openNewTaskModal();
}

function openModal(modalName) {
  if (store.activeModal === modalName) {
    store.closeModal();
  } else {
    store.activeModal = modalName;
  }
}
</script>

<style scoped lang="scss">
.mobile-bottom-nav {
  display: none; // Caché par défaut sur PC (largeur > 768px)

  @media (max-width: 768px) {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(56px + env(safe-area-inset-bottom, 0px));
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    justify-content: space-around;
    z-index: 900;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.04);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
}

.nav-tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 100%;
  padding: 4px 2px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 0;

  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    transition: transform 0.15s ease;

    &.emoji-icon {
      font-size: 1.15rem;
      line-height: 1;
    }
  }

  .tab-label {
    font-size: 0.68rem;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
  }

  &:active {
    transform: scale(0.92);
  }

  &.is-active {
    color: #0284c7;

    .tab-icon {
      transform: translateY(-1px);
    }

    .tab-label {
      font-weight: 700;
    }
  }
}

.nav-tab-action {
  flex: 0 0 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: -14px;
  color: #0284c7;

  .action-btn-circle {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .tab-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: #0284c7;
    margin-top: 2px;
  }

  &:active {
    .action-btn-circle {
      transform: scale(0.92);
      box-shadow: 0 2px 6px rgba(2, 132, 199, 0.25);
    }
  }
}
</style>
