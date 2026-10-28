<template>
  <div class="tab-content">
    <!-- Bandeau d'état de connexion de l'agenda -->
    <div
      v-if="!store.calendarConfig.isConfigured || !store.calendarConfig.caldavUrl"
      class="calendar-status-banner status-unconfigured"
    >
      <div class="status-icon">📅</div>
      <div class="status-info">
        <strong>Aucun agenda n'est configuré</strong>
        <p>
          Choisissez votre type de messagerie ci-dessous pour connecter directement votre calendrier à Kanbinou.
        </p>
      </div>
    </div>

    <div v-else class="calendar-status-banner status-connected">
      <div class="status-icon">✅</div>
      <div class="status-info">
        <strong>Connecté à : {{ store.calendarConfig.calendarName }}</strong>
        <p>
          Mode :
          <span class="protocol-pill">
            {{ store.calendarConfig.protocol === 'ssl' ? 'SSL (Exchange / OVH)' : 'Lien CalDAV' }}
          </span>
          • Compte : <code>{{ store.calendarConfig.username }}</code>
        </p>
      </div>
      <button type="button" class="btn btn-sm btn-outline" @click="disconnectCalendar">
        Déconnecter
      </button>
    </div>

    <!-- Bloc unique de connexion (si non configuré) -->
    <form
      v-if="!store.calendarConfig.isConfigured || !store.calendarConfig.caldavUrl"
      class="connect-calendar-card"
      @submit.prevent="connectCalendar"
    >
      <!-- Sélecteur visuel à 2 choix avec bouton radio franc -->
      <div class="protocol-selector-section">
        <span class="field-section-label">Choisissez votre type de messagerie :</span>
        <div class="protocol-cards-grid">
          <!-- Choix 1 : Lien CalDAV -->
          <div
            class="protocol-choice-card"
            :class="{ 'is-selected': formProtocol === 'caldav' }"
            @click="selectProtocol('caldav')"
          >
            <div class="choice-header">
              <span class="radio-indicator" :class="{ 'is-checked': formProtocol === 'caldav' }"></span>
              <strong class="choice-title">🌐 Lien CalDAV</strong>
              <span v-if="formProtocol === 'caldav'" class="active-check-badge">Sélectionné ✓</span>
            </div>
            <p class="choice-sub">
              Infomaniak, Nextcloud, Apple iCloud, Zimbra, Synology, Google...
            </p>
          </div>

          <!-- Choix 2 : SSL Exchange 365 mutualisé ou hébergé / OVH -->
          <div
            class="protocol-choice-card"
            :class="{ 'is-selected': formProtocol === 'ssl' }"
            @click="selectProtocol('ssl')"
          >
            <div class="choice-header">
              <span class="radio-indicator" :class="{ 'is-checked': formProtocol === 'ssl' }"></span>
              <strong class="choice-title">🔒 SSL Exchange / OVH</strong>
              <span v-if="formProtocol === 'ssl'" class="active-check-badge">Sélectionné ✓</span>
            </div>
            <p class="choice-sub">
              Exchange 365 mutualisé ou hébergé (Exchange OVH, Ionos, Outlook Web...)
            </p>
          </div>
        </div>
      </div>

      <!-- Phrase d'aide unique et dynamique selon l'onglet actif -->
      <div class="context-tip-banner">
        <span class="tip-icon">💡</span>
        <div v-if="formProtocol === 'ssl'" class="tip-text">
          <strong>Où trouver le serveur SSL ?</strong> C'est le début de l'adresse web où vous lisez vos mails (Webmail OVH / Outlook). Cliquez sur l'un des serveurs OVH ci-dessous ou saisissez-le :
        </div>
        <div v-else class="tip-text">
          <strong>Où trouver le lien CalDAV ?</strong> Ouvrez votre agenda (Infomaniak, Nextcloud…) → cliquez sur <em>Synchroniser / Paramètres du calendrier</em> → copiez le lien CalDAV.
        </div>
      </div>

      <div v-if="errorMsg" class="error-banner">
        <div>⚠️ {{ errorMsg }}</div>
        <div v-if="debugList.length > 0" class="debug-trace-box">
          <strong>🔍 Détail technique du diagnostic (serveurs testés) :</strong>
          <div v-for="(d, idx) in debugList" :key="idx" class="debug-trace-row">
            <code>{{ d.server }}</code> → <strong>HTTP {{ d.httpStatus }}</strong>
            <span v-if="d.wwwAuthenticate && d.wwwAuthenticate !== 'none'"> (Auth: {{ d.wwwAuthenticate }})</span>
            <span v-if="d.soapError"> • {{ d.soapError }}</span>
            <span v-if="d.networkError"> • {{ d.networkError }}</span>
          </div>
        </div>
      </div>

      <!-- Champ Serveur / URL adapté au choix -->
      <div v-if="formProtocol === 'ssl'" class="form-group">
        <label>Serveur SSL Exchange (détection auto des clusters OVH si vous laissez ex.mail.ovh.net)</label>
        <input
          type="text"
          v-model="formUrl"
          required
          placeholder="ex : ex.mail.ovh.net (testera automatiquement ex, ex2 à ex5, pro1 à pro3)"
        />
        <div class="ovh-presets-row">
          <span class="preset-label">Raccourcis OVH :</span>
          <span
            v-for="srv in ovhExchangeServers"
            :key="srv"
            class="ovh-chip"
            :class="{ 'is-active': formUrl === srv || formUrl === `https://${srv}/EWS/Exchange.asmx` }"
            @click="formUrl = srv"
          >
            {{ srv }}
          </span>
        </div>
      </div>

      <div v-else class="form-group">
        <label>URL CalDAV de votre calendrier</label>
        <input
          type="url"
          v-model="formUrl"
          required
          placeholder="https://sync.infomaniak.com/calendars/votre.nom@domaine.fr/..."
        />
      </div>

      <!-- Identifiants de la boîte mail -->
      <div class="hours-grid">
        <div class="form-group">
          <label>Adresse e-mail complète</label>
          <input
            type="text"
            v-model="formUsername"
            required
            autocomplete="username"
            placeholder="ex : commercial@entreprise.fr"
          />
        </div>
        <div class="form-group">
          <label>Mot de passe (celui de votre boîte mail)</label>
          <input
            type="password"
            v-model="formPassword"
            required
            autocomplete="current-password"
            placeholder="••••••••••••••••"
          />
        </div>
      </div>

      <!-- Horaires des rappels -->
      <div class="hours-grid">
        <div class="form-group">
          <label>Heure rappel début (Dépose / Validation)</label>
          <input type="time" v-model="formStartHour" required />
        </div>
        <div class="form-group">
          <label>Heure rappel fin (Récupération)</label>
          <input type="time" v-model="formEndHour" required />
        </div>
      </div>

      <button type="submit" class="btn btn-primary submit-connect-btn" :disabled="isTesting">
        {{ isTesting ? '⏳ Test des serveurs Exchange / CalDAV en cours...' : '🔗 Tester et connecter mon agenda' }}
      </button>
    </form>

    <!-- Options avancées une fois l'agenda connecté -->
    <div v-else class="connected-options-card">
      <!-- Sélection du calendrier cible -->
      <div class="target-calendar-box">
        <div class="target-cal-header">
          <div>
            <h3 class="section-heading">Calendrier cible</h3>
            <p class="settings-desc">
              Choisissez dans quel calendrier de votre compte inscrire les rappels Kanbinou :
            </p>
          </div>
          <button
            type="button"
            class="btn btn-sm btn-outline"
            :disabled="isRefreshingCalendars"
            @click="refreshCalendarsList"
          >
            {{ isRefreshingCalendars ? '⏳ Recherche...' : '🔄 Actualiser la liste' }}
          </button>
        </div>

        <div class="form-group">
          <select
            class="target-calendar-select"
            :value="selectedFolderId"
            @change="onSelectTargetCalendar($event.target.value)"
          >
            <option
              v-for="cal in calendarOptions"
              :key="cal.id"
              :value="cal.id"
            >
              📅 {{ cal.name }}
            </option>
          </select>
        </div>

        <!-- Option pour cibler un calendrier partagé d'un collègue sur Exchange -->
        <div v-if="store.calendarConfig.protocol === 'ssl'" class="shared-mailbox-row">
          <button
            v-if="!showSharedInput"
            type="button"
            class="link-btn"
            @click="showSharedInput = true"
          >
            ➕ Utiliser le calendrier partagé d'un collègue ou d'une boîte partagée
          </button>
          <div v-else class="shared-input-group">
            <input
              type="email"
              v-model="sharedMailboxEmail"
              placeholder="Adresse e-mail du calendrier partagé (ex: planning@entreprise.fr)"
            />
            <button type="button" class="btn btn-sm btn-primary" @click="addSharedCalendar">
              Utiliser ce calendrier
            </button>
            <button type="button" class="btn btn-sm btn-outline" @click="showSharedInput = false">
              Annuler
            </button>
          </div>
        </div>
      </div>

      <div class="section-divider"></div>

      <h3 class="section-heading">Partage automatique de la Roadmap</h3>
      <p class="settings-desc">
        Lorsqu'un {{ store.terminology.resourceSingular.toLowerCase() }} est posé en démo/essai, Kanbinou inscrit directement deux rendez-vous dans <strong>{{ store.calendarConfig.calendarName }}</strong> avec toutes les coordonnées client (adresse, téléphone, e-mail, {{ store.terminology.resourceSingular.toLowerCase() }}) :
      </p>

      <div class="preview-reminders-box">
        <div class="preview-reminder-line">
          <span class="preview-tag tag-start">Jour de début ({{ formStartHour }})</span>
          <code>« Contacter pour valider l'{{ store.terminology.eventSingular.toLowerCase() }} du [{{ store.terminology.resourceSingular.toLowerCase() }}] »</code>
        </div>
        <div class="preview-reminder-line">
          <span class="preview-tag tag-end">Jour de fin ({{ formEndHour }})</span>
          <code>« Contacter pour récupérer le {{ store.terminology.resourceSingular.toLowerCase() }} [{{ store.terminology.resourceSingular.toLowerCase() }}] »</code>
        </div>
      </div>

      <div class="auto-share-action-card" :class="{ 'is-active': store.calendarConfig.autoShareRoadmap }">
        <div class="auto-share-text">
          <strong>
            {{ store.calendarConfig.autoShareRoadmap ? '🟢 Partage automatique de la roadmap activé' : '⚪ Partage automatique de la roadmap désactivé (par défaut)' }}
          </strong>
          <span v-if="store.calendarConfig.autoShareRoadmap">
            Chaque nouvel {{ store.terminology.eventSingular.toLowerCase() }} enregistré sur la roadmap est automatiquement créé sur <strong>{{ store.calendarConfig.calendarName }}</strong>.
          </span>
          <span v-else>
            Kanbinou n'envoie rien sur l'agenda automatiquement, mais le bouton <strong>📅 Agenda</strong> reste disponible en haut de chaque tâche.
          </span>
        </div>

        <button
          type="button"
          class="btn"
          :class="store.calendarConfig.autoShareRoadmap ? 'btn-outline' : 'btn-primary'"
          @click="toggleAutoShare"
        >
          {{ store.calendarConfig.autoShareRoadmap ? 'Désactiver le partage automatique' : 'Activer le partage automatique de la roadmap' }}
        </button>
      </div>

      <!-- Modification des horaires par défaut -->
      <div class="hours-update-box">
        <h4>Horaires par défaut des rappels</h4>
        <div class="hours-grid">
          <div class="form-group">
            <label>Jour du début (Amener / Valider)</label>
            <input type="time" v-model="formStartHour" @change="saveHours" />
          </div>
          <div class="form-group">
            <label>Jour de fin (Récupérer)</label>
            <input type="time" v-model="formEndHour" @change="saveHours" />
          </div>
        </div>
        <div v-if="savedFeedback" class="saved-pill">{{ savedFeedback }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAppStore } from '../../stores/app.js';

