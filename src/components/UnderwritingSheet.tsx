import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, Timestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Property, PropertyStatus, Settings } from '../types';
import { Plus, Search, MoreVertical, Trash2, ExternalLink, ChevronDown, ChevronUp, Save, Settings as SettingsIcon, X, Sparkles, Loader2, Image as ImageIcon, FileText, Paperclip, Upload } from 'lucide-react';
import { cn } from '../lib/utils';
import { User } from 'firebase/auth';
import { analyzeListing } from '../services/aiService';

interface UnderwritingSheetProps {
  properties: Property[];
  settings: Settings;
  user: User;
  initialPropertyId?: string | null;
}

export default function UnderwritingSheet({ properties, settings, user, initialPropertyId }: UnderwritingSheetProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'All'>('All');
  const [isAdding, setIsAdding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(initialPropertyId || null);

  useEffect(() => {
    if (initialPropertyId) {
      setExpandedId(initialPropertyId);
    }
  }, [initialPropertyId]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [newProperty, setNewProperty] = useState<Partial<Property>>({
    status: 'Lead',
    lotSize: 0,
    askingPrice: 0,
    marketValue: 0,
    arv: 0,
    listingLink: '',
    address: '',
    apn: '',
    targetOfferPrice: 0,
  });

  const filteredProperties = useMemo(() => {
    return properties.filter(p => {
      const matchesSearch = p.address.toLowerCase().includes(search.toLowerCase()) ||
                           p.apn.toLowerCase().includes(search.toLowerCase()) ||
                           p.county?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [properties, search, statusFilter]);

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Default target offer to 50% of ARV if ARV is present, otherwise use settings percentage
    let targetOfferPrice = newProperty.targetOfferPrice;
    if (!targetOfferPrice || targetOfferPrice === 0) {
      if (newProperty.arv && newProperty.arv > 0) {
        targetOfferPrice = newProperty.arv * 0.5;
      } else {
        targetOfferPrice = (newProperty.marketValue || 0) * (settings.offerPercentage / 100);
      }
    }

    try {
      await addDoc(collection(db, 'properties'), {
        ...newProperty,
        address: newProperty.address || 'Untitled Property',
        apn: newProperty.apn || 'N/A',
        targetOfferPrice,
        uid: user.uid,
        createdAt: Timestamp.now(),
      });
      setIsAdding(false);
      setNewProperty({ status: 'Lead', lotSize: 0, askingPrice: 0, marketValue: 0, arv: 0, listingLink: '', address: '', apn: '', targetOfferPrice: 0 });
    } catch (error) {
      console.error('Error adding property:', error);
    }
  };

  const handleFileUpload = async (propertyId: string, file: File, type: 'screenshot' | 'file') => {
    if (!file) return;
    setIsUploading(true);
    try {
      const storageRef = ref(storage, `properties/${propertyId}/${type}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);

      if (type === 'screenshot') {
        await updateDoc(doc(db, 'properties', propertyId), { screenshotUrl: url });
      } else {
        const property = properties.find(p => p.id === propertyId);
        const currentFiles = property?.files || [];
        await updateDoc(doc(db, 'properties', propertyId), {
          files: [...currentFiles, { name: file.name, url }]
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateProperty = async (id: string, updates: Partial<Property>) => {
    try {
      const property = properties.find(p => p.id === id);
      if (!property) return;

      const newMarketValue = updates.marketValue !== undefined ? updates.marketValue : property.marketValue;
      const targetOfferPrice = (newMarketValue || 0) * (settings.offerPercentage / 100);

      await updateDoc(doc(db, 'properties', id), {
        ...updates,
        targetOfferPrice,
      });
    } catch (error) {
      console.error('Error updating property:', error);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (deleteConfirmationId !== id) {
      setDeleteConfirmationId(id);
      // Reset confirmation after 3 seconds
      setTimeout(() => setDeleteConfirmationId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'properties', id));
      setDeleteConfirmationId(null);
    } catch (error) {
      console.error('Error deleting property:', error);
    }
  };

  const handleAnalyzeListing = async () => {
    if (!newProperty.listingLink) return;
    
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeListing(newProperty.listingLink);
      setNewProperty(prev => {
        const updated = {
          ...prev,
          address: analysis.address || prev.address,
          apn: analysis.apn || prev.apn,
          askingPrice: analysis.askingPrice || prev.askingPrice,
          lotSize: analysis.lotSize || prev.lotSize,
          agentName: analysis.agentName || prev.agentName,
          agentPhone: analysis.agentPhone || prev.agentPhone,
          marketValue: analysis.marketValue || prev.marketValue,
          arv: analysis.arv || prev.arv,
        };
        
        // Auto-calculate target offer if ARV is found
        if (analysis.arv && (!prev.targetOfferPrice || prev.targetOfferPrice === 0)) {
          updated.targetOfferPrice = analysis.arv * 0.5;
        }
        
        return updated;
      });
    } catch (error) {
      console.error('Error analyzing listing:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateSettings = async (percentage: number) => {
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        offerPercentage: percentage,
        uid: user.uid,
      });
      setIsSettingsOpen(false);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const statusColors: Record<PropertyStatus, string> = {
    Lead: 'bg-blue-100 text-blue-700',
    Underwriting: 'bg-indigo-100 text-indigo-700',
    'Offer Sent': 'bg-amber-100 text-amber-700',
    'Follow-Up': 'bg-cyan-100 text-cyan-700',
    Accepted: 'bg-emerald-100 text-emerald-700',
    Rejected: 'bg-rose-100 text-rose-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Underwriting Sheet</h2>
          <p className="text-neutral-500">Analyze deals and calculate target offer prices.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            New Deal
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-neutral-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by address, APN, or county..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {['All', 'Lead', 'Underwriting', 'Offer Sent', 'Follow-Up', 'Accepted', 'Rejected'].map((status) => (
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
        <div className="text-sm text-neutral-500 whitespace-nowrap">
          Showing {filteredProperties.length} deals
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1600px]">
            <thead>
              <tr className="bg-neutral-50 border-bottom border-neutral-200">
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider sticky left-0 bg-neutral-50 z-10">Property</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">APN</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Listed Price</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Market Value</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">ARV</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Target Offer</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Gross Profit</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Listed/Acre</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Market/Acre</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">ARV/Acre</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Offer/Acre</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Profit/Acre</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredProperties.map((property) => {
                const lotSize = property.lotSize || 1;
                const grossProfit = (property.arv || 0) - (property.targetOfferPrice || 0);
                const listedPerAcre = (property.askingPrice || 0) / lotSize;
                const marketPerAcre = (property.marketValue || 0) / lotSize;
                const arvPerAcre = (property.arv || 0) / lotSize;
                const offerPerAcre = (property.targetOfferPrice || 0) / lotSize;
                const profitPerAcre = grossProfit / lotSize;

                return (
                  <React.Fragment key={property.id}>
                    <tr className={cn(
                      "hover:bg-neutral-50 transition-colors group",
                      expandedId === property.id && "bg-neutral-50"
                    )}>
                      <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-neutral-50 z-10 border-r border-neutral-100">
                        <div className="flex flex-col gap-1">
                          {property.listingLink ? (
                            <a 
                              href={property.listingLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-4 h-4" />
                              View Listing
                            </a>
                          ) : (
                            <span className="text-sm text-neutral-400 italic">No Link</span>
                          )}
                          <span className="text-[10px] text-neutral-500 truncate max-w-[150px]">{property.address}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 font-mono">{property.apn}</td>
                      <td className="px-6 py-4 text-sm text-neutral-900 font-medium">${property.askingPrice?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-neutral-900 font-medium">${property.marketValue?.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-neutral-900 font-medium">${property.arv?.toLocaleString() || '0'}</td>
                      <td className="px-6 py-4">
                        <input 
                          type="number"
                          value={property.targetOfferPrice || 0}
                          onChange={(e) => handleUpdateProperty(property.id, { targetOfferPrice: Number(e.target.value) })}
                          className="w-24 text-sm font-bold text-blue-600 bg-transparent border-none p-0 focus:ring-0"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-green-600 font-bold">${grossProfit.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-neutral-500">${listedPerAcre.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-sm text-neutral-500">${marketPerAcre.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-sm text-neutral-500">${arvPerAcre.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4">
                        <input 
                          type="number"
                          value={Math.round(offerPerAcre)}
                          onChange={(e) => handleUpdateProperty(property.id, { targetOfferPrice: Number(e.target.value) * lotSize })}
                          className="w-20 text-sm text-neutral-500 bg-transparent border-none p-0 focus:ring-0"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-500">${profitPerAcre.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4">
                        <select
                          value={property.status}
                          onChange={(e) => handleUpdateProperty(property.id, { status: e.target.value as PropertyStatus })}
                          className={cn(
                            "text-xs font-bold px-2 py-1 rounded-full border-none focus:ring-0 cursor-pointer",
                            statusColors[property.status]
                          )}
                        >
                          {["Lead", "Underwriting", "Offer Sent", "Follow-Up", "Accepted", "Rejected"].map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setExpandedId(expandedId === property.id ? null : property.id)}
                            className="p-1 text-neutral-400 hover:text-neutral-900 transition-colors"
                          >
                            {expandedId === property.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDeleteProperty(property.id)}
                            className={cn(
                              "p-1 transition-colors relative",
                              deleteConfirmationId === property.id 
                                ? "text-red-600 bg-red-50 rounded" 
                                : "text-neutral-400 hover:text-red-600"
                            )}
                            title={deleteConfirmationId === property.id ? "Click again to confirm" : "Delete property"}
                          >
                            <Trash2 className="w-4 h-4" />
                            {deleteConfirmationId === property.id && (
                              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap animate-bounce">
                                Confirm?
                              </span>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === property.id && (
                      <tr className="bg-neutral-50/50">
                        <td colSpan={14} className="px-6 py-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Property Details</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="col-span-2">
                                <label className="block text-xs text-neutral-500 mb-1">Listing Link</label>
                                <input 
                                  type="url" 
                                  value={property.listingLink || ''} 
                                  onChange={(e) => handleUpdateProperty(property.id, { listingLink: e.target.value })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                  placeholder="https://..."
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Zoning</label>
                                <input 
                                  type="text" 
                                  value={property.zoning || ''} 
                                  onChange={(e) => handleUpdateProperty(property.id, { zoning: e.target.value })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Lot Size (Acres)</label>
                                <input 
                                  type="number" 
                                  value={property.lotSize || 0} 
                                  onChange={(e) => handleUpdateProperty(property.id, { lotSize: Number(e.target.value) })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Agent Name</label>
                                <input 
                                  type="text" 
                                  value={property.agentName || ''} 
                                  onChange={(e) => handleUpdateProperty(property.id, { agentName: e.target.value })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Agent Phone</label>
                                <input 
                                  type="text" 
                                  value={property.agentPhone || ''} 
                                  onChange={(e) => handleUpdateProperty(property.id, { agentPhone: e.target.value })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Financials</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Asking Price ($)</label>
                                <input 
                                  type="number" 
                                  value={property.askingPrice || 0} 
                                  onChange={(e) => handleUpdateProperty(property.id, { askingPrice: Number(e.target.value) })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">Market Value ($)</label>
                                <input 
                                  type="number" 
                                  value={property.marketValue || 0} 
                                  onChange={(e) => handleUpdateProperty(property.id, { marketValue: Number(e.target.value) })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-neutral-500 mb-1">ARV ($)</label>
                                <input 
                                  type="number" 
                                  value={property.arv || 0} 
                                  onChange={(e) => handleUpdateProperty(property.id, { arv: Number(e.target.value) })}
                                  className="w-full text-sm bg-white border border-neutral-200 rounded p-2"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Notes & Files</h4>
                            <textarea 
                              value={property.notes || ''} 
                              onChange={(e) => handleUpdateProperty(property.id, { notes: e.target.value })}
                              rows={3}
                              className="w-full text-sm bg-white border border-neutral-200 rounded p-2 resize-none"
                              placeholder="Add deal notes here..."
                            />
                            
                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">Screenshot</label>
                              {property.screenshotUrl ? (
                                <div className="relative group">
                                  <img 
                                    src={property.screenshotUrl} 
                                    alt="Property Screenshot" 
                                    className="w-full h-32 object-cover rounded-lg border border-neutral-200"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                    <label className="cursor-pointer p-2 bg-white rounded-full text-neutral-900 hover:bg-neutral-100 transition-colors">
                                      <Upload className="w-4 h-4" />
                                      <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*"
                                        onChange={(e) => e.target.files?.[0] && handleFileUpload(property.id, e.target.files[0], 'screenshot')}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-neutral-200 rounded-lg cursor-pointer hover:bg-neutral-50 transition-colors">
                                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <ImageIcon className="w-8 h-8 text-neutral-400 mb-2" />
                                    <p className="text-xs text-neutral-500">Upload Screenshot</p>
                                  </div>
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(property.id, e.target.files[0], 'screenshot')}
                                  />
                                </label>
                              )}
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest">Other Files</label>
                              <div className="space-y-2">
                                {property.files?.map((file, idx) => (
                                  <a 
                                    key={idx} 
                                    href={file.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 bg-white border border-neutral-200 rounded text-xs text-neutral-600 hover:bg-neutral-50 transition-colors"
                                  >
                                    <FileText className="w-3 h-3" />
                                    <span className="flex-1 truncate">{file.name}</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ))}
                                <label className="flex items-center justify-center gap-2 p-2 border border-dashed border-neutral-200 rounded text-xs text-neutral-500 cursor-pointer hover:bg-neutral-50 transition-colors">
                                  <Paperclip className="w-3 h-3" />
                                  Add File
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(property.id, e.target.files[0], 'file')}
                                  />
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Add Property Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-neutral-900">Add New Property</h3>
              <button onClick={() => setIsAdding(false)} className="text-neutral-400 hover:text-neutral-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddProperty} className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Listing Link</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newProperty.listingLink || ''}
                      onChange={(e) => setNewProperty({ ...newProperty, listingLink: e.target.value })}
                      className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                      placeholder="https://zillow.com/..."
                    />
                    <button
                      type="button"
                      onClick={handleAnalyzeListing}
                      disabled={isAnalyzing || !newProperty.listingLink}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Scan
                    </button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Property Address</label>
                  <input
                    type="text"
                    value={newProperty.address || ''}
                    onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                    placeholder="123 Land St, City, ST (Optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">APN</label>
                  <input
                    type="text"
                    value={newProperty.apn || ''}
                    onChange={(e) => setNewProperty({ ...newProperty, apn: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                    placeholder="000-000-000 (Optional)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Lot Size (Acres)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newProperty.lotSize || 0}
                    onChange={(e) => setNewProperty({ ...newProperty, lotSize: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Listed Price ($)</label>
                  <input
                    type="number"
                    value={newProperty.askingPrice || 0}
                    onChange={(e) => setNewProperty({ ...newProperty, askingPrice: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Market Value ($)</label>
                  <input
                    type="number"
                    value={newProperty.marketValue || 0}
                    onChange={(e) => setNewProperty({ ...newProperty, marketValue: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">ARV ($)</label>
                  <input
                    type="number"
                    value={newProperty.arv || 0}
                    onChange={(e) => {
                      const arv = Number(e.target.value);
                      setNewProperty({ ...newProperty, arv, targetOfferPrice: arv * 0.5 });
                    }}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Target Offer ($)</label>
                  <input
                    type="number"
                    value={newProperty.targetOfferPrice || 0}
                    onChange={(e) => setNewProperty({ ...newProperty, targetOfferPrice: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>

                <div className="col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Listed/Acre</label>
                    <div className="text-sm font-medium text-neutral-600">
                      ${((newProperty.askingPrice || 0) / (newProperty.lotSize || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Market/Acre</label>
                    <div className="text-sm font-medium text-neutral-600">
                      ${((newProperty.marketValue || 0) / (newProperty.lotSize || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">ARV/Acre</label>
                    <div className="text-sm font-medium text-neutral-600">
                      ${((newProperty.arv || 0) / (newProperty.lotSize || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">Offer/Acre</label>
                    <input
                      type="number"
                      value={Math.round((newProperty.targetOfferPrice || 0) / (newProperty.lotSize || 1))}
                      onChange={(e) => setNewProperty({ ...newProperty, targetOfferPrice: Number(e.target.value) * (newProperty.lotSize || 1) })}
                      className="w-full text-sm font-bold text-blue-600 bg-transparent border-none p-0 focus:ring-0"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Agent Name</label>
                  <input
                    type="text"
                    value={newProperty.agentName || ''}
                    onChange={(e) => setNewProperty({ ...newProperty, agentName: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Agent Phone</label>
                  <input
                    type="text"
                    value={newProperty.agentPhone || ''}
                    onChange={(e) => setNewProperty({ ...newProperty, agentPhone: e.target.value })}
                    className="w-full px-4 py-2 bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 shrink-0">
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
                  Add Property
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">Underwriting Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-400 hover:text-neutral-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Target Offer Percentage (%)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    value={settings.offerPercentage}
                    onChange={(e) => handleUpdateSettings(Number(e.target.value))}
                    className="flex-1 h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                  <span className="text-lg font-bold text-neutral-900 w-12">{settings.offerPercentage}%</span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  This percentage will be used to auto-calculate the Target Offer Price based on the Estimated Market Value.
                </p>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
