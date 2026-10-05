// ========================================
// PUJO MAP — VERSION 0.12
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
//
// v0.10: the card's Maps button no longer starts navigation. It used
// to open Google Maps' directions flow (/maps/dir/ with the pandal as
// the destination, so Maps immediately asked for a starting point);
// it now just shows the place as a pin (/maps/search/), and the user
// can start directions from there if they want them. Labelled
// "View on Maps" to match. Also for search engines: the Directory is
// filled in as soon as data loads instead of on its first open, so
// crawlers (which never tap the Directory tab) can read the pandal
// names and zones; its zone headers are real <h2>s.
//
// v0.11: the top bar is the same in every view. The map/list toggle
// button is gone (the dock's Directory tab already does that job), so
// the map's search bar now gets the width and height the Directory's
// always had; and the My Plan button reads "My Plan" everywhere
// (Directory used to shorten it to "Plan" with a CSS override).
// The Pujodex logo replaces the old text wordmark on wide screens.
//
// v0.12: search finds pandals however their names are spelled. The old
// "contains exactly what you typed" filter is replaced by a ranked,
// sound-aware search (section 28): Sarbojanin = Sarbajanin = Sarvajanin,
// Bagbazar = Baghbazar = Bag Bazaar, typos and half-typed words are
// forgiven, Bangla-script input works, and results come best match
// first (the Directory keeps that order while a search is active).
// Optional sheet column "Also Known As" adds extra names that only the
// search reads. Enter jumps to the best match on the map.
//
// v0.13: the card's "View on Maps" button uses the sheet's
// "Google Maps Link" first; if that is blank, it falls back to a
// coordinate-based Google Maps URL, then the existing address/name search
// fallback for rows that have neither.
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
// Year, Puja Type, Official Website/E-mail/Facebook) exist for
// provenance/enrichment but aren't surfaced yet. Google Maps Link is read
// specifically for the card's map button.
// Only the columns below make it into the app today — see
// Architecture.md's field-mapping table for the full column list
// and which of these are candidates for a future UI pass.
//
// One optional extra column, "Also Known As", is read for the search
// only (see readAliases()) and never displayed.
// ----------------------------------------

// Optional sheet column: other names people use for a puja, comma or
// semicolon separated. Only the search reads it — it is never shown.
// A sheet without the column simply gets "" here and nothing changes.
function readAliases(raw) {

    const headers = ["also known as", "aliases", "alias", "search keywords"];

    for (const key of Object.keys(raw)) {

        if (headers.includes(key.trim().toLowerCase())) {

            const value = String(raw[key] || "").trim();

            if (value) {
                return value;
            }
        }
    }

    return "";
}

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
        googleMapsLink: String(raw["Google Maps Link"] || "").trim(),
        aliases: readAliases(raw),
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


        // Build the search index once the first paint is done (a few
        // milliseconds of work, but the markers shouldn't wait on it).
        // searchPandals() builds it on demand if a search ever beats this.
        setTimeout(() => buildSearchIndex(pandals), 0);


        // Fill the Directory now instead of on its first open, so the
        // pandal names and zones are in the page for search-engine
        // crawlers (they never tap the Directory tab). Deferred one
        // tick so the markers paint first; the panel stays hidden
        // until the user opens it, and setViewMode("list") redraws it
        // from scratch anyway.
        setTimeout(() => {

            if (viewMode !== "list") {
                renderListView(pandals);
            }

        }, 0);

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

    // Prefer the exact Google Maps URL stored in the sheet.
    // If it is missing, build a pin URL from the row's coordinates.
    // Rows with neither still use the existing address/name search fallback.
    const mapsUrl =
        pandal.googleMapsLink ||
        (pandal.hasCoords
            ? `https://www.google.com/maps/search/?api=1&query=${pandal.lat},${pandal.lng}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pandal.address || pandal.name)}`);

    const mapsLabel =
        (pandal.googleMapsLink || pandal.hasCoords)
            ? "View on Maps"
            : "Find on Maps";

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


