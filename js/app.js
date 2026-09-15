// =================================================================
// Didode Music Player - 5 Featured Albums & Uniform Carousel Engine
// =================================================================

const state = {
  albums: [],          // [{ id, name, coverUrl, songs: [] }]
  allDriveSongs: [],   // Flattened list of Drive songs
  localSongs: [],      // Stored local audio files
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0,       // 0 = Off, 1 = Repeat All, 2 = Repeat 1 (Single)
  favorites: JSON.parse(localStorage.getItem("favoriteSongs") || "[]"),
  volume: 1
};

const audioEl = document.getElementById("audioEl");

function getDriveDirectImageUrl(fileId) {
  if (!fileId) return "assets/default-cover.png";
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

// -----------------------------------------------------
// CUSTOM IN-APP CONFIRMATION MODAL
// -----------------------------------------------------
function showCustomConfirm(title, message, confirmText = "Confirm", icon = "🗑️") {
  return new Promise((resolve) => {
    const modalBackdrop = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalDesc = document.getElementById("modalDesc");
    const modalIcon = document.getElementById("modalIcon");
    const confirmBtn = document.getElementById("modalConfirmBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    if (!modalBackdrop || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    if (modalTitle) modalTitle.textContent = title;
    if (modalDesc) modalDesc.textContent = message;
    if (modalIcon) modalIcon.textContent = icon;
    if (confirmBtn) confirmBtn.textContent = confirmText;

    modalBackdrop.classList.add("active");

    function cleanup(result) {
      modalBackdrop.classList.remove("active");
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
// STABLE EQUALIZER VISUALIZER ENGINE
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
        const wave1 = Math.sin(t + i * 0.45);
        const wave2 = Math.cos(t * 0.7 + i * 0.3);
        const amplitude = Math.abs(wave1 + wave2) / 2;
        barHeight = Math.max(5, amplitude * (canvas.height - 4));
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
// NAVIGATION
// -----------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.target === id);
  });
}

document.querySelectorAll(".nav-btn, .nav-back").forEach(btn => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById("panel-" + btn.dataset.tab);
    if (panel) panel.classList.add("active");
  });
});

document.getElementById("seeAllAlbumsBtn")?.addEventListener("click", () => {
  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="playlists"]')?.click();
});

// Home Favorites Banner Handlers
document.getElementById("homeFavBanner")?.addEventListener("click", () => {
  openAlbumDetail("FAV");
});

document.getElementById("homeFavPlayBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  playAlbumDirectly("FAV");
});

