// ========================================
// PUJO MAP — VERSION 0.9
//
// Data source: Dataset_5_Cleaned.xlsx (23 columns, 403 pandals —
// scope now spans Kolkata plus Howrah, Hooghly, North & South 24
// Parganas, and scattered entries further afield). Only a handful of
// those columns are user-facing; see normalizePandal() below for
// exactly which ones and why.
//
// Location confidence drives both the map markers and the list
// badges, ranked highest to lowest:
//   committee-confirmed → shown on map, deep-blue tick
//   manually-checked    → shown on map, green tick (same green as
//                          High, and the same tick — the two are
//                          meant to look identical, told apart by
//                          label only, not colour or icon)
//   high                → shown on map, green tick
//   medium              → shown on map, blue ≈
//   unconfirmed         → list only, amber clock
//   low                 → list only, vermillion warning triangle
//   unlocated           → list only (no coordinates), grey "?"
//
// committee-confirmed and manually-checked are both values written
// directly into the "Confidence" column itself, alongside High/
// Medium/Unconfirmed/etc — not separate Yes/blank columns, despite
// an earlier version of this file assuming that. confidenceKey()
// below handles all of it in one place; see its comment for exactly
// which phrasing it matches, since the sheet's exact wording for
// these two hasn't been confirmed yet.
//
// Only committee-confirmed/manually-checked/high/medium pandals
// become map markers — the rest have either no coordinate or one we
// don't trust yet, and plotting every row was the main source of the
// lag an earlier version fixed.
//
// v0.9: added the manually-checked tier; recoloured committee-
// confirmed from violet to a deep blue distinct from Medium's, and
// swapped its icon from a shield to the same tick High already uses
// (colour is now the only thing telling any of these three tiers
// apart at marker size); and the card's status badge is now a full
// pill (border-radius) rather than a slightly-rounded rectangle — the
// map pin stays a circle, same as before.
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
    "committee-confirmed": {
        label: "Committee-Confirmed",
        icon: `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
    "manually-checked": {
        label: "Manually Checked",
        icon: `<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    },
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
const MAP_VISIBLE_CONFIDENCE = ["committee-confirmed", "manually-checked", "high", "medium"];

