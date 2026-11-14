// Parsing is kept independent of Next.js so it can be tested without API credentials.
const FIELDS = {
  't_2m:C': 'temperature',
  'relative_humidity_2m:p': 'humidity',
  'wind_speed_10m:ms': 'windSpeed',
  'wind_dir_10m:d': 'windDirection',
  'precip_1h:mm': 'precipitationPreviousHour'
};

export function parseForecast(raw) {
  const entries = new Map();
  for (const item of raw?.data ?? []) {
    const key = Object.prototype.hasOwnProperty.call(FIELDS, item.parameter) ? FIELDS[item.parameter] : null;
    if (!key) continue;
    for (const record of item.coordinates?.[0]?.dates ?? []) {
      if (!record.date || !Number.isFinite(Date.parse(record.date))) continue;
      const point = entries.get(record.date) ?? {
        time: record.date, temperature: null, humidity: null,
        windSpeed: null, windDirection: null, precipitationPreviousHour: null
      };
      const value = record.value;
      point[key] = typeof value === 'number' && Number.isFinite(value) && value > -900 ? value : null;
      entries.set(record.date, point);
    }
  }
  return [...entries.values()].sort((a, b) => a.time.localeCompare(b.time));
}
