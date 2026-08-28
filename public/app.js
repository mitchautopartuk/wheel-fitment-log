(() => {
  "use strict";

  const CATALOGUE_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSnZzaNV_jviu487SIkYz6n3cLQxiEVF87iLnuNfPAR--NgDI0TUhTo4WfHXVCgifTg_KuSr-IB7oXS/pub?output=csv";
  const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // re-fetch catalogue every 5 min
  const SUBMIT_ENDPOINT = "/api/submit";
  const MAX_SUGGESTIONS = 8;

  // ---------- DOM ----------
  const els = {
    banner: document.getElementById("status-banner"),
    form: document.getElementById("fitment-form"),
    country: document.getElementById("country"),
    countrySuggestions: document.getElementById("country-suggestions"),
    countryQuick: document.getElementById("country-quick"),
    manufacturer: document.getElementById("manufacturer"),
    manufacturerSuggestions: document.getElementById("manufacturer-suggestions"),
    manufacturerQuick: document.getElementById("manufacturer-quick"),
    model: document.getElementById("model"),
    modelSuggestions: document.getElementById("model-suggestions"),
    modelQuick: document.getElementById("model-quick"),
    year: document.getElementById("year"),
    yearSuggestions: document.getElementById("year-suggestions"),
    yearQuick: document.getElementById("year-quick"),
    wheelBrandQuick: document.getElementById("wheel-brand-quick"),
    design: document.getElementById("design"),
    designSuggestions: document.getElementById("design-suggestions"),
    designQuick: document.getElementById("design-quick"),
    photoPreview: document.getElementById("photo-preview"),
    designPhoto: document.getElementById("design-photo"),
    photoLightbox: document.getElementById("photo-lightbox"),
    designPhotoLarge: document.getElementById("design-photo-large"),
    size: document.getElementById("size"),
    sizeSuggestions: document.getElementById("size-suggestions"),
    sizeQuick: document.getElementById("size-quick"),
    colour: document.getElementById("colour"),
    colourSuggestions: document.getElementById("colour-suggestions"),
    colourQuick: document.getElementById("colour-quick"),
    staggered: document.getElementById("staggered"),
    stockcodeField: document.getElementById("stockcode-field"),
    stockcodeValue: document.getElementById("stockcode-value"),
    submitBtn: document.getElementById("submit-btn"),
    clearBtn: document.getElementById("clear-btn"),
    loggerBadge: document.getElementById("logger-badge"),
    loggerNameDisplay: document.getElementById("logger-name-display"),
    loggerChangeBtn: document.getElementById("logger-change-btn"),
    nameModal: document.getElementById("name-modal"),
    loggerNameInput: document.getElementById("logger-name-input"),
    loggerNameSave: document.getElementById("logger-name-save"),
    loggerNameCancel: document.getElementById("logger-name-cancel"),
    recentToggleBtn: document.getElementById("recent-toggle-btn"),
    recentPanel: document.getElementById("recent-panel"),
    recentLoading: document.getElementById("recent-loading"),
    recentEmpty: document.getElementById("recent-empty"),
    recentError: document.getElementById("recent-error"),
    recentList: document.getElementById("recent-list"),
  };

  const LOGGER_STORAGE_KEY = "fitment_logger_name";

  let manufacturerData = {};
  let countries = [];
  let validYears = [];
  let catalogueRows = []; // parsed CSV rows as objects
  let currentSelection = { brand: null, design: null, sizeKey: null, colour: null };

  // ---------- CSV parsing (handles quoted fields with embedded commas) ----------
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n" || c === "\r") {
          if (c === "\r" && text[i + 1] === "\n") i++;
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += c;
        }
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
      return obj;
    });
  }

  // ---------- Data loading ----------
  async function loadCatalogue() {
    try {
      const res = await fetch(CATALOGUE_CSV_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const objs = rowsToObjects(parseCSV(text));
      catalogueRows = objs.filter((r) => r.BRAND && r.DESIGN);
      populateWheelBrands();
      hideBanner();
    } catch (err) {
      showBanner("Couldn't load the wheel catalogue. Check your connection and reload.", "err");
      console.error("Catalogue load failed:", err);
    }
  }

  function refreshManufacturerQuick() {
    renderQuickOptions(els.manufacturerQuick, Object.keys(manufacturerData).sort(), els.manufacturer.value.trim(), (v) => {
      els.manufacturer.value = v;
      onManufacturerChanged();
    });
  }

  async function loadManufacturers() {
    const res = await fetch("data/manufacturers.json");
    manufacturerData = await res.json();
    refreshManufacturerQuick();
  }

  function refreshCountryQuick() {
    renderQuickOptions(els.countryQuick, countries, els.country.value.trim(), (v) => {
      els.country.value = v;
      refreshCountryQuick();
    });
  }

  async function loadCountries() {
    const res = await fetch("data/countries.json");
    countries = await res.json();
    refreshCountryQuick();
  }

  function refreshYearQuick() {
    renderQuickOptions(els.yearQuick, validYears, els.year.value.trim(), (v) => {
      els.year.value = v;
      refreshYearQuick();
    });
  }

  function populateYears() {
    const currentYear = new Date().getFullYear();
    validYears = [];
    for (let y = currentYear + 1; y >= currentYear - 29; y--) {
      validYears.push(String(y));
    }
    refreshYearQuick();
  }

  // ---------- Helpers ----------
  function sizeKey(row) {
    return `${row.WIDTH}x${row.DIAMETER}`;
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  // Shows a row of click-to-pick buttons under a field when it has a small
  // number of valid options (2–4) — handy for anyone who'd rather click
  // than type. Hidden whenever there are none, exactly one (already
  // auto-filled), or too many to usefully show as buttons. Whichever
  // button matches the field's current value is shown filled in, so it's
  // obvious at a glance what's selected.
  function renderQuickOptions(containerEl, options, currentValue, onPick) {
    containerEl.innerHTML = "";
    if (options.length > 1 && options.length <= 4) {
      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quick-option" + (opt === currentValue ? " active" : "");
        btn.textContent = opt;
        btn.addEventListener("click", () => onPick(opt));
        containerEl.appendChild(btn);
      });
      containerEl.classList.remove("hidden");
    } else {
      containerEl.classList.add("hidden");
    }
  }

  function showBanner(msg, kind) {
    els.banner.textContent = msg;
    els.banner.className = "banner " + kind;
  }
  function hideBanner() {
    els.banner.className = "banner hidden";
  }

  // ---------- Combobox (Country / Manufacturer / Model) ----------
  // Custom autocomplete: filters as you type, and lets Tab or Enter accept
  // the highlighted suggestion (native <datalist> doesn't support that).
  // Free text is always allowed — nothing forces a match from the list.
  function createCombobox(inputEl, listEl, getOptions, onChange) {
    let items = [];
    let activeIndex = -1;

    function filterOptions(query) {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const starts = [];
      const contains = [];
      for (const opt of getOptions()) {
        const lower = opt.toLowerCase();
        if (lower.startsWith(q)) starts.push(opt);
        else if (lower.includes(q)) contains.push(opt);
      }
      return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
    }

    function draw() {
      listEl.innerHTML = "";
      items.forEach((item, i) => {
        const li = document.createElement("li");
        li.textContent = item;
        li.setAttribute("role", "option");
        if (i === activeIndex) li.classList.add("active");
        // mousedown (not click) fires before the input's blur, so the
        // selection registers before the dropdown gets closed by blur.
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
          commit(item);
        });
        listEl.appendChild(li);
      });
      if (items.length) listEl.classList.add("open");
      else listEl.classList.remove("open");
    }

    function close() {
      items = [];
      activeIndex = -1;
      listEl.classList.remove("open");
      listEl.innerHTML = "";
    }

    function commit(value) {
      inputEl.value = value;
      close();
      if (onChange) onChange(value);
    }

    inputEl.addEventListener("input", () => {
      items = filterOptions(inputEl.value);
      activeIndex = items.length ? 0 : -1;
      draw();
      if (onChange) onChange(inputEl.value);
    });

    inputEl.addEventListener("keydown", (e) => {
      if (!items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        draw();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        draw();
      } else if (e.key === "Enter") {
        if (activeIndex >= 0) {
          e.preventDefault();
          commit(items[activeIndex]);
        }
      } else if (e.key === "Tab") {
        // Don't preventDefault — let focus move on to the next field
        // naturally, we just fill the value first.
        if (activeIndex >= 0) commit(items[activeIndex]);
      } else if (e.key === "Escape") {
        close();
      }
    });

    inputEl.addEventListener("blur", () => {
      // Small delay so a suggestion's mousedown can commit first.
      setTimeout(close, 100);
    });

    // Dropdown-arrow button — lets someone browse and click the full list
    // of options instead of typing, without changing how typing itself
    // works. Same "mousedown, not click" trick as the list items so the
    // input doesn't blur (and auto-close the list) before it opens.
    const toggleBtn = inputEl.parentElement.querySelector(".combobox-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });
      toggleBtn.addEventListener("click", () => {
        if (inputEl.disabled) return;
        if (listEl.classList.contains("open")) {
          close();
          return;
        }
        items = getOptions();
        activeIndex = -1;
        draw();
      });
    }

    return { close };
  }

  // ---------- Cascading logic (wheel catalogue) ----------
  // Wheel Brand / Design / Size / Colour are typeable comboboxes, same as
  // Country/Manufacturer/Model/Year. Each stage only "commits" a value when
  // what's typed exactly matches a real catalogue option (case-insensitive)
  // — free text that doesn't match just leaves that stage (and everything
  // after it) unset, which keeps the stock-code lookup accurate. Whenever a
  // stage has exactly one possible option, it's filled in automatically so
  // you don't have to type/select something that's the only choice anyway.
  function matchExact(options, typed) {
    const t = (typed || "").trim().toLowerCase();
    if (!t) return null;
    return options.find((o) => o.toLowerCase() === t) || null;
  }

  // "Axe Forged" is a catalogue entry we never want logged here — excluded
  // from the brand list entirely so it can't be picked.
  const EXCLUDED_BRANDS = ["axe forged"];
  function brandOptions() {
    return uniqueSorted(catalogueRows.map((r) => r.BRAND)).filter(
      (b) => !EXCLUDED_BRANDS.includes(b.trim().toLowerCase())
    );
  }
  function designOptions(brand) {
    return brand ? uniqueSorted(catalogueRows.filter((r) => r.BRAND === brand).map((r) => r.DESIGN)) : [];
  }
  function sizeOptionsFor(brand, design) {
    return brand && design
      ? uniqueSorted(catalogueRows.filter((r) => r.BRAND === brand && r.DESIGN === design).map(sizeKey))
      : [];
  }
  function colourOptionsFor(brand, design, sizeK) {
    return brand && design && sizeK
      ? uniqueSorted(
          catalogueRows
            .filter((r) => r.BRAND === brand && r.DESIGN === design && sizeKey(r) === sizeK)
            .map((r) => r["COLOUR COMBINED"])
        )
      : [];
  }

  // Sets an input's disabled/placeholder state from its option list, and
  // auto-fills + returns the value when there's exactly one option.
  function applyField(inputEl, options, placeholderWhenBlocked, blocked) {
    inputEl.disabled = blocked;
    inputEl.placeholder = blocked ? placeholderWhenBlocked : "Type to search...";
    if (!blocked && options.length === 1) {
      inputEl.value = options[0];
      return options[0];
    }
    inputEl.value = "";
    return null;
  }

  // Wheel Brand is click-only now (no free text) — there's always a small,
  // fixed set of real brands, so a typeable box just adds friction.
  function renderBrandButtons() {
    const options = brandOptions();
    els.wheelBrandQuick.innerHTML = "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-option" + (currentSelection.brand === opt ? " active" : "");
      btn.textContent = opt;
      btn.addEventListener("click", () => selectBrand(opt));
      els.wheelBrandQuick.appendChild(btn);
    });
  }

  function selectBrand(brand) {
    currentSelection.brand = brand;
    renderBrandButtons();
    applyDesignStage();
  }

  function populateWheelBrands() {
    renderBrandButtons();
  }

  function showPhotoForBrandDesign() {
    const match = catalogueRows.find(
      (r) => r.BRAND === currentSelection.brand && r.DESIGN === currentSelection.design
    );
    if (match) showPhoto(match);
    else hidePhoto();
  }

  function refreshDesignQuick() {
    const options = designOptions(currentSelection.brand);
    renderQuickOptions(els.designQuick, options, currentSelection.design, (v) => {
      els.design.value = v;
      onDesignChanged();
    });
  }

  function applyDesignStage() {
    const options = designOptions(currentSelection.brand);
    currentSelection.design = applyField(els.design, options, "Choose brand first...", !currentSelection.brand);
    refreshDesignQuick();
    if (currentSelection.brand && currentSelection.design) showPhotoForBrandDesign();
    else hidePhoto();
    applySizeStage();
  }

  function onDesignChanged() {
    const options = designOptions(currentSelection.brand);
    currentSelection.design = matchExact(options, els.design.value);
    refreshDesignQuick();
    if (currentSelection.brand && currentSelection.design) showPhotoForBrandDesign();
    else hidePhoto();
    applySizeStage();
  }

  function refreshSizeQuick() {
    const ready = !!(currentSelection.brand && currentSelection.design);
    const options = ready ? sizeOptionsFor(currentSelection.brand, currentSelection.design) : [];
    renderQuickOptions(els.sizeQuick, options, currentSelection.sizeKey, (v) => {
      els.size.value = v;
      onSizeChanged();
    });
  }

  function applySizeStage() {
    const ready = !!(currentSelection.brand && currentSelection.design);
    const options = ready ? sizeOptionsFor(currentSelection.brand, currentSelection.design) : [];
    currentSelection.sizeKey = applyField(els.size, options, "Choose design first...", !ready);
    refreshSizeQuick();
    applyColourStage();
  }

  function onSizeChanged() {
    const ready = !!(currentSelection.brand && currentSelection.design);
    const options = ready ? sizeOptionsFor(currentSelection.brand, currentSelection.design) : [];
    currentSelection.sizeKey = matchExact(options, els.size.value);
    refreshSizeQuick();
    applyColourStage();
  }

  function refreshColourQuick() {
    const ready = !!(currentSelection.brand && currentSelection.design && currentSelection.sizeKey);
    const options = ready
      ? colourOptionsFor(currentSelection.brand, currentSelection.design, currentSelection.sizeKey)
      : [];
    renderQuickOptions(els.colourQuick, options, currentSelection.colour, (v) => {
      els.colour.value = v;
      onColourChanged();
    });
  }

  function applyColourStage() {
    const ready = !!(currentSelection.brand && currentSelection.design && currentSelection.sizeKey);
    const options = ready
      ? colourOptionsFor(currentSelection.brand, currentSelection.design, currentSelection.sizeKey)
      : [];
    currentSelection.colour = applyField(els.colour, options, "Choose size first...", !ready);
    refreshColourQuick();
    updateStockcode();
  }

  function onColourChanged() {
    const ready = !!(currentSelection.brand && currentSelection.design && currentSelection.sizeKey);
    const options = ready
      ? colourOptionsFor(currentSelection.brand, currentSelection.design, currentSelection.sizeKey)
      : [];
    currentSelection.colour = matchExact(options, els.colour.value);
    refreshColourQuick();
    updateStockcode();
  }

  function findMatchingRow() {
    return catalogueRows.find(
      (r) =>
        r.BRAND === currentSelection.brand &&
        r.DESIGN === currentSelection.design &&
        sizeKey(r) === currentSelection.sizeKey &&
        (r["COLOUR COMBINED"] || "") === currentSelection.colour
    );
  }

  function updateStockcode() {
    const row = findMatchingRow();
    if (row) {
      els.stockcodeValue.textContent = row["STOCK CODE"] || "—";
      els.stockcodeField.classList.remove("hidden");
      showPhoto(row);
    } else {
      els.stockcodeField.classList.add("hidden");
    }
  }

  function showPhoto(row) {
    const url = row && row.IMG;
    if (url) {
      els.designPhoto.src = url;
      els.photoPreview.classList.remove("hidden");
    } else {
      hidePhoto();
    }
  }
  function hidePhoto() {
    els.photoPreview.classList.add("hidden");
    els.designPhoto.src = "";
    closeLightbox();
  }

  function openLightbox() {
    if (!els.designPhoto.src) return;
    els.designPhotoLarge.src = els.designPhoto.src;
    els.photoLightbox.classList.remove("hidden");
  }
  function closeLightbox() {
    els.photoLightbox.classList.add("hidden");
    els.designPhotoLarge.src = "";
  }

  // ---------- Who's logging (one-time per device, via localStorage) ----------
  // Everyone shares the same login, so there's no per-user identity from
  // the server — this is what lets a submission be tagged with who
  // actually made it. Stored locally, not asked again unless changed.
  function getLoggerName() {
    try {
      return localStorage.getItem(LOGGER_STORAGE_KEY) || "";
    } catch (err) {
      return ""; // localStorage can throw in locked-down/private contexts
    }
  }

  function setLoggerName(name) {
    try {
      localStorage.setItem(LOGGER_STORAGE_KEY, name);
    } catch (err) {
      console.warn("Couldn't save logger name locally:", err);
    }
  }

  function updateLoggerBadge() {
    const name = getLoggerName();
    els.loggerNameDisplay.textContent = name;
    els.loggerBadge.classList.toggle("hidden", !name);
  }

  // ---------- Recent uploads (read back from the sheet, on demand) ----------
  // Lets someone check the last few things THEY logged, straight from the
  // real sheet, in case they've forgotten or aren't sure it went through.
  function formatRecentTime(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString || "";
    return d.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderRecentUploads(entries) {
    els.recentList.innerHTML = "";
    entries.forEach((row) => {
      const li = document.createElement("li");
      const vehicleBits = [row.manufacturer, row.model, row.year].filter(Boolean).join(" ");
      const wheelBits = [row.brand, row.design, row.size, row.colour].filter(Boolean).join(" · ");
      li.innerHTML =
        `<div class="recent-vehicle"></div>` +
        `<div class="recent-wheel"></div>` +
        `<div class="recent-time"></div>`;
      li.querySelector(".recent-vehicle").textContent = vehicleBits || "(vehicle not recorded)";
      li.querySelector(".recent-wheel").textContent = wheelBits || "(wheel not recorded)";
      li.querySelector(".recent-time").textContent = formatRecentTime(row.timestamp);
      els.recentList.appendChild(li);
    });
  }

  async function loadRecentUploads() {
    els.recentLoading.classList.remove("hidden");
    els.recentEmpty.classList.add("hidden");
    els.recentError.classList.add("hidden");
    els.recentList.classList.add("hidden");

    const name = getLoggerName();
    if (!name) {
      els.recentLoading.classList.add("hidden");
      els.recentError.classList.remove("hidden");
      return;
    }

    try {
      const res = await fetch("/api/recent?name=" + encodeURIComponent(name));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");

      els.recentLoading.classList.add("hidden");
      const entries = data.recent || [];
      if (!entries.length) {
        els.recentEmpty.classList.remove("hidden");
      } else {
        renderRecentUploads(entries);
        els.recentList.classList.remove("hidden");
      }
    } catch (err) {
      console.warn("Couldn't load recent uploads:", err);
      els.recentLoading.classList.add("hidden");
      els.recentError.classList.remove("hidden");
    }
  }

  function openRecentPanel() {
    els.recentPanel.classList.remove("hidden");
    loadRecentUploads();
  }

  function closeRecentPanel() {
    els.recentPanel.classList.add("hidden");
  }

  function toggleRecentPanel() {
    if (els.recentPanel.classList.contains("hidden")) {
      openRecentPanel();
    } else {
      closeRecentPanel();
    }
  }

  function openNameModal(prefill) {
    els.loggerNameInput.value = prefill || "";
    els.loggerNameCancel.classList.toggle("hidden", !prefill);
    els.nameModal.classList.remove("hidden");
    els.loggerNameInput.focus();
  }

  function closeNameModal() {
    els.nameModal.classList.add("hidden");
  }

  function saveLoggerName() {
    const name = els.loggerNameInput.value.trim();
    if (!name) {
      els.loggerNameInput.focus();
      return;
    }
    setLoggerName(name);
    updateLoggerBadge();
    closeNameModal();
  }

  // ---------- Submit ----------
  async function onSubmit(e) {
    e.preventDefault();
    hideBanner();

    if (!els.form.reportValidity()) return;

    if (!validYears.includes(els.year.value.trim())) {
      showBanner("Please enter a valid year (e.g. " + validYears[1] + ").", "err");
      els.year.focus();
      return;
    }

    if (!currentSelection.brand || !currentSelection.design || !currentSelection.sizeKey || !currentSelection.colour) {
      showBanner("Please pick a wheel brand, design, size, and colour/finish.", "err");
      return;
    }

    const row = findMatchingRow();
    const payload = {
      country: els.country.value.trim(),
      manufacturer: els.manufacturer.value.trim(),
      model: els.model.value.trim(),
      year: els.year.value,
      brand: currentSelection.brand,
      design: currentSelection.design,
      size: currentSelection.sizeKey,
      colour: currentSelection.colour,
      staggered: els.staggered.checked ? "Yes" : "No",
      stockcode: row ? row["STOCK CODE"] : "",
      loggedBy: getLoggerName(),
    };

    els.submitBtn.disabled = true;
    els.submitBtn.textContent = "Logging...";

    try {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "HTTP " + res.status);
      }
      showBanner("Logged! Ready for the next one.", "ok");
      resetForm();
    } catch (err) {
      showBanner("Couldn't save that submission: " + err.message, "err");
      console.error("Submit failed:", err);
    } finally {
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = "Log this fitment";
    }
  }

  function resetForm() {
    els.form.reset();

    // Model's quick-pick buttons depend on Manufacturer, which just got
    // cleared — refresh via the same handler used when it's typed/clicked.
    onManufacturerChanged();

    // Clear the brand selection and let the cascade recompute everything
    // downstream (clearing values, disabling fields, hiding/un-highlighting
    // quick-pick buttons) from a clean brand = null.
    currentSelection = { brand: null, design: null, sizeKey: null, colour: null };
    renderBrandButtons();
    applyDesignStage();

    els.stockcodeField.classList.add("hidden");
    hidePhoto();
    hideBanner();
  }

  // ---------- Init ----------
  function refreshModelQuick() {
    const name = els.manufacturer.value.trim();
    const options = manufacturerData[name] || [];
    renderQuickOptions(els.modelQuick, options, els.model.value.trim(), (v) => {
      els.model.value = v;
      refreshModelQuick();
    });
  }

  function onManufacturerChanged() {
    // Manufacturer changed (typed, selected, or clicked) — reset Model and
    // update its placeholder + quick-pick buttons.
    els.model.value = "";
    const name = els.manufacturer.value.trim();
    const known = !!manufacturerData[name];
    els.model.placeholder = known ? "Type to search..." : (name ? "Type model (free text)" : "Choose manufacturer first...");
    refreshManufacturerQuick();
    refreshModelQuick();
  }

  function setUpCombobox() {
    createCombobox(els.country, els.countrySuggestions, () => countries, () => refreshCountryQuick());
    // Country defaults to "United Kingdom" — select the text on focus so
    // the other ~10% of entries can just start typing to replace it.
    els.country.addEventListener("focus", () => els.country.select());
    createCombobox(els.year, els.yearSuggestions, () => validYears, () => refreshYearQuick());

    createCombobox(els.manufacturer, els.manufacturerSuggestions, () => Object.keys(manufacturerData).sort(), onManufacturerChanged);

    createCombobox(els.model, els.modelSuggestions, () => {
      const name = els.manufacturer.value.trim();
      return manufacturerData[name] || [];
    }, () => refreshModelQuick());

    createCombobox(els.design, els.designSuggestions, () => designOptions(currentSelection.brand), onDesignChanged);
    createCombobox(els.size, els.sizeSuggestions, () => sizeOptionsFor(currentSelection.brand, currentSelection.design), onSizeChanged);
    createCombobox(
      els.colour,
      els.colourSuggestions,
      () => colourOptionsFor(currentSelection.brand, currentSelection.design, currentSelection.sizeKey),
      onColourChanged
    );
  }

  function bindEvents() {
    els.form.addEventListener("submit", onSubmit);
    els.clearBtn.addEventListener("click", resetForm);
    els.photoPreview.addEventListener("click", openLightbox);
    els.photoLightbox.addEventListener("click", closeLightbox);

    els.loggerChangeBtn.addEventListener("click", () => {
      closeRecentPanel();
      openNameModal(getLoggerName());
    });
    els.loggerNameSave.addEventListener("click", saveLoggerName);
    els.loggerNameCancel.addEventListener("click", closeNameModal);
    els.loggerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveLoggerName();
      }
    });

    els.recentToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRecentPanel();
    });
    // Click anywhere outside the panel closes it.
    document.addEventListener("click", (e) => {
      if (!els.recentPanel.classList.contains("hidden") && !els.recentPanel.contains(e.target)) {
        closeRecentPanel();
      }
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.warn("Service worker registration failed (app still works, just not installable):", err);
      });
    }
  }

  async function init() {
    bindEvents();
    setUpCombobox();
    populateYears();
    registerServiceWorker();

    if (getLoggerName()) {
      updateLoggerBadge();
    } else {
      openNameModal();
    }

    await Promise.all([loadCountries(), loadManufacturers(), loadCatalogue()]);
    setInterval(loadCatalogue, REFRESH_INTERVAL_MS);
  }

  init();
})();