// -----------------------------------------------------
// GOOGLE DRIVE ALBUM DISCOVERY
// -----------------------------------------------------
async function fetchDriveAlbums() {
  const statusEl = document.getElementById("driveStatus");
  const config = window.DRIVE_CONFIG || {};
  const { folderId, apiKey } = config;

  if (!folderId || !apiKey) {
    if (statusEl) statusEl.textContent = "Google Drive Config Missing.";
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

      const songs = audioFiles.map(af => ({
        id: af.id,
        name: af.name.replace(/\.[^/.]+$/, ""),
        url: `https://www.googleapis.com/drive/v3/files/${af.id}?alt=media&key=${apiKey}`,
        cover: coverUrl,
        albumName: folder.name,
        albumId: folder.id,
        isLocal: false
      })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

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

    renderTwoTierAlbums();
    renderAllSongsList();

    if (statusEl) {
      statusEl.textContent = allSongsAccumulator.length 
        ? `${allSongsAccumulator.length} tracks loaded across ${albums.length} albums.` 
        : "No audio tracks found in this Drive folder.";
    }

  } catch (err) {
    console.error("Failed to load albums from Drive:", err);
    if (statusEl) statusEl.textContent = "Error connecting to Google Drive. Check permissions.";
  }
}

// -----------------------------------------------------
// TWO-TIER ALBUM RENDERING: 5 IN FEATURED & UNIFORM EXPLORE
// -----------------------------------------------------
function renderTwoTierAlbums() {
  const mainCarousel = document.getElementById("homeMainAlbums");
  const exploreRow = document.getElementById("homeExploreAlbums");
  const libraryAlbumList = document.getElementById("libraryAlbumList");

  if (!mainCarousel || !exploreRow || !libraryAlbumList) return;

  // 1. Featured Section: Top 5 Albums (Device, Favorites + 3 Drive Albums)
  mainCarousel.innerHTML = "";

  const mainFive = [
    { id: "LOCAL", name: "Device Files", coverUrl: "assets/cover-local.png", countText: `${state.localSongs.length} Files` },
    { id: "FAV", name: "Favorites", coverUrl: "assets/cover-fav.png", countText: `${getSongsByAlbumId("FAV").length} Songs` }
  ];

  // Pick up to 3 albums from Drive to make total 5 featured albums
  const driveFeatured = state.albums.slice(0, 3);
  driveFeatured.forEach(alb => {
    mainFive.push({
      id: alb.id,
      name: alb.name,
      coverUrl: alb.coverUrl,
      countText: `${alb.songs.length} Tracks`
    });
  });

  mainFive.forEach(item => {
    const card = document.createElement("div");
    card.className = "main-album-card";
    card.innerHTML = `
      <div class="main-album-thumb">
        <img src="${item.coverUrl}" alt="${item.name} Cover" onerror="this.src='assets/default-cover.png'">
      </div>
      <strong>${item.name}</strong>
      <small>${item.countText}</small>
    `;
    card.addEventListener("click", () => openAlbumDetail(item.id));
    mainCarousel.appendChild(card);
  });

  // 2. Explore Albums: Remaining albums in a clean uniform scrollable row
  exploreRow.innerHTML = "";
  const remainingAlbums = state.albums.slice(3); // All albums after the first 3

  if (remainingAlbums.length === 0) {
    exploreRow.style.display = "none";
    document.querySelector(".section-header-split").style.display = "none";
  } else {
    exploreRow.style.display = "flex";
    document.querySelector(".section-header-split").style.display = "flex";

    remainingAlbums.forEach(album => {
      const card = document.createElement("div");
      card.className = "explore-album-card";
      card.innerHTML = `
        <div class="explore-thumb">
          <img src="${album.coverUrl}" alt="${album.name} Cover" onerror="this.src='assets/default-cover.png'">
        </div>
        <strong>${album.name}</strong>
        <small>${album.songs.length} Tracks</small>
      `;
      card.addEventListener("click", () => openAlbumDetail(album.id));
      exploreRow.appendChild(card);
    });
  }

  // 3. Library View: All Albums List (Full Complete List)
  libraryAlbumList.querySelectorAll(".dynamic-album-row").forEach(el => el.remove());

  state.albums.forEach(album => {
    const row = document.createElement("div");
    row.className = "playlist-row dynamic-album-row";
    row.dataset.albumId = album.id;
    row.innerHTML = `
      <img src="${album.coverUrl}" alt="${album.name} Cover" onerror="this.src='assets/default-cover.png'">
      <div>
        <strong>${album.name}</strong>
        <small>${album.songs.length} Songs</small>
      </div>
      <button class="row-play-btn" data-play-album="${album.id}" title="Play All">▶</button>
    `;

    row.addEventListener("click", () => openAlbumDetail(album.id));
    row.querySelector(".row-play-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      playAlbumDirectly(album.id);
    });

    libraryAlbumList.appendChild(row);
  });

  updateCounters();
}

function updateCounters() {
  const favCount = document.getElementById("countFav");
  const homeFavCount = document.getElementById("homeFavCount");
  const localCount = document.getElementById("countLocal");

  const favSongs = getSongsByAlbumId("FAV");
  const favText = `${favSongs.length} Songs`;

  if (favCount) favCount.textContent = favText;
  if (homeFavCount) homeFavCount.textContent = `${favSongs.length} Songs saved`;
  if (localCount) localCount.textContent = `${state.localSongs.length} Files`;
}

