// ========================================
// PUJO MAP — VERSION 0.6
//
// Data source: merged_puja_dataset.xlsx (rich schema — 39 columns).
// Only a handful of those columns are user-facing; see
// normalizePandal() below for exactly which ones and why.
//
// Location confidence (derived from the "Confidence" column) drives
// both the map markers and the list badges:
//   high         → shown on map, green check
//   medium       → shown on map, blue ≈
//   unconfirmed  → list only, amber clock
//   low          → list only, vermillion warning triangle
//   unlocated    → list only (no coordinates at all), grey "?"
//
// Only high/medium confidence pandals become map markers — the rest
// have either no coordinate or one we don't trust yet, and plotting
// ~380 markers was the main source of the lag this version fixes.
// ========================================


// ----------------------------------------
// 1. MAP
// ----------------------------------------

const map = L.map("map").setView(
    [22.5726, 88.3639],
    12
);


L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// ----------------------------------------
// 2. LOCATION CONFIDENCE
// Single source of truth for label/icon/which-tiers-map, used by
// the marker icons, the popup/list badge, and the list dots.
// ----------------------------------------

const CONFIDENCE_META = {
    high: {
        label: "High Confidence",
        icon: `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    medium: {
        label: "Medium Confidence",
        icon: `<svg viewBox="0 0 16 16" fill="none"><path d="M2.3 8C3.3 6.2 4.8 6.2 5.8 8C6.8 9.8 8.3 9.8 9.3 8C10.3 6.2 11.8 6.2 12.8 8" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`
    },
    unconfirmed: {
        label: "Unconfirmed",
        icon: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.3" stroke="white" stroke-width="1.4"/><path d="M8 5.2V8.2L10.1 9.9" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    low: {
        label: "Low Confidence",
        icon: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2.3L14.3 13.2H1.7L8 2.3Z" stroke="white" stroke-width="1.4" stroke-linejoin="round"/><line x1="8" y1="6.6" x2="8" y2="9.5" stroke="white" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.1" r="0.85" fill="white"/></svg>`
    },
    unlocated: {
        label: "Not Located Yet",
        icon: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.4" stroke="white" stroke-width="1.4"/><path d="M6.2 6.3C6.2 5.2 7 4.5 8 4.5C9 4.5 9.8 5.1 9.8 6C9.8 6.9 9 7.1 8.4 7.6C8.1 7.9 8 8.2 8 8.7" stroke="white" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="10.8" r="0.75" fill="white"/></svg>`
    }
};

// Anything shown on the map at all comes from this list.
const MAP_VISIBLE_CONFIDENCE = ["high", "medium"];

function confidenceKey(raw) {

    const value =
        String(raw || "")
            .trim()
            .toLowerCase();

    if (value === "high") return "high";
    if (value === "medium") return "medium";
    if (value === "low") return "low";
    if (value.startsWith("unconfirmed")) return "unconfirmed";

    return "unlocated";
}


// ----------------------------------------
// 3. MARKER ICON
// ----------------------------------------

