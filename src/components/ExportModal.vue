<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Sauvegarde & Importation</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Onglets -->
        <div style="display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px;">
          <button 
            class="btn" 
            :style="{ borderBottom: tab === 'import' ? '2px solid #0284c7' : 'none', fontWeight: tab === 'import' ? 'bold' : 'normal' }"
            @click="tab = 'import'"
          >
            Importer un fichier
          </button>
          <button 
            class="btn" 
            :style="{ borderBottom: tab === 'backup' ? '2px solid #0284c7' : 'none', fontWeight: tab === 'backup' ? 'bold' : 'normal' }"
            @click="tab = 'backup'"
          >
            Sauvegarder
          </button>
          <button 
            class="btn" 
            :style="{ borderBottom: tab === 'csv' ? '2px solid #0284c7' : 'none', fontWeight: tab === 'csv' ? 'bold' : 'normal' }"
            @click="tab = 'csv'"
          >
            Export CSV
          </button>
        </div>

        <!-- 1. ONGLET IMPORTATION UNIVERSELLE (v1, v2 chiffré, v3) -->
        <div v-if="tab === 'import'" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px;">
            <strong style="font-size: 0.9rem; color: #166534; display: block; margin-bottom: 4px;">
              Compatibilité Totale avec les Anciennes Versions
            </strong>
            <p style="font-size: 0.8rem; color: #15803d;">
              Ce module accepte tous les fichiers historiques :
              sauvegardes chiffrées Kanbinou-v2 (<code>.secure</code>), exports <code>.json</code> ou <code>.kbn</code>, et fichiers v1.
            </p>
          </div>

          <div class="form-group">
            <label>Sélectionner le fichier à importer :</label>
            <input 
              type="file" 
              ref="fileInput" 
              accept=".secure,.json,.kbn" 
              @change="onFileChange" 
            />
          </div>

          <!-- Champ mot de passe si fichier chiffré -->
          <div v-if="needsPassword || isEncryptedFile" class="form-group" style="background: #fffbeb; border: 1px solid #fef3c7; padding: 12px; border-radius: 8px;">
            <label style="color: #b45309;">
              Ce fichier est chiffré. Veuillez saisir son mot de passe :
            </label>
            <input 
              type="password" 
              v-model="importPassword" 
              placeholder="Mot de passe utilisé lors de l'export..."
              @keydown.enter.prevent="processImport"
            />
          </div>

          <div v-if="importError" style="background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px; border-radius: 6px; font-size: 0.85rem;">
            {{ importError }}
          </div>

          <!-- Aperçu avant confirmation -->
          <div v-if="previewData" style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
            <strong style="font-size: 0.88rem; color: #0284c7; display: block; margin-bottom: 6px;">
              Données détectées dans le fichier :
            </strong>
            <ul style="font-size: 0.82rem; color: #334155; margin-left: 18px; margin-bottom: 12px;">
              <li><strong>{{ previewData.tasks.length }}</strong> tâche(s)</li>
              <li><strong>{{ previewData.resources.length }}</strong> {{ store.terminology.resourceSingular.toLowerCase() }}(s) / produit(s)</li>
              <li><strong>{{ previewData.allocations.length }}</strong> créneau(x) sur la Roadmap</li>
            </ul>

            <strong style="font-size: 0.85rem; display: block; margin-bottom: 6px;">Mode d'importation :</strong>
            <div style="display: flex; gap: 14px; font-size: 0.85rem; margin-bottom: 12px;">
              <label style="cursor: pointer;">
                <input type="radio" value="merge" v-model="importMode" />
                <strong>Fusionner</strong> (ajouter aux données actuelles)
              </label>
              <label style="cursor: pointer;">
                <input type="radio" value="replace" v-model="importMode" />
                <strong>Remplacer</strong> (écraser le tableau)
              </label>
            </div>

            <button class="btn btn-primary" style="width: 100%;" @click="applyImport">
              ✅ Valider et Importer les Données
            </button>
          </div>

          <button 
            v-else 
            class="btn btn-primary" 
            :disabled="!selectedFile || isProcessing" 
            @click="processImport"
          >
            <span v-if="isProcessing">Analyse du fichier...</span>
            <span v-else>🔍 Analyser le Fichier</span>
          </button>
        </div>

        <!-- 2. ONGLET SAUVEGARDE CHIFFRÉE (.secure) -->
        <div v-else-if="tab === 'backup'" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px;">
            <strong style="font-size: 0.9rem; display: block; margin-bottom: 4px;">Exporter une sauvegarde sécurisée</strong>
            <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 10px;">
              Toutes vos données (tâches, données sensibles, paramètres, ressources) seront chiffrées avec <strong>AES-256-GCM</strong> avant téléchargement.
            </p>
            <div class="form-group" style="margin-bottom: 10px;">
              <label>Mot de passe de protection :</label>
              <input type="password" v-model="exportPassword" placeholder="Choisissez un mot de passe secret..." />
            </div>
            <button class="btn btn-primary" @click="runEncryptedExport">
              Télécharger la sauvegarde (.secure)
            </button>
          </div>
        </div>

        <!-- 3. ONGLET EXPORT TABLEUR CSV -->
        <div v-else style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <strong style="font-size: 0.85rem; display: block; margin-bottom: 6px;">Colonnes à inclure :</strong>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 0.85rem;">
              <label v-for="col in store.columns" :key="col.id">
                <input type="checkbox" v-model="csvFilter.columns" :value="col.id" /> {{ col.title }}
              </label>
            </div>
          </div>

          <div>
            <strong style="font-size: 0.85rem; display: block; margin-bottom: 6px;">Catégories :</strong>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 0.85rem;">
              <label v-for="cat in store.categories" :key="cat.id">
                <input type="checkbox" v-model="csvFilter.categories" :value="cat.id" /> {{ cat.name }}
              </label>
            </div>
          </div>

          <div>
            <strong style="font-size: 0.85rem; display: block; margin-bottom: 6px;">Statut de vente :</strong>
            <div style="display: flex; gap: 12px; font-size: 0.85rem;">
              <label><input type="radio" value="all" v-model="csvFilter.sold" /> Tous</label>
              <label><input type="radio" value="sold" v-model="csvFilter.sold" /> Vendu</label>
              <label><input type="radio" value="not-sold" v-model="csvFilter.sold" /> Non vendu</label>
            </div>
          </div>

          <button class="btn btn-primary" type="button" @click="downloadCSV">
            📥 Télécharger le fichier CSV (Excel)
          </button>
        </div>
      </div>

      <div class="modal-footer" style="justify-content: flex-end;">
        <button class="btn" @click="close">Fermer</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAppStore } from '../stores/app.js';
