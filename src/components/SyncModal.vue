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
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: #047857; font-weight: 500;">
              <span>🔒 Token cryptographique actif</span>
              <span>•</span>
              <span>{{ api.isRemembered() ? 'Session persistante (90 jours)' : 'Session temporaire' }}</span>
            </div>
          </div>

          <!-- Section Administrateur : Création de comptes collaborateurs -->
          <div v-if="store.user.role === 'admin'" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;" @click="showAddUser = !showAddUser">
              <strong style="font-size: 0.85rem; color: #1e293b; display: flex; align-items: center; gap: 6px;">
                <span>👥 Créer un compte collaborateur</span>
              </strong>
              <span style="font-size: 0.75rem; color: #0284c7; font-weight: 600;">{{ showAddUser ? '▲ Masquer' : '▼ Ouvrir' }}</span>
            </div>

            <div v-if="showAddUser" style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px;">
              <div v-if="newUserSuccess" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 8px 10px; border-radius: 6px; font-size: 0.8rem;">
                {{ newUserSuccess }}
              </div>
              <div v-if="newUserError" style="background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 8px 10px; border-radius: 6px; font-size: 0.8rem;">
                {{ newUserError }}
              </div>

              <form @submit.prevent="submitCreateUser" style="display: flex; flex-direction: column; gap: 8px;">
                <div class="form-group">
                  <label style="font-size: 0.78rem;">Nom complet (Nom & Prénom)</label>
                  <input type="text" v-model="newUserForm.displayName" placeholder="ex: Jean Dupont" required style="padding: 6px 10px; font-size: 0.82rem;" />
                </div>
                <div class="form-group">
                  <label style="font-size: 0.78rem;">Identifiant de connexion</label>
                  <input type="text" v-model="newUserForm.username" placeholder="ex: jdupont" required style="padding: 6px 10px; font-size: 0.82rem;" />
                </div>
                <div class="form-group">
                  <label style="font-size: 0.78rem;">Mot de passe initial</label>
                  <input type="password" v-model="newUserForm.password" required style="padding: 6px 10px; font-size: 0.82rem;" />
                </div>
                <div class="form-group">
                  <label style="font-size: 0.78rem;">Rôle attribué</label>
                  <select v-model="newUserForm.role" style="padding: 6px 10px; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 6px;">
                    <option value="user">Collaborateur standard</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <button type="submit" class="btn btn-secondary" :disabled="creatingUser" style="margin-top: 4px; font-size: 0.82rem;">
                  <span v-if="creatingUser">Création...</span>
                  <span v-else>Créer le collaborateur</span>
                </button>
              </form>
            </div>
          </div>

          <button class="btn btn-primary" :disabled="store.isSyncing" @click="store.syncWithServer">
            <span v-if="store.isSyncing">Synchronisation en cours...</span>
            <span v-else>Forcer la synchronisation</span>
          </button>

          <button class="btn btn-danger" @click="logout">
            Se déconnecter
          </button>
        </div>

        <!-- État non connecté -->
        <div v-else>
          <!-- Bannière Premier Démarrage (si base vide) -->
          <div v-if="!isInitialized" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 12px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 16px;">
            <strong>⚡ Initialisation du système</strong>
            <p style="margin-top: 4px; font-size: 0.8rem; line-height: 1.4;">
              Aucun compte administrateur n'est encore configuré. Renseignez vos informations ci-dessous pour créer le <strong>compte Administrateur principal</strong>.
            </p>
          </div>

          <div v-if="errorMsg" style="background: #fee2e2; border: 1px solid #fecaca; color: #b91c1c; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 12px;">
            {{ errorMsg }}
          </div>

          <form @submit.prevent="submitAuth" style="display: flex; flex-direction: column; gap: 12px;">
            <div class="form-group" v-if="!isInitialized">
              <label>Nom complet de l'administrateur</label>
              <input type="text" v-model="form.displayName" placeholder="Nom d'utilisateur" required />
            </div>

            <div class="form-group">
              <label>Identifiant utilisateur</label>
              <input type="text" v-model="form.username" placeholder="Identifiant de connexion" required />
            </div>

            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" v-model="form.password" required />
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
              <input 
                type="checkbox" 
                id="rememberMe" 
                v-model="rememberMe" 
                style="width: 16px; height: 16px; cursor: pointer; accent-color: #0284c7;"
              />
              <label for="rememberMe" style="font-size: 0.82rem; color: #475569; cursor: pointer; user-select: none;">
                Rester connecté avec un token sécurisé
              </label>
            </div>

            <button type="submit" class="btn btn-primary" :disabled="loading" style="margin-top: 8px;">
              <span v-if="loading">Vérification...</span>
              <span v-else>{{ !isInitialized ? 'Créer le compte Administrateur' : 'Se connecter' }}</span>
            </button>

            <p v-if="isInitialized" style="font-size: 0.76rem; color: #64748b; text-align: center; margin-top: 6px;">
              🔒 Pour des raisons de sécurité, les comptes collaborateurs sont créés par votre administrateur.
            </p>
          </form>
        </div>

        <!-- Section Chiffrement de bout en bout (E2EE) -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <label style="font-weight: 600; font-size: 0.85rem; color: #334155; display: flex; align-items: center; gap: 6px;">
              <span>🔐 Chiffrement de bout en bout</span>
            </label>
            <span v-if="store.teamKey" style="font-size: 0.75rem; color: #16a34a; font-weight: 600; display: flex; align-items: center; gap: 4px;">
              <span>🔒 Actif (AES-256)</span>
            </span>
            <span v-else style="font-size: 0.75rem; color: #d97706; font-weight: 500;">
              ⚠️ Non configuré (Coordonnées locales)
            </span>
          </div>

          <div style="display: flex; gap: 8px;">
            <input 
              :type="showTeamKey ? 'text' : 'password'" 
              v-model="teamKeyInput" 
              placeholder="Clé secrète / Phrase de passe d'équipe" 
              style="flex: 1; padding: 7px 10px; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 6px;"
            />
            <button 
              type="button"
              class="btn" 
              style="padding: 7px 10px; font-size: 0.82rem; border: 1px solid #cbd5e1;" 
              @click="showTeamKey = !showTeamKey"
              :title="showTeamKey ? 'Masquer' : 'Afficher'"
            >
              {{ showTeamKey ? '👁️' : '🔒' }}
            </button>
            <button class="btn btn-secondary" style="white-space: nowrap; font-size: 0.82rem;" @click="saveTeamKey">
              Enregistrer
            </button>
            <button v-if="store.teamKey" class="btn" style="white-space: nowrap; font-size: 0.82rem; color: #ef4444;" @click="clearTeamKey" title="Supprimer la clé locale">
              ✕
            </button>
          </div>

          <p style="font-size: 0.75rem; color: #64748b; margin-top: 6px; line-height: 1.35;">
            Les coordonnées sensibles (adresses, téléphones, emails, notes) sont chiffrées avec <strong>AES-256-GCM</strong> directement dans votre navigateur avant d'être envoyées sur la roadmap. Le serveur ne stocke que du bruit cryptographique. Vos collègues doivent renseigner la même clé secrète pour les consulter.
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
import { ref, onMounted } from 'vue';
import { useAppStore } from '../stores/app.js';
import { api } from '../services/api.js';

