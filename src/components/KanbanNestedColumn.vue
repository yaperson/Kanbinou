<template>
  <div 
    class="kanban-nested-column"
    :class="[
      resolvedColumns.length === 2 ? ('split-' + (store.nestedConfig?.splitRatio || '50-50')) : 'split-equal',
      `nested-count-${resolvedColumns.length}`,
      {
        'top-collapsed': resolvedColumns.length === 2 && isCollapsed(resolvedColumns[0]?.id),
        'bottom-collapsed': resolvedColumns.length === 2 && isCollapsed(resolvedColumns[1]?.id)
      }
    ]"
  >
    <template v-for="(col, index) in resolvedColumns" :key="col.id">
      <!-- Séparateur horizontal entre chaque sous-colonne -->
      <div 
        v-if="index > 0"
        class="column-separator"
        :style="{ height: (store.nestedConfig?.separatorThickness || 3) + 'px' }"
      ></div>

      <!-- Sous-colonne -->
      <div 
        class="nested-subcolumn"
        :class="{ 
          'is-drag-over': dragOverColId === col.id,
          'is-minimized': isCollapsed(col.id),
          'subcolumn-top': index === 0,
          'subcolumn-bottom': index === resolvedColumns.length - 1 && resolvedColumns.length === 2
        }"
        @dragover.prevent="onDragOver(col.id, $event)"
        @dragleave="onDragLeave(col.id)"
        @drop.prevent="onDrop(col.id, $event)"
      >
        <!-- Header de la sous-colonne -->
        <div class="column-header">
          <div class="column-title-group">
            <span class="column-color-indicator" :style="{ backgroundColor: col.color || '#64748b' }"></span>
            <h2>{{ col.title }}</h2>
            <span class="column-count-badge">{{ getTasksForCol(col.id).length }}</span>
          </div>

          <div class="column-actions-group">
            <span class="column-meta" v-if="getTimeTotal(col.id) > 0 && !isCollapsed(col.id)">
              ~{{ getTimeTotal(col.id) }}h
            </span>
            <button 
              v-if="!isCollapsed(col.id)"
              class="btn-column-sort"
              :class="{ 'is-active': getSubcolSort(col.id) !== 'none' }"
              :title="getSortTooltip(col)"
              @click="toggleSubcolSort(col.id)"
            >
              <span v-if="getSubcolSort(col.id) === 'desc'" style="color: #0284c7;">⬇</span>
              <span v-else-if="getSubcolSort(col.id) === 'asc'" style="color: #0284c7;">⬆</span>
              <span v-else class="sort-neutral-icon">↕</span>
            </button>
            <!-- Bouton Replier / Déplier -->
            <button 
              class="btn-collapse-subcol"
              :title="isCollapsed(col.id) ? 'Agrandir cette section' : 'Replier cette section'"
              @click="toggleCollapse(col.id)"
            >
              {{ isCollapsed(col.id) ? '▼' : '▲' }}
            </button>
          </div>
        </div>

        <!-- Liste des tâches -->
        <div class="column-task-list" v-show="!isCollapsed(col.id)">
          <TaskCard 
            v-for="task in getTasksForCol(col.id)" 
            :key="task.id" 
            :task="task" 
          />
          <div v-if="getTasksForCol(col.id).length === 0" class="empty-drop-hint">
            Déposer ici pour passer en "{{ col.title }}"
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../stores/app.js';
import TaskCard from './TaskCard.vue';

const props = defineProps({
  columnIds: {
    type: Array,
    default: () => []
  },
  topColumn: {
    type: Object,
    default: null
  },
  bottomColumn: {
    type: Object,
    default: null
  }
});

const store = useAppStore();

const resolvedColumns = computed(() => {
  const seen = new Set();
  const list = [];

  if (Array.isArray(props.columnIds) && props.columnIds.length > 0) {
    for (const raw of props.columnIds) {
      const col = typeof raw === 'object' && raw !== null ? raw : store.columns.find(c => c.id === raw);
      if (col && !seen.has(col.id)) {
        seen.add(col.id);
        list.push(col);
      }
    }
    return list;
  }
  if (props.topColumn && !seen.has(props.topColumn.id)) {
    seen.add(props.topColumn.id);
    list.push(props.topColumn);
  }
  if (props.bottomColumn && !seen.has(props.bottomColumn.id)) {
    seen.add(props.bottomColumn.id);
    list.push(props.bottomColumn);
  }
  return list;
});

// État des repliements (Set des column IDs repliés)
const collapsedColIds = ref(new Set());

function isCollapsed(colId) {
  return collapsedColIds.value.has(colId);
}

function toggleCollapse(colId) {
  const newSet = new Set(collapsedColIds.value);
  if (newSet.has(colId)) {
    newSet.delete(colId);
  } else {
    newSet.add(colId);
  }
  collapsedColIds.value = newSet;
}

// Drag & drop
const dragOverColId = ref(null);

function onDragOver(colId, e) {
  e.dataTransfer.dropEffect = 'move';
  dragOverColId.value = colId;
}

function onDragLeave(colId) {
  if (dragOverColId.value === colId) {
    dragOverColId.value = null;
  }
}

function onDrop(colId, e) {
  dragOverColId.value = null;
  const taskId = e.dataTransfer.getData('text/plain');
  if (taskId && colId) {
    store.moveTask(taskId, colId);
  }
}

// Tri individuel par sous-colonne
const sortMap = ref({});

function getSubcolSort(colId) {
  return sortMap.value[colId] || 'none';
}

function toggleSubcolSort(colId) {
  const cur = getSubcolSort(colId);
  const next = cur === 'none' ? 'desc' : (cur === 'desc' ? 'asc' : 'none');
  sortMap.value = { ...sortMap.value, [colId]: next };
}

function getSortTooltip(col) {
  const sort = getSubcolSort(col.id);
  if (sort === 'desc') return 'Trié : Dernier ajouté en premier';
  if (sort === 'asc') return 'Trié : Plus ancien en premier';
  return `Trier les tâches de ${col.title} par date`;
}

// Tâches filtrées & triées
function getTasksForCol(colId) {
  let tasks = store.filteredTasks.filter(t => t.columnId === colId);
  const sort = getSubcolSort(colId);
  if (sort === 'desc') {
    return [...tasks].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else if (sort === 'asc') {
    return [...tasks].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }
  return tasks;
}

// Heures totales calculées
function getTimeTotal(colId) {
  const tasks = getTasksForCol(colId);
  const sum = tasks.reduce((acc, t) => acc + (parseFloat(t.time) || 0), 0);
  return sum > 0 ? sum.toFixed(1) : 0;
}
</script>

<style scoped>
.btn-collapse-subcol {
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  cursor: pointer;
  padding: 1px 5px;
  font-size: 0.65rem;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-collapse-subcol:hover {
  background: #e2e8f0;
  color: #0f172a;
}
</style>
