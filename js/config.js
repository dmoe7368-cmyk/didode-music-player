// ============================================
// PUBLIC GOOGLE DRIVE CONFIG
// ============================================

window.DRIVE_CONFIG = {

  // Your public Google Drive folder ID
  folderId: "1903JCYkLeqt6MJ7bFWO9G4Ikgr0bbKY2",

  // Google Drive API Key
  apiKey: "AIzaSyCmpoImAy7O8brST6lBFWBupa_AwEeeEGo",

  // Automatically load music from the folder
  autoLoad: true

};

// ============================================
// COVER GROUP CONFIG
// Songs are named 1..150 in Google Drive.
// 1-50   -> cover-a.svg
// 51-100 -> cover-b.svg
// 101-150-> cover-c.svg
// ============================================
window.COVER_GROUPS = [
  { min: 1,   max: 50,  key: "A", image: "assets/cover-a.png", label: "Group A" },
  { min: 51,  max: 100, key: "B", image: "assets/cover-b.png", label: "Group B" },
  { min: 101, max: 150, key: "C", image: "assets/cover-c.png", label: "Group C" }
];

function getCoverForSongNumber(num) {
  const group = window.COVER_GROUPS.find(g => num >= g.min && num <= g.max);
  return group ? group.image : "assets/cover-a.svg";
}

function getGroupKeyForSongNumber(num) {
  const group = window.COVER_GROUPS.find(g => num >= g.min && num <= g.max);
  return group ? group.key : "A";
}
