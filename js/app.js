// =====================================================
// MelodyFlow Music Player - app.js
// =====================================================

const state = {
  driveSongs: [],      // {id, number, name, url, cover, group}
  localSongs: [],       // {id, number:null, name, url, cover, isLocal:true}
  queue: [],            // current playback queue (array of song objects)
  currentIndex: -1,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0,         // 0 = off, 1 = repeat all, 2 = repeat one
  recentlyPlayed: [],
  favorites: JSON.parse(localStorage.getItem("favoriteSongs") || "[]"), // array of song ids
  volume: 1
};

const audioEl = document.getElementById("audioEl");

// -----------------------------------------------------
// NAVIGATION
// -----------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.target === id);
  });
}

document.querySelectorAll(".nav-btn, .nav-back").forEach(btn => {
  btn.addEventListener("click", () => showScreen(btn.dataset.target));
});

// Library tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
  });
});

// Playlist group rows -> filter + play that group
document.querySelectorAll(".playlist-row").forEach(row => {
  row.addEventListener("click", () => {
    const group = row.dataset.group;
    let groupSongs;
    if (group === "FAV") {
      const allSongs = [...state.driveSongs, ...state.localSongs];
      groupSongs = allSongs.filter(s => state.favorites.includes(s.id));
    } else {
      groupSongs = state.driveSongs.filter(s => s.group === group);
    }
    if (groupSongs.length) {
      state.queue = groupSongs;
      playSongAt(0);
      showScreen("screen-player");
    }
  });
});

// -----------------------------------------------------
// GOOGLE DRIVE: FETCH SONG LIST (paginated)
// -----------------------------------------------------
function extractSongNumber(filename) {
  // Grabs the first number found in the file name, e.g. "12.mp3" -> 12
  const match = filename.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

async function fetchDriveSongs() {
  const statusEl = document.getElementById("driveStatus");
  const { folderId, apiKey } = window.DRIVE_CONFIG;

  if (!folderId || !apiKey) {
    if (statusEl) statusEl.textContent = "Drive config missing.";
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

      if (data.error) {
        throw new Error(data.error.message || "Drive API error");
      }

      allFiles = allFiles.concat(data.files || []);
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    // Map into song objects, sorted numerically by filename
    state.driveSongs = allFiles
      .map(f => {
        const number = extractSongNumber(f.name);
        return {
          id: f.id,
          number: number,
          name: f.name.replace(/\.[^/.]+$/, ""), // strip extension
          // Use Drive API's alt=media endpoint so <audio> can stream it directly
          url: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
          cover: number ? getCoverForSongNumber(number) : "assets/cover-a.svg",
          group: number ? getGroupKeyForSongNumber(number) : "A",
          isLocal: false
        };
      })
      .sort((a, b) => (a.number || 0) - (b.number || 0));

    renderAllSongs();
    renderGroupCounts();
    renderHero();
    renderRecentlyPlayed();

  } catch (err) {
    console.error("Drive fetch failed:", err);
    if (statusEl) statusEl.textContent = "Could not load songs. Check API key / folder sharing settings.";
  }
}

// -----------------------------------------------------
// RENDER: Library "Songs" tab (all drive songs)
// -----------------------------------------------------
function renderAllSongs() {
  const container = document.getElementById("allSongsList");
  if (!state.driveSongs.length) {
    container.innerHTML = `<p class="status-text">No songs found in Drive folder.</p>`;
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
  state.driveSongs.forEach(s => { if (counts[s.group] !== undefined) counts[s.group]++; });
  document.getElementById("countA").textContent = counts.A + " Songs";
  document.getElementById("countB").textContent = counts.B + " Songs";
  document.getElementById("countC").textContent = counts.C + " Songs";
  renderFavoritesCount();
}

function renderFavoritesCount() {
  const el = document.getElementById("countFav");
  if (el) el.textContent = state.favorites.length + " Songs";
}

function renderHero() {
  if (!state.driveSongs.length) return;
  const pick = state.driveSongs[Math.floor(Math.random() * state.driveSongs.length)];
  document.getElementById("heroTitle").textContent = pick.name;
  document.getElementById("heroSub").textContent = `Group ${pick.group} • Tap to play`;
  document.getElementById("heroCard").dataset.songId = pick.id;
  document.getElementById("heroPlayBtn").onclick = () => {
    state.queue = state.driveSongs;
    const idx = state.driveSongs.findIndex(s => s.id === pick.id);
    playSongAt(idx);
    showScreen("screen-player");
  };
}

function renderRecentlyPlayed() {
  const container = document.getElementById("recentList");
  const stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  if (!stored.length) {
    container.innerHTML = `<p class="status-text">Nothing played yet.</p>`;
    return;
  }
  container.innerHTML = "";
  stored.slice(0, 6).forEach(song => {
    container.appendChild(buildSongRow(song, () => {
      state.queue = [song, ...state.driveSongs.filter(s => s.id !== song.id)];
      playSongAt(0);
      showScreen("screen-player");
    }));
  });
}

function buildSongRow(song, onPlay) {
  const row = document.createElement("div");
  row.className = "song-row";
  row.innerHTML = `
    <img src="${song.cover}" alt="">
    <div class="meta">
      <strong>${song.name}</strong>
      <small>${song.isLocal ? "Local file" : "Group " + song.group}</small>
    </div>
    <button>▶</button>
  `;
  row.addEventListener("click", onPlay);
  return row;
}

// -----------------------------------------------------
// LOCAL FILE UPLOAD
// -----------------------------------------------------
document.getElementById("localFileInput").addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    state.localSongs.push({
      id: "local-" + Date.now() + Math.random(),
      number: null,
      name: file.name.replace(/\.[^/.]+$/, ""),
      url: URL.createObjectURL(file),
      cover: "assets/cover-a.svg",
      group: "Local",
      isLocal: true
    });
  });
  renderLocalSongs();
});

