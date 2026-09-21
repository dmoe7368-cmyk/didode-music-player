// -----------------------------------------------------
// APP BOOTSTRAP & OFFLINE STATE SYNCHRONIZATION
// -----------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    
    // 1. Load Downloaded Offline Tracks FIRST so registry is ready before UI renders
    const savedDownloadedTracks = await getDownloadedTracksFromDB();
    if (savedDownloadedTracks && savedDownloadedTracks.length > 0) {
      const registry = JSON.parse(localStorage.getItem("downloadRegistry") || "{}");
      savedDownloadedTracks.forEach(track => {
        if (track.blob) {
          registry[track.id] = {
            fileName: track.fileName,
            filePath: `App Storage -> ${track.fileName}`,
            blobUrl: URL.createObjectURL(track.blob)
          };
        }
      });
      state.downloadedFilesRegistry = registry;
      localStorage.setItem("downloadRegistry", JSON.stringify(registry));
    }

    // 2. Load Local Uploads from IndexedDB
    const savedLocalTracks = await getAllLocalTracksFromDB();
    if (savedLocalTracks && savedLocalTracks.length > 0) {
      state.localSongs = savedLocalTracks.map(t => ({
        ...t,
        url: URL.createObjectURL(t.blob)
      }));
    }

  } catch (err) {
    console.error("IndexedDB initialization error:", err);
  }

  renderVisualizer();
  updateRepeatUI();
  renderRecentlyPlayed();
  setupHeroPlayerExpansion();

  await syncPhysicalDownloadsState();
  renderFeaturedAlbumsDeck();

  if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
    fetchDriveAlbums();
  }
});
