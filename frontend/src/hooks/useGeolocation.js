import { useCallback, useEffect, useRef, useState } from "react";

export default function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState("unknown");
  const watchId = useRef(null);

  const stopWatching = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location services.");
      setPermission("unsupported");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setPermission("granted");
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === 1) {
          setPermission("denied");
          setError("Location permission was denied. Allow location access in your browser settings.");
        } else if (err.code === 2) {
          setError("Your location is unavailable. Check your device location settings.");
        } else if (err.code === 3) {
          setError("The location request timed out. Please try again.");
        } else {
          setError("Unable to retrieve your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Your browser does not support location services.");
      return;
    }
    stopWatching();
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setPermission("granted");
        setError("");
      },
      (err) => {
        setError(err.code === 1 ? "Location permission was denied." : "Unable to update your current location.");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, [stopWatching]);

  useEffect(() => () => stopWatching(), [stopWatching]);

  return { location, loading, error, permission, requestLocation, startWatching, stopWatching };
}