function setViewMode(mode) {

    viewMode = mode;

    document.body.dataset.view = mode;

    mapElement.style.display =
        mode === "map" ? "block" : "none";

    mapControls.style.display =
        mode === "map" ? "flex" : "none";

    listPanel.style.display =
        mode === "list" ? "block" : "none";

    exploreView.style.display =
        mode === "explore" ? "flex" : "none";

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

        // Never reopen the directory at an old scroll position.
        listPanel.scrollTop = 0;

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


    // When a zone is selected, the chip already tells the user the
    // current context. A second full-width zone bar would just repeat it.
    if (data.ranked) {

        // A search is active: keep the engine's best-first order.
        // Grouping by zone or sorting A–Z would bury the best match.
        const header = document.createElement("h2");
        header.className = "list-context-header";

        let label = "Search results";

        if (data.closest) {
            label = selectedZone !== "all"
                ? `Closest matches · ${selectedZone}`
                : "Closest matches";
        } else if (selectedZone !== "all") {
            label = selectedZone;
        }

        header.innerHTML = `
            <span>${escapeHTML(label)}</span>
            <span class="list-zone-count">${data.length} ${data.length === 1 ? "pandal" : "pandals"}</span>
        `;
        fragment.appendChild(header);

        data.forEach(pandal => fragment.appendChild(createListRow(pandal)));

    } else if (selectedZone !== "all") {
        const header = document.createElement("h2");
        header.className = "list-context-header";
        header.innerHTML = `
            <span>${escapeHTML(selectedZone)}</span>
            <span class="list-zone-count">${data.length} ${data.length === 1 ? "pandal" : "pandals"}</span>
        `;
        fragment.appendChild(header);

        data
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(pandal => fragment.appendChild(createListRow(pandal)));
    } else {
        groupByZone(data).forEach(group => {
            const header = document.createElement("h2");
            header.className = "list-zone-header";
            header.innerHTML = `
                <span>${escapeHTML(group.zone)}</span>
                <span class="list-zone-count">${group.items.length}</span>
            `;
            fragment.appendChild(header);

            group.items.forEach(pandal => {
                fragment.appendChild(createListRow(pandal));
            });
        });
    }


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

                // Start the newly filtered directory at the top so the
                // strip remains directly below the search bar.
                listPanel.scrollTop = 0;

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

    const inZone = pandal =>
        selectedZone === "all" ||
        (pandal.zone || "Other Zone") === selectedZone;


    if (!searchInput.value.trim()) {

        return pandals.filter(inZone);
    }


    // Ranked across every pandal first, then narrowed to the chosen
    // zone, so the order is always best match first. renderListView()
    // reads .ranked/.closest, and both survive re-renders because
    // lastListData keeps this same array.
    const found =
        filterPandals(searchInput.value);

    const results =
        found.filter(inZone);

    results.ranked =
        true;

    results.closest =
        found.closest;

    return results;
}

