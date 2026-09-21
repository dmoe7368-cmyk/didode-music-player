// ==========================================================================
// DIDODE - High Performance Audio Engine & UI Controller
// ==========================================================================

const state = {
  albums: [],          // [{ id, name, coverUrl, songs: [] }]
  allDriveSongs: [],
  localSongs: [],
  downloadedFilesRegistry: {}, // { [songId]: { fileName, filePath } }
  activeDownloads: new Map(),  // Active AbortControllers Map: songId -> AbortController
  batchDownloadQueue: null,    // Batch State
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0,       // 0 = Off, 1 = Repeat All, 2 = Repeat 1 (Single)
  favorites: JSON.parse(localStorage.getItem("favoriteSongs") || "[]"),
  volume: 1,
  activeFilter: "all"
};

const audioEl = document.getElementById("audioEl");

// Google Drive Reliable Streaming Resolver
function getDriveMediaUrls(fileId, apiKey) {
  return {
    primary: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`,
    fallback1: `https://drive.google.com/uc?export=download&id=${fileId}`,
    fallback2: `https://docs.google.com/uc?export=download&id=${fileId}`
  };
}

function getDriveDirectImageUrl(fileId) {
  if (!fileId) return "assets/default-cover.png";
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// -----------------------------------------------------
// CIRCULAR SPINNER SVG GENERATOR WITH CANCEL CROSS
// -----------------------------------------------------
function getCircularSpinnerSvg() {
  return `
    <div class="spinner-wrap-relative">
      <svg class="spinner-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle class="spinner-path" cx="12" cy="12" r="9" stroke-width="2.5"></circle>
      </svg>
      <span class="spinner-cancel-cross">✕</span>
    </div>
  `;
}

// -----------------------------------------------------
// TOAST NOTIFICATION FOR STORAGE LOCATION
// -----------------------------------------------------
let toastTimer = null;

function showStorageToast(title, locationPath, icon = "📁") {
  const toast = document.getElementById("storageToast");
  const tTitle = document.getElementById("toastTitle");
  const tPath = document.getElementById("toastPath");
  const tIcon = document.getElementById("toastIcon");

  if (!toast) return;

  if (tTitle) tTitle.textContent = title;
  if (tPath) tPath.textContent = `Location: ${locationPath}`;
  if (tIcon) tIcon.textContent = icon;

  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4500);
}

// -----------------------------------------------------
// BEAUTIFUL IN-APP ALARM / CONFIRMATION MODAL
// -----------------------------------------------------
function showCustomConfirm(title, message, confirmText = "OK", icon = "⚠️", isDanger = false) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById("customModal");
    const mTitle = document.getElementById("modalTitle");
    const mDesc = document.getElementById("modalDesc");
    const mIcon = document.getElementById("modalIcon");
    const confirmBtn = document.getElementById("modalConfirmBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    if (!backdrop || !confirmBtn || !cancelBtn) return resolve(false);

    if (mTitle) mTitle.textContent = title;
    if (mDesc) mDesc.textContent = message;
    if (mIcon) mIcon.textContent = icon;
    if (confirmBtn) {
      confirmBtn.textContent = confirmText;
      confirmBtn.classList.toggle("danger-state", isDanger);
    }

    backdrop.classList.add("active");

    function cleanup(result) {
      backdrop.classList.remove("active");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }

    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// -----------------------------------------------------
// VISUALIZER ENGINE
// -----------------------------------------------------
let animationFrameId = null;

function renderVisualizer() {
  const canvas = document.getElementById("equalizerCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function draw() {
    animationFrameId = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const barCount = 24;
    const barWidth = 6;
    const gap = 6;
    const startX = (canvas.width - (barCount * (barWidth + gap) - gap)) / 2;

    for (let i = 0; i < barCount; i++) {
      let barHeight = 4;
      if (state.isPlaying) {
        const t = Date.now() / 140;
        const wave = Math.abs(Math.sin(t + i * 0.45) + Math.cos(t * 0.7 + i * 0.3)) / 2;
        barHeight = Math.max(5, wave * (canvas.height - 4));
      }

      const x = startX + i * (barWidth + gap);
      const y = canvas.height - barHeight;

      const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
      gradient.addColorStop(0, "#b6f338");
      gradient.addColorStop(1, "rgba(182, 243, 56, 0.15)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      ctx.fill();
    }
  }

  draw();
}

// -----------------------------------------------------
// NAVIGATION & SMART DOCKED BAR VISIBILITY
// -----------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-tab-item").forEach(b => {
    b.classList.toggle("active", b.dataset.nav === (id === "screen-home" ? "home" : (id === "screen-player-full" ? "player" : "library")));
  });

  syncDockedBarVisibility();
}

function syncDockedBarVisibility() {
  const dockedBar = document.getElementById("dockedPlayerBar");
  if (!dockedBar) return;

  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen?.id === "screen-player-full") {
    dockedBar.classList.add("hidden-bar");
    return;
  }

  if (activeScreen?.id === "screen-home") {
    const scrollArea = document.getElementById("homeFeedScrollArea");
    if (scrollArea && scrollArea.scrollTop < 120) {
      dockedBar.classList.add("hidden-bar");
      return;
    }
  }

  dockedBar.classList.remove("hidden-bar");
}

document.getElementById("homeFeedScrollArea")?.addEventListener("scroll", syncDockedBarVisibility);

// -----------------------------------------------------
// HERO CARD TAP -> OPEN FULL PLAYER
// -----------------------------------------------------
function setupHeroPlayerExpansion() {
  const heroCard = document.getElementById("heroPlayerCard");
  const heroExpandZone = document.getElementById("heroExpandTrigger");

  function triggerOpenPlayer(e) {
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".hero-controls-row")) {
      return;
    }
    if (state.queue.length > 0 && state.currentIndex >= 0) {
      showScreen("screen-player-full");
    } else {
      const all = [...state.allDriveSongs, ...state.localSongs];
      if (all.length > 0) {
        state.queue = all;
        playSongAt(0);
        showScreen("screen-player-full");
      }
    }
  }

  heroCard?.addEventListener("click", triggerOpenPlayer);
  heroExpandZone?.addEventListener("click", triggerOpenPlayer);
}

