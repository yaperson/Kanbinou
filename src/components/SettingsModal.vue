<template>
  <div class="modal-backdrop" @click.self="store.closeModal()">
    <div class="modal-card modal-settings">
      <!-- En-tête simplifié -->
      <div class="modal-header">
        <div class="header-title-group">
          <h2>Paramètres</h2>
        </div>
        <button class="btn-close" @click="store.closeModal()" title="Fermer">✕</button>
      </div>

      <!-- 4 Onglets Clairs et Explicites -->
      <div class="settings-tabs-nav">
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'layout' }"
          @click="activeTab = 'layout'"
        >
          Disposition de l'écran
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'columns' }"
          @click="activeTab = 'columns'"
        >
          Mes Colonnes ({{ store.columns.length }})
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'categories' }"
          @click="activeTab = 'categories'"
        >
          Étiquettes & Couleurs
        </button>
        <button 
          class="tab-btn" 
          :class="{ 'is-active': activeTab === 'terminology' }"
          @click="activeTab = 'terminology'"
        >
          Mon Métier
        </button>
      </div>

      <div class="modal-body">
        <!-- ============================================================ -->
        <!-- ONGLET 1 : DISPOSITION DE L'ÉCRAN -->
        <!-- ============================================================ -->
        <div v-if="activeTab === 'layout'" class="tab-content">
          <!-- 1. Style d'affichage -->
          <div class="settings-section">
            <h3 class="section-heading">1. Comment organiser votre tableau ?</h3>
            <div class="layout-cards-grid">
              <!-- Choix 1 : 3 colonnes -->
              <div 
                class="layout-simple-card"
                :class="{ 'is-selected': store.layoutMode === 'nested3' }"
                @click="store.setLayoutMode('nested3')"
              >
                <div class="card-radio-row">
                  <span class="radio-indicator" :class="{ 'is-checked': store.layoutMode === 'nested3' }"></span>
                  <strong>Vue compacte (3 colonnes)</strong>
                  <span class="badge-recom">Recommandé</span>
                </div>
                <p class="card-desc">
                  Tout tient sur votre écran <strong>sans défilement vers la droite</strong>. Les étapes en cours sont regroupées au milieu.
                </p>
                <!-- Mini schéma visuel -->
                <div class="mini-preview-3col">
                  <div class="mini-box col-side">À faire</div>
                  <div class="mini-box col-center">
                    <span class="mini-sub sub-top">En cours</span>
                    <span class="mini-sub sub-bottom">En attente</span>
                  </div>
                  <div class="mini-box col-side">Terminé</div>
                </div>
              </div>

              <!-- Choix 2 : Colonnes indépendantes -->
              <div 
                class="layout-simple-card"
                :class="{ 'is-selected': store.layoutMode === 'flat4' }"
                @click="store.setLayoutMode('flat4')"
              >
                <div class="card-radio-row">
                  <span class="radio-indicator" :class="{ 'is-checked': store.layoutMode === 'flat4' }"></span>
                  <strong>Vue large (côte à côte)</strong>
                </div>
                <p class="card-desc">
                  Chaque étape est affichée dans sa propre colonne avec défilement horizontal vers la droite.
                </p>
                <!-- Mini schéma visuel -->
                <div class="mini-preview-flat">
                  <div class="mini-box">À faire</div>
                  <div class="mini-box">En cours</div>
                  <div class="mini-box">En attente</div>
                  <div class="mini-box">Terminé</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. Répartition précise des 3 zones (si mode 3 colonnes) -->
          <div v-if="store.layoutMode === 'nested3'" class="settings-section">
            <h3 class="section-heading">2. Répartition de vos étapes dans les 3 volets</h3>
            <p class="settings-desc">
              Personnalisez facilement quelle colonne ouvre le tableau à gauche, quelles étapes s'empilent au milieu, et quelle étape clôture vos projets à droite :
            </p>

            <div class="three-zones-grid">
              <!-- Volet 1 : Gauche -->
              <div class="zone-card">
                <div class="zone-card-header">
                  <span class="zone-badge">Volet Gauche</span>
                  <strong>Départ</strong>
                </div>
                <p class="zone-hint">L'étape où débutent vos nouvelles tâches :</p>
                <div class="zone-select-row">
                  <span class="zone-dot" :style="{ backgroundColor: getColColor(selectedLeftCol) }"></span>
                  <select v-model="selectedLeftCol" class="zone-select">
                    <option v-for="col in availableForLeft" :key="col.id" :value="col.id">
                      {{ col.title }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Volet 2 : Centre (Multi-étapes) -->
              <div class="zone-card zone-center-card">
                <div class="zone-card-header">
                  <span class="zone-badge badge-primary">Volet Central</span>
                  <strong>Étapes au milieu ({{ currentCenterIds.length }})</strong>
                </div>
                <p class="zone-hint">Ces étapes se partagent la hauteur pour gagner de la place en largeur :</p>
                
                <!-- Liste des sous-colonnes au centre -->
                <div class="stack-items-list">
                  <div 
                    v-for="(colId, idx) in currentCenterIds" 
                    :key="idx" 
                    class="stack-item-card"
                  >
                    <div class="stack-item-main">
                      <span class="stack-number">{{ idx + 1 }}</span>
                      <span class="stack-color-dot" :style="{ backgroundColor: getColColor(colId) }"></span>
                      <strong class="stack-name">{{ getColTitle(colId) }}</strong>
                    </div>

                    <div class="stack-item-options">
                      <!-- Option fond gris -->
                      <label class="toggle-gray-pill" title="Mettre un fond gris sur les cartes de cette étape pour les repérer rapidement">
                        <input 
                          type="checkbox" 
                          :checked="isGraySubcolumn(colId)" 
                          @change="toggleGraySubcolumn(colId, $event.target.checked)"
                        />
                        <span>Fond gris</span>
                      </label>

                      <!-- Flèches monter / descendre -->
                      <div class="stack-arrows">
                        <button 
                          type="button" 
                          class="btn-arrow" 
                          :disabled="idx === 0"
                          @click="moveCenterSlot(idx, -1)"
                          title="Monter cette étape"
                        >▲</button>
                        <button 
                          type="button" 
                          class="btn-arrow" 
                          :disabled="idx === currentCenterIds.length - 1"
                          @click="moveCenterSlot(idx, 1)"
                          title="Descendre cette étape"
                        >▼</button>
                      </div>

                      <!-- Retirer de la pile -->
                      <button 
                        v-if="currentCenterIds.length > 1"
                        type="button" 
                        class="btn-remove-from-stack" 
                        @click="removeCenterSubcolumn(idx)"
                        title="Retirer cette étape du milieu"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Ajouter une étape dans la pile du milieu -->
                <div v-if="availableForCenter.length > 0" class="add-to-stack-row">
                  <select v-model="selectedColToAdd" class="select-col-add">
                    <option value="" disabled>Choisir une colonne à empiler au milieu...</option>
                    <option v-for="col in availableForCenter" :key="col.id" :value="col.id">
                      {{ col.title }}
                    </option>
                  </select>
                  <button 
                    type="button" 
                    class="btn btn-primary btn-sm"
                    :disabled="!selectedColToAdd"
                    @click="submitAddCenterSubcolumn"
                  >
                    ＋ Empiler au milieu
                  </button>
                </div>

                <!-- Répartition de la hauteur au centre -->
                <div class="height-ratio-row">
                  <span class="height-label">Partage de la hauteur :</span>
                  <div class="segmented-pill-group">
                    <button 
                      type="button"
                      class="segmented-pill-btn"
                      :class="{ 'is-active': currentSplitRatio === 'equal' }"
                      @click="setCenterSplitRatio('equal')"
                    >
                      Hauteurs égales
                    </button>
                    <button 
                      type="button"
                      class="segmented-pill-btn"
                      :class="{ 'is-active': currentSplitRatio === 'auto' }"
                      @click="setCenterSplitRatio('auto')"
                    >
                      Selon le contenu
                    </button>
                  </div>
                </div>
              </div>

              <!-- Volet 3 : Droite -->
              <div class="zone-card">
                <div class="zone-card-header">
                  <span class="zone-badge">Volet Droit</span>
                  <strong>Clôture</strong>
                </div>
                <p class="zone-hint">L'étape où se valident ou se terminent vos tâches :</p>
                <div class="zone-select-row">
                  <span class="zone-dot" :style="{ backgroundColor: getColColor(selectedRightCol) }"></span>
                  <select v-model="selectedRightCol" class="zone-select">
                    <option v-for="col in availableForRight" :key="col.id" :value="col.id">
                      {{ col.title }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Aperçu Visuel Dynamique en Direct -->
          <div class="settings-section">
            <h3 class="section-heading">3. Aperçu en temps réel de votre tableau</h3>
            <p class="settings-desc">
              Voici à quoi ressemble votre écran avec vos réglages actuels :
            </p>

            <div class="live-board-preview-card">
              <div class="preview-board-mockup" :class="store.layoutMode === 'nested3' ? 'mode-3col' : 'mode-flat'">
                <template v-if="store.layoutMode === 'nested3'">
                  <!-- Colonne Gauche -->
                  <div class="mock-col mock-side">
                    <div class="mock-col-header" :style="{ borderTopColor: previewLeftCol.color }">
                      <span class="mock-dot" :style="{ backgroundColor: previewLeftCol.color }"></span>
                      <strong>{{ previewLeftCol.title }}</strong>
                    </div>
                    <div class="mock-task-postit">Tâche en attente de traitement</div>
                  </div>

                  <!-- Colonne Centre Imbriquée -->
                  <div class="mock-col mock-center">
                    <div 
                      v-for="c in previewCenterCols" 
                      :key="c.id" 
                      class="mock-sub-col"
                      :class="{ 'mock-sub-gray': isGraySubcolumn(c.id) }"
                    >
                      <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                        <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                        <strong>{{ c.title }}</strong>
                        <span v-if="isGraySubcolumn(c.id)" class="mock-badge-gray">Fond gris</span>
                      </div>
                      <div class="mock-task-postit" :class="{ 'postit-gray': isGraySubcolumn(c.id) }">
                        Tâche en cours
                      </div>
                    </div>
                  </div>

                  <!-- Colonne Droite -->
                  <div class="mock-col mock-side">
                    <div class="mock-col-header" :style="{ borderTopColor: previewRightCol.color }">
                      <span class="mock-dot" :style="{ backgroundColor: previewRightCol.color }"></span>
                      <strong>{{ previewRightCol.title }}</strong>
                    </div>
                    <div class="mock-task-postit">Tâche finalisée</div>
                  </div>

                  <!-- Colonnes supplémentaires s'il en reste -->
                  <div v-for="c in previewExtraCols" :key="c.id" class="mock-col mock-side">
                    <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                      <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                      <strong>{{ c.title }}</strong>
                    </div>
                    <div class="mock-task-postit">Tâche supplémentaire</div>
                  </div>
                </template>

                <template v-else>
                  <div v-for="c in store.columns" :key="c.id" class="mock-col">
                    <div class="mock-col-header" :style="{ borderTopColor: c.color }">
                      <span class="mock-dot" :style="{ backgroundColor: c.color }"></span>
                      <strong>{{ c.title }}</strong>
                    </div>
                    <div class="mock-task-postit">Tâche exemple</div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- ONGLET 2 : MES COLONNES (GESTION COMPLÈTE) -->
        <!-- ============================================================ -->
        <div v-if="activeTab === 'columns'" class="tab-content">
          <!-- 1. Formulaire de création -->
          <div class="settings-section">
            <h3 class="section-heading">1. Créer une nouvelle étape</h3>
            <p class="settings-desc">
              Ajoutez une nouvelle colonne pour suivre vos processus métiers (ex : Facturé, Contrôle qualité, SAV, Livraison...).
            </p>

            <form class="simple-add-row" @submit.prevent="submitAddColumn">
              <input 
                type="text" 
                v-model="newColumnTitle" 
                placeholder="Nom de la nouvelle étape (ex: Facturé, Contrôle...)" 
                class="simple-text-input"
                required
              />
              <input 
                type="color" 
                v-model="newColumnColor" 
                class="simple-color-picker" 
                title="Choisir une couleur"
              />
              <button type="submit" class="btn btn-primary btn-sm">
                ＋ Créer la colonne
              </button>
            </form>
          </div>

          <!-- 2. Liste de toutes les colonnes avec renommage, couleur et réorganisation -->
          <div class="settings-section">
            <h3 class="section-heading">2. Vos étapes et leur ordre d'apparition ({{ store.columns.length }})</h3>
            <p class="settings-desc">
              Vous pouvez <strong>renommer</strong> chaque colonne, changer sa <strong>couleur</strong> et modifier son <strong>ordre d'apparition</strong> dans le tableau avec les flèches ▲ et ▼ :
            </p>

            <div class="simple-columns-list">
              <div v-for="(col, idx) in store.columns" :key="col.id" class="simple-col-card">
                <!-- Numéro d'ordre -->
                <span class="col-rank-num" title="Position sur le tableau">{{ idx + 1 }}</span>

                <!-- Sélecteur couleur inline -->
                <input 
                  type="color" 
                  :value="col.color || '#64748b'"
                  @input="e => onLiveColumnColorInput(col, e.target.value)"
                  @change="e => onUpdateColumnColor(col, e.target.value)"
                  class="simple-color-picker mini"
                  title="Changer la couleur"
                />

                <!-- Nom de la colonne modifiable -->
                <input 
                  type="text" 
                  :value="col.title" 
                  @change="e => onUpdateColumnTitle(col, e.target.value)"
                  class="col-name-input"
                  title="Cliquez pour renommer cette étape"
                />

                <!-- Nombre de tâches en cours -->
                <span class="badge-task-count" title="Nombre de tâches actuellement dans cette colonne">
                  {{ getTaskCount(col.id) }} tâche{{ getTaskCount(col.id) > 1 ? 's' : '' }}
                </span>

                <!-- Flèches pour changer l'ordre des colonnes -->
                <div class="col-reorder-arrows">
                  <button 
                    type="button" 
                    class="btn-arrow" 
                    :disabled="idx === 0"
                    @click="moveColumn(idx, -1)"
                    title="Déplacer cette étape vers la gauche / plus haut"
                  >▲</button>
                  <button 
                    type="button" 
                    class="btn-arrow" 
                    :disabled="idx === store.columns.length - 1"
                    @click="moveColumn(idx, 1)"
                    title="Déplacer cette étape vers la droite / plus bas"
                  >▼</button>
                </div>

                <!-- Statut protégée ou suppression -->
                <span v-if="['todo', 'doing', 'waiting', 'done'].includes(col.id)" class="badge-default-col" title="Étape essentielle de base">
                  Essentielle
                </span>
                <button 
                  v-else
                  type="button" 
                  class="btn-delete-col" 
                  @click="confirmDeleteColumn(col)"
                  title="Supprimer cette colonne (les tâches basculeront vers 'À faire')"
                >
                  🗑️
                </button>
              </div>
            </div>

            <!-- Réinitialiser -->
            <div class="reset-footer-row">
              <button type="button" class="btn btn-outline btn-sm" @click="confirmResetColumns">
                Restaurer les 4 étapes d'origine (À faire, En cours, En attente, Terminé)
              </button>
              <span v-if="colMsg" class="success-msg">{{ colMsg }}</span>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- ONGLET 3 : ÉTIQUETTES & COULEURS -->
        <!-- ============================================================ -->
        <div v-if="activeTab === 'categories'" class="tab-content">
          <!-- 1. Ajouter une étiquette -->
          <div class="settings-section">
            <h3 class="section-heading">Créer une nouvelle étiquette</h3>
            <p class="settings-desc">
              Les étiquettes permettent de repérer vos tâches avec une pastille de couleur (ex : Commercial, SAV, Urgent...).
            </p>

            <form class="simple-add-tag-box" @submit.prevent="submitAddCategory">
              <div class="add-tag-inputs">
                <input 
                  type="text" 
                  v-model="newCatName" 
                  placeholder="Nom de l'étiquette (ex: Devis, Contrôle, Livraison...)" 
                  class="simple-text-input"
                  required
                />
                <input 
                  type="color" 
                  v-model="newCatColor" 
                  class="simple-color-picker" 
                  title="Choisir une couleur"
                />
                <button type="submit" class="btn btn-primary btn-sm">
                  ＋ Créer l'étiquette
                </button>
              </div>

              <!-- Palette de suggestions rapides -->
              <div class="palette-quick-row">
                <span class="palette-hint">Suggestions :</span>
                <div class="palette-bubbles">
                  <button 
                    v-for="c in quickPaletteColors" 
                    :key="c"
                    type="button"
                    class="palette-bubble"
                    :style="{ backgroundColor: c }"
                    @click="newCatColor = c"
                    :title="c"
                  ></button>
                </div>
              </div>

              <!-- Option simple pour réserver du matériel -->
              <label class="simple-checkbox-row">
                <input type="checkbox" v-model="newCatRoadmap" />
                <span>Permet de réserver un équipement sur le calendrier (Roadmap)</span>
              </label>
            </form>
          </div>

          <!-- 2. Vos étiquettes existantes -->
          <div class="settings-section">
            <h3 class="section-heading">Vos étiquettes existantes ({{ store.categories.length }})</h3>
            <p class="settings-desc">
              Cliquez sur une couleur pour la changer en direct, ou modifiez le nom.
            </p>

            <div class="tags-cards-list">
              <div v-for="cat in store.categories" :key="cat.id" class="tag-pro-card">
                <!-- Ligne supérieure : Aperçu badge + Champ nom + Actions -->
                <div class="tag-pro-top">
                  <div class="tag-badge-and-name">
                    <span class="tag-preview-badge" :style="{ backgroundColor: cat.color }">
                      {{ cat.name }}
                    </span>
                    <input 
                      type="text" 
                      :value="cat.name" 
                      @change="e => onUpdateCategoryName(cat, e.target.value)"
                      class="tag-input-name"
                      placeholder="Nom de l'étiquette..."
                      title="Modifier le nom de l'étiquette"
                    />
                  </div>

                  <div class="tag-top-actions">
                    <label 
                      class="tag-roadmap-pill" 
                      :title="cat.isRoadmapEligible ? 'Cette étiquette permet de réserver un équipement sur la Roadmap' : 'Non synchronisé sur la Roadmap'"
                    >
                      <input 
                        type="checkbox" 
                        :checked="cat.isRoadmapEligible"
                        @change="e => onUpdateCategoryRoadmap(cat, e.target.checked)"
                      />
                      <span>Roadmap</span>
                    </label>

                    <button 
                      v-if="cat.id !== 'neutre'"
                      type="button" 
                      class="btn-delete-tag" 
                      @click="confirmDeleteCategory(cat)"
                      title="Supprimer cette étiquette"
                    >
                      🗑️
                    </button>
                    <span v-else class="lock-hint" title="Étiquette de base essentielle">🔒</span>
                  </div>
                </div>

                <!-- Ligne inférieure : Palette de couleurs dédiée -->
                <div class="tag-pro-bottom">
                  <span class="tag-color-label">Couleur :</span>
                  
                  <div class="tag-color-picker-box">
                    <input 
                      type="color" 
                      :value="cat.color" 
                      @input="e => onLiveColorInput(cat, e.target.value)"
                      @change="e => onUpdateCategoryColor(cat, e.target.value)"
                      class="simple-color-picker mini"
                      title="Choisir une couleur sur-mesure"
                    />
                  </div>

                  <div class="tag-swatches-row">
                    <button 
                      v-for="swatch in quickPaletteColors" 
                      :key="swatch"
                      type="button"
                      class="palette-bubble mini"
                      :class="{ 'is-selected': cat.color?.toLowerCase() === swatch.toLowerCase() }"
                      :style="{ backgroundColor: swatch }"
                      @click="onUpdateCategoryColor(cat, swatch)"
                      :title="`Appliquer ${swatch}`"
                    ></button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Rétablir -->
            <div class="reset-footer-row">
              <button type="button" class="btn btn-outline btn-sm" @click="restoreDefaultColors">
                Rétablir les 5 étiquettes et couleurs historiques
              </button>
              <span v-if="catMsg" class="success-msg">{{ catMsg }}</span>
            </div>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- ONGLET 4 : MON MÉTIER -->
        <!-- ============================================================ -->
        <div v-if="activeTab === 'terminology'" class="tab-content">
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
      </div>

      <!-- Pied de page simple -->
      <div class="modal-footer">
        <button class="btn btn-primary" @click="store.closeModal()">
          Fermer
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAppStore } from '../stores/app.js';

const store = useAppStore();

const activeTab = ref(store.settingsTab || 'layout');
watch(() => store.settingsTab, (tab) => {
  if (tab) activeTab.value = tab;
});

// Messages de confirmation
const colMsg = ref('');
const catMsg = ref('');
const termSavedMsg = ref('');

// --- Colonnes ---
const newColumnTitle = ref('');
const newColumnColor = ref('#64748b');

async function submitAddColumn() {
  if (!newColumnTitle.value.trim()) return;
  await store.createColumn(newColumnTitle.value.trim(), newColumnColor.value);
  newColumnTitle.value = '';
  newColumnColor.value = '#64748b';
  colMsg.value = 'Nouvelle colonne ajoutée avec succès';
  setTimeout(() => { colMsg.value = ''; }, 3000);
}

async function onUpdateColumnTitle(col, title) {
  if (!title.trim() || title.trim() === col.title) return;
  await store.updateColumn(col.id, { title: title.trim() });
}

function onLiveColumnColorInput(col, color) {
  if (color) col.color = color;
}

async function onUpdateColumnColor(col, color) {
  if (!color) return;
  col.color = color;
  await store.updateColumn(col.id, { color });
}

async function confirmDeleteColumn(col) {
  if (confirm(`Supprimer la colonne "${col.title}" ?\nLes tâches présentes dans cette colonne seront déplacées vers "À faire".`)) {
    await store.deleteColumn(col.id);
  }
}

async function confirmResetColumns() {
  if (confirm('Restaurer les 4 colonnes fondamentales par défaut (À faire, En cours, En attente, Terminé) ?')) {
    await store.resetDefaultColumns();
    colMsg.value = 'Colonnes d\'origine restaurées';
    setTimeout(() => { colMsg.value = ''; }, 3000);
  }
}

// --- Tags & Catégories ---
const newCatName = ref('');
const newCatColor = ref('#c5e1a5');
const newCatRoadmap = ref(false);

const quickPaletteColors = [
  '#c5e1a5', '#ffcc80', '#ef9a9a', '#81d4fa', '#e0e0e0',
  '#f43f5e', '#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#3b82f6'
];

async function submitAddCategory() {
  if (!newCatName.value.trim()) return;
  await store.createCategory(newCatName.value.trim(), newCatColor.value, newCatRoadmap.value);
  newCatName.value = '';
  newCatColor.value = '#c5e1a5';
  newCatRoadmap.value = false;
  catMsg.value = 'Nouvelle étiquette créée avec succès';
  setTimeout(() => { catMsg.value = ''; }, 3000);
}

async function onUpdateCategoryName(cat, name) {
  if (!name.trim() || name.trim() === cat.name) return;
  await store.updateCategory(cat.id, { name: name.trim() });
}

function onLiveColorInput(cat, color) {
  if (color) cat.color = color;
}

async function onUpdateCategoryColor(cat, color) {
  if (!color) return;
  cat.color = color;
  await store.updateCategory(cat.id, { color });
}

async function onUpdateCategoryRoadmap(cat, isRoadmapEligible) {
  cat.isRoadmapEligible = isRoadmapEligible;
  await store.updateCategory(cat.id, { isRoadmapEligible, requiresResource: isRoadmapEligible });
}

async function confirmDeleteCategory(cat) {
  if (confirm(`Supprimer le tag "${cat.name}" ?\nLes tâches ayant ce tag seront réassignées à la catégorie "Neutre".`)) {
    await store.deleteCategory(cat.id);
  }
}

async function restoreDefaultColors() {
  await store.resetCategoryColors();
  catMsg.value = 'Couleurs et étiquettes d\'origine restaurées';
  setTimeout(() => { catMsg.value = ''; }, 3000);
}

// --- Presets Métiers ---
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

// --- Helpers pour l'Affinement de l'Imbrication Multi-colonnes (Exclusion mutuelle stricte) ---
const currentLeftIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.leftColumnIds) && store.nestedConfig.leftColumnIds.length > 0
    ? store.nestedConfig.leftColumnIds
    : [store.nestedConfig?.colLeftId || 'todo'];
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  return res.length > 0 ? res : [store.columns[0]?.id || 'todo'];
});

const currentCenterIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.centerColumnIds) && store.nestedConfig.centerColumnIds.length > 0
    ? store.nestedConfig.centerColumnIds
    : [store.nestedConfig?.colCenterTopId || 'doing', store.nestedConfig?.colCenterBottomId || 'waiting'];
  const leftSet = new Set(currentLeftIds.value);
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!leftSet.has(id) && !seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  if (res.length > 0) return res;
  const fallback = store.columns.find(c => !leftSet.has(c.id) && c.isVisible !== false);
  return fallback ? [fallback.id] : ['doing'];
});

const currentRightIds = computed(() => {
  const raw = Array.isArray(store.nestedConfig?.rightColumnIds) && store.nestedConfig.rightColumnIds.length > 0
    ? store.nestedConfig.rightColumnIds
    : [store.nestedConfig?.colRightId || 'done'];
  const usedSet = new Set([...currentLeftIds.value, ...currentCenterIds.value]);
  const seen = new Set();
  const res = [];
  for (const id of raw) {
    if (!usedSet.has(id) && !seen.has(id) && store.columns.some(c => c.id === id && c.isVisible !== false)) {
      seen.add(id);
      res.push(id);
    }
  }
  if (res.length > 0) return res;
  const fallback = store.columns.find(c => !usedSet.has(c.id) && c.isVisible !== false);
  return fallback ? [fallback.id] : ['done'];
});

