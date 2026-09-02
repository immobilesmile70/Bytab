import { ModalManager, ModalTemplates } from "./utils/modal.js";
import {
  applyDominantColorTheme,
  clearDominantColorTheme,
} from "./utils/dominantColor.js";

// --- CONSTANTS ---
const BOOKMARKS_PER_PAGE = 12;
const MAX_PAGES = 4;
const MAX_BOOKMARKS = BOOKMARKS_PER_PAGE * MAX_PAGES;
const QUOTE_API_URL = "https://dummyjson.com/quotes/random";
const notFoundIconUrls = new Set();

const replaceWithFallback = (img) => {
  if (!img.parentNode) {
    img.dataset.ddgIcon404 = "true";
    return;
  }
  img.parentNode.replaceChild(createFallbackFavicon(img.alt), img);
};

globalThis.chrome?.runtime?.onMessage?.addListener((message) => {
  if (message.type !== "ddg-icon-404") return;

  notFoundIconUrls.add(message.iconUrl);
  document.querySelectorAll("img[data-ddg-icon-url]").forEach((img) => {
    if (img.dataset.ddgIconUrl !== message.iconUrl) return;
    replaceWithFallback(img);
  });
});

// --- DOM ELEMENT SELECTORS ---
const body = document.body;
const clockElement = document.getElementById("clock");
const greetingTextElement = document.getElementById("greeting-text");
const backgroundContainer = document.getElementById("background-container");
const bookmarksContainer = document.getElementById("bookmarks-container");
const settingsBtn = document.getElementById("settings-btn");
const contextMenu = document.getElementById("bookmark-context-menu");
const contextMenuName = document.getElementById("context-menu-name");
const contextMenuUrl = document.getElementById("context-menu-url");
const editBtn = document.getElementById("edit-bookmark-btn");
const removeBtn = document.getElementById("remove-bookmark-btn");
const quoteText = document.getElementById("quote-text");
const quoteAuthor = document.getElementById("quote-author");
const quoteContainer = document.getElementById("quote-container");
const pageDotList = document.getElementById("page-dot-list");
const pageDotUp = document.getElementById("page-dot-up");
const pageDotDown = document.getElementById("page-dot-down");

// --- STATE ---
let bookmarks = [];
let contextMenuBookmarkId = null;
let clockFormat = "24h";
let contextMenuTimeout = null;
let draggedItem = null;
let currentPage = 0;
let username = "User";

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

const getDefaultUserIcon = (uname = "User") => {
  const firstLetter = uname.trim().charAt(0).toUpperCase() || "U";
  return `https://placehold.co/40x40/cba6f7/1e1e2e?text=${firstLetter}`;
};

const saveImageToIndexedDB = (file, key = "image") => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ImageStorage", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(file, key);
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
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images");
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
  if (theme === "system") actualTheme = getSystemTheme();
  body.className = `${actualTheme}-theme`;
}

// --- QUOTE FUNCTIONALITY ---
async function fetchQuote() {
  try {
    const response = await fetch(QUOTE_API_URL);
    if (!response.ok) throw new Error("Quote fetch failed");
    const data = await response.json();
    quoteText.textContent = `\u201C${data.quote}\u201D`;
    quoteAuthor.textContent = `\u2014 ${data.author}`;
    quoteContainer.classList.remove("hidden");
  } catch (err) {
    console.warn("Could not fetch quote:", err);
    quoteContainer.classList.add("hidden");
  }
}

// --- PAGE DOTS ---
function renderPageDots() {
  const totalPages = Math.ceil(bookmarks.length / BOOKMARKS_PER_PAGE) || 1;
  const visiblePages = Math.max(totalPages, 1);

  if (currentPage >= visiblePages) currentPage = visiblePages - 1;

  pageDotList.innerHTML = "";

  for (let i = 0; i < visiblePages; i++) {
    const dot = document.createElement("button");
    dot.className = "page-dot";
    if (i === currentPage) dot.classList.add("active");
    dot.setAttribute("aria-label", `Page ${i + 1}`);
    dot.addEventListener("click", () => {
      currentPage = i;
      renderBookmarks();
    });
    pageDotList.appendChild(dot);
  }

  // Update arrow states
  pageDotUp.disabled = currentPage === 0;
  pageDotDown.disabled = currentPage >= visiblePages - 1;
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
    clockElement.textContent = `${hours.toString().padStart(2, "0")}:${minutes}`;
  }

  let greeting = "Good evening";
  if (now.getHours() < 12) greeting = "Good morning";
  else if (now.getHours() < 18) greeting = "Good afternoon";
  greetingTextElement.textContent = `${greeting}, ${username}`;
}

