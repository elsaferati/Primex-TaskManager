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

  function canDeleteNotes() {
    return config.currentUserRole === "ADMIN" || config.currentUserRole === "MANAGER";
  }

  function canManageDocuments() {
    return config.currentUserRole === "ADMIN" || config.currentUserRole === "MANAGER";
  }

  const state = {
    activeCategory: [unclassifiedCategory, ...config.categories].includes(decodeURIComponent(window.location.hash.replace("#", ""))) ? decodeURIComponent(window.location.hash.replace("#", "")) : unclassifiedCategory,
    status: "All",
    search: "",
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
    documentPreviewId: null,
    activeSheetCell: "A1"
  };

  async function apiGet(path) {
    const token = localStorage.getItem("primex_access_token");
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error(`API request failed (${response.status})`);
    return response.json();
  }

  async function loadReferenceData(root) {
    try {
      const departments = await apiGet("/departments");
      state.departments = Array.isArray(departments) ? departments : [];
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
      render(root);
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

  function rowTextInput(note, field, placeholder, extraClass) {
    return `<input class="notes-input notes-cell-input ${extraClass || ""}" data-note-field="${field}" data-id="${note.id}" value="${escapeHtml(note[field] || "")}" placeholder="${escapeHtml(placeholder)}">`;
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

  function rows(notes) {
    if (!notes.length) {
      return `<tr><td colspan="${canDeleteNotes() ? 13 : 12}" class="notes-empty">Nuk ka shënime në këtë klasifikim.</td></tr>`;
    }

    return notes.map((note, index) => {
      const dateValue = note.noteDate || String(note.createdAt || "").slice(0, 10);
      const attachmentCount = Array.isArray(note.attachments) ? note.attachments.length : 0;
      const selectedDepartment = state.departments.find((department) => department.id === note.departmentId || (!note.departmentId && department.name === note.department));
      const selectedDepartmentId = selectedDepartment ? selectedDepartment.id : (note.departmentId || "");
      return `
        <tr data-note-row="${note.id}">
          <td class="notes-number-cell">${index + 1}</td>
          <td class="notes-name-cell"><div class="notes-note-stack"><div class="notes-description">${note.description || ""}</div><span class="notes-initials-dot" title="${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}">${escapeHtml(initialsFor(note.updatedBy || note.createdBy || note.fromWho))}</span></div></td>
          <td class="notes-attachments-cell">${attachmentCount ? attachmentChipsHtml(note) : `<span class="notes-muted-action">Pa skedarë</span>`}</td>
          <td><div class="notes-create-document-stack"><select class="notes-document-type" data-document-type="${note.id}" aria-label="Lloji i dokumentit"${note.documentSaved ? " disabled" : ""}><option value="word"${note.documentType !== "excel" ? " selected" : ""}>Word</option><option value="excel"${note.documentType === "excel" ? " selected" : ""}>Excel</option></select><button class="notes-create-document" data-action="create-document" data-id="${note.id}" type="button">${note.documentSaved ? `OPEN<br>${note.documentType === "excel" ? "EXCEL" : "WORD"}` : "CREATE<br>DOCUMENT"}</button></div></td>
          <td>${rowTextInput(note, "documentName", "Emri i dokumentit")}</td>
          <td><select class="notes-select notes-cell-select" data-note-field="category" data-id="${note.id}">${categoryOptions(note.category || "")}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="departmentId" data-id="${note.id}">${departmentOptions(note)}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="client" data-id="${note.id}"${selectedDepartmentId ? "" : " disabled"}>${clientOptions(note, selectedDepartmentId)}</select></td>
          <td><select class="notes-select notes-cell-select" data-note-field="platform" data-id="${note.id}"${selectedDepartmentId && note.client ? "" : " disabled"}>${platformOptions(note, selectedDepartmentId, note.client || "")}</select></td>
          <td><div class="notes-date-fields"><input class="notes-input notes-cell-input" data-note-field="noteDate" data-id="${note.id}" type="date" value="${escapeHtml(dateValue)}"></div></td>
          <td>${rowTextInput(note, "filePath", "Shkruaj path", "notes-path-input")}</td>
          <td><button class="notes-row-save ${note.lastSavedAt ? "notes-row-saved" : ""}" data-action="save-row" data-id="${note.id}" type="button">${note.lastSavedAt ? "SAVED" : "SAVE"}</button></td>
          ${canDeleteNotes() ? `<td><button class="notes-row-delete" data-action="delete-row" data-id="${note.id}" type="button" title="Fshije shënimin"><span aria-hidden="true">&#128465;</span><small>DELETE</small></button></td>` : ""}
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
    if (note.spreadsheetData) return note.spreadsheetData;
    return {
      rows: 16,
      cols: 8,
      cells: {
        A1: "TITULLI",
        B1: "PËRSHKRIMI",
        A2: escapeHtml(note.documentName || note.title || "Emri i dokumentit"),
        B2: escapeHtml(stripHtml(note.description || "Përmbajtja e re..."))
      }
    };
  }

  function columnLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function excelPreviewHtml(note, editable) {
    const sheet = spreadsheetDataFor(note);
    const attachments = Array.isArray(note.attachments) ? note.attachments : [];
    const columnHeaders = Array.from({ length: sheet.cols }, (_, column) => `<th>${columnLetter(column)}</th>`).join("");
    const rows = Array.from({ length: sheet.rows }, (_, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = Array.from({ length: sheet.cols }, (_, column) => {
        const key = `${columnLetter(column)}${rowNumber}`;
        return `<td data-sheet-cell="${key}"${editable ? ` contenteditable="true"` : ""}>${sheet.cells[key] || ""}</td>`;
      }).join("");
      return `<tr><th>${rowNumber}</th>${cells}</tr>`;
    }).join("");
    return `
      <div class="notes-excel-editor" data-sheet-rows="${sheet.rows}" data-sheet-cols="${sheet.cols}">
        <header class="notes-excel-editor-head">
          <div><h2>${escapeHtml(note.documentName || note.title || "DOKUMENT")}</h2><p>Materialet e vjetra shfaqen majtas; template-i ri ndërtohet djathtas.</p></div>
          <div class="notes-excel-head-actions">
            ${editable ? `<button data-action="sheet-add-row" type="button">+ SHTO RRESHT</button><button data-action="sheet-add-column" type="button">+ SHTO KOLONË</button><button class="danger" data-action="sheet-clear" type="button">PASTRO TEMPLATE</button><button class="success" data-action="save-document-preview" data-id="${note.id}" type="button">RUAJ DOKUMENTIN</button>` : ""}
            <button class="primary" data-action="close-document-preview" type="button">MBYLL</button>
          </div>
        </header>
        <div class="notes-excel-formatbar">
          ${editable ? `<button data-sheet-command="bold" type="button"><strong>B</strong></button><button data-sheet-command="italic" type="button"><em>I</em></button><button data-sheet-command="underline" type="button"><u>U</u></button><button data-sheet-command="justifyLeft" type="button">Majtas</button><button data-sheet-command="justifyCenter" type="button">Qendër</button><button data-sheet-command="justifyRight" type="button">Djathtas</button>` : ""}
          <span>${editable ? "Kliko në një qelizë dhe shkruaj direkt." : "Preview only"}</span>
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
    const editable = canManageDocuments();
    const type = note.documentType || "word";
    if (type === "excel") {
      return `<div class="notes-modal-backdrop notes-document-preview-backdrop"><section class="notes-modal notes-document-preview-modal notes-excel-fullscreen" role="dialog" aria-modal="true">${excelPreviewHtml(note, editable)}</section></div>`;
    }
    const content = note.documentContent || note.description || "<p></p>";
    return `<div class="notes-modal-backdrop notes-document-preview-backdrop"><section class="notes-modal notes-document-preview-modal notes-word-fullscreen" role="dialog" aria-modal="true"><header class="notes-word-editor-head"><div><span class="notes-document-kind notes-document-kind-word">WORD</span>${editable ? `<input class="notes-input notes-document-title-input" data-document-title value="${escapeHtml(note.documentName || note.title || "Dokument")}">` : `<h2>${escapeHtml(note.documentName || note.title || "Dokument")}</h2>`}</div><div>${editable ? `<button class="success" data-action="save-document-preview" data-id="${note.id}" type="button">RUAJ DOKUMENTIN</button>` : ""}<button class="primary" data-action="close-document-preview" type="button">MBYLL</button></div></header><div class="notes-word-formatbar">${editable ? `<button data-sheet-command="bold" type="button"><strong>B</strong></button><button data-sheet-command="italic" type="button"><em>I</em></button><button data-sheet-command="underline" type="button"><u>U</u></button><button data-sheet-command="justifyLeft" type="button">Majtas</button><button data-sheet-command="justifyCenter" type="button">Qendër</button><button data-sheet-command="justifyRight" type="button">Djathtas</button>` : `<span>Preview only</span>`}</div><div class="notes-word-workspace"><div id="document-preview-editor" class="notes-document-editor"${editable ? ` contenteditable="true"` : ""}>${content}</div></div></section></div>`;
  }

  function classifiedRows(notes) {
    if (!notes.length) {
      return `<tr><td colspan="${canDeleteNotes() ? 11 : 10}" class="notes-empty">Nuk ka dokumente që përputhen me kërkimin ose filtrat.</td></tr>`;
    }

    return notes.map((note, index) => {
      const attachments = Array.isArray(note.attachments) ? note.attachments : [];
      return `
        <tr data-note-row="${note.id}">
          <td class="notes-number-cell">${index + 1}</td>
          <td><button class="notes-document-link" data-action="create-document" data-id="${note.id}" type="button">${escapeHtml(note.documentName || note.title || "Pa emër")}</button></td>
          <td>${attachments.length ? attachmentChipsHtml(note) : `<span class="notes-muted-action">Pa skedarë</span>`}</td>
          <td>${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}</td>
          <td>${escapeHtml(note.department || "-")}</td>
          <td>${escapeHtml(note.client || "-")}</td>
          <td>${escapeHtml(note.platform || "-")}</td>
          <td>${escapeHtml(note.noteDate || String(note.createdAt || "").slice(0, 10) || "-")}</td>
          <td>${escapeHtml(note.filePath || "-")}</td>
          <td><button class="notes-edit-document" data-action="create-document" data-id="${note.id}" type="button">EDIT DOCUMENT</button></td>
          ${canDeleteNotes() ? `<td><button class="notes-row-delete" data-action="delete-row" data-id="${note.id}" type="button" title="Fshije dokumentin"><span aria-hidden="true">&#128465;</span></button></td>` : ""}
        </tr>`;
    }).join("");
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
    return `
      <div class="notes-classified-search">
        <label for="classified-search">Search</label>
        <input id="classified-search" class="notes-input" data-action="search" value="${escapeHtml(state.search)}" placeholder="Kërko sipas shënimit, document name, client, platformë, datë, path ose file...">
      </div>
      <div class="notes-table-wrap">
        <table class="notes-table notes-classified-table">
          <thead><tr><th>NR</th><th>Document Name</th><th>Attachments</th><th>Who</th><th>Departamenti</th><th>Client</th><th>Platform</th><th>Data</th><th>Path</th><th>Edit</th>${canDeleteNotes() ? "<th>Delete</th>" : ""}</tr></thead>
          <tbody>${classifiedRows(notes)}</tbody>
        </table>
      </div>
      <p class="notes-classified-help">Search-i lart kërkon në të gjitha të dhënat.</p>`;
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
            <div class="notes-topbar">
              <input class="notes-search" data-action="search" value="${escapeHtml(state.search)}" placeholder="Kërko shënime të klasifikuara...">
              <span class="notes-user-pill">${escapeHtml(config.currentUser)}</span>
            </div>

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
    if (!canDeleteNotes()) return;
    if (!window.confirm("A je i sigurt që dëshiron ta fshish këtë shënim?")) return;
    const note = loadNotes().find((item) => item.id === id);
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
    const type = row?.querySelector(`[data-document-type="${id}"]`)?.value || note.documentType || "word";
    const documentName = row?.querySelector('[data-note-field="documentName"]')?.value || note.documentName || note.title || "Dokument";
    const content = buildDocumentContent(note, type, row);
    saveNotes(loadNotes().map((item) => item.id === id ? { ...item, documentName, documentType: type, documentContent: content, documentContentVersion: type === "excel" ? 2 : item.documentContentVersion } : item));
    state.documentPreviewId = id;
    render(root);
  }

  function saveDocumentPreview(root, id) {
    if (!canManageDocuments()) return;
    const currentNote = loadNotes().find((note) => note.id === id);
    if (currentNote?.documentType === "excel") {
      const sheetRoot = root.querySelector("[data-sheet-rows]");
      const cells = {};
      root.querySelectorAll("[data-sheet-cell]").forEach((cell) => {
        if (cell.innerHTML.trim()) cells[cell.dataset.sheetCell] = cell.innerHTML;
      });
      saveNotes(loadNotes().map((note) => note.id === id ? {
        ...note,
        spreadsheetData: { rows: Number(sheetRoot?.dataset.sheetRows || 16), cols: Number(sheetRoot?.dataset.sheetCols || 8), cells },
        documentSaved: true,
        documentUpdatedAt: new Date().toISOString(),
        documentUpdatedBy: config.currentUser
      } : note));
      state.documentPreviewId = null;
      render(root);
      return;
    }
    const editor = root.querySelector("#document-preview-editor");
    const title = root.querySelector("[data-document-title]");
    saveNotes(loadNotes().map((note) => note.id === id ? {
      ...note,
      documentName: title?.value.trim() || note.documentName || note.title || "Dokument",
      documentContent: editor?.innerHTML || note.documentContent || note.description || "",
      documentSaved: true,
      documentUpdatedAt: new Date().toISOString(),
      documentUpdatedBy: config.currentUser
    } : note));
    state.documentPreviewId = null;
    render(root);
  }

  function resizeSpreadsheet(root, rowDelta, columnDelta) {
    if (!canManageDocuments() || !state.documentPreviewId) return;
    const note = loadNotes().find((item) => item.id === state.documentPreviewId);
    if (!note) return;
    const sheetRoot = root.querySelector("[data-sheet-rows]");
    const cells = {};
    root.querySelectorAll("[data-sheet-cell]").forEach((cell) => {
      if (cell.innerHTML.trim()) cells[cell.dataset.sheetCell] = cell.innerHTML;
    });
    const spreadsheetData = { rows: Math.max(1, Number(sheetRoot?.dataset.sheetRows || 16) + rowDelta), cols: Math.min(26, Math.max(1, Number(sheetRoot?.dataset.sheetCols || 8) + columnDelta)), cells };
    saveNotes(loadNotes().map((item) => item.id === note.id ? { ...item, spreadsheetData } : item));
    render(root);
  }

  function clearSpreadsheet(root) {
    if (!canManageDocuments() || !state.documentPreviewId || !window.confirm("Ta pastroj template-in?")) return;
    const sheetRoot = root.querySelector("[data-sheet-rows]");
    saveNotes(loadNotes().map((note) => note.id === state.documentPreviewId ? { ...note, spreadsheetData: { rows: Number(sheetRoot?.dataset.sheetRows || 16), cols: Number(sheetRoot?.dataset.sheetCols || 8), cells: {} } } : note));
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
  function bind(root) {
    root.addEventListener("click", (event) => {
      const sheetCommand = event.target.closest("[data-sheet-command]");
      if (sheetCommand && canManageDocuments()) {
        document.execCommand(sheetCommand.dataset.sheetCommand, false, null);
        return;
      }
      const categoryButton = event.target.closest('[data-action="category"]');
      if (categoryButton) {
        state.activeCategory = categoryButton.dataset.category;
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
      if (action.dataset.action === "sheet-add-row") resizeSpreadsheet(root, 1, 0);
      if (action.dataset.action === "sheet-add-column") resizeSpreadsheet(root, 0, 1);
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
      state.search = event.target.value;
      state.editingId = null;
      render(root);
    });

    root.addEventListener("change", (event) => {
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

    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) render(root);
    });

    window.addEventListener("hashchange", () => {
      const hashCategory = decodeURIComponent(window.location.hash.replace("#", ""));
      if ([unclassifiedCategory, ...config.categories].includes(hashCategory)) {
        state.activeCategory = hashCategory;
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