// -----------------------------------------------------
// ALBUM DETAIL DRILL-DOWN & FAVORITE MANAGEMENT
// -----------------------------------------------------
function getSongsByAlbumId(albumId) {
  if (albumId === "FAV") {
    const all = [...state.allDriveSongs, ...state.localSongs];
    return all.filter(s => state.favorites.includes(s.id));
  } else if (albumId === "LOCAL") {
    return state.localSongs;
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

  const coverEl = document.getElementById("volDetailCover");
  const titleEl = document.getElementById("volDetailTitle");
  const subEl = document.getElementById("volDetailSubtitle");
  const playAllBtn = document.getElementById("volDetailPlayAllBtn");
  const clearFavsBtn = document.getElementById("clearFavsInDetailBtn");
  const listContainer = document.getElementById("volDetailSongList");

  if (coverEl) coverEl.src = meta.cover;
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = `${songs.length} Tracks available`;

  if (clearFavsBtn) {
    clearFavsBtn.style.display = (albumId === "FAV" && songs.length > 0) ? "inline-block" : "none";
    clearFavsBtn.onclick = clearAllFavorites;
  }

  if (playAllBtn) {
    playAllBtn.onclick = () => {
      if (songs.length) {
        state.queue = songs;
        playSongAt(0);
        showScreen("screen-player");
      }
    };
  }

  if (listContainer) {
    listContainer.innerHTML = "";
    if (!songs.length) {
      listContainer.innerHTML = `<p class="status-text">No tracks inside this album.</p>`;
    } else {
      songs.forEach((song, idx) => {
        listContainer.appendChild(buildSongRow(song, () => {
          state.queue = songs;
          playSongAt(idx);
          showScreen("screen-player");
        }, albumId === "FAV"));
      });
    }
  }

  showScreen("screen-library");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-volume-detail")?.classList.add("active");
}

document.getElementById("backToVolumesBtn")?.addEventListener("click", () => {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-playlists")?.classList.add("active");
  document.querySelector('.tab-btn[data-tab="playlists"]')?.classList.add("active");
});

function playAlbumDirectly(albumId) {
  const songs = getSongsByAlbumId(albumId);
  if (songs.length) {
    state.queue = songs;
    playSongAt(0);
    showScreen("screen-player");
  } else if (albumId === "LOCAL") {
    showScreen("screen-library");
    document.querySelector('.tab-btn[data-tab="local"]')?.click();
  }
}

document.querySelectorAll(".playlist-row:not(.dynamic-album-row)").forEach(el => {
  el.addEventListener("click", () => openAlbumDetail(el.dataset.albumId));
  const playBtn = el.querySelector(".row-play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playAlbumDirectly(el.dataset.albumId);
    });
  }
});

// -----------------------------------------------------
// FAVORITES REMOVAL & CLEAN LOGIC
// -----------------------------------------------------
async function removeSingleFavorite(songId, event) {
  if (event) event.stopPropagation();

  const confirmed = await showCustomConfirm(
    "Remove Favorite",
    "Remove this track from your favorites list?",
    "Remove",
    "💔"
  );
  if (!confirmed) return;

  state.favorites = state.favorites.filter(id => id !== songId);
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));

  updateCounters();
  updateLikeIcon();

  const detailPanel = document.getElementById("panel-volume-detail");
  if (detailPanel?.classList.contains("active")) {
    const currentTitle = document.getElementById("volDetailTitle")?.textContent;
    if (currentTitle === "Favorites") {
      openAlbumDetail("FAV");
    }
  }
}

async function clearAllFavorites() {
  if (!state.favorites.length) return;

  const confirmed = await showCustomConfirm(
    "Clear All Favorites",
    "Are you sure you want to clear all favorite tracks?",
    "Clear All",
    "💔"
  );
  if (!confirmed) return;

  state.favorites = [];
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));

  updateCounters();
  updateLikeIcon();
  openAlbumDetail("FAV");
}

