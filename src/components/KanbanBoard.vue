<template>
  <div class="kanban-board-container">
    <!-- Pager / Indicateur de colonnes sur Mobile pour défilement et repérage instantané -->
    <div class="mobile-column-pills" v-if="store.isMobile">
      <button 
        v-for="(col, index) in mobileColumns" 
        :key="col.id"
        class="mobile-col-pill"
        :class="{ 'is-active': activeMobileColIndex === index }"
        @click="scrollToMobileCol(index)"
      >
        <span class="pill-dot" :style="{ backgroundColor: col.color || '#64748b' }"></span>
        <span class="pill-title">{{ col.title }}</span>
        <span class="pill-count">{{ getColTaskCount(col.id) }}</span>
      </button>
    </div>

    <!-- Tableau Kanban -->
    <div 
      ref="boardContainer"
      class="kanban-view"
      :class="store.layoutMode === 'nested3' ? 'layout-nested3' : 'layout-flat4'"
      :style="customGridStyle"
      @scroll="handleBoardScroll"
    >
      <!-- Sur Mobile : affichage plein hauteur de toutes les colonnes swipeables -->
      <template v-if="store.isMobile">
        <KanbanColumn 
          v-for="col in mobileColumns" 
          :key="col.id" 
          :column="col" 
        />
      </template>

      <!-- Sur Ordinateur : mode colonnes imbriquées dynamiques (2 étages) -->
      <template v-else-if="store.layoutMode === 'nested3'">
        <template v-for="col in rootColumns" :key="col.id">
          <!-- Si la colonne a une sous-colonne imbriquée dessous -->
          <KanbanNestedColumn 
            v-if="getChildColumn(col.id)"
            :column-ids="[col.id, getChildColumn(col.id).id]"
          />
          <!-- Colonne simple indépendante -->
          <KanbanColumn 
            v-else
            :column="col" 
          />
        </template>
      </template>

      <!-- Mode large (Flat côte à côte) sur Ordinateur -->
      <template v-else>
        <KanbanColumn 
          v-for="column in visibleColumns" 
          :key="column.id" 
          :column="column" 
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../stores/app.js';
import KanbanColumn from './KanbanColumn.vue';
import KanbanNestedColumn from './KanbanNestedColumn.vue';

const store = useAppStore();
const boardContainer = ref(null);
const activeMobileColIndex = ref(0);
let scrollTimeout = null;

// Colonnes visibles uniques (sans doublon)
const visibleColumns = computed(() => {
  const seen = new Set();
  return store.columns.filter(c => {
    if (c.isVisible === false || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
});

// Colonnes racines (non imbriquées sous une autre)
const rootColumns = computed(() => {
  return visibleColumns.value.filter(c => !c.parentId);
});

// Trouver la sous-colonne enfant d'une colonne racine
function getChildColumn(parentId) {
  return visibleColumns.value.find(c => c.parentId === parentId);
}

// Colonnes pour l'affichage mobile
const mobileColumns = computed(() => visibleColumns.value);

function getColTaskCount(colId) {
  return store.filteredTasks.filter(t => t.columnId === colId).length;
}

function handleBoardScroll(e) {
  if (!store.isMobile) return;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    const el = e.target;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const colEl = el.querySelector('.kanban-column');
    const colWidth = colEl ? colEl.offsetWidth : 300;
    const newIdx = Math.round(scrollLeft / (colWidth + 12));
    activeMobileColIndex.value = Math.max(0, Math.min(newIdx, mobileColumns.value.length - 1));
  }, 50);
}

function scrollToMobileCol(index) {
  activeMobileColIndex.value = index;
  const board = boardContainer.value;
  if (!board) return;
  const colElements = board.querySelectorAll('.kanban-column');
  if (colElements[index]) {
    colElements[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
}

const customGridStyle = computed(() => {
  if (store.isMobile || store.layoutMode !== 'nested3') return {};
  const count = rootColumns.value.length;
  if (count <= 3) {
    return {
      gridTemplateColumns: `repeat(${count || 1}, minmax(0, 1fr))`
    };
  }
  return {
    gridTemplateColumns: `repeat(${count}, minmax(290px, 1fr))`,
    overflowX: 'auto'
  };
});
</script>

<style scoped>
.kanban-board-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
