// =============================================================================
// Kanbinou - Moteur Cryptographique Client (Web Crypto API - AES-256-GCM)
// =============================================================================

/**
 * Dérive une clé cryptographique AES-GCM à partir d'un mot de passe ou code PIN
 * en utilisant PBKDF2 avec 100 000 itérations et SHA-256
 */
export async function deriveKey(passphrase, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Chiffre un objet ou une chaîne JSON avec AES-256-GCM
 * Retourne un objet contenant : salt, iv, ciphertext (en base64)
 */
export async function encryptData(data, passphrase) {
  const encoder = new TextEncoder();
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const encodedData = encoder.encode(jsonString);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedData
  );

  return {
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    cipher: bufferToBase64(new Uint8Array(encryptedBuffer))
  };
}

/**
 * Déchiffre un payload chiffré (salt, iv, cipher) avec le mot de passe
 */
export async function decryptData(payload, passphrase) {
  if (!payload || !payload.salt || !payload.iv || !payload.cipher) {
    throw new Error('Payload chiffré invalide');
  }

  const salt = base64ToBuffer(payload.salt);
  const iv = base64ToBuffer(payload.iv);
  const cipher = base64ToBuffer(payload.cipher);

  const key = await deriveKey(passphrase, salt);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipher
  );

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(decryptedBuffer);
  try {
    return JSON.parse(jsonString);
  } catch {
    return jsonString;
  }
}

// Utilitaires de conversion Base64 <-> ArrayBuffer
function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