// Committee confirmation is a separate, stronger channel than the
// Google-verification pipeline that fills in "Confidence" — so it's
// read from its own column and, when present, overrides whatever
// tier the Confidence column would otherwise produce. See
// normalizePandal() in section 6.
function confidenceKey(raw) {

    // Matches on the LEADING phrase, not an exact string — this
    // dataset writes confidence as a phrase ("High (Google-verified)",
    // "Unconfirmed (single source)") rather than a bare label. Any
    // value that doesn't start with a recognized tier — including
    // "Needs manual review" — correctly falls through to "unlocated".
    //
    // Committee Confirmed and Manually Checked live INSIDE this same
    // column, as values Piyash writes directly into "Confidence" —
    // not a separate Yes/blank column, despite how normalizePandal()
    // originally modeled this. Hyphen and space are treated the same
    // ("Committee Confirmed" / "Committee-Confirmed" both match) since
    // it's not yet confirmed which form the sheet actually uses.
    const value =
        String(raw || "")
            .trim()
            .toLowerCase()
            .replace(/-/g, " ");

    if (value.startsWith("committee confirmed")) return "committee-confirmed";
    if (value.startsWith("manually checked")) return "manually-checked";
    if (value.startsWith("high")) return "high";
    if (value.startsWith("medium")) return "medium";
    if (value.startsWith("low")) return "low";
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

let viewMode = "map";    // "map" | "list" | "explore"


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
// The sheet has 23 columns; several (Municipality, Post Office,
// Police Station, District, State, Country, Pincode, Puja Estd.
// Year, Puja Type, Official Website/E-mail/Facebook, Google Maps
// Link) exist for provenance/enrichment but aren't surfaced yet.
// Only the columns below make it into the app today — see
// Architecture.md's field-mapping table for the full column list
// and which of these are candidates for a future UI pass.
// ----------------------------------------

function normalizePandal(raw) {

    const lat =
        Number(raw["Latitude"]);

    const lng =
        Number(raw["Longitude"]);

    const hasCoords =
        Number.isFinite(lat) &&
        Number.isFinite(lng);

    const name =
        String(raw["Name of the Puja"] || "").trim() ||
        "Unnamed Puja";

    const club =
        String(raw["Name of the Club"] || "").trim();

    return {
        id: String(raw["Puja ID"] || "").trim(),
        name,
        club: club.toLowerCase() === name.toLowerCase() ? "" : club,
        zone: String(raw["Zone"] || "").trim(),
        address: String(raw["Address"] || "").trim(),
        landmark: String(raw["Landmark"] || "").trim(),
        city: String(raw["City"] || "").trim(),
        lat: hasCoords ? lat : null,
        lng: hasCoords ? lng : null,
        hasCoords,
        // Committee-Confirmed and Manually-Checked both live inside
        // this one column's values now — see confidenceKey().
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

        populateZoneStrip();

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

    if (viewMode !== "map") {
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
    async () => {

        if (plan.length === 0) {
            return;
        }


        const confirmed =
            await showConfirm(
                "Clear your entire Pujo plan?",
                "Clear Plan"
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
// 16. VIEW TOGGLE — MAP / LIST / EXPLORE
// The list exists specifically so the ~300 pandals without a
// trustworthy pin are still browsable, without ever putting that
// many markers (or a scrollable list) on top of a live map. Explore
// is a placeholder for now (section 27's nav dock links to it).
// ----------------------------------------

const listToggle =
    document.getElementById("list-toggle");

const listPanel =
    document.getElementById("list-panel");

const listRows =
    document.getElementById("list-rows");

const zoneStrip =
    document.getElementById("zone-strip");

const mapElement =
    document.getElementById("map");

const mapControls =
    document.querySelector(".map-controls");

const exploreView =
    document.getElementById("explore-view");

const dockButtons =
    document.querySelectorAll(".dock-button");


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

    mapElement.style.display =
        mode === "map" ? "block" : "none";

    mapControls.style.display =
        mode === "map" ? "flex" : "none";

    listPanel.style.display =
        mode === "list" ? "block" : "none";

    exploreView.style.display =
        mode === "explore" ? "flex" : "none";

    listToggle.classList.toggle(
        "active",
        mode === "list"
    );

    listToggle.setAttribute(
        "aria-pressed",
        String(mode === "list")
    );

    dockButtons.forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === mode
        );
    });


    // Switching modes resets search — carrying a filter silently
    // across two very different views was more confusing than useful.
    // Applies to the zone strip too now.
    searchInput.value = "";

    clearButton.style.display =
        "none";

    searchResults.style.display =
        "none";

    selectedZone = "all";

    updateZoneStripActiveState();

    // Unconditional now, not just on the way into list mode: the
    // dock lets you jump straight between any of the three views,
    // not just toggle map<->list, so a marker filter left over from
    // search could otherwise survive a detour through Explore and
    // reappear stale when you come back to the map.
    showAllMarkers();


    if (mode === "list") {

        renderListView(currentDirectoryResults());

    } else if (mode === "map") {

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

    listRows.innerHTML = "";


    if (data.length === 0) {

        listRows.innerHTML = `
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


    listRows.appendChild(fragment);
}

// Zones sorted alphabetically; pandals with no zone on file are
// grouped under "Other Zone" — the same label already used for real
// pandals whose actual zone value is "Other Zone" — rather than a
// separate "Other" bucket, which looked like two near-identical
// catch-all categories in the list. Always sorted last.
function groupByZone(data) {

    const groups = new Map();

    data.forEach(pandal => {

        const zone =
            pandal.zone || "Other Zone";

        if (!groups.has(zone)) {
            groups.set(zone, []);
        }

        groups.get(zone).push(pandal);
    });


    const zoneNames =
        [...groups.keys()].sort((a, b) => {

            if (a === "Other Zone") return 1;
            if (b === "Other Zone") return -1;

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


// Which zone the Directory is currently filtered to — "all" or a
// real zone name. Reset to "all" on every setViewMode() call
// (section 16), same as search.
let selectedZone = "all";


// Persistent horizontal strip below the search bar, built once real
// data loads (see populateZoneStrip()'s call site in loadPandals(),
// section 7) and never rebuilt afterward — only its active chip
// changes, so re-filtering never disturbs its scroll position.
function populateZoneStrip() {

    const counts =
        new Map();

    pandals.forEach(pandal => {

        const zone =
            pandal.zone || "Other Zone";

        counts.set(
            zone,
            (counts.get(zone) || 0) + 1
        );
    });


    // Same sort as groupByZone() above — "Other Zone" always last —
    // so the strip's order matches the order zones actually appear
    // in the list underneath it.
    const zoneNames =
        [...counts.keys()].sort((a, b) => {

            if (a === "Other Zone") return 1;
            if (b === "Other Zone") return -1;

            return a.localeCompare(b);
        });


    const allChip =
        `<button class="zone-chip" data-zone="all">All</button>`;

    const zoneChips =
        zoneNames
            .map(zone => `
                <button class="zone-chip" data-zone="${escapeHTML(zone)}">
                    ${escapeHTML(zone)} (${counts.get(zone)})
                </button>
            `)
            .join("");

    zoneStrip.innerHTML =
        allChip + zoneChips;


    zoneStrip
        .querySelectorAll(".zone-chip")
        .forEach(chip => {

            chip.addEventListener("click", () => {

                selectedZone =
                    chip.dataset.zone;

                updateZoneStripActiveState();

                renderListView(
                    currentDirectoryResults()
                );
            });
        });


    updateZoneStripActiveState();
}


// Only toggles the .active class — never rebuilds the strip's
// innerHTML — so selecting a zone can't reset the strip's own
// horizontal scroll position.
function updateZoneStripActiveState() {

    zoneStrip
        .querySelectorAll(".zone-chip")
        .forEach(chip => {

            chip.classList.toggle(
                "active",
                chip.dataset.zone === selectedZone
            );
        });
}


// The one place the zone strip and the search box meet — every
// control that can change the Directory's contents calls this,
// never pandals/filterPandals directly, so the two filters can never
// silently fight each other.
function currentDirectoryResults() {

    const query =
        searchInput.value.trim().toLowerCase();


    return pandals.filter(pandal => {

        if (
            selectedZone !== "all" &&
            (pandal.zone || "Other Zone") !== selectedZone
        ) {
            return false;
        }

        if (query) {

            const matches =
                pandal.name.toLowerCase().includes(query) ||
                pandal.address.toLowerCase().includes(query) ||
                pandal.zone.toLowerCase().includes(query);

            if (!matches) {
                return false;
            }
        }

        return true;
    });
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


    // Explore: typing means "find something specific," not "look at
    // the placeholder" — switch to map mode first. setViewMode()
    // clears the input as part of its own reset, so restore what was
    // actually typed before falling through to the map-mode logic
    // below.
    if (viewMode === "explore" && query) {

        setViewMode("map");

        searchInput.value =
            query;
    }


    clearButton.style.display =
        query
            ? "block"
            : "none";


    // List mode: the search bar filters the list in place, composed
    // with whatever zone is selected in the strip.
    if (viewMode === "list") {

        renderListView(
            currentDirectoryResults()
        );

        return;
    }


    // Map mode (Explore redirects here too, above): existing dropdown
    // + marker-filter behaviour.
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

            renderListView(
                currentDirectoryResults()
            );

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

        showAlert(
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

        showAlert(
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
// 25. CUSTOM ALERT
// A small on-brand toast instead of the browser's native alert() —
// non-blocking, auto-dismissing, styled like the rest of the app.
// Deliberately quiet (paper-flat, hairline border, soft shadow), not
// brutalist — boldness stays reserved for the three loud elements
// documented in Design.md, and a system message popping in with
// full bold treatment would compete with them for no reason.
// ----------------------------------------

let alertDismissTimer = null;

function showAlert(message) {

    let toast =
        document.getElementById("app-toast");

    if (!toast) {

        toast =
            document.createElement("div");

        toast.id = "app-toast";

        toast.innerHTML = `
            <svg viewBox="0 0 16 16" fill="none" class="app-toast-icon">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
                <line x1="8" y1="5" x2="8" y2="8.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                <circle cx="8" cy="11" r="0.9" fill="currentColor"/>
            </svg>
            <span class="app-toast-message"></span>
        `;

        document.body.appendChild(toast);
    }


    toast.querySelector(".app-toast-message").textContent =
        message;


    clearTimeout(alertDismissTimer);

    // Two rAFs, not one: the element needs a layout tick in its
    // pre-transition state before adding the class that transitions
    // it, or the browser can coalesce both changes into one frame
    // and skip the animation — most noticeable on repeat alerts.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add("visible");
        });
    });


    alertDismissTimer = setTimeout(
        () => {
            toast.classList.remove("visible");
        },
        4000
    );
}


// A blocking modal, unlike the toast above — this gates an action
// rather than just informing, so it needs an actual decision before
// anything continues. Returns a Promise<boolean> so call sites read
// as `if (await showConfirm(...))`, mirroring the native confirm()
// it replaces. Styled as a warning by default: every confirm in this
// app so far gates a destructive, hard-to-undo action, so a
// vermillion "confirm" button is the sensible default here, not a
// neutral one.
function showConfirm(message, confirmLabel = "Confirm") {

    return new Promise(resolve => {

        const overlay =
            document.createElement("div");

        overlay.id = "app-confirm-overlay";

        overlay.innerHTML = `
            <div id="app-confirm-dialog" role="alertdialog" aria-modal="true">
                <p id="app-confirm-message"></p>
                <div id="app-confirm-actions">
                    <button id="app-confirm-cancel" type="button">Cancel</button>
                    <button id="app-confirm-ok" type="button"></button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector("#app-confirm-message").textContent =
            message;

        overlay.querySelector("#app-confirm-ok").textContent =
            confirmLabel;


        const finish = result => {

            overlay.classList.remove("visible");

            document.removeEventListener(
                "keydown",
                onKeydown
            );

            setTimeout(
                () => overlay.remove(),
                200
            );

            resolve(result);
        };

        const onKeydown = event => {

            if (event.key === "Escape") {
                finish(false);
            }
        };


        overlay.addEventListener(
            "click",
            event => {
                if (event.target === overlay) {
                    finish(false);
                }
            }
        );

        overlay
            .querySelector("#app-confirm-cancel")
            .addEventListener("click", () => finish(false));

        overlay
            .querySelector("#app-confirm-ok")
            .addEventListener("click", () => finish(true));

        document.addEventListener(
            "keydown",
            onKeydown
        );


        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add("visible");
            });
        });
    });
}