function isSideNested(side) {
  if (side === 'left') return currentLeftIds.value.length > 1;
  if (side === 'right') return currentRightIds.value.length > 1;
  return false;
}

function toggleNestSide(side) {
  if (side === 'left') {
    if (currentLeftIds.value.length > 1) {
      store.setNestedConfig({ leftColumnIds: [currentLeftIds.value[0]] });
    } else {
      const candidate = store.columns.find(c => !currentLeftIds.value.includes(c.id) && !currentCenterIds.value.includes(c.id)) || store.columns[0];
      if (candidate) {
        store.setNestedConfig({ leftColumnIds: [...currentLeftIds.value, candidate.id] });
      }
    }
  } else if (side === 'right') {
    if (currentRightIds.value.length > 1) {
      store.setNestedConfig({ rightColumnIds: [currentRightIds.value[0]] });
    } else {
      const candidate = store.columns.find(c => !currentRightIds.value.includes(c.id) && !currentCenterIds.value.includes(c.id)) || store.columns[0];
      if (candidate) {
        store.setNestedConfig({ rightColumnIds: [...currentRightIds.value, candidate.id] });
      }
    }
  }
}

function updateSideSlot(side, index, value) {
  if (side === 'left') {
    const list = [...currentLeftIds.value];
    list[index] = value;
    store.setNestedConfig({ leftColumnIds: list });
  } else if (side === 'right') {
    const list = [...currentRightIds.value];
    list[index] = value;
    store.setNestedConfig({ rightColumnIds: list });
  }
}

