<template>
  <div class="app-container">
    <!-- Barre de navigation supérieure -->
    <Navbar />

    <!-- Barre de répartition des catégories -->
    <CategoryBar />

    <!-- Contenu Principal -->
    <main class="app-main">
      <KanbanBoard v-if="store.currentView === 'kanban'" />
      <RoadmapView v-else-if="store.currentView === 'roadmap'" />
    </main>

    <!-- Modales -->
    <TaskModal v-if="store.activeModal === 'task'" />
    <ResourcesModal v-if="store.activeModal === 'resources'" />
    <SyncModal v-if="store.activeModal === 'sync'" />
    <ExportModal v-if="store.activeModal === 'export'" />
    <SettingsModal v-if="store.activeModal === 'settings'" />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAppStore } from './stores/app.js';

import Navbar from './components/Navbar.vue';
import CategoryBar from './components/CategoryBar.vue';
import KanbanBoard from './components/KanbanBoard.vue';
import RoadmapView from './components/RoadmapView.vue';
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