const store = useAppStore();

const loading = ref(false);
const errorMsg = ref('');
const rememberMe = ref(true);
const isInitialized = ref(true);
const teamKeyInput = ref(store.teamKey || '');
const showTeamKey = ref(false);

// Création d'utilisateurs par l'administrateur
const showAddUser = ref(false);
const creatingUser = ref(false);
const newUserSuccess = ref('');
const newUserError = ref('');
const newUserForm = ref({
  displayName: '',
  username: '',
  password: '',
  role: 'user'
});

const form = ref({
  username: '',
  password: '',
  displayName: ''
});

onMounted(async () => {
  if (api.isAvailable()) {
    try {
      const status = await api.getAuthStatus();
      isInitialized.value = !!(status && status.initialized);
    } catch {
      isInitialized.value = true;
    }
  }
});

function close() {
  store.closeModal();
}

function saveTeamKey() {
  store.setTeamKey(teamKeyInput.value);
  if (teamKeyInput.value) {
    alert('Clé secrète de chiffrement d\'équipe enregistrée avec succès.');
  } else {
    alert('Clé supprimée. Les coordonnées personnelles resteront exclusivement sur votre PC.');
  }
}

function clearTeamKey() {
  teamKeyInput.value = '';
  store.setTeamKey('');
}

async function submitAuth() {
  errorMsg.value = '';
  loading.value = true;
  try {
    if (!isInitialized.value) {
      // Création du premier compte administrateur
      const res = await api.register(form.value.username, form.value.password, form.value.displayName, 'admin', rememberMe.value);
      store.setUser(res.user, rememberMe.value);
      isInitialized.value = true;
    } else {
      // Connexion standard
      const res = await api.login(form.value.username, form.value.password, rememberMe.value);
      store.setUser(res.user, rememberMe.value);
    }
    await store.syncWithServer();
    close();
  } catch (err) {
    errorMsg.value = err.message || 'Erreur lors de la connexion';
  } finally {
    loading.value = false;
  }
}

async function submitCreateUser() {
  newUserSuccess.value = '';
  newUserError.value = '';
  creatingUser.value = true;
  try {
    const res = await api.register(
      newUserForm.value.username,
      newUserForm.value.password,
      newUserForm.value.displayName,
      newUserForm.value.role,
      false
    );
    newUserSuccess.value = res.message || `Compte ${newUserForm.value.username} créé avec succès !`;
    newUserForm.value = { displayName: '', username: '', password: '', role: 'user' };
  } catch (err) {
    newUserError.value = err.message || 'Erreur lors de la création du compte';
  } finally {
    creatingUser.value = false;
  }
}

function logout() {
  store.logout();
  close();
}
</script>
