// =====================================================
// Didode Music Player - Universal Engine & Custom Dialogs
// =====================================================

const state = {
  driveSongs: [],
  localSongs: [], // { id, name, blob, url, cover, isLocal: true }
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0, // 0 = off, 1 = repeat all, 2 = repeat one
  favorites: JSON.parse(localStorage.getItem("favoriteSongs") || "[]"),
  volume: 1
};

const audioEl = document.getElementById("audioEl");

// -----------------------------------------------------
// CUSTOM IN-APP CONFIRMATION DIALOG (No Browser Alert)
// -----------------------------------------------------
function showCustomConfirm(title, message, confirmText = "Confirm") {
  return new Promise((resolve) => {
    const modalBackdrop = document.getElementById("customModal");
    const modalTitle = document.getElementById("modalTitle");
    const modalDesc = document.getElementById("modalDesc");
    const confirmBtn = document.getElementById("modalConfirmBtn");
    const cancelBtn = document.getElementById("modalCancelBtn");

    if (!modalBackdrop || !confirmBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    if (modalTitle) modalTitle.textContent = title;
    if (modalDesc) modalDesc.textContent = message;
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

// Tab navigation
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = document.getElementById("panel-" + btn.dataset.tab);
    if (panel) panel.classList.add("active");
  });
});

// -----------------------------------------------------
// NUMBER & VOLUME COVER RESOLVER
// -----------------------------------------------------
function extractSongNumber(filename) {
  const match = filename.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function getGroupAndCover(num) {
  if (!num || num <= 50) {
    return { group: "A", cover: "assets/cover-a.png" };
  } else if (num <= 100) {
    return { group: "B", cover: "assets/cover-b.png" };
  } else {
    return { group: "C", cover: "assets/cover-c.png" };
  }
}

// -----------------------------------------------------
// VOLUME DRILL-DOWN: OPEN SONGS LIST FOR A VOLUME
// -----------------------------------------------------
function getSongsForGroup(group) {
  if (group === "FAV") {
    const all = [...state.driveSongs, ...state.localSongs];
    return all.filter(s => state.favorites.includes(s.id));
  } else if (group === "LOCAL") {
    return state.localSongs;
  } else {
    return state.driveSongs.filter(s => s.group === group);
  }
}

function getVolumeMetadata(group) {
  switch (group) {
    case "FAV":
      return { title: "Favorite Tracks", cover: "assets/cover-fav.png" };
    case "A":
      return { title: "Tracks 1 - 50", cover: "assets/cover-a.png" };
    case "B":
      return { title: "Tracks 51 - 100", cover: "assets/cover-b.png" };
    case "C":
      return { title: "Tracks 101 - 150", cover: "assets/cover-c.png" };
    case "LOCAL":
      return { title: "Device Files", cover: "assets/cover-local.png" };
    default:
      return { title: "Volume " + group, cover: "assets/cover-a.png" };
  }
}

function openVolumeDetail(group) {
  const meta = getVolumeMetadata(group);
  const songs = getSongsForGroup(group);

  const coverEl = document.getElementById("volDetailCover");
  const titleEl = document.getElementById("volDetailTitle");
  const subEl = document.getElementById("volDetailSubtitle");
  const playAllBtn = document.getElementById("volDetailPlayAllBtn");
  const listContainer = document.getElementById("volDetailSongList");

  if (coverEl) coverEl.src = meta.cover;
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = `${songs.length} Tracks available`;

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
      listContainer.innerHTML = `<p class="status-text">No songs in this volume yet.</p>`;
    } else {
      songs.forEach((song, idx) => {
        listContainer.appendChild(buildSongRow(song, () => {
          state.queue = songs;
          playSongAt(idx);
          showScreen("screen-player");
        }));
      });
    }
  }

  showScreen("screen-library");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const detailPanel = document.getElementById("panel-volume-detail");
  if (detailPanel) detailPanel.classList.add("active");
}

document.getElementById("backToVolumesBtn")?.addEventListener("click", () => {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-playlists")?.classList.add("active");
  document.querySelector('.tab-btn[data-tab="playlists"]')?.classList.add("active");
});

function playVolumeDirectly(group, event) {
  if (event) event.stopPropagation();
  const songs = getSongsForGroup(group);
  if (songs.length) {
    state.queue = songs;
    playSongAt(0);
    showScreen("screen-player");
  } else if (group === "LOCAL") {
    showScreen("screen-library");
    document.querySelector('.tab-btn[data-tab="local"]')?.click();
  }
}

