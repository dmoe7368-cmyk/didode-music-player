// ==========================================================================
// DIDODE - Storage Manager (DidodeMusic Folder Creator)
// ==========================================================================

const STORAGE_FOLDER = "DidodeMusic";

function hasNativeFilesystem() {
  return typeof Capacitor !== "undefined" && Capacitor.isPluginAvailable("Filesystem");
}

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
    // Web / Vercel Website View: Triggers browser download directly
    const blobUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = blobUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    // Save internally into IndexedDB for instant offline playback
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

    savedLocationPath = `Download/${STORAGE_FOLDER}/${fileName}`;
  }

  return { fileName, filePath: savedLocationPath };
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