document.querySelectorAll(".nav-tab-item").forEach(tab => {
  tab.addEventListener("click", () => {
    const nav = tab.dataset.nav;
    if (nav === "home") showScreen("screen-home");
    else if (nav === "player") showScreen("screen-player-full");
    else if (nav === "library") openAlbumDetail("FAV");
  });
});

document.querySelectorAll(".nav-back-home").forEach(btn => {
  btn.addEventListener("click", () => showScreen("screen-home"));
});

document.getElementById("backToHomeBtn")?.addEventListener("click", () => {
  showScreen("screen-home");
});

document.getElementById("dockedExpandBtn")?.addEventListener("click", () => {
  showScreen("screen-player-full");
});

document.getElementById("seeAllAlbumsBtn")?.addEventListener("click", () => {
  document.querySelector('.pill-chip[data-filter="albums"]')?.click();
});

document.querySelectorAll(".pill-chip").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".pill-chip").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    state.activeFilter = pill.dataset.filter;
    applyCategoryFilter();
  });
});

// -----------------------------------------------------
// CATEGORY FILTER & ALBUM SEGREGATION
// -----------------------------------------------------
function applyCategoryFilter() {
  const filter = state.activeFilter;
  const recentSec = document.getElementById("recentSectionContainer");
  const featSec = document.getElementById("featuredSectionContainer");
  const heroCard = document.getElementById("heroPlayerCard");
  const albumGridSec = document.getElementById("albumGridSection");
  const searchBox = document.getElementById("searchResultsBox");

  if (searchBox) searchBox.style.display = "none";
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";

  if (filter === "favorites") {
    openAlbumDetail("FAV");
  } else if (filter === "local") {
    openAlbumDetail("LOCAL");
  } else if (filter === "downloaded") {
    openAlbumDetail("DOWNLOADED");
  } else if (filter === "albums") {
    showScreen("screen-home");
    if (recentSec) recentSec.style.display = "none";
    if (featSec) featSec.style.display = "none";
    if (heroCard) heroCard.style.display = "block";
    if (albumGridSec) albumGridSec.style.display = "block";
    renderAlbumsCategoryGrid();
  } else if (filter === "music") {
    openAlbumDetail("ALL_ALBUMS");
  } else {
    showScreen("screen-home");
    if (recentSec) recentSec.style.display = "block";
    if (featSec) featSec.style.display = "block";
    if (heroCard) heroCard.style.display = "block";
    if (albumGridSec) albumGridSec.style.display = "none";
  }
}

function renderAlbumsCategoryGrid() {
  const container = document.getElementById("albumsCategoryGrid");
  const countEl = document.getElementById("albumTotalCount");
  if (!container) return;

  const allAlbumItems = [
    { id: "DOWNLOADED", name: "Offline Downloads", coverUrl: "assets/cover-a.png", countText: `${getSongsByAlbumId("DOWNLOADED").length} Saved` },
    { id: "FAV", name: "Favorites", coverUrl: "assets/cover-fav.png", countText: `${getSongsByAlbumId("FAV").length} Songs` },
    { id: "LOCAL", name: "Device Files", coverUrl: "assets/cover-local.png", countText: `${state.localSongs.length} Files` }
  ];

  state.albums.forEach(alb => {
    allAlbumItems.push({
      id: alb.id,
      name: alb.name,
      coverUrl: alb.coverUrl,
      countText: `${alb.songs.length} Tracks`
    });
  });

  if (countEl) countEl.textContent = `${allAlbumItems.length} Albums`;

  container.innerHTML = "";
  allAlbumItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "album-grid-card";
    card.innerHTML = `
      <div class="album-grid-thumb">
        <img src="${item.coverUrl}" alt="${item.name}" onerror="this.src='assets/default-cover.png'">
      </div>
      <strong>${item.name}</strong>
      <small>${item.countText}</small>
    `;
    card.addEventListener("click", () => openAlbumDetail(item.id));
    container.appendChild(card);
  });
}

// -----------------------------------------------------
// GOOGLE DRIVE DISCOVERY
// -----------------------------------------------------
async function fetchDriveAlbums() {
  const statusEl = document.getElementById("driveStatusText");
  const config = window.DRIVE_CONFIG || {};
  const { folderId, apiKey } = config;

  if (!folderId || !apiKey) {
    if (statusEl) statusEl.textContent = "Offline";
    return;
  }

  try {
    const folderQuery = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const foldersRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)&pageSize=100&key=${apiKey}`);
    const foldersData = await foldersRes.json();

    if (foldersData.error) throw new Error(foldersData.error.message);

    let driveFolders = foldersData.files || [];
    if (driveFolders.length === 0) {
      driveFolders = [{ id: folderId, name: "Drive Tracks" }];
    }

    const albums = [];
    let allSongsAccumulator = [];

    for (const folder of driveFolders) {
      const contentsQuery = encodeURIComponent(`'${folder.id}' in parents and (mimeType contains 'audio/' or mimeType contains 'image/') and trashed = false`);
      const contentsRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${contentsQuery}&fields=files(id,name,mimeType)&pageSize=500&key=${apiKey}`);
      const contentsData = await contentsRes.json();

      const items = contentsData.files || [];
      const audioFiles = items.filter(it => it.mimeType.startsWith("audio/"));
      const imageFiles = items.filter(it => it.mimeType.startsWith("image/"));

      const coverFile = imageFiles.find(img => /cover|folder|album|art/i.test(img.name)) || imageFiles[0];
      const coverUrl = coverFile ? getDriveDirectImageUrl(coverFile.id) : "assets/default-cover.png";

      const songs = audioFiles.map(af => {
        const streamUrls = getDriveMediaUrls(af.id, apiKey);
        return {
          id: af.id,
          name: af.name.replace(/\.[^/.]+$/, ""),
          url: streamUrls.primary,
          fallbackUrl: streamUrls.fallback1,
          secondaryFallbackUrl: streamUrls.fallback2,
          cover: coverUrl,
          albumName: folder.name,
          albumId: folder.id,
          isLocal: false
        };
      }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      albums.push({
        id: folder.id,
        name: folder.name,
        coverUrl: coverUrl,
        songs: songs
      });

      allSongsAccumulator = allSongsAccumulator.concat(songs);
    }

    state.albums = albums;
    state.allDriveSongs = allSongsAccumulator;

    await syncPhysicalDownloadsState();
    renderFeaturedAlbumsDeck();

    if (statusEl) {
      statusEl.textContent = `Online (${allSongsAccumulator.length})`;
    }

  } catch (err) {
    console.error("Drive error:", err);
    if (statusEl) statusEl.textContent = "Offline";
  }
}

