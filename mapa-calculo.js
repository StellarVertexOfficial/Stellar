'use strict';

(function () {
  const cities = [
    { name: 'Ciudad de México', lat: 19.43, lon: -99.13, tz: -6, aliases: ['CDMX', 'México DF'] },
    { name: 'Guadalajara', lat: 20.67, lon: -103.35, tz: -6, aliases: ['Guadalajara, Jalisco'] },
    { name: 'Monterrey', lat: 25.69, lon: -100.32, tz: -6, aliases: ['Monterrey, Nuevo León'] },
    { name: 'Puebla', lat: 19.04, lon: -98.2, tz: -6, aliases: ['Puebla, Puebla'] },
    { name: 'Cuernavaca', lat: 18.92, lon: -99.23, tz: -6, aliases: ['Cuernavaca, Morelos'] },
    { name: 'Querétaro', lat: 20.59, lon: -100.39, tz: -6, aliases: ['Santiago de Querétaro', 'Querétaro, Querétaro'] },
    { name: 'Mérida', lat: 20.97, lon: -89.62, tz: -6, aliases: ['Mérida, Yucatán'] },
    { name: 'León', lat: 21.12, lon: -101.68, tz: -6, aliases: ['León, Guanajuato'] },
    { name: 'Cancún', lat: 21.16, lon: -86.85, tz: -5, aliases: ['Cancún, Quintana Roo'] },
    { name: 'Tijuana', lat: 32.51, lon: -117.04, tz: -8, aliases: ['Tijuana, Baja California'] },
  ];
  const layout = { width: 1800, height: 2400, cx: 900, cy: 1010, radius: 700 };
  const themes = {
    noche: { bg: '#0a1226', disc: '#070d1c', star: '#f4ead0', line: '#f4ead0', lineOpacity: 0.25, ink: '#f4ead0' },
    tinta: { bg: '#08090a', disc: '#000000', star: '#ffffff', line: '#ffffff', lineOpacity: 0.22, ink: '#ffffff' },
    papel: { bg: '#f2ede1', disc: '#f2ede1', star: '#14203d', line: '#14203d', lineOpacity: 0.25, ink: '#14203d' },
  };
  const radians = Math.PI / 180;
  const normalizePlace = place => place.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const placeNames = new Map(cities.flatMap(({ name, lat, lon, tz, aliases }) =>
    [name, ...aliases].map(label => [normalizePlace(label), { lat, lon, tz }])));
  const coordinatesForCity = place => placeNames.get(normalizePlace(place));

  function parseDateTime(date, time = '00:00') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const local = new Date(0);
    local.setUTCFullYear(year, month - 1, day);
    local.setUTCHours(hour, minute);
    return local.getUTCFullYear() === year && local.getUTCMonth() === month - 1 && local.getUTCDate() === day
      ? local : null;
  }

  function siderealAngle(localTime, { lon, tz }) {
    const julianDate = (localTime.getTime() - tz * 3600000) / 86400000 + 2440587.5;
    return ((280.46061837 + 360.98564736629 * (julianDate - 2451545) + lon) % 360 + 360) % 360;
  }

  function project(ra, dec, latitude, lst) {
    const hourAngle = (lst - ra) * radians;
    const declination = dec * radians;
    const lat = latitude * radians;
    const altitude = Math.asin(Math.sin(declination) * Math.sin(lat)
      + Math.cos(declination) * Math.cos(lat) * Math.cos(hourAngle));
    if (altitude <= 0) return null;
    const azimuth = Math.atan2(-Math.cos(declination) * Math.sin(hourAngle),
      Math.sin(declination) * Math.cos(lat) - Math.cos(declination) * Math.sin(lat) * Math.cos(hourAngle));
    const distance = layout.radius * Math.tan((Math.PI / 2 - altitude) / 2);
    // Norte arriba, este a la izquierda.
    return [layout.cx - distance * Math.sin(azimuth), layout.cy - distance * Math.cos(azimuth)];
  }

  const starRadius = magnitude => Math.max(1.1, 0.9 + (6.2 - magnitude) * 0.95);
  const dateLabel = date => date.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  const coordinateLabel = ({ lat, lon }) =>
    `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}   ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'O'}`;
  const calculation = { cities, layout, themes, coordinatesForCity, parseDateTime, siderealAngle, project, starRadius, dateLabel, coordinateLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = calculation;
  else globalThis.StellarMap = calculation;
})();
