<template>
  <div class="tab-content">
    <div v-if="!isAdmin" class="admin-readonly-banner">
      <span class="banner-icon">🔒</span>
      <div class="banner-info">
        <strong>Mode consultation</strong>
        <p>L'organisation des étapes est commune à toute l'équipe et modérable uniquement par un administrateur.</p>
      </div>
    </div>

    <!-- 1. Formulaire de création -->
    <div v-if="isAdmin" class="settings-section">
      <h3 class="section-heading">1. Créer une nouvelle étape</h3>
      <p class="settings-desc">
        Ajoutez une nouvelle colonne pour suivre vos processus métiers (ex : Facturé, Contrôle qualité, SAV, Livraison...).
      </p>

      <form class="simple-add-row" @submit.prevent="submitAddColumn">
        <input 
          type="text" 
          v-model="newColumnTitle" 
          placeholder="Nom de la nouvelle étape (ex: Facturé, Contrôle...)" 
          class="simple-text-input"
          required
        />
        <input 
          type="color" 
          v-model="newColumnColor" 
          class="simple-color-picker" 
          title="Choisir une couleur"
        />
        <button type="submit" class="btn btn-primary btn-sm">
          ＋ Créer la colonne
        </button>
      </form>
    </div>

    <!-- 2. Liste de toutes les colonnes avec renommage, couleur et réorganisation -->
    <div class="settings-section">
      <h3 class="section-heading">{{ isAdmin ? '2.' : '1.' }} Vos étapes et leur ordre d'apparition ({{ store.columns.length }})</h3>
      <p class="settings-desc">
        {{ isAdmin ? 'Vous pouvez renommer chaque colonne, changer sa couleur et modifier son ordre d\'apparition dans le tableau avec les flèches ▲ et ▼ :' : 'Voici les étapes partagées configurées pour votre équipe :' }}
      </p>

      <div class="simple-columns-list">
        <div v-for="(col, idx) in store.columns" :key="col.id" class="simple-col-card">
          <!-- Numéro d'ordre -->
          <span class="col-rank-num" title="Position sur le tableau">{{ idx + 1 }}</span>

          <!-- Sélecteur couleur inline -->
          <input 
            type="color" 
            :value="col.color || '#64748b'"
            :disabled="!isAdmin"
            @input="e => onLiveColumnColorInput(col, e.target.value)"
            @change="e => onUpdateColumnColor(col, e.target.value)"
            class="simple-color-picker mini"
            :title="isAdmin ? 'Changer la couleur' : 'Couleur de l\'étape'"
          />

          <!-- Nom de la colonne modifiable -->
          <input 
            type="text" 
            :value="col.title" 
            :readonly="!isAdmin"
            @change="e => onUpdateColumnTitle(col, e.target.value)"
            class="col-name-input"
            :title="isAdmin ? 'Cliquez pour renommer cette étape' : 'Nom de l\'étape'"
          />

          <!-- Nombre de tâches en cours -->
          <span class="badge-task-count" title="Nombre de tâches actuellement dans cette colonne">
            {{ getTaskCount(col.id) }} tâche{{ getTaskCount(col.id) > 1 ? 's' : '' }}
          </span>

          <!-- Imbrication / Sous-colonne -->
          <div class="col-nesting-control">
            <template v-if="col.parentId">
              <span class="badge-nest-child" :title="'Imbriquée sous ' + getColTitle(col.parentId)">
                ↳ Sous <strong>{{ getColTitle(col.parentId) }}</strong>
              </span>
              <label v-if="isAdmin" class="toggle-gray-pill mini" title="Afficher les cartes de cette étape avec un fond grisé">
                <input 
                  type="checkbox" 
                  :checked="isColumnGray(col)" 
                  @change="onToggleGray(col, $event.target.checked)" 
                />
                <span>Fond gris</span>
              </label>
              <button 
                v-if="isAdmin"
                type="button" 
                class="btn-unnest" 
                @click="store.nestColumn(col.id, null)"
                title="Détacher cette étape pour qu'elle redevienne une colonne indépendante"
              >
                ✕ Séparer
              </button>
            </template>

            <template v-else-if="getChildCol(col.id)">
              <span class="badge-nest-parent" :title="'Contient la sous-colonne ' + getChildCol(col.id).title">
                Contient : <strong>{{ getChildCol(col.id).title }}</strong>
              </span>
              <button 
                v-if="isAdmin"
                type="button" 
                class="btn-unnest" 
                @click="store.nestColumn(getChildCol(col.id).id, null)"
                title="Détacher la sous-colonne"
              >
                ✕ Séparer
              </button>
            </template>

            <template v-else-if="isAdmin && getAvailableParents(col.id).length > 0">
              <select 
                class="select-nest-parent" 
                @change="onNestSelect(col.id, $event)"
                title="Imbriquer cette colonne sous une autre étape (partage de l'écran 50/50)"
              >
                <option value="">↳ Imbriquer sous...</option>
                <option 
                  v-for="p in getAvailableParents(col.id)" 
                  :key="p.id" 
                  :value="p.id"
                >
                  Sous {{ p.title }}
                </option>
              </select>
            </template>
          </div>

          <!-- Flèches pour changer l'ordre des colonnes -->
          <div v-if="isAdmin" class="col-reorder-arrows">
            <button 
              type="button" 
              class="btn-arrow" 
              :disabled="idx === 0"
              @click="moveColumn(idx, -1)"
              title="Déplacer cette étape vers la gauche / plus haut"
            >▲</button>
            <button 
              type="button" 
              class="btn-arrow" 
              :disabled="idx === store.columns.length - 1"
              @click="moveColumn(idx, 1)"
              title="Déplacer cette étape vers la droite / plus bas"
            >▼</button>
          </div>

          <!-- Statut protégée ou suppression -->
          <span v-if="['todo', 'doing', 'waiting', 'done'].includes(col.id)" class="badge-default-col" title="Étape essentielle de base">
            Essentielle
          </span>
          <button 
            v-else-if="isAdmin"
            type="button" 
            class="btn-delete-col" 
            @click="confirmDeleteColumn(col)"
            title="Supprimer cette colonne (les tâches basculeront vers 'À faire')"
          >
            🗑️
          </button>
        </div>
      </div>

      <!-- Réinitialiser -->
      <div v-if="isAdmin" class="reset-footer-row">
        <button type="button" class="btn btn-outline btn-sm" @click="confirmResetColumns">
          Restaurer les 4 étapes d'origine (À faire, En cours, En attente, Terminé)
        </button>
        <span v-if="colMsg" class="success-msg">{{ colMsg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../../stores/app.js';

const store = useAppStore();
const isAdmin = computed(() => !store.user || store.user.role === 'admin');

const colMsg = ref('');
const newColumnTitle = ref('');
const newColumnColor = ref('#64748b');

async function submitAddColumn() {
  if (!newColumnTitle.value.trim()) return;
  await store.createColumn(newColumnTitle.value.trim(), newColumnColor.value);
  newColumnTitle.value = '';
  newColumnColor.value = '#64748b';
  colMsg.value = 'Nouvelle colonne ajoutée avec succès';
  setTimeout(() => { colMsg.value = ''; }, 3000);
}

async function onUpdateColumnTitle(col, title) {
  if (!title.trim() || title.trim() === col.title) return;
  await store.updateColumn(col.id, { title: title.trim() });
}

function onLiveColumnColorInput(col, color) {
  if (color) col.color = color;
}

async function onUpdateColumnColor(col, color) {
  if (!color) return;
  col.color = color;
  await store.updateColumn(col.id, { color });
}

async function confirmDeleteColumn(col) {
  if (confirm(`Supprimer la colonne "${col.title}" ?\nLes tâches présentes dans cette colonne seront déplacées vers "À faire".`)) {
    await store.deleteColumn(col.id);
  }
}

async function confirmResetColumns() {
  if (confirm('Restaurer les 4 colonnes fondamentales par défaut (À faire, En cours, En attente, Terminé) ?')) {
    await store.resetDefaultColumns();
    colMsg.value = 'Colonnes d\'origine restaurées';
    setTimeout(() => { colMsg.value = ''; }, 3000);
  }
}

async function moveColumn(idx, delta) {
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= store.columns.length) return;
  const list = [...store.columns];
  const temp = list[idx];
  list[idx] = list[targetIdx];
  list[targetIdx] = temp;
  await store.reorderColumns(list);
}

function getTaskCount(colId) {
  return store.tasks.filter(t => t.columnId === colId).length;
}

function getColTitle(id) {
  const col = store.columns.find(c => c.id === id);
  return col ? col.title : id;
}

function getChildCol(parentId) {
  return store.columns.find(c => c.parentId === parentId);
}

function getAvailableParents(colId) {
  const thisHasChild = Boolean(getChildCol(colId));
  if (thisHasChild) return [];
  return store.columns.filter(c => 
    c.id !== colId &&
    !c.parentId &&
    !getChildCol(c.id) &&
    c.isVisible !== false
  );
}

async function onNestSelect(colId, event) {
  const targetParentId = event.target.value;
  if (!targetParentId) return;
  await store.nestColumn(colId, targetParentId);
  event.target.value = '';
}

function isColumnGray(col) {
  if (typeof col.isGrayBackground === 'boolean') return col.isGrayBackground;
  if (Array.isArray(store.nestedConfig?.graySubcolumnIds)) return store.nestedConfig.graySubcolumnIds.includes(col.id);
  return col.id === 'waiting';
}

async function onToggleGray(col, isGray) {
  await store.toggleColumnGray(col.id, isGray);
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

.simple-add-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.simple-text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
  background: white;
}

.simple-text-input:focus {
  border-color: #0284c7;
  outline: none;
}

.simple-color-picker {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  background: white;
  flex-shrink: 0;
}

.simple-color-picker.mini {
  width: 26px;
  height: 26px;
  border-radius: 4px;
}

.simple-columns-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.simple-col-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
}

