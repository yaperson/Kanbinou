<template>
  <div class="category-progress-bar" v-if="store.categoryStats.length > 0">
    <div
      v-for="cat in store.categoryStats"
      :key="cat.id"
      class="progress-segment"
      :style="{
        width: cat.percentage + '%',
        backgroundColor: cat.color,
        opacity: store.activeCategoryFilter && store.activeCategoryFilter !== cat.id ? 0.3 : 1
      }"
      :title="`${cat.name} : ${cat.count} (${cat.percentage.toFixed(0)}%) - Cliquer pour filtrer`"
      @click="toggleFilter(cat.id)"
    ></div>
  </div>
</template>

<script setup>
import { useAppStore } from '../stores/app.js';
const store = useAppStore();

function toggleFilter(categoryId) {
  if (store.activeCategoryFilter === categoryId) {
    store.activeCategoryFilter = null;
  } else {
    store.activeCategoryFilter = categoryId;
  }
}
</script>