document.querySelectorAll(".volume-card").forEach(el => {
  el.addEventListener("click", () => openVolumeDetail(el.dataset.group));
});

document.querySelectorAll(".playlist-row").forEach(el => {
  el.addEventListener("click", () => openVolumeDetail(el.dataset.group));

  const playBtn = el.querySelector(".row-play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", (e) => playVolumeDirectly(el.dataset.group, e));
  }
});

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
      group: "Local",
      isLocal: true
    };

    await saveTrackToDB(trackRecord);

    state.localSongs.push({
      ...trackRecord,
      url: URL.createObjectURL(file)
    });
  }

  renderLocalSongs();
  updateLocalCount();

  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="local"]')?.click();
}

localFileInput?.addEventListener("change", (e) => {
  handleLocalFiles(e.target.files);
  e.target.value = "";
});

async function deleteLocalSong(songId, event) {
  if (event) event.stopPropagation();

  // Custom In-App Modal instead of native browser confirm
  const confirmed = await showCustomConfirm(
    "Delete Track",
    "Remove this track from your local storage?",
    "Delete"
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
  updateLocalCount();
}

// Replaced GitHub Popup with Custom In-App Modal
async function clearAllLocalSongs() {
  if (!state.localSongs.length) return;

  const confirmed = await showCustomConfirm(
    "Clear All Local Tracks",
    "Permanently remove all saved local songs from this device?",
    "Clear All"
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
  updateLocalCount();
}

clearAllBtn?.addEventListener("click", clearAllLocalSongs);

function updateLocalCount() {
  const countHome = document.getElementById("volCountLocal");
  const countLibrary = document.getElementById("countLocal");
  const text = `${state.localSongs.length} Files`;

  if (countHome) countHome.textContent = text;
  if (countLibrary) countLibrary.textContent = text;

  if (clearAllBtn) {
    clearAllBtn.style.display = state.localSongs.length > 0 ? "inline-flex" : "none";
  }
}

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
      <img src="${song.cover}" alt="cover" onerror="this.src='assets/cover-a.png'">
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
// GOOGLE DRIVE API FETCH
// -----------------------------------------------------
async function fetchDriveSongs() {
  const statusEl = document.getElementById("driveStatus");
  const heroTitle = document.getElementById("heroTitle");
  const heroSub = document.getElementById("heroSub");
  const config = window.DRIVE_CONFIG || {};
  const { folderId, apiKey } = config;

  if (!folderId || !apiKey) {
    if (statusEl) statusEl.textContent = "Google Drive Config Missing (Check config.js).";
    if (heroTitle) heroTitle.textContent = "Drive Config Missing";
    if (heroSub) heroSub.textContent = "Set API Key in js/config.js";
    return;
  }

  let pageToken = "";
  let allFiles = [];

  try {
    do {
      const url = `https://www.googleapis.com/drive/v3/files?q=` +
        encodeURIComponent(`'${folderId}' in parents and mimeType contains 'audio/' and trashed=false`) +
        `&fields=nextPageToken,files(id,name)` +
        `&pageSize=1000` +
        (pageToken ? `&pageToken=${pageToken}` : "") +
        `&key=${apiKey}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.error) throw new Error(data.error.message);

      allFiles = allFiles.concat(data.files || []);
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    state.driveSongs = allFiles
      .map(f => {
        const num = extractSongNumber(f.name);
        const { group, cover } = getGroupAndCover(num);
        return {
          id: f.id,
          number: num,
          name: f.name.replace(/\.[^/.]+$/, ""),
          url: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
          cover: cover,
          group: group,
          isLocal: false
        };
      })
      .sort((a, b) => (a.number || 0) - (b.number || 0));

    renderAllSongs();
    renderGroupCounts();
    renderHero();
    renderRecentlyPlayed();

  } catch (err) {
    console.error("Drive fetch error:", err);
    if (statusEl) statusEl.textContent = "Could not load Drive files. Please check API Key and permissions.";
    if (heroTitle) heroTitle.textContent = "Drive Load Failed";
    if (heroSub) heroSub.textContent = "Check permissions or network";
  }
}

// -----------------------------------------------------
// UI RENDERING
// -----------------------------------------------------
function renderAllSongs() {
  const container = document.getElementById("allSongsList");
  if (!container) return;
  if (!state.driveSongs.length) {
    container.innerHTML = `<p class="status-text">No tracks found in Google Drive folder.</p>`;
    return;
  }
  container.innerHTML = "";
  state.driveSongs.forEach((song, idx) => {
    container.appendChild(buildSongRow(song, () => {
      state.queue = state.driveSongs;
      playSongAt(idx);
      showScreen("screen-player");
    }));
  });
}

function renderGroupCounts() {
  const counts = { A: 0, B: 0, C: 0 };
  state.driveSongs.forEach(s => {
    if (counts[s.group] !== undefined) counts[s.group]++;
  });

  const countA = document.getElementById("countA");
  const countB = document.getElementById("countB");
  const countC = document.getElementById("countC");
  const volA = document.getElementById("volCountA");
  const volB = document.getElementById("volCountB");
  const volC = document.getElementById("volCountC");

  if (countA) countA.textContent = `${counts.A} Songs`;
  if (countB) countB.textContent = `${counts.B} Songs`;
  if (countC) countC.textContent = `${counts.C} Songs`;
  if (volA) volA.textContent = `${counts.A} Songs`;
  if (volB) volB.textContent = `${counts.B} Songs`;
  if (volC) volC.textContent = `${counts.C} Songs`;

  renderFavoritesCount();
}

function renderFavoritesCount() {
  const el = document.getElementById("countFav");
  if (el) el.textContent = `${state.favorites.length} Songs`;
}

function renderHero() {
  if (!state.driveSongs.length) return;
  const pick = state.driveSongs[Math.floor(Math.random() * state.driveSongs.length)];
  const titleEl = document.getElementById("heroTitle");
  const subEl = document.getElementById("heroSub");
  const coverEl = document.getElementById("heroArtwork");
  const heroCard = document.getElementById("heroCard");

  if (titleEl) titleEl.textContent = pick.name;
  if (subEl) subEl.textContent = pick.isLocal ? "Device File" : `Volume ${pick.group}`;
  if (coverEl) coverEl.src = pick.cover;

  heroCard.onclick = () => {
    state.queue = state.driveSongs;
    const idx = state.driveSongs.findIndex(s => s.id === pick.id);
    playSongAt(idx !== -1 ? idx : 0);
    showScreen("screen-player");
  };
}

function renderRecentlyPlayed() {
  const container = document.getElementById("recentList");
  if (!container) return;
  const stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  if (!stored.length) {
    container.innerHTML = `<p class="status-text">No tracks played yet.</p>`;
    return;
  }
  container.innerHTML = "";
  stored.slice(0, 15).forEach(song => {
    container.appendChild(buildSongRow(song, () => {
      const fullList = [...state.driveSongs, ...state.localSongs];
      state.queue = [song, ...fullList.filter(s => s.id !== song.id)];
      playSongAt(0);
      showScreen("screen-player");
    }));
  });
}

function buildSongRow(song, onPlay) {
  const row = document.createElement("div");
  row.className = "song-row";
  row.innerHTML = `
    <img src="${song.cover}" alt="cover" loading="lazy" onerror="this.src='assets/cover-a.png'">
    <div class="meta">
      <strong>${song.name}</strong>
      <small>${song.isLocal ? "Device File" : "Volume " + song.group}</small>
    </div>
    <button aria-label="Play song">▶</button>
  `;
  row.addEventListener("click", onPlay);
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
// UNIVERSAL AUDIO PLAYBACK (DRIVE + LOCAL)
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
  document.getElementById("trackArtist").textContent = song.isLocal ? "Device File" : "Volume " + song.group;
  document.getElementById("nowPlayingSource").textContent = song.isLocal ? "Local Storage" : "Drive Volume " + song.group;

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

audioEl.addEventListener("ended", () => {
  if (state.repeatMode === 2) {
    playSongAt(state.currentIndex);
  } else if (state.repeatMode === 1 || state.currentIndex < state.queue.length - 1) {
    playNext();
  } else {
    state.isPlaying = false;
    updatePlayPauseIcon();
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

document.getElementById("repeatBtn")?.addEventListener("click", (e) => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  e.currentTarget.classList.toggle("active-toggle", state.repeatMode !== 0);
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
  renderFavoritesCount();
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
  const allAvailable = [...state.driveSongs, ...state.localSongs];
  const filtered = allAvailable.filter(s => s.name.toLowerCase().includes(q));
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
// APP INITIALIZATION & RE-HYDRATION
// -----------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
  renderVisualizer();

  try {
    await initDB();
    const savedTracks = await getAllTracksFromDB();

    if (savedTracks && savedTracks.length > 0) {
      state.localSongs = savedTracks.map(t => ({
        ...t,
        url: URL.createObjectURL(t.blob)
      }));

      renderLocalSongs();
      updateLocalCount();
    }
  } catch (err) {
    console.error("IndexedDB initialization failed:", err);
  }

  if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
    fetchDriveSongs();
  }
});
