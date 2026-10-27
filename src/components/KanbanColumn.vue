<template>
  <div 
    class="kanban-column"
    :class="{ 'is-drag-over': isDragOver }"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <!-- Header de la colonne -->
    <div class="column-header">
      <div class="column-title-group">
        <span class="column-color-indicator" :style="{ backgroundColor: column.color }"></span>
        <h2>{{ column.title }}</h2>
        <span class="column-count-badge">{{ columnTasks.length }}</span>
      </div>

      <!-- Actions de colonne (Temps + Bouton de tri en forme de flèche) -->
      <div class="column-actions-group">
        <span class="column-meta" v-if="timeTotal > 0">
          ~{{ timeTotal }}h
        </span>

        <button 
          class="btn-column-sort"
          :class="{ 'is-active': columnSort !== 'none' }"
          :title="sortTooltip"
          @click="toggleSort"
        >
          <span v-if="columnSort === 'desc'" style="color: #0284c7;">⬇</span>
          <span v-else-if="columnSort === 'asc'" style="color: #0284c7;">⬆</span>
          <span v-else class="sort-neutral-icon">↕</span>
        </button>
      </div>
    </div>

    <!-- Liste des tâches -->
    <div class="column-task-list">
      <TaskCard 
        v-for="task in columnTasks" 
        :key="task.id" 
        :task="task" 
      />
    </div>

    <!-- Ajout rapide au bas de la colonne (À faire ou première colonne) -->
    <div class="column-footer" v-if="column.id === 'todo' || column.id === store.columns[0]?.id">
      <form class="quick-add-form" @submit.prevent="submitQuickAdd">
        <input 
          type="text" 
          v-model="quickText" 
          placeholder="Ajouter une tâche..."
        />
        <button type="submit" title="Ajouter">+</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../stores/app.js';
import TaskCard from './TaskCard.vue';

const props = defineProps({
  column: {
    type: Object,
    required: true
  }
});

const store = useAppStore();
const isDragOver = ref(false);
const quickText = ref('');

// Tri temporaire par colonne : 'none' | 'desc' (dernier ajouté / récent) | 'asc' (plus ancien)
const columnSort = ref('none');

function toggleSort() {
  if (columnSort.value === 'none') {
    columnSort.value = 'desc'; // 1er clic : Dernier ajouté en premier
  } else if (columnSort.value === 'desc') {
    columnSort.value = 'asc';  // 2e clic : Plus ancien en premier
  } else {
    columnSort.value = 'none'; // 3e clic : Retour ordre naturel
  }
}

const sortTooltip = computed(() => {
  if (columnSort.value === 'desc') return 'Trié : Dernier ajouté en premier (récent) - Cliquer pour inverser';
  if (columnSort.value === 'asc') return 'Trié : Plus ancien en premier - Cliquer pour réinitialiser';
  return 'Trier par date : cliquer pour afficher les derniers ajoutés en haut';
});

const columnTasks = computed(() => {
  let tasks = store.filteredTasks.filter(t => t.columnId === props.column.id);

  if (columnSort.value === 'desc') {
    return [...tasks].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (columnSort.value === 'asc') {
    return [...tasks].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  return tasks;
});

const timeTotal = computed(() => {
  return store.columnTimeTotals[props.column.id] || 0;
});

function onDragOver() {
  if (store.isMobile) return;
  isDragOver.value = true;
}

function onDragLeave() {
  isDragOver.value = false;
}

function onDrop(event) {
  if (store.isMobile) return;
  isDragOver.value = false;
  const taskId = event.dataTransfer?.getData('text/plain');
  if (taskId) {
    store.moveTask(taskId, props.column.id);
  }
}

function submitQuickAdd() {
  if (quickText.value.trim()) {
    store.createTask(quickText.value.trim(), props.column.id);
    quickText.value = '';
  }
}
</script>
