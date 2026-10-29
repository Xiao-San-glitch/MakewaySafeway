export default function LiveLocationButton({ loading, location, error, onRequestLocation }) {
  return (
    <div className="live-location-control">
      <button
        type="button"
        className={`location-toggle ${location ? "enabled" : ""}`}
        onClick={onRequestLocation}
        disabled={loading}
      >
        {loading
          ? "Getting your location…"
          : location
            ? "✓ Refresh live location"
            : "◎ Allow live location"}
      </button>
      {location && (
        <p className="location-help">
          Current location · {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
          {Number.isFinite(location.accuracy) ? ` · ±${Math.round(location.accuracy)} m` : ""}
        </p>
      )}
      {error && <p className="location-error" role="alert">{error}</p>}
    </div>
  );
}
