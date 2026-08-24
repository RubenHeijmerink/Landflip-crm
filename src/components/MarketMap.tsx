import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Rectangle, useMap, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Listing } from '../types';
import { cn } from '../lib/utils';
import { Satellite, Map as MapIcon, Info, ExternalLink } from 'lucide-react';
import { removeOutliers, getKnnEstimate, getAcreRange } from '../lib/marketUtils';

// Fix for default Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MarketMapProps {
  listings: Listing[];
  acreRange: [number, number];
  discountThreshold?: number;
  onUpdateReviewStatus?: (id: string, status: 'Yes' | 'Maybe' | 'No') => void;
}

function MapEvents({ onKey }: { onKey: (key: string) => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['y', 'm', 'n'].includes(key)) {
        onKey(key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKey]);
  return null;
}

function MapAutoCenter({ listings }: { listings: Listing[] }) {
  const map = useMap();
  
  useMemo(() => {
    const validListings = listings.filter(l => l.lat && l.lng);
    if (validListings.length > 0) {
      const bounds = L.latLngBounds(validListings.map(l => [l.lat!, l.lng!] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [listings, map]);

  return null;
}

export default function MarketMap({ listings, acreRange, discountThreshold = 65, onUpdateReviewStatus }: MarketMapProps) {
  const [mapType, setMapType] = useState<'satellite' | 'street'>('satellite');
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);

  const handleKey = (key: string) => {
    if (!hoveredListingId || !onUpdateReviewStatus) return;
    const statusMap: Record<string, 'Yes' | 'Maybe' | 'No'> = {
      'y': 'Yes',
      'm': 'Maybe',
      'n': 'No'
    };
    onUpdateReviewStatus(hoveredListingId, statusMap[key]);
  };
  
  const validListings = useMemo(() => {
    return listings.filter(l => l.lat && l.lng && l.acres >= acreRange[0] && l.acres <= acreRange[1]);
  }, [listings, acreRange]);

  const filteredSoldListings = useMemo(() => {
    const sold = validListings.filter(l => l.type === 'sold');
    return removeOutliers(sold);
  }, [validListings]);

  const knnGrid = useMemo(() => {
    if (filteredSoldListings.length < 3) return [];

    const lats = filteredSoldListings.map(l => l.lat!);
    const lngs = filteredSoldListings.map(l => l.lng!);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // Expand bounds slightly
    const latPadding = (maxLat - minLat) * 0.1 || 0.01;
    const lngPadding = (maxLng - minLng) * 0.1 || 0.01;
    
    const gridMinLat = minLat - latPadding;
    const gridMaxLat = maxLat + latPadding;
    const gridMinLng = minLng - lngPadding;
    const gridMaxLng = maxLng + lngPadding;

    const steps = 25; // Grid resolution
    const latStep = (gridMaxLat - gridMinLat) / steps;
    const lngStep = (gridMaxLng - gridMinLng) / steps;

    const grid = [];
    const k = 3; // Number of neighbors

    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const lat = gridMinLat + i * latStep + latStep / 2;
        const lng = gridMinLng + j * lngStep + lngStep / 2;

        // Find k nearest neighbors from filtered SOLD listings only
        const neighbors = filteredSoldListings
          .map(l => ({
            listing: l,
            dist: Math.sqrt(Math.pow(l.lat! - lat, 2) + Math.pow(l.lng! - lng, 2))
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, k);

        // Inverse distance weighting
        let totalWeight = 0;
        let weightedPrice = 0;
        
        neighbors.forEach(n => {
          const weight = 1 / (Math.pow(n.dist, 2) + 0.000001);
          totalWeight += weight;
          weightedPrice += n.listing.pricePerAcre * weight;
        });

        const avgPrice = weightedPrice / totalWeight;
        grid.push({
          bounds: [[gridMinLat + i * latStep, gridMinLng + j * lngStep], [gridMinLat + (i + 1) * latStep, gridMinLng + (j + 1) * lngStep]] as [[number, number], [number, number]],
          center: [lat, lng] as [number, number],
          price: avgPrice,
          row: i,
          col: j
        });
      }
    }

    return grid;
  }, [validListings]);

  const getKnnEstimate = (lat: number, lng: number, soldComps: Listing[]) => {
    if (soldComps.length < 3) return null;
    const k = 3;
    const neighbors = soldComps
      .map(l => ({
        listing: l,
        dist: Math.sqrt(Math.pow(l.lat! - lat, 2) + Math.pow(l.lng! - lng, 2))
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);

    let totalWeight = 0;
    let weightedPrice = 0;
    neighbors.forEach(n => {
      const weight = 1 / (Math.pow(n.dist, 2) + 0.000001);
      totalWeight += weight;
      weightedPrice += n.listing.pricePerAcre * weight;
    });
    return weightedPrice / totalWeight;
  };

  const displayListings = useMemo(() => {
    // Sold listings: only those in the current acreage range
    const soldInRange = filteredSoldListings;

    // Active listings: check ALL listings with coords across ALL ranges
    const allActivesWithCoords = listings.filter(l => l.lat && l.lng && l.type === 'active');

    const activeDeals = allActivesWithCoords.filter(listing => {
      // Compare against the CURRENT heatmap's acreage range estimate (e.g. 1-2 acres)
      // This highlights "subdivide opportunities" where a larger lot is cheap relative to smaller lots
      const estimate = getKnnEstimate(listing.lat!, listing.lng!, filteredSoldListings);
      if (!estimate) return false;
      
      return listing.pricePerAcre <= estimate * (discountThreshold / 100);
    });

    return [...soldInRange, ...activeDeals];
  }, [listings, filteredSoldListings, discountThreshold]);

  const getPriceColor = (price: number) => {
    if (filteredSoldListings.length === 0) return 'rgb(0, 255, 0)';
    const prices = filteredSoldListings.map(l => l.pricePerAcre);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    
    const normalized = Math.max(0, Math.min(1, (price - min) / range));
    
    // Green (low) to Red (high)
    const r = Math.floor(255 * normalized);
    const g = Math.floor(255 * (1 - normalized));
    return `rgb(${r}, ${g}, 0)`;
  };

  const legendData = useMemo(() => {
    if (filteredSoldListings.length === 0) return null;
    const prices = filteredSoldListings.map(l => l.pricePerAcre);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max };
  }, [filteredSoldListings]);

  const tileLayers = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    },
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png',
      attribution: '&copy; OpenStreetMap'
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-neutral-900">Price Heatmap (kNN)</h3>
          <div className="group relative">
            <Info className="w-4 h-4 text-neutral-400 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-neutral-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[2000] shadow-xl">
              <p className="font-bold mb-1">Price Heatmap (kNN)</p>
              <p className="mb-2 text-neutral-300">Estimated price per acre based on the 3 nearest neighbors. Green indicates lower prices, red indicates higher prices.</p>
              <p className="font-bold mb-1 border-t border-neutral-700 pt-2">Active Filtering</p>
              <p className="text-neutral-300">Blue dots (Actives) are only shown if they are priced at <span className="text-blue-400 font-bold">{discountThreshold}% or less</span> of the local kNN estimate (potential deals).</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-neutral-100 p-1 rounded-lg">
          <button
            onClick={() => setMapType('satellite')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all",
              mapType === 'satellite' ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <Satellite className="w-3.5 h-3.5" />
            Satellite
          </button>
          <button
            onClick={() => setMapType('street')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all",
              mapType === 'street' ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-900"
            )}
          >
            <MapIcon className="w-3.5 h-3.5" />
            Street
          </button>
        </div>
      </div>

      <div className="relative h-[500px] rounded-2xl border border-neutral-200 shadow-sm overflow-hidden bg-neutral-100">
        {validListings.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm font-medium">
            No listings with coordinates found in this range.
          </div>
        ) : (
          <MapContainer
            center={[0, 0]}
            zoom={13}
            className="w-full h-full"
          >
            <TileLayer
              url={tileLayers[mapType].url}
              attribution={tileLayers[mapType].attribution}
            />
            
            <MapEvents onKey={handleKey} />
            
            {knnGrid.map((cell, idx) => (
              <Rectangle
                key={`knn-${idx}`}
                bounds={cell.bounds}
                pathOptions={{
                  fillColor: getPriceColor(cell.price),
                  fillOpacity: 0.3,
                  stroke: false
                }}
              />
            ))}

            {knnGrid
              .filter(cell => cell.row % 5 === 2 && cell.col % 5 === 2)
              .map((cell, idx) => (
                <Marker
                  key={`label-${idx}`}
                  position={cell.center}
                  icon={L.divIcon({
                    className: 'price-label',
                    html: `<div class="text-[8px] font-mono font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] whitespace-nowrap">${cell.price >= 1000 ? `$${Math.round(cell.price / 1000)}k` : `$${Math.round(cell.price)}`}</div>`,
                    iconSize: [30, 10],
                    iconAnchor: [15, 5]
                  })}
                  interactive={false}
                />
              ))}

            {displayListings.map((listing) => {
              if (listing.type === 'active') {
                const estimate = getKnnEstimate(listing.lat!, listing.lng!, filteredSoldListings);
                const pct = estimate ? Math.round((listing.pricePerAcre / estimate) * 100) : 100;
                
                return (
                  <React.Fragment key={listing.id}>
                    <Marker
                      position={[listing.lat!, listing.lng!]}
                      icon={L.divIcon({
                        className: 'active-deal-marker',
                        html: `<div class="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-[9px] shadow-md border-2 border-white transition-all duration-200 transform hover:scale-110">
                          ${pct}%
                        </div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14]
                      })}
                      eventHandlers={{
                        mouseover: () => setHoveredListingId(listing.id),
                        mouseout: () => setHoveredListingId(null)
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -14]} opacity={1}>
                        <div className="p-1">
                          <p className="font-bold text-neutral-900 text-[10px]">{listing.address}</p>
                          <p className="text-[9px] text-neutral-500">{listing.acres.toFixed(2)} ac • ${Math.round(listing.pricePerAcre).toLocaleString()}/ac • {pct}% of comp</p>
                        </div>
                      </Tooltip>

                      <Popup offset={[0, -14]}>
                        <div className="p-2 min-w-[180px]">
                          <p className="font-bold text-neutral-900 text-xs mb-1">{listing.address}</p>
                          <div className="flex justify-between text-[10px] text-neutral-500">
                            <span>Acres:</span>
                            <span className="font-mono text-neutral-900">{listing.acres.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-neutral-500">
                            <span>$/ac:</span>
                            <span className="font-mono text-neutral-900">${Math.round(listing.pricePerAcre).toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-neutral-100">
                            <div className="flex justify-between text-[10px] text-blue-600 font-bold">
                              <span>Est. Value ({listing.acres.toFixed(1)}ac):</span>
                              <span>{estimate ? `$${Math.round(estimate).toLocaleString()}` : 'N/A'}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-blue-600 font-bold">
                              <span>% of Est:</span>
                              <span>{pct}%</span>
                            </div>
                            {!(listing.acres >= acreRange[0] && listing.acres <= acreRange[1]) && (
                              <div className="flex justify-between text-[10px] text-purple-600 font-bold">
                                <span>Heatmap Est ({acreRange[0]}-{acreRange[1]}ac):</span>
                                <span>
                                  {(() => {
                                    const est = getKnnEstimate(listing.lat!, listing.lng!, filteredSoldListings);
                                    if (!est) return 'N/A';
                                    const diff = est - listing.pricePerAcre;
                                    const pctDiff = (diff / listing.pricePerAcre) * 100;
                                    return `$${Math.round(est).toLocaleString()} (+${Math.round(pctDiff)}%)`;
                                  })()}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {onUpdateReviewStatus && (
                            <div className="mt-2 pt-2 border-t border-neutral-100">
                              <p className="text-[8px] font-bold text-neutral-400 uppercase mb-1">Review Status (Click or Press Y/M/N)</p>
                              <div className="flex items-center gap-1">
                                {(['Yes', 'Maybe', 'No'] as const).map((status) => (
                                  <button
                                    key={status}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onUpdateReviewStatus(listing.id, status);
                                    }}
                                    className={cn(
                                      "px-2 py-1 text-[10px] font-bold rounded transition-all",
                                      listing.reviewStatus === status
                                        ? status === 'Yes' ? "bg-green-500 text-white"
                                          : status === 'Maybe' ? "bg-amber-500 text-white"
                                          : "bg-red-500 text-white"
                                        : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                                    )}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div className="mt-3 pt-2 border-t border-neutral-100">
                            <button 
                              onClick={() => window.open(listing.url, '_blank')}
                              className="w-full py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700 transition-colors"
                            >
                              View Listing
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                    
                    {listing.reviewStatus && (
                      <Marker
                        position={[listing.lat!, listing.lng!]}
                        icon={L.divIcon({
                          className: 'review-label',
                          html: `<div class="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white shadow-sm ${
                            listing.reviewStatus === 'Yes' ? 'bg-green-500' : 
                            listing.reviewStatus === 'Maybe' ? 'bg-amber-500' : 'bg-red-500'
                          }">${listing.reviewStatus.charAt(0)}</div>`,
                          iconSize: [16, 16],
                          iconAnchor: [8, 24]
                        })}
                        interactive={false}
                      />
                    )}
                  </React.Fragment>
                );
              } else {
                return (
                  <React.Fragment key={listing.id}>
                    <CircleMarker
                      center={[listing.lat!, listing.lng!]}
                      radius={8}
                      pathOptions={{
                        fillColor: '#22c55e',
                        fillOpacity: 0.8,
                        color: '#ffffff',
                        weight: 2
                      }}
                      eventHandlers={{
                        mouseover: () => setHoveredListingId(listing.id),
                        mouseout: () => setHoveredListingId(null)
                      }}
                    >
                      <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                        <div className="p-1">
                          <p className="font-bold text-neutral-900 text-[10px]">{listing.address}</p>
                          <p className="text-[9px] text-neutral-500">{listing.acres.toFixed(2)} ac • ${Math.round(listing.pricePerAcre).toLocaleString()}/ac</p>
                        </div>
                      </Tooltip>

                      <Popup offset={[0, -8]}>
                        <div className="p-2 min-w-[180px]">
                          <p className="font-bold text-neutral-900 text-xs mb-1">{listing.address}</p>
                          <div className="flex justify-between text-[10px] text-neutral-500">
                            <span>Acres:</span>
                            <span className="font-mono text-neutral-900">{listing.acres.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-neutral-500">
                            <span>$/ac:</span>
                            <span className="font-mono text-neutral-900">${Math.round(listing.pricePerAcre).toLocaleString()}</span>
                          </div>
                          {listing.url && (
                            <div className="mt-3 pt-2 border-t border-neutral-100">
                              <button 
                                onClick={() => window.open(listing.url, '_blank')}
                                className="w-full py-1.5 bg-green-600 text-white text-[10px] font-bold rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <span>View Sold Listing</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  </React.Fragment>
                );
              }
            })}

            <MapAutoCenter listings={validListings} />
          </MapContainer>
        )}

        {legendData && (
          <div className="absolute bottom-6 left-6 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-xl border border-neutral-200 shadow-lg">
            <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Price per Acre</p>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-neutral-600">${Math.round(legendData.min).toLocaleString()}</span>
              <div className="h-2 w-32 rounded-full bg-gradient-to-r from-[rgb(0,255,0)] to-[rgb(255,0,0)]" />
              <span className="text-[10px] font-mono text-neutral-600">${Math.round(legendData.max).toLocaleString()}</span>
            </div>
            <p className="text-[8px] text-neutral-400 mt-1 italic">* Extreme outliers removed from heatmap</p>
          </div>
        )}
      </div>
    </div>
  );
}
