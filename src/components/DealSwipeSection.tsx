import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Check, 
  HelpCircle, 
  ExternalLink, 
  MapPin, 
  RotateCcw, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Building2,
  Map as MapIcon,
  CheckCircle2,
  Image as ImageIcon,
  Globe,
  Layers,
  Compass,
  Eye
} from 'lucide-react';
import { Listing } from '../types';
import { cn } from '../lib/utils';
import { removeOutliers, getKnnEstimate, getAcreRange } from '../lib/marketUtils';

interface DealSwipeSectionProps {
  activeListings: Listing[];
  soldListings: Listing[];
  selectedCounty?: string | null;
  onUpdateReviewStatus: (id: string, status: 'Yes' | 'Maybe' | 'No') => void;
  onUpdateRoadFrontage?: (id: string, status: 'Yes' | 'Maybe' | 'No') => void;
}

const ACRE_RANGES: { label: string; range: [number, number] }[] = [
  { label: '1-2 ac', range: [1, 2] },
  { label: '2-3 ac', range: [2, 3] },
  { label: '3-5 ac', range: [3, 5] },
  { label: '5-10 ac', range: [5, 10] },
  { label: '10-20 ac', range: [10, 20] },
  { label: '20-50 ac', range: [20, 50] },
  { label: '50+ ac', range: [50, 1000000] },
];

type ViewTab = 'photos' | 'redfin' | 'satellite' | 'topo' | 'roadmap';

