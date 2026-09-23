<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Gestion des {{ store.terminology.resourcePlural }}</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="modal-body">
        <p style="font-size: 0.85rem; color: #64748b;">
          Ces éléments sont partagés avec toute l'équipe sur la base synchronisée et servent de support pour la Roadmap.
        </p>

        <!-- Formulaire d'ajout -->
        <div style="display: flex; gap: 8px; margin: 12px 0;">
          <input 
            type="text" 
            v-model="newResourceName" 
            :placeholder="`Nouveau ${store.terminology.resourceSingular.toLowerCase()}...`" 
            @keydown.enter.prevent="submitAdd"
            style="flex: 1;"
          />
          <button class="btn btn-primary" type="button" @click="submitAdd">
            Ajouter
          </button>
        </div>

        <!-- Table des ressources -->
        <div style="max-height: 350px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left;">
                <th style="padding: 10px 14px;">Nom</th>
                <th style="padding: 10px 14px; width: 60px; text-align: center;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="res in store.resources" 
                :key="res.id"
                style="border-bottom: 1px solid #f1f5f9;"
              >
                <td style="padding: 8px 14px;">
                  <input 
                    type="text" 
                    :value="res.name" 
                    @change="e => updateName(res.id, e.target.value)"
                    style="border: 1px solid transparent; padding: 4px 6px; border-radius: 4px; width: 100%;"
                    @focus="e => e.target.style.borderColor = '#0284c7'"
                    @blur="e => e.target.style.borderColor = 'transparent'"
                  />
                </td>
                <td style="padding: 8px 14px; text-align: center;">
                  <button 
                    class="btn btn-sm btn-danger" 
                    title="Supprimer la ressource" 
                    @click="deleteRes(res.id)"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
              <tr v-if="store.resources.length === 0">
                <td colspan="2" style="padding: 24px; text-align: center; color: #94a3b8;">
                  Aucun élément enregistré pour le moment.
                </td>
              </tr>
            </tbody>
          </table>
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

const store = useAppStore();
const newResourceName = ref('');

function close() {
  store.closeModal();
}

async function submitAdd() {
  if (newResourceName.value.trim()) {
    await store.createResource(newResourceName.value.trim());
    newResourceName.value = '';
  }
}

async function updateName(id, name) {
  if (name.trim()) {
    await store.updateResource(id, name.trim());
  }
}

async function deleteRes(id) {
  if (confirm(`Supprimer cet élément ? Les réservations associées sur la roadmap seront également retirées.`)) {
    await store.deleteResource(id);
  }
}
</script>
