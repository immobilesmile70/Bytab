import { ModalManager, ModalTemplates } from "./utils/modal.js";

// --- CONSTANTS ---
const MAX_BOOKMARKS = 12;

// --- DOM ELEMENT SELECTORS ---
const body = document.body;
const clockElement = document.getElementById("clock");
const greetingTextElement = document.getElementById("greeting-text");
const usernameTextElement = document.getElementById("username-text");
const userIconElement = document.getElementById("user-icon");
const backgroundContainer = document.getElementById("background-container");
const bookmarksContainer = document.getElementById("bookmarks-container");
const bookmarkSearchInput = document.getElementById("bookmark-search");
const settingsBtn = document.getElementById("settings-btn");
const contextMenu = document.getElementById("bookmark-context-menu");
const contextMenuName = document.getElementById("context-menu-name");
const contextMenuUrl = document.getElementById("context-menu-url");
const editBtn = document.getElementById("edit-bookmark-btn");
const removeBtn = document.getElementById("remove-bookmark-btn");

// --- STATE ---
let bookmarks = [];
let contextMenuBookmarkId = null;
let clockFormat = "24h";
let contextMenuTimeout = null;
let draggedItem = null;

export const modalManager = new ModalManager();

// --- UTILITY FUNCTIONS ---
const getSetting = (key, defaultValue) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setSetting = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not save setting:", error);
  }
};

const getDefaultUserIcon = (username = "User") => {
  const firstLetter = username.trim().charAt(0).toUpperCase() || "U";
  return `https://placehold.co/40x40/cba6f7/1e1e2e?text=${firstLetter}`;
};

const saveImageToIndexedDB = (file, key = "image") => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ImageStorage", 2);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      store.put(file, key);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };

    request.onerror = () => reject(request.error);
  });
};

const saveImageBlobToIndexedDB = (blob, key = "background") => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ImageStorage", 2);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };

    request.onerror = () => reject(request.error);
  });
};

const loadImageBlobFromIndexedDB = (key = "background") => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ImageStorage", 2);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("images", "readonly");
      const store = tx.objectStore("images");
      const getRequest = store.get(key);

      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
};

// --- ANIMATION HELPERS (for Context Menu) ---
const showAnimated = (element) => {
  if (contextMenuTimeout) {
    clearTimeout(contextMenuTimeout);
    contextMenuTimeout = null;
  }
  element.style.display = "block";
  element.offsetHeight;
  requestAnimationFrame(() => {
    element.classList.remove("opacity-0");
  });
};

const hideAnimated = (element) => {
  element.classList.add("opacity-0");
  contextMenuTimeout = setTimeout(() => {
    element.style.display = "none";
    contextMenuTimeout = null;
  }, 200);
};

// --- THEME MANAGEMENT ---
function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  let actualTheme = theme;
  if (theme === "system") {
    actualTheme = getSystemTheme();
  }
  body.className = `${actualTheme}-theme`;
}

// --- CORE FUNCTIONALITY ---
function updateTimeAndGreeting() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");

  if (clockFormat === "12h") {
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    clockElement.textContent = `${hours}:${minutes} ${ampm}`;
  } else {
    clockElement.textContent = `${hours
      .toString()
      .padStart(2, "0")}:${minutes}`;
  }

  let greeting = "Good evening,";
  if (now.getHours() < 12) greeting = "Good morning,";
  else if (now.getHours() < 18) greeting = "Good afternoon,";
  greetingTextElement.textContent = greeting;
}

async function loadAndApplySettings() {
  const theme = getSetting("theme", "system");
  applyTheme(theme);

  clockFormat = getSetting("clockFormat", "24h");

  const username = getSetting("username", "User");
  usernameTextElement.textContent = username;

  const backgroundKey = getSetting("background", "");
  const userIconKey = getSetting("userIcon", "");

  if (backgroundKey === "fromIndexedDB") {
    const bgBlob = await loadImageBlobFromIndexedDB("background");
    if (bgBlob) {
      const bgUrl = URL.createObjectURL(bgBlob);
      backgroundContainer.style.backgroundImage = `url('${bgUrl}')`;
    } else {
      backgroundContainer.style.backgroundImage = "";
    }
  } else {
    backgroundContainer.style.backgroundImage = backgroundKey
      ? `url('${backgroundKey}')`
      : "";
  }

  if (userIconKey === "fromIndexedDB") {
    const iconBlob = await loadImageBlobFromIndexedDB("userIcon");
    if (iconBlob) {
      const iconUrl = URL.createObjectURL(iconBlob);
      userIconElement.src = iconUrl;
    } else {
      userIconElement.src = getDefaultUserIcon(username);
    }
  } else {
    userIconElement.src = userIconKey || getDefaultUserIcon(username);
  }

  bookmarks = getSetting("bookmarks", []);
  renderBookmarks();

  updateTimeAndGreeting();
}