// -----------------------------------------------------
// LOCAL AUDIO MANAGEMENT (IndexedDB Permanent Sync)
// -----------------------------------------------------
const localFileInput = document.getElementById("localFileInput");
const clearAllBtn = document.getElementById("clearAllLocalBtn");

async function handleLocalFiles(files) {
  if (!files || !files.length) return;

  const validAudioFiles = Array.from(files).filter(file => {
    return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name);
  });

  if (!validAudioFiles.length) {
    alert("Please select supported audio files (.mp3, .m4a, .wav, .aac, .flac)");
    return;
  }

  for (const file of validAudioFiles) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    const trackId = "local-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);

    const trackRecord = {
      id: trackId,
      name: cleanName,
      blob: file,
      cover: "assets/cover-local.png",
      albumName: "Device Files",
      isLocal: true
    };

    await saveTrackToDB(trackRecord);

    state.localSongs.push({
      ...trackRecord,
      url: URL.createObjectURL(file)
    });
  }

  renderLocalSongs();
  renderTwoTierAlbums();

  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="local"]')?.click();
}

localFileInput?.addEventListener("change", (e) => {
  handleLocalFiles(e.target.files);
  e.target.value = "";
});

async function deleteLocalSong(songId, event) {
  if (event) event.stopPropagation();

  const confirmed = await showCustomConfirm(
    "Delete Track",
    "Remove this track from your local storage?",
    "Delete",
    "🗑️"
  );
  if (!confirmed) return;

  const songIndex = state.localSongs.findIndex(s => s.id === songId);
  if (songIndex === -1) return;

  const song = state.localSongs[songIndex];

  if (state.queue[state.currentIndex]?.id === song.id) {
    audioEl.pause();
    audioEl.src = "";
    state.isPlaying = false;
    updatePlayPauseIcon();
    document.getElementById("trackTitle").textContent = "No track loaded";
    document.getElementById("trackArtist").textContent = "—";
  }

  if (song.url && song.url.startsWith("blob:")) {
    URL.revokeObjectURL(song.url);
  }

  await deleteTrackFromDB(songId);
  state.localSongs.splice(songIndex, 1);

  state.favorites = state.favorites.filter(id => id !== songId);
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));

  let storedRecent = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  storedRecent = storedRecent.filter(s => s.id !== songId);
  localStorage.setItem("recentlyPlayed", JSON.stringify(storedRecent));

  renderLocalSongs();
  renderRecentlyPlayed();
  renderTwoTierAlbums();
}

async function clearAllLocalSongs() {
  if (!state.localSongs.length) return;

  const confirmed = await showCustomConfirm(
    "Clear All Local Tracks",
    "Permanently remove all saved local songs from this device?",
    "Clear All",
    "🗑️"
  );
  if (!confirmed) return;

  if (state.queue[state.currentIndex]?.isLocal) {
    audioEl.pause();
    audioEl.src = "";
    state.isPlaying = false;
    updatePlayPauseIcon();
    document.getElementById("trackTitle").textContent = "No track loaded";
    document.getElementById("trackArtist").textContent = "—";
  }

  state.localSongs.forEach(song => {
    if (song.url && song.url.startsWith("blob:")) {
      URL.revokeObjectURL(song.url);
    }
  });

  await clearAllTracksFromDB();
  state.localSongs = [];

  let storedRecent = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  storedRecent = storedRecent.filter(s => !s.isLocal);
  localStorage.setItem("recentlyPlayed", JSON.stringify(storedRecent));

  renderLocalSongs();
  renderRecentlyPlayed();
  renderTwoTierAlbums();
}

clearAllBtn?.addEventListener("click", clearAllLocalSongs);

