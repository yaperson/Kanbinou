<template>
  <div class="roadmap-view-container">
    <!-- Barre d'outils Roadmap -->
    <div class="roadmap-toolbar">
      <div class="month-navigator">
        <button class="btn btn-sm" @click="changeMonth(-1)" title="Mois précédent">◀</button>
        <span class="current-month-label">{{ currentMonthLabel }}</span>
        <button class="btn btn-sm" @click="changeMonth(1)" title="Mois suivant">▶</button>
        <button class="btn btn-sm" @click="resetToCurrentMonth">Aujourd'hui</button>
      </div>

      <!-- Filtre fauteuils avec essais & Légende -->
      <div class="toolbar-right-group">
        <label class="toggle-filter-label" title="Masquer les fauteuils sans essai sur ce mois">
          <input 
            type="checkbox" 
            v-model="filterOnlyWithAllocations" 
          />
          <span>Avec essai uniquement ({{ displayedResources.length }}/{{ store.resources.length }})</span>
        </label>

        <div class="roadmap-legend">
          <div class="legend-item">
            <span class="legend-color color-normal"></span>
            <span>Réservation confirmée</span>
          </div>
          <div class="legend-item">
            <span class="legend-color color-conflict"></span>
            <span>Conflit</span>
          </div>
          <div class="legend-item" v-if="isCurrentMonthActive">
            <span class="legend-color color-today"></span>
            <span>Aujourd'hui</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Grille de la Roadmap -->
    <div class="roadmap-scroll-wrapper" ref="scrollWrapper">
      <div class="roadmap-grid">
        <!-- Ligne verticale marquant la journée d'aujourd'hui -->
        <div 
          v-if="todayLineOffset !== null" 
          class="today-indicator-line" 
          :style="{ left: todayLineOffset + 'px' }"
          title="Aujourd'hui"
        >
          <div class="today-marker-badge">Aujourd'hui</div>
        </div>

        <!-- Ligne d'en-tête (Jours du mois) -->
        <div class="roadmap-header-row">
          <div class="resource-header-cell">
            {{ store.terminology.resourceSingular }}
          </div>
          <div class="days-header">
            <div 
              v-for="day in daysInMonth" 
              :key="day.dayNumber" 
              class="day-cell"
              :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
              :title="day.isToday ? 'Aujourd\'hui' : ''"
            >
              <div class="day-number">{{ day.dayNumber }}</div>
              <div class="day-letter">{{ day.dayLetter }}</div>
            </div>
          </div>
        </div>

        <!-- Lignes par Ressource (filtrées par défaut sur celles avec essais) -->
        <div 
          v-for="resource in displayedResources" 
          :key="resource.id" 
          class="roadmap-resource-row"
        >
          <div class="resource-name-cell" :title="resource.name">
            {{ resource.name }}
            <span class="resource-sub">{{ resource.category }}</span>
          </div>

          <div class="resource-timeline-track">
            <!-- Arrière-plan des jours -->
            <div 
              v-for="day in daysInMonth" 
              :key="'track-' + day.dayNumber"
              class="track-day-bg"
              :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
            ></div>

            <!-- Barres de réservation / Essais -->
            <div 
              v-for="alloc in getResourceAllocations(resource.id)" 
              :key="alloc.id"
              class="allocation-bar"
              :class="{ 'has-conflict': isConflicting(alloc.id) }"
              :style="getAllocationStyle(alloc)"
              :title="`${alloc.label} (${alloc.userName}) : du ${alloc.startDate} au ${alloc.endDate}`"
              @click="onAllocationClick(alloc)"
            >
              <span class="bar-user-badge">👤 {{ alloc.userName }}</span>
              <span>{{ alloc.label }}</span>
            </div>
          </div>
        </div>

        <!-- Message si aucune ressource enregistrée -->
        <div v-if="store.resources.length === 0" class="roadmap-empty-state">
          Aucune ressource enregistrée. Cliquez sur <strong>"{{ store.terminology.resourcePlural }}"</strong> dans la barre supérieure pour en ajouter.
        </div>

        <!-- Message si aucun fauteuil avec essai sur ce mois -->
        <div v-else-if="displayedResources.length === 0" class="roadmap-empty-state">
          <p>Aucun fauteuil avec essai programmé sur <strong>{{ currentMonthLabel }}</strong>.</p>
          <button class="btn btn-sm btn-outline" @click="filterOnlyWithAllocations = false">
            Afficher tous les {{ store.terminology.resourcePlural.toLowerCase() }} du parc ({{ store.resources.length }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useAppStore } from '../stores/app.js';

const store = useAppStore();

const currentDate = ref(new Date());
const scrollWrapper = ref(null);

// Filtre actif par défaut : enlever les fauteuils sans essai sur la période
const filterOnlyWithAllocations = ref(true);

const currentMonthLabel = computed(() => {
  return currentDate.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
});

// Vérifie si le mois affiché correspond au mois en cours
const isCurrentMonthActive = computed(() => {
  const now = new Date();
  return (
    currentDate.value.getFullYear() === now.getFullYear() &&
    currentDate.value.getMonth() === now.getMonth()
  );
});

// Position X (en pixels) de la ligne indicatrice d'aujourd'hui
const todayLineOffset = computed(() => {
  if (!isCurrentMonthActive.value) return null;
  const now = new Date();
  const dayIndex = now.getDate() - 1;
  const headerWidth = 180;
  const cellWidth = 36;
  // Placé exactement au milieu de la colonne du jour
  return headerWidth + (dayIndex * cellWidth) + (cellWidth / 2);
});

const daysInMonth = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const days = [];
  const dayLetters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  for (let i = 1; i <= totalDays; i++) {
    const d = new Date(year, month, i);
    const dayOfWeek = d.getDay();
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === i;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    days.push({
      dayNumber: i,
      dayLetter: dayLetters[dayOfWeek],
      isToday,
      isWeekend,
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    });
  }

  return days;
});