// ----------------------------------------
// 26. USER LOCATION
// The button toggles a LIVE navigator.geolocation.watchPosition()
// feed, not a one-off snapshot — the dot tracks the visitor as they
// walk between pandals, matching what "showing where the user is"
// actually needs while pandal-hopping. Still fully opt-in: nothing
// runs until the button is tapped, so a permission prompt never
// fires unprompted, and a denial never blocks anything else here.
//
// Position comes from navigator.geolocation itself — the device's
// GPS/WiFi/cell positioning, unrelated to OSM (which only supplies
// map tiles here, never location). No change needed there; it was
// already right.
//
// Every update is filtered through two checks before it touches the
// map: LOCATION_MIN_DISTANCE_METERS (skip if the new fix isn't at
// least 10m from the last one actually applied) and
// LOCATION_MIN_INTERVAL_MS (skip if it's been under 5s since the
// last one, UNLESS the distance check alone says it moved anyway —
// a car or a fast bike shouldn't have to wait out the throttle).
// Kolkata's dense blocks mean real GPS multipath/reflection noise,
// especially standing still near buildings — without this, the dot
// would visibly jitter a few metres in every direction despite the
// visitor not moving at all. maximumAge stays at 5000 too: that's a
// separate, complementary thing — a hint to the OS positioning
// hardware itself that it can skip an actual GPS poll and hand back
// a recent cached fix, which is a real battery saving these two JS-
// side checks can't get on their own (discarding a callback in JS
// doesn't undo the GPS chip having already spent power taking the
// reading).
//
// Once a marker/circle exists, updates move it with setLatLng()/
// setRadius() instead of removing and recreating it. Recreating on
// every fix would restart the pulse animation from frame zero each
// time (visibly janky) and churn the DOM for no reason — Leaflet
// markers are designed to be repositioned in place.
// ----------------------------------------

