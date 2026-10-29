import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map-feature.css";
import { getHazards } from "../../api";

const HAZARD_STYLES = {
  waterlogging: {
    color: "#0ea5e9",
    icon: "🌊",
    label: "Waterlogging",
  },
  flood: {
    color: "#2563eb",
    icon: "🌊",
    label: "Flood",
  },
  road_closure: {
    color: "#dc2626",
    icon: "🚧",
    label: "Road Closure",
  },
  crash: {
    color: "#ea580c",
    icon: "🚨",
    label: "Accident",
  },
  obstacle: {
    color: "#ca8a04",
    icon: "⚠️",
    label: "Road Obstacle",
  },
  poor_lighting: {
    color: "#9333ea",
    icon: "💡",
    label: "Poor Lighting",
  },
  other: {
    color: "#64748b",
    icon: "⚠️",
    label: "Other Hazard",
  },
};

function getHazardStyle(type) {
  return (
    HAZARD_STYLES[String(type || "other").toLowerCase()] ||
    HAZARD_STYLES.other
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

export default function MapView({ location, theme = "dark", pickingLocation = false, selectedPoint = null, onPointSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyRef = useRef(null);
  const hazardLayerRef = useRef(null);
  const selectedPointMarkerRef = useRef(null);

  const [hazards, setHazards] = useState([]);
  const [hazardError, setHazardError] = useState("");

  // Fetch public hazard reports and refresh every 30 seconds.
  useEffect(() => {
    let cancelled = false;

    async function loadHazards() {
      try {
        const data = await getHazards();

        if (cancelled) return;

        const records = Array.isArray(data)
          ? data
          : Array.isArray(data?.hazards)
            ? data.hazards
            : [];

        setHazards(records);
        setHazardError("");
      } catch (error) {
        if (cancelled) return;

        console.error("Unable to load hazard reports:", error);
        setHazardError("Hazard reports are currently unavailable.");
      }
    }

    loadHazards();

    const interval = setInterval(loadHazards, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [24.817, 93.9368],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapRef.current = map;

    // Separate layer for hazard markers.
    hazardLayerRef.current = L.layerGroup().addTo(map);

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    const handleMapClick = (event) => {
      if (!pickingLocation || typeof onPointSelect !== "function") return;
      onPointSelect({
        lat: Number(event.latlng.lat.toFixed(6)),
        lon: Number(event.latlng.lng.toFixed(6)),
      });
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
      clearTimeout(resizeTimer);
      map.remove();

      mapRef.current = null;
      tileLayerRef.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
      hazardLayerRef.current = null;
    };
  }, [pickingLocation, onPointSelect]);

  // Apply the selected theme to the map tiles.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    tileLayerRef.current = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        subdomains: ["a", "b", "c"],
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        className:
          theme === "dark"
            ? "makeway-dark-map-tiles"
            : "makeway-light-map-tiles",
      }
    ).addTo(map);

    map.invalidateSize();
  }, [theme]);

  // Update the live location marker and accuracy circle.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !location) return;

    const lat = Number(location.lat);
    const lon = Number(location.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return;
    }

    const position = [lat, lon];
    const accuracy = Number(location.accuracy) || 20;

    if (!markerRef.current) {
      markerRef.current = L.circleMarker(position, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2563eb",
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup("Your current location");
    } else {
      markerRef.current.setLatLng(position);
    }

    if (!accuracyRef.current) {
      accuracyRef.current = L.circle(position, {
        radius: accuracy,
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(map);
    } else {
      accuracyRef.current.setLatLng(position).setRadius(accuracy);
    }

    map.setView(position, Math.max(map.getZoom(), 15));
  }, [location]);

  // Display the selected report location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedPoint || !Number.isFinite(Number(selectedPoint.lat)) || !Number.isFinite(Number(selectedPoint.lon))) {
      if (selectedPointMarkerRef.current) {
        map.removeLayer(selectedPointMarkerRef.current);
        selectedPointMarkerRef.current = null;
      }
      return;
    }

    const position = [Number(selectedPoint.lat), Number(selectedPoint.lon)];

    if (!selectedPointMarkerRef.current) {
      selectedPointMarkerRef.current = L.marker(position, {
        title: "Selected hazard location",
        keyboard: true,
      }).addTo(map);
    } else {
      selectedPointMarkerRef.current.setLatLng(position);
    }

    selectedPointMarkerRef.current.bindPopup("Selected hazard location");
    if (pickingLocation) {
      map.setView(position, Math.max(map.getZoom(), 15));
    }
  }, [selectedPoint, pickingLocation]);

  // Display hazard reports without creating duplicate markers.
  useEffect(() => {
    const map = mapRef.current;
    const layer = hazardLayerRef.current;

    if (!map || !layer) return;

    layer.clearLayers();

    hazards.forEach((hazard) => {
      const lat = Number(hazard.latitude);
      const lon = Number(hazard.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return;
      }

      const style = getHazardStyle(hazard.type);

      const marker = L.circleMarker([lat, lon], {
        radius: 10,
        color: "#ffffff",
        weight: 2,
        fillColor: style.color,
        fillOpacity: 0.95,
      });

      const popup = `
        <div class="hazard-popup">
          <strong>${style.icon} ${escapeHtml(style.label)}</strong>
          <p>${escapeHtml(hazard.note || "No additional details")}</p>
          <small>
            Status: ${escapeHtml(hazard.status || "unverified")}
          </small>
          <br />
          <small>Community report — not independently verified</small>
        </div>
      `;

      marker.bindPopup(popup);
      marker.addTo(layer);
    });
  }, [hazards]);

  // Keep the map correctly sized inside the homepage layout.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) return;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => clearTimeout(timer);
  }, [theme]);

  return (
    <div
      className={`map-view-container ${
        theme === "dark" ? "map-theme-dark" : "map-theme-light"
      }`}
    >
      <div
        ref={containerRef}
        className={`home-interactive-map ${pickingLocation ? "map-location-picker" : ""}`}
        aria-label={pickingLocation
          ? "Click the map to select the hazard location"
          : "Interactive map showing your location and reported hazards"}
      />

      {hazardError && (
        <div className="map-hazard-error" role="status">
          {hazardError}
        </div>
      )}

      <div className="map-hazard-legend">
        <strong>Map Legend</strong>

        <div>
          <span className="legend-dot legend-location" />
          Your Location
        </div>

        <div>
          <span className="legend-dot legend-water" />
          Waterlogging / Flood
        </div>

        <div>
          <span className="legend-dot legend-danger" />
          Other Hazards
        </div>

        <small>{hazards.length} reports loaded</small>
      </div>
    </div>
  );
}