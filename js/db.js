// ==========================================================================
// DIDODE - IndexedDB Storage Engine for Offline Downloads
// ==========================================================================

const DB_NAME = "DidodeAudioDB";
const DB_VERSION = 2;
const LOCAL_STORE = "local_tracks";
const DOWNLOADED_STORE = "downloaded_tracks";

let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(LOCAL_STORE)) {
        database.createObjectStore(LOCAL_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(DOWNLOADED_STORE)) {
        database.createObjectStore(DOWNLOADED_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      console.error("IndexedDB open error:", e.target.error);
      reject(e.target.error);
    };
  });
}

async function saveDownloadedTrackToDB(trackObj) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(DOWNLOADED_STORE, "readwrite");
    tx.objectStore(DOWNLOADED_STORE).put(trackObj);
    tx.oncomplete = () => resolve(trackObj);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getDownloadedTracksFromDB() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(DOWNLOADED_STORE, "readonly");
    const req = tx.objectStore(DOWNLOADED_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteDownloadedTrackFromDB(id) {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(DOWNLOADED_STORE, "readwrite");
    tx.objectStore(DOWNLOADED_STORE).delete(id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = (e) => reject(e.target.error);
  });
}