// Builds one collapsed row, wired up to expand into the shared
// pandal card on click. Kept separate from renderListView so
// grouping by zone doesn't require duplicating this block per group.
function createListRow(pandal) {

    const meta =
        CONFIDENCE_META[pandal.confidence] ||
        CONFIDENCE_META.unlocated;

    const placeParts = [];

    if (pandal.zone) {
        placeParts.push(pandal.zone);
    } else if (pandal.city) {
        placeParts.push(pandal.city);
    }

    if (pandal.landmark) {
        placeParts.push(`Near ${pandal.landmark}`);
    }

    const subtitle = placeParts.join(" · ");

    const row =
        document.createElement("div");

    row.className = "list-row";

    row.dataset.id = pandal.id;

    row.innerHTML = `
        <button class="list-row-summary" type="button">

            <span class="list-row-status confidence-${pandal.confidence}" title="${escapeAttribute(meta.label)}" aria-label="${escapeAttribute(meta.label)}">
                ${meta.icon}
            </span>

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


// Ranked, spelling-tolerant search (section 28), best match first.
// results.closest is true when nothing matched every word and these
// are the nearest partial matches instead.
function filterPandals(query) {

    return searchPandals(query);
}


// Enter jumps straight to the best match on the map (the phone
// keyboard's Go/Search key does the same), instead of making the user
// tap a result. In the Directory the list is already filtered, so it
// only puts the keyboard away.
searchInput.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Enter") {
            return;
        }

        event.preventDefault();

        if (!searchInput.value.trim()) {
            return;
        }

        if (viewMode === "list") {

            searchInput.blur();

            return;
        }

        // Same as tapping the first row of the dropdown. A top match
        // with no coordinates can't be shown on the map, so Enter
        // leaves the dropdown open rather than jumping somewhere else.
        const best =
            filterPandals(searchInput.value)[0];

        if (best && best.hasCoords) {

            selectPandal(best);

            searchInput.blur();
        }
    }
);


function handleSearch() {

    // The engine gets the text exactly as typed — a trailing space
    // tells it the last word is finished, not half-typed.
    const typed =
        searchInput.value;

    const query =
        typed
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
            typed;
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
        filterPandals(typed);


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


    // Nothing matched every word, so these are the nearest partial matches.
    if (results.closest) {

        const note =
            document.createElement("div");

        note.className =
            "search-note";

        note.textContent =
            "Closest matches";

        searchResults.appendChild(note);
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
// 28. SEARCH ENGINE
// Called by the map dropdown, the marker filter and the Directory
// search box (sections 18 and 22 via filterPandals()).
// ----------------------------------------

// >>> SEARCH-ENGINE:BEGIN
// ========================================
// SEARCH ENGINE — finds pandals however the name is spelled.
//
// Pandal names are Bengali words written in English letters, and
// there is no single "right" spelling: Sarbojanin / Sarbajanin /
// Sarvajanin, Bagbazar / Baghbazar / Bag Bazaar, Pally / Palli / Pali.
// Typing on a phone adds ordinary typos on top. So the old "does the
// text contain exactly what I typed" check is replaced by:
//
//   1. Fold      lowercase, strip accents/punctuation. Bangla script
//                is turned into Roman letters first.
//   2. Sound     every word gets a "sounds-like" key (sh=s, bh=b,
//                v=b, z=j, oo=u, ee=i, a=o, double letters = one,
//                ph=f …) so spellings that sound alike share a key.
//   3. Distance  words are compared with an edit distance whose
//                costs follow how people actually mis-spell: a<->o
//                or i<->e are cheap, a dropped vowel or "h" is cheap,
//                a neighbouring key on the phone keyboard is cheaper
//                than a random letter, an adjacent swap is cheap.
//   4. Spacing   "bag bazar" = "bagbazar" = "baghbazar": words are
//                also compared glued together, both ways round.
//   5. Typing    the last word may be unfinished, so it also matches
//                as a prefix (typos allowed) — results appear as you type.
//   6. Rank      exact > prefix > sounds-alike > close spelling, name
//                beats address, rare words beat common ones. Words
//                like "puja" that nearly every name shares are
//                optional when the query also has a distinctive word.
//
// If nothing matches every word, the closest partial matches are shown
// (flagged with .closest) instead of an empty list.
//
// Everything between the BEGIN/END markers is self-contained plain JS
// with no dependencies on the rest of the app, except the global
// `pandals` array it indexes.
// ========================================


// ---------- 1. Bangla script -> Roman letters ----------
// So "সন্তোষ মিত্র স্কোয়ার" finds Santosh Mitra Square. Approximate on
// purpose (no schwa-deletion): the fuzzy matching below absorbs the
// difference.

const BN_INDEPENDENT_VOWELS = {
    "\u0985": "o",  "\u0986": "a",  "\u0987": "i",  "\u0988": "i",    // অ আ ই ঈ
    "\u0989": "u",  "\u098A": "u",  "\u098B": "ri", "\u098F": "e",    // উ ঊ ঋ এ
    "\u0990": "oi", "\u0993": "o",  "\u0994": "ou"                    // ঐ ও ঔ
};

const BN_VOWEL_SIGNS = {
    "\u09BE": "a",  "\u09BF": "i",  "\u09C0": "i",  "\u09C1": "u",    // া ি ী ু
    "\u09C2": "u",  "\u09C3": "ri", "\u09C7": "e",  "\u09C8": "oi",   // ূ ৃ ে ৈ
    "\u09CB": "o",  "\u09CC": "ou"                                    // ো ৌ
};

const BN_CONSONANTS = {
    "\u0995": "k",  "\u0996": "kh", "\u0997": "g",  "\u0998": "gh",   // ক খ গ ঘ
    "\u0999": "ng", "\u099A": "ch", "\u099B": "chh", "\u099C": "j",   // ঙ চ ছ জ
    "\u099D": "jh", "\u099E": "n",  "\u099F": "t",  "\u09A0": "th",   // ঝ ঞ ট ঠ
    "\u09A1": "d",  "\u09A2": "dh", "\u09A3": "n",  "\u09A4": "t",    // ড ঢ ণ ত
    "\u09A5": "th", "\u09A6": "d",  "\u09A7": "dh", "\u09A8": "n",    // থ দ ধ ন
    "\u09AA": "p",  "\u09AB": "ph", "\u09AC": "b",  "\u09AD": "bh",   // প ফ ব ভ
    "\u09AE": "m",  "\u09AF": "j",  "\u09B0": "r",  "\u09B2": "l",    // ম য র ল
    "\u09B6": "sh", "\u09B7": "sh", "\u09B8": "s",  "\u09B9": "h",    // শ ষ স হ
    "\u09DC": "r",  "\u09DD": "rh", "\u09DF": "y",  "\u09CE": "t"     // ড় ঢ় য় ৎ
};

const BN_NUKTA_FORMS = { "\u09A1": "r", "\u09A2": "rh", "\u09AF": "y" };

function isBengaliChar(ch) {
    return ch !== undefined && ch >= "\u0980" && ch <= "\u09FF";
}

function bengaliToRoman(text) {

    const chars = Array.from(String(text).normalize("NFC"));

    let out = "";

    for (let i = 0; i < chars.length; i++) {

        const ch = chars[i];

        if (BN_CONSONANTS[ch] !== undefined) {

            let roman = BN_CONSONANTS[ch];

            // consonant + nukta (়) is how many keyboards type ড় ঢ় য়
            if (chars[i + 1] === "\u09BC") {
                roman = BN_NUKTA_FORMS[ch] || roman;
                i++;
            }

            out += roman;

            const next = chars[i + 1];

            if (ch === "\u09CE") continue;                        // ৎ never carries a vowel
            if (next === "\u09CD") { i++; continue; }             // ্ joins into a conjunct
            if (BN_VOWEL_SIGNS[next] !== undefined) continue;     // an explicit vowel follows
            if (isBengaliChar(next)) out += "o";                  // inherent vowel (not word-final)

        } else if (BN_INDEPENDENT_VOWELS[ch] !== undefined) {

            out += BN_INDEPENDENT_VOWELS[ch];

        } else if (BN_VOWEL_SIGNS[ch] !== undefined) {

            out += BN_VOWEL_SIGNS[ch];

        } else if (ch === "\u0982") {                             // ং

            out += "ng";

        } else if (ch >= "\u09E6" && ch <= "\u09EF") {            // Bangla digits

            out += String(ch.charCodeAt(0) - 0x09E6);

        } else if (isBengaliChar(ch)) {

            // chandrabindu, visarga, nukta, stray virama …: silent

        } else {

            out += ch;
        }
    }

    return out;
}


// ---------- 2. Folding and sounds-like keys ----------

function searchFold(text) {

    let s = String(text === null || text === undefined ? "" : text);

    if (/[\u0980-\u09FF]/.test(s)) {
        s = bengaliToRoman(s);
    }

    return s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/['\u2018\u2019`\u00b4]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


