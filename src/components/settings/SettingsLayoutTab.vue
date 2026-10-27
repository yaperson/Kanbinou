<template>
  <div class="tab-content">
    <!-- 1. Style d'affichage -->
    <div class="settings-section">
      <h3 class="section-heading">1. Comment organiser votre tableau ?</h3>
      <div class="layout-cards-grid">
        <!-- Choix 1 : Vue compacte avec colonnes imbriquées -->
        <div 
          class="layout-simple-card"
          :class="{ 'is-selected': store.layoutMode === 'nested3' }"
          @click="store.setLayoutMode('nested3')"
        >
          <div class="card-radio-row">
            <span class="radio-indicator" :class="{ 'is-checked': store.layoutMode === 'nested3' }"></span>
            <strong>Vue compacte (Colonnes imbriquées)</strong>
            <span class="badge-recom">Recommandé</span>
          </div>
          <p class="card-desc">
            Idéal sur écran d'ordinateur : les étapes imbriquées se partagent la hauteur verticale pour éviter tout défilement horizontal.
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
            Chaque étape est affichée dans sa propre colonne pleine hauteur avec défilement horizontal vers la droite.
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

    <!-- 2. Réglages des colonnes imbriquées (si mode compact) -->
    <div v-if="store.layoutMode === 'nested3'" class="settings-section">
      <h3 class="section-heading">2. Répartition et contraste des étapes imbriquées</h3>
      <p class="settings-desc">
        Choisissez comment la hauteur est partagée entre deux étapes superposées, et activez si souhaité un fond grisé contrasté.
      </p>

      <div class="nested-summary-card">
        <!-- Choix du partage de hauteur -->
        <div class="split-ratio-config-row">
          <span class="ratio-heading">Partage de la hauteur :</span>
          <div class="segmented-pill-group">
            <button 
              type="button"
              class="segmented-pill-btn"
              :class="{ 'is-active': (store.nestedConfig?.splitRatio || '50-50') !== 'auto' }"
              @click="setSplitRatio('50-50')"
            >
              Hauteurs égales (50 / 50)
            </button>
            <button 
              type="button"
              class="segmented-pill-btn"
              :class="{ 'is-active': store.nestedConfig?.splitRatio === 'auto' }"
              @click="setSplitRatio('auto')"
            >
              Selon le nombre de tâches (automatique)
            </button>
          </div>
        </div>

        <!-- Liste des étapes imbriquées avec toggle fond gris -->
        <div class="nested-pairs-container">
          <span class="ratio-heading">Étapes superposées actives :</span>
          <div v-if="nestedPairs.length > 0" class="nested-pairs-list">
            <div v-for="pair in nestedPairs" :key="pair.parent.id" class="nested-pair-item">
              <div class="pair-bubble">
                <span class="bubble-dot" :style="{ backgroundColor: pair.parent.color || '#64748b' }"></span>
                <strong>{{ pair.parent.title }}</strong>
              </div>
              <span class="pair-arrow">➔ contient en bas</span>
              <div class="pair-bubble">
                <span class="bubble-dot" :style="{ backgroundColor: pair.child.color || '#64748b' }"></span>
                <strong>{{ pair.child.title }}</strong>
              </div>

              <!-- Option Fond gris interactive -->
              <label class="toggle-gray-pill" title="Afficher les cartes de cette sous-étape avec un fond grisé pour les repérer rapidement">
                <input 
                  type="checkbox" 
                  :checked="isColumnGray(pair.child)" 
                  @change="onToggleGray(pair.child, $event.target.checked)" 
                />
                <span>Fond gris</span>
              </label>
            </div>
          </div>
          <p v-else class="nested-empty-hint">
            Aucune colonne n'est actuellement imbriquée. Vous pouvez en imbriquer une dans l'onglet « Mes Colonnes ».
          </p>
        </div>

        <div class="nested-config-action">
          <button type="button" class="btn btn-outline btn-sm" @click="$emit('go-to-columns')">
            📋 Gérer l'imbrication dans « Mes Colonnes »
          </button>
        </div>
      </div>
    </div>

    <!-- 3. Aperçu Visuel Dynamique en Direct -->
    <div class="settings-section">
      <h3 class="section-heading">3. Aperçu en temps réel de votre tableau</h3>
      <p class="settings-desc">
        Voici la disposition résultante de vos étapes :
      </p>

      <div class="live-board-preview-card">
        <div class="preview-board-mockup" :class="store.layoutMode === 'nested3' ? 'mode-3col' : 'mode-flat'">
          <template v-if="store.layoutMode === 'nested3'">
            <div 
              v-for="col in rootColumns" 
              :key="col.id" 
              class="mock-col"
              :class="{ 'mock-col-nested': getChildColumn(col.id) }"
            >
              <template v-if="getChildColumn(col.id)">
                <!-- Sous-colonne haut -->
                <div class="mock-sub-col">
                  <div class="mock-col-header" :style="{ borderTopColor: col.color || '#64748b' }">
                    <span class="mock-dot" :style="{ backgroundColor: col.color || '#64748b' }"></span>
                    <strong>{{ col.title }}</strong>
                  </div>
                  <div class="mock-task-postit">Tâche {{ col.title }}</div>
                </div>

                <!-- Sous-colonne bas -->
                <div class="mock-sub-col" :class="{ 'mock-sub-gray': isColumnGray(getChildColumn(col.id)) }">
                  <div class="mock-col-header" :style="{ borderTopColor: getChildColumn(col.id).color || '#64748b' }">
                    <span class="mock-dot" :style="{ backgroundColor: getChildColumn(col.id).color || '#64748b' }"></span>
                    <strong>{{ getChildColumn(col.id).title }}</strong>
                    <span v-if="isColumnGray(getChildColumn(col.id))" class="mock-badge-gray">Fond gris</span>
                  </div>
                  <div class="mock-task-postit" :class="{ 'postit-gray': isColumnGray(getChildColumn(col.id)) }">
                    Tâche {{ getChildColumn(col.id).title }}
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="mock-col-header" :style="{ borderTopColor: col.color || '#64748b' }">
                  <span class="mock-dot" :style="{ backgroundColor: col.color || '#64748b' }"></span>
                  <strong>{{ col.title }}</strong>
                </div>
                <div class="mock-task-postit">Tâche {{ col.title }}</div>
              </template>
            </div>
          </template>

          <template v-else>
            <div v-for="col in visibleColumns" :key="col.id" class="mock-col">
              <div class="mock-col-header" :style="{ borderTopColor: col.color || '#64748b' }">
                <span class="mock-dot" :style="{ backgroundColor: col.color || '#64748b' }"></span>
                <strong>{{ col.title }}</strong>
              </div>
              <div class="mock-task-postit">Tâche {{ col.title }}</div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAppStore } from '../../stores/app.js';

