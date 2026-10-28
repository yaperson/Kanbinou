<?php
// =============================================================================
// Kanbinou - API PHP Souveraine & Sécurisée pour Hébergement Mutualisé (OVH)
// Conçue pour une sécurité maximale (ANSSI / OWASP) & Zéro dépendance externe
// =============================================================================

// -----------------------------------------------------------------------------
// 1. EN-TÊTES DE SÉCURITÉ STRICTS (HTTP SECURITY HEADERS)
// -----------------------------------------------------------------------------
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');

// Forcer HTTPS (HSTS) si la requête arrive en SSL
if ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || 
    (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

// CORS : Autorise les requêtes de l'application cliente
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

// Gestion de la pré-vérification CORS (Preflight OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// -----------------------------------------------------------------------------
// 2. INITIALISATION DU DOSSIER DE DONNÉES SÉCURISÉ & BASE SQLITE
// -----------------------------------------------------------------------------
$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0750, true);
    // Verrouillage Apache strict à l'intérieur du dossier
    file_put_contents($dataDir . '/.htaccess', "Order Deny,Allow\nDeny from all\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n");
}

// Fichier SQLite protégé (commençant par .ht pour blocage natif Apache)
$dbFile = $dataDir . '/.ht_kanbinou.sqlite';
$secretFile = $dataDir . '/.ht_secret.key';

// Génération automatique d'une clé secrète cryptographique unique à l'installation
if (!file_exists($secretFile)) {
    $generatedSecret = bin2hex(random_bytes(32));
    file_put_contents($secretFile, $generatedSecret);
    chmod($secretFile, 0600);
}
$jwtSecret = trim(file_get_contents($secretFile));

try {
    $pdo = new PDO('sqlite:' . $dbFile, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);

    // Optimisations SQLite pour haute concurrence et intégrité
    $pdo->exec("PRAGMA journal_mode = WAL;");
    $pdo->exec("PRAGMA busy_timeout = 5000;");
    $pdo->exec("PRAGMA foreign_keys = ON;");

    // Création des tables
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            ip TEXT PRIMARY KEY,
            attempts INTEGER DEFAULT 0,
            last_attempt INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS resources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'Général',
            status TEXT DEFAULT 'available',
            attributes_json TEXT DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS allocations (
            id TEXT PRIMARY KEY,
            resource_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            label TEXT,
            task_ref TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#64748b',
            is_roadmap_eligible INTEGER DEFAULT 0,
            requires_resource INTEGER DEFAULT 0,
            order_idx INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS columns (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            color TEXT DEFAULT '#0284c7',
            order_idx INTEGER DEFAULT 0,
            is_visible INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            column_id TEXT NOT NULL,
            category_id TEXT DEFAULT 'neutre',
            resource_id TEXT,
            start_date TEXT,
            end_date TEXT,
            allocation_id TEXT,
            user_id TEXT,
            user_name TEXT,
            time REAL DEFAULT 0,
            projection REAL DEFAULT 0,
            is_sold INTEGER DEFAULT 0,
            description TEXT DEFAULT '',
            sensitive_json TEXT DEFAULT '{}',
            is_shared INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS workspace_config (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Données initiales si la base est neuve (colonnes, catégories, terminologie)
    $countCols = (int)$pdo->query("SELECT COUNT(*) FROM columns")->fetchColumn();
    if ($countCols === 0) {
        // Colonnes par défaut
        $colStmt = $pdo->prepare("INSERT OR IGNORE INTO columns (id, title, color, order_idx, is_visible) VALUES (?, ?, ?, ?, 1)");
        $colStmt->execute(['todo', 'À faire', '#0284c7', 1]);
        $colStmt->execute(['doing', 'En cours', '#f59e0b', 2]);
        $colStmt->execute(['waiting', 'En attente', '#8b5cf6', 3]);
        $colStmt->execute(['done', 'Terminé', '#10b981', 4]);

        // Catégories par défaut
        $catStmt = $pdo->prepare("INSERT OR IGNORE INTO categories (id, name, color, is_roadmap_eligible, requires_resource, order_idx) VALUES (?, ?, ?, ?, ?, ?)");
        $catStmt->execute(['commercial', 'Commercial', '#c5e1a5', 0, 0, 1]);
        $catStmt->execute(['essais', 'Essais', '#ffcc80', 1, 1, 2]);
        $catStmt->execute(['sav', 'SAV', '#ef9a9a', 0, 0, 3]);
        $catStmt->execute(['livraison', 'Livraison', '#81d4fa', 0, 0, 4]);
        $catStmt->execute(['neutre', 'Neutre', '#e0e0e0', 0, 0, 5]);

        // Terminologie par défaut
        $termStmt = $pdo->prepare("INSERT OR IGNORE INTO workspace_config (key, value_json) VALUES (?, ?)");
        $termStmt->execute(['terminology', json_encode([
            'resourceSingular' => 'Produit',
            'resourcePlural' => 'Produits',
            'eventSingular' => 'Essai',
            'eventPlural' => 'Essais'
        ])]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erreur initialisation base de données sécurisée']);
    exit;
}

// -----------------------------------------------------------------------------
// 3. FONCTIONS UTILITAIRES & SÉCURITÉ CRYPTOGRAPHIQUE (HMAC-SHA256)
// -----------------------------------------------------------------------------

function getClientIP(): string {
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// Protection anti Brute-Force (max 5 tentatives consécutives / 15 minutes) - DÉSACTIVÉ TEMPORAIREMENT POUR TESTS
function checkRateLimit(PDO $pdo, string $ip) {
    // TEMPORAIREMENT DÉSACTIVÉ POUR LES TESTS D'INTERFACE
    return;
    /*
    $now = time();
    $stmt = $pdo->prepare("SELECT attempts, last_attempt FROM login_attempts WHERE ip = ?");
    $stmt->execute([$ip]);
    $row = $stmt->fetch();

    if ($row) {
        if ($row['attempts'] >= 5 && ($now - $row['last_attempt']) < 900) {
            $remaining = 900 - ($now - $row['last_attempt']);
            http_response_code(429);
            echo json_encode(['error' => "Trop de tentatives infructueuses. Veuillez patienter $remaining secondes."]);
            exit;
        }
        if (($now - $row['last_attempt']) >= 900) {
            // Réinitialiser après 15 minutes
            $pdo->prepare("UPDATE login_attempts SET attempts = 0, last_attempt = ? WHERE ip = ?")->execute([$now, $ip]);
        }
    }
    */
}

function recordLoginFailed(PDO $pdo, string $ip) {
    $now = time();
    $stmt = $pdo->prepare("
        INSERT INTO login_attempts (ip, attempts, last_attempt) 
        VALUES (?, 1, ?) 
        ON CONFLICT(ip) DO UPDATE SET attempts = attempts + 1, last_attempt = excluded.last_attempt
    ");
    $stmt->execute([$ip, $now]);
}

function resetLoginAttempts(PDO $pdo, string $ip) {
    $pdo->prepare("DELETE FROM login_attempts WHERE ip = ?")->execute([$ip]);
}

function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/')) ?: '';
}

function createToken(array $payload, string $secret, int $durationSeconds = 7776000): string {
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload['iat'] = time();
    $payload['exp'] = time() + $durationSeconds; // Par défaut : 90 jours
    $payloadEncoded = base64UrlEncode(json_encode($payload));
    $signature = hash_hmac('sha256', "$header.$payloadEncoded", $secret, true);
    $signatureEncoded = base64UrlEncode($signature);
    return "$header.$payloadEncoded.$signatureEncoded";
}

function verifyToken(string $token, string $secret): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $payloadEncoded, $signatureEncoded] = $parts;

    $expectedSig = base64UrlEncode(hash_hmac('sha256', "$header.$payloadEncoded", $secret, true));
    if (!hash_equals($expectedSig, $signatureEncoded)) return null;

    $payload = json_decode(base64UrlDecode($payloadEncoded), true);
    if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) return null;

    return $payload;
}

function getAuthHeader(): string {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (!empty($headers['Authorization'])) return $headers['Authorization'];
        if (!empty($headers['authorization'])) return $headers['authorization'];
    }
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (!empty($headers['Authorization'])) return $headers['Authorization'];
        if (!empty($headers['authorization'])) return $headers['authorization'];
    }
    return '';
}

function authenticate(string $jwtSecret): array {
    $authHeader = getAuthHeader();
    if (!preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentification requise']);
        exit;
    }

    $user = verifyToken($matches[1], $jwtSecret);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Token invalide ou session expirée']);
        exit;
    }
    return $user;
}

