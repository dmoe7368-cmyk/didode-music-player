// ==========================================================================
// DIDODE - Storage Manager with Identifiable App Prefix
// ==========================================================================

const APP_PREFIX = "DidodeMusic_";

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

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

async function downloadAudioToPhoneStorage(song, signal, onProgress) {
  const cleanSongName = song.name.replace(/[^a-zA-Z0-9_\-\u1000-\u109F]/g, "_");
  const fileName = `${APP_PREFIX}${cleanSongName}.mp3`;

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

    savedLocationPath = result.uri || `/storage/emulated/0/Documents/DidodeMusic/${fileName}`;
  } else {
    // Web / Vercel: Browser Download Manager
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    // Save internally in IndexedDB for Offline Web Playback
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

    savedLocationPath = `Download/${fileName}`;
  }

  return { fileName, filePath: savedLocationPath };
}

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
