// ==========================================================================
// IndexedDB Engine - Distinct Local Uploads vs Downloaded Caches
// ==========================================================================

const DB_NAME = "DidodeAudioDB";
const DB_VERSION = 2; // Incremented version to create separate stores
const LOCAL_STORE = "local_tracks";
const DOWNLOADED_STORE = "downloaded_tracks";

let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
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
    
    request.onerror = (e) => reject(e);
  });
}

// ---------------- LOCAL UPLOADS ----------------
function saveLocalTrackToDB(trackObj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).put(trackObj);
    tx.oncomplete = () => resolve(trackObj);
    tx.onerror = (e) => reject(e);
  });
}

function getAllLocalTracksFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE, "readonly");
    const req = tx.objectStore(LOCAL_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function deleteLocalTrackFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).delete(id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = (e) => reject(e);
  });
}

function clearAllLocalTracksFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e);
  });
}

// ---------------- DOWNLOADED OFF-LINE TRACKS ----------------
function saveDownloadedTrackToDB(trackObj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE, "readwrite");
    tx.objectStore(DOWNLOADED_STORE).put(trackObj);
    tx.oncomplete = () => resolve(trackObj);
    tx.onerror = (e) => reject(e);
  });
}

function getDownloadedTracksFromDB() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE, "readonly");
    const req = tx.objectStore(DOWNLOADED_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function deleteDownloadedTrackFromDB(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DOWNLOADED_STORE, "readwrite");
    tx.objectStore(DOWNLOADED_STORE).delete(id);
    tx.oncomplete = () => resolve(id);
    tx.onerror = (e) => reject(e);
  });
}
