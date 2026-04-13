const map = L.map('map', {
  zoomControl: true,
}).setView([55.751244, 37.618423], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

const fromInput = document.getElementById('from');
const toInput = document.getElementById('to');
const buildRouteBtn = document.getElementById('buildRouteBtn');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const summaryFromEl = document.getElementById('summaryFrom');
const summaryToEl = document.getElementById('summaryTo');
const summaryDistanceEl = document.getElementById('summaryDistance');
const summaryDurationEl = document.getElementById('summaryDuration');

let routeLine;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function parseLatLng(value) {
  const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

async function geocode(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Ошибка геокодирования Nominatim.');
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(`Адрес не найден: ${query}`);
  }

  const first = results[0];
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    label: first.display_name || query,
  };
}

async function resolvePoint(inputValue) {
  const coord = parseLatLng(inputValue);
  if (coord) {
    return {
      ...coord,
      label: `${coord.lat.toFixed(6)}, ${coord.lng.toFixed(6)}`,
    };
  }

  return geocode(inputValue.trim());
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

async function buildRoute() {
  const fromRaw = fromInput.value.trim();
  const toRaw = toInput.value.trim();

  if (!fromRaw || !toRaw) {
    setStatus('Введите оба пункта: отправки и назначения.', true);
    summaryEl.hidden = true;
    return;
  }

  buildRouteBtn.disabled = true;
  summaryEl.hidden = true;
  setStatus('Поиск координат и построение маршрута...');

  try {
    const [fromPoint, toPoint] = await Promise.all([resolvePoint(fromRaw), resolvePoint(toRaw)]);

    const osrmUrl = new URL(
      `https://router.project-osrm.org/route/v1/driving/${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}`
    );
    osrmUrl.searchParams.set('overview', 'full');
    osrmUrl.searchParams.set('geometries', 'geojson');

    const routeResponse = await fetch(osrmUrl);
    if (!routeResponse.ok) {
      throw new Error('Ошибка OSRM при построении маршрута.');
    }

    const routeData = await routeResponse.json();
    const route = routeData?.routes?.[0];

    if (!route || !route.geometry?.coordinates) {
      throw new Error('Маршрут не найден между указанными точками.');
    }

    const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    if (routeLine) {
      map.removeLayer(routeLine);
    }

    routeLine = L.polyline(latLngs, {
      color: '#2d7dff',
      weight: 5,
      opacity: 0.9,
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [32, 32] });

    summaryFromEl.textContent = fromPoint.label;
    summaryToEl.textContent = toPoint.label;
    summaryDistanceEl.textContent = `${(route.distance / 1000).toFixed(1)} км`;
    summaryDurationEl.textContent = formatDuration(route.duration);
    summaryEl.hidden = false;

    setStatus('Маршрут успешно построен.');
  } catch (error) {
    setStatus(error.message || 'Произошла неизвестная ошибка.', true);
    summaryEl.hidden = true;
  } finally {
    buildRouteBtn.disabled = false;
  }
}

buildRouteBtn.addEventListener('click', buildRoute);
