# 🚀 Guide de Déploiement Kanbinou

Kanbinou est conçu selon une architecture **souveraine, ultra-légère et sans dépendance externe lourde**. Il peut être déployé en quelques minutes selon deux méthodes principales :

---

## Option 1 : Déploiement Conteneurisé (Docker / NAS Synology / VPS / Serveur d'agence)

Cette méthode est recommandée pour les entreprises disposant d'un NAS (Synology, QNAP) ou d'un petit serveur dédié en local / hébergé.

### 1. Prérequis
* Docker & Docker Compose installés sur la machine.

### 2. Démarrage instantané
À la racine du projet, lancez :
```bash
docker compose up -d --build
```

### 3. Fonctionnement & Données
* L'application est immédiatement accessible sur `http://<IP_DU_SERVEUR>:3000`.
* **Persistance des données** : Toutes les données (`kanbinou.sqlite` et le secret JWT `.jwt_secret`) sont automatiquement stockées dans le dossier local `./data/`.
* **Mises à jour sans perte de données** : Pour mettre à jour Kanbinou, il suffit de relancer la commande. Votre volume `./data/` reste intact.

---

## Option 2 : Hébergement Mutualisé (OVH, o2switch, cPanel)

Pour un déploiement sur un hébergement web classique (sans Docker), Kanbinou intègre une **API PHP souveraine native** utilisant SQLite avec protection Apache stricte.

### Méthode A : Déploiement 100% Automatique via GitHub Actions (CI/CD)

Chaque fois que vous poussez du code sur la branche `main`, le pipeline GitHub compile le projet et le déploie automatiquement sur votre FTP sans jamais écraser vos données existantes.

#### Configuration des Secrets GitHub :
Rendez-vous sur votre dépôt GitHub dans **Settings > Secrets and variables > Actions** et ajoutez :
* `FTP_SERVER` : L'adresse de votre hôte FTP (ex : `ftp.cluster030.hosting.ovh.net`).
* `FTP_USERNAME` : Votre identifiant de connexion FTP (ex : `votrelogin-ovh`).
* `FTP_PASSWORD` : Votre mot de passe FTP.
* `FTP_REMOTE_DIR` *(optionnel)* : Le répertoire distant (par défaut `www/`, ou `www/kanbinou/` si sous-dossier).

> 🛡️ **Sécurité garantie par la CI/CD :** Le script de déploiement exclut expressément le fichier `api/data/.ht_kanbinou.sqlite`. Votre base de données de production n'est **JAMAIS** écrasée lors des mises à jour.

---

### Méthode B : Déploiement Manuel par FTP (FileZilla)

1. **Compilation locale** :
   ```bash
   npm run build:ovh
   ```
   Cette commande crée un dossier prêt à l'emploi `kanbinou/` contenant le front-end et l'API PHP.
2. **Transfert FTP** :
   * Connectez-vous avec FileZilla à votre hébergement.
   * Déposez le contenu du dossier `dist/` dans `www/`.
   * Déposez le dossier `api/` dans `www/api/`.
3. **Téléchargement direct du ZIP depuis GitHub** :
   * Rendez-vous dans l'onglet **Actions** de votre dépôt GitHub.
   * Cliquez sur le dernier commit de la branche `main`.
   * Téléchargez l'artefact **`kanbinou-mutualise-package`** (contient l'archive ZIP prête à dézipper sur votre serveur).

---

## 🔑 Compte Administrateur Initial
Lors de la première utilisation sur une base vierge :
* **Identifiant** : `admin`
* **Mot de passe** : `admin`

*(À modifier immédiatement depuis l'interface après la première connexion).*
