(function () {
  const storageKey = "primeflow-notes-module-v4";
  const unclassifiedCategory = "To classify";
  const categoryAliases = {
    Trajnime: "30_TRAJNIME",
    Definime: "40_DEFINIME",
    Rregullore: "50_RREGULLORE"
  };
  const questionTypeOptions = ["", "PYETJE PËR DETYRË TË RE", "PYETJE PËR SHUMË PRODUKTE", "PYETJE PËR PROBLEME URGJENTE", "PYETJE PËR KO1/KO2", "PYETJE PËR PROJEKT TË RI", "PYETJE PËR BARAZIM"];
  const questionTypeAliases = {
    "Pyetje per detyre te re": "PYETJE PËR DETYRË TË RE",
    "Pyetje per shume produkte": "PYETJE PËR SHUMË PRODUKTE",
    "Pytje baze": "PYETJE BAZË",
    "Pyetje baze": "PYETJE BAZË",
    "Pyetje per probleme urgjente": "PYETJE PËR PROBLEME URGJENTE",
    "Pyetje per listen e problemeve": "PYETJE PËR LISTËN E PROBLEMEVE",
    "Pytje per komunikim te jashtem": "PYETJE PËR KOMUNIKIM TË JASHTËM",
    "Pyetje per komunikim te jashtem": "PYETJE PËR KOMUNIKIM TË JASHTËM",
    "Pyetje per ndryshim sistemi": "PYETJE PËR NDRYSHIM SISTEMI",
    "Pyetje per kordinim 1 me 1": "PYETJE PËR KOORDINIM 1 ME 1",
    "Pyetje per koordinim 1 me 1": "PYETJE PËR KOORDINIM 1 ME 1",
    "Pyetje per KO1/KO2": "PYETJE PËR KO1/KO2",
    "Pyetje per hapjen e projektit": "PYETJE PËR PROJEKT TË RI",
    "Pyetje per projekt te ri": "PYETJE PËR PROJEKT TË RI",
    "Pyetje per takime": "PYETJE PËR TAKIME",
    "Pyetje per barazim": "PYETJE PËR BARAZIM",
    "PYETJE PER BARAZIM": "PYETJE PËR BARAZIM"
  };
  const questionTextOptionsByType = {
    "PYETJE PËR DETYRË TË RE": [
      { question: "Kush është përgjegjës?", guidance: "Emri i personit ose ekipit që e kryen detyrën" },
      { question: "Çka duhet të kryhet?", guidance: "Përshkrim i qartë i detyrës" },
      { question: "Kur duhet të kryhet?", guidance: "Afati i plotë: data + ora, nëse nevojitet" },
      { question: "Sa urgjente është?", guidance: "E lartë / Mesatare / E ulët" },
      { question: "Si kryhet detyra?", guidance: "Hapat ose metoda e punës" },
      { question: "Ku duhet të raportohet?", guidance: "Sistemi, platforma ose personi" },
      { question: "Kujt duhet t'i dërgohet?", guidance: "Marrësi final i rezultatit" },
      { question: "A është lexuar komplet detyra?", guidance: "Po / Jo - konfirmim i leximit" },
      { question: "A janë kuptuar të gjitha pikat?", guidance: "Po / Jo - konfirmim i kuptimit" },
      { question: "Nëse diçka nuk dihet?", guidance: "Propozimi ose pyetja për sqarim" }
    ],
    "PYETJE PËR SHUMË PRODUKTE": [
      { question: "Sa produkte janë gjithsej?", guidance: "Numri total i produkteve" },
      { question: "Me cilat produkte fillojmë?", guidance: "Produkti ose grupi i parë" },
      { question: "Cilat kanë prioritet?", guidance: "Lista ose kriteret e prioritetit" },
      { question: "Pse kanë prioritet?", guidance: "Arsyeja e prioritetit" },
      { question: "Sa janë kryer?", guidance: "Numri i produkteve të gatshme" },
      { question: "Sa kanë mbetur?", guidance: "Numri i produkteve të papërfunduara" },
      { question: "A jemi brenda mesatares?", guidance: "Po / Jo - krahasim me normen" },
      { question: "Sa është mesatarja normale?", guidance: "Standardi i pritur (p.sh. 20 produkte/ditë)" },
      { question: "A ka vonesë?", guidance: "Po / Jo - nëse po, sa ditë" },
      { question: "Çka bëjmë për ta përshpejtuar?", guidance: "Plani i aksionit për shpejtim" }
    ],
    "PYETJE PËR KO1/KO2": [
      { question: "A i kemi të gjitha dokumentet, definimet dhe rregulloret e projektit?", guidance: "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A janë të gjitha dokumentet e printuara?", guidance: "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A e kam lexuar dhe kuptuar dokumentin nga fillimi deri në fund, jo vetëm sipërfaqësisht?", guidance: "PYETËSOR - KONTROLLA 1 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A e kam krahasuar çdo rresht me dokumentin origjinal, jo vetëm përmbajtjen?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A janë kontrolluar të gjitha fotot dhe imazhet (numri, pozicioni)?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A janë kontrolluar ikonat (lloji, madhësia, pozicioni)?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A është kontrolluar renditja e elementeve dhe përputhja e tyre me rregullat?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A është kontrolluar struktura e përgjithshme (formatimi, hierarkia)?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A janë kontrolluar vijat dhe ndarjet (borders, spacing, alignment)?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A jam siguruar që nuk kam kontrolluar përmendësh, por kam krahasuar realisht rresht për rresht?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A janë shënuar të gjitha gabimet e gjetura para se të kalohet në Kontrollën 2?", guidance: "KONTROLLA 1 - VETËKONTROLLI I PUNUESIT" },
      { question: "A i kemi të gjitha dokumentet, definimet dhe rregulloret e projektit?", guidance: "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A janë të gjitha dokumentet e printuara?", guidance: "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A e kam lexuar dhe kuptuar dokumentin nga fillimi deri në fund, jo vetëm sipërfaqësisht?", guidance: "PYETËSOR - KONTROLLA 2 / PARA FILLIMIT TË KONTROLLËS" },
      { question: "A e kam marrë dokumentin/rregulloren e printuar para se të filloj?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A e kam lexuar udhëzimin/rregulloren pa e ditur paraprakisht përmbajtjen e punës së bërë?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A mund ta bëjë këtë kontroll dikush që nuk ka lidhje me projektin, thjesht duke ndjekur këtë pyetësor?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A janë krahasuar të gjitha detajet (rresht, foto, ikonë, renditje, strukturë, vijë), jo vetëm teksti?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A janë verifikuar korrigjimet nga Kontrolla 1 si të zbatuara saktë?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A ka gabime shtesë të gjetura që Kontrolla 1 i ka lëshuar?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" },
      { question: "A është produkti/dokumenti gati për dorëzim ose publikim pas kësaj kontrolle?", guidance: "KONTROLLA 2 - KONTROLL I PAVARUR" }
    ],    "PYETJE PËR BARAZIM": [
      { question: "A është hapur detyra?", guidance: "Po / Jo" },
      { question: "A janë lexuar shënimet?", guidance: "Po / Jo" },
      { question: "A po punohet sipas rendit?", guidance: "Po / Jo - nëse jo, arsyeja" },
      { question: "A ka ndonjë paqartësi?", guidance: "Po / Jo - nëse po, çka" },
      { question: "A duhet sqarim nga përgjegjësi?", guidance: "Po / Jo - nëse po, kush sqaron" },
      { question: "A është kryer çdo pikë?", guidance: "Po / Jo - ose % e përfundimit" },
      { question: "A është raportuar rezultati?", guidance: "Po / Jo - ku dhe kur" }
    ],
    "PYETJE PËR PROBLEME URGJENTE": [
      { question: "Cili është problemi?", guidance: "Përshkrim i shkurtër dhe i qartë" },
      { question: "Kur është vërejtur?", guidance: "Data dhe ora e zbulimit" },
      { question: "Kush e ka vërejtur?", guidance: "Emri i personit" },
      { question: "Sa urgjent është?", guidance: "Kritik / I lartë / Mesatar" },
      { question: "A ndikon te puna / klienti?", guidance: "Po / Jo - efekti konkret" },
      { question: "A rregullohet shpejt?", guidance: "Po / Jo - vlerësim fillestar" },
      { question: "Sa kohë merr zgjidhja?", guidance: "Vlerësimi i kohës (min / orë / ditë)" },
      { question: "Kush po merret me zgjidhjen?", guidance: "Emri i personit përgjegjës" },
      { question: "A është informuar përgjegjësi?", guidance: "Po / Jo - kur dhe si" }
    ]
  };
  const config = {
    title: "Shënime të klasifikuara",
    currentUser: "AT",
    categories: ["30_TRAJNIME", "40_DEFINIME", "50_RREGULLORE", "06_PROMPTS"],
    ...(window.PrimeFlowKlasifikimetConfig || {})
  };
  const pageParams = new URLSearchParams(window.location.search);
  config.currentUser = pageParams.get("user") || config.currentUser;
  config.currentUserRole = String(pageParams.get("role") || config.currentUserRole || "STAFF").toUpperCase();
  config.apiBaseUrl = String(pageParams.get("api") || "http://localhost:8000/api").replace(/\/$/, "");
  config.categories = config.categories.map(normalizeCategory);

  function isAdmin() {
    return config.currentUserRole === "ADMIN";
  }

  function canDeleteNotes() {
    return isAdmin() || (state.activeCategory === unclassifiedCategory && config.currentUserRole === "MANAGER");
  }

  function canDeleteNote(note) {
    return canManageDocument(note) && (isAdmin() || config.currentUserRole === "MANAGER");
  }

  function canManageDocument(note) {
    return Boolean(note);
  }

  function activePreviewNote() {
    return loadNotes().find((note) => note.id === state.documentPreviewId) || null;
  }

  function canManageCurrentDocument() {
    const note = activePreviewNote();
    return Boolean(note && canManageDocument(note));
  }

  const state = {
    activeCategory: [unclassifiedCategory, ...config.categories].includes(decodeURIComponent(window.location.hash.replace("#", ""))) ? decodeURIComponent(window.location.hash.replace("#", "")) : unclassifiedCategory,
    status: "All",
    search: "",
    searchByCategory: {},
    columnFiltersByCategory: {},
    editingId: null,
    questionType: "All",
    questionModalId: null,
    draftDescription: "",
    draftAttachments: [],
    isDraggingFiles: false,
    departments: [],
    fileClientsByDepartment: {},
    filePlatformsByClient: {},
    referenceDataLoading: true,
    referenceDataRefreshing: false,
    documentPreviewId: null,
    activeSheetCell: "A1",
    sheetSelectionAnchor: "A1",
    sheetSelectionFocus: "A1",
    sheetSelectionMode: "cell",
    sheetUndoStack: []
  };

  async function apiGet(path) {
    const token = localStorage.getItem("primex_access_token");
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json();
  }

  async function loadReferenceData(root, renderPage = true) {
    if (state.referenceDataRefreshing) return;
    state.referenceDataRefreshing = true;
    try {
      const departments = await apiGet("/departments");
      state.departments = Array.isArray(departments)
        ? departments.filter((department) => {
            const name = String(department.name || "").trim().toUpperCase();
            const code = String(department.code || "").trim().toUpperCase();
            return name !== "GA" && code !== "GA";
          })
        : [];
      const clientLists = await Promise.all(state.departments.map(async (department) => {
        try {
          return [department.id, await apiGet(`/departments/${department.id}/file-clients`)];
        } catch (_error) {
          return [department.id, []];
        }
      }));
      state.fileClientsByDepartment = Object.fromEntries(clientLists);
      const platformLists = await Promise.all(clientLists.flatMap(([departmentId, clients]) => clients.map(async (client) => {
        try {
          return [`${departmentId}::${client}`, await apiGet(`/departments/${departmentId}/file-clients/${encodeURIComponent(client)}/platforms`)];
        } catch (_error) {
          return [`${departmentId}::${client}`, []];
        }
      })));
      state.filePlatformsByClient = Object.fromEntries(platformLists);
    } catch (error) {
      console.error("Could not load departments/projects", error);
    } finally {
      state.referenceDataLoading = false;
      state.referenceDataRefreshing = false;
      if (renderPage) render(root);
      else syncReferenceSelects(root);
    }
  }

  const attachmentDbName = "primeflow-note-attachments";
  const attachmentStoreName = "files";

  function openAttachmentDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(attachmentDbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(attachmentStoreName)) {
          request.result.createObjectStore(attachmentStoreName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeAttachmentFiles(noteId, files) {
    if (!files.length) return [];
    const db = await openAttachmentDb();
    const transaction = db.transaction(attachmentStoreName, "readwrite");
    const store = transaction.objectStore(attachmentStoreName);
    const attachments = files.map((file) => {
      const attachment = {
        id: `${noteId}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      };
      store.put({ ...attachment, noteId, blob: file });
      return attachment;
    });
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
    return attachments;
  }

  async function downloadAttachment(id) {
    const db = await openAttachmentDb();
    const transaction = db.transaction(attachmentStoreName, "readonly");
    const request = transaction.objectStore(attachmentStoreName).get(id);
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!record || !record.blob) return;
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = record.name || "attachment";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function loadNotes() {
    try {
      const stored = localStorage.getItem(storageKey);
      return migrateCategories(stored ? JSON.parse(stored) : []);
    } catch (error) {
      console.warn("Could not load notes", error);
      return [];
    }
  }

  function saveNotes(notes) {
    localStorage.setItem(storageKey, JSON.stringify(migrateCategories(notes)));
  }

  function normalizeCategory(category) {
    return categoryAliases[category] || category;
  }

  function normalizeDocumentType(type) {
    return String(type || "").trim().toLowerCase() === "excel" ? "excel" : "word";
  }

  function normalizeQuestionType(type) {
    return questionTypeAliases[type] || type;
  }

  function migrateCategories(notes) {
    return notes.map((note) => ({ ...note, category: normalizeCategory(note.category || ""), questionType: normalizeQuestionType(note.questionType || "") }));
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

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function attachmentChipsHtml(note) {
    const attachments = Array.isArray(note.attachments) ? note.attachments : [];
    if (!attachments.length) return "";
    return `<div class="notes-saved-attachments">${attachments.map((file) => `
      <button class="notes-saved-attachment" data-action="download-attachment" data-attachment-id="${escapeHtml(file.id)}" type="button" title="Shkarko ${escapeHtml(file.name)}">
        <span aria-hidden="true">&#128206;</span>${escapeHtml(file.name)}
      </button>`).join("")}</div>`;
  }


  function initialsFor(value) {
    return String(value || "-")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "-";
  }
  function titleFromDescription(description) {
    const plainText = stripHtml(description).trim();
    return plainText.slice(0, 48) + (plainText.length > 48 ? "..." : "");
  }

  function notesForCategory(category) {
    const search = state.search.trim().toLowerCase();
    return loadNotes().filter((note) => {
      const categoryMatch = category === unclassifiedCategory ? note.keepInNotes !== false : note.category === category;
      const statusMatch = state.status === "All" || note.status === state.status;
      const searchTarget = `${note.title} ${stripHtml(note.description)} ${note.createdBy || note.fromWho} ${note.discussed} ${note.category} ${note.questionType} ${note.questionText} ${JSON.stringify(note.questionAnswers || {})} ${JSON.stringify(note.questionAnswerEditors || {})} ${note.projectName} ${note.department} ${note.client} ${note.documentName} ${note.platform} ${note.filePath}`.toLowerCase();
      const searchMatch = !search || searchTarget.includes(search);
      const questionTypeMatch = category !== "Pyetje" || state.questionType === "All" || (note.questionType || "") === state.questionType;
      return categoryMatch && statusMatch && searchMatch && questionTypeMatch;
    });
  }

  function countFor(category) {
    return loadNotes().filter((note) => category === unclassifiedCategory ? note.keepInNotes !== false : note.category === category).length;
  }

  function questionTypeOptionsHtml(selected) {
    return questionTypeOptions
      .map((type) => `<option value="${escapeHtml(type)}"${type === selected ? " selected" : ""}>${escapeHtml(type || "Select...")}</option>`)
      .join("");
  }

  function questionTextOptionsHtml(questionType, selected) {
    const options = questionTextOptionsByType[questionType] || [];
    return ["", ...options.map((item) => item.question)]
      .map((question) => `<option value="${escapeHtml(question)}"${question === selected ? " selected" : ""}>${escapeHtml(question || "Select...")}</option>`)
      .join("");
  }

  function categoryOptions(selected) {
    return ["", ...config.categories]
      .map((category) => `<option value="${escapeHtml(category)}"${category === selected ? " selected" : ""}>${escapeHtml(category || "Select...")}</option>`)
      .join("");
  }

  function textInput(note, field, placeholder, extraClass) {
    return `<input class="notes-input notes-cell-input ${extraClass || ""}" data-edit-field="${field}" data-id="${note.id}" value="${escapeHtml(note[field] || "")}" placeholder="${escapeHtml(placeholder)}">`;
  }

  function rowTextInput(note, field, placeholder, extraClass, disabled) {
    return `<input class="notes-input notes-cell-input ${extraClass || ""}" data-note-field="${field}" data-id="${note.id}" value="${escapeHtml(note[field] || "")}" placeholder="${escapeHtml(placeholder)}"${disabled ? " disabled" : ""}>`;
  }

  function departmentOptions(note) {
    if (state.referenceDataLoading) return `<option value="">Duke u ngarkuar...</option>`;
    const selectedId = note.departmentId || "";
    const options = state.departments.map((department) => `
      <option value="${escapeHtml(department.id)}" data-name="${escapeHtml(department.name)}"${department.id === selectedId || (!selectedId && note.department === department.name) ? " selected" : ""}>${escapeHtml(department.name)}</option>
    `).join("");
    return `<option value="">Zgjidh departamentin</option>${options}`;
  }

  function clientOptions(note, departmentId) {
    if (state.referenceDataLoading) return `<option value="">Duke u ngarkuar...</option>`;
    const clients = state.fileClientsByDepartment[departmentId] || [];
    const savedClientMissing = note.client && !clients.includes(note.client);
    return `<option value="">Zgjidh klientin</option>${savedClientMissing ? `<option value="${escapeHtml(note.client)}" selected>${escapeHtml(note.client)}</option>` : ""}${clients.map((client) => `<option value="${escapeHtml(client)}"${note.client === client ? " selected" : ""}>${escapeHtml(client)}</option>`).join("")}`;
  }

  function platformOptions(note, departmentId, client) {
    if (state.referenceDataLoading) return `<option value="">Duke u ngarkuar...</option>`;
    const platforms = state.filePlatformsByClient[`${departmentId}::${client}`] || [];
    const savedPlatformMissing = note.platform && !platforms.includes(note.platform);
    return `<option value="">Zgjidh platformën</option>${savedPlatformMissing ? `<option value="${escapeHtml(note.platform)}" selected>${escapeHtml(note.platform)}</option>` : ""}${platforms.map((platform) => `<option value="${escapeHtml(platform)}"${note.platform === platform ? " selected" : ""}>${escapeHtml(platform)}</option>`).join("")}`;
  }

  function syncReferenceSelects(root) {
    root.querySelectorAll("[data-note-row]").forEach((row) => {
      const note = loadNotes().find((item) => item.id === row.dataset.noteRow);
      const editable = note ? canManageDocument(note) : false;
      const departmentSelect = row.querySelector('[data-note-field="departmentId"]');
      const clientSelect = row.querySelector('[data-note-field="client"]');
      const platformSelect = row.querySelector('[data-note-field="platform"]');
      if (!departmentSelect || !clientSelect || !platformSelect) return;
      const departmentId = departmentSelect.value || "";
      const client = clientSelect.value || "";
      const platform = platformSelect.value || "";
      clientSelect.innerHTML = clientOptions({ client }, departmentId);
      platformSelect.innerHTML = platformOptions({ platform }, departmentId, client);
      clientSelect.disabled = !editable || !departmentId;
      platformSelect.disabled = !editable || !departmentId || !client;
    });
  }

  function rows(notes) {
    if (!notes.length) {
      return `<tr><td colspan="${canDeleteNotes() ? 13 : 12}" class="notes-empty">Nuk ka shënime në këtë klasifikim.</td></tr>`;
    }

    return notes.map((note, index) => {
      const dateValue = note.noteDate || String(note.createdAt || "").slice(0, 10);
      const attachmentCount = Array.isArray(note.attachments) ? note.attachments.length : 0;
      const editable = canManageDocument(note);
      const selectedDepartment = state.departments.find((department) => department.id === note.departmentId || (!note.departmentId && department.name === note.department));
      const selectedDepartmentId = selectedDepartment ? selectedDepartment.id : (note.departmentId || "");
      return `
        <tr data-note-row="${note.id}">
          <td class="notes-number-cell">${index + 1}</td>
          <td class="notes-name-cell"><div class="notes-note-stack"><div class="notes-description">${note.description || ""}</div><span class="notes-initials-dot" title="${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}">${escapeHtml(initialsFor(note.updatedBy || note.createdBy || note.fromWho))}</span></div></td>
          <td class="notes-attachments-cell">${attachmentCount ? attachmentChipsHtml(note) : `<span class="notes-muted-action">Pa skedarë</span>`}</td>
          <td><div class="notes-create-document-stack"><select class="notes-document-type" data-document-type="${note.id}" aria-label="Lloji i dokumentit"${note.documentSaved || !editable ? " disabled" : ""}><option value="word"${normalizeDocumentType(note.documentType) !== "excel" ? " selected" : ""}>Word</option><option value="excel"${normalizeDocumentType(note.documentType) === "excel" ? " selected" : ""}>Excel</option></select><button class="notes-create-document" data-action="create-document" data-id="${note.id}" type="button">${editable && !note.documentSaved ? "CREATE" : `OPEN ${normalizeDocumentType(note.documentType) === "excel" ? "EXCEL" : "WORD"}`}</button></div></td>
          <td>${rowTextInput(note, "documentName", "Emri i dokumentit", "", !editable)}</td>
          <td><select class="notes-select notes-cell-select" data-note-field="category" data-id="${note.id}"${editable ? "" : " disabled"}>${categoryOptions(note.category || "")}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="departmentId" data-id="${note.id}"${editable ? "" : " disabled"}>${departmentOptions(note)}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="client" data-id="${note.id}"${editable && selectedDepartmentId ? "" : " disabled"}>${clientOptions(note, selectedDepartmentId)}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="platform" data-id="${note.id}"${editable && selectedDepartmentId && note.client ? "" : " disabled"}>${platformOptions(note, selectedDepartmentId, note.client || "")}</select></td>
          <td><div class="notes-date-fields"><input class="notes-input notes-cell-input" data-note-field="noteDate" data-id="${note.id}" type="date" value="${escapeHtml(dateValue)}"${editable ? "" : " disabled"}></div></td>
          <td>${rowTextInput(note, "filePath", "Shkruaj path", "notes-path-input", !editable)}</td>
          <td>${editable ? `<button class="notes-row-save ${note.lastSavedAt ? "notes-row-saved" : ""}" data-action="save-row" data-id="${note.id}" type="button">${note.lastSavedAt ? "SAVED" : "SAVE"}</button>` : `<span class="notes-locked-badge">VETËM ADMIN</span>`}</td>
          ${canDeleteNotes() ? (canDeleteNote(note) ? `<td><button class="notes-row-delete" data-action="delete-row" data-id="${note.id}" type="button" title="Fshije shënimin"><span aria-hidden="true">&#128465;</span><small>DELETE</small></button></td>` : "<td></td>") : ""}
        </tr>
      `;
    }).join("");
  }


  function sidebarItems() {
    const totalOpen = loadNotes().filter((note) => note.status === "Open").length;
    const questionOpen = loadNotes().filter((note) => note.status === "Open" && note.category === "Pyetje").length;
    const classifiedOpen = loadNotes().filter((note) => note.status === "Open" && note.category && note.category !== "Pyetje").length;
    const items = [
      { label: "Notes", count: totalOpen, action: "open-notes", active: false },
      { label: "Klasifikimet", count: classifiedOpen, action: "open-classifications", active: true },
      { label: "PYETJE PER BARAZIM", count: questionOpen, action: "open-questions", active: false }
    ];

    return items
      .map(
        (item) => `
          <button class="notes-sidebar-item ${item.active ? "notes-sidebar-item-active" : ""}" data-action="${item.action}" type="button">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </button>
        `
      )
      .join("");
  }

  function activeModalNote() {
    return loadNotes().find((note) => note.id === state.questionModalId) || null;
  }

  function questionModalHtml() {
    const note = activeModalNote();
    if (!note) return "";
    const rows = questionTextOptionsByType[note.questionType] || [];
    const answers = note.questionAnswers || {};
    const answerEditors = note.questionAnswerEditors || {};

    return `
      <div class="notes-modal-backdrop">
        <section class="notes-modal" role="dialog" aria-modal="true" aria-label="Pyetje">
          <div class="notes-modal-head">
            <div>
              <p class="notes-kicker">${escapeHtml(note.questionType || "Pyetje")}</p>
              <h2 class="notes-section-title">Pyetjet</h2>
            </div>
            <button class="notes-mini-button" data-action="close-question-modal" type="button">Close</button>
          </div>
          <div class="notes-table-wrap">
            <table class="notes-table notes-question-modal-table">
              <thead>
                <tr>
                  <th>Pyetja</th>
                  <th>Udhezimi / Shpjegimi</th>
                  <th>Pergjigja / Statusi</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.question)}</td>
                    <td>${escapeHtml(item.guidance)}</td>
                    <td><div class="notes-answer-cell"><textarea class="notes-input notes-answer-input" data-question-answer="${escapeHtml(item.question)}">${escapeHtml(answers[item.question] || "")}</textarea>${answerEditors[item.question] ? `<span class="notes-initials-dot notes-answer-editor" title="Edited by ${escapeHtml(answerEditors[item.question])}">${escapeHtml(initialsFor(answerEditors[item.question]))}</span>` : ""}</div></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="notes-form-actions">
            <button class="notes-button" data-action="close-question-modal" type="button">Cancel</button>
            <button class="notes-button notes-button-primary" data-action="save-question-modal" data-id="${note.id}" type="button">Save</button>
          </div>
        </section>
      </div>
    `;
  }

  function spreadsheetDataFor(note) {
    if (note.spreadsheetData) {
      return { ...note.spreadsheetData, tables: Array.isArray(note.spreadsheetData.tables) ? note.spreadsheetData.tables : [] };
    }
    return {
      rows: 16,
      cols: 8,
      cells: {
        A1: "TITULLI",
        B1: "PËRSHKRIMI",
        A2: escapeHtml(note.documentName || note.title || "Emri i dokumentit"),
        B2: escapeHtml(stripHtml(note.description || "Përmbajtja e re..."))
      },
      tables: []
    };
  }

  function columnLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function cellCoordinates(key) {
    const match = /^([A-Z])(\d+)$/.exec(String(key || "").toUpperCase());
    return match ? { col: match[1].charCodeAt(0) - 65, row: Number(match[2]) - 1 } : { col: 0, row: 0 };
  }

  function normalizedSheetSelection() {
    const anchor = cellCoordinates(state.sheetSelectionAnchor || state.activeSheetCell);
    const focus = cellCoordinates(state.sheetSelectionFocus || state.activeSheetCell);
    return {
      startRow: Math.min(anchor.row, focus.row),
      endRow: Math.max(anchor.row, focus.row),
      startCol: Math.min(anchor.col, focus.col),
      endCol: Math.max(anchor.col, focus.col)
    };
  }

  function cellInRange(row, col, range) {
    return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
  }

  function excelPreviewHtml(note, editable) {
    const sheet = spreadsheetDataFor(note);
    const attachments = Array.isArray(note.attachments) ? note.attachments : [];
    const selection = normalizedSheetSelection();
    const tables = Array.isArray(sheet.tables) ? sheet.tables : [];
    const columnHeaders = Array.from({ length: sheet.cols }, (_, column) => `<th data-sheet-column="${column}">${columnLetter(column)}</th>`).join("");
    const rows = Array.from({ length: sheet.rows }, (_, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = Array.from({ length: sheet.cols }, (_, column) => {
        const key = `${columnLetter(column)}${rowNumber}`;
        const table = tables.find((range) => cellInRange(rowIndex, column, range));
        const classes = [
          cellInRange(rowIndex, column, selection) ? "notes-sheet-selected" : "",
          table ? "notes-sheet-table-cell" : "",
          table && rowIndex === table.startRow ? "notes-sheet-table-header" : ""
        ].filter(Boolean).join(" ");
        return `<td data-sheet-cell="${key}" class="${classes}"${editable ? ` contenteditable="true"` : ""}>${sheet.cells[key] || ""}</td>`;
      }).join("");
      return `<tr><th data-sheet-row="${rowIndex}">${rowNumber}</th>${cells}</tr>`;
    }).join("");
    return `
      <div class="notes-excel-editor" data-document-preview-type="excel" data-sheet-rows="${sheet.rows}" data-sheet-cols="${sheet.cols}">
        <header class="notes-excel-editor-head">
          <div><h2>${escapeHtml(note.documentName || note.title || "DOKUMENT")}</h2><p>Materialet e vjetra shfaqen majtas; template-i ri ndërtohet djathtas.</p></div>
          <div class="notes-excel-head-actions">
            ${editable ? `<button data-action="sheet-create-table" type="button">KRIJO TABELË</button><button class="danger" data-action="sheet-clear" type="button">PASTRO TEMPLATE</button><button class="success" data-action="save-document-preview" data-id="${note.id}" type="button">RUAJ DOKUMENTIN</button>` : ""}
            <button class="primary" data-action="close-document-preview" type="button">MBYLL</button>
          </div>
        </header>
        <div class="notes-excel-formatbar">
          ${editable ? `<button data-sheet-command="bold" type="button"><strong>B</strong></button><button data-sheet-command="italic" type="button"><em>I</em></button><button data-sheet-command="underline" type="button"><u>U</u></button><button data-sheet-command="justifyLeft" type="button">Majtas</button><button data-sheet-command="justifyCenter" type="button">Qendër</button><button data-sheet-command="justifyRight" type="button">Djathtas</button>` : ""}
          <span>${editable ? "Kliko qelizën; përdor Shift + klik për të zgjedhur diapazon dhe krijuar tabelë." : "Preview only"}</span>
        </div>
        <div class="notes-excel-workspace">
          <aside class="notes-excel-materials"><h3>Materialet e vjetra</h3><p>Hape skedarin për referencë ose përdor <strong>IMPORT TO TEMPLATE</strong>.</p>${attachments.length ? attachments.map((file) => `<button data-action="download-attachment" data-attachment-id="${escapeHtml(file.id)}" type="button">&#128206; ${escapeHtml(file.name)}</button>`).join("") : `<div class="notes-excel-no-files">Nuk ka skedarë të ngarkuar.</div>`}</aside>
          <main class="notes-excel-grid-area">
            <div class="notes-excel-formula"><strong data-sheet-active-cell>A1</strong><input data-sheet-formula ${editable ? "" : "disabled"} value="${escapeHtml(stripHtml(sheet.cells.A1 || ""))}"></div>
            <div class="notes-excel-grid-scroll"><table class="notes-excel-grid"><thead><tr><th></th>${columnHeaders}</tr></thead><tbody>${rows}</tbody></table></div>
          </main>
        </div>
      </div>`;
  }

  function documentPreviewHtml() {
    if (!state.documentPreviewId) return "";
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return "";
    const editable = canManageDocument(note);
    const type = normalizeDocumentType(note.documentType);
    if (type === "excel") {
      return `<div class="notes-modal-backdrop notes-document-preview-backdrop"><section class="notes-modal notes-document-preview-modal notes-excel-fullscreen" role="dialog" aria-modal="true">${excelPreviewHtml(note, editable)}</section></div>`;
    }
    const content = note.documentContent || note.description || "<p></p>";
    return `<div class="notes-modal-backdrop notes-document-preview-backdrop"><section class="notes-modal notes-document-preview-modal notes-word-fullscreen" data-document-preview-type="word" role="dialog" aria-modal="true"><header class="notes-word-editor-head"><div><span class="notes-document-kind notes-document-kind-word">WORD</span>${editable ? `<input class="notes-input notes-document-title-input" data-document-title value="${escapeHtml(note.documentName || note.title || "Dokument")}">` : `<h2>${escapeHtml(note.documentName || note.title || "Dokument")}</h2>`}</div><div>${editable ? `<button class="success" data-action="save-document-preview" data-id="${note.id}" type="button">RUAJ DOKUMENTIN</button>` : ""}<button class="primary" data-action="close-document-preview" type="button">MBYLL</button></div></header><div class="notes-word-formatbar">${editable ? `<button data-sheet-command="bold" type="button"><strong>B</strong></button><button data-sheet-command="italic" type="button"><em>I</em></button><button data-sheet-command="underline" type="button"><u>U</u></button><button data-sheet-command="justifyLeft" type="button">Majtas</button><button data-sheet-command="justifyCenter" type="button">Qendër</button><button data-sheet-command="justifyRight" type="button">Djathtas</button>` : `<span>Preview only</span>`}</div><div class="notes-word-workspace"><div id="document-preview-editor" class="notes-document-editor"${editable ? ` contenteditable="true"` : ""}>${content}</div></div></section></div>`;
  }

  function classifiedRows(notes) {
    if (!notes.length) {
      return `<tr><td colspan="${canDeleteNotes() ? 11 : 10}" class="notes-empty">Nuk ka dokumente që përputhen me kërkimin ose filtrat.</td></tr>`;
    }

    return notes.map((note, index) => {
      const attachments = Array.isArray(note.attachments) ? note.attachments : [];
      const editable = canManageDocument(note);
      return `
        <tr data-note-row="${note.id}">
          <td class="notes-number-cell">${note.__classifiedNr || index + 1}</td>
          <td><button class="notes-document-link" data-action="create-document" data-id="${note.id}" type="button">${escapeHtml(note.documentName || note.title || "Pa emër")}</button></td>
          <td>${attachments.length ? attachmentChipsHtml(note) : `<span class="notes-muted-action">Pa skedarë</span>`}</td>
          <td>${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}</td>
          <td>${escapeHtml(note.department || "-")}</td>
          <td>${escapeHtml(note.client || "-")}</td>
          <td>${escapeHtml(note.platform || "-")}</td>
          <td>${escapeHtml(note.noteDate || String(note.createdAt || "").slice(0, 10) || "-")}</td>
          <td>${escapeHtml(note.filePath || "-")}</td>
          <td><button class="notes-edit-document" data-action="create-document" data-id="${note.id}" type="button">${editable ? "EDIT DOCUMENT" : "OPEN DOCUMENT"}</button></td>
          ${canDeleteNotes() ? `<td><button class="notes-row-delete" data-action="delete-row" data-id="${note.id}" type="button" title="Hiqe nga ky klasifikim"><span aria-hidden="true">&#128465;</span></button></td>` : ""}
        </tr>`;
    }).join("");
  }

  function activeColumnFilters() {
    if (!state.columnFiltersByCategory[state.activeCategory]) {
      state.columnFiltersByCategory[state.activeCategory] = {};
    }
    return state.columnFiltersByCategory[state.activeCategory];
  }

  function classifiedColumnValue(note, key, index) {
    const attachments = Array.isArray(note.attachments) && note.attachments.length
      ? note.attachments.map((file) => file.name).join(", ")
      : "Pa skedarë";
    const values = {
      nr: String(index + 1),
      documentName: note.documentName || note.title || "Pa emër",
      attachments,
      who: note.updatedBy || note.createdBy || note.fromWho || "-",
      department: note.department || "-",
      client: note.client || "-",
      platform: note.platform || "-",
      date: note.noteDate || String(note.createdAt || "").slice(0, 10) || "-",
      path: note.filePath || "-"
    };
    return String(values[key] || "-");
  }

  function filterClassifiedNotes(notes) {
    const filters = activeColumnFilters();
    return notes.map((note, index) => ({ note, originalIndex: index })).filter(({ note, originalIndex }) => {
      return Object.entries(filters).every(([key, filter]) =>
        !String(filter || "").trim() || classifiedColumnValue(note, key, originalIndex) === String(filter)
      );
    }).map(({ note, originalIndex }) => ({ ...note, __classifiedNr: originalIndex + 1 }));
  }

  function columnFilterSelect(key, label, notes) {
    const values = [...new Set(notes.map((note, index) => classifiedColumnValue(note, key, index)))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );
    const filters = activeColumnFilters();
    if (filters[key] && !values.includes(filters[key])) filters[key] = "";
    const selected = filters[key] || "";
    return `<select class="notes-column-filter${selected ? " notes-column-filter-active" : ""}" data-column-filter="${key}" aria-label="Filtro ${escapeHtml(label)}" title="Filtro ${escapeHtml(label)}">
      <option value="">All</option>
      ${values.map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select>`;
  }

  function managementTableHtml(notes) {
    return `<div class="notes-table-wrap">
      <table class="notes-table notes-management-table">
        <colgroup>
          <col class="notes-col-number"><col class="notes-col-note"><col class="notes-col-attachments"><col class="notes-col-create"><col class="notes-col-document"><col class="notes-col-add-to"><col class="notes-col-department"><col class="notes-col-client"><col class="notes-col-platform"><col class="notes-col-date"><col class="notes-col-path"><col class="notes-col-save">${canDeleteNotes() ? `<col class="notes-col-delete">` : ""}
        </colgroup>
        <thead><tr><th>NR</th><th>Shënimi</th><th>Attachments</th><th>Create Document</th><th>Document Name</th><th>Add To</th><th>Departamenti</th><th>Client</th><th>Platform</th><th>Data</th><th>Path</th><th>Save</th>${canDeleteNotes() ? "<th>Delete</th>" : ""}</tr></thead>
        <tbody>${rows(notes)}</tbody>
      </table>
    </div>`;
  }

  function classifiedTableHtml(notes) {
    const filteredNotes = filterClassifiedNotes(notes);
    return `
      <div class="notes-table-wrap">
        <table class="notes-table notes-classified-table">
          <thead>
            <tr>
              <th><div class="notes-header-filter"><span>NR</span>${columnFilterSelect("nr", "NR", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Document Name</span>${columnFilterSelect("documentName", "Document Name", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Attachments</span>${columnFilterSelect("attachments", "Attachments", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Who</span>${columnFilterSelect("who", "Who", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Departamenti</span>${columnFilterSelect("department", "Departamenti", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Client</span>${columnFilterSelect("client", "Client", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Platform</span>${columnFilterSelect("platform", "Platform", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Data</span>${columnFilterSelect("date", "Data", notes)}</div></th>
              <th><div class="notes-header-filter"><span>Path</span>${columnFilterSelect("path", "Path", notes)}</div></th>
              <th>Edit</th>${canDeleteNotes() ? "<th>Delete</th>" : ""}
            </tr>
          </thead>
          <tbody>${classifiedRows(filteredNotes)}</tbody>
        </table>
      </div>`;
  }

  function composerHtml() {
    return `
      <section class="notes-composer ${state.isDraggingFiles ? "notes-composer-dragging" : ""}" data-drop-zone>
        <div class="notes-composer-main">
          <div id="classification-note-editor" class="notes-composer-editor" contenteditable="true" data-placeholder="Shkruaj një shënim...">${state.draftDescription}</div>
          <div class="notes-composer-actions">
            <label class="notes-attach-button" for="classification-note-files" title="Bashkëngjit file" aria-label="Bashkëngjit file">
              <span aria-hidden="true">&#128206;</span>
            </label>
            <input id="classification-note-files" class="notes-file-input" type="file" multiple>
            <span class="notes-drop-hint">Bashkëngjit ose tërhiq file këtu</span>
            <button class="notes-button notes-button-primary notes-composer-save" data-action="save-new-note" type="button">Ruaj shënimin</button>
          </div>
          ${state.draftAttachments.length ? `<div class="notes-draft-files">${state.draftAttachments.map((file, index) => `
            <span class="notes-draft-file"><span aria-hidden="true">&#128196;</span><span>${escapeHtml(file.name)}</span><small>${formatFileSize(file.size)}</small><button data-action="remove-draft-file" data-file-index="${index}" type="button" aria-label="Hiqe ${escapeHtml(file.name)}">&times;</button></span>
          `).join("")}</div>` : ""}
        </div>
        <div class="notes-drop-overlay"><strong>Lësho file-t këtu</strong><span>Për t'i bashkëngjitur me shënimin</span></div>
      </section>`;
  }

  async function saveNewNote(root) {
    const editor = root.querySelector("#classification-note-editor");
    const description = (editor ? editor.innerHTML : state.draftDescription).trim();
    if (!stripHtml(description).trim() && !state.draftAttachments.length) {
      if (editor) editor.focus();
      return;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}`;
    let attachments = [];
    try {
      attachments = await storeAttachmentFiles(id, state.draftAttachments);
    } catch (error) {
      console.error("Could not store attachments", error);
      window.alert("File-t nuk u ruajtën. Provo përsëri.");
      return;
    }
    const now = new Date().toISOString();
    const notes = loadNotes();
    notes.unshift({
      id,
      title: titleFromDescription(description) || (attachments[0] ? attachments[0].name : "Shënim i ri"),
      description: description || "<p>Shënim me bashkëngjitje</p>",
      category: "",
      discussed: "No",
      createdBy: config.currentUser,
      fromWho: config.currentUser,
      status: "Open",
      createdAt: now,
      updatedAt: now,
      attachments
    });
    saveNotes(notes);
    state.activeCategory = unclassifiedCategory;
    state.draftDescription = "";
    state.draftAttachments = [];
    state.isDraggingFiles = false;
    render(root);
  }

  function addDraftFiles(files, root) {
    const incoming = Array.from(files || []);
    const existingKeys = new Set(state.draftAttachments.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
    incoming.forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!existingKeys.has(key)) {
        state.draftAttachments.push(file);
        existingKeys.add(key);
      }
    });
    state.isDraggingFiles = false;
    render(root);
  }

  function render(root) {
    const activeNotes = notesForCategory(state.activeCategory);
    const total = loadNotes().length;
    const open = loadNotes().filter((note) => note.status === "Open" && note.category && note.category !== "Pyetje").length;

    root.innerHTML = `
      <section class="notes-app notes-classifications-page">
        <div class="notes-layout">
          <aside class="notes-sidebar">
            <div class="notes-sidebar-brand">
              <strong>PrimeFlow</strong>
              <span>${escapeHtml(config.currentUser)}</span>
            </div>
            <nav class="notes-sidebar-nav">${sidebarItems()}</nav>
          </aside>

          <div class="notes-main">
            <header class="notes-hero">
            <div>

              <h1 class="notes-title">${escapeHtml(config.title)}</h1>
            </div>
            <div class="notes-counters">
              <span class="notes-badge notes-badge-open">Open ${open}</span>
              <span class="notes-badge">Total ${total}</span>
            </div>
          </header>

          ${composerHtml()}

          <section class="notes-section">
            ${state.activeCategory === unclassifiedCategory ? `<div class="notes-classification-search">
              <input class="notes-search" data-action="search" value="${escapeHtml(state.search)}" placeholder="Kërko shënime të klasifikuara...">
            </div>` : ""}
            <div class="notes-section-head">
              <h2 class="notes-section-title">Klasifikimet</h2>
              <div class="notes-classification-filters">

              <select class="notes-select notes-status-filter" data-action="status">
                <option value="All"${state.status === "All" ? " selected" : ""}>All</option>
                <option value="Open"${state.status === "Open" ? " selected" : ""}>Open</option>
                <option value="Closed"${state.status === "Closed" ? " selected" : ""}>Closed</option>
              </select>
              </div>
            </div>

            <div class="notes-tabs">
              ${[unclassifiedCategory, ...config.categories].map((category) => `
                <button class="notes-tab ${state.activeCategory === category ? "notes-tab-active" : ""}" data-action="category" data-category="${escapeHtml(category)}">
                  ${escapeHtml(category)} <span>${countFor(category)}</span>
                </button>
              `).join("")}
            </div>

            ${state.activeCategory === unclassifiedCategory ? managementTableHtml(activeNotes) : classifiedTableHtml(activeNotes)}
            </section>
          </div>
        </div>
      </section>
      ${questionModalHtml()}
      ${documentPreviewHtml()}
    `;
  }

  function saveEdit(root, id) {
    const currentNote = loadNotes().find((note) => note.id === id);
    if (!currentNote || !canManageDocument(currentNote)) return;
    const description = document.getElementById(`edit-description-${id}`).innerHTML.trim();
    const fields = {};
    root.querySelectorAll(`[data-edit-field][data-id="${id}"]`).forEach((field) => {
      fields[field.dataset.editField] = field.value;
    });

    const notes = loadNotes().map((note) => {
      if (note.id !== id) return note;
      return {
        ...note,
        ...fields,
        questionText: fields.questionText || note.questionText || "",
        description,
        title: titleFromDescription(description) || "Untitled note",
        updatedAt: new Date().toISOString(),
        updatedBy: config.currentUser
      };
    });

    saveNotes(notes);
    state.editingId = null;
    render(root);
  }

  function saveRow(root, id) {
    const currentNote = loadNotes().find((note) => note.id === id);
    if (!currentNote || !canManageDocument(currentNote)) return;
    const row = root.querySelector(`[data-note-row="${id}"]`);
    if (!row) return;
    const fields = {};
    row.querySelectorAll("[data-note-field]").forEach((field) => {
      fields[field.dataset.noteField] = field.value;
    });
    const departmentSelect = row.querySelector('[data-note-field="departmentId"]');
    const clientSelect = row.querySelector('[data-note-field="client"]');
    fields.department = departmentSelect?.selectedOptions[0]?.dataset.name || "";
    fields.client = clientSelect?.value || "";
    saveNotes(loadNotes().map((note) => note.id === id ? {
      ...note,
      ...fields,
      keepInNotes: true,
      lastSavedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: config.currentUser
    } : note));
    render(root);
  }

  async function deleteNote(root, id) {
    const note = loadNotes().find((item) => item.id === id);
    if (!note || !canDeleteNote(note)) return;
    if (state.activeCategory !== unclassifiedCategory) {
      if (!window.confirm(`Ta heq dokumentin nga ${state.activeCategory}? Shënimi do të mbetet te To classify.`)) return;
      saveNotes(loadNotes().map((item) => item.id === id ? {
        ...item,
        category: "",
        keepInNotes: true,
        updatedAt: new Date().toISOString(),
        updatedBy: config.currentUser
      } : item));
      render(root);
      return;
    }
    if (!window.confirm("A je i sigurt që dëshiron ta fshish këtë shënim?")) return;
    if (note && Array.isArray(note.attachments) && note.attachments.length) {
      try {
        const db = await openAttachmentDb();
        const transaction = db.transaction(attachmentStoreName, "readwrite");
        const store = transaction.objectStore(attachmentStoreName);
        note.attachments.forEach((attachment) => store.delete(attachment.id));
        await new Promise((resolve) => { transaction.oncomplete = resolve; });
        db.close();
      } catch (error) {
        console.warn("Could not remove attachment files", error);
      }
    }
    saveNotes(loadNotes().filter((item) => item.id !== id));
    render(root);
  }

  function buildDocumentContent(note, type, row) {
    if (note.documentContent && (type !== "excel" || note.documentContentVersion === 2)) return note.documentContent;
    if (type !== "excel") return note.description || "<p></p>";
    const departmentSelect = row?.querySelector('[data-note-field="departmentId"]');
    const clientSelect = row?.querySelector('[data-note-field="client"]');
    const department = departmentSelect?.selectedOptions[0]?.dataset.name || note.department || "";
    const project = clientSelect?.value || note.client || "";
    const platform = row?.querySelector('[data-note-field="platform"]')?.value || note.platform || "";
    const noteDate = row?.querySelector('[data-note-field="noteDate"]')?.value || note.noteDate || "";
    const filePath = row?.querySelector('[data-note-field="filePath"]')?.value || note.filePath || "";
    const attachments = Array.isArray(note.attachments) ? note.attachments.map((file) => file.name).join(", ") : "";
    return `<table class="notes-excel-sheet"><thead><tr class="notes-excel-letters"><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th><th>H</th><th>I</th></tr><tr><th class="notes-excel-row-number"></th><th>NR</th><th>DOCUMENT NAME</th><th>ATTACHMENTS</th><th>WHO</th><th>DEPARTAMENTI</th><th>CLIENT</th><th>PLATFORM</th><th>DATA</th><th>PATH</th></tr></thead><tbody><tr><th class="notes-excel-row-number">1</th><td>1</td><td>${escapeHtml(note.documentName || note.title || "Dokument")}</td><td>${escapeHtml(attachments || "Pa skedarë")}</td><td>${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}</td><td>${escapeHtml(department)}</td><td>${escapeHtml(project)}</td><td>${escapeHtml(platform)}</td><td>${escapeHtml(noteDate)}</td><td>${escapeHtml(filePath)}</td></tr></tbody></table>`;
  }

  function openDocumentPreview(root, id) {
    const note = loadNotes().find((item) => item.id === id);
    if (!note) return;
    const row = root.querySelector(`[data-note-row="${id}"]`);
    const type = normalizeDocumentType(row?.querySelector(`[data-document-type="${id}"]`)?.value || note.documentType);
    const documentName = row?.querySelector('[data-note-field="documentName"]')?.value || note.documentName || note.title || "Dokument";
    const content = buildDocumentContent(note, type, row);
    if (canManageDocument(note)) {
      saveNotes(loadNotes().map((item) => item.id === id ? { ...item, documentName, documentType: type, documentContent: content, documentContentVersion: type === "excel" ? 2 : item.documentContentVersion } : item));
    }
    state.documentPreviewId = id;
    state.activeSheetCell = "A1";
    state.sheetSelectionAnchor = "A1";
    state.sheetSelectionFocus = "A1";
    state.sheetSelectionMode = "cell";
    state.sheetUndoStack = [];
    render(root);
  }

  function collectSpreadsheetData(root, note) {
    const sheetRoot = root.querySelector("[data-sheet-rows]");
    const cells = {};
    root.querySelectorAll("[data-sheet-cell]").forEach((cell) => {
      if (cell.innerHTML.trim()) cells[cell.dataset.sheetCell] = cell.innerHTML;
    });
    return {
      rows: Number(sheetRoot?.dataset.sheetRows || 16),
      cols: Number(sheetRoot?.dataset.sheetCols || 8),
      cells,
      tables: Array.isArray(note?.spreadsheetData?.tables) ? note.spreadsheetData.tables : []
    };
  }

  function pushSpreadsheetUndo(sheet) {
    state.sheetUndoStack.push(JSON.parse(JSON.stringify(sheet)));
  }

  function undoSpreadsheet(root) {
    if (!canManageCurrentDocument() || !state.documentPreviewId || !state.sheetUndoStack.length) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const spreadsheetData = state.sheetUndoStack.pop();
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData } : item));
    state.activeSheetCell = "A1";
    state.sheetSelectionAnchor = "A1";
    state.sheetSelectionFocus = "A1";
    state.sheetSelectionMode = "cell";
    render(root);
  }

  function saveDocumentPreview(root, id) {
    const currentNote = loadNotes().find((note) => note.id === id);
    if (!currentNote || !canManageDocument(currentNote)) return;
    const previewType = normalizeDocumentType(root.querySelector("[data-document-preview-type]")?.dataset.documentPreviewType || currentNote.documentType);
    if (previewType === "excel") {
      const spreadsheetData = collectSpreadsheetData(root, currentNote);
      saveNotes(loadNotes().map((note) => note.id === id ? {
        ...note,
        documentType: "excel",
        spreadsheetData,
        documentSaved: true,
        documentUpdatedAt: new Date().toISOString(),
        documentUpdatedBy: config.currentUser
      } : note));
      state.sheetUndoStack = [];
      state.documentPreviewId = null;
      render(root);
      return;
    }
    const editor = root.querySelector("#document-preview-editor");
    const title = root.querySelector("[data-document-title]");
    saveNotes(loadNotes().map((note) => note.id === id ? {
      ...note,
      documentType: "word",
      documentName: title?.value.trim() || note.documentName || note.title || "Dokument",
      documentContent: editor?.innerHTML || note.documentContent || note.description || "",
      documentSaved: true,
      documentUpdatedAt: new Date().toISOString(),
      documentUpdatedBy: config.currentUser
    } : note));
    state.sheetUndoStack = [];
    state.documentPreviewId = null;
    render(root);
  }

  function insertSpreadsheetDimension(root, dimension, position = "after") {
    if (!canManageCurrentDocument() || !state.documentPreviewId) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const sheet = collectSpreadsheetData(root, note);
    if (dimension === "column" && sheet.cols >= 26) return;
    pushSpreadsheetUndo(sheet);
    const selection = normalizedSheetSelection();
    const insertIndex = dimension === "row"
      ? (position === "before" ? selection.startRow : selection.endRow + 1)
      : (position === "before" ? selection.startCol : selection.endCol + 1);
    const cells = {};
    Object.entries(sheet.cells).forEach(([key, value]) => {
      const coordinates = cellCoordinates(key);
      const row = dimension === "row" && coordinates.row >= insertIndex ? coordinates.row + 1 : coordinates.row;
      const col = dimension === "column" && coordinates.col >= insertIndex ? coordinates.col + 1 : coordinates.col;
      cells[`${columnLetter(col)}${row + 1}`] = value;
    });
    const tables = sheet.tables.map((range) => {
      const next = { ...range };
      if (dimension === "row") {
        if (insertIndex <= next.startRow) { next.startRow += 1; next.endRow += 1; }
        else if (insertIndex <= next.endRow) next.endRow += 1;
      } else {
        if (insertIndex <= next.startCol) { next.startCol += 1; next.endCol += 1; }
        else if (insertIndex <= next.endCol) next.endCol += 1;
      }
      return next;
    });
    const spreadsheetData = {
      rows: sheet.rows + (dimension === "row" ? 1 : 0),
      cols: sheet.cols + (dimension === "column" ? 1 : 0),
      cells,
      tables
    };
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData } : item));
    const active = cellCoordinates(state.activeSheetCell);
    const nextRow = dimension === "row" ? insertIndex : active.row;
    const nextCol = dimension === "column" ? insertIndex : active.col;
    state.activeSheetCell = `${columnLetter(nextCol)}${nextRow + 1}`;
    state.sheetSelectionAnchor = state.activeSheetCell;
    state.sheetSelectionFocus = state.activeSheetCell;
    state.sheetSelectionMode = "cell";
    render(root);
  }

  function createSpreadsheetTable(root) {
    if (!canManageCurrentDocument() || !state.documentPreviewId) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const selection = normalizedSheetSelection();
    if (selection.startRow === selection.endRow && selection.startCol === selection.endCol) {
      window.alert("Zgjidh më shumë se një qelizë me Shift + klik, pastaj kliko KRIJO TABELË.");
      return;
    }
    const sheet = collectSpreadsheetData(root, note);
    pushSpreadsheetUndo(sheet);
    const tables = sheet.tables.filter((range) =>
      range.endRow < selection.startRow || range.startRow > selection.endRow ||
      range.endCol < selection.startCol || range.startCol > selection.endCol
    );
    tables.push(selection);
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData: { ...sheet, tables } } : item));
    render(root);
  }

  function deleteSpreadsheetColumn(root) {
    if (!canManageCurrentDocument() || !state.documentPreviewId) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const sheet = collectSpreadsheetData(root, note);
    if (sheet.cols <= 1) {
      window.alert("Duhet të mbetet së paku një kolonë.");
      return;
    }
    const active = cellCoordinates(state.activeSheetCell);
    const deleteIndex = Math.min(active.col, sheet.cols - 1);
    const columnName = columnLetter(deleteIndex);
    if (!window.confirm(`Ta fshij kolonën ${columnName}? Të dhënat e saj do të largohen.`)) return;
    pushSpreadsheetUndo(sheet);
    const cells = {};
    Object.entries(sheet.cells).forEach(([key, value]) => {
      const coordinates = cellCoordinates(key);
      if (coordinates.col === deleteIndex) return;
      const col = coordinates.col > deleteIndex ? coordinates.col - 1 : coordinates.col;
      cells[`${columnLetter(col)}${coordinates.row + 1}`] = value;
    });
    const tables = sheet.tables.map((range) => {
      const next = { ...range };
      if (deleteIndex < next.startCol) {
        next.startCol -= 1;
        next.endCol -= 1;
      } else if (deleteIndex <= next.endCol) {
        next.endCol -= 1;
      }
      return next;
    }).filter((range) => range.endCol >= range.startCol);
    const spreadsheetData = { ...sheet, cols: sheet.cols - 1, cells, tables };
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData } : item));
    const nextCol = Math.min(deleteIndex, spreadsheetData.cols - 1);
    const nextRow = Math.min(active.row, spreadsheetData.rows - 1);
    state.activeSheetCell = `${columnLetter(nextCol)}${nextRow + 1}`;
    state.sheetSelectionAnchor = state.activeSheetCell;
    state.sheetSelectionFocus = state.activeSheetCell;
    state.sheetSelectionMode = "cell";
    render(root);
  }

  function deleteSpreadsheetRow(root) {
    if (!canManageCurrentDocument() || !state.documentPreviewId) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const sheet = collectSpreadsheetData(root, note);
    if (sheet.rows <= 1) {
      window.alert("Duhet të mbetet së paku një rresht.");
      return;
    }
    const active = cellCoordinates(state.activeSheetCell);
    const deleteIndex = Math.min(active.row, sheet.rows - 1);
    if (!window.confirm(`Ta fshij rreshtin ${deleteIndex + 1}? Të dhënat e tij do të largohen.`)) return;
    pushSpreadsheetUndo(sheet);
    const cells = {};
    Object.entries(sheet.cells).forEach(([key, value]) => {
      const coordinates = cellCoordinates(key);
      if (coordinates.row === deleteIndex) return;
      const row = coordinates.row > deleteIndex ? coordinates.row - 1 : coordinates.row;
      cells[`${columnLetter(coordinates.col)}${row + 1}`] = value;
    });
    const tables = sheet.tables.map((range) => {
      const next = { ...range };
      if (deleteIndex < next.startRow) {
        next.startRow -= 1;
        next.endRow -= 1;
      } else if (deleteIndex <= next.endRow) {
        next.endRow -= 1;
      }
      return next;
    }).filter((range) => range.endRow >= range.startRow);
    const spreadsheetData = { ...sheet, rows: sheet.rows - 1, cells, tables };
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData } : item));
    const nextRow = Math.min(deleteIndex, spreadsheetData.rows - 1);
    const nextCol = Math.min(active.col, spreadsheetData.cols - 1);
    state.activeSheetCell = `${columnLetter(nextCol)}${nextRow + 1}`;
    state.sheetSelectionAnchor = state.activeSheetCell;
    state.sheetSelectionFocus = state.activeSheetCell;
    state.sheetSelectionMode = "cell";
    render(root);
  }

  function clearSpreadsheet(root) {
    if (!canManageCurrentDocument() || !state.documentPreviewId || !window.confirm("Ta pastroj template-in?")) return;
    const sheetRoot = root.querySelector("[data-sheet-rows]");
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (note) pushSpreadsheetUndo(collectSpreadsheetData(root, note));
    saveNotes(loadNotes().map((note) => note.id === state.documentPreviewId ? { ...note, spreadsheetData: { rows: Number(sheetRoot?.dataset.sheetRows || 16), cols: Number(sheetRoot?.dataset.sheetCols || 8), cells: {}, tables: [] } } : note));
    state.activeSheetCell = "A1";
    render(root);
  }


  function saveQuestionModal(root, id) {
    const answers = {};
    const editors = {};
    const existingNote = loadNotes().find((note) => note.id === id) || {};
    const existingEditors = existingNote.questionAnswerEditors || {};
    const existingAnswers = existingNote.questionAnswers || {};
    root.querySelectorAll("[data-question-answer]").forEach((field) => {
      const question = field.dataset.questionAnswer;
      answers[question] = field.value;
      editors[question] = field.value !== (existingAnswers[question] || "") ? config.currentUser : (existingEditors[question] || "");
    });
    const notes = loadNotes().map((note) =>
      note.id === id ? { ...note, questionAnswers: answers, questionAnswerEditors: editors, updatedAt: new Date().toISOString(), updatedBy: config.currentUser } : note
    );
    saveNotes(notes);
    state.questionModalId = null;
    render(root);
  }

  function updateSheetSelection(root) {
    const selection = normalizedSheetSelection();
    root.querySelectorAll("[data-sheet-cell]").forEach((cell) => {
      const coordinates = cellCoordinates(cell.dataset.sheetCell);
      cell.classList.toggle("notes-sheet-selected", cellInRange(coordinates.row, coordinates.col, selection));
    });
    root.querySelectorAll("[data-sheet-row]").forEach((header) => {
      const row = Number(header.dataset.sheetRow);
      header.classList.toggle("notes-sheet-header-selected", row >= selection.startRow && row <= selection.endRow);
    });
    root.querySelectorAll("[data-sheet-column]").forEach((header) => {
      const col = Number(header.dataset.sheetColumn);
      header.classList.toggle("notes-sheet-header-selected", col >= selection.startCol && col <= selection.endCol);
    });
  }

  function bind(root) {
    root.addEventListener("click", (event) => {
      const sheetCommand = event.target.closest("[data-sheet-command]");
      if (sheetCommand && canManageCurrentDocument()) {
        document.execCommand(sheetCommand.dataset.sheetCommand, false, null);
        return;
      }
      const sheetCell = event.target.closest("[data-sheet-cell]");
      if (sheetCell) {
        const key = sheetCell.dataset.sheetCell;
        if (!event.shiftKey) state.sheetSelectionAnchor = key;
        state.sheetSelectionFocus = key;
        state.activeSheetCell = key;
        state.sheetSelectionMode = "cell";
        updateSheetSelection(root);
        const label = root.querySelector("[data-sheet-active-cell]");
        const formula = root.querySelector("[data-sheet-formula]");
        if (label) label.textContent = key;
        if (formula) formula.value = sheetCell.textContent || "";
        return;
      }
      const rowHeader = event.target.closest("[data-sheet-row]");
      if (rowHeader) {
        const row = Number(rowHeader.dataset.sheetRow);
        const cols = Number(root.querySelector("[data-sheet-cols]")?.dataset.sheetCols || 1);
        state.sheetSelectionAnchor = `A${row + 1}`;
        state.sheetSelectionFocus = `${columnLetter(cols - 1)}${row + 1}`;
        state.activeSheetCell = state.sheetSelectionAnchor;
        state.sheetSelectionMode = "row";
        updateSheetSelection(root);
        return;
      }
      const columnHeader = event.target.closest("[data-sheet-column]");
      if (columnHeader) {
        const col = Number(columnHeader.dataset.sheetColumn);
        const rows = Number(root.querySelector("[data-sheet-rows]")?.dataset.sheetRows || 1);
        state.sheetSelectionAnchor = `${columnLetter(col)}1`;
        state.sheetSelectionFocus = `${columnLetter(col)}${rows}`;
        state.activeSheetCell = state.sheetSelectionAnchor;
        state.sheetSelectionMode = "column";
        updateSheetSelection(root);
        return;
      }
      const categoryButton = event.target.closest('[data-action="category"]');
      if (categoryButton) {
        state.activeCategory = categoryButton.dataset.category;
        state.search = state.searchByCategory[state.activeCategory] || "";
        window.location.hash = encodeURIComponent(state.activeCategory);
        state.questionType = "All";
        state.editingId = null;
        render(root);
        return;
      }

      const action = event.target.closest("[data-action]");
      if (!action) return;

      if (action.dataset.action === "open-notes") {
        window.location.assign("./notes.html");
      }
      if (action.dataset.action === "open-classifications") {
        window.location.assign("./classifications.html");
      }
      if (action.dataset.action === "open-questions") {
        window.location.assign("./pyetje.html");
      }
      if (action.dataset.action === "open-question-modal") {
        state.questionModalId = action.dataset.id;
        render(root);
      }
      if (action.dataset.action === "close-question-modal") {
        state.questionModalId = null;
        render(root);
      }
      if (action.dataset.action === "save-question-modal") saveQuestionModal(root, action.dataset.id);
      if (action.dataset.action === "save-new-note") saveNewNote(root);
      if (action.dataset.action === "remove-draft-file") {
        state.draftAttachments.splice(Number(action.dataset.fileIndex), 1);
        render(root);
      }
      if (action.dataset.action === "download-attachment") downloadAttachment(action.dataset.attachmentId);
      if (action.dataset.action === "create-document") openDocumentPreview(root, action.dataset.id);
      if (action.dataset.action === "close-document-preview") {
        state.documentPreviewId = null;
        render(root);
      }
      if (action.dataset.action === "save-document-preview") saveDocumentPreview(root, action.dataset.id);
      if (action.dataset.action === "sheet-add-row") insertSpreadsheetDimension(root, "row");
      if (action.dataset.action === "sheet-add-column") insertSpreadsheetDimension(root, "column");
      if (action.dataset.action === "sheet-add-row-before") insertSpreadsheetDimension(root, "row", "before");
      if (action.dataset.action === "sheet-add-column-before") insertSpreadsheetDimension(root, "column", "before");
      if (action.dataset.action === "sheet-delete-column") deleteSpreadsheetColumn(root);
      if (action.dataset.action === "sheet-create-table") createSpreadsheetTable(root);
      if (action.dataset.action === "sheet-clear") clearSpreadsheet(root);
      if (action.dataset.action === "save-row") saveRow(root, action.dataset.id);
      if (action.dataset.action === "delete-row") deleteNote(root, action.dataset.id);
      if (action.dataset.action === "edit") {
        state.editingId = action.dataset.id;
        render(root);
      }
      if (action.dataset.action === "save-edit") saveEdit(root, action.dataset.id);
      if (action.dataset.action === "cancel-edit") {
        state.editingId = null;
        render(root);
      }
    });

    root.addEventListener("mousedown", (event) => {
      if (event.target.closest("[data-sheet-command]")) event.preventDefault();
    });

    root.addEventListener("focusin", (event) => {
      const cell = event.target.closest("[data-sheet-cell]");
      if (!cell) return;
      state.activeSheetCell = cell.dataset.sheetCell;
      const label = root.querySelector("[data-sheet-active-cell]");
      const formula = root.querySelector("[data-sheet-formula]");
      if (label) label.textContent = state.activeSheetCell;
      if (formula) formula.value = cell.textContent || "";
    });

    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-sheet-cell]")) {
        const formula = root.querySelector("[data-sheet-formula]");
        if (formula) formula.value = event.target.textContent || "";
        return;
      }
      if (event.target.matches("[data-sheet-formula]")) {
        const cell = root.querySelector(`[data-sheet-cell="${state.activeSheetCell}"]`);
        if (cell) cell.textContent = event.target.value;
        return;
      }
      if (event.target.id === "classification-note-editor") {
        state.draftDescription = event.target.innerHTML;
        return;
      }
      const editedRow = event.target.closest("[data-note-row]");
      if (editedRow) {
        const saveButton = editedRow.querySelector('[data-action="save-row"]');
        if (saveButton) {
          saveButton.textContent = "SAVE";
          saveButton.classList.remove("notes-row-saved");
        }
      }
      if (event.target.dataset.action !== "search") return;
      const cursorPosition = event.target.selectionStart ?? event.target.value.length;
      state.search = event.target.value;
      state.searchByCategory[state.activeCategory] = state.search;
      state.editingId = null;
      render(root);
      const searchInput = root.querySelector('[data-action="search"]');
      if (searchInput) {
        searchInput.focus({ preventScroll: true });
        searchInput.setSelectionRange(cursorPosition, cursorPosition);
      }
    });

    root.addEventListener("change", async (event) => {
      if (event.target.dataset.columnFilter) {
        activeColumnFilters()[event.target.dataset.columnFilter] = event.target.value;
        render(root);
        return;
      }
      if (event.target.matches("[data-document-type]")) {
        const noteId = event.target.dataset.documentType;
        const documentType = normalizeDocumentType(event.target.value);
        saveNotes(loadNotes().map((note) => note.id === noteId ? { ...note, documentType } : note));
        return;
      }
      if (event.target.id === "classification-note-files") {
        addDraftFiles(event.target.files, root);
        return;
      }
      const editedRow = event.target.closest("[data-note-row]");
      if (editedRow) {
        const saveButton = editedRow.querySelector('[data-action="save-row"]');
        if (saveButton) {
          saveButton.textContent = "SAVE";
          saveButton.classList.remove("notes-row-saved");
        }
      }
      if (event.target.dataset.noteField === "departmentId") {
        const row = event.target.closest("[data-note-row]");
        const clientSelect = row?.querySelector('[data-note-field="client"]');
        const platformSelect = row?.querySelector('[data-note-field="platform"]');
        if (event.target.value) {
          try {
            state.fileClientsByDepartment[event.target.value] = await apiGet(`/departments/${event.target.value}/file-clients`);
          } catch (error) {
            console.error("Could not refresh clients from Files", error);
          }
        }
        if (clientSelect) {
          clientSelect.innerHTML = clientOptions({}, event.target.value);
          clientSelect.disabled = !event.target.value;
        }
        if (platformSelect) {
          platformSelect.innerHTML = platformOptions({}, "", "");
          platformSelect.disabled = true;
        }
        return;
      }
      if (event.target.dataset.noteField === "client") {
        const row = event.target.closest("[data-note-row]");
        const departmentId = row?.querySelector('[data-note-field="departmentId"]')?.value || "";
        const platformSelect = row?.querySelector('[data-note-field="platform"]');
        if (departmentId && event.target.value) {
          try {
            state.filePlatformsByClient[`${departmentId}::${event.target.value}`] = await apiGet(`/departments/${departmentId}/file-clients/${encodeURIComponent(event.target.value)}/platforms`);
          } catch (error) {
            console.error("Could not refresh platforms from Files", error);
          }
        }
        if (platformSelect) {
          platformSelect.innerHTML = platformOptions({}, departmentId, event.target.value);
          platformSelect.disabled = !event.target.value;
        }
        return;
      }
      if (event.target.dataset.action === "status") {
        state.status = event.target.value;
        state.editingId = null;
        render(root);
      }
      if (event.target.dataset.action === "question-type") {
        state.questionType = event.target.value;
        state.editingId = null;
        render(root);
      }
    });

    root.addEventListener("dragenter", (event) => {
      const zone = event.target.closest("[data-drop-zone]");
      if (!zone || !event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
      event.preventDefault();
      if (!state.isDraggingFiles) {
        state.draftDescription = root.querySelector("#classification-note-editor")?.innerHTML || state.draftDescription;
        state.isDraggingFiles = true;
        render(root);
      }
    });

    root.addEventListener("dragover", (event) => {
      if (event.target.closest("[data-drop-zone]")) event.preventDefault();
    });

    root.addEventListener("dragleave", (event) => {
      const zone = event.target.closest("[data-drop-zone]");
      if (!zone || zone.contains(event.relatedTarget)) return;
      state.isDraggingFiles = false;
      render(root);
    });

    root.addEventListener("drop", (event) => {
      if (!event.target.closest("[data-drop-zone]")) return;
      event.preventDefault();
      addDraftFiles(event.dataTransfer.files, root);
    });

    window.addEventListener("keydown", (event) => {
      if (!state.documentPreviewId || normalizeDocumentType(activePreviewNote()?.documentType) !== "excel") return;
      const isPlus = event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
      const isMinus = event.key === "-" || event.code === "NumpadSubtract";
      const editingCell = event.target?.closest?.("[data-sheet-cell], [data-sheet-formula]");
      if (isPlus && !editingCell && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (state.sheetSelectionMode === "column") insertSpreadsheetDimension(root, "column", "before");
        else insertSpreadsheetDimension(root, "row", "before");
        return;
      }
      if (isMinus && !editingCell && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (state.sheetSelectionMode === "column") deleteSpreadsheetColumn(root);
        else deleteSpreadsheetRow(root);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (editingCell || !state.sheetUndoStack.length) return;
        event.preventDefault();
        undoSpreadsheet(root);
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) render(root);
    });

    window.addEventListener("hashchange", () => {
      const hashCategory = decodeURIComponent(window.location.hash.replace("#", ""));
      if ([unclassifiedCategory, ...config.categories].includes(hashCategory)) {
        state.activeCategory = hashCategory;
        state.search = state.searchByCategory[state.activeCategory] || "";
        state.questionType = "All";
        state.editingId = null;
        render(root);
      }
    });
  }

  function init() {
    const root = document.getElementById("primeflow-classifications-root");
    if (!root) return;
    render(root);
    bind(root);
    loadReferenceData(root);
    window.setInterval(() => loadReferenceData(root, false), 30000);
    window.addEventListener("focus", () => loadReferenceData(root, false));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
