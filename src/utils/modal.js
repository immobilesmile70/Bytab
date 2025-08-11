export class ModalManager {
  constructor() {
    this.activeModals = new Map();
    this.animationDuration = 200;
    this.escListener = null;
  }

  async createModal(id, config) {
    if (this.activeModals.has(id)) {
      await this.closeModal(id);
    }

    const modal = this._buildModal(id, config);
    document.body.appendChild(modal);
    this.activeModals.set(id, { element: modal, config });

    await this._showModal(modal);

    return modal;
  }

  async closeModal(id) {
    const modalData = this.activeModals.get(id);
    if (!modalData) return;

    const { element } = modalData;

    if (this.escListener) {
      document.removeEventListener("keydown", this.escListener);
      this.escListener = null;
    }

    await this._hideModal(element);

    element.remove();
    this.activeModals.delete(id);
  }

  async closeAllModals() {
    const promises = Array.from(this.activeModals.keys()).map((id) =>
      this.closeModal(id)
    );
    await Promise.all(promises);
  }

  _buildModal(id, config) {
    const {
      title,
      content,
      size = "default",
      closable = true,
      backdrop = true,
      className = "",
    } = config;

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = `modal-overlay opacity-0 ${className}`;
    overlay.style.display = "none";

    if (backdrop) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          this.closeModal(id);
        }
      });

      this.escListener = (e) => {
        if (e.key === "Escape") {
          this.closeModal(id);
        }
      };
      document.addEventListener("keydown", this.escListener);
    }

    const modalContainer = document.createElement("div");
    modalContainer.className = `modal opacity-0 ${
      size === "large" ? "settings-modal" : ""
    }`;

    let headerHTML = "";
    if (title) {
      headerHTML = `
        <header class="modal-header">
            <h2>${title}</h2>
            ${
              closable
                ? `
                <button class="modal-close-btn" data-close-modal="${id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                    </svg>
                </button>
            `
                : ""
            }
        </header>
      `;
    }

    const contentHTML = `
      <main class="modal-content ${title ? "" : "no-header"}">
          ${typeof content === "string" ? content : ""}
      </main>
    `;

    modalContainer.innerHTML = headerHTML + contentHTML;
    overlay.appendChild(modalContainer);

    const closeButtons = overlay.querySelectorAll("[data-close-modal]");
    closeButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeModal(id);
      });
    });

    if (typeof content === "function") {
      const contentContainer = overlay.querySelector(".modal-content");
      content(contentContainer);
    }

    return overlay;
  }

  _showModal(modal) {
    return new Promise((resolve) => {
      modal.style.display = "flex";

      modal.offsetHeight;

      requestAnimationFrame(() => {
        const modalContainer = modal.querySelector(".modal");
        modal.classList.remove("opacity-0");
        modalContainer.classList.remove("opacity-0");
        resolve();
      });
    });
  }

  _hideModal(modal) {
    return new Promise((resolve) => {
      const onTransitionEnd = (event) => {
        if (event.propertyName !== "opacity") return;
        modal.removeEventListener("transitionend", onTransitionEnd);
        resolve();
      };

      modal.addEventListener("transitionend", onTransitionEnd);

      const modalContainer = modal.querySelector(".modal");
      modal.classList.add("opacity-0");
      modalContainer.classList.add("opacity-0");

      setTimeout(() => {
        modal.removeEventListener("transitionend", onTransitionEnd);
        resolve();
      }, this.animationDuration + 50);
    });
  }

  getModal(id) {
    const modalData = this.activeModals.get(id);
    return modalData ? modalData.element : null;
  }

  isModalActive(id) {
    return this.activeModals.has(id);
  }

  hasAnyModals() {
    return this.activeModals.size > 0;
  }
}

