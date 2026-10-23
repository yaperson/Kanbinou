<template>
  <div class="tab-content">
    <div v-if="!isAdmin" class="admin-readonly-banner">
      <span class="banner-icon">🔒</span>
      <div class="banner-info">
        <strong>Mode consultation</strong>
        <p>Les catégories et étiquettes sont communes à toute l'équipe et modérables uniquement par un administrateur.</p>
      </div>
    </div>

    <!-- 1. Ajouter une étiquette -->
    <div v-if="isAdmin" class="settings-section">
      <h3 class="section-heading">Créer une nouvelle étiquette</h3>
      <p class="settings-desc">
        Les étiquettes permettent de repérer vos tâches avec une pastille de couleur (ex : Commercial, SAV, Urgent...).
      </p>

      <form class="simple-add-tag-box" @submit.prevent="submitAddCategory">
        <div class="add-tag-inputs">
          <input 
            type="text" 
            v-model="newCatName" 
            placeholder="Nom de l'étiquette (ex: Devis, Contrôle, Livraison...)" 
            class="simple-text-input"
            required
          />
          <input 
            type="color" 
            v-model="newCatColor" 
            class="simple-color-picker" 
            title="Choisir une couleur"
          />
          <button type="submit" class="btn btn-primary btn-sm">
            ＋ Créer l'étiquette
          </button>
        </div>

        <!-- Palette de suggestions rapides -->
        <div class="palette-quick-row">
          <span class="palette-hint">Suggestions :</span>
          <div class="palette-bubbles">
            <button 
              v-for="c in quickPaletteColors" 
              :key="c"
              type="button" 
              class="palette-bubble"
              :style="{ backgroundColor: c }"
              @click="newCatColor = c"
              :title="c"
            ></button>
          </div>
        </div>

        <!-- Option simple pour réserver du matériel -->
        <label class="simple-checkbox-row">
          <input type="checkbox" v-model="newCatRoadmap" />
          <span>Permet de réserver un équipement sur le calendrier (Roadmap)</span>
        </label>
      </form>
    </div>

    <!-- 2. Vos étiquettes existantes -->
    <div class="settings-section">
      <h3 class="section-heading">{{ isAdmin ? '2.' : '1.' }} Vos étiquettes existantes ({{ store.categories.length }})</h3>
      <p class="settings-desc">
        {{ isAdmin ? 'Cliquez sur une couleur pour la changer en direct, ou modifiez le nom.' : 'Liste des étiquettes partagées configurées pour votre équipe :' }}
      </p>

      <div class="tags-cards-list">
        <div v-for="cat in store.categories" :key="cat.id" class="tag-pro-card">
          <!-- Ligne supérieure : Aperçu badge + Champ nom + Actions -->
          <div class="tag-pro-top">
            <div class="tag-badge-and-name">
              <span class="tag-preview-badge" :style="{ backgroundColor: cat.color }">
                {{ cat.name }}
              </span>
              <input 
                type="text" 
                :value="cat.name" 
                :readonly="!isAdmin"
                @change="e => onUpdateCategoryName(cat, e.target.value)"
                class="tag-input-name"
                placeholder="Nom de l'étiquette..."
                :title="isAdmin ? 'Modifier le nom de l\'étiquette' : 'Nom de l\'étiquette'"
              />
            </div>

            <div class="tag-top-actions">
              <label 
                class="tag-roadmap-pill" 
                :title="cat.isRoadmapEligible ? 'Cette étiquette permet de réserver un équipement sur la Roadmap' : 'Non synchronisé sur la Roadmap'"
              >
                <input 
                  type="checkbox" 
                  :checked="cat.isRoadmapEligible"
                  :disabled="!isAdmin"
                  @change="e => onUpdateCategoryRoadmap(cat, e.target.checked)"
                />
                <span>Roadmap</span>
              </label>

              <button 
                v-if="isAdmin && cat.id !== 'neutre'"
                type="button" 
                class="btn-delete-tag" 
                @click="confirmDeleteCategory(cat)"
                title="Supprimer cette étiquette"
              >
                🗑️
              </button>
              <span v-else-if="cat.id === 'neutre'" class="lock-hint" title="Étiquette de base essentielle">🔒</span>
            </div>
          </div>

          <!-- Ligne inférieure : Palette de couleurs dédiée -->
          <div v-if="isAdmin" class="tag-pro-bottom">
            <span class="tag-color-label">Couleur :</span>
            
            <div class="tag-color-picker-box">
              <input 
                type="color" 
                :value="cat.color" 
                @input="e => onLiveColorInput(cat, e.target.value)"
                @change="e => onUpdateCategoryColor(cat, e.target.value)"
                class="simple-color-picker mini"
                title="Choisir une couleur sur-mesure"
              />
            </div>

            <div class="tag-swatches-row">
              <button 
                v-for="swatch in quickPaletteColors" 
                :key="swatch"
                type="button" 
                class="palette-bubble mini"
                :class="{ 'is-selected': cat.color?.toLowerCase() === swatch.toLowerCase() }"
                :style="{ backgroundColor: swatch }"
                @click="onUpdateCategoryColor(cat, swatch)"
                :title="`Appliquer ${swatch}`"
              ></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Rétablir -->
      <div v-if="isAdmin" class="reset-footer-row">
        <button type="button" class="btn btn-outline btn-sm" @click="restoreDefaultColors">
          Rétablir les 5 étiquettes et couleurs historiques
        </button>
        <span v-if="catMsg" class="success-msg">{{ catMsg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAppStore } from '../../stores/app.js';

const store = useAppStore();
const isAdmin = computed(() => !store.user || store.user.role === 'admin');

const catMsg = ref('');
const newCatName = ref('');
const newCatColor = ref('#c5e1a5');
const newCatRoadmap = ref(false);

const quickPaletteColors = [
  '#c5e1a5', '#ffcc80', '#ef9a9a', '#81d4fa', '#e0e0e0',
  '#f43f5e', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6'
];

async function submitAddCategory() {
  if (!newCatName.value.trim()) return;
  await store.createCategory(newCatName.value.trim(), newCatColor.value, newCatRoadmap.value);
  newCatName.value = '';
  newCatColor.value = '#c5e1a5';
  newCatRoadmap.value = false;
  catMsg.value = 'Nouvelle étiquette créée avec succès';
  setTimeout(() => { catMsg.value = ''; }, 3000);
}

async function onUpdateCategoryName(cat, name) {
  if (!name.trim() || name.trim() === cat.name) return;
  await store.updateCategory(cat.id, { name: name.trim() });
}

function onLiveColorInput(cat, color) {
  if (color) cat.color = color;
}

async function onUpdateCategoryColor(cat, color) {
  if (!color) return;
  cat.color = color;
  await store.updateCategory(cat.id, { color });
}

async function onUpdateCategoryRoadmap(cat, isRoadmapEligible) {
  cat.isRoadmapEligible = isRoadmapEligible;
  await store.updateCategory(cat.id, { isRoadmapEligible, requiresResource: isRoadmapEligible });
}

async function confirmDeleteCategory(cat) {
  if (confirm(`Supprimer le tag "${cat.name}" ?\nLes tâches ayant ce tag seront réassignées à la catégorie "Neutre".`)) {
    await store.deleteCategory(cat.id);
  }
}

async function restoreDefaultColors() {
  await store.resetCategoryColors();
  catMsg.value = 'Couleurs et étiquettes d\'origine restaurées';
  setTimeout(() => { catMsg.value = ''; }, 3000);
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

.simple-add-tag-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-tag-inputs {
  display: flex;
  gap: 10px;
  align-items: center;
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

.palette-quick-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.palette-hint {
  font-size: 0.8rem;
  color: #64748b;
}

.palette-bubbles {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.palette-bubble {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid white;
  box-shadow: 0 0 0 1px #cbd5e1;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.palette-bubble:hover {
  transform: scale(1.2);
}

.palette-bubble.mini {
  width: 18px;
  height: 18px;
}

.palette-bubble.is-selected {
  box-shadow: 0 0 0 2px #0284c7;
  transform: scale(1.15);
}

.simple-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #334155;
  cursor: pointer;
}

.tags-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-pro-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-pro-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tag-badge-and-name {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.tag-preview-badge {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #1e293b;
  min-width: 60px;
  text-align: center;
}

.tag-input-name {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
  background: transparent;
}

.tag-input-name:not([readonly]):focus {
  border-color: #0284c7;
  background: white;
  outline: none;
}

.tag-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tag-roadmap-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.78rem;
  color: #475569;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
}

.btn-delete-tag {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.7;
}

.btn-delete-tag:hover {
  opacity: 1;
  background: #fee2e2;
}

.lock-hint {
  font-size: 0.85rem;
  opacity: 0.6;
}

.tag-pro-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed #f1f5f9;
  flex-wrap: wrap;
}

.tag-color-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  flex-shrink: 0;
}

.tag-color-picker-box {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tag-swatches-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
