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
    categories: ["30_TRAJNIME", "40_DEFINIME", "50_RREGULLORE"],
    ...(window.PrimeFlowKlasifikimetConfig || {})
  };
  config.categories = config.categories.map(normalizeCategory);

  const state = {
    activeCategory: [unclassifiedCategory, ...config.categories].includes(decodeURIComponent(window.location.hash.replace("#", ""))) ? decodeURIComponent(window.location.hash.replace("#", "")) : unclassifiedCategory,
    status: "All",
    search: "",
    editingId: null,
    questionType: "All",
    questionModalId: null
  };

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
      const categoryMatch = category === unclassifiedCategory ? !note.category : note.category === category;
      const statusMatch = state.status === "All" || note.status === state.status;
      const searchTarget = `${note.title} ${stripHtml(note.description)} ${note.createdBy || note.fromWho} ${note.discussed} ${note.category} ${note.questionType} ${note.questionText} ${JSON.stringify(note.questionAnswers || {})} ${JSON.stringify(note.questionAnswerEditors || {})} ${note.projectName} ${note.department} ${note.client} ${note.documentName} ${note.platform} ${note.filePath}`.toLowerCase();
      const searchMatch = !search || searchTarget.includes(search);
      const questionTypeMatch = category !== "Pyetje" || state.questionType === "All" || (note.questionType || "") === state.questionType;
      return categoryMatch && statusMatch && searchMatch && questionTypeMatch;
    });
  }

  function countFor(category) {
    return loadNotes().filter((note) => category === unclassifiedCategory ? !note.category : note.category === category).length;
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

  function rows(notes) {
    if (!notes.length) {
      return `<tr><td colspan="14" class="notes-empty">Nuk ka shënime në këtë klasifikim.</td></tr>`;
    }

    return notes.map((note, index) => {
      const isEditing = state.editingId === note.id;
      const noteCell = isEditing
        ? `<div class="notes-editor notes-editor-small" id="edit-description-${note.id}" contenteditable="true">${note.description || ""}</div>`
        : `<div class="notes-note-stack"><div class="notes-description">${note.description || ""}</div><span class="notes-initials-dot" title="Last edit: ${escapeHtml(note.updatedBy || note.createdBy || note.fromWho || "-")}">${escapeHtml(initialsFor(note.updatedBy || note.createdBy || note.fromWho))}</span></div>`;
      const discussedCell = isEditing
        ? `<select class="notes-select notes-cell-select" data-edit-field="discussed" data-id="${note.id}"><option value="No"${(note.discussed || "No") === "No" ? " selected" : ""}>No</option><option value="Yes"${note.discussed === "Yes" ? " selected" : ""}>Yes</option></select>`
        : escapeHtml(note.discussed || "No");
      const categoryCell = isEditing
        ? `<select class="notes-select notes-cell-select" data-edit-field="category" data-id="${note.id}">${categoryOptions(note.category || "")}</select>`
        : escapeHtml(note.category || "-");
      const isQuestionView = state.activeCategory === "Pyetje";
      const questionOpenCell = note.questionType
        ? `<button class="notes-mini-button" data-action="open-question-modal" data-id="${note.id}" type="button">Open</button>`
        : `<span class="notes-muted-action">Zgjidh llojin</span>`;
      const statusCell = isEditing
        ? `<select class="notes-select notes-cell-select" data-edit-field="status" data-id="${note.id}"><option value="Open"${note.status === "Open" ? " selected" : ""}>Open</option><option value="Closed"${note.status === "Closed" ? " selected" : ""}>Closed</option></select>`
        : `<span class="notes-badge ${note.status === "Open" ? "notes-badge-open" : "notes-badge-closed"}">${escapeHtml(note.status)}</span>`;

      return `
        <tr>
          <td>${index + 1}</td>
          <td class="notes-name-cell">${noteCell}</td>
          ${isQuestionView ? `<td>${questionOpenCell}</td>` : `<td>${discussedCell}</td>`}
          <td><span class="notes-badge">${escapeHtml(note.createdBy || note.fromWho || "-")}</span></td>
          <td>${categoryCell}</td>
          <td>${isEditing ? textInput(note, "projectName", "Project") : escapeHtml(note.projectName || "-")}</td>
          <td>${isEditing ? textInput(note, "department", "Department") : escapeHtml(note.department || "-")}</td>
          <td>${isEditing ? textInput(note, "client", "Client") : escapeHtml(note.client || "-")}</td>
          <td>${isEditing ? textInput(note, "documentName", "Document") : escapeHtml(note.documentName || "-")}</td>
          <td>${isEditing ? textInput(note, "platform", "Platform") : escapeHtml(note.platform || "-")}</td>
          <td class="notes-path-cell">${isEditing ? textInput(note, "filePath", "Files path", "notes-path-input") : escapeHtml(note.filePath || "-")}</td>
          <td>${formatDate(note.createdAt)}</td>
          <td>${statusCell}</td>
          <td><div class="notes-row-actions">
            ${isEditing
              ? `<button class="notes-mini-button" data-action="save-edit" data-id="${note.id}">Save</button><button class="notes-mini-button" data-action="cancel-edit">Cancel</button>`
              : `<button class="notes-mini-button" data-action="edit" data-id="${note.id}">Edit</button>`}
          </div></td>
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

            <div class="notes-table-wrap">
              <table class="notes-table notes-table-clean notes-category-table">
                <thead>
                  <tr>
                    <th>NR</th>
                    <th>Shënimi</th>
                    <th>Diskutuar</th>
                    <th>Nga kush</th>
                    <th>Save as</th>
                    <th>Projekti</th>
                    <th>Department</th>
                    <th>Client</th>
                    <th>Dokumenti</th>
                    <th>Platforma</th>
                    <th>Files path</th>
                    <th>Data, Ora</th>
                    <th>Status</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>${rows(activeNotes)}</tbody>
              </table>
            </div>
            </section>
          </div>
        </div>
      </section>
      ${questionModalHtml()}
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

    root.addEventListener("input", (event) => {
      if (event.target.dataset.action !== "search") return;
      state.search = event.target.value;
      state.editingId = null;
      render(root);
    });

    root.addEventListener("change", (event) => {
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
