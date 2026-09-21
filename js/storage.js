// ==========================================================================
// DIDODE - Native & Web Storage Manager (Download/DidodeMusic Folder Target)
// ==========================================================================

const STORAGE_FOLDER = "Download/DidodeMusic";

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

// 1. Check if file exists in Download/DidodeMusic
async function isFilePhysicallyPresent(fileName) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.stat({
        path: `${STORAGE_FOLDER}/${fileName}`,
        directory: Directory.ExternalStorage
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

// 2. Download and save directly into Download/DidodeMusic folder
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

    // Create 'Download/DidodeMusic' directory in External Storage
    try {
      await Filesystem.mkdir({
        path: STORAGE_FOLDER,
        directory: Directory.ExternalStorage,
        recursive: true
      });
    } catch (ignore) {}

    // Write file directly into Download/DidodeMusic folder
    const result = await Filesystem.writeFile({
      path: `${STORAGE_FOLDER}/${fileName}`,
      data: base64Data,
      directory: Directory.ExternalStorage,
      recursive: true
    });

    savedLocationPath = result.uri || `/storage/emulated/0/${STORAGE_FOLDER}/${fileName}`;
  } else {
    // Web / Vercel Browser fallback
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

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

    savedLocationPath = `${STORAGE_FOLDER}/${fileName}`;
  }

  return { fileName, filePath: savedLocationPath };
}

// 3. Delete Physical File from Download/DidodeMusic
async function deleteAudioFromPhoneStorage(fileName, songId) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.deleteFile({
        path: `${STORAGE_FOLDER}/${fileName}`,
        directory: Directory.ExternalStorage
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
