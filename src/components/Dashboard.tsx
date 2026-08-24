import React, { useMemo, useState } from 'react';
import { Property, Offer, PropertyStatus } from '../types';
import { 
  TrendingUp, CheckCircle2, Clock, FileText, Target, Database, Loader2, 
  Sparkles, FileSpreadsheet, Send, XCircle, ExternalLink, 
  Search, Layers, ArrowUpRight, MapPin
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { startOfMonth, endOfMonth, isWithinInterval, format } from 'date-fns';
import { cn } from '../lib/utils';
import { collection, addDoc, updateDoc, doc, Timestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface DashboardProps {
  properties: Property[];
  offers: Offer[];
  user: any;
  onNavigateToUnderwriting?: (propertyId?: string) => void;
}

export default function Dashboard({ properties, offers, user, onNavigateToUnderwriting }: DashboardProps) {
  const [isSeeding, setIsSeeding] = useState(false);
  const [pipelineSearch, setPipelineSearch] = useState('');

  const handleUpdateStatus = async (propertyId: string, newStatus: PropertyStatus) => {
    try {
      await updateDoc(doc(db, 'properties', propertyId), {
        status: newStatus
      });
    } catch (error) {
      console.error('Error updating property status:', error);
    }
  };

  const seedData = async () => {
    if (!confirm('This will add sample properties and offers to your CRM. Continue?')) return;
    setIsSeeding(true);
    try {
      const sampleProperties = [
        { address: '123 Pinecrest Rd, Marion, FL', apn: '123-456-789', county: 'Marion', state: 'FL', lotSize: 2.5, marketValue: 45000, arv: 65000, listingLink: 'https://www.zillow.com', status: 'Underwriting' as PropertyStatus },
        { address: '456 Oak Hollow, Polk, FL', apn: '456-789-012', county: 'Polk', state: 'FL', lotSize: 5.0, marketValue: 85000, arv: 120000, listingLink: 'https://www.redfin.com', status: 'Offer Sent' as PropertyStatus },
        { address: '789 River Run, Lake, FL', apn: '789-012-345', county: 'Lake', state: 'FL', lotSize: 1.2, marketValue: 32000, arv: 45000, listingLink: 'https://www.realtor.com', status: 'Accepted' as PropertyStatus },
        { address: '101 Desert Sky, Mohave, AZ', apn: '101-234-567', county: 'Mohave', state: 'AZ', lotSize: 10.0, marketValue: 25000, arv: 35000, listingLink: 'https://www.landwatch.com', status: 'Lead' as PropertyStatus },
      ];

      for (const prop of sampleProperties) {
        const targetOfferPrice = prop.marketValue * 0.4;
        const docRef = await addDoc(collection(db, 'properties'), {
          ...prop,
          targetOfferPrice,
          uid: user.uid,
          createdAt: Timestamp.now(),
        });

        if (prop.status === 'Offer Sent' || prop.status === 'Accepted') {
          await addDoc(collection(db, 'offers'), {
            propertyId: docRef.id,
            propertyAddress: prop.address,
            amount: targetOfferPrice,
            date: Timestamp.now(),
            status: prop.status === 'Accepted' ? 'Accepted' : 'Sent',
            uid: user.uid,
            createdAt: Timestamp.now(),
          });
        }
      }
      alert('Sample data added successfully!');
    } catch (error) {
      console.error('Error seeding data:', error);
    } finally {
      setIsSeeding(false);
    }
  };

  const chartData = useMemo(() => {
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return {
        month: format(d, 'MMM'),
        monthIdx: d.getMonth(),
        year: d.getFullYear(),
        count: 0
      };
    }).reverse();

    offers.forEach(o => {
      const date = o.date.toDate();
      const month = format(date, 'MMM');
      const year = date.getFullYear();
      const dataPoint = last6Months.find(d => d.month === month && d.year === year);
      if (dataPoint) dataPoint.count++;
    });

    return last6Months;
  }, [offers]);

  // Sales Pipeline Stages
  const stages: {
    id: PropertyStatus;
    label: string;
    description: string;
    icon: any;
    color: string;
    bgColor: string;
    borderColor: string;
    badgeBg: string;
  }[] = [
    { 
      id: 'Lead', 
      label: 'Leads', 
      description: 'Auto-pushed & imported deals',
      icon: Sparkles, 
      color: 'text-blue-600', 
      bgColor: 'bg-blue-50/50', 
      borderColor: 'border-blue-200',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-300'
    },
    { 
      id: 'Underwriting', 
      label: 'Underwritten', 
      description: 'Comps & ARV evaluated',
      icon: FileSpreadsheet, 
      color: 'text-indigo-600', 
      bgColor: 'bg-indigo-50/50', 
      borderColor: 'border-indigo-200',
      badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-300'
    },
    { 
      id: 'Offer Sent', 
      label: 'Offered', 
      description: 'Offers submitted to seller',
      icon: Send, 
      color: 'text-amber-600', 
      bgColor: 'bg-amber-50/50', 
      borderColor: 'border-amber-200',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-300'
    },
    { 
      id: 'Follow-Up', 
      label: 'Follow-Up', 
      description: 'Countered or scheduled follow-ups',
      icon: Clock, 
      color: 'text-cyan-600', 
      bgColor: 'bg-cyan-50/50', 
      borderColor: 'border-cyan-200',
      badgeBg: 'bg-cyan-100 text-cyan-800 border-cyan-300'
    },
    { 
      id: 'Accepted', 
      label: 'Accepted', 
      description: 'Under contract / closed',
      icon: CheckCircle2, 
      color: 'text-emerald-600', 
      bgColor: 'bg-emerald-50/50', 
      borderColor: 'border-emerald-200',
      badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300'
    },
    { 
      id: 'Rejected', 
      label: 'Rejected', 
      description: 'Declined or passed',
      icon: XCircle, 
      color: 'text-rose-600', 
      bgColor: 'bg-rose-50/50', 
      borderColor: 'border-rose-200',
      badgeBg: 'bg-rose-100 text-rose-800 border-rose-300'
    },
  ];

  const filteredProperties = useMemo(() => {
    if (!pipelineSearch.trim()) return properties;
    const term = pipelineSearch.toLowerCase();
    return properties.filter(p => 
      p.address.toLowerCase().includes(term) ||
      p.county?.toLowerCase().includes(term) ||
      p.apn?.toLowerCase().includes(term) ||
      p.notes?.toLowerCase().includes(term)
    );
  }, [properties, pipelineSearch]);

  const pipelineMap = useMemo(() => {
    const map: Record<PropertyStatus, Property[]> = {
      'Lead': [],
      'Underwriting': [],
      'Offer Sent': [],
      'Follow-Up': [],
      'Accepted': [],
      'Rejected': [],
    };

    filteredProperties.forEach(p => {
      let statusKey: PropertyStatus = p.status || 'Lead';
      if (!p.status) {
        const propertyOffers = offers.filter(o => o.propertyId === p.id);
        const hasFollowUpOffer = propertyOffers.some(o => o.status === 'Countered' || o.followUpDate);
        if (hasFollowUpOffer) {
          statusKey = 'Follow-Up';
        }
      }

      if (map[statusKey]) {
        map[statusKey].push(p);
      } else {
        map['Lead'].push(p);
      }
    });

    return map;
  }, [filteredProperties, offers]);

  const totalActivePipelineValue = useMemo(() => {
    const active: PropertyStatus[] = ['Lead', 'Underwriting', 'Offer Sent', 'Follow-Up'];
    return properties
      .filter(p => active.includes(p.status || 'Lead'))
      .reduce((sum, p) => sum + (p.targetOfferPrice || p.askingPrice || p.marketValue || 0), 0);
  }, [properties]);

  return (
    <div className="space-y-8 pb-12 w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Dashboard & Sales Pipeline</h2>
          <p className="text-sm text-neutral-500">Monitor active land leads, underwriting pipeline, and offer activity.</p>
        </div>
        {properties.length === 0 && (
          <button
            onClick={seedData}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-600 rounded-xl hover:bg-neutral-200 transition-colors font-medium text-sm"
          >
            {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Seed Sample Data
          </button>
        )}
      </div>

      {/* Sales Pipeline Section at Top */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm overflow-hidden p-4 sm:p-6 space-y-6 w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-neutral-800" />
              <h3 className="text-lg font-bold text-neutral-900">Sales Pipeline</h3>
              <span className="text-xs font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                {properties.length} Total Leads / Deals
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Listings marked 'Yes' or 'Maybe' in Market Chart automatically appear in <strong>Leads</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search pipeline leads..."
                value={pipelineSearch}
                onChange={(e) => setPipelineSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>

            <div className="flex items-center gap-2 bg-neutral-50 px-3 py-1.5 rounded-lg border border-neutral-200 text-xs shrink-0">
              <span className="text-neutral-500 font-medium">Pipeline Value:</span>
              <span className="font-bold text-neutral-900">${totalActivePipelineValue.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Pipeline Stage Bar Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-neutral-50/80 p-3 rounded-xl border border-neutral-200/60">
          {stages.map((stg) => {
            const count = pipelineMap[stg.id]?.length || 0;
            const stageVal = (pipelineMap[stg.id] || []).reduce((sum, p) => sum + (p.targetOfferPrice || p.askingPrice || 0), 0);
            return (
              <div key={stg.id} className="bg-white p-2.5 rounded-lg border border-neutral-200/70 space-y-1 overflow-hidden">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-neutral-600 truncate">{stg.label}</span>
                  <span className={cn("text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border shrink-0", stg.badgeBg)}>
                    {count}
                  </span>
                </div>
                <p className="text-xs font-extrabold text-neutral-900 truncate">
                  ${stageVal.toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Pipeline Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x min-w-full">
          {stages.map((stg) => {
            const deals = pipelineMap[stg.id] || [];
            const stageTotal = deals.reduce((sum, p) => sum + (p.targetOfferPrice || p.askingPrice || 0), 0);

            return (
              <div 
                key={stg.id} 
                className={cn(
                  "flex flex-col rounded-xl border-2 bg-white shadow-xs p-3 space-y-3 min-w-[260px] max-w-[320px] flex-1 shrink-0 snap-start",
                  stg.borderColor
                )}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100 gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <stg.icon className={cn("w-4 h-4 shrink-0", stg.color)} />
                    <span className="text-xs font-bold text-neutral-900 truncate">{stg.label}</span>
                  </div>
                  <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0", stg.badgeBg)}>
                    {deals.length}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-neutral-500 font-medium px-0.5 bg-neutral-50 p-1.5 rounded-lg border border-neutral-100">
                  <span>Stage Value:</span>
                  <span className="font-bold text-neutral-900 truncate">${stageTotal.toLocaleString()}</span>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5 flex-1 min-h-[320px] max-h-[520px] overflow-y-auto pr-0.5">
                  {deals.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center p-3 border border-dashed border-neutral-200 rounded-lg text-neutral-400 bg-neutral-50/50">
                      <stg.icon className="w-5 h-5 opacity-40 mb-1" />
                      <span className="text-[11px] font-medium">No deals in {stg.label}</span>
                    </div>
                  ) : (
                    deals.map((property) => {
                      const pricePerAcre = property.askingPrice && property.lotSize && property.lotSize > 0 
                        ? Math.round(property.askingPrice / property.lotSize) 
                        : null;

                      return (
                        <div 
                          key={property.id} 
                          className="bg-neutral-50/80 p-3 rounded-lg border border-neutral-200 shadow-2xs hover:shadow-sm hover:border-neutral-300 transition-all space-y-2 group relative w-full"
                        >
                          {/* Title & Link */}
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-neutral-900 truncate group-hover:text-blue-600 transition-colors" title={property.address}>
                                {property.address}
                              </h4>
                              <div className="flex items-center gap-1 text-[10px] text-neutral-500 mt-0.5">
                                <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                                <span className="truncate">{property.county ? `${property.county}, ` : ''}{property.state || ''}</span>
                                {property.lotSize ? (
                                  <span className="shrink-0 font-bold text-neutral-700 bg-white px-1.5 py-0.2 rounded border border-neutral-200/80">
                                    {property.lotSize.toFixed(2)} ac
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {property.listingLink && (
                              <a 
                                href={property.listingLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-1 bg-white border border-neutral-200 rounded text-neutral-400 hover:text-blue-600 hover:border-blue-300 transition-colors shrink-0"
                                title="View Original Listing"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          {/* Pricing Metrics */}
                          <div className="bg-white p-2 rounded border border-neutral-200/80 text-[10px] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-neutral-500">Asking:</span>
                              <span className="font-bold text-neutral-800">${property.askingPrice ? property.askingPrice.toLocaleString() : 'N/A'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-neutral-500">Target Offer:</span>
                              <span className="font-bold text-blue-600">${property.targetOfferPrice ? property.targetOfferPrice.toLocaleString() : 'N/A'}</span>
                            </div>
                            {pricePerAcre && (
                              <div className="flex items-center justify-between pt-1 border-t border-neutral-100 text-[9.5px]">
                                <span className="text-neutral-400">Price/Acre:</span>
                                <span className="font-semibold text-neutral-600">${pricePerAcre.toLocaleString()}/ac</span>
                              </div>
                            )}
                          </div>

                          {/* Quick Controls */}
                          <div className="pt-1.5 border-t border-neutral-200/60 flex items-center justify-between gap-1.5">
                            {/* Stage selector */}
                            <select
                              value={property.status || 'Lead'}
                              onChange={(e) => handleUpdateStatus(property.id, e.target.value as PropertyStatus)}
                              className="text-[10px] font-bold py-1 px-1.5 bg-white text-neutral-700 rounded border border-neutral-200 cursor-pointer focus:outline-none hover:border-neutral-300 transition-colors max-w-[110px] truncate"
                            >
                              <option value="Lead">Lead</option>
                              <option value="Underwriting">Underwritten</option>
                              <option value="Offer Sent">Offered</option>
                              <option value="Follow-Up">Follow-Up</option>
                              <option value="Accepted">Accepted</option>
                              <option value="Rejected">Rejected</option>
                            </select>

                            {/* Action Button: Open in Underwriting Sheet */}
                            {onNavigateToUnderwriting && (
                              <button
                                onClick={() => onNavigateToUnderwriting(property.id)}
                                className="flex items-center gap-0.5 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors shrink-0"
                                title="Open in Underwriting Sheet"
                              >
                                Sheet
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Offers Activity Bar Chart */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-neutral-200/80 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">Offers Activity</h3>
            <p className="text-sm text-neutral-500">Number of offers sent over the last 6 months.</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-900">
            <Target className="w-4 h-4 text-blue-600" />
            Monthly Goal: 40
          </div>
        </div>
        
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart id="dashboard-offers-bar-chart" data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#737373', fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={30}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#737373', fontSize: 12 }}
                interval="preserveStartEnd"
                minTickGap={30}
              />
              <Tooltip 
                cursor={{ fill: '#f5f5f5' }}
                contentStyle={{ 
                  borderRadius: '12px', 
                  border: '1px solid #e5e5e5',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.count >= 40 ? '#2563eb' : '#94a3b8'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
