<template>
  <div class="tab-content">
    <!-- 1. Style d'affichage -->
    <div class="settings-section">
      <h3 class="section-heading">1. Comment organiser votre tableau ?</h3>
      <div class="layout-cards-grid">
        <!-- Choix 1 : 3 colonnes -->
        <div 
          class="layout-simple-card"
          :class="{ 'is-selected': store.layoutMode === 'nested3' }"
          @click="store.setLayoutMode('nested3')"
        >
          <div class="card-radio-row">
            <span class="radio-indicator" :class="{ 'is-checked': store.layoutMode === 'nested3' }"></span>
            <strong>Vue compacte (3 colonnes)</strong>
            <span class="badge-recom">Recommandé</span>
          </div>
          <p class="card-desc">
            Tout tient sur votre écran <strong>sans défilement vers la droite</strong>. Les étapes en cours sont regroupées au milieu.
          </p>
          <!-- Mini schéma visuel -->
          <div class="mini-preview-3col">
            <div class="mini-box col-side">À faire</div>
            <div class="mini-box col-center">
              <span class="mini-sub sub-top">En cours</span>
              <span class="mini-sub sub-bottom">En attente</span>
            </div>
            <div class="mini-box col-side">Terminé</div>
          </div>
        </div>

        <!-- Choix 2 : Colonnes indépendantes -->
        <div 
          class="layout-simple-card"
          :class="{ 'is-selected': store.layoutMode === 'flat4' }"
          @click="store.setLayoutMode('flat4')"
        >
          <div class="card-radio-row">
            <span class="radio-indicator" :class="{ 'is-checked': store.layoutMode === 'flat4' }"></span>
            <strong>Vue large (côte à côte)</strong>
          </div>
          <p class="card-desc">
            Chaque étape est affichée dans sa propre colonne avec défilement horizontal vers la droite.
          </p>
          <!-- Mini schéma visuel -->
          <div class="mini-preview-flat">
            <div class="mini-box">À faire</div>
            <div class="mini-box">En cours</div>
            <div class="mini-box">En attente</div>
            <div class="mini-box">Terminé</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Répartition précise des 3 zones (si mode 3 colonnes) -->
    <div v-if="store.layoutMode === 'nested3'" class="settings-section">
      <h3 class="section-heading">2. Répartition de vos étapes dans les 3 volets</h3>
      <p class="settings-desc">
        Personnalisez facilement quelle colonne ouvre le tableau à gauche, quelles étapes s'empilent au milieu, et quelle étape clôture vos projets à droite :
      </p>

      <div class="three-zones-grid">
        <!-- Volet 1 : Gauche -->
        <div class="zone-card">
          <div class="zone-card-header">
            <span class="zone-badge">Volet Gauche</span>
            <strong>Départ</strong>
          </div>
          <p class="zone-hint">L'étape où débutent vos nouvelles tâches :</p>
          <div class="zone-select-row">
            <span class="zone-dot" :style="{ backgroundColor: getColColor(selectedLeftCol) }"></span>
            <select v-model="selectedLeftCol" class="zone-select">
              <option v-for="col in availableForLeft" :key="col.id" :value="col.id">
                {{ col.title }}
              </option>
            </select>
          </div>
        </div>

        <!-- Volet 2 : Centre (Multi-étapes) -->
        <div class="zone-card zone-center-card">
          <div class="zone-card-header">
            <span class="zone-badge badge-primary">Volet Central</span>
            <strong>Étapes au milieu ({{ currentCenterIds.length }})</strong>
          </div>
          <p class="zone-hint">Ces étapes se partagent la hauteur pour gagner de la place en largeur :</p>
          
          <!-- Liste des sous-colonnes au centre -->
          <div class="stack-items-list">
            <div 
              v-for="(colId, idx) in currentCenterIds" 
              :key="idx" 
              class="stack-item-card"
            >
              <div class="stack-item-main">
                <span class="stack-number">{{ idx + 1 }}</span>
                <span class="stack-color-dot" :style="{ backgroundColor: getColColor(colId) }"></span>
                <strong class="stack-name">{{ getColTitle(colId) }}</strong>
              </div>

              <div class="stack-item-options">
                <!-- Option fond gris -->
                <label class="toggle-gray-pill" title="Mettre un fond gris sur les cartes de cette étape pour les repérer rapidement">
                  <input 
                    type="checkbox" 
                    :checked="isGraySubcolumn(colId)" 
                    @change="toggleGraySubcolumn(colId, $event.target.checked)"
                  />
                  <span>Fond gris</span>
                </label>

                <!-- Flèches monter / descendre -->
                <div class="stack-arrows">
                  <button 
                    type="button" 
                    class="btn-arrow" 
                    :disabled="idx === 0"
                    @click="moveCenterSlot(idx, -1)"
                    title="Monter cette étape"
                  >▲</button>
                  <button 
                    type="button" 
                    class="btn-arrow" 
                    :disabled="idx === currentCenterIds.length - 1"
                    @click="moveCenterSlot(idx, 1)"
                    title="Descendre cette étape"
                  >▼</button>
                </div>

                <!-- Retirer de la pile -->
                <button 
                  v-if="currentCenterIds.length > 1"
                  type="button" 
                  class="btn-remove-from-stack" 
                  @click="removeCenterSubcolumn(idx)"
                  title="Retirer cette étape du milieu"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- Ajouter une étape dans la pile du milieu -->
          <div v-if="availableForCenter.length > 0" class="add-to-stack-row">
            <select v-model="selectedColToAdd" class="select-col-add">
              <option value="" disabled>Choisir une colonne à empiler au milieu...</option>
              <option v-for="col in availableForCenter" :key="col.id" :value="col.id">
                {{ col.title }}
              </option>
            </select>
            <button 
              type="button" 
              class="btn btn-primary btn-sm"
              :disabled="!selectedColToAdd"
              @click="submitAddCenterSubcolumn"
            >
              ＋ Empiler au milieu
            </button>
          </div>

          <!-- Répartition de la hauteur au centre -->
          <div class="height-ratio-row">
            <span class="height-label">Partage de la hauteur :</span>
            <div class="segmented-pill-group">
              <button 
                type="button"
                class="segmented-pill-btn"
                :class="{ 'is-active': currentSplitRatio === 'equal' }"
                @click="setCenterSplitRatio('equal')"
              >
                Hauteurs égales
              </button>
              <button 
                type="button"
                class="segmented-pill-btn"
                :class="{ 'is-active': currentSplitRatio === 'auto' }"
                @click="setCenterSplitRatio('auto')"
              >
                Selon le contenu
              </button>
            </div>
          </div>
        </div>

        <!-- Volet 3 : Droite -->
        <div class="zone-card">
          <div class="zone-card-header">
            <span class="zone-badge">Volet Droit</span>
            <strong>Clôture</strong>
          </div>
          <p class="zone-hint">L'étape où se valident ou se terminent vos tâches :</p>
          <div class="zone-select-row">
            <span class="zone-dot" :style="{ backgroundColor: getColColor(selectedRightCol) }"></span>
            <select v-model="selectedRightCol" class="zone-select">
              <option v-for="col in availableForRight" :key="col.id" :value="col.id">
                {{ col.title }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Aperçu Visuel Dynamique en Direct -->
    <div class="settings-section">
      <h3 class="section-heading">3. Aperçu en temps réel de votre tableau</h3>
      <p class="settings-desc">
        Voici à quoi ressemble votre écran avec vos réglages actuels :
      </p>

      <div class="live-board-preview-card">
        <div class="preview-board-mockup" :class="store.layoutMode === 'nested3' ? 'mode-3col' : 'mode-flat'">
          <template v-if="store.layoutMode === 'nested3'">
            <!-- Colonne Gauche -->
            <div class="mock-col mock-side">
              <div class="mock-col-header" :style="{ borderTopColor: previewLeftCol.color }">
                <span class="mock-dot" :style="{ backgroundColor: previewLeftCol.color }"></span>
                <strong>{{ previewLeftCol.title }}</strong>
              </div>
              <div class="mock-task-postit">Tâche en attente de traitement</div>
            </div>

            <!-- Colonne Centre Imbriquée -->
            <div class="mock-col mock-center">
              <div 
                v-for="c in previewCenterCols" 
                :key="c.id" 
                class="mock-sub-col"
                :class="{ 'mock-sub-gray': isGraySubcolumn(c.id) }"
              >
                <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                  <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                  <strong>{{ c.title }}</strong>
                  <span v-if="isGraySubcolumn(c.id)" class="mock-badge-gray">Fond gris</span>
                </div>
                <div class="mock-task-postit" :class="{ 'postit-gray': isGraySubcolumn(c.id) }">
                  Tâche en cours
                </div>
              </div>
            </div>

            <!-- Colonne Droite -->
            <div class="mock-col mock-side">
              <div class="mock-col-header" :style="{ borderTopColor: previewRightCol.color }">
                <span class="mock-dot" :style="{ backgroundColor: previewRightCol.color }"></span>
                <strong>{{ previewRightCol.title }}</strong>
              </div>
              <div class="mock-task-postit">Tâche finalisée</div>
            </div>

            <!-- Colonnes supplémentaires s'il en reste -->
            <div v-for="c in previewExtraCols" :key="c.id" class="mock-col mock-side">
              <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                <strong>{{ c.title }}</strong>
              </div>
              <div class="mock-task-postit">Tâche supplémentaire</div>
            </div>
          </template>

          <template v-else>
            <div v-for="c in store.columns" :key="c.id" class="mock-col">
              <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                <strong>{{ c.title }}</strong>
              </div>
              <div class="mock-task-postit">Tâche exemple</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../../stores/app.js';

const store = useAppStore();
const selectedColToAdd = ref('');

const currentLeftIds = computed(() => {
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

const currentCenterIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.centerColumnIds) && store.nestedConfig.centerColumnIds.length > 0
    ? store.nestedConfig.centerColumnIds
    : [store.nestedConfig?.colCenterTopId || 'doing', store.nestedConfig?.colCenterBottomId || 'waiting'];
  const leftSet = new Set(currentLeftIds.value);
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

const currentRightIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.rightColumnIds) && store.nestedConfig.rightColumnIds.length > 0
    ? store.nestedConfig.rightColumnIds
    : [store.nestedConfig?.colRightId || 'done'];
  const usedSet = new Set([...currentLeftIds.value, ...currentCenterIds.value]);
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

const availableForLeft = computed(() => {
  return store.columns.filter(c => c.id !== selectedRightCol.value && c.isVisible !== false);
});

const availableForRight = computed(() => {
  return store.columns.filter(c => c.id !== selectedLeftCol.value && c.isVisible !== false);
});

const selectedLeftCol = computed({
  get() {
    return currentLeftIds.value[0] || 'todo';
  },
  set(val) {
    store.setNestedConfig({ leftColumnIds: [val], colLeftId: val });
  }
});

const selectedRightCol = computed({
  get() {
    return currentRightIds.value[0] || 'done';
  },
  set(val) {
    store.setNestedConfig({ rightColumnIds: [val], colRightId: val });
  }
});

const currentSplitRatio = computed(() => store.nestedConfig?.splitRatio || 'equal');

function setCenterSplitRatio(ratio) {
  store.setNestedConfig({ splitRatio: ratio });
}

const availableForCenter = computed(() => {
  return store.columns.filter(c => 
    !currentCenterIds.value.includes(c.id) &&
    c.id !== selectedLeftCol.value &&
    c.id !== selectedRightCol.value &&
    c.isVisible !== false
  );
});

function submitAddCenterSubcolumn() {
  if (!selectedColToAdd.value) return;
  const list = [...currentCenterIds.value, selectedColToAdd.value];
  store.setNestedConfig({ centerColumnIds: list });
  selectedColToAdd.value = '';
}

function removeCenterSubcolumn(index) {
  if (currentCenterIds.value.length <= 1) return;
  const list = currentCenterIds.value.filter((_, i) => i !== index);
  store.setNestedConfig({ centerColumnIds: list });
}

function moveCenterSlot(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= currentCenterIds.value.length) return;
  const list = [...currentCenterIds.value];
  const temp = list[index];
  list[index] = list[target];
  list[target] = temp;
  store.setNestedConfig({ centerColumnIds: list });
}