const store = useAppStore();

const formProtocol = ref(store.calendarConfig.protocol || 'ssl');
const formUrl = ref(store.calendarConfig.caldavUrl || 'ex.mail.ovh.net');
const formUsername = ref(store.calendarConfig.username || '');
const formPassword = ref(store.calendarConfig.password || '');
const formStartHour = ref(store.calendarConfig.startHour || '08:00');
const formEndHour = ref(store.calendarConfig.endHour || '08:00');

const ovhExchangeServers = [
  'ex.mail.ovh.net',
  'ex2.mail.ovh.net',
  'ex3.mail.ovh.net',
  'ex4.mail.ovh.net',
  'ex5.mail.ovh.net',
  'pro1.mail.ovh.net',
  'pro2.mail.ovh.net',
  'pro3.mail.ovh.net'
];

const isTesting = ref(false);
const isRefreshingCalendars = ref(false);
const errorMsg = ref('');
const debugList = ref([]);
const savedFeedback = ref('');
const showSharedInput = ref(false);
const sharedMailboxEmail = ref('');

const calendarOptions = computed(() => {
  const list = Array.isArray(store.calendarConfig.availableCalendars)
    ? [...store.calendarConfig.availableCalendars]
    : [];
  if (list.length === 0 && store.calendarConfig.isConfigured) {
    list.push({
      id: store.calendarConfig.folderId || 'calendar',
      name: store.calendarConfig.calendarName || 'Calendrier principal',
      url: store.calendarConfig.caldavUrl
    });
  }
  return list;
});