// --- BOOKMARK MANAGEMENT ---
function createFaviconElement(url) {
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();

  const iconUrl = hostname
    ? `https://icons.duckduckgo.com/ip3/${hostname}.ico`
    : null;

  const img = document.createElement("img");
  img.width = 32;
  img.height = 32;
  img.alt = hostname || "favicon";

  // Start with the icon URL if possible
  img.src = iconUrl || getDefaultIcon();

  // On error, replace with fallback letter div
  img.onerror = () => {
    img.onerror = null; // Prevent infinite loop

    // Replace img with div fallback
    const fallbackDiv = createFallbackFavicon(hostname);
    img.parentNode.replaceChild(fallbackDiv, img);
  };

  return img;
}

function createFallbackFavicon(hostname) {
  if (!hostname) {
    // Return default icon img
    const img = document.createElement("img");
    img.width = 32;
    img.height = 32;
    img.src = getDefaultIcon();
    img.className = "bookmark-icon";
    return img;
  }

  const firstLetter = hostname.charAt(0).toUpperCase();
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FECA57",
    "#FF9FF3",
    "#54A0FF",
    "#5F27CD",
    "#00D2D3",
    "#FF9F43",
  ];
  const color = colors[firstLetter.charCodeAt(0) % colors.length];

  const fallbackDiv = document.createElement("div");
  fallbackDiv.className = "bookmark-icon fallback-favicon";
  fallbackDiv.style.cssText = `
    width: 32px;
    height: 32px;
    background-color: ${color};
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 16px;
    font-weight: bold;
    flex-shrink: 0;
  `;
  fallbackDiv.textContent = firstLetter;

  return fallbackDiv;
}

const getDefaultIcon = () => {
  return "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIi8+PHBhdGggZD0iTTEyIDJhMTQuNSAxNC41IDAgMCAwIDAgMjAgMTQuNSAxNC41IDAgMCAwIDAtMjBaIi8+PHBhdGggZD0iTTIgMTJIMjIiLz48L3N2Zz4=";
};

