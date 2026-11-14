import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCropHistory, isCropHistory, isPlantingDate, sortCropHistory } from '../lib/crops.ts';

describe('Field crop history', () => {
  it('preserves repeated legacy crops with distinct IDs and unknown dates', () => {
    const records = normalizeCropHistory(['wheat', 'maize', 'wheat']);
    assert.deepEqual(records.map(record => record.cropId), ['wheat', 'maize', 'wheat']);
    assert.ok(records.every(record => record.plantedOn === null));
    assert.equal(new Set(records.map(record => record.id)).size, 3);
  });
  it('retains more than three records through serialization and orders by planting date', () => {
    const records = [...normalizeCropHistory(['wheat', 'maize', 'wheat']),
      { id: 'old', cropId: 'potato', plantedOn: '2024-04-12' },
      { id: 'new', cropId: 'barley', plantedOn: '2026-10-01' }];
    const sorted = sortCropHistory(records);
    assert.equal(sorted.length, 5);
    assert.deepEqual(sorted.slice(0, 2).map(record => record.id), ['new', 'old']);
    assert.deepEqual(normalizeCropHistory(JSON.parse(JSON.stringify(sorted))), sorted);
    assert.deepEqual(normalizeCropHistory([]), []);
  });
  it('rejects impossible dates, unknown crops, and duplicate record IDs', () => {
    assert.ok(!isPlantingDate('2025-02-29'));
    assert.ok(isPlantingDate('2024-02-29'));
    assert.ok(!isPlantingDate('2026-13-01'));
    assert.ok(!isCropHistory([{ id: 'x', cropId: 'unknown', plantedOn: '2026-01-01' }]));
    const record = { id: 'x', cropId: 'wheat', plantedOn: '2026-01-01' };
    assert.ok(!isCropHistory([record, record]));
  });
});