// -----------------------------------------------------
// PHYSICAL STORAGE SYNC & DOWNLOAD/CANCEL
// -----------------------------------------------------
async function syncPhysicalDownloadsState() {
  const storedRegistry = JSON.parse(localStorage.getItem("downloadRegistry") || "{}");
  const updatedRegistry = {};

  for (const songId in storedRegistry) {
    const item = storedRegistry[songId];
    const exists = await isFilePhysicallyPresent(item.fileName);
    if (exists) {
      updatedRegistry[songId] = item;
    }
  }

  state.downloadedFilesRegistry = updatedRegistry;
  localStorage.setItem("downloadRegistry", JSON.stringify(updatedRegistry));
}

async function handleDownloadRequest(song, btnEl) {
  if (state.activeDownloads.has(song.id)) {
    const controller = state.activeDownloads.get(song.id);
    controller.abort();
    state.activeDownloads.delete(song.id);

    if (btnEl) {
      btnEl.classList.remove("is-loading");
      btnEl.innerHTML = "⬇";
      btnEl.title = "Download cancelled";
    }
    showStorageToast("Download Cancelled", song.name, "✕");
    updateFullPlayerDownloadButton();
    return;
  }

  const isDownloaded = !!state.downloadedFilesRegistry[song.id];
  if (isDownloaded) {
    const item = state.downloadedFilesRegistry[song.id];
    showStorageToast("File Stored", item.filePath, "✅");
    return;
  }

  const controller = new AbortController();
  state.activeDownloads.set(song.id, controller);

  try {
    if (btnEl) {
      btnEl.classList.add("is-loading");
      btnEl.innerHTML = getCircularSpinnerSvg();
      btnEl.title = "Click to Cancel";
    }

    const { fileName, filePath } = await downloadAudioToPhoneStorage(song, controller.signal);

    state.activeDownloads.delete(song.id);
    state.downloadedFilesRegistry[song.id] = { fileName, filePath };
    localStorage.setItem("downloadRegistry", JSON.stringify(state.downloadedFilesRegistry));

    showStorageToast("Download Complete", filePath, "📥");

    if (btnEl) {
      btnEl.classList.remove("is-loading");
      btnEl.classList.add("downloaded-badge");
      btnEl.innerHTML = "✔";
      btnEl.title = "Saved in Storage";
    }

    updateFullPlayerDownloadButton();
    renderFeaturedAlbumsDeck();

  } catch (err) {
    state.activeDownloads.delete(song.id);

    if (err.name === "AbortError" || err.message === "Aborted") {
      if (btnEl) {
        btnEl.classList.remove("is-loading");
        btnEl.innerHTML = "⬇";
        btnEl.title = "Download to Phone";
      }
    } else {
      console.error("Download failed:", err);
      showCustomConfirm(
        "Google Drive Limit Reached",
        `This file cannot be downloaded right now because Google Drive's daily bandwidth quota has been exceeded for this track. Please wait a few hours or play another song.`,
        "Understood",
        "⚠️"
      );
      if (btnEl) {
        btnEl.classList.remove("is-loading");
        btnEl.innerHTML = "⬇";
      }
    }
  }
}

async function removeDownloadedTrack(song, event) {
  if (event) event.stopPropagation();

  const item = state.downloadedFilesRegistry[song.id];
  if (!item) return;

  const confirmed = await showCustomConfirm(
    "Delete Audio File",
    `Are you sure you want to delete "${song.name}" from your phone storage?`,
    "Delete",
    "🗑️",
    true
  );
  if (!confirmed) return;

  await deleteAudioFromPhoneStorage(item.fileName, song.id);

  delete state.downloadedFilesRegistry[song.id];
  localStorage.setItem("downloadRegistry", JSON.stringify(state.downloadedFilesRegistry));

  showStorageToast("File Deleted", item.fileName, "🗑️");

  renderFeaturedAlbumsDeck();
  updateFullPlayerDownloadButton();

  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen?.id === "screen-album-detail") {
    openAlbumDetail("DOWNLOADED");
  }
}