export default function DealSwipeSection({
  activeListings,
  soldListings,
  selectedCounty,
  onUpdateReviewStatus,
  onUpdateRoadFrontage
}: DealSwipeSectionProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [photoIndex, setPhotoIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<ViewTab>('photos');
  const [selectedRangeOverride, setSelectedRangeOverride] = useState<[number, number] | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Queue of deals sorted: unreviewed first (lowest price/acre to highest), then reviewed (lowest price/acre to highest)
  const countyQueue = useMemo(() => {
    let list = activeListings;
    if (selectedCounty) {
      list = activeListings.filter(l => {
        const name = l.county?.trim() || l.city?.trim() || 'Unspecified County';
        return name.toLowerCase() === selectedCounty.toLowerCase();
      });
    }

    return [...list].sort((a, b) => {
      const aReviewed = (a.reviewStatus === 'Yes' || a.reviewStatus === 'Maybe' || a.reviewStatus === 'No') ? 1 : 0;
      const bReviewed = (b.reviewStatus === 'Yes' || b.reviewStatus === 'Maybe' || b.reviewStatus === 'No') ? 1 : 0;
      if (aReviewed !== bReviewed) {
        return aReviewed - bReviewed;
      }
      return a.pricePerAcre - b.pricePerAcre;
    });
  }, [activeListings, selectedCounty]);

  // Reset index when selected county changes
  useEffect(() => {
    setCurrentIndex(0);
    setSelectedRangeOverride(null);
  }, [selectedCounty]);

  const currentListing = countyQueue[currentIndex] || null;

  // Reset photo index & default tab when property changes
  useEffect(() => {
    setPhotoIndex(0);
    // If listing has photos, default to photos, else redfin/satellite
    if (currentListing?.imageUrl || (currentListing?.images && currentListing.images.length > 0)) {
      setActiveTab('photos');
    } else if (currentListing?.url) {
      setActiveTab('redfin');
    } else {
      setActiveTab('satellite');
    }
  }, [currentListing?.id]);

  // All extracted photos for current listing
  const allPhotos = useMemo(() => {
    if (!currentListing) return [];
    const list: string[] = [];
    if (currentListing.imageUrl) list.push(currentListing.imageUrl);
    if (currentListing.images && currentListing.images.length > 0) {
      currentListing.images.forEach(img => {
        if (img && !list.includes(img)) list.push(img);
      });
    }
    return list;
  }, [currentListing]);

  const handleNextPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (allPhotos.length > 1) {
      setPhotoIndex(prev => (prev + 1) % allPhotos.length);
    }
  };

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (allPhotos.length > 1) {
      setPhotoIndex(prev => (prev - 1 + allPhotos.length) % allPhotos.length);
    }
  };

  // Active range used for estimating value on card
  const activeRange = useMemo(() => {
    if (selectedRangeOverride) return selectedRangeOverride;
    if (currentListing) return getAcreRange(currentListing.acres);
    return [1, 2] as [number, number];
  }, [selectedRangeOverride, currentListing]);

  // Calculate estimated price/acre and increase %
  const estimationData = useMemo(() => {
    if (!currentListing || !currentListing.lat || !currentListing.lng) {
      return { estPricePerAcre: null, totalEstValue: null, increasePct: null };
    }

    const relevantSold = soldListings.filter(
      l => l.lat && l.lng && l.type === 'sold' && l.acres >= activeRange[0] && l.acres <= activeRange[1]
    );

    const estPricePerAcre = getKnnEstimate(currentListing.lat, currentListing.lng, removeOutliers(relevantSold));

    if (!estPricePerAcre || currentListing.pricePerAcre <= 0) {
      return { estPricePerAcre: null, totalEstValue: null, increasePct: null };
    }

    const totalEstValue = Math.round(estPricePerAcre * currentListing.acres);
    const diff = estPricePerAcre - currentListing.pricePerAcre;
    const increasePct = (diff / currentListing.pricePerAcre) * 100;

    return {
      estPricePerAcre: Math.round(estPricePerAcre),
      totalEstValue,
      increasePct: Math.round(increasePct)
    };
  }, [currentListing, soldListings, activeRange]);

  const handleAction = (status: 'Yes' | 'Maybe' | 'No') => {
    if (!currentListing) return;
    onUpdateReviewStatus(currentListing.id, status);
    
    // Animate and advance
    setSwipeDirection(status === 'Yes' ? 'right' : status === 'No' ? 'left' : null);
    setTimeout(() => {
      setSwipeDirection(null);
      setCurrentIndex(prev => prev + 1);
      setSelectedRangeOverride(null);
    }, 200);
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setSelectedRangeOverride(null);
    }
  };

  if (activeListings.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden p-3 sm:p-6 space-y-4 w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-neutral-900">Deal Evaluator</h3>
            <p className="text-xs text-neutral-500">Sorted from lowest $/acre to highest listed</p>
          </div>
        </div>

        {countyQueue.length > 0 && (
          <div className="flex items-center gap-2 bg-neutral-100 px-3 py-1.5 rounded-xl text-xs font-medium self-start sm:self-auto">
            <span className="text-neutral-500">Queue:</span>
            <span className="font-extrabold text-neutral-900">
              {Math.min(currentIndex + 1, countyQueue.length)} / {countyQueue.length}
            </span>
          </div>
        )}
      </div>

      {/* Main Container */}
      {countyQueue.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50 p-6 text-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
          <p className="text-sm font-bold text-neutral-700">No active listings available to evaluate</p>
        </div>
      ) : currentIndex >= countyQueue.length ? (
        <div className="h-72 flex flex-col items-center justify-center border-2 border-dashed border-emerald-200 rounded-2xl bg-emerald-50/40 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-neutral-900">All deals evaluated!</h4>
            <p className="text-xs text-neutral-500 mt-1">Deals marked "Yes" or "Maybe" are saved in your CRM lead pipeline.</p>
          </div>
          <button
            onClick={() => setCurrentIndex(0)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart Queue Review
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4 py-1 w-full max-w-2xl mx-auto">
          {/* Card Wrapper with Motion */}
          <div className="relative w-full min-h-[500px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {currentListing && (
                <motion.div
                  key={currentListing.id}
                  initial={{ scale: 0.97, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ 
                    x: swipeDirection === 'right' ? 250 : swipeDirection === 'left' ? -250 : 0, 
                    opacity: 0,
                    transition: { duration: 0.18 }
                  }}
                  className="w-full bg-white rounded-2xl border-2 border-neutral-200/90 shadow-lg overflow-hidden flex flex-col relative select-none"
                >
                  {/* View Tabs Selector (Photos | Redfin | Satellite | Topo | Road) */}
                  <div className="bg-neutral-900 p-2 border-b border-neutral-800 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveTab('photos')}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                          activeTab === 'photos'
                            ? "bg-amber-500 text-neutral-950 shadow-sm"
                            : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                        )}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Photos</span>
                        {allPhotos.length > 0 && (
                          <span className="px-1.5 py-0.2 text-[9px] bg-black/40 rounded-full font-mono">
                            {allPhotos.length}
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => setActiveTab('redfin')}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                          activeTab === 'redfin'
                            ? "bg-rose-600 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                        )}
                      >
                        <Globe className="w-3.5 h-3.5 text-rose-400" />
                        <span>Redfin Page</span>
                      </button>

                      {currentListing.lat && currentListing.lng && (
                        <>
                          <button
                            onClick={() => setActiveTab('satellite')}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                              activeTab === 'satellite'
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                            )}
                          >
                            <Layers className="w-3.5 h-3.5 text-blue-400" />
                            <span>Satellite</span>
                          </button>

                          <button
                            onClick={() => setActiveTab('topo')}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                              activeTab === 'topo'
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                            )}
                          >
                            <Compass className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Topo</span>
                          </button>

                          <button
                            onClick={() => setActiveTab('roadmap')}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0",
                              activeTab === 'roadmap'
                                ? "bg-purple-600 text-white shadow-sm"
                                : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                            )}
                          >
                            <MapIcon className="w-3.5 h-3.5 text-purple-400" />
                            <span>Road</span>
                          </button>
                        </>
                      )}
                    </div>

                    {currentListing.url && (
                      <a
                        href={currentListing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0"
                        title="Open Redfin listing in new tab"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Card Media Header Content based on Active Tab */}
                  <div className="relative h-72 sm:h-80 bg-neutral-900 overflow-hidden group select-none">
                    {/* PHOTO GALLERY TAB */}
                    {activeTab === 'photos' && (
                      <div className="w-full h-full relative">
                        {allPhotos.length > 0 ? (
                          <div className="w-full h-full relative bg-black">
                            <img 
                              src={allPhotos[photoIndex]} 
                              alt={currentListing.address}
                              className="w-full h-full object-contain bg-neutral-950"
                            />

                            {/* Left / Right Photo Swipe Arrows */}
                            {allPhotos.length > 1 && (
                              <>
                                <button
                                  type="button"
                                  onClick={handlePrevPhoto}
                                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all shadow-md active:scale-95 cursor-pointer"
                                  title="Previous Photo"
                                >
                                  <ChevronLeft className="w-5 h-5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={handleNextPhoto}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 transition-all shadow-md active:scale-95 cursor-pointer"
                                  title="Next Photo"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </>
                            )}

                            {/* Bottom Photo Counter & Dots */}
                            {allPhotos.length > 1 && (
                              <div className="absolute bottom-12 left-0 right-0 z-20 flex items-center justify-center gap-1.5">
                                {allPhotos.map((_, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPhotoIndex(idx);
                                    }}
                                    className={cn(
                                      "h-1.5 rounded-full transition-all cursor-pointer",
                                      photoIndex === idx ? "w-6 bg-amber-400" : "w-1.5 bg-white/50 hover:bg-white"
                                    )}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ) : currentListing.lat && currentListing.lng ? (
                          <div className="w-full h-full relative">
                            <iframe
                              title="Satellite Aerial View"
                              width="100%"
                              height="100%"
                              frameBorder="0"
                              scrolling="no"
                              src={`https://maps.google.com/maps?q=${currentListing.lat},${currentListing.lng}&t=k&z=17&ie=UTF8&iwloc=&output=embed`}
                              className="w-full h-full border-0"
                            />
                            {/* Overlay button to open Redfin photos */}
                            <div className="absolute top-3 right-3 z-20">
                              {currentListing.url && (
                                <a
                                  href={currentListing.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md backdrop-blur-md transition-all active:scale-95"
                                >
                                  <span>View Redfin Listing Photos</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 text-neutral-400 p-6 text-center space-y-2">
                            <ImageIcon className="w-10 h-10 opacity-30" />
                            <p className="text-xs font-bold text-white">Standard Redfin CSV Exports</p>
                            <p className="text-[11px] text-neutral-400 max-w-xs">
                              Redfin CSV files export location and pricing data. Click below to view all full listing photos directly on Redfin.
                            </p>
                            {currentListing.url && (
                              <a
                                href={currentListing.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 mt-2 transition-all shadow-md active:scale-95"
                              >
                                View Photos on Redfin <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* REDFIN PAGE TAB (Sleek Property Card with Direct Live Launch) */}
                    {activeTab === 'redfin' && (
                      <div className="w-full h-full flex flex-col items-center justify-between bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white p-5 relative overflow-y-auto">
                        <div className="w-full space-y-4 my-auto text-center max-w-sm">
                          {/* Redfin Logo / Header */}
                          <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold px-3 py-1.5 rounded-full">
                            <Globe className="w-4 h-4 text-rose-400" />
                            <span>Redfin Market Listing</span>
                          </div>

                          <div>
                            <h3 className="text-lg font-black text-white">{currentListing.address || 'Land Property'}</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              {currentListing.city}, {currentListing.state} {currentListing.county ? `(${currentListing.county} Co.)` : ''}
                            </p>
                          </div>

                          {/* Quick Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 bg-white/5 border border-white/10 p-3 rounded-xl text-center">
                            <div>
                              <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Price</span>
                              <span className="text-sm font-extrabold text-white">${currentListing.price.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Acres</span>
                              <span className="text-sm font-extrabold text-white">{currentListing.acres.toFixed(2)} ac</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-neutral-400 uppercase font-semibold block">$/Acre</span>
                              <span className="text-sm font-extrabold text-rose-400">${Math.round(currentListing.pricePerAcre).toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Note regarding Redfin security & direct link */}
                          <p className="text-[11px] text-neutral-400 leading-relaxed bg-black/40 p-2.5 rounded-lg border border-white/5">
                            Redfin protects live pages from iframe embedding. Click below to view all full-resolution listing photos, disclosures, and agent details directly on Redfin.
                          </p>

                          {/* Direct Launch Buttons */}
                          {currentListing.url ? (
                            <a
                              href={currentListing.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full py-3 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-black rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                            >
                              <span>Open Live Redfin Listing Page</span>
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : (
                            <div className="text-xs text-neutral-400 italic">No Redfin URL associated with this listing</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SATELLITE MAP TAB */}
                    {activeTab === 'satellite' && currentListing.lat && currentListing.lng && (
                      <iframe
                        title="Satellite View"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        scrolling="no"
                        src={`https://maps.google.com/maps?q=${currentListing.lat},${currentListing.lng}&t=k&z=16&ie=UTF8&iwloc=&output=embed`}
                        className="w-full h-full border-0"
                      />
                    )}

                    {/* TOPO MAP TAB */}
                    {activeTab === 'topo' && currentListing.lat && currentListing.lng && (
                      <iframe
                        title="Topographic View"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        scrolling="no"
                        src={`https://maps.google.com/maps?q=${currentListing.lat},${currentListing.lng}&t=p&z=15&ie=UTF8&iwloc=&output=embed`}
                        className="w-full h-full border-0"
                      />
                    )}

                    {/* ROAD MAP TAB */}
                    {activeTab === 'roadmap' && currentListing.lat && currentListing.lng && (
                      <iframe
                        title="Road Map View"
                        width="100%"
                        height="100%"
                        frameBorder="0"
                        scrolling="no"
                        src={`https://maps.google.com/maps?q=${currentListing.lat},${currentListing.lng}&t=m&z=15&ie=UTF8&iwloc=&output=embed`}
                        className="w-full h-full border-0"
                      />
                    )}

                    {/* Bottom Info Bar Overlay */}
                    <div className="absolute bottom-2 left-2 right-2 z-20 text-white pointer-events-none bg-black/60 backdrop-blur-md p-2 rounded-xl border border-white/10 flex items-center justify-between">
                      <div className="truncate">
                        <h4 className="text-xs font-extrabold truncate drop-shadow-sm">{currentListing.address || 'Land Parcel'}</h4>
                        <p className="text-[10px] text-neutral-300 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                          {currentListing.city}, {currentListing.state}
                        </p>
                      </div>

                      {activeTab === 'photos' && allPhotos.length > 0 && (
                        <span className="text-[10px] font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md shrink-0 ml-2">
                          {photoIndex + 1}/{allPhotos.length}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content & Metrics */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    {/* Key Listed Numbers */}
                    <div className="grid grid-cols-3 gap-2 bg-neutral-50 p-3 rounded-xl border border-neutral-100 text-center">
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase block">Listed Price</span>
                        <span className="text-sm font-black text-neutral-900">${currentListing.price.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase block">Acreage</span>
                        <span className="text-sm font-black text-neutral-900">{currentListing.acres.toFixed(2)} ac</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-neutral-400 font-bold uppercase block">Listed $/Ac</span>
                        <span className="text-sm font-black text-blue-600">${Math.round(currentListing.pricePerAcre).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Acreage Range Toggle */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-neutral-500 uppercase tracking-wider text-[10px]">Compare Range Comps:</span>
                        <span className="font-mono font-bold text-blue-600">
                          {activeRange[1] >= 1000000 ? `${activeRange[0]}+ ac` : `${activeRange[0]}-${activeRange[1]} ac`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
                        <button
                          onClick={() => setSelectedRangeOverride(null)}
                          className={cn(
                            "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all shrink-0 cursor-pointer",
                            selectedRangeOverride === null
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200"
                          )}
                        >
                          Auto ({getAcreRange(currentListing.acres)[0]}-{getAcreRange(currentListing.acres)[1]}ac)
                        </button>

                        {ACRE_RANGES.map((r) => {
                          const isActive = selectedRangeOverride && selectedRangeOverride[0] === r.range[0] && selectedRangeOverride[1] === r.range[1];
                          return (
                            <button
                              key={r.label}
                              onClick={() => setSelectedRangeOverride(r.range)}
                              className={cn(
                                "px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all shrink-0 cursor-pointer",
                                isActive
                                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                  : "bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200"
                              )}
                            >
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Estimation Box */}
                    <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-3 rounded-xl border border-blue-100 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-600">Est. Market $/Acre:</span>
                        <span className="text-sm font-black font-mono text-neutral-900">
                          {estimationData.estPricePerAcre ? `$${estimationData.estPricePerAcre.toLocaleString()}` : 'N/A'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-blue-100/80 text-xs">
                        <span className="text-neutral-500 font-medium">Estimated Upside / Increase:</span>
                        {estimationData.increasePct !== null ? (
                          <span
                            className={cn(
                              "font-black font-mono px-2 py-0.5 rounded-full text-[11px]",
                              estimationData.increasePct >= 0 
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                                : "bg-rose-100 text-rose-800 border border-rose-200"
                            )}
                          >
                            {estimationData.increasePct >= 0 ? '+' : ''}{estimationData.increasePct}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">N/A</span>
                        )}
                      </div>
                    </div>

                    {/* Road Frontage Selector */}
                    {onUpdateRoadFrontage && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100">
                        <span className="text-neutral-500 font-medium">Road Frontage:</span>
                        <div className="flex items-center gap-1">
                          {(['Yes', 'Maybe', 'No'] as const).map(st => (
                            <button
                              key={st}
                              onClick={() => onUpdateRoadFrontage(currentListing.id, st)}
                              className={cn(
                                "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                                currentListing.roadFrontage === st
                                  ? st === 'Yes' ? "bg-emerald-600 text-white" : st === 'Maybe' ? "bg-amber-500 text-white" : "bg-rose-600 text-white"
                                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              )}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Swipe / Action Buttons Row */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 w-full max-w-md pt-2 px-1">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-3 bg-neutral-100 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-full text-neutral-600 transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
              title="Previous Property"
            >
              <RotateCcw className="w-5 h-5" />
            </button>

            {/* CLICK LEFT: NO */}
            <button
              onClick={() => handleAction('No')}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-white hover:bg-rose-50 text-rose-600 border-2 border-rose-200 hover:border-rose-400 font-extrabold text-sm rounded-full shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer group"
              title="Pass / No"
            >
              <X className="w-5 h-5 group-hover:scale-110 transition-transform stroke-[2.5]" />
              <span>NO</span>
            </button>

            {/* CLICK MIDDLE: MAYBE */}
            <button
              onClick={() => handleAction('Maybe')}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-white hover:bg-amber-50 text-amber-600 border-2 border-amber-200 hover:border-amber-400 font-extrabold text-sm rounded-full shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer group"
              title="Maybe / Review Later"
            >
              <HelpCircle className="w-5 h-5 group-hover:scale-110 transition-transform stroke-[2.5]" />
              <span>MAYBE</span>
            </button>

            {/* CLICK RIGHT: YES */}
            <button
              onClick={() => handleAction('Yes')}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-full shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer group"
              title="Yes / Push to Lead Pipeline"
            >
              <Check className="w-5 h-5 group-hover:scale-110 transition-transform stroke-[3]" />
              <span>YES</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

