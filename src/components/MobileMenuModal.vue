<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal-card mobile-menu-sheet">
      <!-- En-tête -->
      <div class="modal-header">
        <h3>Menu & Options</h3>
        <button class="close-btn" @click="close">&times;</button>
      </div>

      <!-- Corps du menu -->
      <div class="modal-body menu-sheet-body">
        <!-- 1. Fiche Compte & Synchronisation Cloud -->
        <div class="menu-tile menu-tile-account" @click="openModal('sync')">
          <div class="tile-icon-badge" :class="store.user ? 'badge-user' : 'badge-guest'">
            {{ store.user ? '👤' : '☁️' }}
          </div>
          <div class="tile-content">
            <div class="tile-title">
              {{ store.user ? (store.user.displayName || store.user.username) : 'Mode Local (Hors-ligne)' }}
            </div>
            <div class="tile-subtitle">
              <span class="status-dot" :class="store.isOnline ? 'is-online' : 'is-offline'"></span>
              {{ store.user ? (store.isOnline ? 'Synchronisé au Cloud' : 'En attente réseau') : 'Se connecter pour synchroniser' }}
            </div>
          </div>
          <div class="tile-arrow">›</div>
        </div>

        <!-- 2. Actions Rapides -->
        <div class="menu-section-group">
          <button class="menu-action-row" @click="openModal('export')">
            <span class="action-icon">💾</span>
            <div class="action-text">
              <strong>Sauvegarde & CSV</strong>
              <span>Exporter ou importer votre base de données</span>
            </div>
            <span class="action-arrow">›</span>
          </button>

          <button class="menu-action-row" @click="openModal('settings')">
            <span class="action-icon">⚙️</span>
            <div class="action-text">
              <strong>Paramètres & Affichage</strong>
              <span>Colonnes, catégories, modèle métier</span>
            </div>
            <span class="action-arrow">›</span>
          </button>

          <button class="menu-action-row" @click="openModal('resources')">
            <span class="action-icon">{{ store.terminology.resourceIcon || '🦼' }}</span>
            <div class="action-text">
              <strong>Parc de {{ store.terminology.resourcePlural }}</strong>
              <span>{{ store.resources.length }} {{ store.terminology.resourcePlural.toLowerCase() }} configurés</span>
            </div>
            <span class="action-arrow">›</span>
          </button>
        </div>

        <!-- 3. Statistiques & Infos PWA -->
        <div class="menu-info-card">
          <div class="info-row">
            <span>Total des tâches</span>
            <strong>{{ store.tasks.length }}</strong>
          </div>
          <div class="info-row">
            <span>État réseau</span>
            <strong :style="{ color: store.isOnline ? '#10b981' : '#f59e0b' }">
              {{ store.isOnline ? 'Connecté' : 'Hors-ligne' }}
            </strong>
          </div>
          <div class="info-row">
            <span>Application PWA</span>
            <span class="version-tag">Kanbinou v2.0 Native</span>
          </div>
        </div>
      </div>

      <!-- Pied de page -->
      <div class="modal-footer">
        <button class="btn btn-block" @click="close">Fermer</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAppStore } from '../stores/app.js';

const store = useAppStore();

function close() {
  store.closeModal();
}

function openModal(modalName) {
  store.activeModal = modalName;
}
</script>

<style scoped lang="scss">
.mobile-menu-sheet {
  max-width: 500px;
}

.menu-sheet-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.menu-tile-account {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover, &:active {
    background: #f1f5f9;
    border-color: #cbd5e1;
  }

  .tile-icon-badge {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;

    &.badge-user {
      background: #e0f2fe;
      color: #0284c7;
    }

    &.badge-guest {
      background: #f1f5f9;
      color: #64748b;
    }
  }

  .tile-content {
    flex: 1;
    min-width: 0;

    .tile-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tile-subtitle {
      font-size: 0.75rem;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;

        &.is-online {
          background-color: #10b981;
        }

        &.is-offline {
          background-color: #f59e0b;
        }
      }
    }
  }

  .tile-arrow {
    font-size: 1.3rem;
    color: #94a3b8;
    line-height: 1;
  }
}

.menu-section-group {
  display: flex;
  flex-direction: column;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;

  .menu-action-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: white;
    border: none;
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover, &:active {
      background: #f8fafc;
    }

    .action-icon {
      font-size: 1.25rem;
      line-height: 1;
      width: 28px;
      text-align: center;
      flex-shrink: 0;
    }

    .action-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      strong {
        font-size: 0.88rem;
        color: #1e293b;
      }

      span {
        font-size: 0.74rem;
        color: #64748b;
      }
    }

    .action-arrow {
      font-size: 1.2rem;
      color: #cbd5e1;
    }
  }
}

.menu-info-card {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: #64748b;

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;

    strong {
      color: #1e293b;
    }

    .version-tag {
      font-size: 0.72rem;
      background: #e2e8f0;
      padding: 1px 6px;
      border-radius: 4px;
      color: #475569;
    }
  }
}

.btn-block {
  width: 100%;
  justify-content: center;
}
</style>