// -----------------------------------------------------
// BATCH ALBUM DOWNLOADER WITH CANCEL BUTTON
// -----------------------------------------------------
async function downloadEntireAlbum(songs, albumTitle) {
  if (!songs || !songs.length) return;

  const btn = document.getElementById("detailDownloadAlbumBtn");

  if (state.batchDownloadQueue && state.batchDownloadQueue.isRunning) {
    state.batchDownloadQueue.cancelRequested = true;

    for (const song of songs) {
      if (state.activeDownloads.has(song.id)) {
        const controller = state.activeDownloads.get(song.id);
        controller.abort();
        state.activeDownloads.delete(song.id);
      }
    }

    if (btn) {
      btn.textContent = "⬇ Download Album";
      btn.classList.remove("is-cancelling");
    }

    showStorageToast("Batch Cancelled", "Album download was stopped.", "✕");
    renderFeaturedAlbumsDeck();
    return;
  }

  state.batchDownloadQueue = {
    isRunning: true,
    cancelRequested: false,
    albumId: songs[0]?.albumId
  };

  if (btn) {
    btn.textContent = "✖ Cancel Album Download";
    btn.classList.add("is-cancelling");
  }

  let downloadedCount = 0;

  for (let i = 0; i < songs.length; i++) {
    if (state.batchDownloadQueue.cancelRequested) break;

    const song = songs[i];

    if (!state.downloadedFilesRegistry[song.id] && !song.isLocal) {
      const rowEl = document.querySelector(`.track-item-row[data-song-id="${song.id}"]`);
      const rowDlBtn = rowEl ? rowEl.querySelector(".row-download-btn") : null;

      if (rowDlBtn) {
        rowDlBtn.classList.add("is-loading");
        rowDlBtn.innerHTML = getCircularSpinnerSvg();
      }

      const controller = new AbortController();
      state.activeDownloads.set(song.id, controller);

      try {
        const downloadResult = await downloadAudioToPhoneStorage(song, controller.signal);
        state.activeDownloads.delete(song.id);

        state.downloadedFilesRegistry[song.id] = { fileName: downloadResult.fileName, filePath: downloadResult.filePath };
        downloadedCount++;

        if (rowDlBtn) {
          rowDlBtn.classList.remove("is-loading");
          rowDlBtn.classList.add("downloaded-badge");
          rowDlBtn.innerHTML = "✔";
        }
      } catch (err) {
        state.activeDownloads.delete(song.id);
        if (rowDlBtn) {
          rowDlBtn.classList.remove("is-loading");
          rowDlBtn.innerHTML = "⬇";
        }
      }
    }
  }

  const wasCancelled = state.batchDownloadQueue.cancelRequested;
  state.batchDownloadQueue = null;

  localStorage.setItem("downloadRegistry", JSON.stringify(state.downloadedFilesRegistry));

  if (btn) {
    btn.classList.remove("is-cancelling");
    btn.textContent = wasCancelled ? "⬇ Download Album" : "✔ Album Downloaded";
  }

  if (!wasCancelled) {
    showStorageToast("Album Saved", `${downloadedCount} tracks saved to DidodeMusic`, "📥");
  }

  renderFeaturedAlbumsDeck();
}

// -----------------------------------------------------
// DECK RENDERING
// -----------------------------------------------------
function renderFeaturedAlbumsDeck() {
  const container = document.getElementById("featuredAlbumsDeck");
  if (!container) return;

  container.innerHTML = "";

  const mainItems = [
    { id: "DOWNLOADED", name: "Offline Saved", coverUrl: "assets/cover-a.png", countText: `${getSongsByAlbumId("DOWNLOADED").length} Saved` },
    { id: "LOCAL", name: "Device Files", coverUrl: "assets/cover-local.png", countText: `${state.localSongs.length} Files` },
    { id: "FAV", name: "Favorites", coverUrl: "assets/cover-fav.png", countText: `${getSongsByAlbumId("FAV").length} Songs` }
  ];

  state.albums.slice(0, 5).forEach(alb => {
    mainItems.push({
      id: alb.id,
      name: alb.name,
      coverUrl: alb.coverUrl,
      countText: `${alb.songs.length} Tracks`
    });
  });

  mainItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "square-card";
    card.innerHTML = `
      <div class="square-thumb">
        <img src="${item.coverUrl}" alt="${item.name}" onerror="this.src='assets/default-cover.png'">
      </div>
      <strong>${item.name}</strong>
      <small>${item.countText}</small>
    `;
    card.addEventListener("click", () => openAlbumDetail(item.id));
    container.appendChild(card);
  });
}

function buildSongRow(song, onPlay, viewType = "normal") {
  const row = document.createElement("div");
  row.className = "track-item-row";
  row.dataset.songId = song.id;

  const isDownloaded = !!state.downloadedFilesRegistry[song.id];
  const isCurrentlyLoading = state.activeDownloads.has(song.id);

  let actionHtml = "";
  if (viewType === "favorites") {
    actionHtml = `<button class="row-unfav-btn" title="Remove Favorite" aria-label="Remove favorite">💔</button>`;
  } else if (viewType === "local") {
    actionHtml = `<button class="row-delete-btn" title="Delete Local File" aria-label="Delete local file">🗑</button>`;
  } else if (viewType === "downloaded") {
    actionHtml = `<button class="row-delete-btn" title="Delete from Storage" aria-label="Delete file">🗑</button>`;
  } else {
    actionHtml = `<button class="row-action-btn" aria-label="Play song">▶</button>`;
  }

  let downloadBtnInner = isDownloaded ? "✔" : "⬇";
  if (isCurrentlyLoading) {
    downloadBtnInner = getCircularSpinnerSvg();
  }

  const downloadBtnHtml = (!song.isLocal && viewType !== "downloaded")
    ? `<button class="row-download-btn ${isDownloaded ? 'downloaded-badge' : ''} ${isCurrentlyLoading ? 'is-loading' : ''}" title="${isDownloaded ? 'Saved in Storage' : (isCurrentlyLoading ? 'Click to Cancel' : 'Download to Phone')}" aria-label="Download">${downloadBtnInner}</button>`
    : "";

  row.innerHTML = `
    <img src="${song.cover}" alt="cover" loading="lazy" onerror="this.src='assets/default-cover.png'">
    <div class="track-meta-box">
      <strong>${song.name}</strong>
      <small>${song.isLocal ? "Device File" : (song.albumName || "Drive Audio")}</small>
    </div>
    <div class="track-row-actions">
      ${downloadBtnHtml}
      ${actionHtml}
    </div>
  `;

  row.addEventListener("click", onPlay);

  const dlBtn = row.querySelector(".row-download-btn");
  dlBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleDownloadRequest(song, dlBtn);
  });

  if (viewType === "favorites") {
    row.querySelector(".row-unfav-btn")?.addEventListener("click", (e) => removeSingleFavorite(song.id, e));
  } else if (viewType === "local") {
    row.querySelector(".row-delete-btn")?.addEventListener("click", (e) => removeLocalUploadedFile(song.id, e));
  } else if (viewType === "downloaded") {
    row.querySelector(".row-delete-btn")?.addEventListener("click", (e) => removeDownloadedTrack(song, e));
  }

  return row;
}