function pandalIcon(confidence, inPlan) {

    const meta =
        CONFIDENCE_META[confidence] ||
        CONFIDENCE_META.unlocated;

    const size =
        inPlan ? 26 : 20;

    return L.divIcon({
        className: "pandal-marker-wrap",
        html: `
            <div class="pandal-marker confidence-${confidence}${inPlan ? " in-plan" : ""}">
                ${meta.icon}
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2)]
    });
}


// ----------------------------------------
// 4. APPLICATION STATE
// ----------------------------------------

let pandals = [];       // every row from the sheet, normalized

let markers = [];        // Leaflet markers — high/medium confidence only

let plan = [];

let routeLayer = null;

let draggedPlanIndex = null;

let viewMode = "map";    // "map" | "list"


// ----------------------------------------
// 5. LOAD / SAVE PLAN
// ----------------------------------------

function loadSavedPlan() {

    const savedPlan =
        localStorage.getItem("pujoPlan");

    if (!savedPlan) {
        plan = [];
        return;
    }

    try {

        plan = JSON.parse(savedPlan);

    } catch (error) {

        console.error(
            "Could not load saved plan:",
            error
        );

        plan = [];
    }
}

function savePlan() {

    localStorage.setItem(
        "pujoPlan",
        JSON.stringify(plan)
    );

    updatePlanUI();
}


// ----------------------------------------
// 6. NORMALIZE A RAW ROW
// The sheet has 39 columns; most are data-provenance internals
// (D1/D2 match method, match score, distance-between-sources, etc.)
// that are genuinely useful for your own auditing but not for a
// visitor deciding where to go. Only the columns below make it in.
// ----------------------------------------

function normalizePandal(raw) {

    const lat =
        Number(raw["Best Latitude"]);

    const lng =
        Number(raw["Best Longitude"]);

    const hasCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lng);

    const name =
        String(raw["Name of the Puja"] || "").trim() ||
        "Unnamed Puja";

    const club =
        String(raw["Name of the Club"] || "").trim();

    return {
        id: String(raw["Puja Code #"] || "").trim(),
        name,
        club: club.toLowerCase() === name.toLowerCase() ? "" : club,
        zone: String(raw["Zone"] || "").trim(),
        address: String(raw["Address"] || "").trim(),
        landmark: String(raw["Landmark"] || "").trim(),
        city: String(raw["City"] || "").trim(),
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        hasCoords,
        confidence: confidenceKey(raw["Confidence"])
    };
}


// ----------------------------------------
// 7. LOAD EXCEL
// ----------------------------------------

async function loadPandals() {

    try {

        const response = await fetch(
            "data/pandals.xlsx?v=" + Date.now()
        );

        if (!response.ok) {
            throw new Error(
                "Could not load pandals.xlsx"
            );
        }

        const fileData =
            await response.arrayBuffer();

        const workbook =
            XLSX.read(
                fileData,
                {
                    type: "array"
                }
            );

        const sheetName =
            workbook.SheetNames[0];

        const sheet =
            workbook.Sheets[sheetName];

        const rawRows =
            XLSX.utils.sheet_to_json(sheet);

        pandals =
            rawRows
                .map(normalizePandal)
                .filter(pandal => pandal.id);


        console.log(
            "TOTAL PANDALS:",
            pandals.length
        );


        displayPandals(pandals);

        updatePlanUI();

    } catch (error) {

        console.error(error);

        document.getElementById(
            "pandal-count"
        ).textContent =
            "Could not load data";
    }
}


// ----------------------------------------
// 8. DISPLAY PANDALS ON THE MAP
// Only high/medium confidence, coordinate-bearing pandals become
// markers — everything else is list-only (see renderListView).
// ----------------------------------------

function displayPandals(data) {

    markers.forEach(marker => {
        map.removeLayer(marker);
    });

    markers = [];


    const mapEligible =
        data.filter(
            pandal =>
                pandal.hasCoords &&
                MAP_VISIBLE_CONFIDENCE.includes(pandal.confidence)
        );


    mapEligible.forEach(pandal => {

        const marker =
            L.marker(
                [pandal.lat, pandal.lng],
                {
                    icon: pandalIcon(
                        pandal.confidence,
                        isInPlan(pandal)
                    )
                }
            );


        marker.pandalData = pandal;


        marker.bindPopup(
            createPandalPopup(pandal)
        );


        marker.addTo(map);


        markers.push(marker);

    });


    document.getElementById(
        "pandal-count"
    ).textContent =
        `${mapEligible.length} on map (${data.length} total)`;


    console.log(
        "Markers created:",
        markers.length
    );


    setTimeout(() => {
        map.invalidateSize();
    }, 100);
}


// ----------------------------------------
// 9. PANDAL CARD
// Shared content for both the map popup and the list's expanded
// detail — one template, so the two views can never drift apart.
// ----------------------------------------

function pandalCard(pandal) {

    const name =
        escapeHTML(pandal.name);

    const club =
        pandal.club ?
            escapeHTML(pandal.club) :
            "";

    const address =
        escapeHTML(
            pandal.address ||
            "Address unavailable"
        );

    const landmark =
        pandal.landmark ?
            escapeHTML(pandal.landmark) :
            "";

    const zone =
        pandal.zone ?
            escapeHTML(pandal.zone) :
            "";

    const meta =
        CONFIDENCE_META[pandal.confidence] ||
        CONFIDENCE_META.unlocated;

    const mapsUrl =
        pandal.hasCoords
            ? `https://www.google.com/maps/dir/?api=1&destination=${pandal.lat},${pandal.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pandal.address || pandal.name)}`;

    const mapsLabel =
        pandal.hasCoords ? "Navigate" : "Find on Maps";

    const alreadyAdded =
        isInPlan(pandal);

    const addButtonText =
        alreadyAdded
            ? "\u2713 In My Plan"
            : "+ Add to Plan";


    return `
        <div class="pandal-card">

            <h3>${name}</h3>

            ${club ? `
                <div class="pandal-club">
                    ${club}
                </div>
            ` : ""}

            <div class="pandal-meta">

                ${zone ? `
                    <span class="zone-tag">
                        ${zone}
                    </span>
                ` : ""}

                <span class="status-badge confidence-${pandal.confidence}">
                    ${meta.icon}
                    <span>${meta.label}</span>
                </span>

            </div>

            <div class="pandal-address">
                ${address}
            </div>

            ${landmark ? `
                <div class="pandal-landmark">
                    Near ${landmark}
                </div>
            ` : ""}

            <div class="popup-buttons">

                <a
                    class="maps-button"
                    href="${mapsUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    ${mapsLabel}
                </a>

                ${pandal.hasCoords ? `
                    <button
                        class="add-plan-button"
                        onclick="togglePlan('${escapeAttribute(pandal.id)}')"
                    >
                        ${addButtonText}
                    </button>
                ` : ""}

            </div>

        </div>
    `;
}

function createPandalPopup(pandal) {
    return pandalCard(pandal);
}


// ----------------------------------------
// 10. CHECK WHETHER PANDAL IS IN PLAN
// ----------------------------------------

function isInPlan(pandal) {

    const id =
        String(pandal.id);


    return plan.some(
        item =>
            String(item.id) === id
    );
}


// ----------------------------------------
// 11. ADD / REMOVE PANDAL
// ----------------------------------------

function togglePlan(id) {

    const index =
        plan.findIndex(
            item =>
                String(item.id) ===
                String(id)
        );


    // Already in plan → remove
    if (index !== -1) {

        plan.splice(index, 1);

    }

    // Not in plan → add
    else {

        const pandal =
            pandals.find(
                item =>
                    String(item.id) ===
                    String(id)
            );


        if (!pandal) {
            return;
        }


        plan.push(pandal);
    }


    savePlan();


    // Refresh map popup + icon, if this pandal has one
    const marker =
        markers.find(
            marker =>
                String(
                    marker.pandalData.id
                ) === String(id)
        );


    if (marker) {

        marker.setPopupContent(
            createPandalPopup(
                marker.pandalData
            )
        );

        marker.setIcon(
            pandalIcon(
                marker.pandalData.confidence,
                isInPlan(marker.pandalData)
            )
        );

        marker.openPopup();
    }


    // Refresh the open list row for this pandal too, if there is one
    if (viewMode === "list") {

        const openDetail =
            document.querySelector(
                `.list-row[data-id="${cssEscape(id)}"] .list-row-detail`
            );

        if (openDetail && openDetail.innerHTML.trim()) {

            const pandal =
                pandals.find(
                    item => String(item.id) === String(id)
                );

            if (pandal) {
                openDetail.innerHTML = pandalCard(pandal);
            }
        }
    }
}


// ----------------------------------------
// 12. UPDATE PLAN UI
// ----------------------------------------

function updatePlanUI() {

    const count =
        plan.length;


    document.getElementById(
        "plan-count"
    ).textContent =
        count;


    document.getElementById(
        "plan-summary"
    ).textContent =
        `${count} ${count === 1 ? "pandal" : "pandals"}`;


    const list =
        document.getElementById(
            "plan-list"
        );


    list.innerHTML = "";


    if (count === 0) {

        list.innerHTML = `
            <div class="plan-empty">

                Your plan is empty.

                <br>

                Click a pandal and add it.

            </div>
        `;

        return;
    }


    plan.forEach(
    (pandal, index) => {

        const item =
            document.createElement("div");

        item.className =
            "plan-item";

        item.draggable = true;

        item.dataset.index = index;

        item.innerHTML = `

                <div class="plan-number">
                    ${index + 1}
                </div>

                <div class="plan-info">

                    <div class="plan-name">
                        ${escapeHTML(
                            pandal.name ||
                            "Unnamed Puja"
                        )}
                    </div>

                    <div class="plan-address">
                        ${escapeHTML(
                            pandal.address ||
                            ""
                        )}
                    </div>

                </div>

                <button
                    class="remove-plan-item"
                    data-id="${escapeAttribute(
                        pandal.id
                    )}"
                >
                    ×
                </button>
            `;

            item.addEventListener(
    "dragstart",
    () => {

        draggedPlanIndex = index;

        item.classList.add("dragging");
    }
);

item.addEventListener(
    "dragend",
    () => {

        draggedPlanIndex = null;

        item.classList.remove("dragging");

        document
            .querySelectorAll(".plan-item")
            .forEach(
                element =>
                    element.classList.remove(
                        "drag-over"
                    )
            );
    }
);

item.addEventListener(
    "dragover",
    event => {

        event.preventDefault();

        item.classList.add("drag-over");
    }
);

item.addEventListener(
    "dragleave",
    () => {

        item.classList.remove("drag-over");
    }
);

item.addEventListener(
    "drop",
    event => {

        event.preventDefault();

        item.classList.remove("drag-over");

        const targetIndex =
            Number(item.dataset.index);

        if (
            draggedPlanIndex === null ||
            draggedPlanIndex === targetIndex
        ) {
            return;
        }

        const movedPandal =
            plan.splice(
                draggedPlanIndex,
                1
            )[0];

        plan.splice(
            targetIndex,
            0,
            movedPandal
        );

        savePlan();

        clearRoute();
    }
);

            // Clicking the item focuses its marker
            item.addEventListener(
                "click",
                event => {

                    if (
                        event.target.classList.contains(
                            "remove-plan-item"
                        )
                    ) {
                        return;
                    }

                    focusPandal(pandal);
                }
            );


            // Remove button
            item.querySelector(
                ".remove-plan-item"
            ).addEventListener(
                "click",
                () => {

                    togglePlan(
                        pandal.id
                    );

                }
            );


            list.appendChild(item);

        }
    );
}


// ----------------------------------------
// 13. FOCUS PANDAL
// Always resolves to the map — if the list is currently open,
// switch back to map first so there's actually a pin to show.
// ----------------------------------------

function focusPandal(pandal) {

    if (!pandal.hasCoords) {
        return;
    }

    if (viewMode === "list") {
        setViewMode("map");
    }


    map.setView(
        [pandal.lat, pandal.lng],
        17,
        {
            animate: true
        }
    );


    const marker =
        markers.find(
            marker =>
                String(
                    marker.pandalData.id
                ) ===
                String(
                    pandal.id
                )
        );


    if (marker) {
        marker.openPopup();
    }


    closePlanPanel();
}


// ----------------------------------------
// 14. PLAN PANEL
// ----------------------------------------

const planButton =
    document.getElementById(
        "plan-button"
    );

const planPanel =
    document.getElementById(
        "plan-panel"
    );

const closePlan =
    document.getElementById(
        "close-plan"
    );


planButton.addEventListener(
    "click",
    () => {

        planPanel.style.display =
            "flex";

    }
);


closePlan.addEventListener(
    "click",
    closePlanPanel
);


function closePlanPanel() {

    planPanel.style.display =
        "none";
}


// ----------------------------------------
// 15. CLEAR PLAN
// ----------------------------------------

document.getElementById(
    "clear-plan"
).addEventListener(
    "click",
    () => {

        if (plan.length === 0) {
            return;
        }


        const confirmed =
            confirm(
                "Clear your entire Pujo plan?"
            );


        if (!confirmed) {
            return;
        }


        plan = [];

        savePlan();


        // Refresh all marker popups and icons
        markers.forEach(
            marker => {

                marker.setPopupContent(
                    createPandalPopup(
                        marker.pandalData
                    )
                );

                marker.setIcon(
                    pandalIcon(
                        marker.pandalData.confidence,
                        false
                    )
                );

            }
        );


        // Collapse any open list detail rows too
        if (viewMode === "list") {
            renderListView(currentListData());
        }

    }
);


// ----------------------------------------
// 16. VIEW TOGGLE — MAP / LIST
// The list exists specifically so the ~300 pandals without a
// trustworthy pin are still browsable, without ever putting that
// many markers (or a scrollable list) on top of a live map.
// ----------------------------------------

const listToggle =
    document.getElementById("list-toggle");

const listPanel =
    document.getElementById("list-panel");

const mapElement =
    document.getElementById("map");


listToggle.addEventListener(
    "click",
    () => {
        setViewMode(
            viewMode === "map" ? "list" : "map"
        );
    }
);


function setViewMode(mode) {

    viewMode = mode;

    const isList =
        mode === "list";


    mapElement.style.display =
        isList ? "none" : "block";

    listPanel.style.display =
        isList ? "block" : "none";

    listToggle.classList.toggle(
        "active",
        isList
    );

    listToggle.setAttribute(
        "aria-pressed",
        String(isList)
    );


    // Switching modes resets search — carrying a filter silently
    // across two very different views was more confusing than useful.
    searchInput.value = "";

    clearButton.style.display =
        "none";

    searchResults.style.display =
        "none";


    if (isList) {

        showAllMarkers();

        renderListView(pandals);

    } else {

        setTimeout(() => {
            map.invalidateSize();
        }, 50);
    }
}


// Tracks whatever the list is currently showing, so actions like
// "Clear Plan" can redraw it without guessing at the active filter.
let lastListData = [];

function currentListData() {
    return lastListData;
}


// ----------------------------------------
// 17. LIST VIEW
// One row per pandal, collapsed to a single line by default.
// Tapping a row expands the same card used in the map popup —
// only one row stays open at a time, so it never turns into a
// wall of text.
// ----------------------------------------

function renderListView(data) {

    lastListData = data;

    listPanel.innerHTML = "";


    if (data.length === 0) {

        listPanel.innerHTML = `
            <div class="list-empty">
                No pujas found.
            </div>
        `;

        return;
    }


    const fragment =
        document.createDocumentFragment();


    groupByZone(data).forEach(group => {

        const header =
            document.createElement("div");

        header.className = "list-zone-header";

        header.innerHTML = `
            <span>${escapeHTML(group.zone)}</span>
            <span class="list-zone-count">${group.items.length}</span>
        `;

        fragment.appendChild(header);


        group.items.forEach(pandal => {
            fragment.appendChild(
                createListRow(pandal)
            );
        });

    });


    listPanel.appendChild(fragment);
}

// Zones sorted alphabetically; pandals with no zone on file are
// grouped under "Other" and always sorted last, rather than
// wherever "Other" happens to fall alphabetically.
function groupByZone(data) {

    const groups = new Map();

    data.forEach(pandal => {

        const zone =
            pandal.zone || "Other";

        if (!groups.has(zone)) {
            groups.set(zone, []);
        }

        groups.get(zone).push(pandal);
    });


    const zoneNames =
        [...groups.keys()].sort((a, b) => {

            if (a === "Other") return 1;
            if (b === "Other") return -1;

            return a.localeCompare(b);
        });


    return zoneNames.map(zone => ({
        zone,
        items:
            groups.get(zone).sort(
                (a, b) => a.name.localeCompare(b.name)
            )
    }));
}

// Builds one collapsed row, wired up to expand into the shared
// pandal card on click. Kept separate from renderListView so
// grouping by zone doesn't require duplicating this block per group.
function createListRow(pandal) {

    const meta =
        CONFIDENCE_META[pandal.confidence] ||
        CONFIDENCE_META.unlocated;

    const subtitle =
        pandal.city &&
        pandal.city.toLowerCase() !== pandal.zone.toLowerCase()
            ? pandal.city
            : "";

    const row =
        document.createElement("div");

    row.className = "list-row";

    row.dataset.id = pandal.id;

    row.innerHTML = `
        <button class="list-row-summary" type="button">

            <span class="list-row-dot confidence-${pandal.confidence}" title="${escapeAttribute(meta.label)}"></span>

            <span class="list-row-text">
                <span class="list-row-name">${escapeHTML(pandal.name)}</span>
                ${subtitle ? `<span class="list-row-sub">${escapeHTML(subtitle)}</span>` : ""}
            </span>

            <span class="list-row-chevron">\u203a</span>

        </button>

        <div class="list-row-detail"></div>
    `;


    const summaryButton =
        row.querySelector(".list-row-summary");

    const detail =
        row.querySelector(".list-row-detail");


    summaryButton.addEventListener(
        "click",
        () => {

            const isOpen =
                row.classList.contains("open");


            // Only one row open at a time keeps the list calm.
            listPanel
                .querySelectorAll(".list-row.open")
                .forEach(openRow => {

                    if (openRow !== row) {

                        openRow.classList.remove("open");

                        openRow.querySelector(
                            ".list-row-detail"
                        ).innerHTML = "";
                    }

                });


            if (isOpen) {

                row.classList.remove("open");

                detail.innerHTML = "";

            } else {

                row.classList.add("open");

                detail.innerHTML =
                    pandalCard(pandal);
            }

        }
    );


    return row;
}


// ----------------------------------------
// 18. SEARCH
// ----------------------------------------

const searchInput =
    document.getElementById(
        "search"
    );

const searchResults =
    document.getElementById(
        "search-results"
    );

const clearButton =
    document.getElementById(
        "clear-search"
    );


searchInput.addEventListener(
    "input",
    handleSearch
);


function filterPandals(query) {

    return pandals.filter(
        pandal => {

            const name =
                pandal.name.toLowerCase();

            const address =
                pandal.address.toLowerCase();

            const zone =
                pandal.zone.toLowerCase();


            return (
                name.includes(query) ||
                address.includes(query) ||
                zone.includes(query)
            );

        }
    );
}


function handleSearch() {

    const query =
        searchInput.value
            .trim()
            .toLowerCase();


    clearButton.style.display =
        query
            ? "block"
            : "none";


    // List mode: the search bar filters the list in place.
    if (viewMode === "list") {

        renderListView(
            query ? filterPandals(query) : pandals
        );

        return;
    }


    // Map mode: existing dropdown + marker-filter behaviour.
    if (!query) {

        searchResults.style.display =
            "none";

        showAllMarkers();

        return;
    }


    const results =
        filterPandals(query);


    displaySearchResults(results);

    showMatchingMarkers(results);
}


// ----------------------------------------
// 19. SEARCH RESULTS (map mode)
// ----------------------------------------

function displaySearchResults(results) {

    searchResults.innerHTML = "";


    if (results.length === 0) {

        searchResults.innerHTML = `
            <div class="no-results">
                No pandals found.
            </div>
        `;

        searchResults.style.display =
            "block";

        return;
    }


    results
        .slice(0, 10)
        .forEach(pandal => {

            const result =
                document.createElement(
                    "div"
                );


            result.className =
                "search-result";


            result.innerHTML = `

                <div class="search-result-name">

                    ${escapeHTML(
                        pandal.name ||
                        "Unnamed Puja"
                    )}

                </div>

                <div class="search-result-address">

                    ${escapeHTML(
                        pandal.address ||
                        ""
                    )}

                </div>
            `;


            result.addEventListener(
                "click",
                () => selectPandal(pandal)
            );


            searchResults.appendChild(
                result
            );

        });


    searchResults.style.display =
        "block";
}


// ----------------------------------------
// 20. SELECT SEARCH RESULT
// ----------------------------------------

function selectPandal(pandal) {

    focusPandal(pandal);

    searchResults.style.display =
        "none";
}


// ----------------------------------------
// 21. FILTER / SHOW MARKERS (map mode)
// ----------------------------------------

function showMatchingMarkers(results) {

    const resultIDs =
        new Set(
            results.map(
                pandal =>
                    String(
                        pandal.id
                    )
            )
        );


    markers.forEach(
        marker => {

            const id =
                String(
                    marker.pandalData.id
                );


            if (resultIDs.has(id)) {

                marker.addTo(map);

            } else {

                map.removeLayer(marker);

            }

        }
    );
}


function showAllMarkers() {

    markers.forEach(
        marker => {

            marker.addTo(map);

        }
    );
}


// ----------------------------------------
// 22. CLEAR SEARCH
// ----------------------------------------

clearButton.addEventListener(
    "click",
    () => {

        searchInput.value = "";

        clearButton.style.display =
            "none";

        if (viewMode === "list") {

            renderListView(pandals);

        } else {

            searchResults.style.display =
                "none";

            showAllMarkers();
        }

        searchInput.focus();

    }
);


// ----------------------------------------
// 23. CLOSE SEARCH DROPDOWN ON MAP CLICK
// ----------------------------------------

map.on(
    "click",
    () => {

        searchResults.style.display =
            "none";

    }
);


// ----------------------------------------
// 24. ESCAPING HELPERS
// ----------------------------------------

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {

    return String(value)
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}

// Minimal CSS.escape fallback for building an attribute-selector
// safely out of a puja ID that may contain punctuation like "#".
function cssEscape(value) {

    return String(value).replace(
        /[^a-zA-Z0-9_-]/g,
        char => "\\" + char
    );
}


// ----------------------------------------
// ROUTING
// ----------------------------------------

async function showRoute() {

    if (plan.length < 2) {

        alert(
            "Add at least 2 pandals to create a route."
        );

        return;
    }


    const coordinates = plan
        .map(pandal => `${pandal.lng},${pandal.lat}`)
        .join(";");


    const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${coordinates}?overview=full&geometries=geojson`;


    const button =
        document.getElementById("show-route");


    button.textContent =
        "Calculating...";

    button.disabled = true;


    try {

        const response =
            await fetch(url);


        if (!response.ok) {
            throw new Error(
                "Routing request failed."
            );
        }


        const data =
            await response.json();


        if (
            data.code !== "Ok" ||
            !data.routes ||
            !data.routes.length
        ) {
            throw new Error(
                "No route found."
            );
        }


        const route =
            data.routes[0];


        drawRoute(
            route.geometry
        );


        displayRouteSummary(
            route
        );


    } catch (error) {

        console.error(error);

        alert(
            "Couldn't calculate the route. Try again."
        );

    } finally {

        button.textContent =
            "Show Route";

        button.disabled = false;
    }
}

// ----------------------------------------
// DRAW ROUTE
// ----------------------------------------

function drawRoute(geometry) {

    if (routeLayer) {

        map.removeLayer(
            routeLayer
        );

    }


    routeLayer =
        L.geoJSON(
            geometry,
            {
                style: {
                    weight: 5,
                    opacity: 0.8
                }
            }
        ).addTo(map);


    map.fitBounds(
        routeLayer.getBounds(),
        {
            padding: [50, 50]
        }
    );
}

// ----------------------------------------
// ROUTE SUMMARY
// ----------------------------------------

function displayRouteSummary(route) {

    const summary =
        document.getElementById(
            "route-summary"
        );


    const distanceKm =
        (route.distance / 1000)
            .toFixed(1);


    const minutes =
        Math.round(
            route.duration / 60
        );


    let timeText;


    if (minutes < 60) {

        timeText =
            `${minutes} min`;

    } else {

        const hours =
            Math.floor(minutes / 60);

        const remaining =
            minutes % 60;

        timeText =
            `${hours}h ${remaining}m`;
    }


    summary.innerHTML = `
        <strong>${distanceKm} km</strong>
        · approximately
        <strong>${timeText}</strong>
        by road
    `;


    summary.style.display =
        "block";
}

document.getElementById(
    "show-route"
).addEventListener(
    "click",
    showRoute
);

// ----------------------------------------
// CLEAR ROUTE
// ----------------------------------------

function clearRoute() {

    if (routeLayer) {

        map.removeLayer(
            routeLayer
        );

        routeLayer = null;
    }


    const summary =
        document.getElementById(
            "route-summary"
        );


    summary.style.display =
        "none";


    summary.innerHTML =
        "";
}

// ----------------------------------------
// 25. START
// ----------------------------------------

loadSavedPlan();

loadPandals();