function isGraySubcolumn(colId) {
  const list = store.nestedConfig?.graySubcolumnIds;
  if (Array.isArray(list)) {
    return list.includes(colId);
  }
  return colId === (store.nestedConfig?.colCenterBottomId || 'waiting');
}

function toggleGraySubcolumn(colId, checked) {
  let list = Array.isArray(store.nestedConfig?.graySubcolumnIds) 
    ? [...store.nestedConfig.graySubcolumnIds] 
    : [store.nestedConfig?.colCenterBottomId || 'waiting'];
  
  if (checked) {
    if (!list.includes(colId)) list.push(colId);
  } else {
    list = list.filter(id => id !== colId);
  }
  store.setNestedConfig({ graySubcolumnIds: list });
}

function getColTitle(id) {
  const col = store.columns.find(c => c.id === id);
  return col ? col.title : id;
}

function getColColor(id) {
  const col = store.columns.find(c => c.id === id);
  return col ? (col.color || '#0284c7') : '#94a3b8';
}

const previewLeftCol = computed(() => {
  return store.columns.find(c => c.id === selectedLeftCol.value) || { id: 'todo', title: 'À faire', color: '#0284c7' };
});

const previewCenterCols = computed(() => {
  return currentCenterIds.value.map(id => {
    return store.columns.find(c => c.id === id) || { id, title: id, color: '#f59e0b' };
  });
});