// Words whose spellings differ in ways the sound rules can't predict.
// First entry of each group is the one the others are folded to.
const SEARCH_ALIAS_GROUPS = [
    ["lakshmi", "laxmi", "laksmi", "lokkhi", "lokhi", "lakhi", "lakkhi"],
    ["bose", "basu", "bosu", "bashu", "boshu"],
    ["kolkata", "calcutta", "kolikata", "kalikata", "culcutta", "calcuta"],
    ["mukherjee", "mukhopadhyay", "mukerjee", "mookerjee", "mukharjee", "mukhaerjee"],
    ["chatterjee", "chattopadhyay", "chatterji", "chaterjee", "chatarjee"],
    ["banerjee", "bandyopadhyay", "bandopadhyay", "banerji", "bannerjee"],
    ["ganguly", "gangopadhyay", "gangooly", "ganguli"],
    ["bhattacharya", "bhattacharjee", "bhattacharyya", "bhattacharia"],
    ["mohammad", "md", "mohd", "mohmmad"],
    ["howrah", "haora", "hawra", "haowra"],
    ["hooghly", "hugli", "hoogly", "hughli", "hooghli"],
    // abbreviations people type
    ["road", "rd"],
    ["street", "st", "str"],
    ["square", "sq", "sqr"],
    ["park", "pk"],
    ["avenue", "ave", "av"],
    ["lane", "ln"],
    ["near", "nr"]
];

const SEARCH_ALIAS = new Map();

SEARCH_ALIAS_GROUPS.forEach(group => {
    group.forEach(word => SEARCH_ALIAS.set(word, group[0]));
});


function phoneticKey(word) {

    let s = SEARCH_ALIAS.get(word) || word;

    if (/^\d+$/.test(s)) {
        return s;
    }

    s = s
        .replace(/x/g, "ks")
        .replace(/ck/g, "k")
        .replace(/q/g, "k")
        .replace(/ch+/g, "C")                    // C = the "ch" sound
        .replace(/c(?=[eiy])/g, "s")
        .replace(/c/g, "k")
        .replace(/sh+/g, "s")                    // শ / ষ / স are all "s" to most ears
        .replace(/ks/g, "k")                     // ksh / x: Lakshmi, Laxmi, Dakshin
        .replace(/ph+/g, "p")
        .replace(/f/g, "p")
        .replace(/([kgjdtb])h+/g, "$1")          // kh gh jh dh th bh
        .replace(/z/g, "j")
        .replace(/v/g, "b")
        .replace(/([aeiou])w(?=[aeiou])/g, "$1b") // Bhowanipore = Bhabanipur
        .replace(/(?!^)w/g, "u")                 // ow/aw/kw/sw: a vowel-ish glide
        .replace(/^w/, "b")
        .replace(/^y(?=[aeiou])/, "j")           // Yadavpur = Jadavpur
        .replace(/[ao]y/g, "oi")
        .replace(/ey/g, "e")
        .replace(/y/g, "i")
        .replace(/oo/g, "u")
        .replace(/ee/g, "i")
        .replace(/a/g, "o")                      // a and o are interchangeable in Bengali spellings
        .replace(/ou/g, "o")
        .replace(/o+/g, "o")
        .replace(/([a-zC])\1+/g, "$1")           // double letters
        .replace(/([oiue])h$/, "$1")             // puja-h, allah
        .replace(/n(?=m)/g, "");                 // sanmilani = sammilani

    return s.length > 100 ? s.slice(0, 100) : s;
}

function consonantSkeleton(key) {
    return (/^[oiue]/.test(key) ? "#" : "") +
        key.replace(/[oiueh]/g, "").replace(/([a-zC])\1+/g, "$1");
}

function makeSearchToken(text) {

    const isNum = /^\d+$/.test(text);
    const k = phoneticKey(text);

    return {
        s: text,
        k,
        c: isNum ? text : consonantSkeleton(k),
        isNum,
        typing: false
    };
}


// ---------- 3. Edit distance with spelling-aware costs ----------

const SEARCH_SUB_COST = new Float32Array(128 * 128).fill(1);
const SEARCH_INDEL_COST = new Float32Array(128).fill(1);
const SEARCH_ROWS = [new Float32Array(130), new Float32Array(130), new Float32Array(130)];
const SEARCH_TRANSPOSE_COST = 0.7;