async function renderBookmarks(filter = "") {
  bookmarksContainer.innerHTML = "";
  const filteredBookmarks = bookmarks.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  );

  filteredBookmarks.forEach((bookmark) => {
    const bookmarkElement = document.createElement("a");
    bookmarkElement.href = bookmark.url;
    bookmarkElement.draggable = true;
    bookmarkElement.dataset.id = bookmark.id;
    bookmarkElement.className = "bookmark";

    const iconContainer = document.createElement("div");
    iconContainer.className = "bookmark-icon-container";
    const faviconImg = createFaviconElement(bookmark.url);
    faviconImg.className = "bookmark-icon";
    iconContainer.appendChild(faviconImg);
    bookmarkElement.appendChild(iconContainer);

    const nameSpan = document.createElement("span");
    nameSpan.className = "bookmark-name";
    nameSpan.textContent = bookmark.name;
    bookmarkElement.appendChild(nameSpan);

    const moreOptionsBtn = document.createElement("button");
    moreOptionsBtn.className = "more-options-btn";
    moreOptionsBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="12" cy="5" r="1"/>
      <circle cx="12" cy="19" r="1"/>
    </svg>
  `;
    bookmarkElement.appendChild(moreOptionsBtn);

    bookmarkElement.addEventListener("dragstart", (e) => {
      draggedItem = e.currentTarget;
      e.currentTarget.classList.add("dragging");
    });
    bookmarkElement.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.currentTarget.classList.add("drag-over");
    });
    bookmarkElement.addEventListener("dragleave", (e) =>
      e.currentTarget.classList.remove("drag-over")
    );
    bookmarkElement.addEventListener("drop", handleDrop);
    bookmarkElement.addEventListener("dragend", () => {
      document
        .querySelectorAll(".bookmark")
        .forEach((b) => b.classList.remove("dragging", "drag-over"));
    });
    bookmarkElement.addEventListener("contextmenu", (e) =>
      showContextMenu(e, bookmark.id)
    );
    bookmarkElement
      .querySelector(".more-options-btn")
      .addEventListener("click", (e) => showContextMenu(e, bookmark.id));

    bookmarksContainer.appendChild(bookmarkElement);
  });

  if (bookmarks.length < MAX_BOOKMARKS) {
    const addTile = document.createElement("button");
    addTile.id = "add-bookmark-tile";
    addTile.innerHTML = `
        <div class="add-icon-container">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </div>
        <span class="add-tile-text">Add New</span>`;
    addTile.addEventListener("click", () => showAddBookmarkModal());
    bookmarksContainer.appendChild(addTile);
  }
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  const dropTarget = e.currentTarget;
  if (draggedItem && draggedItem !== dropTarget) {
    const draggedId = draggedItem.dataset.id;
    const targetId = dropTarget.dataset.id;
    const draggedIndex = bookmarks.findIndex((b) => b.id === draggedId);
    const targetIndex = bookmarks.findIndex((b) => b.id === targetId);
    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [removed] = bookmarks.splice(draggedIndex, 1);
      bookmarks.splice(targetIndex, 0, removed);
      setSetting("bookmarks", bookmarks);
      renderBookmarks(bookmarkSearchInput.value);
    }
  }
  dropTarget.classList.remove("drag-over");
  draggedItem = null;
}

function showContextMenu(e, bookmarkId) {
  e.preventDefault();
  e.stopPropagation();

  hideAnimated(contextMenu);

  contextMenuBookmarkId = bookmarkId;
  const bookmark = bookmarks.find((b) => b.id === bookmarkId);
  if (!bookmark) return;

  contextMenuName.textContent = bookmark.name;
  contextMenuUrl.textContent = bookmark.url;
  contextMenuUrl.title = bookmark.url;

  const rect = e.currentTarget.getBoundingClientRect();
  let x = e.clientX + 5;
  let y = e.clientY + 5;

  if (x + 180 > window.innerWidth) x = e.clientX - 185;
  if (y + 120 > window.innerHeight) y = e.clientY - 125;

  contextMenu.style.top = `${y}px`;
  contextMenu.style.left = `${x}px`;

  showAnimated(contextMenu);
}

// --- MODAL FUNCTIONS ---
async function showSettingsModal() {
  const currentUsername = getSetting("username", "User");

  let currentUserIcon = getSetting("userIcon", "");
  let currentUserIconUrl = currentUserIcon;

  if (currentUserIcon === "fromIndexedDB") {
    const blob = await loadImageBlobFromIndexedDB("userIcon");
    currentUserIconUrl = blob
      ? URL.createObjectURL(blob)
      : getDefaultUserIcon(currentUsername);
  } else if (!currentUserIcon) {
    currentUserIconUrl = getDefaultUserIcon(currentUsername);
  }

  let currentBackground = getSetting("background", "");
  let currentBackgroundUrl = currentBackground;

  if (currentBackground === "fromIndexedDB") {
    const blob = await loadImageBlobFromIndexedDB("background");
    currentBackgroundUrl = blob ? URL.createObjectURL(blob) : "";
  }

  const currentSettings = {
    currentUsername,
    currentTheme: getSetting("theme", "system"),
    currentUserIcon: currentUserIconUrl,
    currentBackground: currentBackgroundUrl,
    currentUserIconFileName: getSetting("userIconFileName", ""),
    currentBackgroundFileName: getSetting("backgroundFileName", ""),
  };

  const modal = await modalManager.createModal(
    "settings",
    ModalTemplates.settings(modalManager, {
      ...currentSettings,
      currentUserIconUrl: getSetting("userIconUrl", ""),
      currentBackgroundUrl: getSetting("backgroundUrl", ""),

      onUsernameChange: (username) => {
        usernameTextElement.textContent = username;
        setSetting("username", username);
        if (!getSetting("userIcon", "")) {
          userIconElement.src = getDefaultUserIcon(username);
        }
      },

      onUserIconChange: async (iconUrl) => {
        try {
          const response = await fetch(iconUrl, { mode: "cors" });
          const blob = await response.blob();
          await saveImageBlobToIndexedDB(blob, "userIcon");

          const localUrl = URL.createObjectURL(blob);
          userIconElement.src = localUrl;

          setSetting("userIcon", "fromIndexedDB");
          setSetting("userIconUrl", iconUrl);
          setSetting("userIconFileName", "");
        } catch (e) {
          console.warn("Failed to cache profile image", e);
          userIconElement.src = iconUrl;
          setSetting("userIcon", iconUrl);
          setSetting("userIconUrl", iconUrl);
          setSetting("userIconFileName", "");
        }
      },

      onUserIconFileChange: async (file) => {
        await saveImageToIndexedDB(file, "userIcon");
        const blob = await loadImageBlobFromIndexedDB("userIcon");
        const url = URL.createObjectURL(blob);

        userIconElement.src = url;
        setSetting("userIcon", "fromIndexedDB");
        setSetting("userIconUrl", "");
        setSetting("userIconFileName", file.name);
      },

      onUserIconRemove: () => {
        const username = getSetting("username", "User");
        const defaultIcon = getDefaultUserIcon(username);
        userIconElement.src = defaultIcon;
        setSetting("userIcon", "");
        setSetting("userIconUrl", "");
        setSetting("userIconFileName", "");
      },

      onBackgroundChange: async (bgUrl) => {
        try {
          const response = await fetch(bgUrl, { mode: "cors" });
          const blob = await response.blob();
          await saveImageBlobToIndexedDB(blob, "background");

          const localUrl = URL.createObjectURL(blob);
          backgroundContainer.style.backgroundImage = `url('${localUrl}')`;

          setSetting("background", "fromIndexedDB");
          setSetting("backgroundUrl", bgUrl);
          setSetting("backgroundFileName", "");
        } catch (e) {
          console.warn("Failed to cache background image", e);
          backgroundContainer.style.backgroundImage = `url('${bgUrl}')`;
          setSetting("background", bgUrl);
          setSetting("backgroundUrl", bgUrl);
          setSetting("backgroundFileName", "");
        }
      },

      onBackgroundFileChange: async (file) => {
        await saveImageToIndexedDB(file, "background");
        const blob = await loadImageBlobFromIndexedDB("background");
        const url = URL.createObjectURL(blob);

        backgroundContainer.style.backgroundImage = `url('${url}')`;
        setSetting("background", "fromIndexedDB");
        setSetting("backgroundUrl", "");
        setSetting("backgroundFileName", file.name);
      },

      onBackgroundRemove: () => {
        backgroundContainer.style.backgroundImage = "";
        setSetting("background", "");
        setSetting("backgroundUrl", "");
        setSetting("backgroundFileName", "");
      },

      onThemeChange: (theme) => {
        applyTheme(theme);
        setSetting("theme", theme);
      },
    })
  );
}

async function showAddBookmarkModal() {
  if (bookmarks.length >= MAX_BOOKMARKS) {
    await modalManager.createModal(
      "limit-reached",
      ModalTemplates.alert(modalManager, {
        title: "Limit Reached",
        message: `You can only have a maximum of ${MAX_BOOKMARKS} bookmarks.`,
      })
    );
    return;
  }

  await modalManager.createModal(
    "add-bookmark",
    ModalTemplates.addBookmark(modalManager, {
      onSubmit: async (name, url) => {
        if (name && url) {
          const newBookmark = {
            id: Date.now().toString(),
            name,
            url,
            favicon: `https://icons.duckduckgo.com/ip3/${
              new URL(url).hostname
            }.ico`,
          };
          bookmarks.push(newBookmark);
          setSetting("bookmarks", bookmarks);
          renderBookmarks();
        }
      },
    })
  );
}

async function showEditBookmarkModal(bookmark) {
  await modalManager.createModal(
    "edit-bookmark",
    ModalTemplates.editBookmark(modalManager, bookmark, {
      onSubmit: async (id, name, url) => {
        const bookmarkIndex = bookmarks.findIndex((b) => b.id === id);
        if (bookmarkIndex !== -1) {
          const oldUrl = bookmarks[bookmarkIndex].url;
          bookmarks[bookmarkIndex] = {
            ...bookmarks[bookmarkIndex],
            name,
            url,
          };
          if (oldUrl !== url) {
            bookmarks[
              bookmarkIndex
            ].favicon = `https://icons.duckduckgo.com/ip3/${
              new URL(url).hostname
            }.ico`;
          }
          setSetting("bookmarks", bookmarks);
          renderBookmarks();
        }
      },
    })
  );
}

// --- EVENT HANDLERS ---
clockElement.addEventListener("click", () => {
  clockFormat = clockFormat === "24h" ? "12h" : "24h";
  setSetting("clockFormat", clockFormat);
  updateTimeAndGreeting();
});

settingsBtn.addEventListener("click", showSettingsModal);

editBtn.addEventListener("click", () => {
  hideAnimated(contextMenu);
  const bookmark = bookmarks.find((b) => b.id === contextMenuBookmarkId);
  if (bookmark) {
    showEditBookmarkModal(bookmark);
  }
});

removeBtn.addEventListener("click", () => {
  hideAnimated(contextMenu);
  bookmarks = bookmarks.filter((b) => b.id !== contextMenuBookmarkId);
  setSetting("bookmarks", bookmarks);
  renderBookmarks();
});

bookmarkSearchInput.addEventListener("input", (e) =>
  renderBookmarks(e.target.value)
);

document.addEventListener("click", (e) => {
  if (!contextMenu.contains(e.target)) {
    hideAnimated(contextMenu);
  }
});

window.addEventListener("storage", loadAndApplySettings);

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const currentTheme = getSetting("theme", "system");
    if (currentTheme === "system") {
      applyTheme("system");
    }
  });

// --- INITIALIZATION ---
loadAndApplySettings();
setInterval(updateTimeAndGreeting, 1000);
