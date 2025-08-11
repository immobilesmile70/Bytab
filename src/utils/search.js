import { modalManager } from "../main.js";

const searchBox = document.getElementById("search-box");
const searchBtn = document.getElementById("search-btn");
const engineSelectBtn = document.getElementById("engine-select-btn");
const engineIcon = document.getElementById("engine-icon");
const dropdownMenu = document.getElementById("dropdown-menu");

const searchEngines = {
  google: {
    name: "Google",
    url: "https://www.google.com/search?q=",
    icon: "https://www.google.com/favicon.ico",
    shortcut: "g",
  },
  brave: {
    name: "Brave",
    url: "https://search.brave.com/search?q=",
    icon: "https://brave.com/static-assets/images/brave-favicon.png",
    shortcut: "br",
  },
  duckduckgo: {
    name: "DuckDuckGo",
    url: "https://duckduckgo.com/?q=",
    icon: "https://duckduckgo.com/favicon.ico",
    shortcut: "ddg",
  },
  bing: {
    name: "Bing",
    url: "https://www.bing.com/search?q=",
    icon: "https://www.bing.com/favicon.ico",
    shortcut: "bi",
  },
  yahoo: {
    name: "Yahoo",
    url: "https://search.yahoo.com/search?p=",
    icon: "https://search.yahoo.com/favicon.ico",
    shortcut: "y",
  },
  startpage: {
    name: "Startpage",
    url: "https://www.startpage.com/sp/search?query=",
    icon: "https://www.startpage.com/sp/cdn/favicons/favicon-96x96.png",
    shortcut: "sp",
  },
  ecosia: {
    name: "Ecosia",
    url: "https://www.ecosia.org/search?q=",
    icon: "https://cdn-static.ecosia.org/static/icons/favicon.ico",
    shortcut: "e",
  },
};

const shortcutMap = Object.keys(searchEngines).reduce((acc, key) => {
  acc[searchEngines[key].shortcut] = key;
  return acc;
}, {});

let selectedEngineKey = localStorage.getItem("selectedEngine") || "google";
let activeDropdownIndex = -1;

const detectEngineFromQuery = (query) => {
  const trimmedQuery = query.trim();

  const beginMatch = trimmedQuery.match(/^[!/](\w+)(\s+|$)/);
  if (beginMatch) {
    const code = beginMatch[1];
    if (shortcutMap[code]) {
      return {
        engineKey: shortcutMap[code],
        cleanQuery: trimmedQuery.replace(/^[!/]\w+\s*/, "").trim(),
        position: "beginning",
      };
    }
  }

  const endMatch = trimmedQuery.match(/(\s|^)([!/])(\w+)$/);
  if (endMatch) {
    const code = endMatch[3];
    if (shortcutMap[code]) {
      return {
        engineKey: shortcutMap[code],
        cleanQuery: trimmedQuery.replace(/\s*[!/]\w+$/, "").trim(),
        position: "end",
      };
    }
  }

  return null;
};

const removeEngineCodeFromQuery = (query) => {
  const detection = detectEngineFromQuery(query);
  return detection ? detection.cleanQuery : query;
};

const updateUI = (engineKey) => {
  const engine = searchEngines[engineKey];
  engineIcon.src = engine.icon;
  engineIcon.alt = engine.name;
  searchBox.placeholder = `Search ${engine.name}...`;
  localStorage.setItem("selectedEngine", engineKey);
};

const renderDropdown = () => {
  dropdownMenu.innerHTML = "";
  Object.keys(searchEngines).forEach((key, index) => {
    const engine = searchEngines[key];
    const li = document.createElement("button");
    li.classList.add("dropdown-item");
    li.setAttribute("data-engine-key", key);
    if (key === selectedEngineKey) {
      li.classList.add("selected");
    }
    if (index === activeDropdownIndex) {
      li.classList.add("active");
    }
    li.innerHTML = `
                        <img src="${engine.icon}" alt="${engine.name} Icon">
                        <span class="engine-name">${engine.name}</span>
                        <span class="engine-shortcut">/${engine.shortcut}</span>
                    `;
    dropdownMenu.appendChild(li);
  });
};

const handleDropdownSelection = (engineKey) => {
  selectedEngineKey = engineKey;
  updateUI(engineKey);

  const currentValue = searchBox.value.trim();
  const cleanedValue = removeEngineCodeFromQuery(currentValue);
  searchBox.value = cleanedValue;

  toggleDropdown(false);

  localStorage.setItem("query", searchBox.value);

  setTimeout(() => {
    searchBox.focus();
  }, 0);
};

const toggleDropdown = (show) => {
  if (show) {
    dropdownMenu.classList.add("visible");
    activeDropdownIndex = -1;
    renderDropdown();
  } else {
    dropdownMenu.classList.remove("visible");
  }
};