const selectedFolderId = computed(() => {
  return store.calendarConfig.folderId || (calendarOptions.value[0] && calendarOptions.value[0].id) || 'calendar';
});

onMounted(() => {
  // Si le compte était déjà connecté avant la mise à jour, récupérer automatiquement la liste des calendriers
  if (
    store.calendarConfig.isConfigured &&
    store.calendarConfig.caldavUrl &&
    (!store.calendarConfig.availableCalendars || store.calendarConfig.availableCalendars.length <= 1)
  ) {
    refreshCalendarsList(true);
  }
});

function selectProtocol(proto) {
  formProtocol.value = proto;
  errorMsg.value = '';
  debugList.value = [];
  if (proto === 'ssl' && !formUrl.value) {
    formUrl.value = 'ex.mail.ovh.net';
  }
}

async function connectCalendar() {
  errorMsg.value = '';
  debugList.value = [];
  isTesting.value = true;
  try {
    const res = await store.connectCaldavCalendar({
      protocol: formProtocol.value,
      url: formUrl.value.trim(),
      username: formUsername.value.trim(),
      password: formPassword.value,
      startHour: formStartHour.value || '08:00',
      endHour: formEndHour.value || '08:00'
    });
    if (res.debug) {
      console.info('[Agenda Debug] Connexion réussie :', res.debug);
    }
    store.showToast(`✅ Connecté à : ${res.calendarName}`);
  } catch (err) {
    errorMsg.value = err.message || 'Impossible de joindre le serveur d\'agenda. Vérifiez l\'adresse du serveur et vos identifiants.';
    if (Array.isArray(err.debug)) {
      debugList.value = err.debug;
      console.warn('[Agenda Debug] Détail des tentatives :', err.debug);
    }
  } finally {
    isTesting.value = false;
  }
}

