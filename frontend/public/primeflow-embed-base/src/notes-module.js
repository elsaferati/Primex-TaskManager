(function () {
  const storageKey = "primeflow-notes-module-v4";
  const defaultConfig = {
    moduleName: "Notes",
    currentUser: "AT",
    users: ["AT", "Arber", "Dion", "Elira", "GA", "Admin"],
    categories: ["", "30_TRAJNIME", "40_DEFINIME", "50_RREGULLORE"]
  };
  const categoryAliases = {
    Trajnime: "30_TRAJNIME",
    Definime: "40_DEFINIME",
    Rregullore: "50_RREGULLORE"
  };

  const pageConfig = window.PrimeFlowNotesConfig || {};
  const config = {
    ...defaultConfig,
    ...pageConfig,
    categories: prependEmpty(pageConfig.categories || defaultConfig.categories).map(normalizeCategory)
  };

  function prependEmpty(items) {
    const list = Array.isArray(items) ? items : [];
    return list[0] === "" ? list : ["", ...list];
  }

  function normalizeCategory(category) {
    return categoryAliases[category] || category;
  }

  function normalizeQuestionType(type) {
    return questionTypeAliases[type] || type;
  }

  const questionTypeOptions = ["", "PYETJE PËR DETYRË TË RE", "PYETJE PËR SHUMË PRODUKTE", "PYETJE PËR PROBLEME URGJENTE", "PYETJE PËR KO1/KO2", "PYETJE PËR PROJEKT TË RI", "PYETJE PËR BARAZIM"];

  function isAdded(note) {
    return Boolean(note.category);
  }

  const state = {
    notes: loadNotes(),
    filters: {
      status: "All",
      category: "All",
      search: ""
    },
    activeView: decodeURIComponent(window.location.hash.replace("#", "")) || "Notes",
    editingId: null
  };

  function loadNotes() {
    try {
      const stored = localStorage.getItem(storageKey);
      return migrateCategories(stored ? JSON.parse(stored) : []);
    } catch (error) {
      console.warn("Could not load saved notes", error);
      return [];
    }
  }

  function saveNotes() {
    state.notes = migrateCategories(state.notes);
    localStorage.setItem(storageKey, JSON.stringify(state.notes));
  }

  function migrateCategories(notes) {
    return notes.map((note) => ({ ...note, category: normalizeCategory(note.category || ""), questionType: normalizeQuestionType(note.questionType || "") }));
  }

  function createId() {
    return `NOTE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function stripHtml(value) {
    const temp = document.createElement("div");
    temp.innerHTML = value || "";
    return temp.textContent || temp.innerText || "";
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function optionList(items, selected) {
    return items
      .map((item) => `<option value="${escapeHtml(item)}"${item === selected ? " selected" : ""}>${escapeHtml(item || "Select...")}</option>`)
      .join("");
  }

  function notifyHost(type, payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "primeflow-notes-module", type, payload }, "*");
    }
  }

  function visibleCategories() {
    return config.categories.filter(Boolean);
  }

  function filteredNotes() {
    const search = state.filters.search.trim().toLowerCase();

    return state.notes.filter((note) => {
      const statusMatch = state.filters.status === "All" || note.status === state.filters.status;
      const categoryMatch = state.filters.category === "All" || note.category === state.filters.category;
      const searchTarget = `${note.title} ${stripHtml(note.description)} ${note.category} ${note.questionType} ${note.fromWho}`.toLowerCase();
      const searchMatch = !search || searchTarget.includes(search);
      return statusMatch && categoryMatch && searchMatch;
    });
  }

  function notesForView(category) {
    const search = state.filters.search.trim().toLowerCase();

    return state.notes.filter((note) => {
      const categoryMatch = note.category === category;
      const statusMatch = state.filters.status === "All" || note.status === state.filters.status;
      const searchTarget = `${note.title} ${stripHtml(note.description)} ${note.category} ${note.questionType} ${note.fromWho} ${note.discussed}`.toLowerCase();
      const searchMatch = !search || searchTarget.includes(search);
      return categoryMatch && statusMatch && searchMatch;
    });
  }

  function noteRows(notes, showQuestionTypeColumn = false) {
    if (!notes.length) {
      return `<tr><td colspan="${showQuestionTypeColumn ? 9 : 8}" class="notes-empty">No notes saved yet. Write a note above and press Save note.</td></tr>`;
    }

    return notes
      .map((note, index) => {
        const isEditing = state.editingId === note.id;
        const noteCell = isEditing
          ? `<div class="notes-editor notes-editor-small" id="edit-description-${note.id}" contenteditable="true">${note.description}</div>`
          : `<div class="notes-description">${note.description}</div>`;

        return `
          <tr>
            <td>${index + 1}</td>
            <td class="notes-name-cell">${noteCell}</td>
            <td>
              <select class="notes-select notes-cell-select" data-note-field="discussed" data-id="${note.id}">
                ${optionList(["No", "Yes"], note.discussed)}
              </select>
            </td>
            <td><span class="notes-badge">${escapeHtml(note.createdBy || note.fromWho || "-")}</span></td>
            <td>
              <select class="notes-select notes-cell-select" data-note-field="category" data-id="${note.id}">
                ${optionList(config.categories, note.category)}
              </select>
            </td>
            ${showQuestionTypeColumn ? `
              <td>
                ${note.category === "Pyetje"
                  ? `<select class="notes-select notes-cell-select" data-note-field="questionType" data-id="${note.id}">${optionList(questionTypeOptions, note.questionType || "")}</select>`
                  : `<span class="notes-muted-action">-</span>`}
              </td>
            ` : ""}
            <td><span class="notes-badge ${isAdded(note) ? "notes-badge-open" : ""}">${isAdded(note) ? "Yes" : "No"}</span></td>
            <td><span class="notes-badge ${note.status === "Open" ? "notes-badge-open" : "notes-badge-closed"}">${escapeHtml(note.status)}</span></td>
            <td><div class="notes-row-actions">
              ${isEditing
                ? `<button class="notes-mini-button" data-action="save-edit" data-id="${note.id}">Save</button><button class="notes-mini-button" data-action="cancel-edit">Cancel</button>`
                : `<button class="notes-mini-button" data-action="edit" data-id="${note.id}">Edit</button>`}
              ${note.status === "Open" ? `<button class="notes-mini-button" data-action="close" data-id="${note.id}">Close</button>` : `<span class="notes-muted-action">Closed</span>`}
            </div></td>
          </tr>
        `;
      })
      .join("");
  }
  function categoryNotesHtml(notes) {
    if (!notes.length) {
      return `<div class="notes-empty">No notes saved in this view.</div>`;
    }

    return notes
      .map(
        (note) => `
          <article class="notes-user-note">
            <h3>${escapeHtml(note.title)}</h3>
            <div class="notes-user-note-meta">
              <span class="notes-badge notes-badge-open">${escapeHtml(note.category)}</span>
              <span class="notes-badge">Nga: ${escapeHtml(note.fromWho)}</span>
              <span class="notes-badge">Diskutuar: ${escapeHtml(note.discussed)}</span>
            </div>
            <div class="notes-user-note-body">${note.description}</div>
          </article>
        `
      )
      .join("");
  }

  function sidebarItems(categories) {
    const totalOpen = state.notes.filter((note) => note.status === "Open").length;
    const questionOpen = state.notes.filter((note) => note.status === "Open" && note.category === "Pyetje").length;
    const classifiedOpen = state.notes.filter((note) => note.status === "Open" && note.category && note.category !== "Pyetje").length;
    const items = [
      { label: "Notes", count: totalOpen, action: "change-view" },
      { label: "Classifications", count: classifiedOpen, action: "open-classifications" },
      { label: "PYETJE PER BARAZIM", count: questionOpen, action: "open-questions" }
    ];

    return items
      .map(
        (item) => `
          <button class="notes-sidebar-item ${item.label === "Notes" ? "notes-sidebar-item-active" : ""}" data-action="${item.action}" type="button">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </button>
        `
      )
      .join("");
  }
  function tableHead(showQuestionTypeColumn = false) {
    return `
      <thead>
        <tr>
          <th>NR</th>
          <th>Shenimi</th>
          <th>Diskutuar</th>
          <th>Nga kush</th>
          <th>Save as</th>
          ${showQuestionTypeColumn ? `<th>Lloji pyetjes</th>` : ""}
          <th>Added</th>
          <th>Status</th>
          <th>Edit</th>
        </tr>
      </thead>
    `;
  }
  function notesContent(notes, categories) {
    const showQuestionTypeColumn = notes.some((note) => note.category === "Pyetje");
    return `
      <section class="notes-section">
        <div class="notes-section-head">
          <h2 class="notes-section-title">New Note</h2>
        </div>

        <div class="notes-editor-toolbar">
          <button class="notes-tool" data-format="bold" type="button"><strong>B</strong></button>
          <button class="notes-tool" data-format="insertUnorderedList" type="button">Bullets</button>
          <button class="notes-tool" data-format="insertOrderedList" type="button">Numbers</button>
          <p class="notes-help">Write note only here. Then save it and choose Save as below.</p>
        </div>

        <div id="note-description" class="notes-editor" contenteditable="true" data-placeholder="Write the note here..."></div>

        <div class="notes-attachments">
          <label class="notes-section-title" for="note-files">Attachments</label>
          <input id="note-files" class="notes-input" type="file" multiple>
        </div>

        <div class="notes-form-actions">
          <button class="notes-button notes-button-primary" data-action="save-note" type="button">Save note</button>
        </div>
      </section>

      <section class="notes-section">
        <div class="notes-section-head">
          <h2 class="notes-section-title">Saved Notes</h2>
          <button class="notes-button" data-action="export-json" type="button">Export JSON</button>
        </div>

        <div class="notes-filters notes-filters-compact">
          <select class="notes-select" data-filter="status">${optionList(["All", "Open", "Closed"], state.filters.status)}</select>
          <select class="notes-select" data-filter="category">${optionList(["All", ...categories], state.filters.category)}</select>
          <input class="notes-input" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Search notes...">
        </div>

        <div class="notes-table-wrap">
          <table class="notes-table notes-table-clean notes-main-table">
            ${tableHead(showQuestionTypeColumn)}
            <tbody>${noteRows(notes, showQuestionTypeColumn)}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function categoryContent(categoryNotes) {
    return `
      <section class="notes-section">
        <div class="notes-section-head">
          <h2 class="notes-section-title">${escapeHtml(state.activeView)} Notes</h2>
          <button class="notes-button" data-action="export-json" type="button">Export JSON</button>
        </div>

        <div class="notes-filters notes-filters-compact notes-filters-category">
          <select class="notes-select" data-filter="status">${optionList(["All", "Open", "Closed"], state.filters.status)}</select>
          <input class="notes-input" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Search ${escapeHtml(state.activeView)}...">
        </div>

        <div class="notes-table-wrap">
          <table class="notes-table notes-table-clean notes-main-table">
            ${tableHead(showQuestionTypeColumn)}
            <tbody>${categoryNotes.length ? noteRows(categoryNotes, showQuestionTypeColumn) : `<tr><td colspan="${showQuestionTypeColumn ? 9 : 8}" class="notes-empty">No notes in ${escapeHtml(state.activeView)}.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    `;
  }
  function render(root) {
    const notes = filteredNotes();
    const categories = visibleCategories();
    state.activeView = "Notes";
    const isNotesView = true;
    const openCount = state.notes.filter((note) => note.status === "Open").length;
    const totalCount = state.notes.length;

    root.innerHTML = `
      <section class="notes-app" data-module="primeflow-notes">
        <div class="notes-layout">
          <aside class="notes-sidebar">
            <div class="notes-sidebar-brand">
              <strong>PrimeFlow</strong>
              <span>${escapeHtml(config.currentUser)}</span>
            </div>
            <nav class="notes-sidebar-nav">${sidebarItems(categories)}</nav>
          </aside>

          <div class="notes-main">
            <div class="notes-topbar">
              <input class="notes-search" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Ctrl+K to search">
              <span class="notes-user-pill">${escapeHtml(config.currentUser)}</span>
            </div>

            <header class="notes-hero">
              <div>
                <p class="notes-kicker">${isNotesView ? "Notes for all" : "Saved view"}</p>
                <h1 class="notes-title">${escapeHtml(state.activeView)}</h1>
              </div>
              <div class="notes-counters">
                <span class="notes-badge notes-badge-open">Open ${openCount}</span>
                <span class="notes-badge">Total ${totalCount}</span>
              </div>
            </header>

            ${notesContent(notes, categories)}
          </div>
        </div>
      </section>
    `;
  }
  function saveNewNote(root) {
    const editor = document.getElementById("note-description");
    const description = editor.innerHTML.trim();
    const plainText = stripHtml(description).trim();

    if (!plainText) {
      editor.focus();
      return;
    }

    const files = Array.from(document.getElementById("note-files").files || []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type
    }));

    state.notes.unshift({
      id: createId(),
      title: plainText.slice(0, 48) + (plainText.length > 48 ? "..." : ""),
      description,
      discussed: "No",
      fromWho: config.currentUser,
      category: "",
      questionType: "",
      projectName: "",
      department: "",
      client: "",
      documentName: "",
      platform: "",
      filePath: "",
      status: "Open",
      createdBy: config.currentUser,
      createdAt: new Date().toISOString(),
      attachments: files
    });

    saveNotes();
    notifyHost("notes:changed", { notes: state.notes });
    render(root);
  }

  function updateNoteField(root, id, field, value) {
    state.notes = state.notes.map((note) => {
      if (note.id !== id) return note;
      const nextNote = { ...note, [field]: value, updatedAt: new Date().toISOString() };
      if (field === "category" && value !== "Pyetje") nextNote.questionType = "";
      return nextNote;
    });
    saveNotes();
    notifyHost("notes:changed", { notes: state.notes });
    render(root);
  }

  function saveEdit(root, id) {
    const description = document.getElementById(`edit-description-${id}`).innerHTML.trim();
    const plainText = stripHtml(description).trim();
    const title = plainText.slice(0, 48) + (plainText.length > 48 ? "..." : "");
    state.notes = state.notes.map((note) =>
      note.id === id ? { ...note, title: title || "Untitled note", description, updatedAt: new Date().toISOString() } : note
    );
    state.editingId = null;
    saveNotes();
    notifyHost("notes:changed", { notes: state.notes });
    render(root);
  }

  function exportJson() {
    const data = JSON.stringify(state.notes, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "primeflow-notes.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bind(root) {
    root.addEventListener("click", (event) => {
      const formatButton = event.target.closest("[data-format]");
      if (formatButton) {
        document.execCommand(formatButton.dataset.format, false, null);
        document.getElementById("note-description").focus();
        return;
      }

      const action = event.target.closest("[data-action]");
      if (!action) return;

      const id = action.dataset.id;
      if (action.dataset.action === "save-note") saveNewNote(root);
      if (action.dataset.action === "edit") {
        state.editingId = id;
        render(root);
      }
      if (action.dataset.action === "save-edit") saveEdit(root, id);
      if (action.dataset.action === "cancel-edit") {
        state.editingId = null;
        render(root);
      }
      if (action.dataset.action === "close") {
        state.notes = state.notes.map((note) =>
          note.id === id ? { ...note, status: "Closed", updatedAt: new Date().toISOString() } : note
        );
        state.filters.status = "All";
        saveNotes();
        notifyHost("notes:changed", { notes: state.notes });
        render(root);
      }
      if (action.dataset.action === "export-json") exportJson();
      if (action.dataset.action === "select-category-view") {
        state.activeView = action.dataset.category;
        window.location.hash = encodeURIComponent(state.activeView);
        render(root);
      }
      if (action.dataset.action === "change-view") {
        state.activeView = "Notes";
        state.filters.category = "All";
        window.location.hash = "";
        render(root);
      }
      if (action.dataset.action === "open-classifications") {
        window.location.href = "./classifications.html";
      }
      if (action.dataset.action === "open-questions") {
        window.location.href = "./pyetje.html";
      }
    });

    root.addEventListener("change", (event) => {
      const noteField = event.target.closest("[data-note-field]");
      if (noteField) {
        updateNoteField(root, noteField.dataset.id, noteField.dataset.noteField, noteField.value);
        return;
      }

      const filter = event.target.closest("[data-filter]");
      if (filter) {
        state.filters[filter.dataset.filter] = filter.value;
        render(root);
      }
    });

    root.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const search = root.querySelector('[data-filter="search"]');
        if (search) search.focus();
      }
    });

    window.addEventListener("hashchange", () => {
      state.activeView = "Notes";
      render(root);
    });
  }

  function init() {
    const root = document.getElementById("primeflow-notes-root");
    if (!root) return;
    render(root);
    bind(root);
    notifyHost("notes:ready", { moduleName: config.moduleName });
  }

  window.PrimeFlowNotesModule = {
    init,
    getNotes: () => state.notes,
    setNotes: (notes) => {
      state.notes = Array.isArray(notes) ? notes : [];
      saveNotes();
    },
    notifyHost
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