const locateButton =
    document.getElementById("locate-button");

let userLocationMarker = null;
let userAccuracyCircle = null;
let locationWatchId = null;
let hasCenteredOnUser = false;
let lastAppliedLatLng = null;
let lastAppliedTime = 0;

const LOCATION_MIN_DISTANCE_METERS = 10;
const LOCATION_MIN_INTERVAL_MS = 5000;


locateButton.addEventListener(
    "click",
    () => {

        if (locationWatchId !== null) {
            stopWatchingLocation();
        } else {
            startWatchingLocation();
        }
    }
);


function startWatchingLocation() {

    if (!("geolocation" in navigator)) {

        showAlert(
            "Location isn't available in this browser."
        );

        return;
    }


    locateButton.classList.add("locating");
    locateButton.classList.remove("locate-error");

    hasCenteredOnUser = false;
    lastAppliedLatLng = null;
    lastAppliedTime = 0;


    locationWatchId =
        navigator.geolocation.watchPosition(

            position => {

                locateButton.classList.remove("locating");
                locateButton.classList.add("active");

                locateButton.setAttribute(
                    "aria-pressed",
                    "true"
                );

                handlePositionUpdate(position);
            },

            error => {

                locateButton.classList.add("locate-error");

                stopWatchingLocation();

                handleLocationError(error);
            },

            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
}


// The filtering described in this section's opening comment — kept
// separate from showUserLocation() so "should this update apply" and
// "how do we render an update" don't tangle into one function.
function handlePositionUpdate(position) {

    const newLatLng =
        L.latLng(
            position.coords.latitude,
            position.coords.longitude
        );

    const now =
        Date.now();


    if (lastAppliedLatLng) {

        const movedMeters =
            lastAppliedLatLng.distanceTo(newLatLng);

        const tooSoon =
            (now - lastAppliedTime) < LOCATION_MIN_INTERVAL_MS;

        const notFarEnough =
            movedMeters < LOCATION_MIN_DISTANCE_METERS;


        if (tooSoon && notFarEnough) {
            return;
        }
    }


    lastAppliedLatLng = newLatLng;
    lastAppliedTime = now;

    showUserLocation(
        newLatLng.lat,
        newLatLng.lng,
        position.coords.accuracy
    );
}


function stopWatchingLocation() {

    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }


    locateButton.classList.remove("locating", "active");

    locateButton.setAttribute(
        "aria-pressed",
        "false"
    );


    if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
        userLocationMarker = null;
    }

    if (userAccuracyCircle) {
        map.removeLayer(userAccuracyCircle);
        userAccuracyCircle = null;
    }
}