function renderLocalSongs() {
  const container = document.getElementById("localSongsList");
  if (!container) return;

  if (!state.localSongs.length) {
    container.innerHTML = `<p class="status-text" id="localEmptyStatus">No local songs uploaded yet.</p>`;
    if (clearAllBtn) clearAllBtn.style.display = "none";
    return;
  }

  if (clearAllBtn) clearAllBtn.style.display = "inline-flex";

  container.innerHTML = "";
  state.localSongs.forEach((song, idx) => {
    const row = document.createElement("div");
    row.className = "song-row";
    row.innerHTML = `
      <img src="${song.cover}" alt="cover" onerror="this.src='assets/default-cover.png'">
      <div class="meta">
        <strong>${song.name}</strong>
        <small>Device File</small>
      </div>
      <div class="row-actions">
        <button class="delete-btn" title="Delete song" aria-label="Delete song">✕</button>
        <button class="play-btn-item" aria-label="Play song">▶</button>
      </div>
    `;

    row.addEventListener("click", () => {
      state.queue = state.localSongs;
      playSongAt(idx);
      showScreen("screen-player");
    });

    const delBtn = row.querySelector(".delete-btn");
    delBtn.addEventListener("click", (e) => deleteLocalSong(song.id, e));

    container.appendChild(row);
  });
}

// -----------------------------------------------------
// UI RENDERING (ALL SONGS & RECENT WITH CLEAR FEATURE)
// -----------------------------------------------------
function renderAllSongsList() {
  const container = document.getElementById("allSongsList");
  if (!container) return;

  if (!state.allDriveSongs.length) {
    container.innerHTML = `<p class="status-text">No tracks found in Google Drive.</p>`;
    return;
  }
  container.innerHTML = "";
  state.allDriveSongs.forEach((song, idx) => {
    container.appendChild(buildSongRow(song, () => {
      state.queue = state.allDriveSongs;
      playSongAt(idx);
      showScreen("screen-player");
    }));
  });
}

async function clearRecentlyPlayedHistory() {
  const stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  if (!stored.length) return;

  const confirmed = await showCustomConfirm(
    "Clear Recently Played",
    "Clear your recently played history?",
    "Clear",
    "🕒"
  );
  if (!confirmed) return;

  localStorage.removeItem("recentlyPlayed");
  renderRecentlyPlayed();
}

document.getElementById("clearRecentBtn")?.addEventListener("click", clearRecentlyPlayedHistory);

function renderRecentlyPlayed() {
  const container = document.getElementById("recentList");
  const clearRecentBtn = document.getElementById("clearRecentBtn");
  if (!container) return;

  const stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  
  if (clearRecentBtn) {
    clearRecentBtn.style.display = stored.length > 0 ? "inline-block" : "none";
  }

  if (!stored.length) {
    container.innerHTML = `<p class="status-text">No tracks played yet.</p>`;
    return;
  }

  container.innerHTML = "";
  stored.slice(0, 15).forEach(song => {
    container.appendChild(buildSongRow(song, () => {
      const all = [...state.allDriveSongs, ...state.localSongs];
      state.queue = [song, ...all.filter(s => s.id !== song.id)];
      playSongAt(0);
      showScreen("screen-player");
    }));
  });
}

function buildSongRow(song, onPlay, isFavoriteView = false) {
  const row = document.createElement("div");
  row.className = "song-row";
  
  const actionBtnHtml = isFavoriteView
    ? `<button class="delete-btn" title="Remove from Favorites" aria-label="Remove favorite">💔</button>`
    : `<button class="play-btn-item" aria-label="Play song">▶</button>`;

  row.innerHTML = `
    <img src="${song.cover}" alt="cover" loading="lazy" onerror="this.src='assets/default-cover.png'">
    <div class="meta">
      <strong>${song.name}</strong>
      <small>${song.isLocal ? "Device File" : song.albumName || "Drive Track"}</small>
    </div>
    <div class="row-actions">
      ${actionBtnHtml}
    </div>
  `;

  row.addEventListener("click", onPlay);

  if (isFavoriteView) {
    const unfavBtn = row.querySelector(".delete-btn");
    unfavBtn?.addEventListener("click", (e) => removeSingleFavorite(song.id, e));
  }

  return row;
}

