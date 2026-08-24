import { Timestamp } from 'firebase/firestore';

export type PropertyStatus = 'Lead' | 'Underwriting' | 'Offer Sent' | 'Accepted' | 'Rejected' | 'Follow-Up';
export type OfferStatus = 'Sent' | 'Countered' | 'Accepted' | 'Rejected';

export interface Property {
  id: string;
  address: string;
  apn: string;
  county?: string;
  state?: string;
  lotSize?: number;
  zoning?: string;
  askingPrice?: number;
  marketValue?: number;
  arv?: number;
  targetOfferPrice?: number;
  listingLink?: string;
  agentName?: string;
  agentPhone?: string;
  notes?: string;
  screenshotUrl?: string;
  files?: { name: string; url: string }[];
  status: PropertyStatus;
  createdAt: Timestamp;
  uid: string;
}

export interface Offer {
  id: string;
  propertyId: string;
  propertyAddress?: string;
  amount: number;
  date: Timestamp;
  expirationDate?: Timestamp;
  agentName?: string;
  agentContact?: string;
  status: OfferStatus;
  followUpDate?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  uid: string;
  lotSize?: number;
  arv?: number;
  marketValue?: number;
  apn?: string;
  zoning?: string;
  listingLink?: string;
}

export interface Listing {
  id: string;
  address: string;
  city: string;
  state: string;
  county?: string;
  price: number;
  lotSizeSqft: number;
  acres: number;
  pricePerAcre: number;
  url: string;
  status: string;
  type: 'active' | 'sold';
  roadFrontage?: 'Yes' | 'Maybe' | 'No';
  reviewStatus?: 'Yes' | 'Maybe' | 'No';
  lat?: number;
  lng?: number;
  imageUrl?: string;
  images?: string[];
}

export interface MarketAnalysis {
  id: string;
  name: string;
  activeListings: Listing[];
  soldListings: Listing[];
  activeAcreRange: [number, number];
  soldAcreRange: [number, number];
  activeAcreLimits: [number, number];
  soldAcreLimits: [number, number];
  activePricePerAcreRange: [number, number];
  soldPricePerAcreRange: [number, number];
  activePricePerAcreLimits: [number, number];
  soldPricePerAcreLimits: [number, number];
  activeTotalPriceRange?: [number, number];
  soldTotalPriceRange?: [number, number];
  activeTotalPriceLimits?: [number, number];
  soldTotalPriceLimits?: [number, number];
  createdAt: Timestamp;
  uid: string;
}

export interface Settings {
  offerPercentage: number;
  uid: string;
}
