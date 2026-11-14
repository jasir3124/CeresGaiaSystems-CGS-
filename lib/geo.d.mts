import type { Feature, Polygon } from 'geojson';
export function destination(center: [number, number], distanceMeters: number, bearingDegrees: number): [number, number];
export function circlePolygon(center: [number, number], radiusMeters: number, steps?: number): Feature<Polygon>;
export function boundingSquare(center: [number, number], radiusMeters: number): [number, number, number, number];
export function squarePolygon(bbox: [number, number, number, number]): Feature<Polygon>;
export function areaHectares(radiusMeters: number): number;
export function formatCoordinates(center: [number, number]): string;