function saveToRecentlyPlayed(song) {
  let stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  stored = stored.filter(s => s.id !== song.id);
  stored.unshift(song);
  stored = stored.slice(0, 15);
  localStorage.setItem("recentlyPlayed", JSON.stringify(stored));
  renderRecentlyPlayed();
}

// -----------------------------------------------------
// DIRECT DUAL PLAYBACK & REPEAT 1 ENGINE
// -----------------------------------------------------
function playSongAt(index) {
  if (!state.queue.length) return;
  state.currentIndex = index;
  const song = state.queue[index];

  audioEl.pause();
  audioEl.currentTime = 0;

  audioEl.src = song.url;
  audioEl.volume = state.volume;
  audioEl.load();

  const playPromise = audioEl.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        state.isPlaying = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        console.warn("Playback gesture needed:", err);
        state.isPlaying = false;
        updatePlayPauseIcon();
      });
  }

  const playerArtwork = document.getElementById("playerArtwork");
  if (playerArtwork) playerArtwork.src = song.cover;
  
  document.getElementById("trackTitle").textContent = song.name;
  document.getElementById("trackArtist").textContent = song.isLocal ? "Device File" : song.albumName || "Drive Track";
  document.getElementById("nowPlayingSource").textContent = song.isLocal ? "Local Storage" : song.albumName || "Drive Album";

  updatePlayPauseIcon();
  updateLikeIcon();
  saveToRecentlyPlayed(song);
}

function togglePlayPause() {
  if (!audioEl.src) return;

  if (state.isPlaying) {
    audioEl.pause();
    state.isPlaying = false;
  } else {
    audioEl.play().catch(e => console.warn("Playback error:", e));
    state.isPlaying = true;
  }
  updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
  const playIcon = document.getElementById("playIcon");
  if (playIcon) playIcon.textContent = state.isPlaying ? "❚❚" : "▶";
}

function playNext() {
  if (!state.queue.length) return;
  const nextIndex = state.isShuffle
    ? Math.floor(Math.random() * state.queue.length)
    : (state.currentIndex + 1) % state.queue.length;
  playSongAt(nextIndex);
}

function playPrev() {
  if (!state.queue.length) return;
  const prevIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playSongAt(prevIndex);
}

// -----------------------------------------------------
// AUDIO ENDED LOGIC (REPEAT 1 vs REPEAT ALL vs OFF)
// -----------------------------------------------------
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
      updatePlayPauseIcon();
    }
  }
});

audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration) return;
  const seekBar = document.getElementById("seekBar");
  if (seekBar) seekBar.value = (audioEl.currentTime / audioEl.duration) * 100;
  document.getElementById("currentTime").textContent = formatTime(audioEl.currentTime);
  document.getElementById("durationTime").textContent = formatTime(audioEl.duration);
});

document.getElementById("seekBar")?.addEventListener("input", (e) => {
  if (!audioEl.duration) return;
  audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
});