// -----------------------------------------------------
// ALBUM DRILL-DOWN
// -----------------------------------------------------
function getSongsByAlbumId(albumId) {
  if (albumId === "FAV") {
    const all = [...state.allDriveSongs, ...state.localSongs];
    return all.filter(s => state.favorites.includes(s.id));
  } else if (albumId === "LOCAL") {
    return state.localSongs;
  } else if (albumId === "DOWNLOADED") {
    const all = [...state.allDriveSongs, ...state.localSongs];
    return all.filter(s => !!state.downloadedFilesRegistry[s.id]);
  } else {
    const album = state.albums.find(a => a.id === albumId);
    return album ? album.songs : [];
  }
}

function getAlbumMetadata(albumId) {
  if (albumId === "FAV") {
    return { title: "Favorites", cover: "assets/cover-fav.png" };
  } else if (albumId === "LOCAL") {
    return { title: "Device Files", cover: "assets/cover-local.png" };
  } else if (albumId === "DOWNLOADED") {
    return { title: "Offline Downloads", cover: "assets/cover-a.png" };
  } else {
    const album = state.albums.find(a => a.id === albumId);
    return album
      ? { title: album.name, cover: album.coverUrl }
      : { title: "Album", cover: "assets/default-cover.png" };
  }
}

function openAlbumDetail(albumId) {
  const meta = getAlbumMetadata(albumId);
  const songs = getSongsByAlbumId(albumId);

  const coverEl = document.getElementById("detailCoverImg");
  const titleEl = document.getElementById("detailAlbumTitle");
  const countEl = document.getElementById("detailTrackCount");
  const playAllBtn = document.getElementById("detailPlayAllBtn");
  const downloadAlbumBtn = document.getElementById("detailDownloadAlbumBtn");
  const clearFavBtn = document.getElementById("detailClearFavBtn");
  const clearLocalBtn = document.getElementById("detailClearLocalBtn");
  const listContainer = document.getElementById("detailSongList");

  if (coverEl) coverEl.src = meta.cover;
  if (titleEl) titleEl.textContent = meta.title;
  if (countEl) countEl.textContent = `${songs.length} Tracks available`;

  if (downloadAlbumBtn) {
    const isDriveAlbum = albumId !== "LOCAL" && albumId !== "DOWNLOADED" && albumId !== "FAV";
    downloadAlbumBtn.style.display = (isDriveAlbum && songs.length > 0) ? "inline-block" : "none";

    const isCurrentlyRunning = state.batchDownloadQueue && state.batchDownloadQueue.albumId === albumId;
    downloadAlbumBtn.textContent = isCurrentlyRunning ? "✖ Cancel Album Download" : "⬇ Download Album";
    downloadAlbumBtn.classList.toggle("is-cancelling", isCurrentlyRunning);

    downloadAlbumBtn.onclick = () => downloadEntireAlbum(songs, meta.title);
  }

  if (clearFavBtn) {
    clearFavBtn.style.display = (albumId === "FAV" && songs.length > 0) ? "inline-block" : "none";
    clearFavBtn.onclick = clearAllFavorites;
  }

  if (clearLocalBtn) {
    clearLocalBtn.style.display = (albumId === "LOCAL" && songs.length > 0) ? "inline-block" : "none";
    clearLocalBtn.onclick = clearAllLocalFiles;
  }

  if (playAllBtn) {
    playAllBtn.onclick = () => {
      if (songs.length) {
        state.queue = songs;
        playSongAt(0);
      }
    };
  }

  let viewType = "normal";
  if (albumId === "FAV") viewType = "favorites";
  else if (albumId === "LOCAL") viewType = "local";
  else if (albumId === "DOWNLOADED") viewType = "downloaded";

  if (listContainer) {
    listContainer.innerHTML = "";
    if (!songs.length) {
      listContainer.innerHTML = `<p class="status-indicator">No tracks inside this category.</p>`;
    } else {
      songs.forEach((song, idx) => {
        listContainer.appendChild(buildSongRow(song, () => {
          state.queue = songs;
          playSongAt(idx);
        }, viewType));
      });
    }
  }

  showScreen("screen-album-detail");
}

// -----------------------------------------------------
// LOCAL UPLOAD DELETIONS
// -----------------------------------------------------
async function removeLocalUploadedFile(trackId, event) {
  if (event) event.stopPropagation();

  const confirmed = await showCustomConfirm(
    "Delete Uploaded File",
    "Are you sure you want to remove this uploaded audio file from the app?",
    "Delete",
    "🗑️",
    true
  );
  if (!confirmed) return;

  await deleteLocalTrackFromDB(trackId);
  state.localSongs = state.localSongs.filter(s => s.id !== trackId);

  renderFeaturedAlbumsDeck();
  openAlbumDetail("LOCAL");
}