function removeSideSlot(side, index) {
  if (side === 'left' && currentLeftIds.value.length > 1) {
    const list = currentLeftIds.value.filter((_, i) => i !== index);
    store.setNestedConfig({ leftColumnIds: list });
  } else if (side === 'right' && currentRightIds.value.length > 1) {
    const list = currentRightIds.value.filter((_, i) => i !== index);
    store.setNestedConfig({ rightColumnIds: list });
  }
}

function updateCenterSlot(index, value) {
  const list = [...currentCenterIds.value];
  list[index] = value;
  store.setNestedConfig({ centerColumnIds: list });
}

function addCenterSubcolumn() {
  const candidate = store.columns.find(c => !currentCenterIds.value.includes(c.id)) || store.columns[0];
  if (candidate) {
    const list = [...currentCenterIds.value, candidate.id];
    store.setNestedConfig({ centerColumnIds: list });
  }
}

function removeCenterSubcolumn(index) {
  if (currentCenterIds.value.length <= 1) return;
  const list = currentCenterIds.value.filter((_, i) => i !== index);
  store.setNestedConfig({ centerColumnIds: list });
}

function moveCenterSlot(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= currentCenterIds.value.length) return;
  const list = [...currentCenterIds.value];
  const temp = list[index];
  list[index] = list[target];
  list[target] = temp;
  store.setNestedConfig({ centerColumnIds: list });
}

