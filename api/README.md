# Kanbinou - API PHP Souveraine & Haute Sécurité pour OVH Mutualisé

Cette API permet de faire fonctionner la partie serveur de Kanbinou (authentification, ressources, réservations roadmap, configuration) directement sur votre **hébergement mutualisé OVH** (offres Perso, Pro, Performance), avec une **souveraineté des données à 100% en France** et un niveau de sécurité maximal.

---

## 🛡️ Architecture & Mesures de Sécurité Maximales

1. **Protection absolue des données (SQLite)** :
   - La base de données est stockée dans `api/data/.ht_kanbinou.sqlite`.
   - **Double verrouillage Apache** :
     - Tout fichier commençant par `.ht` est bloqué nativement par la configuration d'Apache OVH.
     - Un fichier `.htaccess` avec `Require all denied` à l'intérieur du dossier `data/` bloque toute tentative d'accès direct par URL (erreur 403 Forbidden immédiate).
2. **Authentification Cryptographique Forte** :
   - Mots de passe utilisateurs hachés avec **Bcrypt** (`cost = 12`) selon les recommandations de l'ANSSI.
   - Tokens signés par **HMAC-SHA256** (standard JWT RFC 7519) avec une clé secrète aléatoire de 256 bits générée cryptographiquement (`random_bytes(32)`) lors de la première installation.
3. **Protection Anti Brute-Force (Rate Limiting)** :
   - Limitation stricte à 5 tentatives de connexion consécutives infructueuses par adresse IP.
   - Au-delà, l'adresse IP est temporairement bloquée pendant 15 minutes (code HTTP 429).
4. **Zéro Injection SQL** :
   - 100% des requêtes vers SQLite utilisent les requêtes préparées **PDO** (`prepare()` / `execute()`).
5. **En-têtes de Sécurité HTTP Stricts** :
   - `X-Content-Type-Options: nosniff` (anti sniffing MIME).
   - `X-Frame-Options: SAMEORIGIN` (anti clickjacking).
   - `X-XSS-Protection: 1; mode=block`.
   - `Strict-Transport-Security` (HSTS) forcé en HTTPS.

---

## 🚀 Installation sur votre Hébergement OVH (en 2 minutes)

### Étape 1 : Préparer les fichiers
1. Sur votre ordinateur, compilez l'application web si ce n'est pas déjà fait :
   ```bash
   npm run build
   ```
2. Vous avez maintenant :
   - Le dossier **`dist/`** (l'interface web Vue.js).
   - Le dossier **`api/`** (l'API PHP souveraine).

### Étape 2 : Déposer sur le FTP OVH (avec FileZilla)
1. Ouvrez **FileZilla** et connectez-vous à votre hébergement OVH.
2. Ouvrez le dossier racine de votre site distant : **`www/`**.
3. **Déposez l'interface** :
   - Copiez l'ensemble du contenu du dossier **`dist/`** directement dans **`www/`**.
4. **Déposez l'API** :
   - Copiez l'intégralité du dossier **`api/`** dans **`www/`** (pour avoir le chemin `www/api/index.php`).

---

## 🔑 Compte Administrateur Initial

Lors de la première utilisation, un compte administrateur est automatiquement initialisé :
* **Identifiant** : `admin`
* **Mot de passe** : `admin`

> [!IMPORTANT]
> Une fois connecté, vous pouvez créer les comptes de vos collaborateurs et modifier vos identifiants via le panneau **Connexion Cloud**.

---

## 💾 Sauvegardes & Restauration chez OVH

* **Sauvegarde manuelle** : Pour faire une sauvegarde de votre base de données, il vous suffit de télécharger via FileZilla le fichier `www/api/data/.ht_kanbinou.sqlite`.
* **Sauvegarde automatique OVH** : Votre hébergement OVH réalise des instantanés automatiques quotidiens (J-1, J-2, J-7, J-14) accessibles directement depuis votre **Espace Client OVH > Hébergements > Sauvegardes / Restauration FTP**.