(function initSearchCosts() {

    const code = ch => ch.charCodeAt(0);

    function setSub(a, b, cost) {
        SEARCH_SUB_COST[code(a) * 128 + code(b)] = cost;
        SEARCH_SUB_COST[code(b) * 128 + code(a)] = cost;
    }

    for (let i = 0; i < 128; i++) {
        SEARCH_SUB_COST[i * 128 + i] = 0;
    }

    // a neighbouring key on a phone/QWERTY keyboard is a likelier slip
    const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
    const shift = [0, 0.25, 0.75];
    const where = {};

    rows.forEach((row, r) => {
        row.split("").forEach((ch, c) => {
            where[ch] = { x: c + shift[r], y: r };
        });
    });

    Object.keys(where).forEach(a => {
        Object.keys(where).forEach(b => {
            if (a === b) return;
            const dy = Math.abs(where[a].y - where[b].y);
            const dx = Math.abs(where[a].x - where[b].x);
            if (dy <= 1 && dx <= 1) setSub(a, b, 0.7);
        });
    });

    // vowels (the key already merges a into o)
    setSub("o", "u", 0.4);
    setSub("i", "e", 0.3);
    setSub("e", "o", 0.45);
    setSub("i", "o", 0.65);
    setSub("e", "u", 0.7);
    setSub("i", "u", 0.75);

    // consonants that Bengali spellings swap around
    setSub("j", "g", 0.45);      // Ballygunge / Ballygunj
    setSub("s", "C", 0.45);      // Salta / Chalta
    setSub("k", "C", 0.5);
    setSub("t", "d", 0.5);
    setSub("r", "d", 0.45);      // Para / Pada
    setSub("r", "l", 0.55);
    setSub("n", "m", 0.5);
    setSub("n", "l", 0.6);
    setSub("g", "k", 0.6);
    setSub("p", "b", 0.7);

    // dropping a vowel or an "h" is the commonest slip of all
    "oiue".split("").forEach(v => { SEARCH_INDEL_COST[code(v)] = 0.35; });
    SEARCH_INDEL_COST[code("h")] = 0.25;
})();


function searchMaxCost(len) {

    if (len <= 2) return 0;
    if (len === 3) return 0.5;
    if (len <= 5) return 1.05;
    if (len <= 7) return 1.4;
    if (len <= 10) return 1.8;

    return 2.3;
}

// Cost to turn `a` (what was typed) into `b` (a word in the data).
// anchored=true lets `b` run on past the end (for half-typed words).
// Gives up early and returns Infinity once the cost exceeds `limit`.
function weightedDistance(a, b, limit, anchored) {

    const m = a.length;
    const n = b.length;

    if (m > 120 || n > 120) return Infinity;

    let prev2 = SEARCH_ROWS[0];
    let prev = SEARCH_ROWS[1];
    let cur = SEARCH_ROWS[2];

    prev[0] = 0;

    for (let j = 1; j <= n; j++) {
        prev[j] = prev[j - 1] + SEARCH_INDEL_COST[b.charCodeAt(j - 1) & 127];
    }

    for (let i = 1; i <= m; i++) {

        const ca = a.charCodeAt(i - 1) & 127;
        const delA = SEARCH_INDEL_COST[ca];
        const subRow = ca * 128;

        cur[0] = prev[0] + delA;

        let rowMin = cur[0];

        for (let j = 1; j <= n; j++) {

            const cb = b.charCodeAt(j - 1) & 127;

            let v = prev[j - 1] + SEARCH_SUB_COST[subRow + cb];

            const del = prev[j] + delA;
            if (del < v) v = del;

            const ins = cur[j - 1] + SEARCH_INDEL_COST[cb];
            if (ins < v) v = ins;

            if (
                i > 1 && j > 1 &&
                ca === (b.charCodeAt(j - 2) & 127) &&
                (a.charCodeAt(i - 2) & 127) === cb
            ) {
                const t = prev2[j - 2] + SEARCH_TRANSPOSE_COST;
                if (t < v) v = t;
            }

            cur[j] = v;

            if (v < rowMin) rowMin = v;
        }

        if (rowMin > limit) return Infinity;

        const tmp = prev2;
        prev2 = prev;
        prev = cur;
        cur = tmp;
    }

    if (!anchored) return prev[n];

    let best = Infinity;

    for (let j = 0; j <= n; j++) {
        if (prev[j] < best) best = prev[j];
    }

    return best;
}


// ---------- 4. How alike are a typed word and a word in the data? ----------
// 0 = unrelated, 1 = identical. Values below SEARCH_MIN_SIM are "no match".

const SEARCH_MIN_SIM = 0.6;
const SEARCH_MIN_PAIR_SIM = 0.66;
// Stricter against words almost every name shares: a short one ("puja")
// must be nearly exact or "pizza" would match it, a long one
// ("sarbojanin") can carry a typo or two.
function searchCommonFloor(len) {
    return len <= 5 ? 0.8 : (len <= 7 ? 0.74 : 0.66);
}

