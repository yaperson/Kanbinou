<template>
  <div class="app-container">
    <!-- Barre de navigation supérieure (épurée sur mobile, complète sur PC) -->
    <Navbar />

    <!-- Barre de répartition des catégories -->
    <CategoryBar />

    <!-- Contenu Principal -->
    <main class="app-main">
      <KanbanBoard v-if="store.currentView === 'kanban'" />
      <RoadmapView v-else-if="store.currentView === 'roadmap'" />
    </main>

    <!-- Barre de navigation inférieure native sur Mobile (cachée sur PC) -->
    <MobileBottomNav />

    <!-- Modales & Feuilles d'action (Bottom sheets sur mobile, fenêtres sur PC) -->
    <TaskModal v-if="store.activeModal === 'task'" />
    <ResourcesModal v-if="store.activeModal === 'resources'" />
    <SyncModal v-if="store.activeModal === 'sync'" />
    <ExportModal v-if="store.activeModal === 'export'" />
    <SettingsModal v-if="store.activeModal === 'settings'" />
    <MobileMenuModal v-if="store.activeModal === 'mobileMenu'" />

    <!-- Popup de notification en bas à droite -->
    <transition name="toast-fade">
      <div v-if="store.toast" class="kanbinou-toast" role="status">
        <span class="toast-msg">{{ store.toast.message }}</span>
        <button
          v-if="store.toast.actionLabel && store.toast.onAction"
          type="button"
          class="toast-action-link"
          @click="store.toast.onAction()"
        >
          {{ store.toast.actionLabel }}
        </button>
        <button
          type="button"
          class="toast-close-btn"
          @click="store.closeToast()"
          title="Fermer"
        >
          &times;
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAppStore } from './stores/app.js';

import Navbar from './components/Navbar.vue';
import CategoryBar from './components/CategoryBar.vue';
import KanbanBoard from './components/KanbanBoard.vue';
import RoadmapView from './components/RoadmapView.vue';
import MobileBottomNav from './components/MobileBottomNav.vue';
import MobileMenuModal from './components/MobileMenuModal.vue';
import TaskModal from './components/TaskModal.vue';
import ResourcesModal from './components/ResourcesModal.vue';
import SyncModal from './components/SyncModal.vue';
import ExportModal from './components/ExportModal.vue';
import SettingsModal from './components/SettingsModal.vue';

const store = useAppStore();

onMounted(async () => {
  await store.initialize();
});
</script>

<style scoped>
.kanbinou-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1e293b;
  color: #f8fafc;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
  border: 1px solid #334155;
  font-size: 0.9rem;
  max-width: calc(100vw - 32px);
}

.toast-msg {
  font-weight: 500;
}

.toast-action-link {
  background: #0284c7;
  color: #ffffff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}

.toast-action-link:hover {
  background: #0369a1;
}

.toast-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}

.toast-close-btn:hover {
  color: #ffffff;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.22s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>

