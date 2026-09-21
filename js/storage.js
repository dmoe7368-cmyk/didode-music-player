// ==========================================================================
// DIDODE - Cross-Platform (iOS & Android) Storage Engine
// ==========================================================================

const APP_PREFIX = "DidodeMusic_";

// Detect Platform
function getClientPlatform() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return "ios";
  }
  if (/android/i.test(userAgent)) {
    return "android";
  }
  return "web";
}

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

// 1. Check physical existence
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

// 2. Cross-Platform Download Handler
async function downloadAudioToPhoneStorage(song, signal, onProgress) {
  const cleanSongName = song.name.replace(/[^a-zA-Z0-9_\-\u1000-\u109F]/g, "_");
  const fileName = `${APP_PREFIX}${cleanSongName}.mp3`;
  const platform = getClientPlatform();

  if (onProgress) onProgress("Downloading audio stream...");

  const response = await fetch(song.url, { signal });
  if (!response.ok) throw new Error("Failed to fetch audio stream");
  const blob = await response.blob();

  if (signal && signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  let savedLocationPath = "";

  if (hasNativeFilesystem()) {
    // Native Capacitor (Android / iOS native app)
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
  } else {
    // Web / Vercel Website View Environment
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    // Save internally in IndexedDB for Offline Playback
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

    // Display platform-accurate notification text
    if (platform === "ios") {
      savedLocationPath = `Files App -> Downloads/${fileName}`;
    } else {
      savedLocationPath = `Internal Storage -> Download/${fileName}`;
    }
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