const emit = defineEmits(['go-to-columns']);
const store = useAppStore();

const visibleColumns = computed(() => {
  return store.columns.filter(c => c.isVisible !== false);
});

const rootColumns = computed(() => {
  return visibleColumns.value.filter(c => !c.parentId);
});

function getChildColumn(parentId) {
  return visibleColumns.value.find(c => c.parentId === parentId);
}

const nestedPairs = computed(() => {
  const pairs = [];
  for (const root of rootColumns.value) {
    const child = getChildColumn(root.id);
    if (child) {
      pairs.push({ parent: root, child });
    }
  }
  return pairs;
});

function isColumnGray(col) {
  if (!col) return false;
  if (typeof col.isGrayBackground === 'boolean') return col.isGrayBackground;
  if (Array.isArray(store.nestedConfig?.graySubcolumnIds)) return store.nestedConfig.graySubcolumnIds.includes(col.id);
  return col.id === 'waiting';
}

async function onToggleGray(col, isGray) {
  await store.toggleColumnGray(col.id, isGray);
}

function setSplitRatio(ratio) {
  store.setNestedConfig({ splitRatio: ratio });
}
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.layout-simple-card:hover {
  border-color: #94a3b8;
}

.layout-simple-card.is-selected {
  border-color: #0284c7;
  background: #f0f9ff;
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

/* Section 2: Résumé et réglages */
.nested-summary-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.split-ratio-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #f1f5f9;
}

.ratio-heading {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.segmented-pill-group {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 3px;
  border-radius: 6px;
}

.segmented-pill-btn {
  border: none;
  background: none;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 4px;
  cursor: pointer;
}

.segmented-pill-btn.is-active {
  background: #0284c7;
  color: #ffffff;
}

.nested-pairs-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nested-pairs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nested-pair-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pair-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.85rem;
  color: #1e293b;
}

.bubble-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pair-arrow {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 500;
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
  margin-left: auto;
}

.toggle-gray-pill:hover {
  background: #e2e8f0;
}

.nested-empty-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  font-style: italic;
}

.nested-config-action {
  display: flex;
  padding-top: 4px;
}

/* Section 3: Live preview */
.live-board-preview-card {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
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
}

.mock-col.mock-col-nested {
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
}

.mock-task-postit.postit-gray {
  background: #e2e8f0 !important;
  border-color: #cbd5e1 !important;
  color: #334155 !important;
}
</style>
