import React, { useState, useMemo } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Property, Offer, OfferStatus } from '../types';
import { Plus, Search, Trash2, Calendar, User as UserIcon, Phone, Send, Clock, X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { User } from 'firebase/auth';
import { format, isAfter, startOfDay } from 'date-fns';

interface OffersTrackingProps {
  offers: Offer[];
  properties: Property[];
  user: User;
}

export default function OffersTracking({ offers, properties, user }: OffersTrackingProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OfferStatus | 'All'>('All');
  const [monthFilter, setMonthFilter] = useState<number | 'All'>('All');
  const [yearFilter, setYearFilter] = useState<number | 'All'>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newOffer, setNewOffer] = useState<Partial<Offer>>({
    status: 'Sent',
    date: Timestamp.now(),
  });

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    offers.forEach(o => years.add(o.date.toDate().getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [offers]);

  const filteredOffers = useMemo(() => {
    return offers.filter(o => {
      const date = o.date.toDate();
      const matchesSearch = o.propertyAddress?.toLowerCase().includes(search.toLowerCase()) ||
                           o.agentName?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
      const matchesMonth = monthFilter === 'All' || date.getMonth() === monthFilter;
      const matchesYear = yearFilter === 'All' || date.getFullYear() === yearFilter;
      
      return matchesSearch && matchesStatus && matchesMonth && matchesYear;
    });
  }, [offers, search, statusFilter, monthFilter, yearFilter]);

  const handleAddOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOffer.propertyId || !newOffer.amount) return;

    const property = properties.find(p => p.id === newOffer.propertyId);
    
    try {
      await addDoc(collection(db, 'offers'), {
        ...newOffer,
        propertyAddress: property?.address || 'Unknown Address',
        apn: property?.apn || '',
        lotSize: property?.lotSize || 0,
        arv: property?.arv || 0,
        marketValue: property?.marketValue || 0,
        zoning: property?.zoning || '',
        listingLink: property?.listingLink || '',
        agentName: newOffer.agentName || property?.agentName || '',
        agentContact: newOffer.agentContact || property?.agentPhone || '',
        uid: user.uid,
        createdAt: Timestamp.now(),
      });
      
      // Update property status to 'Offer Sent'
      if (newOffer.propertyId) {
        await updateDoc(doc(db, 'properties', newOffer.propertyId), {
          status: 'Offer Sent'
        });
      }
      
      setIsAdding(false);
      setNewOffer({ status: 'Sent', date: Timestamp.now() });
    } catch (error) {
      console.error('Error adding offer:', error);
    }
  };

  const handleUpdateOffer = async (id: string, updates: Partial<Offer>) => {
    try {
      await updateDoc(doc(db, 'offers', id), updates);
      
      const offer = offers.find(o => o.id === id);
      if (offer?.propertyId) {
        if (updates.status === 'Countered' || updates.followUpDate) {
          await updateDoc(doc(db, 'properties', offer.propertyId), { status: 'Follow-Up' });
        } else if (updates.status === 'Accepted') {
          await updateDoc(doc(db, 'properties', offer.propertyId), { status: 'Accepted' });
        } else if (updates.status === 'Rejected') {
          await updateDoc(doc(db, 'properties', offer.propertyId), { status: 'Rejected' });
        }
      }
    } catch (error) {
      console.error('Error updating offer:', error);
    }
  };

  const handleFollowUpDateChange = (id: string, dateString: string) => {
    if (!dateString) {
      handleUpdateOffer(id, { followUpDate: undefined });
      return;
    }
    // Use the date string directly to create a date object at the start of the day in local time
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    handleUpdateOffer(id, { followUpDate: Timestamp.fromDate(date) });
  };

  const handleDeleteOffer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this offer?')) return;
    try {
      await deleteDoc(doc(db, 'offers', id));
    } catch (error) {
      console.error('Error deleting offer:', error);
    }
  };

  const statusIcons: Record<OfferStatus, any> = {
    Sent: Send,
    Countered: Clock,
    Accepted: CheckCircle2,
    Rejected: XCircle,
  };

  const statusColors: Record<OfferStatus, string> = {
    Sent: 'text-blue-600 bg-blue-50 border-blue-100',
    Countered: 'text-amber-600 bg-amber-50 border-amber-100',
    Accepted: 'text-green-600 bg-green-50 border-green-100',
    Rejected: 'text-red-600 bg-red-50 border-red-100',
  };

  const needsFollowUp = (offer: Offer) => {
    if (!offer.followUpDate || offer.status === 'Accepted' || offer.status === 'Rejected') return false;
    return isAfter(startOfDay(new Date()), startOfDay(offer.followUpDate.toDate()));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Offers Tracking</h2>
          <p className="text-neutral-500">Track all sent offers and manage follow-ups.</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          New Offer
        </button>
      </div>

      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by address or agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {['All', 'Sent', 'Countered', 'Accepted', 'Rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition-all border",
                  statusFilter === status 
                    ? "bg-neutral-900 text-white border-neutral-900" 
                    : "bg-neutral-50 text-neutral-500 border-neutral-200 hover:border-neutral-300"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-neutral-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Month</span>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="All">All Months</option>
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i} value={i}>{format(new Date(2024, i, 1), 'MMMM')}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Year</span>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              className="text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            >
              <option value="All">All Years</option>
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-sm text-neutral-500">
            Showing {filteredOffers.length} offers
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredOffers.map((offer) => {
          const Icon = statusIcons[offer.status];
          const isOverdue = needsFollowUp(offer);
          const lotSize = offer.lotSize || 1;
          const offerPerAcre = offer.amount / lotSize;
          const arvPercent = offer.arv && offer.arv > 0 ? (offer.amount / offer.arv) * 100 : 0;
          const isExpanded = expandedId === offer.id;
          
          return (
            <div 
              key={offer.id} 
              className={cn(
                "bg-white rounded-2xl border transition-all shadow-sm group overflow-hidden",
                isOverdue ? "border-red-200 ring-1 ring-red-50" : "border-neutral-200",
                isExpanded && "ring-2 ring-neutral-900/5"
              )}
            >
              <div 
                className="p-6 cursor-pointer hover:bg-neutral-50/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : offer.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-neutral-900">{offer.propertyAddress}</h3>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border",
                        statusColors[offer.status]
                      )}>
                        <Icon className="w-3.5 h-3.5" />
                        {offer.status}
                      </span>
                      {isOverdue && (
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-600 border border-red-100 animate-pulse">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Follow-up Overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">Offer Amount</p>
                      <p className="text-xl font-bold text-neutral-900">${offer.amount.toLocaleString()}</p>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOffer(offer.id);
                      }}
                      className="p-2 text-neutral-300 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-y border-neutral-50">
                  <div>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Offer/Acre</p>
                    <p className="text-sm font-semibold text-neutral-900">${Math.round(offerPerAcre).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">% of ARV</p>
                    <p className="text-sm font-semibold text-neutral-900">{arvPercent.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Lot Size</p>
                    <p className="text-sm font-semibold text-neutral-900">{offer.lotSize || '0'} Acres</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-neutral-600">
                      <Calendar className="w-4 h-4 text-neutral-400" />
                      <span>{format(offer.date.toDate(), 'MMM d, yyyy')}</span>
                    </div>
                    {offer.agentName && (
                      <div className="flex items-center gap-2 text-sm text-neutral-600">
                        <UserIcon className="w-4 h-4 text-neutral-400" />
                        <span className="truncate max-w-[120px]">{offer.agentName}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Follow-up</span>
                    <input 
                      type="date"
                      value={offer.followUpDate ? format(offer.followUpDate.toDate(), 'yyyy-MM-dd') : ''}
                      onChange={(e) => handleFollowUpDateChange(offer.id, e.target.value)}
                      className="text-xs bg-neutral-50 border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                    />
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-6 pb-6 pt-2 border-t border-neutral-50 bg-neutral-50/30 animate-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Property Snapshot</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">APN</p>
                          <p className="text-sm font-medium text-neutral-900 font-mono">{offer.apn || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Zoning</p>
                          <p className="text-sm font-medium text-neutral-900">{offer.zoning || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Market Value</p>
                          <p className="text-sm font-medium text-neutral-900">${offer.marketValue?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">ARV</p>
                          <p className="text-sm font-medium text-neutral-900">${offer.arv?.toLocaleString() || '0'}</p>
                        </div>
                        {offer.listingLink && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Listing Link</p>
                            <a 
                              href={offer.listingLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            >
                              View Original Listing
                              <AlertCircle className="w-3 h-3 rotate-180" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Offer Management</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Status</label>
                          <select
                            value={offer.status}
                            onChange={(e) => handleUpdateOffer(offer.id, { status: e.target.value as OfferStatus })}
                            className="w-full text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                          >
                            {['Sent', 'Countered', 'Accepted', 'Rejected'].map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Expiration Date</label>
                          <input 
                            type="date"
                            value={offer.expirationDate ? format(offer.expirationDate.toDate(), 'yyyy-MM-dd') : ''}
                            onChange={(e) => {
                              const [y, m, d] = e.target.value.split('-').map(Number);
                              handleUpdateOffer(offer.id, { expirationDate: Timestamp.fromDate(new Date(y, m - 1, d)) });
                            }}
                            className="w-full text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Notes</label>
                          <textarea 
                            value={offer.notes || ''}
                            onChange={(e) => handleUpdateOffer(offer.id, { notes: e.target.value })}
                            rows={3}
                            className="w-full text-sm bg-white border border-neutral-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900/10 resize-none"
                            placeholder="Add offer-specific notes..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Offer Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">Log New Offer</h3>
              <button onClick={() => setIsAdding(false)} className="text-neutral-400 hover:text-neutral-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddOffer} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Select Property</label>
                  <select
                    required
                    value={newOffer.propertyId || ''}
                    onChange={(e) => {
                      const prop = properties.find(p => p.id === e.target.value);
                      setNewOffer({ 
                        ...newOffer, 
                        propertyId: e.target.value,
                        amount: prop?.targetOfferPrice || 0,
                        agentName: prop?.agentName || '',
                        agentContact: prop?.agentPhone || ''
                      });
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  >
                    <option value="">Choose a property from underwriting...</option>
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.address} ({p.apn})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Offer Amount ($)</label>
                  <input
                    required
                    type="number"
                    value={newOffer.amount || 0}
                    onChange={(e) => setNewOffer({ ...newOffer, amount: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Offer Date</label>
                  <input
                    required
                    type="date"
                    value={newOffer.date ? format(newOffer.date.toDate(), 'yyyy-MM-dd') : ''}
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setNewOffer({ ...newOffer, date: Timestamp.fromDate(new Date(y, m - 1, d)) });
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={newOffer.agentName || ''}
                    onChange={(e) => setNewOffer({ ...newOffer, agentName: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Agent Contact</label>
                  <input
                    type="text"
                    value={newOffer.agentContact || ''}
                    onChange={(e) => setNewOffer({ ...newOffer, agentContact: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                    placeholder="Email or Phone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setNewOffer({ ...newOffer, expirationDate: Timestamp.fromDate(new Date(y, m - 1, d)) });
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split('-').map(Number);
                      setNewOffer({ ...newOffer, followUpDate: Timestamp.fromDate(new Date(y, m - 1, d)) });
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors font-medium"
                >
                  Log Offer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