async function refreshCalendarsList(silent = false) {
  if (!store.calendarConfig.caldavUrl || !store.calendarConfig.username || !store.calendarConfig.password) return;
  isRefreshingCalendars.value = true;
  try {
    const prevFolderId = store.calendarConfig.folderId;
    const prevName = store.calendarConfig.calendarName;
    const res = await store.connectCaldavCalendar({
      protocol: store.calendarConfig.protocol || 'ssl',
      url: store.calendarConfig.caldavUrl,
      username: store.calendarConfig.username,
      password: store.calendarConfig.password,
      startHour: store.calendarConfig.startHour,
      endHour: store.calendarConfig.endHour
    });
    // Conserver le choix précédent s'il existe toujours dans la liste
    const list = Array.isArray(res.calendars) ? res.calendars : [];
    const stillExists = list.find(c => c.id === prevFolderId);
    if (stillExists) {
      await store.setCalendarConfig({
        folderId: stillExists.id,
        calendarName: stillExists.name
      });
    } else if (prevFolderId && prevFolderId.startsWith('shared:')) {
      const customEntry = { id: prevFolderId, name: prevName, url: store.calendarConfig.caldavUrl };
      await store.setCalendarConfig({
        folderId: prevFolderId,
        calendarName: prevName,
        availableCalendars: [...list, customEntry]
      });
    }
    if (!silent) {
      store.showToast(`🔄 ${list.length} calendrier(s) trouvé(s) sur ce compte`);
    }
  } catch (err) {
    if (!silent) {
      store.showToast(`❌ Impossible d'actualiser les calendriers : ${err.message}`);
    }
  } finally {
    isRefreshingCalendars.value = false;
  }
}