function isGraySubcolumn(colId) {
  const list = store.nestedConfig?.graySubcolumnIds;
  if (Array.isArray(list)) {
    return list.includes(colId);
  }
  return colId === (store.nestedConfig?.colCenterBottomId || 'waiting');
}

function toggleGraySubcolumn(colId, checked) {
  let list = Array.isArray(store.nestedConfig?.graySubcolumnIds) 
    ? [...store.nestedConfig.graySubcolumnIds] 
    : [store.nestedConfig?.colCenterBottomId || 'waiting'];
  
  if (checked) {
    if (!list.includes(colId)) list.push(colId);
  } else {
    list = list.filter(id => id !== colId);
  }
  store.setNestedConfig({ graySubcolumnIds: list });
}

function getColTitle(id) {
  const col = store.columns.find(c => c.id === id);
  return col ? col.title : id;
}

function getColColor(id) {
  const col = store.columns.find(c => c.id === id);
  return col ? (col.color || '#0284c7') : '#94a3b8';
}

// --- Helpers pour l'Onglet Disposition & 3 Volets ---
const availableForLeft = computed(() => {
  return store.columns.filter(c => c.id !== selectedRightCol.value && c.isVisible !== false);
});

const availableForRight = computed(() => {
  return store.columns.filter(c => c.id !== selectedLeftCol.value && c.isVisible !== false);
});

