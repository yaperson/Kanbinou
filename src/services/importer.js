// =============================================================================
// Kanbinou - Moteur d'Importation Rétro-Compatible Multi-Formats
// =============================================================================

import { deriveKey } from './crypto.js';

/**
 * Tente d'importer et d'unifier n'importe quel fichier Kanbinou (v1, v2 chiffré binaire,
 * v2 JSON, v3 chiffré base64, ou export brut).
 * 
 * @param {File} file - Le fichier téléversé (.secure, .json)
 * @param {string} password - Le mot de passe optionnel si le fichier est chiffré
 * @returns {Promise<{ tasks: Array, resources: Array, allocations: Array, categories?: Array, columns?: Array }>}
 */
export async function parseKanbinouFile(file, password = '') {
  const arrayBuffer = await file.arrayBuffer();

  let parsedData = null;

  // 1. Tenter d'abord de lire comme JSON texte
  try {
    const textDecoder = new TextDecoder('utf-8', { fatal: true });
    const text = textDecoder.decode(arrayBuffer);
    parsedData = JSON.parse(text);
  } catch (err) {
    // Si ce n'est pas du texte UTF-8/JSON valide, c'est très probablement le format binaire chiffré Kanbinou-v2 !
    parsedData = null;
  }

  // 2. Si c'est du binaire pur (.secure historique de Kanbinou-v2)
  if (!parsedData) {
    if (!password) {
      throw new Error('PASSWORD_REQUIRED');
    }
    parsedData = await decryptBinaryV2(arrayBuffer, password);
  } else {
    // 3. Si c'est du JSON, vérifier si c'est un format chiffré :
    
    // Cas A : Format v2 serveur { salt: number[], iv: number[], data: number[] }
    if (Array.isArray(parsedData.salt) && Array.isArray(parsedData.iv) && Array.isArray(parsedData.data)) {
      if (!password) throw new Error('PASSWORD_REQUIRED');
      parsedData = await decryptArrayPayload(parsedData, password);
    }
    // Cas B : Format v3 { salt: string, iv: string, cipher: string } (Base64)
    else if (parsedData.salt && parsedData.iv && parsedData.cipher) {
      if (!password) throw new Error('PASSWORD_REQUIRED');
      parsedData = await decryptBase64Payload(parsedData, password);
    }
  }

  // 4. Normaliser les données décodées vers le format unifié Kanbinou v3
  return normalizeImportedData(parsedData);
}

/**
 * Déchiffre le format binaire brut v2 (16 octets salt + 12 octets IV + ciphertext)
 */
async function decryptBinaryV2(buffer, password) {
  if (buffer.byteLength < 28) {
    throw new Error('Fichier trop court ou invalide.');
  }

  const salt = new Uint8Array(buffer.slice(0, 16));
  const iv = new Uint8Array(buffer.slice(16, 28));
  const data = new Uint8Array(buffer.slice(28));

  try {
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const jsonText = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Mot de passe incorrect ou fichier corrompu.');
  }
}

/**
 * Déchiffre le format { salt: number[], iv: number[], data: number[] }
 */
async function decryptArrayPayload(payload, password) {
  const salt = new Uint8Array(payload.salt);
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);

  try {
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const jsonText = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Mot de passe incorrect ou fichier corrompu.');
  }
}

/**
 * Déchiffre le format { salt: base64, iv: base64, cipher: base64 }
 */
async function decryptBase64Payload(payload, password) {
  const salt = base64ToBuffer(payload.salt);
  const iv = base64ToBuffer(payload.iv);
  const data = base64ToBuffer(payload.cipher);

  try {
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const jsonText = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Mot de passe incorrect ou fichier corrompu.');
  }
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

/**
 * Unifie n'importe quelle structure Kanbinou en objets propres pour IndexedDB v3
 */
export function normalizeImportedData(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Structure de données inconnue ou vide.');
  }

  const result = {
    tasks: [],
    resources: [],
    allocations: [],
    categories: raw.categories || null,
    columns: raw.columns && Array.isArray(raw.columns) ? raw.columns : null,
    terminology: raw.terminology || null
  };

  // 1. Extraction des Ressources / Produits (support de raw.resources, raw.products, tableaux ou dictionnaires)
  const rawList = [];
  const sources = [
    raw.resources,
    raw.products,
    raw.data && raw.data.resources,
    raw.data && raw.data.products
  ];

  sources.forEach(src => {
    if (!src) return;
    if (Array.isArray(src)) {
      rawList.push(...src);
    } else if (typeof src === 'object') {
      Object.entries(src).forEach(([key, val]) => {
        if (typeof val === 'string') {
          rawList.push({ id: key, name: val });
        } else if (val && typeof val === 'object') {
          rawList.push({ id: val.id || key, ...val });
        }
      });
    }
  });

  const seenIds = new Set();
  rawList.forEach(p => {
    if (!p) return;
    if (typeof p === 'string' && p.trim()) {
      const clean = p.trim();
      const id = `res-${crypto.randomUUID()}`;
      result.resources.push({
        id,
        name: clean,
        category: 'Général',
        status: 'available',
        attributes: {},
        updatedAt: new Date().toISOString()
      });
    } else if (typeof p === 'object') {
      const id = p.id || `res-${crypto.randomUUID()}`;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        const name = p.name || p.title || p.label || id;
        result.resources.push({
          id,
          name,
          category: p.category || 'Général',
          status: p.status || 'available',
          attributes: p.attributes || {},
          updatedAt: p.updatedAt || new Date().toISOString()
        });
      }
    }
  });

  // 2. Extraction des Tâches selon les différentes variantes :
  
  // Variante A : Format Kanbinou-v2 { columns: { todo: [...], doing: [...], ... }, taskData: { id: {...} } }
  if (raw.columns && !Array.isArray(raw.columns) && typeof raw.columns === 'object') {
    const colKeys = Object.keys(raw.columns);
    colKeys.forEach(colId => {
      const list = raw.columns[colId];
      if (Array.isArray(list)) {
        list.forEach(item => {
          // Fusionner avec taskData si présent
          const extra = (raw.taskData && item.id && raw.taskData[item.id]) ? raw.taskData[item.id] : {};
          const merged = { ...extra, ...item, columnId: colId };
          addTaskToResult(merged, colId, result);
        });
      }
    });
  }
  // Variante B : Format v1 ou v3 avec tableau tasks: [...]
  else if (Array.isArray(raw.tasks)) {
    raw.tasks.forEach(item => {
      addTaskToResult(item, item.columnId || 'todo', result);
    });
  }
  // Variante C : Format direct sous forme de tableau racine [ {...}, {...} ]
  else if (Array.isArray(raw)) {
    raw.forEach(item => {
      addTaskToResult(item, item.columnId || 'todo', result);
    });
  }
  // Variante D : Objet taskData seul
  else if (raw.taskData && typeof raw.taskData === 'object') {
    Object.values(raw.taskData).forEach(item => {
      addTaskToResult(item, item.columnId || 'todo', result);
    });
  }

  // Si des allocations étaient déjà présentes (format v3)
  if (Array.isArray(raw.allocations)) {
    raw.allocations.forEach(a => {
      if (a && a.resourceId) {
        result.allocations.push(a);
      }
    });
  }

  return result;
}

