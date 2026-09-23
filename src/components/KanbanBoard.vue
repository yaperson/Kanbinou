<template>
  <div 
    class="kanban-view"
    :class="store.layoutMode === 'nested3' ? 'layout-nested3' : 'layout-flat4'"
    :style="customGridStyle"
  >
    <!-- Mode 3 colonnes plein écran avec En cours / En attente imbriqués (Classique Kanbinou) -->
    <template v-if="store.layoutMode === 'nested3'">
      <!-- Volet 1 : Gauche (Simple ou Imbriqué si multi-colonnes) -->
      <KanbanNestedColumn 
        v-if="cleanLeftIds.length > 1"
        :column-ids="cleanLeftIds"
      />
      <KanbanColumn 
        v-else-if="colLeft" 
        :key="colLeft.id" 
        :column="colLeft" 
      />

      <!-- Volet 2 : Colonne centrale imbriquée (2 ou plusieurs colonnes) -->
      <KanbanNestedColumn 
        :column-ids="cleanCenterIds"
      />

      <!-- Volet 3 : Droite (Simple ou Imbriqué si multi-colonnes) -->
      <KanbanNestedColumn 
        v-if="cleanRightIds.length > 1"
        :column-ids="cleanRightIds"
      />
      <KanbanColumn 
        v-else-if="colRight" 
        :key="colRight.id" 
        :column="colRight" 
      />

      <!-- Colonnes personnalisées supplémentaires si présentes -->
      <KanbanColumn 
        v-for="col in extraCols" 
        :key="col.id" 
        :column="col" 
      />
    </template>

    <!-- Mode 4 colonnes étendues (Flat) -->
    <template v-else>
      <KanbanColumn 
        v-for="column in visibleColumns" 
        :key="column.id" 
        :column="column" 
      />
    </template>

  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAppStore } from '../stores/app.js';
import KanbanColumn from './KanbanColumn.vue';
import KanbanNestedColumn from './KanbanNestedColumn.vue';

const store = useAppStore();

// Colonnes visibles uniques (sans doublon)
const visibleColumns = computed(() => {
  const seen = new Set();
  return store.columns.filter(c => {
    if (c.isVisible === false || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
});

// Volet Gauche : ID uniques
const cleanLeftIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.leftColumnIds) && store.nestedConfig.leftColumnIds.length > 0
    ? store.nestedConfig.leftColumnIds
    : [store.nestedConfig?.colLeftId || 'todo'];
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  return res.length > 0 ? res : [store.columns[0]?.id || 'todo'];
});

// Volet Centre : ID uniques, excluant strictement le volet gauche
const cleanCenterIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.centerColumnIds) && store.nestedConfig.centerColumnIds.length > 0
    ? store.nestedConfig.centerColumnIds
    : [store.nestedConfig?.colCenterTopId || 'doing', store.nestedConfig?.colCenterBottomId || 'waiting'];
  const leftSet = new Set(cleanLeftIds.value);
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!leftSet.has(id) && !seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  if (res.length > 0) return res;
  const fallback = store.columns.find(c => !leftSet.has(c.id) && c.isVisible !== false);
  return fallback ? [fallback.id] : ['doing'];
});

// Volet Droit : ID uniques, excluant strictement gauche et centre
const cleanRightIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.rightColumnIds) && store.nestedConfig.rightColumnIds.length > 0
    ? store.nestedConfig.rightColumnIds
    : [store.nestedConfig?.colRightId || 'done'];
  const usedSet = new Set([...cleanLeftIds.value, ...cleanCenterIds.value]);
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!usedSet.has(id) && !seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  if (res.length > 0) return res;
  const fallback = store.columns.find(c => !usedSet.has(c.id) && c.isVisible !== false);
  return fallback ? [fallback.id] : ['done'];
});

const colLeft = computed(() => {
  const id = cleanLeftIds.value[0];
  return store.columns.find(c => c.id === id) || store.columns[0];
});

const colRight = computed(() => {
  const id = cleanRightIds.value[0];
  return store.columns.find(c => c.id === id) || store.columns[store.columns.length - 1];
});

const nestedUsedIds = computed(() => {
  return [
    ...cleanLeftIds.value,
    ...cleanCenterIds.value,
    ...cleanRightIds.value
  ];
});

const extraCols = computed(() => {
  const usedSet = new Set(nestedUsedIds.value);
  return store.columns.filter(c => !usedSet.has(c.id) && c.isVisible !== false);
});

const customGridStyle = computed(() => {
  if (store.layoutMode === 'nested3' && extraCols.value.length > 0) {
    return {
      gridTemplateColumns: `repeat(${3 + extraCols.value.length}, minmax(280px, 1fr))`,
      overflowX: 'auto'
    };
  }
  return {};
});

function openAddColumn() {
  store.settingsTab = 'columns';
  store.activeModal = 'settings';
}
</script>