const selectedLeftCol = computed({
  get() {
    return currentLeftIds.value[0] || 'todo';
  },
  set(val) {
    store.setNestedConfig({ leftColumnIds: [val], colLeftId: val });
  }
});

const selectedRightCol = computed({
  get() {
    return currentRightIds.value[0] || 'done';
  },
  set(val) {
    store.setNestedConfig({ rightColumnIds: [val], colRightId: val });
  }
});

const currentSplitRatio = computed(() => store.nestedConfig?.splitRatio || 'equal');

function setCenterSplitRatio(ratio) {
  store.setNestedConfig({ splitRatio: ratio });
}

const showCustomTerms = ref(false);
const selectedColToAdd = ref('');

const availableForCenter = computed(() => {
  return store.columns.filter(c => 
    !currentCenterIds.value.includes(c.id) &&
    c.id !== selectedLeftCol.value &&
    c.id !== selectedRightCol.value &&
    c.isVisible !== false
  );
});

function submitAddCenterSubcolumn() {
  if (!selectedColToAdd.value) return;
  const list = [...currentCenterIds.value, selectedColToAdd.value];
  store.setNestedConfig({ centerColumnIds: list });
  selectedColToAdd.value = '';
}

// --- Helpers pour l'Onglet Mes Colonnes ---
async function moveColumn(idx, delta) {
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= store.columns.length) return;
  const list = [...store.columns];
  const temp = list[idx];
  list[idx] = list[targetIdx];
  list[targetIdx] = temp;
  await store.reorderColumns(list);
}