async function onSelectTargetCalendar(newFolderId) {
  const chosen = calendarOptions.value.find(c => c.id === newFolderId);
  if (!chosen) return;
  const updates = {
    folderId: chosen.id,
    calendarName: chosen.name
  };
  if (store.calendarConfig.protocol === 'caldav' && chosen.url) {
    updates.caldavUrl = chosen.url;
  }
  await store.setCalendarConfig(updates);
  store.showToast(`✅ Connecté à : ${chosen.name}`);
}

async function addSharedCalendar() {
  const email = sharedMailboxEmail.value.trim();
  if (!email) return;
  const id = `shared:${email}`;
  const name = `Calendrier partagé (${email})`;
  const list = [...calendarOptions.value];
  if (!list.some(c => c.id === id)) {
    list.push({ id, name, url: store.calendarConfig.caldavUrl });
  }
  await store.setCalendarConfig({
    availableCalendars: list,
    folderId: id,
    calendarName: name
  });
  sharedMailboxEmail.value = '';
  showSharedInput.value = false;
  store.showToast(`✅ Connecté à : ${name}`);
}

async function disconnectCalendar() {
  await store.setCalendarConfig({
    isConfigured: false,
    calendarName: '',
    caldavUrl: '',
    folderId: 'calendar',
    availableCalendars: [],
    username: '',
    password: '',
    autoShareRoadmap: false
  });
  formPassword.value = '';
  store.showToast('Aucun agenda n\'est configuré');
}

async function toggleAutoShare() {
  const nextVal = !store.calendarConfig.autoShareRoadmap;
  await store.setCalendarConfig({ autoShareRoadmap: nextVal });
  store.showToast(
    nextVal
      ? 'Partage automatique de la roadmap activé'
      : 'Partage automatique de la roadmap désactivé'
  );
}

async function saveHours() {
  await store.setCalendarConfig({
    startHour: formStartHour.value || '08:00',
    endHour: formEndHour.value || '08:00'
  });
  savedFeedback.value = 'Horaires mis à jour ✓';
  setTimeout(() => {
    savedFeedback.value = '';
  }, 2500);
}
</script>