import { encryptData } from '../services/crypto.js';
import { db, toPlainObject } from '../services/db.js';
import { parseKanbinouFile } from '../services/importer.js';

const store = useAppStore();

const tab = ref('import');
const exportPassword = ref('');
const importPassword = ref('');
const selectedFile = ref(null);
const fileInput = ref(null);

const isEncryptedFile = ref(false);
const needsPassword = ref(false);
const isProcessing = ref(false);
const importError = ref('');
const previewData = ref(null);
const importMode = ref('merge'); // 'merge' | 'replace'

const csvFilter = ref({
  columns: store.columns.map(c => c.id),
  categories: store.categories.map(c => c.id),
  sold: 'all'
});

function close() {
  store.closeModal();
}

function onFileChange(event) {
  selectedFile.value = event.target.files[0] || null;
  previewData.value = null;
  importError.value = '';
  needsPassword.value = false;

  if (selectedFile.value) {
    const name = selectedFile.value.name.toLowerCase();
    isEncryptedFile.value = name.endsWith('.secure') || name.includes('secure');
  }
}

async function processImport() {
  if (!selectedFile.value) return;

  importError.value = '';
  isProcessing.value = true;

  try {
    const data = await parseKanbinouFile(selectedFile.value, importPassword.value);
    previewData.value = data;
    needsPassword.value = false;
  } catch (err) {
    if (err.message === 'PASSWORD_REQUIRED') {
      needsPassword.value = true;
      importError.value = 'Ce fichier est protégé par mot de passe. Veuillez entrer le mot de passe ci-dessus.';
    } else {
      importError.value = 'Erreur lors de la lecture du fichier : ' + err.message;
    }
  } finally {
    isProcessing.value = false;
  }
}

