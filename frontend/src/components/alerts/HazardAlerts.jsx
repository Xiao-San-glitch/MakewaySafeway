import { useCallback, useEffect, useRef, useState } from 'react';
import './HazardAlerts.css';

const CHECK_INTERVAL = 30000;
const ALERT_RADIUS_KM = 3;

const HAZARD_LABELS = {
  flood: 'Flood',
  waterlogging: 'Waterlogging',
  road_closure: 'Road Closure',
  crash: 'Accident',
  obstacle: 'Road Obstacle',
  poor_lighting: 'Poor Lighting',
  other: 'Road Hazard',
};

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playAlertSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.value = 0.15;

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();

    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + 0.5
    );

    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => context.close();
  } catch (error) {
    console.warn('Unable to play alert sound:', error);
  }
}

export default function HazardAlerts({
  location,
  enabled = true,
  radiusKm = ALERT_RADIUS_KM,
}) {
  const [nearbyHazards, setNearbyHazards] = useState([]);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const refreshRef = useRef(null);
  const notifiedIds = useRef(new Set());
  const firstCheck = useRef(true);
  const locationRef = useRef(location);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const enableNotifications = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('Browser notifications are not supported.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationEnabled(permission === 'granted');

      if (permission !== 'granted') {
        setError('Notification permission was not granted.');
      } else {
        setError('');
      }
    } catch {
      setError('Unable to enable browser notifications.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkHazards() {
      const currentLocation = locationRef.current;

      const hasLocation =
        currentLocation != null &&
        Number.isFinite(Number(currentLocation.latitude)) &&
        Number.isFinite(Number(currentLocation.longitude));

      try {
        const response = await fetch('/api/hazards');

        if (!response.ok) {
          throw new Error(`Hazard request failed: ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const hazards = Array.isArray(data.hazards) ? data.hazards : [];

        const activeHazards = hazards
          .filter((hazard) => {
            if (
              !Number.isFinite(Number(hazard.latitude)) ||
              !Number.isFinite(Number(hazard.longitude))
            ) {
              return false;
            }

            if (
              ['resolved', 'rejected', 'expired'].includes(
                String(hazard.status || '').toLowerCase()
              )
            ) {
              return false;
            }

            if (!hasLocation) return true;

            const distance = distanceKm(
              Number(currentLocation.latitude),
              Number(currentLocation.longitude),
              Number(hazard.latitude),
              Number(hazard.longitude)
            );

            return distance <= radiusKm;
          })
          .map((hazard) => ({
            ...hazard,
            distance_km: hasLocation
              ? distanceKm(
                  Number(currentLocation.latitude),
                  Number(currentLocation.longitude),
                  Number(hazard.latitude),
                  Number(hazard.longitude)
                )
              : null,
          }))
          .sort((a, b) => {
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
          });

        setNearbyHazards(activeHazards);
        setLastChecked(new Date());
        setError('');

        const isFirstCheck = firstCheck.current;
        firstCheck.current = false;

        // Do not sound an alert for existing reports on initial load.
        if (isFirstCheck) {
          activeHazards.forEach((hazard) => {
            notifiedIds.current.add(String(hazard.id ?? [
              hazard.type,
              hazard.latitude,
              hazard.longitude,
              hazard.reported_at || '',
            ].join('-')));
          });
          return;
        }

        for (const hazard of activeHazards) {
          const id = String(hazard.id ?? [
            hazard.type,
            hazard.latitude,
            hazard.longitude,
            hazard.reported_at || '',
          ].join('-'));

          if (notifiedIds.current.has(id)) continue;
          notifiedIds.current.add(id);

          const label = HAZARD_LABELS[hazard.type] || 'Road Hazard';
          const distanceText = hazard.distance_km == null
            ? 'Location distance unavailable; enable GPS to check proximity.'
            : `${hazard.distance_km.toFixed(1)} km away.`;

          if (
            notificationEnabled &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            new Notification(`MakeWaySafeWay: ${label}`, {
              body: `${hazard.note || hazard.description || 'A hazard was reported.'} ${distanceText}`,
              tag: `mws-hazard-${id}`,
            });
          }

          if (soundEnabledRef.current) {
            playAlertSound();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          }
        }
      } catch (fetchError) {
        if (!cancelled) {
          console.error('Hazard alert check failed:', fetchError);
          setError('Unable to check nearby hazards.');
        }
      }
    }

    refreshRef.current = async () => {
      setRefreshing(true);
      try {
        await checkHazards();
      } finally {
        setRefreshing(false);
      }
    };

    checkHazards();

    const timer = window.setInterval(checkHazards, CHECK_INTERVAL);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      refreshRef.current = null;
    };
  }, [radiusKm, notificationEnabled]);

  const hasLocation =
    location != null &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude));

  return (
    <section className="hazard-alerts" aria-label="Nearby hazard alerts">
      <h3>{hasLocation ? 'Nearby Hazard Alerts' : 'Community Hazard Reports'}</h3>

      <div className="hazard-alert-controls">
        <button
          type="button"
          onClick={() => refreshRef.current?.()}
          disabled={refreshing}
        >
          {refreshing ? 'Checking…' : 'Refresh Hazards'}
        </button>

        <button
          type="button"
          onClick={enableNotifications}
          disabled={notificationEnabled}
        >
          {notificationEnabled ? 'Notifications Enabled' : 'Enable Notifications'}
        </button>

        <button
          type="button"
          onClick={() => setSoundEnabled((value) => !value)}
          aria-pressed={soundEnabled}
        >
          Sound: {soundEnabled ? 'On' : 'Off'}
        </button>
      </div>

      {error && <p role="status">{error}</p>}

      <p>
        {hasLocation
          ? `Checking automatically every 30 seconds within ${radiusKm} km of your location.`
          : 'GPS is off. Showing active reports without verifying their distance from you.'}
      </p>

      <p aria-live="polite">
        {lastChecked
          ? `Last checked: ${lastChecked.toLocaleTimeString()}`
          : 'Loading hazard reports…'}
      </p>

      {nearbyHazards.length === 0 ? (
        <div className="hazard-alert-empty">
          {hasLocation
            ? `No active hazards found within ${radiusKm} km of your current location.`
            : 'No active community hazard reports were found.'}
        </div>
      ) : (
        <ul className="hazard-alert-list">
          {nearbyHazards.map((hazard, index) => {
            const status = String(hazard.status || 'unverified').toLowerCase();
            const label = HAZARD_LABELS[hazard.type] || 'Road Hazard';
            const description =
              hazard.note || hazard.description || 'No additional details provided.';
            const source =
              hazard.source_type === 'community_unverified'
                ? 'Community report · Unverified'
                : hazard.source_type || 'Report source unknown';

            return (
              <li
                className="hazard-alert-card"
                data-type={hazard.type || 'other'}
                key={hazard.id ?? `${hazard.type}-${hazard.latitude}-${hazard.longitude}-${index}`}
              >
                <div className="hazard-alert-card-header">
                  <strong>{label}</strong>
                  <span className="hazard-alert-distance">
                    {hazard.distance_km == null
                      ? 'Distance unknown'
                      : `${hazard.distance_km.toFixed(1)} km away`}
                  </span>
                </div>

                <p className="hazard-alert-description">{description}</p>

                <div className="hazard-alert-meta">
                  <span className="hazard-alert-status" data-status={status}>
                    {status.replaceAll('_', ' ')}
                  </span>
                  <span className="hazard-alert-source">{source}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
