import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseForecast } from '../lib/meteomatics.mjs';

describe('Meteomatics JSON parsing', () => {
  it('merges parameter series into correctly timed forecast readings', () => {
    const data = parseForecast({ data: [
      { parameter: 'wind_speed_10m:ms', coordinates: [{ dates: [{ date: '2026-11-15T03:00:00Z', value: 4.5 }, { date: '2026-11-15T00:00:00Z', value: 2.1 }] }] },
      { parameter: 't_2m:C', coordinates: [{ dates: [{ date: '2026-11-15T00:00:00Z', value: 12.3 }] }] },
      { parameter: 'precip_1h:mm', coordinates: [{ dates: [{ date: '2026-11-15T00:00:00Z', value: 0 }] }] }
    ] });
    assert.equal(data.length, 2);
    assert.equal(data[0].time, '2026-11-15T00:00:00Z');
    assert.equal(data[0].temperature, 12.3);
    assert.equal(data[0].windSpeed, 2.1);
    assert.equal(data[0].precipitationPreviousHour, 0);
    assert.equal(data[1].windSpeed, 4.5);
    assert.equal(data[1].temperature, null);
  });
  it('does not invent data from missing, malformed, or sentinel values', () => {
    const values = parseForecast({ data: [
      { parameter: 't_2m:C', coordinates: [{ dates: [{ date: '2026-11-15T00:00:00Z', value: -999 }] }] },
      { parameter: 'foo', coordinates: [{ dates: [{ date: '2026-11-15T03:00:00Z', value: 18 }] }] },
      { parameter: 'relative_humidity_2m:p', coordinates: [{ dates: [{ date: 'bad', value: 80 }] }] }
    ] });
    assert.equal(values.length, 1);
    assert.equal(values[0].temperature, null);
  });
});