const previewRightCol = computed(() => {
  return store.columns.find(c => c.id === selectedRightCol.value) || { id: 'done', title: 'Terminé', color: '#10b981' };
});

const previewExtraCols = computed(() => {
  const used = new Set([selectedLeftCol.value, ...currentCenterIds.value, selectedRightCol.value]);
  return store.columns.filter(c => !used.has(c.id) && c.isVisible !== false);
});
</script>

<style scoped>
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.settings-section {
  display: flex;
  flex-direction: column;
}

.section-heading {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 6px 0;
}

.settings-desc {
  font-size: 0.86rem;
  color: #64748b;
  margin: 0 0 14px 0;
  line-height: 1.45;
}

.layout-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 16px;
}

.layout-simple-card {
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.layout-simple-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.layout-simple-card.is-selected {
  border-color: #0284c7;
  background: #f0f9ff;
  box-shadow: 0 0 0 1px #0284c7;
}

.card-radio-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.radio-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: inline-block;
  position: relative;
  flex-shrink: 0;
}

.radio-indicator.is-checked {
  border-color: #0284c7;
}

.radio-indicator.is-checked::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0284c7;
}

.badge-recom {
  background: #dcfce7;
  color: #15803d;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-left: auto;
}

.card-desc {
  font-size: 0.84rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}

