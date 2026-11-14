import type { LayerId, MapStyleId } from './types';
// MapTiler supplies every basemap. No Mapbox account or billing is needed.
export const BASE_STYLES: Record<MapStyleId, { name: string; description: string }> = {
  satellite: { name: 'Satellite', description: 'High-resolution satellite imagery' },
  streets: { name: 'Streets', description: 'Roads, labels and places' },
  terrain: { name: 'Terrain', description: 'Outdoor map with terrain shading' },
  dark: { name: 'Dark', description: 'High-contrast exploration' }
};

export function resolveBasemap(styleId: MapStyleId, maptilerKey: string): string | import('maplibre-gl').StyleSpecification {
  const key = encodeURIComponent(maptilerKey);
  if (styleId === 'satellite') {
    // Use raw imagery rather than a hybrid style; users can actually see fields.
    return {
      version: 8,
      name: 'MapTiler Satellite',
      sources: {
        satellite: {
          type: 'raster',
          url: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${key}`,
          tileSize: 512,
          attribution: '© MapTiler, imagery providers'
        }
      },
      layers: [{ id: 'satellite-basemap', type: 'raster', source: 'satellite' }]
    };
  }
  const styles: Record<Exclude<MapStyleId, 'satellite'>, string> = {
    streets: 'streets-v4',
    terrain: 'outdoor-v4',
    dark: 'dataviz-v4-dark'
  };
  return `https://api.maptiler.com/maps/${styles[styleId]}/style.json?key=${key}`;
}

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