const performSearch = () => {
  let query = searchBox.value.trim();
  if (!query) return;

  const engineDetection = detectEngineFromQuery(query);
  if (engineDetection) {
    selectedEngineKey = engineDetection.engineKey;
    updateUI(selectedEngineKey);
    query = engineDetection.cleanQuery;
    if (!query) return;
  }

  const engine = searchEngines[selectedEngineKey];
  localStorage.removeItem("query");
  setTimeout(() => {
    window.location.href = `${engine.url}${encodeURIComponent(query)}`;
  }, 10);
};

document.addEventListener("keydown", (event) => {
  if (
    (!modalManager.hasAnyModals() && event.key === "/") ||
    (!modalManager.hasAnyModals() &&
      event.ctrlKey &&
      (event.key === "e" || event.key === "k"))
  ) {
    if (event.ctrlKey) {
      event.preventDefault();
    }
    searchBox.focus();
  }

  if (dropdownMenu.classList.contains("visible")) {
    const dropdownItems = dropdownMenu.querySelectorAll(".dropdown-item");
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeDropdownIndex = (activeDropdownIndex + 1) % dropdownItems.length;
      renderDropdown();
      setTimeout(() => {
        const updatedDropdownItems =
          dropdownMenu.querySelectorAll(".dropdown-item");
        const activeItem = updatedDropdownItems[activeDropdownIndex];
        if (activeItem) {
          activeItem.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }
      }, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeDropdownIndex =
        (activeDropdownIndex - 1 + dropdownItems.length) % dropdownItems.length;
      renderDropdown();
      setTimeout(() => {
        const updatedDropdownItems =
          dropdownMenu.querySelectorAll(".dropdown-item");
        const activeItem = updatedDropdownItems[activeDropdownIndex];
        if (activeItem) {
          activeItem.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }
      }, 0);
    } else if (event.key === "Enter" && activeDropdownIndex !== -1) {
      event.preventDefault();
      const engineKeys = Object.keys(searchEngines);
      const engineKey = engineKeys[activeDropdownIndex];
      handleDropdownSelection(engineKey);
      return;
    }
  }

  if (
    event.key === "Enter" &&
    document.activeElement === searchBox &&
    !dropdownMenu.classList.contains("visible")
  ) {
    performSearch();
  } else if (
    event.key === "Enter" &&
    document.activeElement === searchBox &&
    dropdownMenu.classList.contains("visible")
  ) {
    if (activeDropdownIndex === -1) {
      const value = searchBox.value.trim();
      const [command, ...rest] = value.split(" ");
      const commandWithoutPrefix = command.slice(1);

      if (
        (command.startsWith("!") || command.startsWith("/")) &&
        shortcutMap[commandWithoutPrefix]
      ) {
        const engineKey = shortcutMap[commandWithoutPrefix];
        selectedEngineKey = engineKey;
        updateUI(engineKey);
        toggleDropdown(false);

        const remainingQuery = rest.join(" ").trim();
        if (remainingQuery) {
          searchBox.value = remainingQuery;
          performSearch();
        }
      } else {
        toggleDropdown(false);
        performSearch();
      }
    }
  }
});

searchBox.addEventListener("input", () => {
  const value = searchBox.value.trim();
  localStorage.setItem("query", value);

  if (value.startsWith("!") || value.startsWith("/")) {
    toggleDropdown(true);

    const engineDetection = detectEngineFromQuery(value);
    if (engineDetection) {
      selectedEngineKey = engineDetection.engineKey;
      updateUI(engineDetection.engineKey);

      searchBox.value = engineDetection.cleanQuery;
      localStorage.setItem("query", searchBox.value);

      toggleDropdown(false);
    }
  } else {
    toggleDropdown(false);
  }
});

searchBtn.addEventListener("click", performSearch);

engineSelectBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const isCurrentlyVisible = dropdownMenu.classList.contains("visible");
  toggleDropdown(!isCurrentlyVisible);
  setTimeout(() => {
    searchBox.focus();
  }, 0);
});

dropdownMenu.addEventListener("click", (event) => {
  event.stopPropagation();

  const dropdownItem = event.target.closest(".dropdown-item");
  if (dropdownItem) {
    const engineKey = dropdownItem.getAttribute("data-engine-key");
    if (engineKey) {
      handleDropdownSelection(engineKey);
    }
  }
});

document.addEventListener("click", (event) => {
  if (
    !dropdownMenu.contains(event.target) &&
    !engineSelectBtn.contains(event.target) &&
    !searchBox.contains(event.target)
  ) {
    toggleDropdown(false);
  }
});

updateUI(selectedEngineKey);
renderDropdown();

const savedQuery = localStorage.getItem("query");
if (savedQuery) {
  searchBox.value = savedQuery;
}