async function applyImport() {
  if (!previewData.value) return;

  const data = previewData.value;
  try {
    if (importMode.value === 'replace') {
      await db.tasks.clear();
      await db.resources.clear();
      await db.allocations.clear();
    }

    if (data.resources && data.resources.length > 0) {
      await db.resources.bulkPut(toPlainObject(data.resources));
    }

    if (data.allocations && data.allocations.length > 0) {
      await db.allocations.bulkPut(toPlainObject(data.allocations));
    }

    if (data.categories && data.categories.length > 0) {
      await db.categories.bulkPut(toPlainObject(data.categories));
    }

    if (data.columns && data.columns.length > 0) {
      await db.columns.bulkPut(toPlainObject(data.columns));
    }

    if (store.user && data.tasks && data.tasks.length > 0) {
      data.tasks.forEach(t => {
        if (!t.userId) {
          t.userId = store.user.id;
          t.userName = store.user.displayName || store.user.username;
        }
      });
    }

    if (data.tasks && data.tasks.length > 0) {
      await db.tasks.bulkPut(toPlainObject(data.tasks));
    }

    if (data.terminology) {
      await store.setTerminology(data.terminology);
    }

    await store.loadLocalData();
    if (store.isOnline && store.user) {
      await store.syncWithServer();
    }
    alert(`Importation réussie ! ${data.tasks.length} tâche(s) ont été intégrées.`);
    close();
  } catch (err) {
    alert(`Échec de l'enregistrement en base : ${err.message}`);
  }
}

// Sauvegarde Chiffrée
async function runEncryptedExport() {
  if (!exportPassword.value) {
    alert('Veuillez saisir un mot de passe pour chiffrer vos données.');
    return;
  }

  const exportPayload = {
    version: '3.0',
    exportDate: new Date().toISOString(),
    tasks: store.tasks,
    resources: store.resources,
    allocations: store.allocations,
    categories: store.categories,
    columns: store.columns,
    terminology: store.terminology
  };

  try {
    const encrypted = await encryptData(exportPayload, exportPassword.value);
    const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanbinou-sauvegarde-${new Date().toISOString().slice(0, 10)}.secure`;
    a.click();
    URL.revokeObjectURL(url);
    exportPassword.value = '';
    alert('Sauvegarde chiffrée exportée avec succès !');
  } catch (err) {
    alert('Erreur lors du chiffrement : ' + err.message);
  }
}

// Export CSV
function downloadCSV() {
  let tasks = store.tasks.filter(t => {
    if (!csvFilter.value.columns.includes(t.columnId)) return false;
    if (!csvFilter.value.categories.includes(t.categoryId)) return false;
    if (csvFilter.value.sold === 'sold' && !t.isSold) return false;
    if (csvFilter.value.sold === 'not-sold' && t.isSold) return false;
    return true;
  });

  const headers = ['ID', 'Titre', 'Colonne', 'Catégorie', 'Ressource', 'Date Début', 'Date Fin', 'Temps (h)', 'Vente (€)', 'Vendu', 'Adresse', 'Téléphone', 'Email', 'Description'];
  const rows = tasks.map(t => {
    const res = store.resources.find(r => r.id === t.resourceId);
    return [
      `"${t.id}"`,
      `"${(t.title || '').replace(/"/g, '""')}"`,
      `"${t.columnId}"`,
      `"${t.categoryId}"`,
      `"${res ? res.name : ''}"`,
      `"${t.startDate || ''}"`,
      `"${t.endDate || ''}"`,
      t.time || 0,
      t.projection || 0,
      t.isSold ? 'Oui' : 'Non',
      `"${(t.sensitive && t.sensitive.address || '').replace(/"/g, '""')}"`,
      `"${(t.sensitive && t.sensitive.phone || '').replace(/"/g, '""')}"`,
      `"${(t.sensitive && t.sensitive.email || '').replace(/"/g, '""')}"`,
      `"${(t.description || '').replace(/"/g, '""')}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kanbinou_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>