async function clearAllLocalFiles() {
  if (!state.localSongs.length) return;

  const confirmed = await showCustomConfirm(
    "Delete All Local Files",
    "Are you sure you want to delete all uploaded audio files completely?",
    "Delete All",
    "🗑️",
    true
  );
  if (!confirmed) return;

  await clearAllLocalTracksFromDB();
  state.localSongs = [];

  renderFeaturedAlbumsDeck();
  openAlbumDetail("LOCAL");
}

// -----------------------------------------------------
// FAVORITE CLEARANCES
// -----------------------------------------------------
async function removeSingleFavorite(songId, event) {
  if (event) event.stopPropagation();

  const confirmed = await showCustomConfirm(
    "Remove Favorite",
    "Remove this track from your favorites?",
    "Remove",
    "💔"
  );
  if (!confirmed) return;

  state.favorites = state.favorites.filter(id => id !== songId);
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));

  updateLikeIcons();
  renderFeaturedAlbumsDeck();

  const activeScreen = document.querySelector(".screen.active");
  if (activeScreen?.id === "screen-album-detail") {
    const title = document.getElementById("detailAlbumTitle")?.textContent;
    if (title === "Favorites") openAlbumDetail("FAV");
  }
}

async function clearAllFavorites() {
  if (!state.favorites.length) return;

  const confirmed = await showCustomConfirm(
    "Clear All Favorites",
    "Clear all favorite tracks completely?",
    "Clear All",
    "💔",
    true
  );
  if (!confirmed) return;

  state.favorites = [];
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));

  updateLikeIcons();
  renderFeaturedAlbumsDeck();
  openAlbumDetail("FAV");
}

// -----------------------------------------------------
// RECENTLY PLAYED MANAGEMENT
// -----------------------------------------------------
function saveToRecentlyPlayed(song) {
  let stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  stored = stored.filter(s => s.id !== song.id);
  stored.unshift(song);
  stored = stored.slice(0, 15);
  localStorage.setItem("recentlyPlayed", JSON.stringify(stored));
  renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
  const container = document.getElementById("recentCardsDeck");
  const clearBtn = document.getElementById("clearRecentBtn");
  const countTag = document.getElementById("recentCountTag");
  if (!container) return;

  const stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");

  if (countTag) countTag.textContent = stored.length;

  if (clearBtn) {
    clearBtn.style.display = stored.length > 0 ? "inline-block" : "none";
  }

  if (!stored.length) {
    container.innerHTML = `<p class="status-indicator">No recent tracks.</p>`;
    return;
  }

  container.innerHTML = "";
  stored.forEach((song) => {
    const card = document.createElement("div");
    card.className = "square-card";
    card.innerHTML = `
      <div class="square-thumb">
        <img src="${song.cover}" alt="cover" onerror="this.src='assets/default-cover.png'">
      </div>
      <strong>${song.name}</strong>
      <small>${song.isLocal ? "Local" : (song.albumName || "Drive")}</small>
    `;
    card.addEventListener("click", () => {
      const all = [...state.allDriveSongs, ...state.localSongs];
      state.queue = [song, ...all.filter(s => s.id !== song.id)];
      playSongAt(0);
    });
    container.appendChild(card);
  });
}

document.getElementById("clearRecentBtn")?.addEventListener("click", async () => {
  const confirmed = await showCustomConfirm(
    "Clear Recent History",
    "Clear your recently played history?",
    "Clear",
    "🕒"
  );
  if (confirmed) {
    localStorage.removeItem("recentlyPlayed");
    renderRecentlyPlayed();
  }
});

// -----------------------------------------------------
// LOCAL AUDIO UPLOAD
// -----------------------------------------------------
const localFileInput = document.getElementById("localFileInput");

async function handleLocalFiles(files) {
  if (!files || !files.length) return;

  const validFiles = Array.from(files).filter(file => {
    return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name);
  });

  if (!validFiles.length) {
    showCustomConfirm("Format Notice", "Please select valid audio files (.mp3, .m4a, .wav, .aac, .flac).", "OK", "📁");
    return;
  }

  for (const file of validFiles) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const trackId = "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);

    const record = {
      id: trackId,
      name: cleanName,
      blob: file,
      cover: "assets/cover-local.png",
      albumName: "Device Files",
      isLocal: true
    };

    await saveLocalTrackToDB(record);

    state.localSongs.push({
      ...record,
      url: URL.createObjectURL(file)
    });
  }

  renderFeaturedAlbumsDeck();
  openAlbumDetail("LOCAL");
}

localFileInput?.addEventListener("change", (e) => {
  handleLocalFiles(e.target.files);
  e.target.value = "";
});

