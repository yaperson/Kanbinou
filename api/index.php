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