.col-rank-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.col-name-input {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e293b;
  background: transparent;
}

.col-name-input:not([readonly]):focus {
  border-color: #0284c7;
  background: white;
  outline: none;
}

.badge-task-count {
  font-size: 0.78rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 3px 8px;
  border-radius: 9999px;
  white-space: nowrap;
}

.col-nesting-control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.badge-nest-child {
  font-size: 0.75rem;
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.badge-nest-parent {
  font-size: 0.75rem;
  background: #f8fafc;
  color: #475569;
  border: 1px dashed #cbd5e1;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.btn-unnest {
  font-size: 0.72rem;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 2px 6px;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
}

.btn-unnest:hover {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.select-nest-parent {
  font-size: 0.75rem;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 3px 6px;
  color: #475569;
  cursor: pointer;
}

.select-nest-parent:focus {
  outline: none;
  border-color: #0284c7;
}

.toggle-gray-pill.mini {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.col-reorder-arrows {
  display: flex;
  gap: 4px;
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

.badge-default-col {
  font-size: 0.72rem;
  color: #94a3b8;
  font-style: italic;
  padding: 2px 6px;
}

.btn-delete-col {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.7;
}

.btn-delete-col:hover {
  opacity: 1;
  background: #fee2e2;
}

.reset-footer-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.success-msg {
  font-size: 0.82rem;
  color: #16a34a;
  font-weight: 600;
}

.admin-readonly-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.admin-readonly-banner .banner-icon {
  font-size: 1.4rem;
}

.admin-readonly-banner .banner-info strong {
  display: block;
  font-size: 0.88rem;
  color: #1e293b;
  margin-bottom: 2px;
}

.admin-readonly-banner .banner-info p {
  margin: 0;
  font-size: 0.8rem;
  color: #64748b;
}
</style>