// -----------------------------------------------------
// AUDIO PLAYBACK ENGINE WITH AUTOMATIC FAIL-SAFE
// -----------------------------------------------------
async function playSongAt(index) {
  if (!state.queue.length) return;
  state.currentIndex = index;
  const song = state.queue[index];

  audioEl.pause();
  audioEl.currentTime = 0;

  // Check if downloaded offline in phone storage first
  let playSourceUrl = song.url;
  const isDownloaded = !!state.downloadedFilesRegistry[song.id];

  if (isDownloaded && hasNativeFilesystem()) {
    try {
      const { Filesystem, Directory } = Capacitor.Plugins;
      const fileUri = await Filesystem.getUri({
        path: `DidodeMusic/${state.downloadedFilesRegistry[song.id].fileName}`,
        directory: Directory.Documents
      });
      playSourceUrl = Capacitor.convertFileSrc(fileUri.uri);
    } catch (e) {
      console.warn("Could not load local offline file, falling back to stream:", e);
    }
  }

  const candidateUrls = [
    playSourceUrl,
    song.fallbackUrl,
    song.secondaryFallbackUrl,
    `https://docs.google.com/uc?export=download&id=${song.id}`,
    `https://drive.google.com/uc?export=download&id=${song.id}`
  ].filter(Boolean);

  let currentAttemptIdx = 0;

  function attemptPlayStream() {
    if (currentAttemptIdx >= candidateUrls.length) {
      state.isPlaying = false;
      updatePlayIcons();
      showCustomConfirm(
        "Google Drive Playback Blocked",
        `Google Drive has temporarily blocked direct streaming for "${song.name}" due to rate limits. Please download the track for offline listening or choose another one.`,
        "Got It",
        "⚠️",
        true
      );
      return;
    }

    const currentUrl = candidateUrls[currentAttemptIdx];
    audioEl.src = currentUrl;
    audioEl.volume = state.volume;
    audioEl.load();

    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          state.isPlaying = true;
          updatePlayIcons();
        })
        .catch(err => {
          console.warn(`Stream candidate ${currentAttemptIdx + 1} failed, trying failover...`, err);
          currentAttemptIdx++;
          attemptPlayStream();
        });
    }
  }

  attemptPlayStream();

  const heroArtwork = document.getElementById("heroArtwork");
  const fullArtwork = document.getElementById("fullArtwork");
  const dockedArtwork = document.getElementById("dockedArtwork");
  const heroAmbientGlow = document.getElementById("heroAmbientGlow");

  if (heroArtwork) heroArtwork.src = song.cover;
  if (fullArtwork) fullArtwork.src = song.cover;
  if (dockedArtwork) dockedArtwork.src = song.cover;

  if (heroAmbientGlow) {
    heroAmbientGlow.style.backgroundImage = `url('${song.cover}')`;
  }

  document.getElementById("heroTrackTitle").textContent = song.name;
  document.getElementById("heroTrackArtist").textContent = song.isLocal ? "Device File" : (song.albumName || "Drive Audio");

  document.getElementById("dockedTrackTitle").textContent = song.name;
  document.getElementById("dockedTrackArtist").textContent = song.isLocal ? "Device File" : (song.albumName || "Drive Audio");

  document.getElementById("fullTrackTitle").textContent = song.name;
  document.getElementById("fullTrackArtist").textContent = song.isLocal ? "Device File" : (song.albumName || "Drive Audio");
  document.getElementById("fullPlayerSource").textContent = isDownloaded ? "Offline Storage" : (song.isLocal ? "Local Storage" : (song.albumName || "Drive Album"));

  updatePlayIcons();
  updateLikeIcons();
  updateFullPlayerDownloadButton();
  saveToRecentlyPlayed(song);
  syncDockedBarVisibility();
}

function updateFullPlayerDownloadButton() {
  const btn = document.getElementById("fullDownloadActionBtn");
  if (!btn) return;
  const currentSong = state.queue[state.currentIndex];
  if (!currentSong || currentSong.isLocal) {
    btn.style.display = "none";
    return;
  }
  btn.style.display = "flex";

  const isDownloaded = !!state.downloadedFilesRegistry[currentSong.id];
  const isCurrentlyLoading = state.activeDownloads.has(currentSong.id);

  btn.classList.toggle("is-loading", isCurrentlyLoading);
  btn.classList.toggle("downloaded-badge", isDownloaded && !isCurrentlyLoading);

  if (isCurrentlyLoading) {
    btn.innerHTML = getCircularSpinnerSvg();
    btn.title = "Click to Cancel";
  } else if (isDownloaded) {
    btn.innerHTML = "✔";
    btn.title = "Saved in Storage";
  } else {
    btn.innerHTML = "⬇";
    btn.title = "Download to Phone";
  }

  btn.onclick = () => handleDownloadRequest(currentSong, btn);
}

function togglePlayPause() {
  if (!audioEl.src) return;

  if (state.isPlaying) {
    audioEl.pause();
    state.isPlaying = false;
  } else {
    audioEl.play().catch(e => console.warn(e));
    state.isPlaying = true;
  }
  updatePlayIcons();
}

function updatePlayIcons() {
  const icon = state.isPlaying ? "❚❚" : "▶";
  const heroPlayIcon = document.getElementById("heroPlayIcon");
  const dockedPlayBtn = document.getElementById("dockedPlayBtn");
  const fullPlayIcon = document.getElementById("fullPlayIcon");

  if (heroPlayIcon) heroPlayIcon.textContent = icon;
  if (dockedPlayBtn) dockedPlayBtn.textContent = icon;
  if (fullPlayIcon) fullPlayIcon.textContent = icon;
}

function playNext() {
  if (!state.queue.length) return;
  const nextIdx = state.isShuffle
    ? Math.floor(Math.random() * state.queue.length)
    : (state.currentIndex + 1) % state.queue.length;
  playSongAt(nextIdx);
}

function playPrev() {
  if (!state.queue.length) return;
  const prevIdx = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playSongAt(prevIdx);
}

audioEl.addEventListener("ended", () => {
  if (state.repeatMode === 2) {
    audioEl.currentTime = 0;
    audioEl.play().catch(err => console.warn(err));
  } else if (state.repeatMode === 1) {
    playNext();
  } else {
    if (state.currentIndex < state.queue.length - 1) {
      playNext();
    } else {
      state.isPlaying = false;
      updatePlayIcons();
    }
  }
});

audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration) return;
  const progressPercent = (audioEl.currentTime / audioEl.duration) * 100;

  const heroSeekBar = document.getElementById("heroSeekBar");
  const fullSeekBar = document.getElementById("fullSeekBar");

  if (heroSeekBar) heroSeekBar.value = progressPercent;
  if (fullSeekBar) fullSeekBar.value = progressPercent;

  const curFormatted = formatTime(audioEl.currentTime);
  const durFormatted = formatTime(audioEl.duration);

  document.getElementById("heroCurrentTime").textContent = curFormatted;
  document.getElementById("heroDurationTime").textContent = durFormatted;
  document.getElementById("fullCurrentTime").textContent = curFormatted;
  document.getElementById("fullDurationTime").textContent = durFormatted;
});

