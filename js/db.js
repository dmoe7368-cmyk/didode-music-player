// =====================================================
// IndexedDB Engine: Permanent Audio Storage (Blobs)
// =====================================================

const DB_NAME = "DidodeAudioDB";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    
    request.onerror = (e) => {
      console.error("IndexedDB Open Error:", e);
      reject(e);
    };
  });
}

function saveTrackToDB(trackObj) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized");
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(trackObj);
    
    req.onsuccess = () => resolve(trackObj);
    req.onerror = (e) => reject(e);
  });
}

function getAllTracksFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized");
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function deleteTrackFromDB(id) {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized");
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    
    req.onsuccess = () => resolve(id);
    req.onerror = (e) => reject(e);
  });
}

function clearAllTracksFromDB() {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized");
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e);
  });
}
