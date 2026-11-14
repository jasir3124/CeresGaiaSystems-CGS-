import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { destination, circlePolygon, boundingSquare, squarePolygon, areaHectares } from '../lib/geo.mjs';

describe('Selected location geometry', () => {
  const center = [21.00, 42.00];
  it('creates a closed geodesic circle', () => {
    const coords = circlePolygon(center, 500, 72).geometry.coordinates[0];
    assert.equal(coords.length, 73);
    assert.deepEqual(coords[0], coords[72]);
  });
  it('expands and contracts square with radius', () => {
    const smaller = boundingSquare(center, 200);
    const larger = boundingSquare(center, 2000);
    assert.ok(smaller[0] > larger[0]);
    assert.ok(smaller[2] < larger[2]);
    assert.ok(smaller[1] > larger[1]);
    assert.ok(smaller[3] < larger[3]);
    assert.equal(squarePolygon(smaller).geometry.coordinates[0].length, 5);
  });
  it('estimates circle area correctly', () => assert.ok(Math.abs(areaHectares(100) - Math.PI) < 0.001));
  it('north offset increases latitude', () => assert.ok(destination(center, 100, 0)[1] > center[1]));
});