export class ModalTemplates {
  static settings(modalManager, callbacks = {}) {
    const {
      currentUsername = "User",
      currentTheme = "dark",
      currentUserIcon = "",
      currentBackground = "",
      currentUserIconFileName = "",
      currentBackgroundFileName = "",
      currentUserIconUrl = "",
      currentBackgroundUrl = "",
    } = callbacks;

    const isUserIconFromUrl = currentUserIcon.startsWith("http");
    const userIconDisplayName = !isUserIconFromUrl
      ? currentUserIconFileName
      : "";
    const displayUserIcon =
      currentUserIcon && typeof currentUserIcon === "string"
        ? currentUserIcon
        : `https://placehold.co/60x60/cba6f7/1e1e2e?text=${
            currentUsername.trim().charAt(0).toUpperCase() || "U"
          }`;

    const isBgFromUrl = currentBackground.startsWith("http");
    const bgDisplayName = !isBgFromUrl ? currentBackgroundFileName : "";

    return {
      title: "Settings",
      size: "large",
      content: (container) => {
        container.innerHTML = `
        <div class="settings-container">
          <nav class="settings-nav">
            <a href="#" class="nav-item active" data-tab="profile">Profile</a>
            <a href="#" class="nav-item" data-tab="themes">Themes</a>
            <a href="#" class="nav-item" data-tab="about">About</a>
          </nav>

          <div class="settings-content">
            <section id="settings-profile-content" class="settings-section active">
              <h3>User Profile</h3>
              <div class="form-group">
                <div class="form-field">
                  <label for="modal-username-input">Username</label>
                  <input type="text" id="modal-username-input" class="form-input" placeholder="Enter your name" value="${currentUsername}">
                </div>
                <div class="form-field">
                  <label>Profile Picture</label>
                  <div class="image-control">
                    <div class="image-preview">
                      <img id="modal-user-icon-preview" src="${displayUserIcon}" alt="Profile Preview">
                    </div>
                    <div class="image-actions">
                      <input type="text" id="modal-user-icon-url-input" class="form-input" placeholder="Image URL" value="${currentUserIconUrl}">
                      <input type="file" id="modal-user-icon-file-input" accept="image/*" class="file-input" style="display: none;">
                      <div class="actions-flex">
                        <button type="button" id="modal-upload-user-icon-btn" class="btn btn-secondary">Upload</button>
                        ${
                          currentUserIcon
                            ? `<button type="button" id="modal-remove-user-icon" class="btn btn-secondary btn-sm">Remove</button>`
                            : ""
                        }
                      </div>
                      <div id="user-icon-file-name" class="file-name-display" title="${userIconDisplayName}">${userIconDisplayName}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="settings-themes-content" class="settings-section">
              <h3>Theme</h3>
              <div class="theme-options">
                  <label class="theme-option ${
                    currentTheme === "system" ? "selected" : ""
                  }" id="modal-system-theme-label">
                      <input type="radio" name="modal-theme" value="system" ${
                        currentTheme === "system" ? "checked" : ""
                      } style="display: none;">
                      <div class="theme-name">System</div>
                      <div class="theme-colors"><div class="theme-color system-auto"></div><div class="theme-color system-gradient"></div></div>
                  </label>
                  <label class="theme-option ${
                    currentTheme === "light" ? "selected" : ""
                  }" id="modal-light-theme-label">
                      <input type="radio" name="modal-theme" value="light" ${
                        currentTheme === "light" ? "checked" : ""
                      } style="display: none;">
                      <div class="theme-name">Latte</div>
                      <div class="theme-colors"><div class="theme-color light-base"></div><div class="theme-color light-blue"></div><div class="theme-color light-green"></div><div class="theme-color light-orange"></div></div>
                  </label>
                  <label class="theme-option ${
                    currentTheme === "dark" ? "selected" : ""
                  }" id="modal-dark-theme-label">
                      <input type="radio" name="modal-theme" value="dark" ${
                        currentTheme === "dark" ? "checked" : ""
                      } style="display: none;">
                      <div class="theme-name">Mocha</div>
                      <div class="theme-colors"><div class="theme-color dark-base"></div><div class="theme-color dark-blue"></div><div class="theme-color dark-green"></div><div class="theme-color dark-orange"></div></div>
                  </label>
              </div>
              <h3>Background</h3>
              <div class="form-group">
                <div class="form-field">
                  <div class="image-control">
                    <div class="image-preview bg-preview">
                      ${
                        currentBackground
                          ? `<img id="modal-bg-preview" src="${currentBackground}" alt="Background Preview">`
                          : '<div class="no-background">No background set</div>'
                      }
                    </div>
                    <div class="image-actions">
                      <input type="text" id="modal-bg-url-input" class="form-input" placeholder="Background URL" value="${currentBackgroundUrl}">
                      <input type="file" id="modal-bg-file-input" accept="image/*" class="file-input" style="display: none;">
                      <div class="actions-flex">
                        <button type="button" id="modal-upload-bg-btn" class="btn btn-secondary">Upload</button>
                        ${
                          currentBackground
                            ? `<button type="button" id="modal-remove-bg" class="btn btn-secondary btn-sm">Remove</button>`
                            : ""
                        }
                      </div>
                      <div id="bg-file-name" class="file-name-display" title="${bgDisplayName}">${bgDisplayName}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="settings-about-content" class="settings-section">
              <h3>About</h3>
              <p>Bytab v1.0</p>
              <p>Made with 💖 by <a href="https://github.com/immobilesmile70" style="text-decoration: none; color: var(--blue); font-weight: 700;">RickByte</a>!</p>
            </section>
          </div>
        </div>
      `;

        this._attachSettingsListeners(container, callbacks);
      },
    };
  }

