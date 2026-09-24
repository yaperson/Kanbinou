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

        CREATE TABLE IF NOT EXISTS workspace_config (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Données initiales si la base est neuve
    $countUsers = (int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    if ($countUsers === 0) {
        $initialHash = password_hash('admin', PASSWORD_BCRYPT, ['cost' => 12]);
        $stmt = $pdo->prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES ('usr-admin', 'admin', ?, 'Administrateur', 'admin')");
        $stmt->execute([$initialHash]);

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
    return $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// Protection anti Brute-Force (max 5 tentatives consécutives / 15 minutes)
function checkRateLimit(PDO $pdo, string $ip) {
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

function createToken(array $payload, string $secret): string {
    $header = base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
    $payload['exp'] = time() + (30 * 86400); // Valide 30 jours
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

function authenticate(string $jwtSecret): array {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
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
    checkRateLimit($pdo, $clientIp);

    $body = getJsonBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

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
    $token = createToken($payload, $jwtSecret);
    echo json_encode(['token' => $token, 'user' => $payload]);
    exit;
}

if ($method === 'POST' && $pathInfo === '/auth/register') {
    $body = getJsonBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $displayName = trim($body['displayName'] ?? '');

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
    $stmt = $pdo->prepare("INSERT INTO users (id, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, 'user')");
    $stmt->execute([$id, $username, $hash, $displayName]);

    $payload = ['id' => $id, 'username' => $username, 'displayName' => $displayName, 'role' => 'user'];
    $token = createToken($payload, $jwtSecret);
    echo json_encode(['token' => $token, 'user' => $payload]);
    exit;
}

if ($method === 'GET' && $pathInfo === '/auth/me') {
    $user = authenticate($jwtSecret);
    echo json_encode(['user' => $user]);
    exit;
}

// --- RESSOURCES ---
if ($pathInfo === '/resources') {
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
        authenticate($jwtSecret);
        $body = getJsonBody();
        $id = $body['id'] ?? ('res-' . uuid());
        $name = trim($body['name'] ?? 'Sans nom');
        $cat = $body['category'] ?? 'Général';
        $status = $body['status'] ?? 'available';
        $attrs = json_encode($body['attributes'] ?? (object)[]);

        $stmt = $pdo->prepare("INSERT INTO resources (id, name, category, status, attributes_json) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$id, $name, $cat, $status, $attrs]);

        http_response_code(201);
        echo json_encode(['id' => $id, 'name' => $name, 'category' => $cat, 'status' => $status, 'attributes' => $body['attributes'] ?? []]);
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
        $id = $body['id'] ?? ('alloc-' . uuid());
        $resourceId = $body['resourceId'] ?? '';
        $startDate = $body['startDate'] ?? '';
        $endDate = $body['endDate'] ?? '';
        $label = $body['label'] ?? 'Essai';
        $taskRef = $body['taskRef'] ?? null;

        $stmt = $pdo->prepare("INSERT INTO allocations (id, resource_id, user_id, user_name, start_date, end_date, label, task_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $resourceId, $user['id'], $user['displayName'], $startDate, $endDate, $label, $taskRef]);

        http_response_code(201);
        echo json_encode([
            'id' => $id,
            'resourceId' => $resourceId,
            'userId' => $user['id'],
            'userName' => $user['displayName'],
            'startDate' => $startDate,
            'endDate' => $endDate,
            'label' => $label,
            'taskRef' => $taskRef
        ]);
        exit;
    }
}

if (preg_match('#^/allocations/([^/]+)$#', $pathInfo, $m)) {
    authenticate($jwtSecret);
    $id = $m[1];

    if ($method === 'PUT') {
        $body = getJsonBody();
        $stmt = $pdo->prepare("UPDATE allocations SET resource_id = ?, start_date = ?, end_date = ?, label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$body['resourceId'], $body['startDate'], $body['endDate'], $body['label'], $id]);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $stmt = $pdo->prepare("DELETE FROM allocations WHERE id = ?");
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
        authenticate($jwtSecret);
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

// --- COMPATIBILITÉ V1 & SAUVEGARDE GLOBALE ---
$backupFile = $dataDir . '/.ht_backup.json';
if ($pathInfo === '/save' && $method === 'POST') {
    authenticate($jwtSecret);
    $raw = file_get_contents('php://input');
    file_put_contents($backupFile, $raw);
    echo json_encode(['success' => true]);
    exit;
}

if ($pathInfo === '/load' && $method === 'GET') {
    if (!file_exists($backupFile)) {
        http_response_code(404);
        echo json_encode(['error' => 'Aucune sauvegarde trouvée']);
        exit;
    }
    echo file_get_contents($backupFile);
    exit;
}

// Si la route n'est pas reconnue
http_response_code(404);
echo json_encode(['error' => 'Route API introuvable : ' . htmlspecialchars($pathInfo)]);
