// ==========================================================================
// DIDODE - Storage & Share Service for Android/Web
// ==========================================================================

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

function hasSharePlugin() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Share");
}

// 1. Check if file exists in App Storage / IndexedDB
async function isFilePhysicallyPresent(fileName) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.stat({
        path: `DidodeMusic/${fileName}`,
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

// 2. Download and Optionally Trigger Android Share Sheet
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
        path: "DidodeMusic",
        directory: Directory.Documents,
        recursive: true
      });
    } catch (ignore) {}

    const result = await Filesystem.writeFile({
      path: `DidodeMusic/${fileName}`,
      data: base64Data,
      directory: Directory.Documents
    });

    savedLocationPath = result.uri;

    // Automatically trigger Android Share/Save Dialog so user can place it in Download/Music folder
    if (hasSharePlugin() && Capacitor.getPlatform() === 'android') {
      try {
        await Capacitor.Plugins.Share.share({
          title: song.name,
          text: 'Save your downloaded music file:',
          url: result.uri,
          dialogTitle: 'Save Music File'
        });
      } catch (shareErr) {
        console.warn("Share sheet dismissed or unavailable:", shareErr);
      }
    }
  } else {
    // Web / PWA Fallback
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
    savedLocationPath = `App Storage (IndexedDB) -> ${fileName}`;
  }

  return { fileName, filePath: savedLocationPath };
}

// 3. Delete Physical File
async function deleteAudioFromPhoneStorage(fileName, songId) {
  if (hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      await Filesystem.deleteFile({
        path: `DidodeMusic/${fileName}`,
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