<style scoped>
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.calendar-status-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.status-unconfigured {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.status-connected {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.status-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.status-info {
  flex: 1;
}

.status-info strong {
  display: block;
  font-size: 0.96rem;
  margin-bottom: 2px;
}

.status-info p {
  margin: 0;
  font-size: 0.84rem;
  opacity: 0.92;
}

.protocol-pill {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 5px;
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

/* Carte unique de connexion */
.connect-calendar-card,
.connected-options-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px;
}

.protocol-selector-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-section-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #1e293b;
}

.protocol-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.protocol-choice-card {
  border: 2px solid #cbd5e1;
  border-radius: 10px;
  padding: 12px 14px;
  background: #f8fafc;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;
}

.protocol-choice-card:hover {
  border-color: #64748b;
  background: #f1f5f9;
}

.protocol-choice-card.is-selected {
  border-color: #0284c7;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.14);
}

.choice-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.radio-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #94a3b8;
  background: #ffffff;
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

.choice-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.active-check-badge {
  margin-left: auto;
  background: #0284c7;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}

.choice-sub {
  margin: 0;
  font-size: 0.78rem;
  color: #475569;
  line-height: 1.35;
  padding-left: 26px;
}

/* Bandeau d'astuce contextuelle */
.context-tip-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  color: #0c4a6e;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.82rem;
  line-height: 1.45;
}

.tip-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.tip-text {
  flex: 1;
}

/* Raccourcis serveurs OVH */
.ovh-presets-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.preset-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: #475569;
}

.ovh-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 0.76rem;
  font-family: monospace;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid #94a3b8;
  background: #f1f5f9;
  color: #0f172a;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;
}

.ovh-chip:hover {
  background: #e0f2fe;
  border-color: #0284c7;
  color: #0369a1;
}

.ovh-chip.is-active {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}

.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.debug-trace-box {
  background: #ffffff;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.78rem;
  color: #334155;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debug-trace-row {
  font-family: monospace;
  font-size: 0.75rem;
  color: #1e293b;
}

.hours-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.submit-connect-btn {
  width: 100%;
  justify-content: center;
  padding: 11px 16px;
  font-size: 0.92rem;
  font-weight: 600;
}

.section-heading {
  font-size: 1.02rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.settings-desc {
  font-size: 0.85rem;
  color: #475569;
  margin: 0;
  line-height: 1.45;
}

.preview-reminders-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}

.preview-reminder-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.84rem;
}

.preview-tag {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

.tag-start {
  background: #dbeafe;
  color: #1e40af;
}

.tag-end {
  background: #fef3c7;
  color: #92400e;
}

.auto-share-action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 16px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
}

.auto-share-action-card.is-active {
  background: #f0f9ff;
  border-color: #7dd3fc;
}

.auto-share-text {
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-share-text strong {
  font-size: 0.94rem;
  color: #0f172a;
}

.auto-share-text span {
  font-size: 0.84rem;
  color: #475569;
}

.hours-update-box {
  border-top: 1px solid #e2e8f0;
  padding-top: 14px;
}

.hours-update-box h4 {
  font-size: 0.9rem;
  margin: 0 0 10px 0;
  color: #1e293b;
}

.saved-pill {
  margin-top: 8px;
  display: inline-block;
  font-size: 0.8rem;
  color: #15803d;
  background: #dcfce7;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
}

.target-calendar-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.target-cal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.target-calendar-select {
  width: 100%;
  padding: 9px 12px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #0f172a;
  background: #f8fafc;
  border: 2px solid #0284c7;
  border-radius: 8px;
  cursor: pointer;
}

.shared-mailbox-row {
  margin-top: 2px;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #0284c7;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}

.link-btn:hover {
  text-decoration: underline;
}

.shared-input-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.shared-input-group input {
  flex: 1;
  min-width: 240px;
  padding: 7px 10px;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.section-divider {
  border-top: 1px solid #e2e8f0;
  margin: 4px 0;
}
</style>