function getJsonBody(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    if (strlen($raw) > 10 * 1024 * 1024) { // Limite 10 Mo
        http_response_code(413);
        echo json_encode(['error' => 'Charge utile trop volumineuse']);
        exit;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function uuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// -----------------------------------------------------------------------------
// 4. ROUTEUR REST SIMPLE & ROBUSTE
// -----------------------------------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'];
$pathInfo = $_SERVER['PATH_INFO'] ?? '';
if (!$pathInfo) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    // Supprimer le préfixe /api ou /api/index.php
    $pathInfo = preg_replace('#^.*?/api(?:/index\.php)?#', '', $uri);
}
$pathInfo = '/' . ltrim($pathInfo, '/');

// --- AUTHENTIFICATION ---
if ($method === 'POST' && $pathInfo === '/auth/login') {
    $clientIp = getClientIP();
    // checkRateLimit($pdo, $clientIp); // Temporairement désactivé pour les tests d'interface

    $body = getJsonBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $remember = !isset($body['remember']) || !empty($body['remember']);
    $tokenDuration = $remember ? (90 * 86400) : (1 * 86400); // 90 jours si persistant, 1 jour sinon

    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Identifiants requis']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        recordLoginFailed($pdo, $clientIp);
        http_response_code(401);
        echo json_encode(['error' => 'Identifiant ou mot de passe incorrect']);
        exit;
    }

    resetLoginAttempts($pdo, $clientIp);

    $payload = [
        'id' => $user['id'],
        'username' => $user['username'],
        'displayName' => $user['display_name'],
        'role' => $user['role']
    ];
    $token = createToken($payload, $jwtSecret, $tokenDuration);
    echo json_encode(['token' => $token, 'user' => $payload]);
    exit;
}

if ($method === 'GET' && $pathInfo === '/auth/status') {
    $countUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    echo json_encode(['initialized' => $countUsers > 0]);
    exit;
}

if ($method === 'POST' && $pathInfo === '/auth/register') {
    $countUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    $role = 'user';
    $isFirstUser = false;

    if ($countUsers === 0) {
        $role = 'admin';
        $isFirstUser = true;
    } else {
        $currentUser = authenticate($jwtSecret);
        if (($currentUser['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Seul un administrateur peut créer des comptes collaborateurs']);
            exit;
        }
        $body = getJsonBody();
        $role = (!empty($body['role']) && $body['role'] === 'admin') ? 'admin' : 'user';
    }

    $body = getJsonBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $displayName = trim($body['displayName'] ?? '');
    $remember = !isset($body['remember']) || !empty($body['remember']);
    $tokenDuration = $remember ? (90 * 86400) : (1 * 86400);

    if (!$username || !$password || !$displayName) {
        http_response_code(400);
        echo json_encode(['error' => 'Tous les champs sont requis']);
        exit;
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Cet identifiant existe déjà']);
        exit;
    }

    $id = 'usr-' . uuid();
    $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    $stmt = $pdo->prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$id, $username, $hash, $displayName, $role]);

    if ($isFirstUser) {
        $payload = ['id' => $id, 'username' => $username, 'displayName' => $displayName, 'role' => 'admin'];
        $token = createToken($payload, $jwtSecret, $tokenDuration);
        echo json_encode(['token' => $token, 'user' => $payload]);
        exit;
    }

    http_response_code(201);
    echo json_encode(['success' => true, 'message' => "Compte collaborateur $username créé avec succès."]);
    exit;
}

