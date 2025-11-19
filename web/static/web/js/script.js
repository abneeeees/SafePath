const SAFE_ROUTE_URL = "/api/safe-route/";

    const map = L.map("map").setView([28.6139, 77.209], 30);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    let clickCount = 0;
    let userMarker = null;   // start
    let destMarker = null;   // destination

    let originalLayer = null;
    let safeLayer = null;

    const statusEl = document.getElementById("status");
    const statsEl = document.getElementById("stats");

    function setStatus(text) {
        statusEl.textContent = text;
    }

    function setUserLocation(lat, lon) {
        if (userMarker) userMarker.setLatLng([lat, lon]);
        else userMarker = L.marker([lat, lon], { title: "You" }).addTo(map);
        map.setView([lat, lon], 15);
        setStatus("Location acquired.");
    }

    const fallback_start = [28.474780644693578, 77.47638190820159];
    setStatus("Requesting location...");

    if (navigator.geolocation) {

    navigator.geolocation.getCurrentPosition(
        pos => {
            setUserLocation(pos.coords.latitude, pos.coords.longitude);
            clickCount = 1;  // geolocation acts as first click
        },
        err => {
            console.warn("geolocation error", err);
            setStatus("Using default starting location.");
            setUserLocation(fallback_start[0], fallback_start[1]);
            clickCount = 1;
        },
            { enableHighAccuracy: true }
    );
    } else {
        setStatus("Geolocation not supported. Using default starting location.");
        setUserLocation(fallback_start[0], fallback_start[1]);
        clickCount = 1;
    }

    // CLEAR BUTTON
    document.getElementById('clear').addEventListener('click', function () {
        if (originalLayer) map.removeLayer(originalLayer);
        if (safeLayer) map.removeLayer(safeLayer);
        if (userMarker) map.removeLayer(userMarker);
        if (destMarker) map.removeLayer(destMarker);

        originalLayer = null;
        safeLayer = null;
        userMarker = null;
        destMarker = null;

        clickCount = 0;

        statsEl.innerHTML = '';
        setStatus("Cleared. Click map to choose start, then destination.");
    });

    // MAP CLICK HANDLER
    map.on('click', async function (e) {
    clickCount++;

    // FIRST CLICK → START
    if (clickCount === 1) {
        userMarker = L.marker(e.latlng, { title: "Start" }).addTo(map);
        setStatus("Start selected. Now click destination.");
        return;
    }

    // SECOND CLICK → DESTINATION + ROUTE
    if (clickCount === 2) {
        destMarker = L.marker(e.latlng, { title: "Destination" }).addTo(map);
        setStatus("Destination selected. Fetching safe route…");

        await requestSafeRouteAndDraw(
        userMarker.getLatLng().lat,
        userMarker.getLatLng().lng,
        destMarker.getLatLng().lat,
        destMarker.getLatLng().lng
        );

        return;
    }

    // THIRD CLICK → RESET + NEW START
    if (clickCount >= 3) {
        if (originalLayer) map.removeLayer(originalLayer);
        if (safeLayer) map.removeLayer(safeLayer);
        if (userMarker) map.removeLayer(userMarker);
        if (destMarker) map.removeLayer(destMarker);

        originalLayer = null;
        safeLayer = null;
        userMarker = null;
        destMarker = null;

        clickCount = 1; 
        userMarker = L.marker(e.latlng, { title: "Start" }).addTo(map);

        statsEl.innerHTML = "";
        setStatus("Restarted. Start selected — click destination.");
        return;
    }
    });

    
    // SAFE ROUTE DRAW
    async function requestSafeRouteAndDraw(startLat, startLon, endLat, endLon) {

    setStatus("Fetching routes...");
    const url = `${SAFE_ROUTE_URL}?start_lat=${startLat}&start_lon=${startLon}&end_lat=${endLat}&end_lon=${endLon}`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Server error " + res.status);

        const data = await res.json();

        if (originalLayer) map.removeLayer(originalLayer);
        originalLayer = L.polyline(data.original_route.map(p => [p[0], p[1]]), {
        weight: 6,
        opacity: 0.0
        }).addTo(map);

        if (safeLayer) map.removeLayer(safeLayer);
        safeLayer = L.polyline(data.safe_path.map(p => [p[0], p[1]]), {
        weight: 6,
        opacity: 1
        }).addTo(map);

        const allPoints = data.original_route.concat(data.safe_path).map(p => [p[0], p[1]]);
        map.fitBounds(allPoints, { padding: [40, 40] });

            statsEl.innerHTML = "";
            const li = (txt) => {
                const el = document.createElement("li");
                el.textContent = txt;
                return el;
            };
            statsEl.appendChild(li(`Segments (OSRM): ${data.segments}`));
            statsEl.appendChild(li(`Graph nodes: ${data.nodes}`));
            statsEl.appendChild(
                li(`Distance (m): ${Math.round(data.distance_meters)}`),
            );
            statsEl.appendChild(
                li(`Avg segment risk: ${Number(data.avg_risk).toFixed(3)}`),
            );


        setStatus("Route rendered. Original = gray, safe = green.");

    } catch (err) {
        console.error(err);
        setStatus("Error: " + err.message);
    }
}
async function geocode(place) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.length === 0) return null;

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}

document.getElementById("directions-btn").addEventListener("click", async () => {
    const fromText = document.getElementById("from-input").value.trim();
    const toText = document.getElementById("to-input").value.trim();

    if (!fromText || !toText) {
        alert("Please enter both locations.");
        return;
    }

    setStatus("Finding locations...");

    const fromLoc = await geocode(fromText);
    const toLoc = await geocode(toText);

    if (!fromLoc) {
        setStatus("Starting location not found.");
        return;
    }
    if (!toLoc) {
        setStatus("Destination not found.");
        return;
    }

    // Place markers
    if (userMarker) map.removeLayer(userMarker);
    if (destMarker) map.removeLayer(destMarker);

    userMarker = L.marker([fromLoc.lat, fromLoc.lon], { title: "Start" }).addTo(map);
    destMarker = L.marker([toLoc.lat, toLoc.lon], { title: "Destination" }).addTo(map);

    map.setView([fromLoc.lat, fromLoc.lon], 15);

    // Fetch safe path
    setStatus("Fetching route...");
    await requestSafeRouteAndDraw(
        fromLoc.lat,
        fromLoc.lon,
        toLoc.lat,
        toLoc.lon
    );
});
userMarker = L.marker([fromLoc.lat, fromLoc.lon], { icon: startIcon });
destMarker = L.marker([toLoc.lat, toLoc.lon], { icon: endIcon });
