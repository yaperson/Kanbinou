<template>
  <div 
    class="task-card"
    :class="{ 
      'task-waiting': isBottomSubcol && store.nestedConfig?.grayBottomBackground !== false,
      'is-touch-device': store.isMobile
    }"
    :draggable="!store.isMobile"
    @dragstart="onDragStart"
    @click="openDetails"
    @contextmenu.prevent="startInlineEdit"
  >
    <!-- Édition inline du titre -->
    <input 
      v-if="isEditing" 
      ref="editInput"
      v-model="editTitle"
      class="task-inline-input"
      @blur="saveInlineEdit"
      @keydown.enter.prevent="saveInlineEdit"
      @keydown.esc="cancelInlineEdit"
      @click.stop
    />

    <!-- Contenu épuré : Titre en gras à gauche, badge de catégorie à droite -->
    <div v-else class="task-card-content" @dblclick.stop="startInlineEdit">
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
import { ref, computed, nextTick } from 'vue';
import { useAppStore } from '../stores/app.js';

const props = defineProps({
  task: {
    type: Object,
    required: true
  }
});

const store = useAppStore();

const isEditing = ref(false);
const editTitle = ref('');
const editInput = ref(null);

const category = computed(() => store.categories.find(c => c.id === props.task.categoryId));
const categoryName = computed(() => category.value ? category.value.name : 'Neutre');
const categoryColor = computed(() => category.value ? category.value.color : '#e0e0e0');
const isBottomSubcol = computed(() => {
  const grayList = store.nestedConfig?.graySubcolumnIds;
  if (Array.isArray(grayList) && grayList.length > 0) {
    return grayList.includes(props.task.columnId);
  }
  return props.task.columnId === (store.nestedConfig?.colCenterBottomId || 'waiting');
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
  if (!isEditing.value) {
    store.openTaskModal(props.task.id);
  }
}

function startInlineEdit() {
  if (store.isMobile) return;
  editTitle.value = props.task.title;
  isEditing.value = true;
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus();
      editInput.value.select();
    }
  });
}

function saveInlineEdit() {
  if (isEditing.value) {
    const trimmed = editTitle.value.trim();
    if (trimmed && trimmed !== props.task.title) {
      store.saveTask({ ...props.task, title: trimmed });
    }
    isEditing.value = false;
  }
}

function cancelInlineEdit() {
  isEditing.value = false;
}
</script>

<style scoped>
.task-inline-input {
  width: 100%;
  padding: 4px 8px;
  font-size: 0.92rem;
  font-weight: 700;
  border: 1px solid #0284c7;
  border-radius: 4px;
  outline: none;
  background: white;
}
</style>
