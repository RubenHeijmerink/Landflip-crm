import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, addDoc, Timestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing, MarketAnalysis } from '../types';
import DealSwipeSection from './DealSwipeSection';
import { Sparkles, Upload, FileText, BarChart2 } from 'lucide-react';
import Papa from 'papaparse';
import { getAcreRange, getKnnEstimate, removeOutliers, sanitizeListing, cleanObjectForFirestore } from '../lib/marketUtils';
import { DEFAULT_LEON_COUNTY_ACTIVE, DEFAULT_LEON_COUNTY_SOLD, getDefaultLeonCountyAnalysis } from '../data/defaultLeonCountyData';

interface DealEvaluatorPageProps {
  user: User;
}

export default function DealEvaluatorPage({ user }: DealEvaluatorPageProps) {
  const [savedAnalyses, setSavedAnalyses] = useState<MarketAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  
  // Local state listings initialized to default Leon County dataset
  const [activeListings, setActiveListings] = useState<Listing[]>(() => DEFAULT_LEON_COUNTY_ACTIVE);
  const [soldListings, setSoldListings] = useState<Listing[]>(() => DEFAULT_LEON_COUNTY_SOLD);
  const [isUploading, setIsUploading] = useState(false);

  // Subscribe to Firestore saved analyses
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'marketAnalyses'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const analyses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MarketAnalysis[];
      setSavedAnalyses(analyses);

      // Auto-load most recent analysis if available
      if (analyses.length > 0) {
        if (!selectedAnalysisId) {
          const first = analyses[0];
          setSelectedAnalysisId(first.id);
          setActiveListings(first.activeListings || []);
          setSoldListings(first.soldListings || []);
        }
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Handle switching loaded market analysis
  const handleSelectAnalysis = (analysis: MarketAnalysis) => {
    setSelectedAnalysisId(analysis.id);
    setActiveListings(analysis.activeListings || []);
    setSoldListings(analysis.soldListings || []);
  };

  // Update Road Frontage status
  const updateRoadFrontage = async (listingId: string, status: 'Yes' | 'Maybe' | 'No') => {
    const updatedActive = activeListings.map(l => l.id === listingId ? { ...l, roadFrontage: status } : l);
    const updatedSold = soldListings.map(l => l.id === listingId ? { ...l, roadFrontage: status } : l);
    
    setActiveListings(updatedActive);
    setSoldListings(updatedSold);

    if (selectedAnalysisId && user) {
      try {
        const cleanActive = updatedActive.map(sanitizeListing);
        const cleanSold = updatedSold.map(sanitizeListing);
        await updateDoc(doc(db, 'marketAnalyses', selectedAnalysisId), cleanObjectForFirestore({
          activeListings: cleanActive,
          soldListings: cleanSold,
          uid: user.uid
        }));
      } catch (error) {
        console.error('Error updating road frontage in Firestore:', error);
      }
    }
  };

  // Update Review Status and auto-sync with CRM Leads
  const updateReviewStatus = async (listingId: string, status: 'Yes' | 'Maybe' | 'No') => {
    const listing = [...activeListings, ...soldListings].find(l => l.id === listingId);
    const updatedActive = activeListings.map(l => l.id === listingId ? { ...l, reviewStatus: status } : l);
    const updatedSold = soldListings.map(l => l.id === listingId ? { ...l, reviewStatus: status } : l);
    
    setActiveListings(updatedActive);
    setSoldListings(updatedSold);

    if (selectedAnalysisId && user) {
      try {
        const cleanActive = updatedActive.map(sanitizeListing);
        const cleanSold = updatedSold.map(sanitizeListing);
        await updateDoc(doc(db, 'marketAnalyses', selectedAnalysisId), cleanObjectForFirestore({
          activeListings: cleanActive,
          soldListings: cleanSold,
          uid: user.uid
        }));
      } catch (error) {
        console.error('Error updating review status in Firestore:', error);
      }
    }

    // Auto-sync Yes/Maybe to CRM Leads
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
              county: listing.county || listing.city || '',
              state: listing.state || '',
              lotSize: listing.acres,
              askingPrice: listing.price,
              marketValue: Math.round(estValue),
              targetOfferPrice,
              listingLink: listing.url || '',
              notes: `Auto-pushed lead from Deal Evaluator (${status}). Listed at $${listing.price.toLocaleString()} ($${Math.round(listing.pricePerAcre)}/ac).`,
              status: 'Lead',
              uid: user.uid,
              createdAt: Timestamp.now(),
            });
          }
        } else if (status === 'No') {
          if (existingDoc && existingDoc.data().status === 'Lead') {
            await deleteDoc(doc(db, 'properties', existingDoc.id));
          }
        }
      } catch (error) {
        console.error('Error auto-syncing lead from review status:', error);
      }
    }
  };

  // CSV Parsing
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
            const imagesList: string[] = [];
            const primaryImg = getValue(['PHOTO URL', 'IMAGE URL', 'PRIMARY PHOTO', 'IMAGE', 'THUMBNAIL', 'PHOTO']);
            if (primaryImg) {
              primaryImg.split(/[,;\n]/).forEach(u => {
                const trimmed = u.trim();
                if (trimmed.startsWith('http') && !imagesList.includes(trimmed)) imagesList.push(trimmed);
              });
            }

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

            return {
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
            };
          })
          .filter((item) => item !== null) as Listing[];

        if (parsedData.length > 0) {
          if (type === 'active') setActiveListings(parsedData);
          else setSoldListings(parsedData);
        }
      }
    });
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header / Context Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">Deal Evaluator</h2>
          </div>
          <p className="text-xs sm:text-sm text-neutral-500">
            Review active listings from your selected market dataset with photo swiper, maps, and instant lead push.
          </p>
        </div>

        {/* Dataset Selector / Switcher */}
        {savedAnalyses.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider hidden sm:inline">Market Data:</span>
            <select
              value={selectedAnalysisId || ''}
              onChange={(e) => {
                const selected = savedAnalyses.find(a => a.id === e.target.value);
                if (selected) handleSelectAnalysis(selected);
              }}
              className="bg-neutral-50 border border-neutral-200 text-xs font-bold text-neutral-800 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-sm w-full sm:w-auto"
            >
              {savedAnalyses.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.activeListings?.length || 0} deals)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* No Data State -> Upload CSV or Select Dataset */}
      {activeListings.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm text-center space-y-6">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-100">
              <Upload className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-neutral-900">Upload Market CSV to Start Evaluating</h3>
            <p className="text-xs text-neutral-500">
              Upload a Redfin Active listings CSV for quick NO / MAYBE / YES deal evaluation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto text-left">
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/40 rounded-2xl cursor-pointer transition-all text-center">
              <FileText className="w-8 h-8 text-blue-600 mb-2" />
              <span className="text-xs font-bold text-neutral-900">Upload Active CSV</span>
              <span className="text-[10px] text-neutral-400 mt-0.5">Required for evaluation queue</span>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files?.[0] && parseCSV(e.target.files[0], 'active')}
                className="hidden"
              />
            </label>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-200 hover:border-emerald-400 bg-emerald-50/40 rounded-2xl cursor-pointer transition-all text-center">
              <BarChart2 className="w-8 h-8 text-emerald-600 mb-2" />
              <span className="text-xs font-bold text-neutral-900">Upload Sold CSV (Optional)</span>
              <span className="text-[10px] text-neutral-400 mt-0.5">Enables comp price estimation</span>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files?.[0] && parseCSV(e.target.files[0], 'sold')}
                className="hidden"
              />
            </label>
          </div>
        </div>
      ) : (
        /* Data Loaded Flow: Directly show Evaluator Card */
        <DealSwipeSection
          activeListings={activeListings}
          soldListings={soldListings}
          onUpdateReviewStatus={updateReviewStatus}
          onUpdateRoadFrontage={updateRoadFrontage}
        />
      )}
    </div>
  );
}
