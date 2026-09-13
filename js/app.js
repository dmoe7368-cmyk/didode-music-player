// =====================================================
// Didode Music Player - Universal Audio Engine (Fixed)
// =====================================================

const state = {
  driveSongs: [],
  localSongs: [],
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
// STABLE LIVE EQUALIZER VISUALIZER (Zero-Conflict)
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
        // Dynamic algorithmic acoustic waveform simulation
        // Ensures 100% stable animation for both CORS remote & local blob audio
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

// -----------------------------------------------------
// NUMBER & COVER RESOLVER
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

function handleGroupPlay(group) {
  let groupSongs = [];
  if (group === "FAV") {
    const all = [...state.driveSongs, ...state.localSongs];
    groupSongs = all.filter(s => state.favorites.includes(s.id));
  } else if (group === "LOCAL") {
    if (!state.localSongs.length) {
      showScreen("screen-library");
      document.querySelector('.tab-btn[data-tab="local"]')?.click();
      return;
    }
    groupSongs = state.localSongs;
  } else {
    groupSongs = state.driveSongs.filter(s => s.group === group);
  }

  if (groupSongs.length) {
    state.queue = groupSongs;
    playSongAt(0);
    showScreen("screen-player");
  }
}

document.querySelectorAll(".volume-card, .playlist-row").forEach(el => {
  el.addEventListener("click", () => handleGroupPlay(el.dataset.group));
});

// -----------------------------------------------------
// LOCAL AUDIO FILE MANAGEMENT
// -----------------------------------------------------
const localFileInput = document.getElementById("localFileInput");

function handleLocalFiles(files) {
  if (!files || !files.length) return;

  const validAudioFiles = Array.from(files).filter(file => {
    return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name);
  });

  if (!validAudioFiles.length) {
    alert("Please select supported audio files (.mp3, .m4a, .wav, .aac, .flac)");
    return;
  }

  validAudioFiles.forEach(file => {
    const blobUrl = URL.createObjectURL(file);
    const cleanName = file.name.replace(/\.[^/.]+$/, "");

    state.localSongs.push({
      id: "local-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
      number: null,
      name: cleanName,
      url: blobUrl,
      cover: "assets/cover-local.png",
      group: "Local",
      isLocal: true,
      fileRef: file
    });
  });

  renderLocalSongs();
  updateLocalCount();

  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="local"]')?.click();
}

localFileInput?.addEventListener("change", (e) => {
  handleLocalFiles(e.target.files);
  e.target.value = "";
});

function updateLocalCount() {
  const countEl = document.getElementById("volCountLocal");
  if (countEl) {
    countEl.textContent = `${state.localSongs.length} Files`;
  }
}

function renderLocalSongs() {
  const container = document.getElementById("localSongsList");
  if (!container) return;

  if (!state.localSongs.length) {
    container.innerHTML = `<p class="status-text" id="localEmptyStatus">No local songs uploaded yet.</p>`;
    return;
  }

  container.innerHTML = "";
  state.localSongs.forEach((song, idx) => {
    container.appendChild(buildSongRow(song, () => {
      state.queue = state.localSongs;
      playSongAt(idx);
      showScreen("screen-player");
    }));
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
    if (heroSub) heroSub.textContent = "Check API Key in js/config.js";
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
          // Direct Google Drive API download/streaming URL
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
    if (statusEl) statusEl.textContent = "Could not load Drive files. Please check API Key and folder sharing.";
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
  if (subEl) subEl.textContent = pick.isLocal ? "Local Device File" : `Volume ${pick.group}`;
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
// BULLETPROOF AUDIO ENGINE (DRIVE + LOCAL)
// -----------------------------------------------------
function playSongAt(index) {
  if (!state.queue.length) return;
  state.currentIndex = index;
  const song = state.queue[index];

  // Pause previous stream completely
  audioEl.pause();
  audioEl.currentTime = 0;

  // Set stream source
  audioEl.src = song.url;
  audioEl.volume = state.volume;
  audioEl.load();

  // Robust play execution
  const playPromise = audioEl.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        state.isPlaying = true;
        updatePlayPauseIcon();
      })
      .catch(err => {
        console.warn("Autoplay deferred until user interaction:", err);
        state.isPlaying = false;
        updatePlayPauseIcon();
      });
  }

  // Update UI metadata
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

// Search Function
document.getElementById("searchInput")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  const filtered = state.driveSongs.filter(s => s.name.toLowerCase().includes(q));
  const container = document.getElementById("allSongsList");
  if (!container) return;

  container.innerHTML = "";
  if (!filtered.length) {
    container.innerHTML = `<p class="status-text">No matching tracks found.</p>`;
    return;
  }

  filtered.forEach(song => {
    const idx = state.driveSongs.indexOf(song);
    container.appendChild(buildSongRow(song, () => {
      state.queue = state.driveSongs;
      playSongAt(idx);
      showScreen("screen-player");
    }));
  });

  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="songs"]')?.click();
});

// Initialization
renderVisualizer();

if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
  fetchDriveSongs();
}
