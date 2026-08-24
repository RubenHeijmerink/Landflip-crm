import { Listing } from '../types';

export function removeOutliers(listings: Listing[]) {
  if (listings.length < 4) return listings;
  
  const values = [...listings].map(l => l.pricePerAcre).sort((a, b) => a - b);
  const q1 = values[Math.floor(values.length * 0.25)];
  const q3 = values[Math.floor(values.length * 0.75)];
  const iqr = q3 - q1;
  
  // Use a slightly more generous multiplier for "extreme" outliers
  const min = q1 - 3 * iqr;
  const max = q3 + 3 * iqr;
  
  return listings.filter(l => l.pricePerAcre >= min && l.pricePerAcre <= max);
}

export function getKnnEstimate(lat: number, lng: number, soldComps: Listing[]) {
  if (soldComps.length < 3) return null;
  const k = 3;
  const neighbors = soldComps
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

  return weightedPrice / totalWeight;
}

export const getAcreRange = (acres: number): [number, number] => {
  if (acres <= 2) return [1, 2];
  if (acres <= 3) return [2, 3];
  if (acres <= 5) return [3, 5];
  if (acres <= 10) return [5, 10];
  if (acres <= 20) return [10, 20];
  if (acres <= 50) return [20, 50];
  return [50, 1000000];
};

export function cleanObjectForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return null as unknown as T;
  if (Array.isArray(data)) {
    return data.map(item => cleanObjectForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        result[key] = cleanObjectForFirestore(value);
      }
    }
    return result as T;
  }
  return data;
}

export function sanitizeListing(listing: Listing): Listing {
  const clean: Record<string, any> = {
    id: String(listing.id || `${listing.type || 'prop'}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
    address: String(listing.address || ''),
    city: String(listing.city || ''),
    state: String(listing.state || ''),
    price: typeof listing.price === 'number' && isFinite(listing.price) ? listing.price : 0,
    lotSizeSqft: typeof listing.lotSizeSqft === 'number' && isFinite(listing.lotSizeSqft) ? listing.lotSizeSqft : 0,
    acres: typeof listing.acres === 'number' && isFinite(listing.acres) ? listing.acres : 0,
    pricePerAcre: typeof listing.pricePerAcre === 'number' && isFinite(listing.pricePerAcre) ? listing.pricePerAcre : 0,
    url: String(listing.url || ''),
    status: String(listing.status || ''),
    type: listing.type === 'sold' ? 'sold' : 'active',
  };

  if (listing.county && typeof listing.county === 'string' && listing.county.trim()) {
    clean.county = listing.county.trim();
  }
  if (typeof listing.lat === 'number' && isFinite(listing.lat) && listing.lat !== 0) {
    clean.lat = listing.lat;
  }
  if (typeof listing.lng === 'number' && isFinite(listing.lng) && listing.lng !== 0) {
    clean.lng = listing.lng;
  }
  if (listing.roadFrontage) {
    clean.roadFrontage = listing.roadFrontage;
  }
  if (listing.reviewStatus) {
    clean.reviewStatus = listing.reviewStatus;
  }
  if (listing.imageUrl && typeof listing.imageUrl === 'string' && listing.imageUrl.trim()) {
    clean.imageUrl = listing.imageUrl.trim();
  }
  if (Array.isArray(listing.images) && listing.images.length > 0) {
    const validImgs = listing.images.filter(img => typeof img === 'string' && img.trim().startsWith('http'));
    if (validImgs.length > 0) {
      clean.images = validImgs;
    }
  }

  return clean as Listing;
}