if ($method === 'GET' && $pathInfo === '/auth/me') {
    $user = authenticate($jwtSecret);
    // Rafraîchir / prolonger automatiquement la session (Sliding Session 90 jours)
    $refreshedToken = createToken([
        'id' => $user['id'],
        'username' => $user['username'],
        'displayName' => $user['displayName'],
        'role' => $user['role']
    ], $jwtSecret, 90 * 86400);
    echo json_encode(['user' => $user, 'token' => $refreshedToken]);
    exit;
}

// --- RESSOURCES ---
if ($pathInfo === '/resources') {
    $user = authenticate($jwtSecret);
    if ($method === 'GET') {
        $rows = $pdo->query("SELECT * FROM resources ORDER BY name ASC")->fetchAll();
        $res = array_map(function($r) {
            return [
                'id' => $r['id'],
                'name' => $r['name'],
                'category' => $r['category'],
                'status' => $r['status'],
                'attributes' => json_decode($r['attributes_json'] ?: '{}', true)
            ];
        }, $rows);
        echo json_encode($res);
        exit;
    }

    if ($method === 'POST') {
        $user = authenticate($jwtSecret);
        $body = getJsonBody();
        $items = (isset($body[0]) && is_array($body)) ? $body : [$body];

        $stmt = $pdo->prepare("
            INSERT INTO resources (id, name, category, status, attributes_json) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                name = excluded.name, 
                category = excluded.category, 
                status = excluded.status, 
                attributes_json = excluded.attributes_json, 
                updated_at = CURRENT_TIMESTAMP
        ");

        $pdo->beginTransaction();
        $saved = [];
        foreach ($items as $item) {
            if (!$item || !is_array($item)) continue;
            $id = $item['id'] ?? ('res-' . uuid());
            $name = trim($item['name'] ?? 'Sans nom');
            $cat = $item['category'] ?? 'Général';
            $status = $item['status'] ?? 'available';
            $attrs = json_encode($item['attributes'] ?? (object)[]);
            $stmt->execute([$id, $name, $cat, $status, $attrs]);
            $saved[] = ['id' => $id, 'name' => $name, 'category' => $cat, 'status' => $status];
        }
        $pdo->commit();

        http_response_code(201);
        echo json_encode(isset($body[0]) ? $saved : ($saved[0] ?? []));
        exit;
    }
}

if (preg_match('#^/resources/([^/]+)$#', $pathInfo, $m)) {
    authenticate($jwtSecret);
    $id = $m[1];

    if ($method === 'PUT') {
        $body = getJsonBody();
        $name = trim($body['name'] ?? '');
        $cat = $body['category'] ?? 'Général';
        $status = $body['status'] ?? 'available';
        $attrs = json_encode($body['attributes'] ?? (object)[]);

        $stmt = $pdo->prepare("UPDATE resources SET name = ?, category = ?, status = ?, attributes_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$name, $cat, $status, $attrs, $id]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare("DELETE FROM resources WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }
}

// --- ALLOCATIONS (ROADMAP) ---
if ($pathInfo === '/allocations') {
    $user = authenticate($jwtSecret);
    if ($method === 'GET') {
        $sql = "SELECT a.*, r.name as resource_name FROM allocations a LEFT JOIN resources r ON a.resource_id = r.id ORDER BY a.start_date ASC";
        $rows = $pdo->query($sql)->fetchAll();
        $res = array_map(function($a) {
            return [
                'id' => $a['id'],
                'resourceId' => $a['resource_id'],
                'resourceName' => $a['resource_name'],
                'userId' => $a['user_id'],
                'userName' => $a['user_name'],
                'startDate' => $a['start_date'],
                'endDate' => $a['end_date'],
                'label' => $a['label'],
                'taskRef' => $a['task_ref']
            ];
        }, $rows);
        echo json_encode($res);
        exit;
    }

    if ($method === 'POST') {
        $user = authenticate($jwtSecret);
        $body = getJsonBody();
        $items = (isset($body[0]) && is_array($body)) ? $body : [$body];

        $stmt = $pdo->prepare("
            INSERT INTO allocations (id, resource_id, user_id, user_name, start_date, end_date, label, task_ref) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                resource_id = excluded.resource_id,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                label = excluded.label,
                task_ref = excluded.task_ref,
                updated_at = CURRENT_TIMESTAMP
        ");

        $pdo->beginTransaction();
        $saved = [];
        foreach ($items as $item) {
            if (!$item || !is_array($item)) continue;
            $id = $item['id'] ?? ('alloc-' . uuid());
            $resourceId = $item['resourceId'] ?? '';
            $uId = $item['userId'] ?? $user['id'];
            $uName = $item['userName'] ?? $user['displayName'];
            $startDate = $item['startDate'] ?? '';
            $endDate = $item['endDate'] ?? '';
            $label = $item['label'] ?? 'Essai';
            $taskRef = $item['taskRef'] ?? null;

            $stmt->execute([$id, $resourceId, $uId, $uName, $startDate, $endDate, $label, $taskRef]);
            $saved[] = [
                'id' => $id,
                'resourceId' => $resourceId,
                'userId' => $uId,
                'userName' => $uName,
                'startDate' => $startDate,
                'endDate' => $endDate,
                'label' => $label,
                'taskRef' => $taskRef
            ];
        }
        $pdo->commit();

        http_response_code(201);
        echo json_encode(isset($body[0]) ? $saved : ($saved[0] ?? []));
        exit;
    }
}

if (preg_match('#^/allocations/([^/]+)(?:/delete)?$#', $pathInfo, $m)) {
    authenticate($jwtSecret);
    $id = $m[1];

    if ($method === 'PUT') {
        $body = getJsonBody();
        $stmt = $pdo->prepare("UPDATE allocations SET resource_id = ?, start_date = ?, end_date = ?, label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$body['resourceId'], $body['startDate'], $body['endDate'], $body['label'], $id]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE' || $method === 'POST') {
        $stmt = $pdo->prepare("DELETE FROM allocations WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }
}

// --- TÂCHES PARTAGÉES & ROADMAP ---
if ($pathInfo === '/tasks') {
    if ($method === 'GET') {
        $user = authenticate($jwtSecret);
        // Tâches de l'utilisateur ou associées à la roadmap
        $stmt = $pdo->prepare("
            SELECT * FROM tasks 
            WHERE (resource_id IS NOT NULL AND resource_id != '' AND start_date != '' AND end_date != '')
               OR user_id = ?
            ORDER BY created_at DESC
        ");
        $stmt->execute([$user['id']]);
        $rows = $stmt->fetchAll();
        $tasks = array_map(function($t) {
            return [
                'id' => $t['id'],
                'title' => $t['title'],
                'columnId' => $t['column_id'],
                'categoryId' => $t['category_id'],
                'resourceId' => $t['resource_id'],
                'startDate' => $t['start_date'],
                'endDate' => $t['end_date'],
                'allocationId' => $t['allocation_id'],
                'userId' => $t['user_id'],
                'userName' => $t['user_name'],
                'time' => (float)$t['time'],
                'projection' => (float)$t['projection'],
                'isSold' => (bool)$t['is_sold'],
                'description' => $t['description'] ?? '',
                'sensitive' => json_decode($t['sensitive_json'] ?: '{}', true),
                'isShared' => (bool)$t['is_shared'],
                'createdAt' => $t['created_at'],
                'updatedAt' => $t['updated_at']
            ];
        }, $rows);
        echo json_encode($tasks);
        exit;
    }

    if ($method === 'POST') {
        $user = authenticate($jwtSecret);
        $body = getJsonBody();
        $items = (isset($body[0]) && is_array($body)) ? $body : [$body];

        $stmt = $pdo->prepare("
            INSERT INTO tasks (
                id, title, column_id, category_id, resource_id, start_date, end_date,
                allocation_id, user_id, user_name, time, projection, is_sold,
                description, sensitive_json, is_shared, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                column_id = excluded.column_id,
                category_id = excluded.category_id,
                resource_id = excluded.resource_id,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                allocation_id = excluded.allocation_id,
                user_id = excluded.user_id,
                user_name = excluded.user_name,
                time = excluded.time,
                projection = excluded.projection,
                is_sold = excluded.is_sold,
                description = excluded.description,
                sensitive_json = excluded.sensitive_json,
                is_shared = excluded.is_shared,
                updated_at = excluded.updated_at
        ");

        $pdo->beginTransaction();
        $saved = [];
        foreach ($items as $item) {
            if (!$item || !is_array($item)) continue;
            $id = $item['id'] ?? ('task-' . uuid());
            $title = trim($item['title'] ?? 'Sans titre');
            $colId = $item['columnId'] ?? 'todo';
            $catId = $item['categoryId'] ?? 'neutre';
            $resId = $item['resourceId'] ?? null;
            $startDate = $item['startDate'] ?? '';
            $endDate = $item['endDate'] ?? '';
            $allocId = $item['allocationId'] ?? null;
            $uId = $item['userId'] ?? $user['id'];
            $uName = $item['userName'] ?? $user['displayName'];
            $time = (float)($item['time'] ?? 0);
            $proj = (float)($item['projection'] ?? 0);
            $isSold = !empty($item['isSold']) ? 1 : 0;
            $desc = $item['description'] ?? '';
            $sensitive = json_encode($item['sensitive'] ?? (object)[]);
            $isShared = !empty($item['isShared']) ? 1 : 0;
            $createdAt = $item['createdAt'] ?? date('Y-m-d H:i:s');
            $updatedAt = $item['updatedAt'] ?? date('Y-m-d H:i:s');

            $stmt->execute([
                $id, $title, $colId, $catId, $resId, $startDate, $endDate,
                $allocId, $uId, $uName, $time, $proj, $isSold,
                $desc, $sensitive, $isShared, $createdAt, $updatedAt
            ]);
            $saved[] = ['id' => $id, 'title' => $title];
        }
        $pdo->commit();

        http_response_code(201);
        echo json_encode(isset($body[0]) ? $saved : ($saved[0] ?? []));
        exit;
    }
}

if (preg_match('#^/tasks/([^/]+)(?:/delete)?$#', $pathInfo, $m)) {
    authenticate($jwtSecret);
    $id = $m[1];
    if ($method === 'DELETE' || $method === 'POST') {
        // Supprimer également l'allocation liée si elle existe
        $taskStmt = $pdo->prepare("SELECT allocation_id FROM tasks WHERE id = ?");
        $taskStmt->execute([$id]);
        $taskRow = $taskStmt->fetch();
        if ($taskRow && !empty($taskRow['allocation_id'])) {
            $pdo->prepare("DELETE FROM allocations WHERE id = ?")->execute([$taskRow['allocation_id']]);
        }
        $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }
}

// --- CONFIGURATION DE L'ESPACE ---
if ($pathInfo === '/config') {
    if ($method === 'GET') {
        $columns = $pdo->query("SELECT * FROM columns ORDER BY order_idx ASC")->fetchAll();
        $cols = array_map(function($c) {
            return [
                'id' => $c['id'],
                'title' => $c['title'],
                'color' => $c['color'],
                'order' => (int)$c['order_idx'],
                'isVisible' => (bool)$c['is_visible']
            ];
        }, $columns);

        $categories = $pdo->query("SELECT * FROM categories ORDER BY order_idx ASC")->fetchAll();
        $cats = array_map(function($c) {
            return [
                'id' => $c['id'],
                'name' => $c['name'],
                'color' => $c['color'],
                'isRoadmapEligible' => (bool)$c['is_roadmap_eligible'],
                'requiresResource' => (bool)$c['requires_resource'],
                'order' => (int)$c['order_idx']
            ];
        }, $categories);

        $termRow = $pdo->query("SELECT value_json FROM workspace_config WHERE key = 'terminology'")->fetch();
        $terminology = $termRow ? json_decode($termRow['value_json'], true) : (object)[];

        $layoutRow = $pdo->query("SELECT value_json FROM workspace_config WHERE key = 'layoutMode'")->fetch();
        $layoutMode = $layoutRow ? json_decode($layoutRow['value_json'], true) : 'nested3';

        $nestedRow = $pdo->query("SELECT value_json FROM workspace_config WHERE key = 'nestedConfig'")->fetch();
        $nestedConfig = $nestedRow ? json_decode($nestedRow['value_json'], true) : null;

        echo json_encode([
            'columns' => $cols,
            'categories' => $cats,
            'terminology' => $terminology,
            'layoutMode' => $layoutMode,
            'nestedConfig' => $nestedConfig
        ]);
        exit;
    }

    if ($method === 'POST') {
        $user = authenticate($jwtSecret);
        if (($user['role'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Seul un administrateur peut modifier la configuration globale des catégories et colonnes']);
            exit;
        }
        $body = getJsonBody();

        if (isset($body['terminology'])) {
            $stmt = $pdo->prepare("INSERT INTO workspace_config (key, value_json) VALUES ('terminology', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json");
            $stmt->execute([json_encode($body['terminology'])]);
        }
        if (isset($body['layoutMode'])) {
            $stmt = $pdo->prepare("INSERT INTO workspace_config (key, value_json) VALUES ('layoutMode', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json");
            $stmt->execute([json_encode($body['layoutMode'])]);
        }
        if (isset($body['nestedConfig'])) {
            $stmt = $pdo->prepare("INSERT INTO workspace_config (key, value_json) VALUES ('nestedConfig', ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json");
            $stmt->execute([json_encode($body['nestedConfig'])]);
        }
        if (isset($body['columns']) && is_array($body['columns'])) {
            $pdo->exec("DELETE FROM columns");
            $stmt = $pdo->prepare("INSERT INTO columns (id, title, color, order_idx, is_visible) VALUES (?, ?, ?, ?, ?)");
            foreach ($body['columns'] as $c) {
                $stmt->execute([
                    $c['id'],
                    $c['title'],
                    $c['color'] ?? '#64748b',
                    $c['order'] ?? 1,
                    ($c['isVisible'] ?? true) ? 1 : 0
                ]);
            }
        }
        if (isset($body['categories']) && is_array($body['categories'])) {
            $pdo->exec("DELETE FROM categories");
            $stmt = $pdo->prepare("INSERT INTO categories (id, name, color, is_roadmap_eligible, requires_resource, order_idx) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($body['categories'] as $cat) {
                $stmt->execute([
                    $cat['id'],
                    $cat['name'],
                    $cat['color'] ?? '#e0e0e0',
                    !empty($cat['isRoadmapEligible']) ? 1 : 0,
                    !empty($cat['requiresResource']) ? 1 : 0,
                    $cat['order'] ?? 1
                ]);
            }
        }
        echo json_encode(['success' => true]);
        exit;
    }
}



// --- CONNEXION & SYNCHRONISATION AGENDA (CALDAV & SSL EXCHANGE) ---
function normalizeExchangeEwsUrl(string $rawUrl): string {
    if (!preg_match('/^https?:\/\//i', $rawUrl)) {
        $rawUrl = 'https://' . $rawUrl;
    }
    if (stripos($rawUrl, '.asmx') !== false) {
        return $rawUrl;
    }
    $parsed = parse_url($rawUrl);
    $scheme = $parsed['scheme'] ?? 'https';
    $host = $parsed['host'] ?? '';
    $port = isset($parsed['port']) ? ':' . $parsed['port'] : '';
    return $scheme . '://' . $host . $port . '/EWS/Exchange.asmx';
}

function buildCandidateEwsUrls(string $rawUrl): array {
    $primary = normalizeExchangeEwsUrl($rawUrl);
    $candidates = [$primary];

    if (stripos($primary, 'ovh.') !== false) {
        $ovhClusters = [
            'ex.mail.ovh.net',
            'ex2.mail.ovh.net',
            'ex3.mail.ovh.net',
            'ex4.mail.ovh.net',
            'ex5.mail.ovh.net',
            'mail.ovh.net',
            'pro1.mail.ovh.net',
            'pro2.mail.ovh.net',
            'pro3.mail.ovh.net'
        ];
        foreach ($ovhClusters as $host) {
            $url = 'https://' . $host . '/EWS/Exchange.asmx';
            if (!in_array($url, $candidates, true)) {
                $candidates[] = $url;
            }
        }
    }
    return $candidates;
}

if ($pathInfo === '/calendar/test' && $method === 'POST') {
    $body = getJsonBody();
    $protocol = strtolower(trim($body['protocol'] ?? 'caldav'));
    $rawUrl = trim($body['url'] ?? '');
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if ($rawUrl === '' || $username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Veuillez renseigner l\'adresse du serveur, l\'identifiant et le mot de passe.']);
        exit;
    }

    // Détection automatique Exchange si l'URL contient mail.ovh.net, /owa ou .asmx
    if ($protocol === 'ssl' || stripos($rawUrl, 'Exchange.asmx') !== false || stripos($rawUrl, '/owa') !== false || stripos($rawUrl, 'mail.ovh.') !== false) {
        $candidateUrls = buildCandidateEwsUrls($rawUrl);
        $soapGetFolder = '<?xml version="1.0" encoding="utf-8"?>'
            . '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
            . 'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" '
            . 'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" '
            . 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
            . '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>'
            . '<soap:Body><m:GetFolder>'
            . '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>'
            . '<m:FolderIds><t:DistinguishedFolderId Id="calendar" /></m:FolderIds>'
            . '</m:GetFolder></soap:Body></soap:Envelope>';

        $debugAttempts = [];

        foreach ($candidateUrls as $candidateUrl) {
            $wwwAuthHeaders = [];
            $ch = curl_init($candidateUrl);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_USERPWD => $username . ':' . $password,
                CURLOPT_HTTPAUTH => CURLAUTH_ANY,
                CURLOPT_UNRESTRICTED_AUTH => true,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: text/xml; charset=utf-8',
                    'User-Agent: Kanbinou-ExchangeSSL/2.0',
                    'Expect:'
                ],
                CURLOPT_POSTFIELDS => $soapGetFolder,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 5,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HEADERFUNCTION => function($curl, $headerLine) use (&$wwwAuthHeaders) {
                    if (stripos($headerLine, 'WWW-Authenticate:') === 0) {
                        $wwwAuthHeaders[] = trim(substr($headerLine, 17));
                    }
                    return strlen($headerLine);
                }
            ]);

            $responseXml = curl_exec($ch);
            $curlErr = curl_error($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $candidateUrl;
            curl_close($ch);

            $hostLabel = parse_url($candidateUrl, PHP_URL_HOST) ?: $candidateUrl;
            $soapErrText = '';
            if (is_string($responseXml) && preg_match('/<(?:\w+:)?MessageText[^>]*>(.*?)<\/(?:\w+:)?MessageText>/is', $responseXml, $mErr)) {
                $soapErrText = trim($mErr[1]);
            }

            $debugAttempts[] = [
                'server' => $hostLabel,
                'url' => $candidateUrl,
                'effectiveUrl' => $effectiveUrl,
                'httpStatus' => $httpCode,
                'wwwAuthenticate' => count($wwwAuthHeaders) > 0 ? implode(', ', array_unique($wwwAuthHeaders)) : 'none',
                'soapError' => $soapErrText !== '' ? $soapErrText : null,
                'networkError' => $curlErr !== '' ? $curlErr : null
            ];

            if ($responseXml !== false && $httpCode >= 200 && $httpCode < 300 && stripos($responseXml, 'ResponseClass="Error"') === false) {
                $winningUrl = $effectiveUrl ?: $candidateUrl;
                $calendars = [];
                $seenIds = [];

                $addCalFolder = function(string $id, string $displayName) use (&$calendars, &$seenIds, $hostLabel, $winningUrl) {
                    if ($id === '' || isset($seenIds[$id])) return;
                    $seenIds[$id] = true;
                    $calendars[] = [
                        'id' => $id,
                        'name' => $displayName . ' (' . $hostLabel . ')',
                        'url' => $winningUrl
                    ];
                };

                $mainId = 'calendar';
                if (preg_match('/<(?:\w+:)?FolderId[^>]*\bId="([^"]+)"/i', $responseXml, $mId)) {
                    $mainId = $mId[1];
                }
                $mainName = 'Calendrier principal';
                if (preg_match('/<(?:\w+:)?DisplayName[^>]*>(.*?)<\/(?:\w+:)?DisplayName>/is', $responseXml, $dnMatch)) {
                    $cand = trim(html_entity_decode(strip_tags($dnMatch[1]), ENT_QUOTES | ENT_XML1, 'UTF-8'));
                    if ($cand !== '') $mainName = $cand;
                }
                $addCalFolder($mainId, $mainName);

                // Recherche de tous les autres calendriers du compte via FindFolder Deep
                $soapFindCalendars = '<?xml version="1.0" encoding="utf-8"?>'
                    . '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                    . 'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" '
                    . 'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" '
                    . 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
                    . '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>'
                    . '<soap:Body><m:FindFolder Traversal="Deep">'
                    . '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>'
                    . '<m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot" /></m:ParentFolderIds>'
                    . '</m:FindFolder></soap:Body></soap:Envelope>';

                $chFind = curl_init($winningUrl);
                curl_setopt_array($chFind, [
                    CURLOPT_POST => true,
                    CURLOPT_USERPWD => $username . ':' . $password,
                    CURLOPT_HTTPAUTH => CURLAUTH_ANY,
                    CURLOPT_UNRESTRICTED_AUTH => true,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: text/xml; charset=utf-8',
                        'User-Agent: Kanbinou-ExchangeSSL/2.0',
                        'Expect:'
                    ],
                    CURLOPT_POSTFIELDS => $soapFindCalendars,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_TIMEOUT => 8,
                    CURLOPT_SSL_VERIFYPEER => true
                ]);
                $findXml = curl_exec($chFind);
                $findCode = (int)curl_getinfo($chFind, CURLINFO_HTTP_CODE);
                curl_close($chFind);

                if (is_string($findXml) && $findCode >= 200 && $findCode < 300) {
                    if (preg_match_all('/<(?:\w+:)?CalendarFolder\b[^>]*>(.*?)<\/(?:\w+:)?CalendarFolder>/is', $findXml, $cfMatches)) {
                        foreach ($cfMatches[1] as $cfBlock) {
                            if (
                                preg_match('/<(?:\w+:)?FolderId[^>]*\bId="([^"]+)"/i', $cfBlock, $idM) &&
                                preg_match('/<(?:\w+:)?DisplayName[^>]*>(.*?)<\/(?:\w+:)?DisplayName>/is', $cfBlock, $dnM)
                            ) {
                                $dName = trim(html_entity_decode(strip_tags($dnM[1]), ENT_QUOTES | ENT_XML1, 'UTF-8'));
                                if ($dName !== '') {
                                    $addCalFolder($idM[1], $dName);
                                }
                            }
                        }
                    }
                }

                $firstCal = $calendars[0] ?? ['id' => 'calendar', 'name' => 'Calendrier (' . $hostLabel . ')', 'url' => $winningUrl];

                echo json_encode([
                    'success' => true,
                    'protocol' => 'ssl',
                    'calendarName' => $firstCal['name'],
                    'calendarUrl' => $winningUrl,
                    'folderId' => $firstCal['id'],
                    'calendars' => $calendars,
                    'debug' => $debugAttempts
                ]);
                exit;
            }
        }

        $testedList = implode(', ', array_map(function($d) {
            return $d['server'] . ' (HTTP ' . $d['httpStatus'] . ')';
        }, $debugAttempts));

        http_response_code(401);
        echo json_encode([
            'error' => 'Connexion Exchange refusée après test de : ' . $testedList . '. Vérifiez que cette boîte est bien une boîte Exchange (et non un mail standard MX Plan / Zimbra) et que le mot de passe est exact.',
            'debug' => $debugAttempts
        ]);
        exit;
    }

    // Mode CalDAV standard
    if (!preg_match('/^https?:\/\//i', $rawUrl)) {
        $rawUrl = 'https://' . $rawUrl;
    }
    $calUrl = rtrim($rawUrl, '/') . '/';

    $propfindXml = '<?xml version="1.0" encoding="utf-8" ?>'
        . '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">'
        . '<d:prop><d:displayname/><d:resourcetype/></d:prop>'
        . '</d:propfind>';

    $ch = curl_init($calUrl);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PROPFIND',
        CURLOPT_USERPWD => $username . ':' . $password,
        CURLOPT_HTTPAUTH => CURLAUTH_BASIC | CURLAUTH_DIGEST,
        CURLOPT_HTTPHEADER => [
            'Depth: 1',
            'Content-Type: application/xml; charset=utf-8',
            'User-Agent: Kanbinou-CalDAV/2.0'
        ],
        CURLOPT_POSTFIELDS => $propfindXml,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $responseXml = curl_exec($ch);
    $curlErr = curl_error($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $calUrl;
    curl_close($ch);

    if ($responseXml === false || $httpCode === 0) {
        http_response_code(502);
        echo json_encode(['error' => 'Serveur d\'agenda injoignable (' . ($curlErr ?: 'erreur réseau') . '). Vérifiez l\'URL CalDAV.']);
        exit;
    }

    if ($httpCode === 401 || $httpCode === 403) {
        http_response_code(401);
        echo json_encode(['error' => 'Identifiant ou mot de passe refusé par le serveur d\'agenda (Code ' . $httpCode . ').']);
        exit;
    }

    if ($httpCode < 200 || $httpCode >= 300) {
        http_response_code(400);
        echo json_encode(['error' => 'Le serveur n\'a pas reconnu cet emplacement CalDAV (Code HTTP ' . $httpCode . ').']);
        exit;
    }

    $calendars = [];
    $seenUrls = [];

    if (preg_match_all('/<(?:\w+:)?response\b[^>]*>(.*?)<\/(?:\w+:)?response>/is', $responseXml, $matches)) {
        foreach ($matches[1] as $respBlock) {
            $isCalendar = preg_match('/<(?:\w+:)?calendar\b/i', $respBlock);
            $isInboxOutbox = preg_match('/<(?:\w+:)?schedule-inbox\b|<(?:\w+:)?schedule-outbox\b/i', $respBlock);
            if ($isCalendar && !$isInboxOutbox) {
                $cName = '';
                $cUrl = rtrim($effectiveUrl, '/') . '/';
                if (preg_match('/<(?:\w+:)?displayname[^>]*>(.*?)<\/(?:\w+:)?displayname>/is', $respBlock, $dnMatch)) {
                    $cName = trim(html_entity_decode(strip_tags($dnMatch[1]), ENT_QUOTES | ENT_XML1, 'UTF-8'));
                }
                if (preg_match('/<(?:\w+:)?href[^>]*>(.*?)<\/(?:\w+:)?href>/is', $respBlock, $hrefMatch)) {
                    $href = trim($hrefMatch[1]);
                    if ($href !== '') {
                        if (preg_match('/^https?:\/\//i', $href)) {
                            $cUrl = rtrim($href, '/') . '/';
                        } else {
                            $parsed = parse_url($effectiveUrl);
                            $origin = ($parsed['scheme'] ?? 'https') . '://' . ($parsed['host'] ?? '') . (isset($parsed['port']) ? ':' . $parsed['port'] : '');
                            $cUrl = rtrim($origin . '/' . ltrim($href, '/'), '/') . '/';
                        }
                    }
                }
                if ($cName !== '' && !isset($seenUrls[$cUrl])) {
                    $seenUrls[$cUrl] = true;
                    $calendars[] = ['id' => $cUrl, 'name' => $cName, 'url' => $cUrl];
                }
            }
        }
    }

    if (count($calendars) === 0) {
        $fallbackName = '';
        if (preg_match('/<(?:\w+:)?displayname[^>]*>(.*?)<\/(?:\w+:)?displayname>/is', $responseXml, $dnMatch)) {
            $fallbackName = trim(html_entity_decode(strip_tags($dnMatch[1]), ENT_QUOTES | ENT_XML1, 'UTF-8'));
        }
        $resolvedUrl = rtrim($effectiveUrl, '/') . '/';
        if ($fallbackName === '') {
            $parsedHost = parse_url($resolvedUrl, PHP_URL_HOST) ?: 'Agenda CalDAV';
            $fallbackName = $parsedHost . ' (' . $username . ')';
        }
        $calendars[] = ['id' => $resolvedUrl, 'name' => $fallbackName, 'url' => $resolvedUrl];
    }

    $firstCal = $calendars[0];

    echo json_encode([
        'success' => true,
        'protocol' => 'caldav',
        'calendarName' => $firstCal['name'],
        'calendarUrl' => $firstCal['url'],
        'folderId' => $firstCal['id'],
        'calendars' => $calendars
    ]);
    exit;
}

if ($pathInfo === '/calendar/push' && $method === 'POST') {
    $body = getJsonBody();
    $protocol = strtolower(trim($body['protocol'] ?? 'caldav'));
    $rawUrl = trim($body['url'] ?? '');
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $folderId = trim($body['folderId'] ?? 'calendar');
    $events = $body['events'] ?? [];

    if ($rawUrl === '' || $username === '' || $password === '' || !is_array($events) || count($events) === 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Paramètres d\'agenda ou événements manquants.']);
        exit;
    }

    if ($protocol === 'ssl' || stripos($rawUrl, 'Exchange.asmx') !== false || stripos($rawUrl, 'mail.ovh.') !== false) {
        $ewsUrl = normalizeExchangeEwsUrl($rawUrl);
        $savedFolderXml = '<t:DistinguishedFolderId Id="calendar" />';
        if (strpos($folderId, 'shared:') === 0) {
            $sharedEmail = trim(substr($folderId, 7));
            if ($sharedEmail !== '') {
                $safeEmail = htmlspecialchars($sharedEmail, ENT_XML1 | ENT_QUOTES, 'UTF-8');
                $savedFolderXml = '<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>' . $safeEmail . '</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>';
            }
        } elseif ($folderId !== '' && $folderId !== 'calendar') {
            $safeFolderId = htmlspecialchars($folderId, ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $savedFolderXml = '<t:FolderId Id="' . $safeFolderId . '" />';
        }

        $pushed = 0;

        foreach ($events as $ev) {
            $summary = htmlspecialchars($ev['summary'] ?? 'Rappel Kanbinou', ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $description = htmlspecialchars($ev['description'] ?? '', ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $location = htmlspecialchars($ev['location'] ?? '', ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $startIso = htmlspecialchars($ev['startIso'] ?? '', ENT_XML1 | ENT_QUOTES, 'UTF-8');
            $endIso = htmlspecialchars($ev['endIso'] ?? '', ENT_XML1 | ENT_QUOTES, 'UTF-8');

            if ($startIso === '' || $endIso === '') continue;

            $soapCreateItem = '<?xml version="1.0" encoding="utf-8"?>'
                . '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                . 'xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages" '
                . 'xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types" '
                . 'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
                . '<soap:Header><t:RequestServerVersion Version="Exchange2010_SP2" /></soap:Header>'
                . '<soap:Body>'
                . '<m:CreateItem SendMeetingInvitations="SendToNone">'
                . '<m:SavedItemFolderId>' . $savedFolderXml . '</m:SavedItemFolderId>'
                . '<m:Items>'
                . '<t:CalendarItem>'
                . '<t:Subject>' . $summary . '</t:Subject>'
                . '<t:Body BodyType="Text">' . $description . '</t:Body>'
                . '<t:ReminderIsSet>true</t:ReminderIsSet>'
                . '<t:ReminderMinutesBeforeStart>15</t:ReminderMinutesBeforeStart>'
                . '<t:Start>' . $startIso . '</t:Start>'
                . '<t:End>' . $endIso . '</t:End>'
                . '<t:IsAllDayEvent>false</t:IsAllDayEvent>'
                . '<t:LegacyFreeBusyStatus>Busy</t:LegacyFreeBusyStatus>'
                . '<t:Location>' . $location . '</t:Location>'
                . '</t:CalendarItem>'
                . '</m:Items>'
                . '</m:CreateItem>'
                . '</soap:Body></soap:Envelope>';

            $ch = curl_init($ewsUrl);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_USERPWD => $username . ':' . $password,
                CURLOPT_HTTPAUTH => CURLAUTH_ANY,
                CURLOPT_UNRESTRICTED_AUTH => true,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: text/xml; charset=utf-8',
                    'User-Agent: Kanbinou-ExchangeSSL/2.0',
                    'Expect:'
                ],
                CURLOPT_POSTFIELDS => $soapCreateItem,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => 12,
                CURLOPT_SSL_VERIFYPEER => true
            ]);

            $resp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            if ($resp === false || $httpCode < 200 || $httpCode >= 300 || stripos($resp, 'ResponseClass="Error"') !== false) {
                http_response_code(502);
                echo json_encode([
                    'error' => 'Échec d\'écriture sur le calendrier Exchange SSL (Code HTTP ' . $httpCode . ($curlErr ? ' - ' . $curlErr : '') . ').'
                ]);
                exit;
            }
            $pushed++;
        }

        echo json_encode(['success' => true, 'pushedCount' => $pushed]);
        exit;
    }

    // Mode CalDAV standard
    $calUrl = rtrim($rawUrl, '/') . '/';
    $pushed = 0;
    foreach ($events as $ev) {
        $uid = preg_replace('/[^a-zA-Z0-9_-]/', '', $ev['uid'] ?? '');
        $ics = $ev['icsContent'] ?? '';
        if ($uid === '' || $ics === '') continue;

        $targetUrl = $calUrl . $uid . '.ics';
        $ch = curl_init($targetUrl);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => 'PUT',
            CURLOPT_USERPWD => $username . ':' . $password,
            CURLOPT_HTTPAUTH => CURLAUTH_BASIC | CURLAUTH_DIGEST,
            CURLOPT_HTTPHEADER => [
                'Content-Type: text/calendar; charset=utf-8',
                'User-Agent: Kanbinou-CalDAV/2.0'
            ],
            CURLOPT_POSTFIELDS => $ics,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => true
        ]);

        $resp = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($resp === false || $httpCode < 200 || $httpCode >= 300) {
            http_response_code(502);
            echo json_encode([
                'error' => 'Échec d\'écriture sur l\'agenda (Code HTTP ' . $httpCode . ($curlErr ? ' - ' . $curlErr : '') . ').'
            ]);
            exit;
        }
        $pushed++;
    }

    echo json_encode(['success' => true, 'pushedCount' => $pushed]);
    exit;
}

// --- TEMPS RÉEL (SSE) ---
if ($pathInfo === '/events') {
    // Sur mutualisé PHP (sans serveur d'événements persistant Node/Redis),
    // renvoyer HTTP 204 No Content signale au navigateur de fermer proprement la connexion EventSource
    http_response_code(204);
    exit;
}

// Si la route n'est pas reconnue
http_response_code(404);
echo json_encode(['error' => 'Route API introuvable : ' . htmlspecialchars($pathInfo)]);