function formatTime(sec) {
  if (isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Transport Buttons
document.getElementById("playPauseBtn")?.addEventListener("click", togglePlayPause);
document.getElementById("nextBtn")?.addEventListener("click", playNext);
document.getElementById("prevBtn")?.addEventListener("click", playPrev);

document.getElementById("shuffleBtn")?.addEventListener("click", (e) => {
  state.isShuffle = !state.isShuffle;
  e.currentTarget.classList.toggle("active-toggle", state.isShuffle);
});

// Repeat Tri-State Controller
const repeatBtn = document.getElementById("repeatBtn");

function updateRepeatUI() {
  if (!repeatBtn) return;

  if (state.repeatMode === 0) {
    repeatBtn.classList.remove("active-toggle");
    repeatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    `;
    repeatBtn.setAttribute("title", "Repeat Off");
  } else if (state.repeatMode === 1) {
    repeatBtn.classList.add("active-toggle");
    repeatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
    `;
    repeatBtn.setAttribute("title", "Repeat All");
  } else if (state.repeatMode === 2) {
    repeatBtn.classList.add("active-toggle");
    repeatBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>
      </svg>
      <span class="repeat-badge">1</span>
    `;
    repeatBtn.setAttribute("title", "Repeat 1 Track");
  }
}

repeatBtn?.addEventListener("click", () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  updateRepeatUI();
});

// Volume Controls
const volumeSlider = document.getElementById("volumeSlider");
const muteBtn = document.getElementById("muteBtn");
let lastVol = 1;

volumeSlider?.addEventListener("input", (e) => {
  const vol = e.target.value / 100;
  audioEl.volume = vol;
  state.volume = vol;
  updateMuteIcon(vol);
});

muteBtn?.addEventListener("click", () => {
  if (audioEl.volume > 0) {
    lastVol = audioEl.volume;
    audioEl.volume = 0;
    if (volumeSlider) volumeSlider.value = 0;
  } else {
    audioEl.volume = lastVol || 1;
    if (volumeSlider) volumeSlider.value = (lastVol || 1) * 100;
  }
  updateMuteIcon(audioEl.volume);
});

function updateMuteIcon(vol) {
  const volSvg = document.getElementById("volSvg");
  if (!volSvg) return;
  if (vol === 0) {
    volSvg.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
  } else {
    volSvg.innerHTML = `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
  }
}

// Favorite Toggle
document.getElementById("likeBtn")?.addEventListener("click", () => {
  const song = state.queue[state.currentIndex];
  if (!song) return;
  const idx = state.favorites.indexOf(song.id);
  if (idx === -1) {
    state.favorites.push(song.id);
  } else {
    state.favorites.splice(idx, 1);
  }
  localStorage.setItem("favoriteSongs", JSON.stringify(state.favorites));
  updateLikeIcon();
  updateCounters();

  const detailPanel = document.getElementById("panel-volume-detail");
  if (detailPanel?.classList.contains("active")) {
    const currentTitle = document.getElementById("volDetailTitle")?.textContent;
    if (currentTitle === "Favorites") {
      openAlbumDetail("FAV");
    }
  }
});

function updateLikeIcon() {
  const song = state.queue[state.currentIndex];
  const likeBtn = document.getElementById("likeBtn");
  if (!song || !likeBtn) return;
  const isFav = state.favorites.includes(song.id);
  likeBtn.classList.toggle("liked", isFav);
}

// Search
document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const allAvailable = [...state.allDriveSongs, ...state.localSongs];
  const filtered = allAvailable.filter(s => s.name.toLowerCase().includes(q) || (s.albumName && s.albumName.toLowerCase().includes(q)));
  const container = document.getElementById("allSongsList");
  if (!container) return;

  container.innerHTML = "";
  if (!filtered.length) {
    container.innerHTML = `<p class="status-text">No matching tracks found.</p>`;
    return;
  }

  filtered.forEach(song => {
    container.appendChild(buildSongRow(song, () => {
      state.queue = allAvailable;
      const idx = allAvailable.indexOf(song);
      playSongAt(idx);
      showScreen("screen-player");
    }));
  });

  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="songs"]')?.click();
});

// -----------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  renderVisualizer();
  updateRepeatUI();

  try {
    await initDB();
    const savedTracks = await getAllTracksFromDB();

    if (savedTracks && savedTracks.length > 0) {
      state.localSongs = savedTracks.map(t => ({
        ...t,
        url: URL.createObjectURL(t.blob)
      }));
      renderLocalSongs();
    }
  } catch (err) {
    console.error("IndexedDB initialization failed:", err);
  }

  if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
    fetchDriveAlbums();
  }
});
