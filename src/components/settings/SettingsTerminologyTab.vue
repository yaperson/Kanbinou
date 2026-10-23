<template>
  <div class="tab-content">
    <div class="settings-section">
      <h3 class="section-heading">Quel est votre secteur d'activité ?</h3>
      <p class="settings-desc">
        Cliquez sur votre métier pour adapter automatiquement tous les mots de l'application :
      </p>

      <div class="presets-cards-grid">
        <div 
          v-for="preset in businessPresets" 
          :key="preset.id"
          class="preset-human-card"
          :class="{ 'is-selected': isCurrentPreset(preset) }"
          @click="applyPreset(preset)"
        >
          <div class="preset-giant-icon">{{ preset.icon }}</div>
          <div class="preset-text-wrap">
            <strong>{{ preset.name }}</strong>
            <span class="preset-subtext">{{ preset.resourcePlural }} • {{ preset.eventPlural }}</span>
          </div>
          <span v-if="isCurrentPreset(preset)" class="preset-checked-pill">Actif</span>
        </div>
      </div>

      <div v-if="termSavedMsg" class="success-banner">{{ termSavedMsg }}</div>
    </div>

    <!-- Section avancée repliée / discrète -->
    <div class="settings-section">
      <button 
        type="button" 
        class="btn-toggle-advanced" 
        @click="showCustomTerms = !showCustomTerms"
      >
        {{ showCustomTerms ? '▼ Masquer la personnalisation des mots' : '▶ Envie de choisir vos propres mots ? (Optionnel)' }}
      </button>

      <div v-if="showCustomTerms" class="custom-terms-box">
        <div class="custom-terms-row">
          <label>
            <span>Ce que vous réservez (singulier) :</span>
            <input type="text" v-model="formTerm.resourceSingular" placeholder="ex: Fauteuil, Véhicule" />
          </label>
          <label>
            <span>Au pluriel :</span>
            <input type="text" v-model="formTerm.resourcePlural" placeholder="ex: Fauteuils, Véhicules" />
          </label>
        </div>

        <div class="custom-terms-row">
          <label>
            <span>Le nom du rendez-vous / créneau :</span>
            <input type="text" v-model="formTerm.eventSingular" placeholder="ex: Essai, Location" />
          </label>
          <label>
            <span>Au pluriel :</span>
            <input type="text" v-model="formTerm.eventPlural" placeholder="ex: Essais, Locations" />
          </label>
        </div>

        <div class="custom-terms-row">
          <label style="flex: 1;">
            <span>Icône :</span>
            <div class="icon-quick-pick">
              <input type="text" v-model="formTerm.resourceIcon" class="icon-input-simple" />
              <button 
                v-for="ico in ['🦼', '📦', '🚜', '🎥', '🚗', '💻', '🛠️', '🏥']" 
                :key="ico"
                type="button" 
                class="btn-ico-simple"
                @click="formTerm.resourceIcon = ico"
              >{{ ico }}</button>
            </div>
          </label>
        </div>

        <button type="button" class="btn btn-primary btn-sm" @click="saveCustomTerminology">
          Enregistrer
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAppStore } from '../../stores/app.js';

const store = useAppStore();
const termSavedMsg = ref('');
const showCustomTerms = ref(false);