function getTaskCount(colId) {
  return store.tasks.filter(t => t.columnId === colId).length;
}

// --- Helpers pour l'Aperçu en Temps Réel ---
const previewLeftCol = computed(() => {
  return store.columns.find(c => c.id === selectedLeftCol.value) || { id: 'todo', title: 'À faire', color: '#0284c7' };
});

const previewCenterCols = computed(() => {
  return currentCenterIds.value.map(id => {
    return store.columns.find(c => c.id === id) || { id, title: id, color: '#f59e0b' };
  });
});

const previewRightCol = computed(() => {
  return store.columns.find(c => c.id === selectedRightCol.value) || { id: 'done', title: 'Terminé', color: '#10b981' };
});

const previewExtraCols = computed(() => {
  const used = new Set([selectedLeftCol.value, ...currentCenterIds.value, selectedRightCol.value]);
  return store.columns.filter(c => !used.has(c.id) && c.isVisible !== false);
});
</script>

<style scoped>
.modal-settings {
  max-width: 860px;
  width: 95vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e2e8f0;
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

/* Onglets simplifiés avec scroll fluide et zéro coupure de texte */
.settings-tabs-nav {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid #e2e8f0;
  padding: 0 20px;
  background: #f8fafc;
  scrollbar-width: none;
}

.settings-tabs-nav::-webkit-scrollbar {
  display: none;
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

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
}

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

/* 1. Disposition Cartes */
.layout-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 16px;
}

