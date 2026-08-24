import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, Rectangle, Marker, CircleMarker, Tooltip, Popup } from 'react-leaflet';
import L from 'leaflet';
import * as topojson from 'topojson-client';
import { Loader2, Layers, Map as MapIcon, Satellite, Info, LineChart, ChevronRight, ExternalLink } from 'lucide-react';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Listing, MarketAnalysis } from '../types';
import { removeOutliers, getKnnEstimate, getAcreRange } from '../lib/marketUtils';

// Fix for default Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

type MapType = 'satellite' | 'street' | 'terrain';

export default function MapView({ user }: { user: User }) {
  const [geoData, setGeoData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapType, setMapType] = useState<MapType>('satellite');
  const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'marketAnalyses'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketAnalysis));
      setAnalyses(data);
    });

    return () => unsubscribe();
  }, []);

  const selectedAnalysis = useMemo(() => 
    analyses.find(a => a.id === selectedAnalysisId), 
  [analyses, selectedAnalysisId]);

  const knnData = useMemo(() => {
    if (!selectedAnalysis) return null;
    
    const { soldListings, soldAcreRange } = selectedAnalysis;
    const validSold = soldListings.filter(l => l.lat && l.lng && l.acres >= soldAcreRange[0] && l.acres <= soldAcreRange[1]);
    const filteredSold = removeOutliers(validSold);

    if (filteredSold.length < 3) return null;

    const lats = filteredSold.map(l => l.lat!);
    const lngs = filteredSold.map(l => l.lng!);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latPadding = (maxLat - minLat) * 0.1 || 0.01;
    const lngPadding = (maxLng - minLng) * 0.1 || 0.01;
    const gridMinLat = minLat - latPadding;
    const gridMaxLat = maxLat + latPadding;
    const gridMinLng = minLng - lngPadding;
    const gridMaxLng = maxLng + lngPadding;

    const steps = 25;
    const latStep = (gridMaxLat - gridMinLat) / steps;
    const lngStep = (gridMaxLng - gridMinLng) / steps;
    const grid = [];

    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const lat = gridMinLat + i * latStep + latStep / 2;
        const lng = gridMinLng + j * lngStep + lngStep / 2;
        const neighbors = filteredSold
          .map(l => ({
            listing: l,
            dist: Math.sqrt(Math.pow(l.lat! - lat, 2) + Math.pow(l.lng! - lng, 2))
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);

        let totalWeight = 0;
        let weightedPrice = 0;
        neighbors.forEach(n => {
          const weight = 1 / (Math.pow(n.dist, 2) + 0.000001);
          totalWeight += weight;
          weightedPrice += n.listing.pricePerAcre * weight;
        });

        grid.push({
          bounds: [[gridMinLat + i * latStep, gridMinLng + j * lngStep], [gridMinLat + (i + 1) * latStep, gridMinLng + (j + 1) * lngStep]] as [[number, number], [number, number]],
          center: [lat, lng] as [number, number],
          price: weightedPrice / totalWeight,
          row: i,
          col: j
        });
      }
    }
    return { grid, filteredSold, minPrice: Math.min(...filteredSold.map(l => l.pricePerAcre)), maxPrice: Math.max(...filteredSold.map(l => l.pricePerAcre)) };
  }, [selectedAnalysis]);

  const displayListings = useMemo(() => {
    if (!selectedAnalysis || !knnData) return [];
    
    // Valid sold listings in range
    const soldInRange = knnData.filteredSold;

    // Active listings that meet the 65% rule
    const activeDeals = selectedAnalysis.activeListings.filter(l => {
      if (!l.lat || !l.lng) return false;
      const estimate = getKnnEstimate(l.lat, l.lng, soldInRange);
      return estimate && l.pricePerAcre <= estimate * 0.65;
    });

    return [...soldInRange, ...activeDeals];
  }, [selectedAnalysis, knnData]);

  const getPriceColor = (price: number, min: number, max: number) => {
    const range = max - min || 1;
    const normalized = Math.max(0, Math.min(1, (price - min) / range));
    const r = Math.floor(255 * normalized);
    const g = Math.floor(255 * (1 - normalized));
    return `rgb(${r}, ${g}, 0)`;
  };

  function MapAutoCenter({ listings }: { listings: Listing[] }) {
    const map = useMap();
    useMemo(() => {
      const validListings = listings.filter(l => l.lat && l.lng);
      if (validListings.length > 0) {
        const bounds = L.latLngBounds(validListings.map(l => [l.lat!, l.lng!] as [number, number]));
        map.fitBounds(bounds, { padding: [100, 100], animate: true, duration: 1 });
      }
    }, [listings, map]);
    return null;
  }

  useEffect(() => {
    const fetchMapData = async () => {
      try {
        setLoading(true);
        const response = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
        if (!response.ok) throw new Error('Failed to fetch map data');
        const us: any = await response.json();

        // Filter for Texas (FIPS code 48)
        const texasCounties = topojson.feature(us, us.objects.counties as any) as any;
        texasCounties.features = texasCounties.features.filter((f: any) => f.id.startsWith('48'));
        
        setGeoData(texasCounties);
        setLoading(false);
      } catch (err) {
        console.error('Error loading map:', err);
        setError('Failed to load map data. Please try again later.');
        setLoading(false);
      }
    };

    fetchMapData();
  }, []);

  const onEachCounty = (feature: any, layer: L.Layer) => {
    if (feature.properties && feature.properties.name) {
      layer.bindTooltip(
        `<div class="px-2 py-1 font-bold text-xs">${feature.properties.name}</div>`,
        { sticky: true, direction: 'top', className: 'county-tooltip' }
      );
    }

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 2,
          color: '#ffffff',
          fillOpacity: 0.3,
          fillColor: '#ffffff'
        });
        l.bringToFront();
      },
      mouseout: (e) => {
        const l = e.target;
        l.setStyle({
          weight: 1,
          color: 'rgba(255, 255, 255, 0.5)',
          fillOpacity: 0,
          fillColor: 'transparent'
        });
      }
    });
  };

  const countyStyle = {
    fillColor: 'transparent',
    weight: 1,
    opacity: 0.5,
    color: 'rgba(255, 255, 255, 0.5)',
    fillOpacity: 0,
  };

  const tileLayers: Record<MapType, { url: string; attribution: string }> = {
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{y}/{x}.png',
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] min-h-[600px]">
      {/* Sidebar: Analysis Selection */}
      <div className="w-full lg:w-80 flex flex-col gap-4 overflow-y-auto pr-2">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">Market Map</h2>
          <p className="text-neutral-500 text-sm">Select a saved analysis to view heatmaps and deals.</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Saved Analyses</h3>
            <span className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded text-[10px] font-bold">{analyses.length}</span>
          </div>

          <div className="space-y-2">
            {analyses.length === 0 ? (
              <div className="p-8 text-center bg-white border border-dashed border-neutral-200 rounded-2xl">
                <LineChart className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-xs text-neutral-500 font-medium leading-relaxed">No market analyses saved yet. Go to <span className="text-neutral-900 font-bold">Market Chart</span> to create one.</p>
              </div>
            ) : (
              analyses.map((analysis) => (
                <button
                  key={analysis.id}
                  onClick={() => setSelectedAnalysisId(selectedAnalysisId === analysis.id ? null : analysis.id)}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl border transition-all duration-300 group relative",
                    selectedAnalysisId === analysis.id 
                      ? "bg-neutral-900 border-neutral-900 shadow-lg text-white" 
                      : "bg-white border-neutral-200 hover:border-neutral-300 text-neutral-900"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="pr-4">
                      <p className="text-sm font-bold truncate leading-tight mb-1">{analysis.name}</p>
                      <p className={cn(
                        "text-[10px] uppercase font-bold tracking-wider",
                        selectedAnalysisId === analysis.id ? "text-neutral-400" : "text-neutral-400"
                      )}>
                        {analysis.activeListings.length} Actives • {analysis.soldListings.length} Solds
                      </p>
                    </div>
                    <div className={cn(
                      "p-2 rounded-lg transition-colors",
                      selectedAnalysisId === analysis.id ? "bg-white/10" : "bg-neutral-50"
                    )}>
                      <ChevronRight className={cn(
                        "w-4 h-4 transition-transform duration-300",
                        selectedAnalysisId === analysis.id && "rotate-90 text-white"
                      )} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
                    <div className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold uppercase tracking-tighter",
                      selectedAnalysisId === analysis.id ? "bg-white/10 text-white" : "bg-blue-50 text-blue-600"
                    )}>
                      {analysis.soldAcreRange[0]}-{analysis.soldAcreRange[1]} ac
                    </div>
                    <div className={cn(
                      "px-2 py-1 rounded text-[9px] font-bold uppercase tracking-tighter",
                      selectedAnalysisId === analysis.id ? "bg-white/10 text-white" : "bg-green-50 text-green-600"
                    )}>
                      {analysis.activeListings.filter(l => l.reviewStatus === 'Yes').length} Deals
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative bg-neutral-900 rounded-3xl border border-neutral-200 shadow-2xl overflow-hidden group/map">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm z-[1000] transition-opacity">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-white" />
              <p className="text-sm text-white font-bold uppercase tracking-widest">Synthesizing Map</p>
            </div>
          </div>
        )}

        {/* Map Header Overlay */}
        <div className="absolute top-6 left-6 right-6 z-[1000] flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="bg-white/90 backdrop-blur shadow-2xl rounded-2xl p-1 border border-neutral-200/50">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMapType('satellite')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all",
                    mapType === 'satellite' ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <Satellite className="w-3.5 h-3.5" />
                  Satellite
                </button>
                <button
                  onClick={() => setMapType('street')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all",
                    mapType === 'street' ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                  )}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  Street
                </button>
              </div>
            </div>
          </div>

          {knnData && (
            <div className="bg-white/90 backdrop-blur shadow-2xl rounded-2xl px-6 py-3 border border-neutral-200/50 pointer-events-auto">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2 border-b border-neutral-100 pb-1">Price per Acre Gradient</p>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-neutral-600">${Math.round(knnData.minPrice).toLocaleString()}</span>
                <div className="h-2 w-48 rounded-full bg-gradient-to-r from-[rgb(0,255,0)] to-[rgb(255,0,0)] ring-1 ring-black/5" />
                <span className="text-[10px] font-bold text-neutral-600">${Math.round(knnData.maxPrice).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        <MapContainer
          center={[31.9686, -99.9018]}
          zoom={6}
          className="w-full h-full"
          scrollWheelZoom={true}
        >
          <TileLayer
            url={tileLayers[mapType].url}
            attribution={tileLayers[mapType].attribution}
          />
          
          {geoData && (
            <GeoJSON
              data={geoData}
              style={countyStyle}
              onEachFeature={onEachCounty}
            />
          )}

          {knnData && (
            <>
              {knnData.grid.map((cell, idx) => (
                <Rectangle
                  key={`knn-${idx}`}
                  bounds={cell.bounds}
                  pathOptions={{
                    fillColor: getPriceColor(cell.price, knnData.minPrice, knnData.maxPrice),
                    fillOpacity: 0.35,
                    stroke: false
                  }}
                />
              ))}

              {knnData.grid
                .filter(cell => cell.row % 5 === 2 && cell.col % 5 === 2)
                .map((cell, idx) => (
                  <Marker
                    key={`label-${idx}`}
                    position={cell.center}
                    icon={L.divIcon({
                      className: 'price-label',
                      html: `<div class="text-[9px] font-mono font-bold text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] whitespace-nowrap bg-black/20 px-1 rounded transition-opacity duration-300 opacity-0 group-hover/map:opacity-100">${cell.price >= 1000 ? `$${Math.round(cell.price / 1000)}k` : `$${Math.round(cell.price)}`}</div>`,
                      iconSize: [30, 10],
                      iconAnchor: [15, 5]
                    })}
                    interactive={false}
                  />
                ))}

              {displayListings.map((listing) => {
                if (listing.type === 'active') {
                  const r = getAcreRange(listing.acres);
                  const relevantSold = selectedAnalysis?.soldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= r[0] && l.acres <= r[1]) || [];
                  const estimate = getKnnEstimate(listing.lat!, listing.lng!, removeOutliers(relevantSold));
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
                      >
                        <Tooltip direction="top" offset={[0, -14]} opacity={1}>
                          <div className="p-2 min-w-[120px]">
                            <p className="font-bold text-neutral-900 text-xs mb-1">{listing.address}</p>
                            <div className="flex justify-between text-[10px] text-neutral-500">
                              <span>Acres:</span>
                              <span className="font-mono text-neutral-900">{listing.acres.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-neutral-500">
                              <span>$/ac:</span>
                              <span className="font-mono text-neutral-900">${Math.round(listing.pricePerAcre).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-blue-600 font-bold mt-1">
                              <span>% of Est:</span>
                              <span>{pct}%</span>
                            </div>
                          </div>
                        </Tooltip>

                        <Popup offset={[0, -14]}>
                          <div className="p-3 min-w-[200px] font-sans">
                            <div className="flex items-start justify-between gap-4 mb-3 border-b border-neutral-100 pb-2">
                              <div>
                                <p className="font-bold text-neutral-900 text-sm leading-tight mb-1">{listing.address}</p>
                                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{listing.city}, {listing.state}</p>
                              </div>
                              <span className={cn(
                                "px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest",
                                "bg-blue-100 text-blue-700"
                              )}>
                                active
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-tighter">Size</span>
                                <span className="text-xs font-mono font-bold text-neutral-900">{listing.acres.toFixed(2)} ac</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-tighter">Listed Price</span>
                                <span className="text-xs font-mono font-bold text-neutral-900">${listing.price.toLocaleString()}</span>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                              <div className="flex justify-between text-[10px] font-bold text-blue-600">
                                <span>Market Est ({listing.acres.toFixed(1)}ac)</span>
                                <span>{estimate ? `$${Math.round(estimate).toLocaleString()}/ac` : '-'}</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold text-blue-600">
                                <span>% of Est:</span>
                                <span>{pct}%</span>
                              </div>
                              
                              <button 
                                onClick={() => window.open(listing.url, '_blank')}
                                className="w-full mt-3 py-2 bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
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
                            html: `<div class="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-white shadow-sm ring-1 ring-white ${
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
                        radius={selectedAnalysisId ? 8 : 4}
                        pathOptions={{
                          fillColor: '#22c55e',
                          fillOpacity: 0.9,
                          color: '#ffffff',
                          weight: 2
                        }}
                      >
                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                          <div className="p-2 min-w-[120px]">
                            <p className="font-bold text-neutral-900 text-xs mb-1">{listing.address}</p>
                            <div className="flex justify-between text-[10px] text-neutral-500">
                              <span>Acres:</span>
                              <span className="font-mono text-neutral-900">{listing.acres.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-neutral-500">
                              <span>$/ac:</span>
                              <span className="font-mono text-neutral-900">${Math.round(listing.pricePerAcre).toLocaleString()}</span>
                            </div>
                          </div>
                        </Tooltip>

                        <Popup offset={[0, -8]}>
                          <div className="p-3 min-w-[200px] font-sans">
                            <div className="flex items-start justify-between gap-4 mb-3 border-b border-neutral-100 pb-2">
                              <div>
                                <p className="font-bold text-neutral-900 text-sm leading-tight mb-1">{listing.address}</p>
                                <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-wider">{listing.city}, {listing.state}</p>
                              </div>
                              <span className="px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest bg-green-100 text-green-700">
                                sold
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-2">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-tighter">Size</span>
                                <span className="text-xs font-mono font-bold text-neutral-900">{listing.acres.toFixed(2)} ac</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-tighter">Sold Price</span>
                                <span className="text-xs font-mono font-bold text-neutral-900">${listing.price.toLocaleString()}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-400 uppercase font-bold tracking-tighter">Price / Acre</span>
                                <span className="text-xs font-mono font-bold text-neutral-900">${Math.round(listing.pricePerAcre).toLocaleString()}/ac</span>
                              </div>
                            </div>

                            {listing.url && (
                              <div className="space-y-1.5 pt-2 border-t border-neutral-100">
                                <button 
                                  onClick={() => window.open(listing.url, '_blank')}
                                  className="w-full mt-2 py-2 bg-green-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  View Sold Listing
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

              <MapAutoCenter listings={displayListings} />
            </>
          )}
        </MapContainer>

        <div className="absolute bottom-6 right-6 z-[1000] pointer-events-none">
          <div className="bg-white/90 backdrop-blur shadow-2xl p-4 rounded-3xl border border-neutral-200/50 space-y-3 pointer-events-auto">
            <div className="flex items-center gap-3 text-[10px] font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-100 pb-2">
              <Layers className="w-3.5 h-3.5" />
              Legend
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 group">
                <div className="w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-100 group-hover:scale-125 transition-transform"></div>
                <span className="text-[10px] font-bold text-neutral-700">Active Deal (≤65% Est)</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-100 group-hover:scale-125 transition-transform"></div>
                <span className="text-[10px] font-bold text-neutral-700">Sold Comp</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="w-3 h-3 border border-neutral-300 ring-1 ring-neutral-100 group-hover:scale-125 transition-transform"></div>
                <span className="text-[10px] font-bold text-neutral-700">County Boundary</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .leaflet-container {
          background: #171717;
        }
        .county-tooltip {
          background: #000000 !important;
          border: 1px solid #404040 !important;
          color: white !important;
          border-radius: 12px !important;
          padding: 8px 12px !important;
          font-weight: 700 !important;
          letter-spacing: 0.05em !important;
          text-transform: uppercase !important;
          font-size: 10px !important;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2) !important;
        }
        .leaflet-tooltip-top:before {
          border-top-color: #000000 !important;
        }
        .price-label {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