/**
 * Normalise un objet tâche unique et génère l'allocation roadmap si applicable
 */
function addTaskToResult(t, defaultColId, result) {
  if (!t || typeof t !== 'object') return;

  const taskId = t.id || `task-${crypto.randomUUID()}`;
  const title = t.title || t.text || 'Sans titre';
  const columnId = t.columnId || defaultColId || 'todo';
  const categoryId = t.categoryId || t.type || 'neutre';
  
  // Extraction de la ressource liée
  let resourceId = null;
  if (t.resourceId) {
    resourceId = t.resourceId;
  } else if (Array.isArray(t.products) && t.products.length > 0) {
    resourceId = t.products[0];
  } else if (typeof t.products === 'string' && t.products.trim()) {
    resourceId = t.products.trim();
  }

  // Si la ressource est un nom au lieu d'un ID, s'assurer qu'elle existe dans les ressources
  if (resourceId && !result.resources.some(r => r.id === resourceId)) {
    const existingByName = result.resources.find(r => r.name.toLowerCase() === resourceId.toLowerCase());
    if (existingByName) {
      resourceId = existingByName.id;
    } else {
      const isTechId = resourceId.startsWith('res-') || resourceId.startsWith('prod-') || /^[0-9a-f-]{30,}$/i.test(resourceId);
      const resName = isTechId 
        ? (t.productName || t.resourceName || t.product || 'Produit')
        : resourceId;
      const resId = isTechId ? resourceId : `res-${crypto.randomUUID()}`;

      const newRes = {
        id: resId,
        name: resName,
        category: 'Général',
        status: 'available',
        attributes: {},
        updatedAt: new Date().toISOString()
      };
      result.resources.push(newRes);
      resourceId = newRes.id;
    }
  }

  const startDate = t.startDate || t.start || '';
  const endDate = t.endDate || t.end || '';

  // Création automatique du créneau Roadmap si la tâche a des dates et une ressource
  let allocationId = t.allocationId || null;
  if (resourceId && startDate && endDate) {
    if (!allocationId) {
      allocationId = `alloc-${crypto.randomUUID()}`;
    }
    // Éviter les doublons d'allocation
    if (!result.allocations.some(a => a.id === allocationId)) {
      result.allocations.push({
        id: allocationId,
        resourceId: resourceId,
        userId: t.userId || 'imported-user',
        userName: t.userName || 'Moi',
        startDate: startDate,
        endDate: endDate,
        label: title,
        taskId: taskId,
        updatedAt: new Date().toISOString()
      });
    }
  }

  // Format final de la tâche
  result.tasks.push({
    id: taskId,
    title: title,
    columnId: columnId,
    categoryId: categoryId,
    isShared: Boolean(t.isShared),
    resourceId: resourceId,
    startDate: startDate,
    endDate: endDate,
    allocationId: allocationId,
    time: parseFloat(t.time) || 0,
    projection: parseFloat(t.projection) || 0,
    isSold: Boolean(t.sold || t.isSold),
    description: t.description || '',
    sensitive: {
      address: t.address || (t.sensitive && t.sensitive.address) || '',
      email: t.email || (t.sensitive && t.sensitive.email) || '',
      phone: t.phone || (t.sensitive && t.sensitive.phone) || '',
      notes: (t.sensitive && t.sensitive.notes) || ''
    },
    createdAt: t.createdAt || t.date || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString()
  });
}