async function loadAndApplySettings() {
  // --- Instant: sync settings, theme, clock, bookmarks ---
  const theme = getSetting("theme", "system");
  applyTheme(theme);
  clockFormat = getSetting("clockFormat", "24h");
  username = getSetting("username", "User");
  updateTimeAndGreeting();

  // Apply stored background color immediately so body matches wallpaper
  // before the actual image finishes loading
  const storedBgColor = getSetting("bgDominantColor", "");
  if (storedBgColor) {
    body.style.backgroundColor = storedBgColor;
  }

  bookmarks = getSetting("bookmarks", []);
  renderBookmarks();

  // --- Non-blocking: background image + dominant color extraction ---
  const backgroundKey = getSetting("background", "");
  if (!backgroundKey) {
    backgroundContainer.style.backgroundImage = "";
    clearDominantColorTheme();
    body.style.backgroundColor = "";
    return;
  }

  // Fire-and-forget: load image + extract colors without blocking UI
  (async () => {
    try {
      let bgSource;
      if (backgroundKey === "fromIndexedDB") {
        const bgBlob = await loadImageBlobFromIndexedDB("background");
        if (!bgBlob) {
          backgroundContainer.style.backgroundImage = "";
          clearDominantColorTheme();
          body.style.backgroundColor = "";
          return;
        }
        bgSource = bgBlob;
      } else {
        bgSource = backgroundKey;
      }

      // Set background image so user sees it immediately
      if (bgSource instanceof Blob) {
        const bgUrl = URL.createObjectURL(bgSource);
        backgroundContainer.style.backgroundImage = `url('${bgUrl}')`;
      } else {
        backgroundContainer.style.backgroundImage = `url('${bgSource}')`;
      }

      // Extract dominant colors and update the stored background color
      await applyDominantColorTheme(bgSource);
      const computedBase = body.style.getPropertyValue("--base").trim();
      if (computedBase) {
        setSetting("bgDominantColor", computedBase);
      }
    } catch (err) {
      console.warn("Background load failed:", err);
      backgroundContainer.style.backgroundImage = "";
      clearDominantColorTheme();
      body.style.backgroundColor = "";
    }
  })();
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
  if (iconUrl) img.dataset.ddgIconUrl = iconUrl;
  img.src = iconUrl || getDefaultIcon();

  if (iconUrl && notFoundIconUrls.has(iconUrl)) {
    return createFallbackFavicon(hostname);
  }

  globalThis.chrome?.runtime
    ?.sendMessage?.({
      type: "check-ddg-icon",
      iconUrl,
    })
    .then?.((response) => {
      if (response?.statusCode === 404) {
        notFoundIconUrls.add(iconUrl);
        replaceWithFallback(img);
      }
    })
    .catch?.(() => {});

  return img;
}