function showUserLocation(lat, lng, accuracy) {

    const latLng =
        [lat, lng];


    if (userLocationMarker) {

        userLocationMarker.setLatLng(latLng);

    } else {

        userLocationMarker = L.marker(
            latLng,
            {
                icon: L.divIcon({
                    className: "user-location-wrap",
                    html: `<div class="user-location-dot"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                }),
                zIndexOffset: 1000,
                interactive: false,
                keyboard: false
            }
        ).addTo(map);
    }


    if (Number.isFinite(accuracy)) {

        if (userAccuracyCircle) {

            userAccuracyCircle.setLatLng(latLng);
            userAccuracyCircle.setRadius(accuracy);

        } else {

            userAccuracyCircle = L.circle(
                latLng,
                {
                    radius: accuracy,
                    className: "user-accuracy-circle",
                    interactive: false,
                    weight: 1
                }
            ).addTo(map);
        }
    }


    // Centers once, on the first fix only — after that the visitor
    // can pan freely without the map snapping back to them on every
    // later update, while the dot itself keeps tracking live.
    if (!hasCenteredOnUser) {

        hasCenteredOnUser = true;

        map.setView(
            latLng,
            Math.max(map.getZoom(), 15)
        );
    }
}


function handleLocationError(error) {

    let message =
        "Couldn't get your location. Try again.";

    if (error.code === error.PERMISSION_DENIED) {

        message =
            "Location permission denied — you can still browse the map manually.";

    } else if (error.code === error.TIMEOUT) {

        message =
            "Location request timed out. Try again.";
    }

    showAlert(message);
}


// ----------------------------------------
// 27. NAV DOCK
// Persistent across every view — dockButtons and the click wiring
// live here; the active-state highlighting itself happens inside
// setViewMode() (section 16), since that's the one place every view
// transition already passes through.
// ----------------------------------------

dockButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => setViewMode(button.dataset.view)
    );
});


// Measures the dock's actual rendered height rather than trusting a
// hand-picked number to stay right forever — every layout that needs
// to clear the dock (the map, the list, the locate button, the
// toast, the mobile plan panel) reads --dock-height in CSS, so this
// is the one place that number comes from.
function syncDockHeight() {

    document.documentElement.style.setProperty(
        "--dock-height",
        navDock.offsetHeight + "px"
    );
}

const navDock =
    document.getElementById("nav-dock");

syncDockHeight();

window.addEventListener(
    "resize",
    syncDockHeight
);


// ----------------------------------------
// 28. START
// ----------------------------------------

// Explicit on purpose, even though #map/.map-controls' CSS defaults
// already happen to agree with viewMode's initial value: relying on
// that agreement rather than enforcing it was exactly what broke
// last time (#map had no default display rule and silently painted
// over a different default view). It also matters for a second
// reason here — setViewMode() is the only thing that applies the
// dock buttons' .active class, so without this call the dock would
// show on load with nothing highlighted at all, even though the map
// is what's actually showing.
setViewMode("map");

loadSavedPlan();

loadPandals();
