<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Synchronisation Cloud & Sécurité</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <div class="modal-body">
        <!-- État connecté -->
        <div v-if="store.user" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
              <span style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #dcfce7; color: #166534; font-weight: 700; font-size: 0.95rem;">
                {{ (store.user.displayName || store.user.username || 'U')[0].toUpperCase() }}
              </span>
              <div>
                <strong>{{ store.user.displayName }}</strong> ({{ store.user.username }})
                <span class="badge badge-shared" style="margin-left: 6px;">{{ store.user.role }}</span>
              </div>
            </div>
            <p style="font-size: 0.82rem; color: #166534;">
              Votre compte est connecté. Les réservations sur la roadmap et les ressources sont automatiquement synchronisées en temps réel.
            </p>
          </div>

          <button class="btn btn-primary" :disabled="store.isSyncing" @click="store.syncWithServer">
            <span v-if="store.isSyncing">Synchronisation en cours...</span>
            <span v-else>Forcer la synchronisation</span>
          </button>

          <button class="btn btn-danger" @click="logout">
            Se déconnecter
          </button>
        </div>

        <!-- État non connecté : Formulaire Connexion / Inscription -->
        <div v-else>
          <!-- Onglets Connexion / Créer un compte -->
          <div style="display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 16px;">
            <button 
              class="btn" 
              :style="{ borderBottom: mode === 'login' ? '2px solid #0284c7' : 'none', fontWeight: mode === 'login' ? 'bold' : 'normal' }"
              @click="mode = 'login'"
            >
              Connexion
            </button>
            <button 
              class="btn" 
              :style="{ borderBottom: mode === 'register' ? '2px solid #0284c7' : 'none', fontWeight: mode === 'register' ? 'bold' : 'normal' }"
              @click="mode = 'register'"
            >
              Créer un compte
            </button>
          </div>

          <div v-if="errorMsg" style="background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 12px;">
            {{ errorMsg }}
          </div>

          <form @submit.prevent="submitAuth" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group" v-if="mode === 'register'">
              <label>Nom complet (Nom et Prénom)</label>
              <input type="text" v-model="form.displayName" placeholder="ex: Jean Dupont" required />
            </div>

            <div class="form-group">
              <label>Identifiant utilisateur</label>
              <input type="text" v-model="form.username" placeholder="ex: jdupont" required />
            </div>

            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" v-model="form.password" required />
            </div>

            <button type="submit" class="btn btn-primary" :disabled="loading" style="margin-top: 8px;">
              <span v-if="loading">Vérification...</span>
              <span v-else>{{ mode === 'login' ? 'Se connecter' : 'Créer le compte' }}</span>
            </button>
          </form>

          <p style="font-size: 0.78rem; color: #64748b; margin-top: 14px; text-align: center;">
            Compte administrateur initial pré-configuré : <code>admin</code> / <code>admin</code>
          </p>
        </div>

        <!-- Section Configuration du Serveur API -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <label style="font-weight: 600; font-size: 0.85rem; color: #334155;">
              Adresse du serveur API
            </label>
            <span v-if="api.isAvailable()" style="font-size: 0.75rem; color: #16a34a; font-weight: 600;">
              Actif ({{ api.getBaseUrl() }})
            </span>
            <span v-else style="font-size: 0.75rem; color: #64748b;">
              Mode local uniquement
            </span>
          </div>

          <div style="display: flex; gap: 8px;">
            <input 
              type="url" 
              v-model="apiUrlInput" 
              placeholder="ex: https://mon-kanbinou.onrender.com" 
              style="flex: 1; padding: 7px 10px; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 6px;"
            />
            <button class="btn btn-secondary" style="white-space: nowrap; font-size: 0.82rem;" @click="saveApiUrl">
              Enregistrer
            </button>
            <button v-if="apiUrlInput" class="btn" style="white-space: nowrap; font-size: 0.82rem; color: #94a3b8;" @click="clearApiUrl" title="Rétablir le mode par défaut">
              ✕
            </button>
          </div>

          <p style="font-size: 0.75rem; color: #64748b; margin-top: 6px; line-height: 1.35;">
            Sur GitHub Pages, les données sont enregistrées en local dans votre navigateur. Pour synchroniser votre équipe, déployez <code>server.js</code> sur un hébergeur Node.js (ex: <strong>Render</strong>, <strong>Railway</strong>) et renseignez son adresse ci-dessus.
          </p>
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
import { api } from '../services/api.js';

const store = useAppStore();

const mode = ref('login');
const loading = ref(false);
const errorMsg = ref('');
const apiUrlInput = ref(api.getRawBaseUrl());

const form = ref({
  username: '',
  password: '',
  displayName: ''
});

function close() {
  store.closeModal();
}

function saveApiUrl() {
  api.setBaseUrl(apiUrlInput.value);
  errorMsg.value = '';
  if (apiUrlInput.value) {
    alert(`Adresse du serveur enregistrée : ${api.getBaseUrl()}`);
  } else {
    alert('Mode serveur par défaut rétabli.');
  }
}

function clearApiUrl() {
  apiUrlInput.value = '';
  api.setBaseUrl('');
}

async function submitAuth() {
  errorMsg.value = '';
  if (!api.isAvailable()) {
    errorMsg.value = "Sur GitHub Pages, vous devez d'abord indiquer l'adresse de votre serveur API ci-dessous pour pouvoir vous connecter.";
    return;
  }
  loading.value = true;
  try {
    if (mode.value === 'login') {
      const res = await api.login(form.value.username, form.value.password);
      store.user = res.user;
    } else {
      const res = await api.register(form.value.username, form.value.password, form.value.displayName);
      store.user = res.user;
    }
    await store.syncWithServer();
    close();
  } catch (err) {
    errorMsg.value = err.message || 'Erreur lors de la connexion';
  } finally {
    loading.value = false;
  }
}

function logout() {
  api.setToken(null);
  store.user = null;
  close();
}
</script>
