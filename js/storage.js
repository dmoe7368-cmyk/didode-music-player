// ==========================================================================
// DIDODE - Physical Storage Download & Resilient Fallback Service
// ==========================================================================

const STORAGE_FOLDER = "DidodeMusic";

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

// 1. Check physical existence
async function isFilePhysicallyPresent(fileName) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.stat({
        path: `${STORAGE_FOLDER}/${fileName}`,
        directory: Directory.Documents
      });
      return true;
    } catch (e) {
      return false;
    }
  } else {
    try {
      const all = await getDownloadedTracksFromDB();
      return all.some(t => t.fileName === fileName);
    } catch (e) {
      return false;
    }
  }
}

// 2. Multi-Endpoint Robust Downloader with AbortSignal
async function downloadAudioToPhoneStorage(song, signal, onProgress) {
  const fileName = `${song.name.replace(/[^a-zA-Z0-9_\-\u1000-\u109F]/g, "_")}.mp3`;
  
  if (onProgress) onProgress("Connecting to stream...");
  
  // Candidates endpoints to beat Google Drive quota locks
  const streamUrls = [
    song.url,
    song.fallbackUrl,
    `https://drive.google.com/uc?export=download&id=${song.id}`,
    `https://docs.google.com/uc?export=download&id=${song.id}`
  ].filter(Boolean);
  
  let response = null;
  let fetchError = null;
  
  for (const url of streamUrls) {
    try {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      
      response = await fetch(url, { signal, method: "GET" });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        // If Google returns HTML (Quota warning / virus check page), reject and try next
        if (!contentType.includes("text/html")) {
          break;
        }
      }
    } catch (err) {
      fetchError = err;
      if (signal && signal.aborted) throw err;
    }
  }
  
  if (!response || !response.ok) {
    throw fetchError || new Error("Google Drive Daily Download Quota Exceeded for this file. Please wait or try another track.");
  }
  
  const blob = await response.blob();
  
  if (signal && signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  
  let savedLocationPath = "";
  
  if (hasNativeFilesystem()) {
    const { Filesystem, Directory } = Capacitor.Plugins;
    const base64Data = await blobToBase64(blob);
    
    try {
      await Filesystem.mkdir({
        path: STORAGE_FOLDER,
        directory: Directory.Documents,
        recursive: true
      });
    } catch (ignore) {}
    
    const result = await Filesystem.writeFile({
      path: `${STORAGE_FOLDER}/${fileName}`,
      data: base64Data,
      directory: Directory.Documents
    });
    
    savedLocationPath = result.uri || `/storage/emulated/0/Documents/${STORAGE_FOLDER}/${fileName}`;
  } else {
    // Web Storage Fallback
    await saveDownloadedTrackToDB({
      id: song.id,
      fileName: fileName,
      name: song.name,
      blob: blob,
      cover: song.cover,
      albumName: song.albumName,
      albumId: song.albumId,
      isDownloaded: true
    });
    savedLocationPath = `App Storage -> ${fileName}`;
  }
  
  return { fileName, filePath: savedLocationPath };
}

// 3. Delete Physical File from Phone Storage
async function deleteAudioFromPhoneStorage(fileName, songId) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.deleteFile({
        path: `${STORAGE_FOLDER}/${fileName}`,
        directory: Directory.Documents
      });
    } catch (err) {
      console.warn("Native file delete error:", err);
    }
  }
  try {
    await deleteDownloadedTrackFromDB(songId);
  } catch (e) {}
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(blob);
  });
}