function searchTokenSimilarity(q, t, typing) {

    if (q.s === t.s) return 1;

    if (q.isNum || t.isNum) {
        return (q.isNum && t.isNum && typing && t.s.startsWith(q.s)) ? 0.8 : 0;
    }

    const ql = q.s.length;
    const tl = t.s.length;

    // A glued pair of data words (from "Bag Bazar" -> "bagbazar") exists
    // for long glued queries. A short typed word meets one only as a
    // plain prefix, or "nutan" would match "New Town".
    if (t.compound && !q.pair && q.k.length < 6) {
        return (typing && ql >= 3 && t.s.startsWith(q.s)) ? 0.9 + 0.1 * ql / tl : 0;
    }

    let best = 0;

    // typed text is the start of the word
    if (t.s.startsWith(q.s) && (ql >= 3 || (typing && ql >= 1))) {
        best = 0.9 + 0.1 * ql / tl;
    }

    // same sound
    if (q.k === t.k) {
        best = Math.max(best, 0.94);
    } else if (
        q.k.length >= 2 &&
        (typing || q.k.length >= 3) &&
        t.k.startsWith(q.k)
    ) {
        best = Math.max(best, 0.82 + 0.12 * q.k.length / t.k.length);
    }

    // typed text sits inside a longer word (tola in Ahiritola)
    if (ql >= 4 && best < 0.8 && t.s.includes(q.s)) {
        best = Math.max(best, 0.7 + 0.1 * ql / tl);
    }

    // same consonants, different vowels (Sarbojanin / Sirbijinin) — only
    // for longer words of similar length, or "ananda" would match "and"
    if (
        best < 0.74 && q.c.length >= 4 && q.c === t.c &&
        q.k.length >= 5 && t.k.length >= 5 &&
        Math.abs(q.k.length - t.k.length) <= 1
    ) {
        best = 0.74;
    }

    // close spelling
    const qk = q.k;
    const tk = t.k;
    const maxLen = Math.max(qk.length, tk.length);

    // the budget follows the shorter word (otherwise a long shared word
    // like "sarbojanin" would hide errors in the distinctive one), and
    // two words glued together get at most about one slip between them
    let limit = searchMaxCost(Math.min(qk.length, tk.length));
    if (q.pair) limit = Math.min(limit, 1.05);

    if (best < 0.92 && Math.abs(qk.length - tk.length) * 0.25 <= limit) {

        const d = weightedDistance(qk, tk, limit, false);

        if (d <= limit) {
            best = Math.max(best, 0.92 * (1 - d / maxLen));
        }
    }

    // half-typed word with a typo in it
    if (typing && best < 0.84 && qk.length >= 3) {

        let lim = searchMaxCost(qk.length) * 0.9;
        if (q.pair) lim = Math.min(lim, 1.0);
        const d = weightedDistance(qk, tk, lim, true);

        if (d <= lim) {
            best = Math.max(best, 0.84 * (1 - d / qk.length));
        }
    }

    return best;
}


// ---------- 5. Index ----------

const SEARCH_FIELDS = [
    { key: "name",     weight: 1.00 },
    { key: "club",     weight: 0.95 },
    // optional sheet column "Also Known As": other names people use for
    // the puja (comma / semicolon separated). Searched, never shown.
    { key: "aliases",  weight: 0.92, multi: true },
    { key: "landmark", weight: 0.72 },
    { key: "address",  weight: 0.58 },
    { key: "zone",     weight: 0.52 },
    { key: "city",     weight: 0.52 }
];

const SEARCH_NAME_FIELD_COUNT = 3;       // name + club + aliases count as "the name"
const SEARCH_MAX_QUERY_WORDS = 8;
const SEARCH_WEAK_DF = 0.12;             // a word in >12% of pandals is "common"

const SEARCH_ROMAN = [
    "", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
    "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"
];

// Sector V = Sector 5
function searchNumeralAlias(word) {

    if (/^\d+$/.test(word)) {
        const n = Number(word);
        return n >= 1 && n <= 20 ? SEARCH_ROMAN[n] : null;
    }

    const i = SEARCH_ROMAN.indexOf(word);

    return i > 0 ? String(i) : null;
}

// Words that say "this is a puja" rather than which one.
const SEARCH_STOP_KEYS = new Set(
    [
        "puja", "durga", "durgotsav", "utsav", "pandal", "mandap",
        "near", "the", "of", "and", "in", "at", "committee", "2025", "2026"
    ].map(word => phoneticKey(word))
);

let searchIndex = null;
let searchSimCache = new Map();


function buildSearchIndex(list) {

    const vocab = [];
    const vocabMap = new Map();
    const dfByKey = new Map();
    const docs = [];

    function idFor(text, isCompound) {

        if (text.length > 48) text = text.slice(0, 48);

        const slot = (isCompound ? "~" : "") + text;

        let id = vocabMap.get(slot);

        if (id === undefined) {
            id = vocab.length;

            const token = makeSearchToken(text);
            token.compound = Boolean(isCompound);

            vocab.push(token);
            vocabMap.set(slot, id);
        }

        return id;
    }

    list.forEach((pandal, position) => {

        const ids = [];
        const fields = [];
        const compound = [];
        const seenKeys = new Set();

        // one group of words per name / club / address / each alias
        const groups = [];

        SEARCH_FIELDS.forEach((field, f) => {

            const value = pandal[field.key];
            const parts = field.multi
                ? String(value || "").split(/[,;|\n]+/)
                : [value];

            parts.forEach(part => {

                const words = searchFold(part).split(" ").filter(Boolean);

                if (words.length) groups.push({ f, words });
            });
        });

        groups.forEach(({ f, words }) => {

            const push = (text, isCompound) => {
                ids.push(idFor(text, isCompound));
                fields.push(f);
                compound.push(isCompound ? 1 : 0);
            };

            words.forEach(word => {

                push(word, false);

                const alias = searchNumeralAlias(word);
                if (alias) push(alias, false);

                const key = vocab[idFor(word, false)].k;

                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    dfByKey.set(key, (dfByKey.get(key) || 0) + 1);
                }
            });

            // glued neighbours, so "bag bazar" can meet "baghbazar"
            for (let i = 0; i + 1 < words.length; i++) {
                push(words[i] + words[i + 1], true);
            }

            if (words.length >= 3) {
                push(words.join(""), true);
            }
        });

        // every way of writing the name: the name itself, then each alias
        const nameGroups = groups.filter(group => group.f < SEARCH_NAME_FIELD_COUNT);
        const joined = [];

        nameGroups.forEach(group => {

            const text = group.words.join("");

            if (group.f === 0 || group.f === 2) {
                joined.push(text);
            }
        });

        const nameWordCount = (groups.find(group => group.f === 0) || { words: [] }).words.length;

        docs.push({
            pandal,
            position,
            ids: Int32Array.from(ids),
            fields: Uint8Array.from(fields),
            compound: Uint8Array.from(compound),
            joined,
            joinedKeys: joined.map(text => phoneticKey(text)),
            nameWordCount,
            grams: trigramSet(phoneticKey(
                nameGroups.map(group => group.words.join("")).join("")
            ))
        });
    });

    // Words that nearly every name shares ("sarbojanin", "puja", "road")
    // are only matched closely — a loose look-alike of one of them
    // ("pizza" ~ "puja") says nothing about which pandal is meant.
    vocab.forEach(token => {

        const share = (dfByKey.get(token.k) || 0) / Math.max(1, list.length);

        token.common = !token.isNum &&
            (SEARCH_STOP_KEYS.has(token.k) || share >= SEARCH_WEAK_DF);
    });

    searchIndex = {
        source: list,
        vocab,
        dfByKey,
        docs,
        total: list.length
    };

    searchSimCache = new Map();

    return searchIndex;
}

