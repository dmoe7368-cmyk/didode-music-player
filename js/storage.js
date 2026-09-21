// ==========================================================================
// DIDODE - Optimized Web & PWA Direct Download Engine
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

// 2. Direct Download (Triggers Phone's Public Download Folder directly)
async function downloadAudioToPhoneStorage(song, signal, onProgress) {
  const fileName = `${song.name.replace(/[^a-zA-Z0-9_\-\u1000-\u109F]/g, "_")}.mp3`;

  if (onProgress) onProgress("Downloading audio stream...");

  const response = await fetch(song.url, { signal });
  if (!response.ok) throw new Error("Failed to fetch audio stream");
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
    // Website View / PWA Browser Environment:
    // Triggers direct browser download straight to Phone's Download folder
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    // Cache internally for seamless offline web app playback
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

    savedLocationPath = `Internal Storage -> Download/${fileName}`;
  }

  return { fileName, filePath: savedLocationPath };
}

// 3. Delete Physical File
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