function renderLocalSongs() {
  const container = document.getElementById("localSongsList");
  if (!state.localSongs.length) {
    container.innerHTML = `<p class="status-text">No local songs uploaded yet.</p>`;
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
// PLAYER ENGINE
// -----------------------------------------------------
function playSongAt(index) {
  if (!state.queue.length) return;
  state.currentIndex = index;
  const song = state.queue[index];

  audioEl.src = song.url;
  audioEl.play().catch(err => console.warn("Playback blocked until user interacts:", err));
  state.isPlaying = true;

  document.getElementById("playerArtwork").src = song.cover;
  document.getElementById("trackTitle").textContent = song.name;
  document.getElementById("trackArtist").textContent = song.isLocal ? "Local file" : "Group " + song.group;
  document.getElementById("nowPlayingSource").textContent = song.isLocal ? "Local Upload" : "Drive Playlist";
  updatePlayPauseIcon();
  updateLikeIcon();

  saveToRecentlyPlayed(song);
}

function updateLikeIcon() {
  const song = state.queue[state.currentIndex];
  const likeBtn = document.getElementById("likeBtn");
  if (!song) return;
  likeBtn.textContent = state.favorites.includes(song.id) ? "❤️" : "🤍";
}

function saveToRecentlyPlayed(song) {
  let stored = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
  stored = stored.filter(s => s.id !== song.id);
  stored.unshift(song);
  stored = stored.slice(0, 10);
  localStorage.setItem("recentlyPlayed", JSON.stringify(stored));
  renderRecentlyPlayed();
}

function togglePlayPause() {
  if (!audioEl.src) return;
  if (state.isPlaying) {
    audioEl.pause();
  } else {
    audioEl.play();
  }
  state.isPlaying = !state.isPlaying;
  updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
  document.getElementById("playPauseBtn").textContent = state.isPlaying ? "⏸" : "▶";
}

function playNext() {
  if (!state.queue.length) return;
  let nextIndex;
  if (state.isShuffle) {
    nextIndex = Math.floor(Math.random() * state.queue.length);
  } else {
    nextIndex = (state.currentIndex + 1) % state.queue.length;
  }
  playSongAt(nextIndex);
}

function playPrev() {
  if (!state.queue.length) return;
  const prevIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  playSongAt(prevIndex);
}

audioEl.addEventListener("ended", () => {
  if (state.repeatMode === 2) {
    playSongAt(state.currentIndex); // repeat one
  } else if (state.repeatMode === 1 || state.currentIndex < state.queue.length - 1) {
    playNext(); // repeat all / continue queue
  } else {
    state.isPlaying = false;
    updatePlayPauseIcon();
  }
});

audioEl.addEventListener("timeupdate", () => {
  if (!audioEl.duration) return;
  const seekBar = document.getElementById("seekBar");
  seekBar.value = (audioEl.currentTime / audioEl.duration) * 100;
  document.getElementById("currentTime").textContent = formatTime(audioEl.currentTime);
  document.getElementById("durationTime").textContent = formatTime(audioEl.duration);
});

document.getElementById("seekBar").addEventListener("input", (e) => {
  if (!audioEl.duration) return;
  audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
});

function formatTime(sec) {
  if (isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Transport buttons
document.getElementById("playPauseBtn").addEventListener("click", togglePlayPause);
document.getElementById("nextBtn").addEventListener("click", playNext);
document.getElementById("prevBtn").addEventListener("click", playPrev);

document.getElementById("shuffleBtn").addEventListener("click", (e) => {
  state.isShuffle = !state.isShuffle;
  e.target.classList.toggle("active-toggle", state.isShuffle);
});

document.getElementById("repeatBtn").addEventListener("click", (e) => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  e.target.classList.toggle("active-toggle", state.repeatMode !== 0);
  e.target.textContent = state.repeatMode === 2 ? "🔂" : "🔁";
});

// -----------------------------------------------------
// VOLUME CONTROL
// -----------------------------------------------------
const volumeSlider = document.getElementById("volumeSlider");
const muteBtn = document.getElementById("muteBtn");
let lastVolume = 1;

volumeSlider.addEventListener("input", (e) => {
  const vol = e.target.value / 100;
  audioEl.volume = vol;
  state.volume = vol;
  updateMuteIcon(vol);
});

muteBtn.addEventListener("click", () => {
  if (audioEl.volume > 0) {
    lastVolume = audioEl.volume;
    audioEl.volume = 0;
    volumeSlider.value = 0;
  } else {
    audioEl.volume = lastVolume || 1;
    volumeSlider.value = (lastVolume || 1) * 100;
  }
  updateMuteIcon(audioEl.volume);
});

function updateMuteIcon(vol) {
  if (vol === 0) muteBtn.textContent = "🔇";
  else if (vol < 0.5) muteBtn.textContent = "🔉";
  else muteBtn.textContent = "🔊";
}

document.getElementById("likeBtn").addEventListener("click", () => {
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

// -----------------------------------------------------
// SEARCH (filters the Songs tab)
// -----------------------------------------------------
document.getElementById("searchInput").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = state.driveSongs.filter(s => s.name.toLowerCase().includes(q));
  const container = document.getElementById("allSongsList");
  container.innerHTML = "";
  if (!filtered.length) {
    container.innerHTML = `<p class="status-text">No matching songs.</p>`;
    return;
  }
  filtered.forEach((song) => {
    const idx = state.driveSongs.indexOf(song);
    container.appendChild(buildSongRow(song, () => {
      state.queue = state.driveSongs;
      playSongAt(idx);
      showScreen("screen-player");
    }));
  });
  showScreen("screen-library");
  document.querySelector('.tab-btn[data-tab="songs"]').click();
});

// -----------------------------------------------------
// INIT
// -----------------------------------------------------
if (window.DRIVE_CONFIG && window.DRIVE_CONFIG.autoLoad) {
  fetchDriveSongs();
}
