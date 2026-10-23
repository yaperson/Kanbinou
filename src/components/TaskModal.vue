<template>
  <div class="modal-backdrop" @click.self="close">
    <form class="modal-card modal-large" v-if="taskForm" @submit.prevent="save">
      <!-- En-tête -->
      <div class="modal-header">
        <h3>{{ isNewTask ? 'Nouvelle tâche' : 'Détails de la tâche' }}</h3>
        <div class="modal-header-actions">
          <button v-if="!isNewTask" class="btn btn-sm" type="button" @click="printDetails" title="Imprimer la fiche">Imprimer</button>
          <button v-if="!isNewTask" class="btn btn-sm" type="button" @click="downloadICS" title="Exporter au format calendrier iCal">.ICS</button>
          <button class="close-btn" type="button" @click="close">&times;</button>
        </div>
      </div>

      <!-- Corps du formulaire (Défilement fluide 100% flex column) -->
      <div class="modal-body">
        <!-- 1. Titre -->
        <div class="form-group">
          <label>Titre de la tâche</label>
          <input 
            type="text" 
            v-model="taskForm.title" 
            required 
            placeholder="Nom ou intitulé de la tâche..." 
          />
        </div>

        <!-- 2. Colonne / Statut -->
        <div class="form-group">
          <label>Colonne (Statut du flux)</label>
          <select v-model="taskForm.columnId">
            <option v-for="col in store.columns" :key="col.id" :value="col.id">
              {{ col.title }}
            </option>
          </select>
        </div>

        <!-- 3. Catégorie -->
        <div class="form-group">
          <label>Catégorie métier</label>
          <select v-model="taskForm.categoryId">
            <option v-for="cat in store.categories" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
        </div>

        <!-- 4. Bloc Planification / Essai (si catégorie éligible) -->
        <div v-if="isRoadmapEligible" class="modal-section-box roadmap-box">
          <div class="section-box-header">
            <h4>Planification sur la Roadmap ({{ store.terminology.eventSingular }})</h4>
            <span class="section-tag-info">Synchronisé sur le calendrier de l'équipe</span>
          </div>

          <div class="form-group">
            <label>{{ store.terminology.resourceSingular }} associé</label>
            <select v-model="taskForm.resourceId">
              <option :value="null">-- Aucun {{ store.terminology.resourceSingular.toLowerCase() }} sélectionné --</option>
              <option v-for="res in store.resources" :key="res.id" :value="res.id">
                {{ res.name }} ({{ res.category }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Date de début de l'{{ store.terminology.eventSingular.toLowerCase() }}</label>
            <input type="date" v-model="taskForm.startDate" />
          </div>

          <div class="form-group">
            <label>Date de fin de l'{{ store.terminology.eventSingular.toLowerCase() }}</label>
            <input type="date" v-model="taskForm.endDate" />
          </div>
        </div>

        <!-- 5. Description -->
        <div class="form-group">
          <label>Description générale / Compte-rendu</label>
          <textarea 
            rows="3" 
            v-model="taskForm.description" 
            placeholder="Détails de l'intervention, compte-rendu, notes utiles..."
          ></textarea>
        </div>

        <!-- 6. Temps -->
        <div class="form-group">
          <label>Temps nécessaire estimé (en heures)</label>
          <input 
            type="number" 
            step="0.25" 
            min="0" 
            v-model.number="taskForm.time" 
            placeholder="ex : 1.5" 
          />
        </div>

        <!-- 7. Montant vente / prévision -->
        <div class="form-group">
          <label>Montant prévision / vente (€)</label>
          <input 
            type="number" 
            step="0.01" 
            min="0" 
            v-model.number="taskForm.projection" 
            placeholder="0.00" 
          />
        </div>

        <!-- 8. Vendu -->
        <div class="form-group">
          <label class="toggle-checkbox-card">
            <input type="checkbox" v-model="taskForm.isSold" />
            <div class="checkbox-card-content">
              <strong>Matériel / Affaire vendue</strong>
              <span>Marquer cette tâche comme concrétisée financièrement</span>
            </div>
          </label>
        </div>

        <!-- 9. Bloc Données Confidentielles (Médicales / Personnelles) -->
        <div class="modal-section-box confidential-box">
          <div class="section-box-header">
            <h4 style="color: #991b1b;">Données Personnelles & Médicales</h4>
            <span class="field-privacy-tag">Non partagé sur la roadmap publique</span>
          </div>

          <div class="form-group">
            <label>Adresse d'intervention / Patient</label>
            <input 
              type="text" 
              v-model="taskForm.sensitive.address" 
              placeholder="ex : 12 rue de la Paix, Lyon" 
            />
          </div>

          <div class="form-group">
            <label>Numéro de téléphone</label>
            <input 
              type="tel" 
              v-model="taskForm.sensitive.phone" 
              placeholder="ex : 06 12 34 56 78" 
            />
          </div>

          <div class="form-group">
            <label>Adresse e-mail</label>
            <input 
              type="email" 
              v-model="taskForm.sensitive.email" 
              placeholder="ex : patient@exemple.fr" 
            />
          </div>
        </div>
      </div>

      <!-- Pied de page -->
      <div class="modal-footer">
        <button v-if="!isNewTask" type="button" class="btn btn-danger" @click="confirmDelete">
          Supprimer
        </button>
        <span v-else></span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn" @click="close">Annuler</button>
          <button type="submit" class="btn btn-primary">Enregistrer</button>
        </div>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAppStore } from '../stores/app.js';

const store = useAppStore();

const taskForm = ref(null);
const isNewTask = computed(() => store.selectedTaskId === 'new');

watch(() => store.selectedTaskId, (id) => {
  if (id === 'new') {
    taskForm.value = {
      id: `task-${crypto.randomUUID()}`,
      title: '',
      columnId: store.newTaskDefaultColumnId || store.columns[0]?.id || 'todo',
      categoryId: store.categories[0]?.id || 'neutre',
      isShared: false,
      resourceId: null,
      startDate: '',
      endDate: '',
      allocationId: null,
      userId: store.user ? store.user.id : null,
      userName: store.user ? (store.user.displayName || store.user.username) : null,
      time: 0,
      projection: 0,
      isSold: false,
      description: '',
      sensitive: { address: '', email: '', phone: '', notes: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } else if (id) {
    const t = store.tasks.find(x => x.id === id);
    if (t) {
      taskForm.value = JSON.parse(JSON.stringify(t));
      if (!taskForm.value.sensitive) {
        taskForm.value.sensitive = { address: '', email: '', phone: '', notes: '' };
      }
    }
  } else {
    taskForm.value = null;
  }
}, { immediate: true });

const selectedCategory = computed(() => {
  if (!taskForm.value) return null;
  return store.categories.find(c => c.id === taskForm.value.categoryId);
});

const isRoadmapEligible = computed(() => {
  return selectedCategory.value ? !!selectedCategory.value.isRoadmapEligible : false;
});

function close() {
  store.closeModal();
}

async function save() {
  if (taskForm.value) {
    await store.saveTask(JSON.parse(JSON.stringify(taskForm.value)));
    close();
  }
}

async function confirmDelete() {
  if (confirm('Êtes-vous sûr de vouloir supprimer cette tâche ?')) {
    await store.deleteTask(taskForm.value.id);
    close();
  }
}

function printDetails() {
  if (!taskForm.value) return;
  const t = taskForm.value;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Fiche Tâche - ${escapeXml(t.title)}</title>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 30px; color: #1e293b; }
          h1 { border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 20px; }
          .section { margin: 14px 0; font-size: 15px; }
          .label { font-weight: bold; width: 200px; display: inline-block; color: #64748b; }
          pre { background: #f8fafc; padding: 14px; border-radius: 6px; border: 1px solid #e2e8f0; font-family: inherit; margin-top: 6px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>${escapeXml(t.title)}</h1>
        <div class="section"><span class="label">Catégorie :</span> ${escapeXml(t.categoryId)}</div>
        <div class="section"><span class="label">Temps estimé :</span> ${t.time || 0} h</div>
        <div class="section"><span class="label">Adresse :</span> ${escapeXml(t.sensitive.address || 'Non renseignée')}</div>
        <div class="section"><span class="label">Téléphone :</span> ${escapeXml(t.sensitive.phone || 'Non renseigné')}</div>
        <div class="section"><span class="label">E-mail :</span> ${escapeXml(t.sensitive.email || 'Non renseigné')}</div>
        <div class="section"><span class="label">Montant prévision :</span> ${t.projection || 0} € ${t.isSold ? '(Vendu)' : ''}</div>
        <div class="section">
          <span class="label">Description :</span>
          <pre>${escapeXml(t.description || 'Aucune description')}</pre>
        </div>
        <script>
          window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };
        <\/script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function downloadICS() {
  if (!taskForm.value) return;
  const t = taskForm.value;
  const start = t.startDate ? t.startDate.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const end = t.endDate ? t.endDate.replace(/-/g, '') : start;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kanbinou//FR',
    'BEGIN:VEVENT',
    `UID:${t.id}@kanbinou`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${t.title}`,
    `DESCRIPTION:${t.description || ''}`,
    `LOCATION:${t.sensitive.address || ''}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}
</script>

<style scoped>
.modal-section-box {
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.roadmap-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.confidential-box {
  background: #fff5f5;
  border: 1px solid #fecaca;
}

.section-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
  flex-wrap: wrap;
  gap: 6px;
}

.section-box-header h4 {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0284c7;
}

.section-tag-info {
  font-size: 0.72rem;
  font-weight: 500;
  color: #0369a1;
  background: #e0f2fe;
  padding: 2px 8px;
  border-radius: 9999px;
}

.toggle-checkbox-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toggle-checkbox-card:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.toggle-checkbox-card input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-card-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.checkbox-card-content strong {
  font-size: 0.88rem;
  color: #0f172a;
}

.checkbox-card-content span {
  font-size: 0.76rem;
  color: #64748b;
}
</style>
