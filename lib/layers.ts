import type { LayerId, MapStyleId } from './types';
export const BASE_STYLES: Record<MapStyleId, { name: string; url: string; description: string }> = {
  satellite: { name: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12', description: 'Detailed satellite imagery' },
  streets: { name: 'Streets', url: 'mapbox://styles/mapbox/streets-v12', description: 'Roads, labels and places' },
  terrain: { name: 'Terrain', url: 'mapbox://styles/mapbox/outdoors-v12', description: 'Contours and topography' },
  dark: { name: 'Dark', url: 'mapbox://styles/mapbox/dark-v11', description: 'High-contrast exploration' }
};

export const DATA_LAYERS: Record<LayerId, { label: string; nasaId: string; details: string; opacity: number; kind: string }> = {
  rain: { label: 'Rainfall', nasaId: 'IMERG_Precipitation_Rate', details: 'GPM IMERG · satellite rainfall rate', opacity: .76, kind: 'Satellite' },
  soil: { label: 'Soil moisture', nasaId: 'SMAP_L3_Passive_Enhanced_Night_Soil_Moisture', details: 'SMAP · satellite soil moisture (~9 km)', opacity: .70, kind: 'Satellite' },
  vegetation: { label: 'Vegetation', nasaId: 'MODIS_Terra_NDVI_8Day', details: 'MODIS NDVI · 8-day composite', opacity: .73, kind: 'Satellite' },
  temperature: { label: 'Temperature', nasaId: 'MODIS_Terra_Land_Surface_Temp_Day', details: 'MODIS · daytime land surface temperature', opacity: .67, kind: 'Satellite' },
  wind: { label: 'Wind', nasaId: 'MERRA2_Surface_Wind_Speed_Monthly', details: 'MERRA-2 · monthly surface wind speed', opacity: .63, kind: 'Model' }
};
export const LAYER_IDS = Object.keys(DATA_LAYERS) as LayerId[];

// GetMap uses a geographic bounding box for *every* raster tile; the
// selection's separate square is available for later regional workflows.
export function nasaWmsTileUrl(nasaLayerId: string, date: string) {
  const args = [
    'SERVICE=WMS', 'VERSION=1.1.1', 'REQUEST=GetMap',
    `LAYERS=${encodeURIComponent(nasaLayerId)}`, 'STYLES=',
    'FORMAT=image/png', 'TRANSPARENT=TRUE', 'SRS=EPSG:3857',
    'WIDTH=256', 'HEIGHT=256', `TIME=${encodeURIComponent(date)}`,
    'BBOX={bbox-epsg-3857}'
  ];
  return `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?${args.join('&')}`;
}
