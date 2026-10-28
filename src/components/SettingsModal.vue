<template>
  <div class="modal-backdrop" @click.self="store.closeModal()">
    <div class="modal-card modal-settings">
      <!-- En-tête (verrouillé, ne se compresse jamais) -->
      <div class="modal-header">
        <div class="header-title-group">
          <h2>Paramètres</h2>
        </div>
        <button class="btn-close" @click="store.closeModal()" title="Fermer">✕</button>
      </div>

      <!-- 4 Onglets Clairs et Explicites (toujours visibles et accessibles) -->
      <nav class="settings-tabs-nav" aria-label="Navigation des paramètres">
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'layout' }"
          @click="selectTab('layout')"
        >
          <span class="tab-icon">📐</span>
          <span>Disposition</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'columns' }"
          @click="selectTab('columns')"
        >
          <span class="tab-icon">📋</span>
          <span>Mes Colonnes ({{ store.columns.length }})</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'categories' }"
          @click="selectTab('categories')"
        >
          <span class="tab-icon">🏷️</span>
          <span>Étiquettes</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'terminology' }"
          @click="selectTab('terminology')"
        >
          <span class="tab-icon">🦼</span>
          <span>Mon Métier</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'calendar' }"
          @click="selectTab('calendar')"
        >
          <span class="tab-icon">📅</span>
          <span>Agenda</span>
        </button>
      </nav>

      <!-- Corps dynamique modulaire avec défilement fluide -->
      <div class="modal-body settings-body">
        <SettingsLayoutTab v-if="activeTab === 'layout'" @go-to-columns="selectTab('columns')" />
        <SettingsColumnsTab v-else-if="activeTab === 'columns'" />
        <SettingsCategoriesTab v-else-if="activeTab === 'categories'" />
        <SettingsTerminologyTab v-else-if="activeTab === 'terminology'" />
        <SettingsCalendarTab v-else-if="activeTab === 'calendar'" />
      </div>

      <!-- Pied de page simple (verrouillé, toujours visible) -->
      <div class="modal-footer">
        <button class="btn btn-primary" @click="store.closeModal()">
          Fermer
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useAppStore } from '../stores/app.js';
import SettingsLayoutTab from './settings/SettingsLayoutTab.vue';
import SettingsColumnsTab from './settings/SettingsColumnsTab.vue';
import SettingsCategoriesTab from './settings/SettingsCategoriesTab.vue';
import SettingsTerminologyTab from './settings/SettingsTerminologyTab.vue';
import SettingsCalendarTab from './settings/SettingsCalendarTab.vue';

const store = useAppStore();

const activeTab = ref(store.settingsTab || 'layout');
watch(() => store.settingsTab, (tab) => {
  if (tab) activeTab.value = tab;
});

function selectTab(tab) {
  activeTab.value = tab;
  store.settingsTab = tab;
}
</script>

<style scoped>
.modal-settings {
  max-width: 860px;
  width: 95vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #1e293b;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.3rem;
  color: #64748b;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #0f172a;
}

/* Barre de navigation des onglets - garantie 100% visible et non compressible */
.settings-tabs-nav {
  display: flex;
  gap: 6px;
  border-bottom: 2px solid #e2e8f0;
  padding: 0 20px;
  background: #f8fafc;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 12px 14px;
  font-size: 0.88rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  margin-bottom: -2px;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn:hover {
  color: #0284c7;
}

.tab-btn.is-active {
  color: #0284c7;
  border-bottom-color: #0284c7;
  font-weight: 700;
  background: white;
}

.tab-icon {
  font-size: 1rem;
}

.modal-body.settings-body {
  padding: 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1 1 auto;
  min-height: 0;
}

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
  background: #f8fafc;
}

/* Sur mobile & petits écrans : affichage en grille 2x2 pour que TOUS les onglets restent visibles sans défilement */
@media (max-width: 640px) {
  .modal-header {
    padding: 12px 16px;
  }

  .settings-tabs-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px 12px;
    background: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
  }

  .tab-btn {
    padding: 8px 8px;
    font-size: 0.8rem;
    text-align: center;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: white;
    margin-bottom: 0;
    justify-content: center;
    white-space: normal;
  }

  .tab-btn.is-active {
    background: #0284c7;
    color: white;
    border-color: #0284c7;
    border-bottom-color: #0284c7;
  }

  .modal-body.settings-body {
    padding: 16px 14px;
  }

  .modal-footer {
    padding: 10px 16px;
  }
}
</style>