function trigramSet(key) {

    const grams = new Set();
    const padded = "^" + key + "$";

    for (let i = 0; i + 3 <= padded.length; i++) {
        grams.add(padded.slice(i, i + 3));
    }

    return grams;
}


// ---------- 6. Search ----------

function searchSimilarities(token) {

    const cacheKey = token.s + (token.typing ? "|t" : "|f");

    let sims = searchSimCache.get(cacheKey);

    if (sims) return sims;

    const vocab = searchIndex.vocab;
    const minSim = token.pair ? SEARCH_MIN_PAIR_SIM : SEARCH_MIN_SIM;

    sims = new Float32Array(vocab.length);

    for (let v = 0; v < vocab.length; v++) {

        const sim = searchTokenSimilarity(token, vocab[v], token.typing);

        const floor = vocab[v].common
            ? Math.max(minSim, searchCommonFloor(vocab[v].k.length))
            : minSim;

        if (sim >= floor) sims[v] = sim;
    }

    if (searchSimCache.size > 400) searchSimCache.clear();

    searchSimCache.set(cacheKey, sims);

    return sims;
}


// Ranked pandals for whatever was typed. The array is in best-first
// order; .closest is true when nothing matched every word and these
// are the nearest partial matches instead; .scores runs parallel.
function searchPandals(rawQuery) {

    const raw = String(rawQuery === null || rawQuery === undefined ? "" : rawQuery);

    if (!searchIndex || searchIndex.source !== pandals) {
        buildSearchIndex(pandals);
    }

    const words = searchFold(raw).split(" ").filter(Boolean).slice(0, SEARCH_MAX_QUERY_WORDS);

    if (words.length === 0) {

        // blank = no filter; punctuation only ("!!!") = nothing to find
        const out = raw.trim() ? [] : pandals.slice();

        out.closest = false;
        out.scores = out.map(() => 0);

        return out;
    }

    const stillTyping = !/\s$/.test(raw);
    const { docs, total, dfByKey } = searchIndex;

    const tokens = words.map((word, i) => {

        const token = makeSearchToken(word.length > 40 ? word.slice(0, 40) : word);

        token.typing = stillTyping && i === words.length - 1;

        let df = dfByKey.get(token.k) || 0;

        // A spelling the data doesn't contain is judged by the word it
        // is closest to: a mangled "sarbojarqin" is still the very
        // common "sarbojanin", not a rare word nobody has.
        if (!df) {

            const sims = searchSimilarities(token);
            let bestSim = 0;
            let bestId = -1;

            for (let v = 0; v < sims.length; v++) {
                if (sims[v] > bestSim) { bestSim = sims[v]; bestId = v; }
            }

            if (bestId >= 0) df = dfByKey.get(searchIndex.vocab[bestId].k) || 0;
        }

        const idf = df ? Math.log(1 + total / df) / Math.log(1 + total) : 1;

        token.share = df / total;
        token.weight = Math.sqrt(Math.min(token.s.length, 9)) * (0.4 + 0.6 * idf);
        token.optional = SEARCH_STOP_KEYS.has(token.k) || token.share >= SEARCH_WEAK_DF;

        return token;
    });

    // a query made only of common words still has to match them
    if (tokens.every(token => token.optional)) {
        tokens.forEach(token => { token.optional = false; });
    }

    const n = tokens.length;

    // segments: each single word, plus each glued pair of neighbours
    const segments = [];

    tokens.forEach((token, i) => {
        segments.push({ token, from: i, to: i, single: true });
    });

    for (let i = 0; i + 1 < n; i++) {

        const pair = makeSearchToken(tokens[i].s + tokens[i + 1].s);

        pair.typing = tokens[i + 1].typing;
        pair.pair = true;

        segments.push({ token: pair, from: i, to: i + 1, single: false });
    }

    segments.forEach((segment, g) => {

        segment.g = g;
        segment.sims = searchSimilarities(segment.token);

        let all = 0;
        let required = 0;

        for (let i = segment.from; i <= segment.to; i++) {
            all += tokens[i].weight;
            if (!tokens[i].optional) required += tokens[i].weight;
        }

        segment.weightAll = all;
        segment.weightRequired = required;
        segment.minSim = segment.single ? SEARCH_MIN_SIM : SEARCH_MIN_PAIR_SIM;
    });

    const singles = segments.filter(segment => segment.single);
    const pairs = segments.filter(segment => !segment.single);

    const requiredTotal = tokens.reduce((sum, t) => sum + (t.optional ? 0 : t.weight), 0);
    const weightTotal = tokens.reduce((sum, t) => sum + t.weight, 0);

    const glued = tokens.map(t => t.s).join("");
    const gluedKey = phoneticKey(glued);

    const segCount = segments.length;
    const best = new Float32Array(segCount);        // best raw similarity in the pandal
    const bestWeighted = new Float32Array(segCount);
    const bestInName = new Float32Array(segCount);
    const fieldWeights = SEARCH_FIELDS.map(field => field.weight);

    const strict = [];
    const partial = [];

    for (let d = 0; d < docs.length; d++) {

        const doc = docs[d];

        best.fill(0);
        bestWeighted.fill(0);
        bestInName.fill(0);

        for (let e = 0; e < doc.ids.length; e++) {

            const id = doc.ids[e];
            const f = doc.fields[e];
            const scale = fieldWeights[f] * (doc.compound[e] ? 0.97 : 1);
            const inName = f < SEARCH_NAME_FIELD_COUNT;

            for (let g = 0; g < segCount; g++) {

                const sim = segments[g].sims[id];

                if (sim === 0) continue;

                if (sim > best[g]) best[g] = sim;
                if (sim * scale > bestWeighted[g]) bestWeighted[g] = sim * scale;
                if (inName && sim > bestInName[g]) bestInName[g] = sim;
            }
        }

        // choose the cover of the typed words (singles and/or glued pairs)
        // that matches the most weight
        const state = new Array(n + 1).fill(null);

        state[0] = { covered: 0, gain: 0, inName: true, weakest: 1 };

        for (let i = 0; i < n; i++) {

            const here = state[i];

            if (!here) continue;

            const options = [singles[i]];

            if (i + 1 < n) options.push(pairs[i]);

            for (const segment of options) {

                const g = segment.g;
                const hit = best[g] >= segment.minSim;
                const next = {
                    covered: here.covered + (hit ? segment.weightRequired : 0),
                    gain: here.gain + (hit ? segment.weightAll * bestWeighted[g] * (segment.single ? 1 : 0.98) : 0),
                    inName: here.inName && (
                        segment.weightRequired === 0 ||
                        (hit && bestInName[g] >= segment.minSim)
                    ),
                    weakest: (hit && segment.weightRequired > 0)
                        ? Math.min(here.weakest, best[g])
                        : here.weakest
                };

                const slot = segment.to + 1;
                const old = state[slot];

                if (
                    !old ||
                    next.covered > old.covered + 1e-9 ||
                    (Math.abs(next.covered - old.covered) <= 1e-9 && next.gain > old.gain)
                ) {
                    state[slot] = next;
                }
            }
        }

        const result = state[n];

        if (!result || result.gain === 0) continue;

        let score = result.gain / weightTotal;

        if (result.inName) score += 0.10;

        if (doc.joined.includes(glued)) score += 0.25;
        else if (doc.joinedKeys.includes(gluedKey)) score += 0.15;
        else if (glued.length >= 3 && doc.joined.some(text => text.startsWith(glued))) score += 0.08;

        const entry = {
            doc,
            score,
            weakest: result.weakest,
            coverage: requiredTotal > 0 ? result.covered / requiredTotal : 1
        };

        if (entry.coverage >= 0.999) {
            strict.push(entry);
        } else if (entry.coverage >= 0.25) {
            partial.push(entry);
        }
    }

    const byScore = (a, b) =>
        (b.score - a.score) ||
        (a.doc.nameWordCount - b.doc.nameWordCount) ||
        (a.doc.position - b.doc.position);

    let chosen = strict;
    let closest = false;

    if (strict.length === 0) {

        closest = true;

        partial.sort((a, b) => (b.coverage - a.coverage) || byScore(a, b));
        chosen = partial.slice(0, 25);

        // last resort: overall resemblance of the whole name, whatever the word breaks
        if (chosen.length === 0 && gluedKey.length >= 4) {

            const queryGrams = trigramSet(gluedKey);
            const near = [];

            docs.forEach(doc => {

                let shared = 0;

                queryGrams.forEach(gram => {
                    if (doc.grams.has(gram)) shared++;
                });

                const dice = (2 * shared) / (queryGrams.size + doc.grams.size);

                if (dice >= 0.45) near.push({ doc, score: dice, coverage: 0 });
            });

            near.sort(byScore);
            chosen = near.slice(0, 15);
        }

    } else {

        // When something matches confidently, drop the much weaker
        // look-alikes (a typo-level match for a short word is only
        // worth showing if nothing better exists).
        const top = strict.reduce((m, e) => Math.max(m, e.weakest), 0);

        if (top >= 0.9) {
            chosen = strict.filter(e => e.weakest >= 0.8);
        }

        chosen.sort(byScore);
    }

    const out = chosen.map(entry => entry.doc.pandal);

    out.closest = closest;
    out.scores = chosen.map(entry => entry.score);

    return out;
}
// <<< SEARCH-ENGINE:END


// ----------------------------------------
// 29. START
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