.mini-preview-3col, .mini-preview-flat {
  display: flex;
  gap: 6px;
  height: 48px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px;
  margin-top: auto;
}

.mini-box {
  flex: 1;
  background: #e2e8f0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 600;
  text-align: center;
}

.col-center {
  flex: 1.3;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: transparent;
}

.mini-sub {
  flex: 1;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 600;
}

.sub-top {
  background: #e2e8f0;
  color: #475569;
}

.sub-bottom {
  background: #cbd5e1;
  color: #334155;
}

.three-zones-grid {
  display: grid;
  grid-template-columns: 1fr 1.6fr 1fr;
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 720px) {
  .three-zones-grid {
    grid-template-columns: 1fr;
  }
}

.zone-card {
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.zone-card.zone-center-card {
  border-color: #bae6fd;
  background: #f8fafc;
}

.zone-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.zone-badge {
  font-size: 0.72rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  padding: 2px 8px;
  border-radius: 9999px;
}

.zone-badge.badge-primary {
  background: #e0f2fe;
  color: #0284c7;
}

.zone-hint {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
  line-height: 1.35;
}

.zone-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
}

.zone-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.zone-select {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

.stack-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stack-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.stack-item-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stack-number {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stack-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.stack-name {
  font-size: 0.9rem;
  color: #1e293b;
}

.stack-item-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-gray-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #475569;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  user-select: none;
}

.toggle-gray-pill:hover {
  background: #e2e8f0;
}

.stack-arrows {
  display: flex;
  gap: 3px;
}

.btn-arrow {
  width: 26px;
  height: 26px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  color: #475569;
  cursor: pointer;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-arrow:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-remove-from-stack {
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove-from-stack:hover {
  background: #fee2e2;
  color: #dc2626;
}

.add-to-stack-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 4px;
}

.select-col-add {
  flex: 1;
  padding: 7px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
}

.height-ratio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed #cbd5e1;
  flex-wrap: wrap;
}

.height-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}

.segmented-pill-group {
  display: flex;
  gap: 4px;
  background: #e2e8f0;
  padding: 3px;
  border-radius: 6px;
}

.segmented-pill-btn {
  border: none;
  background: none;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.segmented-pill-btn.is-active {
  background: #0284c7;
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.live-board-preview-card {
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  padding: 14px;
}

.preview-board-mockup {
  display: grid;
  gap: 12px;
  min-height: 140px;
}

.preview-board-mockup.mode-3col {
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.preview-board-mockup.mode-flat {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
}

.mock-col {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.mock-col.mock-center {
  gap: 8px;
  padding: 8px;
  background: #f8fafc;
  border-style: dashed;
}

.mock-sub-col {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mock-sub-col.mock-sub-gray {
  background: #f1f5f9;
}

.mock-col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #1e293b;
  border-top: 3px solid #64748b;
  padding-top: 4px;
}

.mock-col-header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
}

.mock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mock-badge-gray {
  font-size: 0.65rem;
  background: #e2e8f0;
  color: #475569;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: auto;
}

.mock-task-postit {
  background: #fffae6;
  border: 1px solid #fef08a;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 0.72rem;
  color: #422006;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.mock-task-postit.postit-gray {
  background: #e2e8f0 !important;
  border-color: #cbd5e1 !important;
  color: #334155 !important;
}
</style>
