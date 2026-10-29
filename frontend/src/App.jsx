import MapView from "./components/map/MapView.jsx";
import LiveLocationButton from "./components/map/LiveLocationButton.jsx";
import useGeolocation from "./hooks/useGeolocation.js";
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { api, getHazards } from './api.js';
import './journey-autocomplete.css';

export default function App() {
  const gps = useGeolocation();
  const [page, setPage] = useState('home');
  const [theme, setTheme] = useState(() => localStorage.getItem('mws_theme') || 'dark');
  const [voiceEnabled, setVoiceEnabled] = useState(() => localStorage.getItem('mws_voice') !== 'off');
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('mws_user') || 'null'); } catch { return null; } });
  const [authMode, setAuthMode] = useState('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [history, setHistory] = useState([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [startSearching, setStartSearching] = useState(false);
  const [endSearching, setEndSearching] = useState(false);
  const [routeFrom, setRouteFrom] = useState(null);
  const [routeTo, setRouteTo] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [livePosition, setLivePosition] = useState(null);
  const [nearbyHazards, setNearbyHazards] = useState([]);
  const watchId = useRef(null), liveMarker = useRef(null);
  const [hazards, setHazards] = useState([]);
  const [route, setRoute] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [weather, setWeather] = useState(null);
  const [risk, setRisk] = useState(null);
  const [kind, setKind] = useState('waterlogging');
  const [note, setNote] = useState('');
  const [contacts, setContacts] = useState(['', '']);
  const [status, setStatus] = useState('Welcome to MakeWaySafeWay.');
  const [busy, setBusy] = useState(false);
  const mapNode = useRef(null), map = useRef(null), routeLayer = useRef(null), hazardLayer = useRef(null);

  function go(next) { if (next === page) return; setHistory(h => [...h, page]); setPage(next); }
  function back() {
    if (!history.length) { setPage('home'); return; }
    const previous = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setPage(previous || 'home');
  }
  function home() { setPage('home'); setHistory([]); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('mws_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('mws_voice', voiceEnabled ? 'on' : 'off'); if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }, [voiceEnabled]);
  useEffect(() => {
    if (!gps.location) return;
    const point = { lat: gps.location.lat, lon: gps.location.lon };
    setLocation(point);
    setLivePosition(point);
    setLocationEnabled(true);
    setStart(`${point.lat}, ${point.lon}`);
    setStartPoint(point);
    setNearbyHazards(hazards.filter(h => distanceKm(point, { lat: h.latitude, lon: h.longitude }) <= 5));
    setStatus('Location enabled. Only nearby reports are shown for your current area.');
  }, [gps.location]);
  useEffect(() => { if (gps.error) setStatus(gps.error); }, [gps.error]);

  useEffect(() => { refreshHazards(); const id = setInterval(refreshHazards, 30000); return () => clearInterval(id); }, []);

  // Autocomplete both starting point and destination using OpenStreetMap Nominatim.
  useEffect(() => {
    const query = start.trim();
    if (query.length < 3 || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query) || (startPoint && startPoint.label === query)) { setStartSuggestions([]); setStartSearching(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStartSearching(true);
      try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal }); const data = await r.json(); if (!controller.signal.aborted) setStartSuggestions(data.map(p => ({ label: p.display_name, lat: Number(p.lat), lon: Number(p.lon) }))); }
      catch (e) { if (e.name !== 'AbortError') setStartSuggestions([]); }
      finally { if (!controller.signal.aborted) setStartSearching(false); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [start]);

  useEffect(() => {
    const query = end.trim();
    if (query.length < 3 || /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(query) || (endPoint && endPoint.label === query)) { setEndSuggestions([]); setEndSearching(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEndSearching(true);
      try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal }); const data = await r.json(); if (!controller.signal.aborted) setEndSuggestions(data.map(p => ({ label: p.display_name, lat: Number(p.lat), lon: Number(p.lon) }))); }
      catch (e) { if (e.name !== 'AbortError') setEndSuggestions([]); }
      finally { if (!controller.signal.aborted) setEndSearching(false); }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [end]);
  useEffect(() => {
    if (page !== 'route' || !navigator.geolocation || !locationEnabled) return;
    watchId.current = navigator.geolocation.watchPosition(pos => {
      const point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setLivePosition(point);
      if (map.current) {
        if (!liveMarker.current) liveMarker.current = L.circleMarker([point.lat, point.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map.current).bindPopup('Your live location');
        else liveMarker.current.setLatLng([point.lat, point.lon]);
        map.current.panTo([point.lat, point.lon], { animate: true, duration: 0.6 });
      }
    }, () => setStatus('Live location unavailable. Check browser location permission.'), { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; liveMarker.current = null; };
  }, [page, locationEnabled]);
  useEffect(() => {
    if (page !== 'route' || !mapNode.current || map.current) return;
    map.current = L.map(mapNode.current).setView(location ? [location.lat, location.lon] : [24.817, 93.9368], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
    routeLayer.current = L.layerGroup().addTo(map.current); hazardLayer.current = L.layerGroup().addTo(map.current);
    if (location) L.marker([location.lat, location.lon]).addTo(map.current).bindPopup('Starting point');
    return () => { map.current?.remove(); map.current = null; routeLayer.current = null; hazardLayer.current = null; };
  }, [page]);
  useEffect(() => {
    if (!hazardLayer.current) return;
    hazardLayer.current.clearLayers();
    const visibleHazards = location ? hazards.filter(h => distanceKm(location,{lat:h.latitude,lon:h.longitude}) <= 5) : [];
    visibleHazards.forEach(h => L.circleMarker([h.latitude, h.longitude], { radius: 7, color: '#f59e0b', fillOpacity: .8 }).bindPopup(`<b>${esc(h.type)}</b><br>${esc(h.note || '')}<br>Unverified community report`).addTo(hazardLayer.current));
  }, [hazards, page]);

  async function refreshHazards() { try { const d = await getHazards(); setHazards(Array.isArray(d) ? d : (d.hazards || [])); } catch (err) { console.warn('Could not load public hazard reports:', err.message); } }
  function distanceKm(a, b) { const rad=n=>n*Math.PI/180; const dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon); const x=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
  function openJourney() { if (!user) { setStatus('Please log in to plan a journey. Live location remains available without an account.'); setAuthMode('login'); go('auth'); return; } if (location) { const text = `${location.lat}, ${location.lon}`; setStart(text); setStartPoint({ ...location, label: text }); } else { setStart(''); setStartPoint(null); } setEnd(''); setEndPoint(null); setStartSuggestions([]); setEndSuggestions([]); setNearbyHazards([]); go('journey'); }
  async function getPlace(q, selectedPoint = null) {
    if (selectedPoint && selectedPoint.label === q && Number.isFinite(selectedPoint.lat) && Number.isFinite(selectedPoint.lon)) return { lat: selectedPoint.lat, lon: selectedPoint.lon };
    if (q.includes(',')) return parseCoords(q);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('Place search is temporarily unavailable. Try again.');
    const d = await r.json(); if (!d.length) throw new Error(`Place not found: ${q}. Add the city or use latitude, longitude.`);
    return { lat: +d[0].lat, lon: +d[0].lon };
  }
  async function getWeather(p) {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,precipitation,rain,wind_speed_10m`);
    if (!r.ok) throw new Error('Weather request failed.'); const d = await r.json();
    return { temperature_c: d.current?.temperature_2m, precipitation_mm: d.current?.precipitation, rain_mm: d.current?.rain ?? d.current?.precipitation ?? 0, wind_kmh: d.current?.wind_speed_10m, observed_at: d.current?.time, source: 'Open-Meteo' };
  }
  function choosePlace(which, place) {
    const point = { lat: place.lat, lon: place.lon, label: place.label };
    if (which === 'start') { setStart(place.label); setStartPoint(point); setStartSuggestions([]); }
    else { setEnd(place.label); setEndPoint(point); setEndSuggestions([]); }
  }
  function swapLocations() {
    setStart(end); setEnd(start); setStartPoint(endPoint); setEndPoint(startPoint); setStartSuggestions([]); setEndSuggestions([]);
  }
  function currentLocation() {
    if (!navigator.geolocation) return setStatus('This browser does not support location.');
    setStatus('Requesting location permission…');
    navigator.geolocation.getCurrentPosition(p => { const point={lat:p.coords.latitude,lon:p.coords.longitude}; setLocation(point); setLivePosition(point); setLocationEnabled(true); setStart(`${point.lat}, ${point.lon}`); setStartPoint({ ...point, label: `${point.lat}, ${point.lon}` }); setNearbyHazards(hazards.filter(h => distanceKm(point,{lat:h.latitude,lon:h.longitude}) <= 5)); setStatus('Location enabled. Only nearby reports are shown for your current area.'); }, () => { setLocationEnabled(false); setStatus('Location permission denied. Allow location in your browser settings and try again.'); }, {enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  }
  async function findRoute(e) {
    e?.preventDefault();

    if (!user) {
      setStatus('Please log in to plan a journey.');
      setAuthMode('login');
      go('auth');
      return;
    }

    if (!start.trim() || !end.trim()) {
      setStatus('Enter both a starting point and destination.');
      return;
    }

    setBusy(true);
    setStatus('Finding available driving routes…');
    setRoute(null);
    setRoutes([]);
    setSelectedRouteIndex(0);
    setRisk(null);

    try {
      const from = await getPlace(start, startPoint);
      const to = await getPlace(end, endPoint);

      setRouteFrom(from);
      setRouteTo(to);

      const nearby = hazards.filter(
        h =>
          Number.isFinite(Number(h.latitude)) &&
          Number.isFinite(Number(h.longitude)) &&
          distanceKm(from, {
            lat: Number(h.latitude),
            lon: Number(h.longitude),
          }) <= 5
      );
      setNearbyHazards(nearby);

      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${from.lon},${from.lat};${to.lon},${to.lat}` +
        `?overview=full&geometries=geojson&steps=true&alternatives=true`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Routing service unavailable. Try again later.');
      }

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new Error('No driving route found for these locations.');
      }

      const availableRoutes = data.routes;
      const firstRoute = availableRoutes[0];

      setRoutes(availableRoutes);
      setSelectedRouteIndex(0);
      setLocation(from);
      setRoute(firstRoute);

      const w = await getWeather(from).catch(() => null);
      setWeather(w);

      const riskResult = await api('/api/route-risk', {
        method: 'POST',
        body: JSON.stringify({
          distance_m: firstRoute.distance,
          duration_s: firstRoute.duration,
          hazards,
          weather: w,
        }),
      });
      setRisk(riskResult);

      go('route');
      setStatus(
        availableRoutes.length > 1
          ? `Route loaded. ${availableRoutes.length} driving options are available.`
          : 'Route loaded. One driving option is available.'
      );
    } catch (err) {
      setStatus(err.message || 'Could not calculate the route.');
    } finally {
      setBusy(false);
    }
  }

  async function chooseRoute(index) {
    const selected = routes[index];
    if (!selected) return;

    setSelectedRouteIndex(index);
    setRoute(selected);
    setRisk(null);
    setStatus(`Switched to driving option ${index + 1}.`);

    try {
      const result = await api('/api/route-risk', {
        method: 'POST',
        body: JSON.stringify({
          distance_m: selected.distance,
          duration_s: selected.duration,
          hazards,
          weather,
        }),
      });
      setRisk(result);
    } catch {
      setStatus(
        'Route changed, but the risk estimate is temporarily unavailable.'
      );
    }
  }

  useEffect(() => {
    if (page !== 'route' || !map.current || !route) return;
    routeLayer.current?.clearLayers();
    const line=L.geoJSON(route.geometry,{style:{color:'#22c7a9',weight:6,opacity:.9}}).addTo(routeLayer.current);
    map.current.fitBounds(line.getBounds(),{padding:[25,25]});
  }, [page, route]);
  async function submitReport(e) {
    e.preventDefault();
    if (!user) { setStatus('Please log in to submit a hazard report.'); go('auth'); return; } if (!location) return setStatus('Add your current location or plan a route before reporting a hazard.');
    try { await api('/api/reports',{method:'POST',body:JSON.stringify({type:kind,latitude:location.lat,longitude:location.lon,note})}); setNote(''); await refreshHazards(); setStatus('Report saved as unverified community information.'); }
    catch(err) { setStatus(`Report failed: ${err.message}`); }
  }
  async function sos() {
    if (!user) { setStatus('Please log in before using SOS.'); go('auth'); return; }
    if (!window.confirm('Send an SOS SMS to your two configured emergency contacts?')) return;
    try { const d=await api('/api/sos',{method:'POST',body:JSON.stringify({latitude:location?.lat??null,longitude:location?.lon??null,contacts})}); setStatus(d.message); }
    catch(err) { setStatus(`SOS not sent: ${err.message}`); }
  }

  async function submitAuth(e) {
    e.preventDefault(); setBusy(true);
    try {
      const path = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = authMode === 'register' ? { name: authName.trim(), email: authEmail.trim(), password: authPassword } : { email: authEmail.trim(), password: authPassword };
      const result = await api(path, { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('mws_token', result.token);
      localStorage.setItem('mws_user', JSON.stringify(result.user));
      setUser(result.user); setAuthPassword(''); setStatus(`Welcome${result.user.name ? ', ' + result.user.name : ''}! You are logged in.`); home();
    } catch (err) { setStatus(err.message); }
    finally { setBusy(false); }
  }
  function logout() { localStorage.removeItem('mws_token'); localStorage.removeItem('mws_user'); setUser(null); setStatus('You have logged out.'); home(); }

  function speak() { if (!voiceEnabled) return setStatus('Voice guidance is turned off. Enable Voice in the top bar to hear directions.'); if (!route) return; if (!('speechSynthesis' in window)) return setStatus('Voice guidance is not supported by this browser.'); const t=(route.legs?.[0]?.steps||[]).slice(0,12).map(s=>`${s.maneuver?.type||'Continue'} ${s.name||''}`).join('. '); speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t||'Follow the highlighted route.')); }

  return <main className="app-shell">
    <header className="topbar"><button className="brand" onClick={home}><span className="brand-icon">↗</span><span>MakeWay<span className="brand-accent">SafeWay</span><small>SAFETY-AWARE JOURNEYS</small></span></button><div className="top-actions"><button className="utility-toggle" aria-label="Toggle colour theme" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light' : '☾ Dark'}</button><button className={voiceEnabled ? 'utility-toggle voice-on' : 'utility-toggle'} aria-pressed={voiceEnabled} onClick={() => setVoiceEnabled(v => !v)}>{voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}</button><span className="online-dot"/> Live services {user ? <><span className="user-chip">{user.name || user.email}</span><button className="login-button" onClick={logout}>Log out</button></> : <button className="login-button" onClick={()=>{setAuthMode('login');go('auth')}}>Log in</button>} <button className="sos-mini" onClick={sos}>SOS</button></div></header>
    {page === 'home' && <section className="screen home-screen page-enter"><div className="hero-copy"><span className="pill"><span className="online-dot"/> SAFER ROUTES START HERE</span><h1>Every journey<br/>deserves a <em>safer way.</em></h1><p>Plan your route with live maps, weather context and community-reported road hazards—together in one place.</p><button className="primary big" onClick={openJourney}>Plan a journey <span>→</span></button><LiveLocationButton loading={gps.loading} location={gps.location} error={gps.error} onRequestLocation={gps.requestLocation} /><p className="location-help">Allow location to show your live position. Journey planning requires login.</p><div className="trust-row"><span>⌁ Real map data</span><span>◉ Weather context</span><span>♡ SOS support</span></div></div><div className="hero-visual"><MapView location={location} theme={theme} /><div className="visual-caption"><span>01 / LIVE MAP</span><span>CARTO maps · Live GPS when permitted</span></div></div><div className="home-bottom"><div><b>One simple flow</b><span>Plan → Review → Travel</span></div><div><b>Community aware</b><span>Reports are marked unverified</span></div><div><b>Emergency ready</b><span>SOS requires configured SMS service</span></div></div></section>}
    {page === 'auth' && <section className="screen form-screen page-enter"><button className="back-link" onClick={back}>← Back</button><div className="form-layout"><div><span className="step-tag">YOUR SAFEWAY ACCOUNT</span><h1>{authMode === 'register' ? <>Create your<br/><em>account.</em></> : <>Welcome<br/><em>back.</em></>}</h1><p>Log in to unlock account-only safety features, including SOS and submitting road-hazard reports. Live location is available without an account, but planning a journey requires login.</p><div className="emergency-warning">Your password is stored as a salted hash by the backend. Never share your password or Twilio credentials.</div></div><form className="journey-card" onSubmit={submitAuth}><div className="card-heading"><span className="card-icon">◉</span><div><h2>{authMode === 'register' ? 'Create account' : 'Log in'}</h2><p>{authMode === 'register' ? 'A few details to get started' : 'Access your MakeWaySafeWay account'}</p></div></div>{authMode === 'register' && <label>YOUR NAME<input required minLength="2" maxLength="80" value={authName} onChange={e=>setAuthName(e.target.value)} placeholder="Your name" autoComplete="name"/></label>}<label>EMAIL ADDRESS<input required type="email" maxLength="254" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label><label>PASSWORD<input required type="password" minLength={authMode === 'register' ? 8 : 1} maxLength="128" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder={authMode === 'register' ? 'At least 8 characters' : 'Your password'} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}/></label><button className="primary submit-route" disabled={busy}>{busy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Log in'} <span>→</span></button><p className="form-note">{authMode === 'register' ? 'Already registered?' : 'New to MakeWaySafeWay?'} <button type="button" className="inline-link" onClick={()=>setAuthMode(authMode === 'register' ? 'login' : 'register')}>{authMode === 'register' ? 'Log in' : 'Create an account'}</button></p></form></div></section>}
    {page === 'journey' && <section className="screen journey-screen page-enter"><button className="back-link" onClick={back}>← Back to home</button><div className="journey-layout"><div className="journey-copy"><span className="step-tag">STEP 01 — YOUR JOURNEY</span><h1>Where are you<br/>heading <em>today?</em></h1><p>Choose any starting point and destination. You can use GPS or search for a place; nearby hazard reports are shown within 5 km of the selected starting point.</p><div className="emergency-warning">{start ? `Starting point: ${start}` : 'Choose a starting point below.'}<br/>{nearbyHazards.length} hazard report(s) within 5 km of the selected start point.</div><div className="mini-benefits"><div><span>01</span><p><b>Real driving routes</b><small>Powered by live routing data</small></p></div><div><span>02</span><p><b>Weather context</b><small>Current conditions when available</small></p></div><div><span>03</span><p><b>Reported hazards</b><small>Community reports, clearly labelled</small></p></div></div></div><form className="journey-card" onSubmit={findRoute}><div className="card-heading"><span className="card-icon">⌖</span><div><h2>Plan your route</h2><p>Fill in the details below</p></div></div><label>STARTING POINT<div className="input-with-icon"><span>○</span><input required value={start} onChange={e=>{setStart(e.target.value);setStartPoint(null);}} placeholder="Search a place or enter lat, lon" autoComplete="off"/></div></label>{startSearching && <p className="form-note">Searching starting locations…</p>}{startSuggestions.length > 0 && <div className="place-suggestions" role="listbox">{startSuggestions.map((place,i)=><button type="button" role="option" className="place-suggestion" key={`${place.lat}-${place.lon}-${i}`} onClick={()=>choosePlace('start',place)}>{place.label}</button>)}</div>}<button type="button" className="location-link" onClick={currentLocation}>◎ Use my current location</button><button type="button" className="location-link" onClick={swapLocations} disabled={!start || !end}>⇅ Swap starting point and destination</button><div className="journey-connector"><i/></div><label>DESTINATION<div className="input-with-icon"><span>⌖</span><input required value={end} onChange={e=>{setEnd(e.target.value);setEndPoint(null);}} placeholder="Search destination or enter lat, lon" autoComplete="off"/></div></label>{endSearching && <p className="form-note">Searching destinations…</p>}{endSuggestions.length > 0 && <div className="place-suggestions" role="listbox">{endSuggestions.map((place,i)=><button type="button" role="option" className="place-suggestion" key={`${place.lat}-${place.lon}-${i}`} onClick={()=>choosePlace('end',place)}>{place.label}</button>)}</div>}<p className="form-note">Choose a suggestion or enter coordinates as latitude, longitude. Login is required to calculate a route.</p><button className="primary submit-route" disabled={busy}>{busy?'Finding route…':'Find my route'} <span>→</span></button><p className="form-note">⌁ Road distance and travel time come from the routing service. Hazard reports are community-submitted and unverified.</p></form></div></section>}
    {page === 'route' && <section className="screen route-screen page-enter"><div className="route-topline"><button className="back-link" onClick={back}>← Edit journey</button><div><span className="step-tag">STEP 02 — ROUTE OVERVIEW</span><h1>Your route, <em>with context.</em></h1></div><button className="secondary" onClick={speak} disabled={!voiceEnabled}>🔊 {voiceEnabled ? 'Voice directions' : 'Voice is off'}</button></div><div className="route-layout"><section className="map-panel"><div ref={mapNode} id="map"/><div className="map-footer">© OpenStreetMap contributors <span>{livePosition ? '● Live GPS tracking' : 'Route map'}</span></div></section><aside className="route-side"><section className="info-card route-summary"><span className="info-label">YOUR JOURNEY</span><div className="route-stats"><div><strong>{route?(route.distance/1000).toFixed(2):'—'}<small> km</small></strong><span>Driving distance</span>{routeFrom && routeTo && <small className="subtle direct-distance">Straight-line: {distanceKm(routeFrom, routeTo).toFixed(2)} km</small>}</div><div><strong>{route?Math.round(route.duration/60):'—'}<small> min</small></strong><span>Est. driving time</span></div></div><div className="place-line"><i/> <span>{start}</span></div><div className="place-line"><i className="destination-dot"/> <span>{end}</span></div></section><section className="info-card">
  <div className="section-title"><span>↗</span><h3>Available driving routes</h3></div>
  {routes.length > 0 ? (
    <div className="available-routes">
      {routes.map((option, index) => (
        <button
          type="button"
          key={`${index}-${option.distance}`}
          className={`secondary full-width route-option ${selectedRouteIndex === index ? 'route-option-active' : ''}`}
          onClick={() => chooseRoute(index)}
          aria-pressed={selectedRouteIndex === index}
        >
          <span>
            <strong>{index === 0 ? 'Route 1' : `Alternative ${index + 1}`}</strong>
            <br />
            <small>
              {(option.distance / 1000).toFixed(2)} km · {Math.round(option.duration / 60)} min
            </small>
          </span>
          <span>{selectedRouteIndex === index ? '✓ Selected' : 'Select →'}</span>
        </button>
      ))}
    </div>
  ) : (
    <p className="subtle">No route options are available.</p>
  )}
  <small className="subtle">
    Options depend on the routing service. Always follow road signs and check for closures and hazards.
  </small>
</section><section className="info-card"><div className="section-title"><span>☼</span><h3>Current weather</h3></div>{weather?<><div className="weather-main"><b>{weather.temperature_c??'—'}°C</b><span>Rain {weather.rain_mm??'—'} mm · Wind {weather.wind_kmh??'—'} km/h</span></div><small className="subtle">Open-Meteo · {weather.observed_at||'Observation time unavailable'}</small></>:<p className="subtle">Weather information unavailable right now.</p>}</section><section className="info-card"><div className="section-title"><span>⚑</span><h3>Nearby road reports</h3></div>{nearbyHazards.length ? nearbyHazards.map((h,i)=><p className="subtle" key={h.id||i}><b>{h.type.replace('_',' ')}</b> · {h.note||'No additional details'} · unverified</p>) : <p className="subtle">No reports within 5 km were found. This does not mean the road is safe.</p>}</section><section className="info-card"><div className="section-title"><span>◈</span><h3>Estimated risk signal</h3></div>{risk?<><div className="risk-row"><strong>{risk.score}<small>/100</small></strong><span className="risk-badge">{risk.label}</span></div><p className="subtle">{risk.explanation}</p></>:<p className="subtle">Risk context will appear after route calculation.</p>}<small className="warning-note">Not an official flood warning. Unknown data does not mean safe.</small></section><button className="primary report-cta" onClick={()=>{if(!user){setStatus('Please log in to report hazards.');setAuthMode('login');go('auth')}else go('report')}}>＋ Report a road hazard <span>→</span></button><button className="secondary full-width" onClick={()=>{if(!user){setStatus('Please log in before opening SOS.');go('auth')}else go('sos')}}>Emergency SOS information</button></aside></div></section>}
    {page === 'report' && <section className="screen form-screen page-enter"><button className="back-link" onClick={back}>← Back to route</button><div className="form-layout"><div><span className="step-tag">COMMUNITY SAFETY</span><h1>See something?<br/><em>Report it.</em></h1><p>Your report can help others make informed decisions. Reports are unverified until reviewed.</p></div><form className="journey-card" onSubmit={submitReport}><h2>Report a road hazard</h2><label>HAZARD TYPE<select value={kind} onChange={e=>setKind(e.target.value)}>{['waterlogging','flood','road_closure','crash','obstacle','poor_lighting','other'].map(x=><option key={x}>{x.replace('_',' ')}</option>)}</select></label><label>WHAT DID YOU SEE?<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength="500" placeholder="Describe the road condition (optional)"/></label><p className="form-note">Location: {location?`${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`:'Not set — use current location or plan a route first.'}</p><button className="primary submit-route">Submit report <span>→</span></button></form></div></section>}
    {page === 'sos' && <section className="screen form-screen page-enter"><button className="back-link" onClick={back}>← Back</button><div className="form-layout"><div><span className="step-tag">EMERGENCY SUPPORT</span><h1>Help is one<br/>step <em>away.</em></h1><p>Send an SOS SMS to your two configured emergency contacts. This requires mobile or internet connectivity and valid Twilio setup.</p><div className="emergency-warning">SOS is not a replacement for local emergency services. If in immediate danger, call your local emergency number directly.</div></div><div className="journey-card sos-card"><div className="sos-emblem">SOS</div><h2>Emergency SOS</h2><p>Confirm before sending a message with your last known location.</p><label>CONTACT 1<input value={contacts[0]} onChange={e=>setContacts([e.target.value,contacts[1]])} placeholder="+country code phone number"/></label><label>CONTACT 2<input value={contacts[1]} onChange={e=>setContacts([contacts[0],e.target.value])} placeholder="+country code phone number"/></label><button className="danger submit-route" onClick={sos}>Send SOS message <span>↗</span></button><small className="subtle">Contacts must match the server settings. SMS is disabled until the backend is configured.</small></div></div></section>}
    <footer className="statusbar"><span className="status-dot"/>{status}<span className="footer-right">MAKEWAYSAFEWAY · SAFETY FIRST</span></footer>
  </main>;
}
function parseCoords(v){const a=v.split(',').map(Number);if(a.length!==2||a.some(n=>!Number.isFinite(n))||Math.abs(a[0])>90||Math.abs(a[1])>180)throw new Error('Coordinates must be latitude, longitude.');return{lat:a[0],lon:a[1]};}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