const businessPresets = [
  {
    id: 'medical',
    name: 'Médical & Santé (Fauteuils)',
    icon: '🦼',
    resourceSingular: 'Fauteuil',
    resourcePlural: 'Fauteuils',
    eventSingular: 'Essai',
    eventPlural: 'Essais',
    resourceIcon: '🦼'
  },
  {
    id: 'produits',
    name: 'Commerce & Démonstration',
    icon: '📦',
    resourceSingular: 'Produit',
    resourcePlural: 'Produits',
    eventSingular: 'Essai',
    eventPlural: 'Essais',
    resourceIcon: '📦'
  },
  {
    id: 'btp',
    name: 'BTP & Chantiers',
    icon: '🚜',
    resourceSingular: 'Engin',
    resourcePlural: 'Engins',
    eventSingular: 'Réservation',
    eventPlural: 'Réservations',
    resourceIcon: '🚜'
  },
  {
    id: 'audiovisuel',
    name: 'Événementiel & Audiovisuel',
    icon: '🎥',
    resourceSingular: 'Matériel',
    resourcePlural: 'Matériels',
    eventSingular: 'Location',
    eventPlural: 'Locations',
    resourceIcon: '🎥'
  },
  {
    id: 'flotte',
    name: 'Flotte & Logistique',
    icon: '🚗',
    resourceSingular: 'Véhicule',
    resourcePlural: 'Véhicules',
    eventSingular: 'Mission',
    eventPlural: 'Missions',
    resourceIcon: '🚗'
  },
  {
    id: 'it',
    name: 'Conseil & Espaces',
    icon: '💻',
    resourceSingular: 'Salle',
    resourcePlural: 'Salles',
    eventSingular: 'Atelier',
    eventPlural: 'Ateliers',
    resourceIcon: '💻'
  }
];

const formTerm = ref({
  resourceSingular: store.terminology.resourceSingular || 'Produit',
  resourcePlural: store.terminology.resourcePlural || 'Produits',
  eventSingular: store.terminology.eventSingular || 'Essai',
  eventPlural: store.terminology.eventPlural || 'Essais',
  resourceIcon: store.terminology.resourceIcon || '🦼'
});

function isCurrentPreset(preset) {
  return (
    store.terminology.resourceSingular === preset.resourceSingular &&
    store.terminology.eventSingular === preset.eventSingular &&
    store.terminology.resourceIcon === preset.resourceIcon
  );
}

async function applyPreset(preset) {
  formTerm.value = {
    resourceSingular: preset.resourceSingular,
    resourcePlural: preset.resourcePlural,
    eventSingular: preset.eventSingular,
    eventPlural: preset.eventPlural,
    resourceIcon: preset.resourceIcon
  };
  await store.setTerminology(formTerm.value);
  termSavedMsg.value = `Modèle "${preset.name}" appliqué`;
  setTimeout(() => { termSavedMsg.value = ''; }, 3000);
}

async function saveCustomTerminology() {
  if (!formTerm.value.resourceSingular.trim()) return;
  await store.setTerminology(formTerm.value);
  termSavedMsg.value = 'Terminologie personnalisée enregistrée';
  setTimeout(() => { termSavedMsg.value = ''; }, 3000);
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

.presets-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.preset-human-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  background: white;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.preset-human-card:hover {
  border-color: #94a3b8;
  transform: translateY(-1px);
}

.preset-human-card.is-selected {
  border-color: #0284c7;
  background: #f0f9ff;
}

.preset-giant-icon {
  font-size: 2rem;
  line-height: 1;
}

.preset-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.preset-text-wrap strong {
  font-size: 0.88rem;
  color: #1e293b;
}

.preset-subtext {
  font-size: 0.74rem;
  color: #64748b;
}

.preset-checked-pill {
  font-size: 0.7rem;
  font-weight: 700;
  background: #0284c7;
  color: white;
  padding: 2px 7px;
  border-radius: 9999px;
}

.success-banner {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #15803d;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-top: 10px;
}

.btn-toggle-advanced {
  background: none;
  border: none;
  color: #0284c7;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 0;
  text-align: left;
}

.btn-toggle-advanced:hover {
  text-decoration: underline;
}

.custom-terms-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.custom-terms-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.custom-terms-row label {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  color: #475569;
}

.custom-terms-row input[type="text"] {
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
}

.icon-quick-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.icon-input-simple {
  width: 44px !important;
  text-align: center;
  font-size: 1.2rem !important;
  padding: 4px !important;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.btn-ico-simple {
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 1.1rem;
  cursor: pointer;
}

.btn-ico-simple:hover {
  background: #e2e8f0;
}
</style>