function createFallbackFavicon(hostname) {
  if (!hostname) {
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
    "#9e6dff",
    "#00D2D3",
    "#FF9F43",
  ];
  const color = colors[firstLetter.charCodeAt(0) % colors.length];

  const fallbackDiv = document.createElement("div");
  fallbackDiv.className = "bookmark-icon fallback-favicon";
  fallbackDiv.style.cssText = `
    width: 48px; height: 48px; background-color: ${color};
    border-radius: 12px; display: flex; align-items: center;
    justify-content: center; color: white; font-family: Arial, sans-serif;
    font-size: 1.4rem; flex-shrink: 0;
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
    b.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const totalPages =
    Math.ceil(filteredBookmarks.length / BOOKMARKS_PER_PAGE) || 1;

  if (currentPage >= totalPages) currentPage = totalPages - 1;

  const startIndex = currentPage * BOOKMARKS_PER_PAGE;
  const pageBookmarks = filteredBookmarks.slice(
    startIndex,
    startIndex + BOOKMARKS_PER_PAGE,
  );

  pageBookmarks.forEach((bookmark, index) => {
    const bookmarkElement = document.createElement("a");
    bookmarkElement.href = bookmark.url;
    bookmarkElement.draggable = true;
    bookmarkElement.dataset.id = bookmark.id;
    bookmarkElement.className = "bookmark";
    bookmarkElement.style.animationDelay = `${index * 0.04}s`;

    const iconContainer = document.createElement("div");
    iconContainer.className = "bookmark-icon-container";
    const faviconElement = createFaviconElement(bookmark.url);
    const faviconImg =
      faviconElement.dataset.ddgIcon404 === "true"
        ? createFallbackFavicon(faviconElement.alt)
        : faviconElement;
    faviconImg.classList.add("bookmark-icon");
    iconContainer.appendChild(faviconImg);
    bookmarkElement.appendChild(iconContainer);

    const nameSpan = document.createElement("span");
    nameSpan.className = "bookmark-name";
    nameSpan.textContent = bookmark.name;
    bookmarkElement.appendChild(nameSpan);

    bookmarkElement.addEventListener("dragstart", (e) => {
      draggedItem = e.currentTarget;
      e.currentTarget.classList.add("dragging");
    });
    bookmarkElement.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.currentTarget.classList.add("drag-over");
    });
    bookmarkElement.addEventListener("dragleave", (e) =>
      e.currentTarget.classList.remove("drag-over"),
    );
    bookmarkElement.addEventListener("drop", handleDrop);
    bookmarkElement.addEventListener("dragend", () => {
      document
        .querySelectorAll(".bookmark")
        .forEach((b) => b.classList.remove("dragging", "drag-over"));
    });
    bookmarkElement.addEventListener("contextmenu", (e) =>
      showContextMenu(e, bookmark.id),
    );

    bookmarksContainer.appendChild(bookmarkElement);
  });

  if (bookmarks.length < MAX_BOOKMARKS && currentPage === totalPages - 1) {
    const addTile = document.createElement("button");
    addTile.id = "add-bookmark-tile";
    addTile.innerHTML = `
        <div class="add-icon-container">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </div>
        <span class="add-tile-text">Add New</span>`;
    addTile.addEventListener("click", () => showAddBookmarkModal());
    bookmarksContainer.appendChild(addTile);
  }

  renderPageDots();
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
      renderBookmarks();
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

  await modalManager.createModal(
    "settings",
    ModalTemplates.settings(modalManager, {
      ...currentSettings,
      currentUserIconUrl: getSetting("userIconUrl", ""),
      currentBackgroundUrl: getSetting("backgroundUrl", ""),

      onUsernameChange: (newName) => {
        username = newName;
        updateTimeAndGreeting();
        setSetting("username", newName);
      },

      onUserIconChange: async (iconUrl) => {
        try {
          const response = await fetch(iconUrl, { mode: "cors" });
          const blob = await response.blob();
          await saveImageBlobToIndexedDB(blob, "userIcon");
          setSetting("userIcon", "fromIndexedDB");
          setSetting("userIconUrl", iconUrl);
          setSetting("userIconFileName", "");
        } catch (e) {
          console.warn("Failed to cache profile image", e);
          setSetting("userIcon", iconUrl);
          setSetting("userIconUrl", iconUrl);
          setSetting("userIconFileName", "");
        }
      },

      onUserIconFileChange: async (file) => {
        await saveImageToIndexedDB(file, "userIcon");
        setSetting("userIcon", "fromIndexedDB");
        setSetting("userIconUrl", "");
        setSetting("userIconFileName", file.name);
      },

      onUserIconRemove: () => {
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
          await applyDominantColorTheme(blob);
          setSetting(
            "bgDominantColor",
            body.style.getPropertyValue("--base").trim(),
          );
          setSetting("background", "fromIndexedDB");
          setSetting("backgroundUrl", bgUrl);
          setSetting("backgroundFileName", "");
        } catch (e) {
          console.warn("Failed to cache background image", e);
          backgroundContainer.style.backgroundImage = `url('${bgUrl}')`;
          await applyDominantColorTheme(bgUrl);
          setSetting(
            "bgDominantColor",
            body.style.getPropertyValue("--base").trim(),
          );
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
        await applyDominantColorTheme(blob);
        setSetting(
          "bgDominantColor",
          body.style.getPropertyValue("--base").trim(),
        );
        setSetting("background", "fromIndexedDB");
        setSetting("backgroundUrl", "");
        setSetting("backgroundFileName", file.name);
      },

      onBackgroundRemove: () => {
        backgroundContainer.style.backgroundImage = "";
        clearDominantColorTheme();
        body.style.backgroundColor = "";
        setSetting("background", "");
        setSetting("backgroundUrl", "");
        setSetting("backgroundFileName", "");
        setSetting("bgDominantColor", "");
      },

      onThemeChange: (theme) => {
        applyTheme(theme);
        setSetting("theme", theme);
      },
    }),
  );
}

async function showAddBookmarkModal() {
  if (bookmarks.length >= MAX_BOOKMARKS) {
    await modalManager.createModal(
      "limit-reached",
      ModalTemplates.alert(modalManager, {
        title: "Limit Reached",
        message: `You can only have a maximum of ${MAX_BOOKMARKS} bookmarks.`,
      }),
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
            favicon: `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`,
          };
          bookmarks.push(newBookmark);
          setSetting("bookmarks", bookmarks);
          const newIndex = bookmarks.length - 1;
          currentPage = Math.floor(newIndex / BOOKMARKS_PER_PAGE);
          renderBookmarks();
        }
      },
    }),
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
          bookmarks[bookmarkIndex] = { ...bookmarks[bookmarkIndex], name, url };
          if (oldUrl !== url) {
            bookmarks[bookmarkIndex].favicon =
              `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`;
          }
          setSetting("bookmarks", bookmarks);
          renderBookmarks();
        }
      },
    }),
  );
}

// --- PAGE NAVIGATION HELPERS ---
let scrollCooldown = false;

function navigatePage(direction) {
  const totalPages = Math.ceil(bookmarks.length / BOOKMARKS_PER_PAGE) || 1;
  const nextPage = currentPage + direction;
  if (nextPage < 0 || nextPage >= totalPages || scrollCooldown) return;

  scrollCooldown = true;
  bookmarksContainer.classList.add("page-exit");

  setTimeout(() => {
    currentPage = nextPage;
    renderBookmarks();
    bookmarksContainer.classList.remove("page-exit");
    bookmarksContainer.classList.add("page-enter");
    setTimeout(() => bookmarksContainer.classList.remove("page-enter"), 250);
  }, 150);

  setTimeout(() => {
    scrollCooldown = false;
  }, 400);
}

// --- EVENT HANDLERS ---
clockElement.addEventListener("click", () => {
  clockFormat = clockFormat === "24h" ? "12h" : "24h";
  setSetting("clockFormat", clockFormat);
  updateTimeAndGreeting();
});

settingsBtn.addEventListener("click", showSettingsModal);

// Scroll-based page navigation (wheel events on bookmarks area)
const bookmarksArea = document.querySelector(".bookmarks-area");
if (bookmarksArea) {
  bookmarksArea.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.deltaY > 0) navigatePage(1);
      else if (e.deltaY < 0) navigatePage(-1);
    },
    { passive: false },
  );
}

// Keyboard arrow navigation (when not focused on inputs)
document.addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable)
    return;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") {
    e.preventDefault();
    navigatePage(1);
  } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
    e.preventDefault();
    navigatePage(-1);
  }
});

pageDotUp.addEventListener("click", () => navigatePage(-1));
pageDotDown.addEventListener("click", () => navigatePage(1));

editBtn.addEventListener("click", () => {
  hideAnimated(contextMenu);
  const bookmark = bookmarks.find((b) => b.id === contextMenuBookmarkId);
  if (bookmark) showEditBookmarkModal(bookmark);
});

removeBtn.addEventListener("click", () => {
  hideAnimated(contextMenu);
  bookmarks = bookmarks.filter((b) => b.id !== contextMenuBookmarkId);
  setSetting("bookmarks", bookmarks);
  renderBookmarks();
});

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
    if (currentTheme === "system") applyTheme("system");
  });

// --- INITIALIZATION ---
loadAndApplySettings();
setInterval(updateTimeAndGreeting, 1000);
fetchQuote();
setInterval(fetchQuote, 5 * 60 * 1000);