function handleSeekInput(val) {
  if (!audioEl.duration) return;
  audioEl.currentTime = (val / 100) * audioEl.duration;
}

document.getElementById("heroSeekBar")?.addEventListener("input", (e) => handleSeekInput(e.target.value));
document.getElementById("fullSeekBar")?.addEventListener("input", (e) => handleSeekInput(e.target.value));

function formatTime(sec) {
  if (isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

document.getElementById("heroPlayBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePlayPause();
});
document.getElementById("dockedPlayBtn")?.addEventListener("click", togglePlayPause);
document.getElementById("fullPlayBtn")?.addEventListener("click", togglePlayPause);

document.getElementById("heroNextBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playNext();
});
document.getElementById("dockedNextBtn")?.addEventListener("click", playNext);
document.getElementById("fullNextBtn")?.addEventListener("click", playNext);

document.getElementById("heroPrevBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playPrev();
});
document.getElementById("dockedPrevBtn")?.addEventListener("click", playPrev);
document.getElementById("fullPrevBtn")?.addEventListener("click", playPrev);

document.getElementById("heroSeekBar")?.addEventListener("click", (e) => e.stopPropagation());

function toggleShuffle() {
  state.isShuffle = !state.isShuffle;
  document.getElementById("heroShuffleBtn")?.classList.toggle("active-toggle", state.isShuffle);
  document.getElementById("fullShuffleBtn")?.classList.toggle("active-toggle", state.isShuffle);
}

document.getElementById("heroShuffleBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleShuffle();
});
document.getElementById("fullShuffleBtn")?.addEventListener("click", toggleShuffle);

function cycleRepeat() {
  state.repeatMode = (state.repeatMode + 1) % 3;
  updateRepeatUI();
}

function updateRepeatUI() {
  const heroRep = document.getElementById("heroRepeatBtn");
  const fullRep = document.getElementById("fullRepeatBtn");

  const iconsSvg = `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  `;

  [heroRep, fullRep].forEach(btn => {
    if (!btn) return;
    btn.innerHTML = iconsSvg;
    if (state.repeatMode === 0) {
      btn.classList.remove("active-toggle");
      btn.title = "Repeat Off";
    } else if (state.repeatMode === 1) {
      btn.classList.add("active-toggle");
      btn.title = "Repeat All";
    } else if (state.repeatMode === 2) {
      btn.classList.add("active-toggle");
      btn.innerHTML += `<span class="repeat-indicator-num">1</span>`;
      btn.title = "Repeat 1 Track";
    }
  });
}

document.getElementById("heroRepeatBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  cycleRepeat();
});
document.getElementById("fullRepeatBtn")?.addEventListener("click", cycleRepeat);

const fullVolumeSlider = document.getElementById("fullVolumeSlider");
const fullMuteBtn = document.getElementById("fullMuteBtn");
let lastVol = 1;

fullVolumeSlider?.addEventListener("input", (e) => {
  const vol = e.target.value / 100;
  audioEl.volume = vol;
  state.volume = vol;
});

fullMuteBtn?.addEventListener("click", () => {
  if (audioEl.volume > 0) {
    lastVol = audioEl.volume;
    audioEl.volume = 0;
    if (fullVolumeSlider) fullVolumeSlider.value = 0;
  } else {
    audioEl.volume = lastVol || 1;
    if (fullVolumeSlider) fullVolumeSlider.value = (lastVol || 1) * 100;
  }
});

function toggleFavoriteActive() {
  const song = state.queue[state.currentIndex];
  if (!song) return;
  const idx = state.favorites.indexOf(song.id);
  if (idx === -1) {
    state.favorites.push(song.id);
  } else {
    state.favorites.splice(idx, 1);
  }
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));
  updateLikeIcons();
  renderFeaturedAlbumsDeck();
}

document.getElementById("heroLikeBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFavoriteActive();
});
document.getElementById("fullLikeBtn")?.addEventListener("click", toggleFavoriteActive);

function updateLikeIcons() {
  const song = state.queue[state.currentIndex];
  const isFav = song && state.favorites.includes(song.id);

  document.getElementById("heroLikeBtn")?.classList.toggle("liked", isFav);
  document.getElementById("fullLikeBtn")?.classList.toggle("liked", isFav);
}

document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const searchBox = document.getElementById("searchResultsBox");
  const listContainer = document.getElementById("searchResultList");

  if (!q) {
    if (searchBox) searchBox.style.display = "none";
    return;
  }

  const allAvailable = [...state.allDriveSongs, ...state.localSongs];
  const filtered = allAvailable.filter(s => s.name.toLowerCase().includes(q) || (s.albumName && s.albumName.toLowerCase().includes(q)));

  if (searchBox) searchBox.style.display = "block";
  if (!listContainer) return;

  listContainer.innerHTML = "";
  if (!filtered.length) {
    listContainer.innerHTML = `<p class="status-indicator">No songs found matching "${q}".</p>`;
    return;
  }

  filtered.forEach(song => {
    listContainer.appendChild(buildSongRow(song, () => {
      state.queue = allAvailable;
      const idx = allAvailable.indexOf(song);
      playSongAt(idx);
    }));
  });
});

// -----------------------------------------------------
// APP BOOTSTRAP
// -----------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  renderVisualizer();
  updateRepeatUI();
  renderRecentlyPlayed();
  setupHeroPlayerExpansion();

  try {
    await initDB();
    const savedTracks = await getAllLocalTracksFromDB();
    if (savedTracks && savedTracks.length > 0) {
      state.localSongs = savedTracks.map(t => ({
        ...t,
        url: URL.createObjectURL(t.blob)
      }));
    }
  } catch (err) {
    console.error("IndexedDB error:", err);
  }

  await syncPhysicalDownloadsState();
  renderFeaturedAlbumsDeck();

  if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
    fetchDriveAlbums();
  }
});