  static addBookmark(modalManager, callbacks = {}) {
    return {
      title: "Add Bookmark",
      content: (container) => {
        container.innerHTML = `
          <form id="modal-add-bookmark-form" class="form-group">
              <input type="text" id="modal-bookmark-name-input" placeholder="Name (e.g., DuckDuckGo)" required class="form-input">
              <input type="text" id="modal-bookmark-url-input" placeholder="URL (e.g., https://duckduckgo.com)" required class="form-input">
              <div class="form-actions">
                  <button type="button" id="modal-cancel-add-btn" class="btn btn-secondary btn-flex">Cancel</button>
                  <button type="submit" class="btn btn-primary btn-flex"> Add Bookmark</button>
              </div>
          </form>
        `;

        const form = container.querySelector("#modal-add-bookmark-form");
        const cancelBtn = container.querySelector("#modal-cancel-add-btn");

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const name = container
            .querySelector("#modal-bookmark-name-input")
            .value.trim();
          let url = container
            .querySelector("#modal-bookmark-url-input")
            .value.trim();

          if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
          }

          if (callbacks.onSubmit) {
            callbacks.onSubmit(name, url);
          }

          modalManager.closeModal("add-bookmark");
        });

        cancelBtn.addEventListener("click", () => {
          modalManager.closeModal("add-bookmark");
        });
      },
    };
  }

  static editBookmark(modalManager, bookmark, callbacks = {}) {
    return {
      title: "Edit Bookmark",
      content: (container) => {
        container.innerHTML = `
          <form id="modal-edit-bookmark-form" class="form-group">
              <input type="hidden" id="modal-edit-bookmark-id" value="${bookmark.id}">
              <input type="text" id="modal-edit-bookmark-name" required class="form-input" placeholder="Name" value="${bookmark.name}">
              <input type="text" id="modal-edit-bookmark-url" required class="form-input" placeholder="URL" value="${bookmark.url}">
              <div class="form-actions">
                  <button type="button" id="modal-cancel-edit-btn" class="btn btn-secondary btn-flex">Cancel</button>
                  <button type="submit" class="btn btn-primary btn-flex">Save</button>
              </div>
          </form>
        `;

        const form = container.querySelector("#modal-edit-bookmark-form");
        const cancelBtn = container.querySelector("#modal-cancel-edit-btn");

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const id = container.querySelector("#modal-edit-bookmark-id").value;
          const name = container.querySelector(
            "#modal-edit-bookmark-name"
          ).value;
          let url = container.querySelector("#modal-edit-bookmark-url").value;

          if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
          }

          if (callbacks.onSubmit) {
            callbacks.onSubmit(id, name, url);
          }

          modalManager.closeModal("edit-bookmark");
        });

        cancelBtn.addEventListener("click", () => {
          modalManager.closeModal("edit-bookmark");
        });
      },
    };
  }

  static _attachSettingsListeners(container, callbacks = {}) {
    const {
      onUsernameChange,
      onUserIconChange,
      onUserIconFileChange,
      onUserIconRemove,
      onBackgroundChange,
      onBackgroundFileChange,
      onBackgroundRemove,
      onThemeChange,
    } = callbacks;

    const navItems = container.querySelectorAll(".settings-nav .nav-item");
    const sections = container.querySelectorAll(".settings-section");
    navItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = item.getAttribute("data-tab");

        navItems.forEach((i) => i.classList.remove("active"));
        sections.forEach((s) => s.classList.remove("active"));

        item.classList.add("active");
        container
          .querySelector(`#settings-${tab}-content`)
          .classList.add("active");
      });
    });

    container
      .querySelector("#modal-username-input")
      .addEventListener("change", (e) => {
        onUsernameChange?.(e.target.value);
      });

    const userIconUrlInput = container.querySelector(
      "#modal-user-icon-url-input"
    );
    const userIconFileInput = container.querySelector(
      "#modal-user-icon-file-input"
    );
    const userIconFileNameDisplay = container.querySelector(
      "#user-icon-file-name"
    );
    const userIconPreview = container.querySelector("#modal-user-icon-preview");

    userIconUrlInput.addEventListener("change", (e) => {
      const url = e.target.value;
      if (url) {
        onUserIconChange?.(url);
        userIconPreview.src = url;
        userIconFileInput.value = "";
        userIconFileNameDisplay.textContent = "";
      }
    });

    container
      .querySelector("#modal-upload-user-icon-btn")
      .addEventListener("click", () => {
        userIconFileInput.click();
      });

    userIconFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        onUserIconFileChange?.(file);
        userIconFileNameDisplay.textContent = file.name;
        userIconUrlInput.value = "";
        userIconPreview.src = URL.createObjectURL(file);
      }
    });

    container
      .querySelector("#modal-remove-user-icon")
      ?.addEventListener("click", () => {
        onUserIconRemove?.();
        const username =
          container.querySelector("#modal-username-input").value || "User";
        userIconPreview.src = `https://placehold.co/60x60/cba6f7/1e1e2e?text=${
          username.trim().charAt(0).toUpperCase() || "U"
        }`;
        userIconUrlInput.value = "";
        userIconFileInput.value = "";
        userIconFileNameDisplay.textContent = "";
      });

    const bgUrlInput = container.querySelector("#modal-bg-url-input");
    const bgFileInput = container.querySelector("#modal-bg-file-input");
    const bgFileNameDisplay = container.querySelector("#bg-file-name");
    const bgPreviewContainer = container.querySelector(".bg-preview");

    bgUrlInput.addEventListener("change", (e) => {
      const url = e.target.value;
      if (url) {
        onBackgroundChange?.(url);
        bgPreviewContainer.innerHTML = `<img id="modal-bg-preview" src="${url}" alt="Background Preview">`;
        bgFileInput.value = "";
        bgFileNameDisplay.textContent = "";
      }
    });

    container
      .querySelector("#modal-upload-bg-btn")
      .addEventListener("click", () => {
        bgFileInput.click();
      });

    bgFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        onBackgroundFileChange?.(file);
        bgFileNameDisplay.textContent = file.name;
        bgUrlInput.value = "";
        bgPreviewContainer.innerHTML = `<img id="modal-bg-preview" src="${URL.createObjectURL(
          file
        )}" alt="Background Preview">`;
      }
    });

    container
      .querySelector("#modal-remove-bg")
      ?.addEventListener("click", () => {
        onBackgroundRemove?.();
        bgPreviewContainer.innerHTML =
          '<div class="no-background">No background set</div>';
        bgUrlInput.value = "";
        bgFileInput.value = "";
        bgFileNameDisplay.textContent = "";
      });

    container.querySelectorAll('input[name="modal-theme"]').forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          onThemeChange?.(e.target.value);
          container
            .querySelectorAll(".theme-option")
            .forEach((label) => label.classList.remove("selected"));
          e.target.closest(".theme-option").classList.add("selected");
        }
      });
    });
  }
}