// Ressources affichées (filtrées par présence d'essais sur la période si activé)
const displayedResources = computed(() => {
  if (!filterOnlyWithAllocations.value) {
    return store.resources;
  }
  return store.resources.filter(resource => {
    return getResourceAllocations(resource.id).length > 0;
  });
});

function changeMonth(delta) {
  const newDate = new Date(currentDate.value);
  newDate.setMonth(newDate.getMonth() + delta);
  currentDate.value = newDate;
  nextTick(() => {
    scrollToToday();
  });
}

function resetToCurrentMonth() {
  currentDate.value = new Date();
  nextTick(() => {
    scrollToToday();
  });
}

function scrollToToday() {
  if (isCurrentMonthActive.value && scrollWrapper.value) {
    const now = new Date();
    const targetX = 180 + ((now.getDate() - 1) * 36) - 150;
    scrollWrapper.value.scrollTo({ left: Math.max(0, targetX), behavior: 'smooth' });
  }
}

onMounted(() => {
  nextTick(() => {
    scrollToToday();
  });
});

function getResourceAllocations(resourceId) {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

  return store.allocations.filter(alloc => {
    if (alloc.resourceId !== resourceId) return false;
    const s = new Date(alloc.startDate);
    const e = new Date(alloc.endDate);
    return s <= monthEnd && e >= monthStart;
  });
}

function getAllocationStyle(alloc) {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const monthStart = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();

  const start = new Date(alloc.startDate);
  const end = new Date(alloc.endDate);

  const startDay = Math.max(1, Math.floor((start - monthStart) / (1000 * 60 * 60 * 24)) + 1);
  const endDay = Math.min(totalDays, Math.floor((end - monthStart) / (1000 * 60 * 60 * 24)) + 1);

  const startIndex = startDay - 1;
  const duration = Math.max(1, endDay - startDay + 1);

  const cellWidth = 36;
  const left = startIndex * cellWidth;
  const width = (duration * cellWidth) - 4;

  return {
    left: `${left}px`,
    width: `${width}px`
  };
}

function isConflicting(allocationId) {
  return store.conflictingAllocations.has(allocationId);
}

function onAllocationClick(alloc) {
  if (alloc.taskId) {
    store.openTaskModal(alloc.taskId);
  }
}
</script>
