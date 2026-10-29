import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map-feature.css";

export default function MapView({
  location,
  theme = "dark",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyRef = useRef(null);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: [24.817, 93.9368],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    L.control.zoom({
      position: "bottomright",
    }).addTo(map);

    mapRef.current = map;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();

      mapRef.current = null;
      tileLayerRef.current = null;
      markerRef.current = null;
      accuracyRef.current = null;
    };
  }, []);

  // Load OpenStreetMap tiles and update the appearance by theme.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

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

  // Update the current location marker.
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !location) {
      return;
    }

    const lat = Number(location.lat);
    const lon = Number(location.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

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
      accuracyRef.current
        .setLatLng(position)
        .setRadius(accuracy);
    }

    map.setView(position, Math.max(map.getZoom(), 15));
  }, [location]);

  // Keep the map correctly sized inside the homepage layout.
  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

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
        className="home-interactive-map"
        aria-label="Interactive map showing your current location"
      />
    </div>
  );
}