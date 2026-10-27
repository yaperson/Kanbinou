<template>
  <div 
    class="task-card"
    :class="{ 
      'task-waiting': isGrayCard,
      'is-touch-device': store.isMobile
    }"
    :draggable="!store.isMobile"
    @dragstart="onDragStart"
    @click="openDetails"
  >
    <!-- Contenu épuré : Titre en gras à gauche, badges à droite -->
    <div class="task-card-content">
      <span class="task-title">{{ task.title }}</span>

      <div class="task-badges-inline">
        <!-- Ressource associée si essai programmé -->
        <span v-if="linkedResource" class="badge-mini-resource" :title="`Réservé : ${linkedResource.name}`">
          {{ store.terminology.resourceIcon || '🦼' }} {{ linkedResource.name }}
        </span>

        <!-- Badge de catégorie avec couleur d'origine Kanbinou -->
        <span 
          class="type-badge" 
          :style="{ backgroundColor: categoryColor }"
        >
          {{ categoryName }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAppStore } from '../stores/app.js';

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
});

const store = useAppStore();

const category = computed(() => store.categories.find(c => c.id === props.task.categoryId));
const categoryName = computed(() => category.value ? category.value.name : 'Neutre');
const categoryColor = computed(() => category.value ? category.value.color : '#e0e0e0');

const isGrayCard = computed(() => {
  const col = store.columns.find(c => c.id === props.task.columnId);
  if (!col) return false;
  if (typeof col.isGrayBackground === 'boolean') {
    return col.isGrayBackground;
  }
  if (Array.isArray(store.nestedConfig?.graySubcolumnIds)) {
    return store.nestedConfig.graySubcolumnIds.includes(col.id);
  }
  return col.id === 'waiting';
});

const linkedResource = computed(() => {
  if (!props.task.resourceId) return null;
  return store.resources.find(r => r.id === props.task.resourceId);
});

function onDragStart(event) {
  if (store.isMobile) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.setData('text/plain', props.task.id);
  event.dataTransfer.effectAllowed = 'move';
}

function openDetails() {
  store.openTaskModal(props.task.id);
}
</script>
