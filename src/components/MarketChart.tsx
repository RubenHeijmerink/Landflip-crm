import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Upload, FileText, ExternalLink, TrendingUp, DollarSign, Maximize2, Trash2, Save, FolderOpen, Loader2, Plus, FileSpreadsheet, Download, ArrowUpDown, ArrowUp, ArrowDown, MapPin, BarChart2, Check, Sparkles, RefreshCw, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Label } from 'recharts';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Listing, MarketAnalysis } from '../types';
import { db, auth } from '../firebase';
import { User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, where, orderBy, Timestamp, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import MarketMap from './MarketMap';
import BoxPlotChart from './BoxPlotChart';
import DealSwipeSection from './DealSwipeSection';
import { removeOutliers, getKnnEstimate, getAcreRange, sanitizeListing, cleanObjectForFirestore } from '../lib/marketUtils';
import { DEFAULT_LEON_COUNTY_ACTIVE, DEFAULT_LEON_COUNTY_SOLD, getDefaultLeonCountyAnalysis } from '../data/defaultLeonCountyData';

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  color: string;
  isCurrency?: boolean;
  unitLabel?: string;
  useLogScale?: boolean;
}

function RangeSlider({ label, min, max, value, onChange, color, isCurrency, unitLabel, useLogScale = isCurrency }: RangeSliderProps) {
  const SLIDER_STEPS = 1000;

  // Determine effective logarithmic bounds (avoid log(0))
  const effectiveMin = Math.max(0.1, min > 0 ? min : (isCurrency ? 1000 : 0.01));
  const effectiveMax = Math.max(effectiveMin * 1.05, max);

  const logMin = Math.log(effectiveMin);
  const logMax = Math.log(effectiveMax);

  // Convert real value to slider position [0..1000]
  const valToPos = (v: number): number => {
    if (v <= effectiveMin) return 0;
    if (v >= effectiveMax) return SLIDER_STEPS;
    if (!useLogScale) {
      return ((v - min) / (max - min || 1)) * SLIDER_STEPS;
    }
    const logV = Math.log(Math.max(v, effectiveMin));
    return ((logV - logMin) / (logMax - logMin)) * SLIDER_STEPS;
  };

  // Convert slider position [0..1000] back to real value
  const posToVal = (pos: number): number => {
    if (pos <= 0) return min;
    if (pos >= SLIDER_STEPS) return max;
    if (!useLogScale) {
      return min + (pos / SLIDER_STEPS) * (max - min);
    }
    const logV = logMin + (pos / SLIDER_STEPS) * (logMax - logMin);
    const raw = Math.exp(logV);
    
    // Smooth rounding steps for intuitive values
    if (isCurrency) {
      if (raw < 10000) return Math.round(raw / 250) * 250;
      if (raw < 100000) return Math.round(raw / 1000) * 1000;
      if (raw < 500000) return Math.round(raw / 5000) * 5000;
      if (raw < 1000000) return Math.round(raw / 10000) * 10000;
      return Math.round(raw / 25000) * 25000;
    } else {
      if (raw < 1) return Math.round(raw * 100) / 100;
      if (raw < 10) return Math.round(raw * 10) / 10;
      return Math.round(raw);
    }
  };

  const pos0 = valToPos(value[0]);
  const pos1 = valToPos(value[1]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    const newVal = posToVal(pos);
    const newMin = Math.min(newVal, value[1]);
    onChange([newMin, value[1]]);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    const newVal = posToVal(pos);
    const newMax = Math.max(newVal, value[0]);
    onChange([value[0], newMax]);
  };

  const handleInputChange = (index: 0 | 1, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    
    const newValue: [number, number] = [...value];
    
    if (index === 0) {
      newValue[0] = Math.min(num, value[1]);
    } else {
      newValue[1] = Math.max(num, value[0]);
    }
    
    onChange(newValue);
  };

  const displayUnit = unitLabel || (isCurrency ? 'k/ac' : 'ac');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{label}</label>
          {useLogScale && (
            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
              Log Scale
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {isCurrency && <span className="text-[10px] text-neutral-400">$</span>}
            <input 
              type="number"
              step={isCurrency ? 1 : 0.01}
              value={isCurrency ? Math.round(value[0] / 1000) : value[0]}
              onChange={(e) => handleInputChange(0, isCurrency ? (parseFloat(e.target.value) * 1000).toString() : e.target.value)}
              className="w-16 text-[10px] font-mono bg-neutral-100 px-1 py-0.5 rounded text-neutral-600 border-none focus:ring-1 focus:ring-neutral-300"
            />
            <span className="text-[10px] text-neutral-400">-</span>
            <input 
              type="number"
              step={isCurrency ? 1 : 0.01}
              value={isCurrency ? Math.round(value[1] / 1000) : value[1]}
              onChange={(e) => handleInputChange(1, isCurrency ? (parseFloat(e.target.value) * 1000).toString() : e.target.value)}
              className="w-16 text-[10px] font-mono bg-neutral-100 px-1 py-0.5 rounded text-neutral-600 border-none focus:ring-1 focus:ring-neutral-300"
            />
            <span className="text-[10px] text-neutral-400">{displayUnit}</span>
          </div>
        </div>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-1.5 bg-neutral-100 rounded-full" />
        <div 
          className="absolute h-1.5 rounded-full"
          style={{ 
            backgroundColor: color,
            left: `${(pos0 / SLIDER_STEPS) * 100}%`,
            right: `${100 - (pos1 / SLIDER_STEPS) * 100}%`
          }}
        />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={pos0}
          onChange={handleMinChange}
          className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-300 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
        />
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={pos1}
          onChange={handleMaxChange}
          className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-300 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-sm"
        />
      </div>
    </div>
  );
}

export default function MarketChart({ user }: { user: User }) {
  const initialLeon = useMemo(() => getDefaultLeonCountyAnalysis(user.uid), [user.uid]);

  const [activeListings, setActiveListings] = useState<Listing[]>(() => initialLeon.activeListings);
  const [soldListings, setSoldListings] = useState<Listing[]>(() => initialLeon.soldListings);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [isDraggingSold, setIsDraggingSold] = useState(false);

  const [activeAcreRange, setActiveAcreRange] = useState<[number, number]>(() => initialLeon.activeAcreRange);
  const [soldAcreRange, setSoldAcreRange] = useState<[number, number]>(() => initialLeon.soldAcreRange);
  const [activeAcreLimits, setActiveAcreLimits] = useState<[number, number]>(() => initialLeon.activeAcreLimits);
  const [soldAcreLimits, setSoldAcreLimits] = useState<[number, number]>(() => initialLeon.soldAcreLimits);

  const [activePricePerAcreRange, setActivePricePerAcreRange] = useState<[number, number]>(() => initialLeon.activePricePerAcreRange);
  const [soldPricePerAcreRange, setSoldPricePerAcreRange] = useState<[number, number]>(() => initialLeon.soldPricePerAcreRange);
  const [activePricePerAcreLimits, setActivePricePerAcreLimits] = useState<[number, number]>(() => initialLeon.activePricePerAcreLimits);
  const [soldPricePerAcreLimits, setSoldPricePerAcreLimits] = useState<[number, number]>(() => initialLeon.soldPricePerAcreLimits);

  const [activeTotalPriceRange, setActiveTotalPriceRange] = useState<[number, number]>(() => initialLeon.activeTotalPriceRange || [0, 10000000]);
  const [soldTotalPriceRange, setSoldTotalPriceRange] = useState<[number, number]>(() => initialLeon.soldTotalPriceRange || [0, 10000000]);
  const [activeTotalPriceLimits, setActiveTotalPriceLimits] = useState<[number, number]>(() => initialLeon.activeTotalPriceLimits || [0, 10000000]);
  const [soldTotalPriceLimits, setSoldTotalPriceLimits] = useState<[number, number]>(() => initialLeon.soldTotalPriceLimits || [0, 10000000]);

  const [savedAnalyses, setSavedAnalyses] = useState<MarketAnalysis[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [analysisName, setAnalysisName] = useState('Leon County, FL');
  const [showSavedList, setShowSavedList] = useState(false);
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null);
  const [mapAcreRange, setMapAcreRange] = useState<[number, number]>([1, 2]);
  const [discountThreshold, setDiscountThreshold] = useState<number>(65);
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const initialLoadDoneRef = useRef(false);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToastNotification({ type, message });
    setTimeout(() => {
      setToastNotification(prev => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Compute county metadata for defaulting county queue
  const countyData = useMemo(() => {
    const map = new Map<string, { total: number; name: string }>();
    activeListings.forEach(l => {
      const name = l.county?.trim() || l.city?.trim() || 'Unspecified County';
      const existing = map.get(name) || { total: 0, name };
      existing.total += 1;
      map.set(name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [activeListings]);

  const defaultCounty = countyData[0]?.name || 'Leon County';

  // Load / reset to Leon County sample defaults
  const loadLeonCountyDefaults = async () => {
    const leon = getDefaultLeonCountyAnalysis(user.uid);
    setActiveListings(leon.activeListings);
    setSoldListings(leon.soldListings);
    setActiveAcreRange(leon.activeAcreRange);
    setSoldAcreRange(leon.soldAcreRange);
    setActiveAcreLimits(leon.activeAcreLimits);
    setSoldAcreLimits(leon.soldAcreLimits);
    setActivePricePerAcreRange(leon.activePricePerAcreRange);
    setSoldPricePerAcreRange(leon.soldPricePerAcreRange);
    setActivePricePerAcreLimits(leon.activePricePerAcreLimits);
    setSoldPricePerAcreLimits(leon.soldPricePerAcreLimits);
    setActiveTotalPriceRange(leon.activeTotalPriceRange || [0, 10000000]);
    setSoldTotalPriceRange(leon.soldTotalPriceRange || [0, 10000000]);
    setActiveTotalPriceLimits(leon.activeTotalPriceLimits || [0, 10000000]);
    setSoldTotalPriceLimits(leon.soldTotalPriceLimits || [0, 10000000]);
    setAnalysisName('Leon County, FL');
    setCurrentAnalysisId(null);
    showToast('info', 'Loaded Leon County, FL sample market dataset.');
  };

  const handleStartNewMarket = () => {
    setCurrentAnalysisId(null);
    setActiveListings([]);
    setSoldListings([]);
    setAnalysisName('');
    setActiveAcreLimits([0, 100]);
    setActiveAcreRange([0, 100]);
    setSoldAcreLimits([0, 100]);
    setSoldAcreRange([0, 100]);
    setActivePricePerAcreLimits([0, 1000000]);
    setActivePricePerAcreRange([0, 1000000]);
    setSoldPricePerAcreLimits([0, 1000000]);
    setSoldPricePerAcreRange([0, 1000000]);
    setActiveTotalPriceLimits([0, 10000000]);
    setActiveTotalPriceRange([0, 10000000]);
    setSoldTotalPriceLimits([0, 10000000]);
    setSoldTotalPriceRange([0, 10000000]);
    showToast('info', 'Started new market. Upload Active and Sold CSV files to populate.');
  };

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'marketAnalyses'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const analyses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MarketAnalysis[];
      setSavedAnalyses(analyses);

      // Only auto-load once on initial mount
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        if (analyses.length > 0) {
          const first = analyses[0];
          handleLoad(first);
        } else if (snapshot.empty) {
          // Auto-seed default Leon County analysis to Firestore for new user/guest
          try {
            const defaultLeon = getDefaultLeonCountyAnalysis(user.uid);
            const cleanActive = defaultLeon.activeListings.map(sanitizeListing);
            const cleanSold = defaultLeon.soldListings.map(sanitizeListing);
            const payload = cleanObjectForFirestore({
              ...defaultLeon,
              activeListings: cleanActive,
              soldListings: cleanSold,
              createdAt: Timestamp.now(),
              uid: user.uid
            });
            const docRef = await addDoc(collection(db, 'marketAnalyses'), payload);
            setCurrentAnalysisId(docRef.id);
          } catch (err) {
            console.error('Error auto-seeding Leon County to Firestore:', err);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleSaveAsNew = async () => {
    if (!user) {
      showToast('error', 'You must be logged in to save markets.');
      return;
    }
    const targetName = analysisName.trim() || defaultCounty || 'New Market Analysis';
    if (activeListings.length === 0 && soldListings.length === 0) {
      showToast('error', 'Please upload active or sold comps before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const cleanActive = activeListings.map(sanitizeListing);
      const cleanSold = soldListings.map(sanitizeListing);

      const payload = cleanObjectForFirestore({
        name: targetName,
        activeListings: cleanActive,
        soldListings: cleanSold,
        activeAcreRange,
        soldAcreRange,
        activeAcreLimits,
        soldAcreLimits,
        activePricePerAcreRange,
        soldPricePerAcreRange,
        activePricePerAcreLimits,
        soldPricePerAcreLimits,
        activeTotalPriceRange,
        soldTotalPriceRange,
        activeTotalPriceLimits,
        soldTotalPriceLimits,
        createdAt: Timestamp.now(),
        uid: user.uid
      });

      const docRef = await addDoc(collection(db, 'marketAnalyses'), payload);
      setCurrentAnalysisId(docRef.id);
      setAnalysisName(targetName);
      showToast('success', `Saved market "${targetName}" successfully!`);
    } catch (error: any) {
      console.error('Error saving new market analysis:', error);
      showToast('error', `Failed to save market: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCurrent = async () => {
    if (!user || !currentAnalysisId) {
      return handleSaveAsNew();
    }
    const targetName = analysisName.trim() || 'Market Analysis';
    setIsSaving(true);
    try {
      const cleanActive = activeListings.map(sanitizeListing);
      const cleanSold = soldListings.map(sanitizeListing);

      const payload = cleanObjectForFirestore({
        name: targetName,
        activeListings: cleanActive,
        soldListings: cleanSold,
        activeAcreRange,
        soldAcreRange,
        activeAcreLimits,
        soldAcreLimits,
        activePricePerAcreRange,
        soldPricePerAcreRange,
        activePricePerAcreLimits,
        soldPricePerAcreLimits,
        activeTotalPriceRange,
        soldTotalPriceRange,
        activeTotalPriceLimits,
        soldTotalPriceLimits,
        updatedAt: Timestamp.now(),
        uid: user.uid
      });

      await updateDoc(doc(db, 'marketAnalyses', currentAnalysisId), payload);
      showToast('success', `Market analysis "${targetName}" updated successfully!`);
    } catch (error: any) {
      console.error('Error updating market analysis:', error);
      showToast('error', `Failed to update market: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = (analysis: MarketAnalysis) => {
    setCurrentAnalysisId(analysis.id);
    setActiveListings(analysis.activeListings || []);
    setSoldListings(analysis.soldListings || []);
    setActiveAcreRange(analysis.activeAcreRange || [0, 100]);
    setSoldAcreRange(analysis.soldAcreRange || [0, 100]);
    setActiveAcreLimits(analysis.activeAcreLimits || [0, 100]);
    setSoldAcreLimits(analysis.soldAcreLimits || [0, 100]);
    setActivePricePerAcreRange(analysis.activePricePerAcreRange || [0, 1000000]);
    setSoldPricePerAcreRange(analysis.soldPricePerAcreRange || [0, 1000000]);
    setActivePricePerAcreLimits(analysis.activePricePerAcreLimits || [0, 1000000]);
    setSoldPricePerAcreLimits(analysis.soldPricePerAcreLimits || [0, 1000000]);
    setActiveTotalPriceRange(analysis.activeTotalPriceRange || [0, 10000000]);
    setSoldTotalPriceRange(analysis.soldTotalPriceRange || [0, 10000000]);
    setActiveTotalPriceLimits(analysis.activeTotalPriceLimits || [0, 10000000]);
    setSoldTotalPriceLimits(analysis.soldTotalPriceLimits || [0, 10000000]);
    setAnalysisName(analysis.name);
    setShowSavedList(false);
    showToast('info', `Loaded market "${analysis.name}".`);
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'marketAnalyses', id));
      if (currentAnalysisId === id) {
        setCurrentAnalysisId(null);
      }
      showToast('info', `Deleted market "${name}".`);
    } catch (error: any) {
      console.error('Error deleting analysis:', error);
      showToast('error', `Failed to delete: ${error?.message || 'Error'}`);
    }
  };

  const updateRoadFrontage = async (listingId: string, status: 'Yes' | 'Maybe' | 'No') => {
    const updatedActive = activeListings.map(l => l.id === listingId ? { ...l, roadFrontage: status } : l);
    const updatedSold = soldListings.map(l => l.id === listingId ? { ...l, roadFrontage: status } : l);
    
    setActiveListings(updatedActive);
    setSoldListings(updatedSold);

    if (currentAnalysisId && user) {
      try {
        const cleanActive = updatedActive.map(sanitizeListing);
        const cleanSold = updatedSold.map(sanitizeListing);
        await updateDoc(doc(db, 'marketAnalyses', currentAnalysisId), cleanObjectForFirestore({
          activeListings: cleanActive,
          soldListings: cleanSold,
          uid: user.uid
        }));
      } catch (error) {
        console.error('Error updating road frontage in Firestore:', error);
      }
    }
  };

  const updateReviewStatus = async (listingId: string, status: 'Yes' | 'Maybe' | 'No') => {
    const listing = [...activeListings, ...soldListings].find(l => l.id === listingId);
    const updatedActive = activeListings.map(l => l.id === listingId ? { ...l, reviewStatus: status } : l);
    const updatedSold = soldListings.map(l => l.id === listingId ? { ...l, reviewStatus: status } : l);
    
    setActiveListings(updatedActive);
    setSoldListings(updatedSold);

    if (currentAnalysisId && user) {
      try {
        const cleanActive = updatedActive.map(sanitizeListing);
        const cleanSold = updatedSold.map(sanitizeListing);
        await updateDoc(doc(db, 'marketAnalyses', currentAnalysisId), cleanObjectForFirestore({
          activeListings: cleanActive,
          soldListings: cleanSold,
          uid: user.uid
        }));
      } catch (error) {
        console.error('Error updating review status in Firestore:', error);
      }
    }

    // Automatically sync Yes and Maybe to CRM Leads (and remove on No)
    if (user && listing) {
      try {
        const qProps = query(
          collection(db, 'properties'),
          where('uid', '==', user.uid)
        );
        const snapshot = await getDocs(qProps);
        const existingDoc = snapshot.docs.find(d => {
          const data = d.data();
          const matchUrl = listing.url && data.listingLink && data.listingLink === listing.url;
          const matchAddr = listing.address && data.address && data.address.toLowerCase() === listing.address.toLowerCase();
          return matchUrl || matchAddr;
        });

        if (status === 'Yes' || status === 'Maybe') {
          if (!existingDoc) {
            let estValue = listing.price;
            if (listing.lat && listing.lng) {
              const r = getAcreRange(listing.acres);
              const relevantSold = soldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= r[0] && l.acres <= r[1]);
              const knn = getKnnEstimate(listing.lat, listing.lng, removeOutliers(relevantSold));
              if (knn && knn > 0) estValue = knn * listing.acres;
            }
            const targetOfferPrice = Math.round(estValue * 0.4);

            await addDoc(collection(db, 'properties'), {
              address: listing.address || `${listing.city || 'Property'}, ${listing.state || ''} (${listing.acres.toFixed(2)} ac)`.trim(),
              apn: 'Pending',
              county: listing.city || '',
              state: listing.state || '',
              lotSize: listing.acres,
              askingPrice: listing.price,
              marketValue: Math.round(estValue),
              targetOfferPrice,
              listingLink: listing.url || '',
              notes: `Auto-pushed lead from Market Analysis review (${status}). Listed at $${listing.price.toLocaleString()} ($${Math.round(listing.pricePerAcre)}/ac).`,
              status: 'Lead',
              uid: user.uid,
              createdAt: Timestamp.now(),
            });
          } else {
            // Update notes if property exists and is a Lead
            const data = existingDoc.data();
            if (data.status === 'Lead') {
              await updateDoc(doc(db, 'properties', existingDoc.id), {
                notes: `Updated review status: ${status}. Listed at $${listing.price.toLocaleString()}.`,
              });
            }
          }
        } else if (status === 'No') {
          // If assigned 'No', automatically remove from Leads if still at 'Lead' stage
          if (existingDoc) {
            const data = existingDoc.data();
            if (data.status === 'Lead') {
              await deleteDoc(doc(db, 'properties', existingDoc.id));
            }
          }
        }
      } catch (error) {
        console.error('Error auto-syncing lead from review status:', error);
      }
    }
  };

  const exportActiveListingsToExcel = () => {
    if (activeListings.length === 0) return;

    const ranges: { label: string; range: [number, number] }[] = [
      { label: '1-2 ac', range: [1, 2] },
      { label: '2-3 ac', range: [2, 3] },
      { label: '3-5 ac', range: [3, 5] },
      { label: '5-10 ac', range: [5, 10] },
      { label: '10-20 ac', range: [10, 20] },
      { label: '20-50 ac', range: [20, 50] },
      { label: '50+ ac', range: [50, 1000000] },
    ];

    // Pre-calculate outlier-filtered sold comps per acreage bracket
    const soldCompsByRange = ranges.map(r => {
      const relevantSold = soldListings.filter(l => 
        l.lat && l.lng && l.type === 'sold' && l.acres >= r.range[0] && l.acres <= r.range[1]
      );
      return {
        label: r.label,
        comps: removeOutliers(relevantSold)
      };
    });

    const data = activeListings.map(listing => {
      const row: Record<string, any> = {
        'Address': listing.address || '',
        'City': listing.city || '',
        'State': listing.state || '',
        'Zip': listing.zip || '',
        'County': listing.county || '',
        'Website Link': listing.url || '',
        'Acres': listing.acres,
        'List Price': listing.price,
        'List Price / Acre': Math.round(listing.pricePerAcre),
      };

      // Est. Value for listing's own acreage range
      if (listing.lat && listing.lng) {
        const lotRange = getAcreRange(listing.acres);
        const lotSoldComps = soldListings.filter(l => 
          l.lat && l.lng && l.type === 'sold' && l.acres >= lotRange[0] && l.acres <= lotRange[1]
        );
        const lotEst = getKnnEstimate(listing.lat, listing.lng, removeOutliers(lotSoldComps));
        row['Est. Value $/Ac'] = lotEst ? Math.round(lotEst) : 'N/A';
      } else {
        row['Est. Value $/Ac'] = 'N/A';
      }

      // Heatmap Est $/Ac and % Increase for ALL acreage ranges sequentially
      soldCompsByRange.forEach(({ label, comps }) => {
        if (listing.lat && listing.lng) {
          const est = getKnnEstimate(listing.lat, listing.lng, comps);
          if (est && listing.pricePerAcre > 0) {
            const diff = est - listing.pricePerAcre;
            const pct = (diff / listing.pricePerAcre) * 100;
            row[`Heatmap Est $/Ac (${label})`] = Math.round(est);
            row[`Increase % (${label})`] = `${Math.round(pct)}%`;
          } else {
            row[`Heatmap Est $/Ac (${label})`] = 'N/A';
            row[`Increase % (${label})`] = 'N/A';
          }
        } else {
          row[`Heatmap Est $/Ac (${label})`] = 'N/A';
          row[`Increase % (${label})`] = 'N/A';
        }
      });

      row['Road Frontage'] = listing.roadFrontage || 'Pending';
      row['Review Status'] = listing.reviewStatus || 'Pending';

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Active Listings');

    // Auto column widths
    if (data.length > 0) {
      const colWidths = Object.keys(data[0]).map(key => ({
        wch: Math.max(key.length + 3, 14)
      }));
      worksheet['!cols'] = colWidths;
    }

    const titleStr = analysisName ? analysisName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Market_Analysis';
    const fileName = `Active_Listings_${titleStr}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const parseCSV = (file: File, type: 'active' | 'sold') => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData: Listing[] = results.data
          .map((row: any, index: number) => {
            const price = parseFloat(row['PRICE']?.replace(/[$,]/g, '') || '0');
            const lotSizeSqft = parseFloat(row['LOT SIZE'] || '0');
            const acres = lotSizeSqft / 43560;
            const pricePerAcre = acres > 0 ? price / acres : 0;
            const url = row['URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)'] || '';
            
            const getValue = (names: string[]) => {
              for (const name of names) {
                const val = row[name] || row[name.toUpperCase()] || row[name.toLowerCase()];
                if (val && typeof val === 'string' && val.trim()) return val.trim();
              }
              return '';
            };

            const county = getValue(['LOCATION', 'COUNTY', 'PARISH', 'LOCATION/COUNTY']) || row['CITY'] || '';
            
            // Collect images
            const imagesList: string[] = [];
            const primaryImg = getValue(['PHOTO URL', 'IMAGE URL', 'PRIMARY PHOTO', 'IMAGE', 'THUMBNAIL', 'PHOTO']);
            if (primaryImg) {
              primaryImg.split(/[,;\n]/).forEach(u => {
                const trimmed = u.trim();
                if (trimmed.startsWith('http') && !imagesList.includes(trimmed)) imagesList.push(trimmed);
              });
            }
            ['PHOTO URL 1', 'PHOTO URL 2', 'PHOTO URL 3', 'PHOTO URL 4', 'PHOTOS', 'PHOTO_URL_1', 'PHOTO_URL_2'].forEach(key => {
              const val = row[key];
              if (val && typeof val === 'string') {
                val.split(/[,;\n]/).forEach(u => {
                  const trimmed = u.trim();
                  if (trimmed.startsWith('http') && !imagesList.includes(trimmed)) {
                    imagesList.push(trimmed);
                  }
                });
              }
            });

            // Case-insensitive coordinate lookup
            const getCoord = (names: string[]) => {
              for (const name of names) {
                const val = row[name] || row[name.toUpperCase()] || row[name.toLowerCase()];
                if (val) return parseFloat(val);
              }
              return 0;
            };

            const lat = getCoord(['LATITUDE', 'Lat', 'LAT']);
            const lng = getCoord(['LONGITUDE', 'Long', 'LNG', 'LON']);
            
            if (!price || !lotSizeSqft) return null;

            return sanitizeListing({
              id: `${type}-${index}-${Date.now()}`,
              address: row['ADDRESS'] || '',
              city: row['CITY'] || '',
              state: row['STATE OR PROVINCE'] || '',
              county,
              price,
              lotSizeSqft,
              acres,
              pricePerAcre,
              url,
              status: row['STATUS'] || '',
              type,
              lat: lat !== 0 ? lat : undefined,
              lng: lng !== 0 ? lng : undefined,
              imageUrl: imagesList[0] || undefined,
              images: imagesList.length > 0 ? imagesList : undefined
            });
          })
          .filter((item) => item !== null) as Listing[];

        if (parsedData.length > 0) {
          const acres = parsedData.map(l => l.acres);
          const minAcre = Math.min(...acres);
          const maxAcre = Math.max(...acres);

          const prices = parsedData.map(l => l.pricePerAcre);
          const minPrice = Math.min(...prices);
          const maxPrice = Math.max(...prices);

          const totalPrices = parsedData.map(l => l.price);
          const minTotalPrice = Math.min(...totalPrices);
          const maxTotalPrice = Math.max(...totalPrices);
          
          if (type === 'active') {
            setActiveListings(parsedData);
            setActiveAcreLimits([minAcre, maxAcre]);
            setActiveAcreRange([minAcre, maxAcre]);
            setActivePricePerAcreLimits([minPrice, maxPrice]);
            setActivePricePerAcreRange([minPrice, maxPrice]);
            setActiveTotalPriceLimits([minTotalPrice, maxTotalPrice]);
            setActiveTotalPriceRange([minTotalPrice, maxTotalPrice]);
          } else {
            setSoldListings(parsedData);
            setSoldAcreLimits([minAcre, maxAcre]);
            setSoldAcreRange([minAcre, maxAcre]);
            setSoldPricePerAcreLimits([minPrice, maxPrice]);
            setSoldPricePerAcreRange([minPrice, maxPrice]);
            setSoldTotalPriceLimits([minTotalPrice, maxTotalPrice]);
            setSoldTotalPriceRange([minTotalPrice, maxTotalPrice]);
          }

          // Auto-detect County/State to name this analysis if starting fresh or editing default
          const detectedCounty = parsedData.find(l => l.county)?.county || parsedData[0]?.city;
          const detectedState = parsedData.find(l => l.state)?.state;
          if (detectedCounty && (!analysisName || analysisName === 'Leon County, FL' || currentAnalysisId)) {
            const newName = detectedState ? `${detectedCounty}, ${detectedState}` : detectedCounty;
            setAnalysisName(newName);
            setCurrentAnalysisId(null);
          }

          showToast('info', `Imported ${parsedData.length} ${type} listings from "${file.name}".`);
        } else {
          showToast('error', `No valid listings found in "${file.name}". Check column headers.`);
        }
      },
      error: (err) => {
        console.error('CSV parse error:', err);
        showToast('error', `Failed to parse CSV: ${err.message}`);
      }
    });
  };

  const handleDrop = (e: React.DragEvent, type: 'active' | 'sold') => {
    e.preventDefault();
    if (type === 'active') setIsDraggingActive(false);
    else setIsDraggingSold(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
      parseCSV(file, type);
    }
  };

  const filteredActiveListings = useMemo(() => {
    return activeListings.filter(l => 
      l.acres >= activeAcreRange[0] && 
      l.acres <= activeAcreRange[1] &&
      l.pricePerAcre >= activePricePerAcreRange[0] &&
      l.pricePerAcre <= activePricePerAcreRange[1] &&
      l.price >= activeTotalPriceRange[0] &&
      l.price <= activeTotalPriceRange[1]
    );
  }, [activeListings, activeAcreRange, activePricePerAcreRange, activeTotalPriceRange]);

  const filteredSoldListings = useMemo(() => {
    return soldListings.filter(l => 
      l.acres >= soldAcreRange[0] && 
      l.acres <= soldAcreRange[1] &&
      l.pricePerAcre >= soldPricePerAcreRange[0] &&
      l.pricePerAcre <= soldPricePerAcreRange[1] &&
      l.price >= soldTotalPriceRange[0] &&
      l.price <= soldTotalPriceRange[1]
    );
  }, [soldListings, soldAcreRange, soldPricePerAcreRange, soldTotalPriceRange]);

  const interestingListings = useMemo(() => {
    const all = [...activeListings, ...soldListings];
    return all.filter(l => 
      l.roadFrontage === 'Yes' || 
      l.roadFrontage === 'Maybe' || 
      l.reviewStatus === 'Yes' || 
      l.reviewStatus === 'Maybe'
    );
  }, [activeListings, soldListings]);

  const [activeTab, setActiveTab] = useState<'active' | 'sold' | 'interesting'>('active');

  const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  };

  const soldCompsSummary = useMemo(() => {
    const ranges = [
      { label: '1-2', min: 1, max: 2 },
      { label: '2-3', min: 2, max: 3 },
      { label: '3-5', min: 3, max: 5 },
      { label: '5-10', min: 5, max: 10 },
      { label: '10-20', min: 10, max: 20 },
      { label: '20-50', min: 20, max: 50 },
      { label: '50-max', min: 50, max: Infinity },
    ];

    return ranges.map(range => {
      const compsInRange = soldListings.filter(l => l.acres >= range.min && (range.max === Infinity ? true : l.acres < range.max));
      const medianPricePerAcre = calculateMedian(compsInRange.map(l => l.pricePerAcre));
      return {
        range: range.label,
        min: range.min,
        max: range.max,
        median: medianPricePerAcre,
        count: compsInRange.length
      };
    });
  }, [soldListings]);

  type SortField = 'acres' | 'price' | 'pricePerAcre' | 'estValue' | 'heatmapEst';
  type SortOrder = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField>('pricePerAcre');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getListingEstValue = (listing: Listing, allSoldListings: Listing[]): number => {
    if (!listing.lat || !listing.lng) return -Infinity;
    const r = getAcreRange(listing.acres);
    const relevantSold = allSoldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= r[0] && l.acres <= r[1]);
    const est = getKnnEstimate(listing.lat, listing.lng, removeOutliers(relevantSold));
    return est || -Infinity;
  };

  const getListingHeatmapPct = (listing: Listing, allSoldListings: Listing[], mapRange: [number, number]): number => {
    if (!listing.lat || !listing.lng || listing.pricePerAcre <= 0) return -Infinity;
    const relevantSold = allSoldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= mapRange[0] && l.acres <= mapRange[1]);
    const est = getKnnEstimate(listing.lat, listing.lng, removeOutliers(relevantSold));
    if (!est) return -Infinity;
    const diff = est - listing.pricePerAcre;
    return (diff / listing.pricePerAcre) * 100;
  };

  const sortListings = (listings: Listing[]) => {
    const mapped = listings.map(l => ({
      listing: l,
      acres: l.acres,
      price: l.price,
      pricePerAcre: l.pricePerAcre,
      estValue: getListingEstValue(l, soldListings),
      heatmapEstPct: getListingHeatmapPct(l, soldListings, mapAcreRange)
    }));

    mapped.sort((a, b) => {
      const key = sortField === 'heatmapEst' ? 'heatmapEstPct' : sortField;
      const valA = a[key];
      const valB = b[key];

      if (valA === -Infinity && valB === -Infinity) return 0;
      if (valA === -Infinity) return 1;
      if (valB === -Infinity) return -1;

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return mapped.map(m => m.listing);
  };

  const sortedSoldListings = useMemo(() => {
    return sortListings(filteredSoldListings);
  }, [filteredSoldListings, sortField, sortOrder, soldListings, mapAcreRange]);

  const sortedActiveListings = useMemo(() => {
    return sortListings(filteredActiveListings);
  }, [filteredActiveListings, sortField, sortOrder, soldListings, mapAcreRange]);

  const sortedInterestingListings = useMemo(() => {
    return sortListings(interestingListings);
  }, [interestingListings, sortField, sortOrder, soldListings, mapAcreRange]);

  const chartDataActive = useMemo(() => {
    return filteredActiveListings.map(l => ({
      x: l.acres,
      y: l.pricePerAcre,
      address: l.address,
      url: l.url,
      price: l.price,
      type: 'active'
    }));
  }, [filteredActiveListings]);

  const chartDataSold = useMemo(() => {
    return filteredSoldListings.map(l => ({
      x: l.acres,
      y: l.pricePerAcre,
      address: l.address,
      url: l.url,
      price: l.price,
      type: 'sold'
    }));
  }, [filteredSoldListings]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-neutral-200 shadow-xl rounded-lg text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
              data.type === 'active' ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
            )}>
              {data.type}
            </span>
            <p className="font-bold text-neutral-900 truncate max-w-[150px]">{data.address}</p>
          </div>
          <p className="text-neutral-500">Acres: <span className="text-neutral-900 font-mono">{data.x.toFixed(2)}</span></p>
          <p className="text-neutral-500">Price/Acre: <span className="text-neutral-900 font-mono">${Math.round(data.y).toLocaleString()}</span></p>
          <p className="text-neutral-500">Total Price: <span className="text-neutral-900 font-mono">${data.price.toLocaleString()}</span></p>
          <p className="mt-2 text-blue-600 font-medium">Click to view listing</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Toast Alert Notification */}
      <AnimatePresence>
        {toastNotification && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            className={cn(
              "fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md max-w-md",
              toastNotification.type === 'success' && "bg-emerald-50/95 border-emerald-200 text-emerald-900",
              toastNotification.type === 'error' && "bg-rose-50/95 border-rose-200 text-rose-900",
              toastNotification.type === 'info' && "bg-blue-50/95 border-blue-200 text-blue-900"
            )}
          >
            {toastNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
            {toastNotification.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            {toastNotification.type === 'info' && <Info className="w-5 h-5 text-blue-600 shrink-0" />}
            <p className="text-sm font-medium flex-1">{toastNotification.message}</p>
            <button
              onClick={() => setToastNotification(null)}
              className="p-1 hover:bg-black/5 rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Market Analysis Chart</h2>
          <p className="text-neutral-500">Upload Redfin CSV exports to analyze market pricing trends and save custom markets.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Start New Market Button */}
          <button
            onClick={handleStartNewMarket}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Clear current data and start a new market analysis"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>New Market</span>
          </button>

          {/* Sample Comps Reload */}
          <button
            onClick={loadLeonCountyDefaults}
            className="flex items-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-xs font-semibold transition-all shadow-xs cursor-pointer"
            title="Reload default Leon County sample market data"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Leon County Sample</span>
          </button>

          {/* Saved Analyses Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSavedList(!showSavedList)}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold text-neutral-700 hover:bg-neutral-50 transition-colors shadow-xs"
            >
              <FolderOpen className="w-4 h-4 text-neutral-500" />
              <span>Saved Markets</span>
              <span className="px-1.5 py-0.5 bg-neutral-100 rounded-full text-[10px] text-neutral-600 font-bold">
                {savedAnalyses.length}
              </span>
            </button>

            <AnimatePresence>
              {showSavedList && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-2xl z-50 overflow-hidden"
                >
                  <div className="p-3 border-b border-neutral-100 bg-neutral-50/80 flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Saved Market Analyses</h4>
                    <span className="text-[10px] text-neutral-500 font-medium">{savedAnalyses.length} saved</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
                    {savedAnalyses.length === 0 ? (
                      <div className="p-8 text-center">
                        <FolderOpen className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                        <p className="text-xs text-neutral-500 font-medium">No saved markets yet.</p>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Upload listings and click Save Market.</p>
                      </div>
                    ) : (
                      savedAnalyses.map((analysis) => {
                        const isCurrent = currentAnalysisId === analysis.id;
                        const activeCount = analysis.activeListings?.length || 0;
                        const soldCount = analysis.soldListings?.length || 0;

                        return (
                          <div 
                            key={analysis.id} 
                            className={cn(
                              "group flex items-center justify-between p-3 transition-colors",
                              isCurrent ? "bg-blue-50/70 border-l-2 border-blue-600" : "hover:bg-neutral-50"
                            )}
                          >
                            <button
                              onClick={() => handleLoad(analysis)}
                              className="flex-1 text-left min-w-0 pr-2"
                            >
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-neutral-900 truncate">{analysis.name}</p>
                                {isCurrent && (
                                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded text-[9px] font-bold shrink-0">Active</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1">
                                <span>{activeCount} active</span>
                                <span>•</span>
                                <span>{soldCount} sold</span>
                                <span>•</span>
                                <span>
                                  {analysis.createdAt instanceof Timestamp 
                                    ? analysis.createdAt.toDate().toLocaleDateString() 
                                    : 'Saved'}
                                </span>
                              </div>
                            </button>
                            <button
                              onClick={(e) => handleDelete(analysis.id, analysis.name, e)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md opacity-70 group-hover:opacity-100 transition-all shrink-0 cursor-pointer"
                              title={`Delete ${analysis.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Export to Excel */}
          {activeListings.length > 0 && (
            <button
              onClick={exportActiveListingsToExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-all shadow-xs cursor-pointer"
              title="Download Active Listings Excel Sheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel</span>
            </button>
          )}

          {/* Save / Update Controls */}
          <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg p-1 shadow-xs">
            <input
              type="text"
              placeholder="Market Name..."
              value={analysisName}
              onChange={(e) => setAnalysisName(e.target.value)}
              className="px-2.5 py-1 text-xs bg-transparent border-none focus:ring-0 w-36 sm:w-44 font-semibold text-neutral-900 placeholder:text-neutral-400"
            />

            {currentAnalysisId ? (
              <>
                <button
                  onClick={handleUpdateCurrent}
                  disabled={isSaving || (activeListings.length === 0 && soldListings.length === 0)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                  title="Update currently loaded market"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Update</span>
                </button>

                <button
                  onClick={handleSaveAsNew}
                  disabled={isSaving || (activeListings.length === 0 && soldListings.length === 0)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md text-xs font-semibold disabled:opacity-50 transition-all cursor-pointer"
                  title="Save current state as a new market document"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Save Copy</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleSaveAsNew}
                disabled={isSaving || (activeListings.length === 0 && soldListings.length === 0)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                title="Save this analysis as a new market"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Market</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Demo / Sample Notice Banner */}
      <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-neutral-700 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-900">Leon County, FL Sample Preloaded</span>
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[11px] font-semibold">Active Demo</span>
            </div>
            <p className="text-xs text-neutral-600 mt-0.5">
              Default market comps and active listings are loaded so new users can explore scatter plots, box plot distributions, geospatial comp heatmaps, and deal swiping right away. Upload your own Redfin CSVs anytime to analyze other markets.
            </p>
          </div>
        </div>
        <button
          onClick={loadLeonCountyDefaults}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs shadow-xs transition-colors shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Leon Comps</span>
        </button>
      </div>

      {/* Upload Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDraggingActive(true); }}
          onDragLeave={() => setIsDraggingActive(false)}
          onDrop={(e) => handleDrop(e, 'active')}
          className={cn(
            "relative group flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl transition-all duration-200",
            isDraggingActive ? "border-blue-500 bg-blue-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white shadow-sm",
            activeListings.length > 0 && "border-blue-200 bg-blue-50/10"
          )}
        >
          <div className={cn(
            "p-4 rounded-full mb-4 transition-colors",
            activeListings.length > 0 ? "bg-blue-100 text-blue-600" : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200 group-hover:text-neutral-500"
          )}>
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-1">Active Listings</h3>
          <p className="text-xs text-neutral-500 text-center max-w-[200px]">
            {activeListings.length > 0 
              ? `${activeListings.length} listings loaded` 
              : "Drag and drop Redfin Active CSV here"}
          </p>
          {activeListings.length > 0 && (
            <button 
              onClick={() => setActiveListings([])}
              className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDraggingSold(true); }}
          onDragLeave={() => setIsDraggingSold(false)}
          onDrop={(e) => handleDrop(e, 'sold')}
          className={cn(
            "relative group flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl transition-all duration-200",
            isDraggingSold ? "border-green-500 bg-green-50/50" : "border-neutral-200 hover:border-neutral-300 bg-white shadow-sm",
            soldListings.length > 0 && "border-green-200 bg-green-50/10"
          )}
        >
          <div className={cn(
            "p-4 rounded-full mb-4 transition-colors",
            soldListings.length > 0 ? "bg-green-100 text-green-600" : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200 group-hover:text-neutral-500"
          )}>
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900 mb-1">Sold Listings</h3>
          <p className="text-xs text-neutral-500 text-center max-w-[200px]">
            {soldListings.length > 0 
              ? `${soldListings.length} listings loaded` 
              : "Drag and drop Redfin Sold CSV here"}
          </p>
          {soldListings.length > 0 && (
            <button 
              onClick={() => setSoldListings([])}
              className="absolute top-4 right-4 p-2 text-neutral-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Range Sliders */}
      <AnimatePresence>
        {(activeListings.length > 0 || soldListings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-6 bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm overflow-x-auto"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 min-w-[650px]">
              {activeListings.length > 0 ? (
                <div className="space-y-6">
                  <RangeSlider
                    label="Active Acreage Range"
                    min={activeAcreLimits[0]}
                    max={activeAcreLimits[1]}
                    value={activeAcreRange}
                    onChange={setActiveAcreRange}
                    color="#3b82f6"
                  />
                  <RangeSlider
                    label="Active Price/Acre Range"
                    min={activePricePerAcreLimits[0]}
                    max={activePricePerAcreLimits[1]}
                    value={activePricePerAcreRange}
                    onChange={setActivePricePerAcreRange}
                    color="#3b82f6"
                    isCurrency
                    unitLabel="k/ac"
                    useLogScale={true}
                  />
                  <RangeSlider
                    label="Active Total Price Range"
                    min={activeTotalPriceLimits[0]}
                    max={activeTotalPriceLimits[1]}
                    value={activeTotalPriceRange}
                    onChange={setActiveTotalPriceRange}
                    color="#3b82f6"
                    isCurrency
                    unitLabel="k total"
                    useLogScale={true}
                  />
                </div>
              ) : <div className="hidden md:block" />}
              {soldListings.length > 0 ? (
                <div className="space-y-6">
                  <RangeSlider
                    label="Sold Acreage Range"
                    min={soldAcreLimits[0]}
                    max={soldAcreLimits[1]}
                    value={soldAcreRange}
                    onChange={setSoldAcreRange}
                    color="#22c55e"
                  />
                  <RangeSlider
                    label="Sold Price/Acre Range"
                    min={soldPricePerAcreLimits[0]}
                    max={soldPricePerAcreLimits[1]}
                    value={soldPricePerAcreRange}
                    onChange={setSoldPricePerAcreRange}
                    color="#22c55e"
                    isCurrency
                    unitLabel="k/ac"
                    useLogScale={true}
                  />
                  <RangeSlider
                    label="Sold Total Price Range"
                    min={soldTotalPriceLimits[0]}
                    max={soldTotalPriceLimits[1]}
                    value={soldTotalPriceRange}
                    onChange={setSoldTotalPriceRange}
                    color="#22c55e"
                    isCurrency
                    unitLabel="k total"
                    useLogScale={true}
                  />
                </div>
              ) : <div className="hidden md:block" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart Section */}
      <AnimatePresence>
        {(activeListings.length > 0 || soldListings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white p-6 sm:p-8 rounded-2xl border border-neutral-200 shadow-sm overflow-x-auto"
          >
            <div className="min-w-[800px]">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Price per Acre Analysis</h3>
                  <p className="text-sm text-neutral-500">Visualizing the relationship between lot size and pricing.</p>
                </div>
                <div className="flex items-center gap-6">
                  {activeListings.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-xs font-medium text-neutral-600">Active</span>
                    </div>
                  )}
                  {soldListings.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-xs font-medium text-neutral-600">Sold</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="h-[450px] w-full min-w-[800px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart 
                    id="market-analysis-scatter-chart"
                    margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Acres" 
                      unit="ac" 
                      scale="log"
                      domain={['auto', 'auto']}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={30}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      tickFormatter={(value) => value < 1 ? value.toFixed(2) : value.toFixed(1)}
                    >
                      <Label value="Acres" offset={-10} position="insideBottom" fill="#737373" fontSize={12} fontWeight={600} />
                    </XAxis>
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Price/Acre" 
                      unit="$" 
                      scale="log"
                      domain={['auto', 'auto']}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={30}
                      tick={{ fill: '#737373', fontSize: 12 }}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                        if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
                        return `$${value}`;
                      }}
                    >
                      <Label value="Price per Acre" angle={-90} position="insideLeft" style={{ textAnchor: 'middle' }} fill="#737373" fontSize={12} fontWeight={600} />
                    </YAxis>
                    <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    {activeListings.length > 0 && (
                      <Scatter 
                        name="Active" 
                        data={chartDataActive} 
                        fill="#3b82f6" 
                        onClick={(data) => window.open(data.url, '_blank')}
                        className="cursor-pointer"
                      >
                        {chartDataActive.map((entry, index) => (
                          <Cell 
                            key={`cell-active-${index}`} 
                            fill="#3b82f6" 
                            fillOpacity={0.6}
                            stroke="#2563eb"
                            strokeWidth={2}
                          />
                        ))}
                      </Scatter>
                    )}
                    {soldListings.length > 0 && (
                      <Scatter 
                        name="Sold" 
                        data={chartDataSold} 
                        fill="#22c55e" 
                        onClick={(data) => window.open(data.url, '_blank')}
                        className="cursor-pointer"
                      >
                        {chartDataSold.map((entry, index) => (
                          <Cell 
                            key={`cell-sold-${index}`} 
                            fill="#22c55e" 
                            fillOpacity={0.6}
                            stroke="#16a34a"
                            strokeWidth={2}
                          />
                        ))}
                      </Scatter>
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section under Market Chart: Sold Comps Summary on Left, Deal Evaluator Swiper on Right */}
      <AnimatePresence>
        {(activeListings.length > 0 || soldListings.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Side: Sold Comps Summary & Boxplot */}
            <div className="lg:col-span-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
              >
                <div className="p-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">Sold Comps Summary</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">Click any acreage range to view its $/acre boxplot statistical distribution.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Acre Range:</span>
                    <select 
                      value={`${mapAcreRange[0]}-${mapAcreRange[1]}`}
                      onChange={(e) => {
                        const [min, max] = e.target.value.split('-').map(Number);
                        setMapAcreRange([min, max]);
                      }}
                      className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      <option value="1-2">1-2 Acres</option>
                      <option value="2-3">2-3 Acres</option>
                      <option value="3-5">3-5 Acres</option>
                      <option value="5-10">5-10 Acres</option>
                      <option value="10-20">10-20 Acres</option>
                      <option value="20-50">20-50 Acres</option>
                      <option value="50-1000000">50+ Acres</option>
                    </select>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* 3-Column Table */}
                  <div className="border border-neutral-200/80 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-neutral-50 border-b border-neutral-200">
                          <th className="px-5 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Range (Acres)</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Median $/ac</th>
                          <th className="px-5 py-3 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">n (Comps)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 bg-white">
                        {soldCompsSummary.map((row) => {
                          const isSelected = mapAcreRange[0] === row.min && (mapAcreRange[1] === row.max || (row.max === Infinity && mapAcreRange[1] >= 1000000));
                          return (
                            <tr 
                              key={row.range} 
                              onClick={() => setMapAcreRange([row.min, row.max === Infinity ? 1000000 : row.max])}
                              className={cn(
                                "cursor-pointer transition-colors select-none",
                                isSelected 
                                  ? "bg-emerald-50/90 text-emerald-950 font-bold border-l-4 border-emerald-600" 
                                  : "hover:bg-neutral-50 text-neutral-800"
                              )}
                            >
                              <td className="px-5 py-2.5 text-xs font-medium flex items-center gap-2">
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0" />}
                                <span>{row.range}</span>
                              </td>
                              <td className="px-5 py-2.5 text-xs font-mono">
                                {row.median > 0 ? `$${Math.round(row.median).toLocaleString()}` : '-'}
                              </td>
                              <td className="px-5 py-2.5 text-xs text-neutral-600 font-mono">
                                {row.count}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Boxplot Chart */}
                  <BoxPlotChart 
                    soldListings={soldListings}
                    acreRange={mapAcreRange}
                    rangeLabel={mapAcreRange[1] >= 1000000 ? `${mapAcreRange[0]}+` : `${mapAcreRange[0]}-${mapAcreRange[1]}`}
                  />
                </div>
              </motion.div>
            </div>

            {/* Right Side: Deal Evaluator Swiper */}
            <div className="lg:col-span-6">
              <DealSwipeSection 
                activeListings={activeListings}
                soldListings={soldListings}
                selectedCounty={defaultCounty}
                onUpdateReviewStatus={updateReviewStatus}
                onUpdateRoadFrontage={updateRoadFrontage}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Map Section */}
      <AnimatePresence>
        {(activeListings.length > 0 || soldListings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm overflow-x-auto"
          >
            <div className="min-w-[750px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg font-bold text-neutral-900">Geospatial Analysis</h3>
                  <p className="text-sm text-neutral-500">Satellite view with price per acre heatmap.</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  {/* Deal Discount Slider */}
                  <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 px-3.5 py-1.5 rounded-xl shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Deal Threshold</span>
                      <span className="text-xs font-bold text-blue-600 font-mono">{discountThreshold}% of Comp</span>
                    </div>
                    <input 
                      type="range" 
                      min="30" 
                      max="100" 
                      value={discountThreshold} 
                      onChange={(e) => setDiscountThreshold(Number(e.target.value))}
                      className="w-24 sm:w-32 h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                    />
                  </div>

                  {/* Acre Range dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Acre Range:</span>
                    <select 
                      value={`${mapAcreRange[0]}-${mapAcreRange[1]}`}
                      onChange={(e) => {
                        const [min, max] = e.target.value.split('-').map(Number);
                        setMapAcreRange([min, max]);
                      }}
                      className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-700 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="1-2">1-2 Acres</option>
                      <option value="2-3">2-3 Acres</option>
                      <option value="3-5">3-5 Acres</option>
                      <option value="5-10">5-10 Acres</option>
                      <option value="10-20">10-20 Acres</option>
                      <option value="20-50">20-50 Acres</option>
                      <option value="50-1000000">50+ Acres</option>
                    </select>
                  </div>
                </div>
              </div>
              <MarketMap 
                listings={[...filteredActiveListings, ...filteredSoldListings]} 
                acreRange={mapAcreRange} 
                discountThreshold={discountThreshold}
                onUpdateReviewStatus={updateReviewStatus}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Listings Table with Tabs */}
      <AnimatePresence>
        {(activeListings.length > 0 || soldListings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden"
          >
            <div className="border-b border-neutral-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-6">
                <div className="flex overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setActiveTab('active')}
                    className={cn(
                      "px-4 sm:px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                      activeTab === 'active' 
                        ? "border-blue-500 text-blue-600 bg-blue-50/30" 
                        : "border-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    Active Listings ({filteredActiveListings.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('sold')}
                    className={cn(
                      "px-4 sm:px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                      activeTab === 'sold' 
                        ? "border-green-500 text-green-600 bg-green-50/30" 
                        : "border-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    Sold Listings ({filteredSoldListings.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('interesting')}
                    className={cn(
                      "px-4 sm:px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
                      activeTab === 'interesting' 
                        ? "border-amber-500 text-amber-600 bg-amber-50/30" 
                        : "border-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                    )}
                  >
                    Interesting ({interestingListings.length})
                  </button>
                </div>

                {activeListings.length > 0 && (
                  <button
                    onClick={exportActiveListingsToExcel}
                    className="flex items-center gap-2 px-4 py-2 my-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all whitespace-nowrap cursor-pointer self-start sm:self-center"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Download Active Listings (Excel)</span>
                  </button>
                )}
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Website Link</th>
                    
                    <th 
                      onClick={() => handleSort('acres')}
                      className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-900 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(sortField === 'acres' && "text-blue-600 font-extrabold")}>Acres</span>
                        {sortField === 'acres' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('price')}
                      className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-900 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(sortField === 'price' && "text-blue-600 font-extrabold")}>
                          {activeTab === 'sold' ? 'Sold Price' : 'List Price'}
                        </span>
                        {sortField === 'price' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('pricePerAcre')}
                      className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-900 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(sortField === 'pricePerAcre' && "text-blue-600 font-extrabold")}>
                          {activeTab === 'sold' ? 'Sold Per Acre' : 'List Per Acre'}
                        </span>
                        {sortField === 'pricePerAcre' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('estValue')}
                      className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-900 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(sortField === 'estValue' && "text-blue-600 font-extrabold")}>Est. Value</span>
                        {sortField === 'estValue' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleSort('heatmapEst')}
                      className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none hover:text-neutral-900 transition-colors group"
                      title="Sort by Heatmap Est. % increase from list"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn(sortField === 'heatmapEst' && "text-blue-600 font-extrabold")}>Heatmap Est</span>
                        {sortField === 'heatmapEst' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </th>

                    <th className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Road Frontage</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Review Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {(activeTab === 'active' ? sortedActiveListings : activeTab === 'sold' ? sortedSoldListings : sortedInterestingListings).map((listing) => (
                    <tr key={listing.id} className="hover:bg-neutral-50 transition-colors group">
                      <td className="px-6 py-4">
                        <a 
                          href={listing.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={cn(
                            "flex items-center gap-2 text-sm font-medium hover:underline",
                            listing.type === 'active' ? "text-blue-600" : "text-green-600"
                          )}
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span className="truncate max-w-[200px]">{listing.address || 'View Listing'}</span>
                        </a>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 font-mono">
                        {listing.acres.toFixed(2)} ac
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-900 font-bold">
                        ${listing.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-neutral-900 font-mono">
                            ${Math.round(listing.pricePerAcre).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-neutral-400 font-medium">/ acre</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {listing.lat && listing.lng ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-blue-600 font-mono">
                              {(() => {
                                const r = getAcreRange(listing.acres);
                                const relevantSold = soldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= r[0] && l.acres <= r[1]);
                                const est = getKnnEstimate(listing.lat!, listing.lng!, removeOutliers(relevantSold));
                                return est ? `$${Math.round(est).toLocaleString()}` : '-';
                              })()}
                            </span>
                            <span className="text-[10px] text-neutral-400">({listing.acres.toFixed(1)}ac)</span>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {listing.lat && listing.lng ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-purple-600 font-mono">
                              {(() => {
                                const relevantSold = soldListings.filter(l => l.lat && l.lng && l.type === 'sold' && l.acres >= mapAcreRange[0] && l.acres <= mapAcreRange[1]);
                                const est = getKnnEstimate(listing.lat!, listing.lng!, removeOutliers(relevantSold));
                                if (!est) return '-';
                                const diff = est - listing.pricePerAcre;
                                const pct = (diff / listing.pricePerAcre) * 100;
                                return `$${Math.round(est).toLocaleString()} (${pct >= 0 ? '+' : ''}${Math.round(pct)}%)`;
                              })()}
                            </span>
                            <span className="text-[10px] text-neutral-400">({mapAcreRange[0]}-{mapAcreRange[1]}ac)</span>
                          </div>
                        ) : (
                          <span className="text-sm text-neutral-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {(['Yes', 'Maybe', 'No'] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => updateRoadFrontage(listing.id, status)}
                              className={cn(
                                "px-2 py-1 text-[10px] font-bold rounded transition-all",
                                listing.roadFrontage === status
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
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {(['Yes', 'Maybe', 'No'] as const).map((status) => (
                            <button
                              key={status}
                              onClick={() => updateReviewStatus(listing.id, status)}
                              className={cn(
                                "px-2 py-1 text-[10px] font-bold rounded transition-all",
                                listing.reviewStatus === status
                                  ? status === 'Yes' ? "bg-green-500 text-white"
                                    : status === 'Maybe' ? "bg-amber-500 text-white"
                                    : "bg-red-500 text-white"
                                  : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                              )}
                            >
                              {status === 'Yes' ? 'Y' : status === 'Maybe' ? 'M' : 'N'}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(activeTab === 'active' ? sortedActiveListings : activeTab === 'sold' ? sortedSoldListings : sortedInterestingListings).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-neutral-400 text-sm">
                        No {activeTab} listings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