.layout-simple-card {
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.layout-simple-card:hover {
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.layout-simple-card.is-selected {
  border-color: #0284c7;
  background: #f0f9ff;
  box-shadow: 0 0 0 1px #0284c7;
}

.card-radio-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.radio-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
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

.badge-recom {
  background: #dcfce7;
  color: #15803d;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-left: auto;
}

.card-desc {
  font-size: 0.84rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}

/* Mini diagrammes de prévisualisation */
.mini-preview-3col, .mini-preview-flat {
  display: flex;
  gap: 6px;
  height: 48px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px;
  margin-top: auto;
}

.mini-box {
  flex: 1;
  background: #e2e8f0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 600;
  text-align: center;
}

.col-center {
  flex: 1.3;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: transparent;
}

.mini-sub {
  flex: 1;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 600;
}

.sub-top {
  background: #e2e8f0;
  color: #475569;
}

.sub-bottom {
  background: #cbd5e1;
  color: #334155;
}

/* 2. Répartition des 3 zones (Volet gauche, centre, droite) */
.three-zones-grid {
  display: grid;
  grid-template-columns: 1fr 1.6fr 1fr;
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 720px) {
  .three-zones-grid {
    grid-template-columns: 1fr;
  }
}

.zone-card {
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.zone-card.zone-center-card {
  border-color: #bae6fd;
  background: #f8fafc;
}

.zone-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.zone-badge {
  font-size: 0.72rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  padding: 2px 8px;
  border-radius: 9999px;
}

.zone-badge.badge-primary {
  background: #e0f2fe;
  color: #0284c7;
}

.zone-hint {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0;
  line-height: 1.35;
}

.zone-select-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
}

.zone-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.zone-select {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.88rem;
  font-weight: 600;
  color: #1e293b;
  outline: none;
  cursor: pointer;
}

/* Pile centrale empilée */
.stack-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stack-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.stack-item-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stack-number {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stack-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.stack-name {
  font-size: 0.9rem;
  color: #1e293b;
}

.stack-item-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-gray-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #475569;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  user-select: none;
}

.toggle-gray-pill:hover {
  background: #e2e8f0;
}

.stack-arrows {
  display: flex;
  gap: 3px;
}

.btn-arrow {
  width: 26px;
  height: 26px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: white;
  color: #475569;
  cursor: pointer;
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-arrow:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-arrow:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-remove-from-stack {
  width: 26px;
  height: 26px;
  border: none;
  background: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 0.85rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove-from-stack:hover {
  background: #fee2e2;
  color: #dc2626;
}

.add-to-stack-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 4px;
}

.select-col-add {
  flex: 1;
  padding: 7px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
}

.height-ratio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed #cbd5e1;
  flex-wrap: wrap;
}

.height-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
}

.segmented-pill-group {
  display: flex;
  gap: 4px;
  background: #e2e8f0;
  padding: 3px;
  border-radius: 6px;
}

.segmented-pill-btn {
  border: none;
  background: none;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.segmented-pill-btn.is-active {
  background: #0284c7;
  color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 3. Aperçu en temps réel */
.live-board-preview-card {
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
  padding: 14px;
}

.preview-board-mockup {
  display: grid;
  gap: 12px;
  min-height: 140px;
}

.preview-board-mockup.mode-3col {
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
}

.preview-board-mockup.mode-flat {
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
}

.mock-col {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.mock-col.mock-center {
  gap: 8px;
  padding: 8px;
  background: #f8fafc;
  border-style: dashed;
}

.mock-sub-col {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mock-sub-col.mock-sub-gray {
  background: #f1f5f9;
}

.mock-col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: #1e293b;
  border-top: 3px solid #64748b;
  padding-top: 4px;
}

.mock-col-header strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
}

.mock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.mock-badge-gray {
  font-size: 0.65rem;
  background: #e2e8f0;
  color: #475569;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: auto;
}

.mock-task-postit {
  background: #fffae6;
  border: 1px solid #fef08a;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 0.72rem;
  color: #422006;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.mock-task-postit.postit-gray {
  background: #e2e8f0 !important;
  border-color: #cbd5e1 !important;
  color: #334155 !important;
}

/* Onglet 2 : Gestion des colonnes */
.simple-add-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.simple-text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.88rem;
  background: white;
}

.simple-text-input:focus {
  border-color: #0284c7;
  outline: none;
}

.simple-color-picker {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  cursor: pointer;
  background: white;
  flex-shrink: 0;
}

.simple-color-picker.mini {
  width: 26px;
  height: 26px;
  border-radius: 4px;
}

.simple-columns-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.simple-col-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
}

.col-rank-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.col-name-input {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1e293b;
  background: transparent;
}

.col-name-input:focus {
  border-color: #cbd5e1;
  background: #f8fafc;
  outline: none;
}

.badge-task-count {
  font-size: 0.74rem;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  padding: 3px 8px;
  white-space: nowrap;
}

.col-reorder-arrows {
  display: flex;
  gap: 3px;
}

.badge-default-col {
  font-size: 0.72rem;
  background: #f1f5f9;
  color: #64748b;
  padding: 3px 8px;
  border-radius: 9999px;
  border: 1px solid #e2e8f0;
}

.btn-delete-col {
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #64748b;
}

.btn-delete-col:hover {
  background: #fee2e2;
  color: #dc2626;
}

.reset-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
  flex-wrap: wrap;
  gap: 10px;
}

.btn-outline {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.82rem;
  cursor: pointer;
}

.btn-outline:hover {
  background: #f8fafc;
  border-color: #94a3b8;
}

/* Onglet 3 : Étiquettes & Couleurs */
.simple-add-tag-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 22px;
}

.add-tag-inputs {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.add-tag-inputs .simple-text-input {
  flex: 1;
  min-width: 220px;
}

.palette-quick-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.palette-hint {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
}

.palette-bubbles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.palette-bubble {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 0 0 1.5px #cbd5e1;
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  flex-shrink: 0;
}

.palette-bubble:hover {
  transform: scale(1.18);
  box-shadow: 0 0 0 2px #0284c7;
}

.palette-bubble.is-selected {
  box-shadow: 0 0 0 2.5px #0284c7;
  transform: scale(1.15);
}

.palette-bubble.mini {
  width: 20px;
  height: 20px;
}

.simple-checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: #334155;
  cursor: pointer;
  margin-top: 2px;
}

/* Liste des cartes d'étiquettes spacieuses et sans débordement */
.tags-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-pro-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.tag-pro-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.tag-pro-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tag-badge-and-name {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 240px;
}

.tag-preview-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.84rem;
  font-weight: 700;
  color: #1e293b;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background-color 0.15s ease;
}

.tag-input-name {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #1e293b;
  background: #f8fafc;
  transition: all 0.15s ease;
}

.tag-input-name:focus {
  border-color: #0284c7;
  background: white;
  outline: none;
  box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
}

.tag-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.tag-roadmap-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.tag-roadmap-pill:hover {
  background: #e2e8f0;
}

.tag-roadmap-pill input[type="checkbox"] {
  cursor: pointer;
}

.btn-delete-tag {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  opacity: 0.7;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-delete-tag:hover {
  opacity: 1;
  transform: scale(1.15);
  background: #fee2e2;
}

.tag-pro-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px dashed #f1f5f9;
  flex-wrap: wrap;
}

.tag-color-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  flex-shrink: 0;
}

.tag-color-picker-box {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tag-swatches-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.lock-hint {
  font-size: 0.85rem;
  opacity: 0.6;
}

/* Onglet 3 : Presets Métiers */
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

.success-msg {
  font-size: 0.82rem;
  color: #16a34a;
  font-weight: 600;
}

.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
}
</style>
