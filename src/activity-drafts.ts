import type { Activity } from "./default-activity";

export type ActivityDraftRecord = { activity: Activity; savedAt: number };

const DB_NAME = "aula-en-juego-drafts";
const STORE_NAME = "activity-drafts";

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no permite guardar borradores automáticamente."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento de borradores."));
  });
}

export async function readActivityDraft(key: string): Promise<ActivityDraftRecord | null> {
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as ActivityDraftRecord | undefined) || null);
      request.onerror = () => reject(request.error || new Error("No se pudo leer el borrador."));
    });
  } finally { db.close(); }
}

export async function writeActivityDraft(key: string, activity: Activity): Promise<number> {
  const db = await openDraftDb();
  const savedAt = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({ activity, savedAt } satisfies ActivityDraftRecord, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el borrador."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló el guardado del borrador."));
    });
    return savedAt;
  } finally { db.close(); }
}

export async function clearActivityDrafts(kind: string, id: string): Promise<void> {
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete(`${kind}:new`);
      if (id) store.delete(`${kind}:${id}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo limpiar el borrador."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló la limpieza del borrador."));
    });
  } finally { db.close(); }
}

export async function deleteActivityDraft(key: string): Promise<void> {
  const db = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el borrador."));
      transaction.onabort = () => reject(transaction.error || new Error("Se canceló la eliminación del borrador."));
    });
  } finally { db.close(); }
}
