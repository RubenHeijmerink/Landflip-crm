import React, { useState, useMemo } from 'react';
import Calendar from 'react-calendar';
import { Offer } from '../types';
import { User } from 'firebase/auth';
import { format, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { Send, Clock, CheckCircle2, XCircle, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import 'react-calendar/dist/Calendar.css';

interface CalendarViewProps {
  offers: Offer[];
  user: User;
}

export default function CalendarView({ offers, user }: CalendarViewProps) {
  const [date, setDate] = useState(new Date());

  const monthOffers = useMemo(() => {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return offers.filter(o => {
      const offerDate = o.date.toDate();
      return offerDate >= start && offerDate <= end;
    });
  }, [offers, date]);

  const dailyStats = useMemo(() => {
    const stats: Record<string, { count: number; offers: Offer[] }> = {};
    monthOffers.forEach(o => {
      const key = format(o.date.toDate(), 'yyyy-MM-dd');
      if (!stats[key]) stats[key] = { count: 0, offers: [] };
      stats[key].count++;
      stats[key].offers.push(o);
    });
    return stats;
  }, [monthOffers]);

  const selectedDayOffers = useMemo(() => {
    const key = format(date, 'yyyy-MM-dd');
    return dailyStats[key]?.offers || [];
  }, [dailyStats, date]);

  const renderTileContent = ({ date: tileDate, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const key = format(tileDate, 'yyyy-MM-dd');
    const dayData = dailyStats[key];
    if (!dayData) return null;

    return (
      <div className="flex flex-col items-center mt-1">
        <div className="flex gap-0.5">
          {dayData.offers.slice(0, 3).map((o, i) => (
            <div 
              key={o.id} 
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                o.status === 'Sent' && "bg-blue-500",
                o.status === 'Countered' && "bg-amber-500",
                o.status === 'Accepted' && "bg-green-500",
                o.status === 'Rejected' && "bg-red-500"
              )}
            />
          ))}
          {dayData.offers.length > 3 && (
            <div className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
          )}
        </div>
      </div>
    );
  };

  const statusIcons: Record<string, any> = {
    Sent: Send,
    Countered: Clock,
    Accepted: CheckCircle2,
    Rejected: XCircle,
  };

  const statusColors: Record<string, string> = {
    Sent: 'text-blue-600',
    Countered: 'text-amber-600',
    Accepted: 'text-green-600',
    Rejected: 'text-red-600',
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">Calendar View</h2>
          <p className="text-neutral-500">Track your daily offer activity and goals.</p>
        </div>
        <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-neutral-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-bold text-neutral-900">{monthOffers.length} / 40</span>
          </div>
          <div className="h-4 w-px bg-neutral-200" />
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Monthly Progress</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm calendar-container">
            <Calendar
              onChange={(val) => setDate(val as Date)}
              value={date}
              tileContent={renderTileContent}
              className="w-full border-none font-sans"
              nextLabel={<ChevronRight className="w-5 h-5" />}
              prevLabel={<ChevronLeft className="w-5 h-5" />}
              next2Label={null}
              prev2Label={null}
            />
          </div>

          <div className="flex flex-wrap gap-6 p-4 bg-neutral-100/50 rounded-xl border border-neutral-200/50">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Sent
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Countered
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              Accepted
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-widest">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              Rejected
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm min-h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-neutral-900">{format(date, 'MMMM d, yyyy')}</h3>
              <span className="text-xs font-bold px-2 py-1 bg-neutral-100 text-neutral-600 rounded-full">
                {selectedDayOffers.length} Offers
              </span>
            </div>

            {selectedDayOffers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="p-4 bg-neutral-50 rounded-full mb-4">
                  <Calendar className="w-8 h-8 text-neutral-300" />
                </div>
                <p className="text-sm font-medium text-neutral-400">No offers sent on this day.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDayOffers.map((offer) => {
                  const Icon = statusIcons[offer.status];
                  return (
                    <div key={offer.id} className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 group hover:border-neutral-200 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <span className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", statusColors[offer.status])}>
                          <Icon className="w-3.5 h-3.5" />
                          {offer.status}
                        </span>
                        <span className="text-sm font-bold text-neutral-900">${offer.amount.toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-semibold text-neutral-800 truncate">{offer.propertyAddress}</p>
                      {offer.agentName && (
                        <p className="text-xs text-neutral-500 mt-1">Agent: {offer.agentName}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .calendar-container .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
        }
        .calendar-container .react-calendar__navigation {
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .calendar-container .react-calendar__navigation button {
          min-width: 44px;
          background: none;
          font-size: 1.25rem;
          font-weight: 700;
          color: #171717;
          border-radius: 12px;
          padding: 8px;
        }
        .calendar-container .react-calendar__navigation button:enabled:hover {
          background-color: #f5f5f5;
        }
        .calendar-container .react-calendar__month-view__weekdays {
          text-align: center;
          text-transform: uppercase;
          font-weight: 700;
          font-size: 0.7rem;
          color: #a3a3a3;
          letter-spacing: 0.1em;
          margin-bottom: 1rem;
        }
        .calendar-container .react-calendar__month-view__days__day {
          padding: 1rem 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #404040;
          border-radius: 12px;
        }
        .calendar-container .react-calendar__month-view__days__day--neighboringMonth {
          color: #d4d4d4;
        }
        .calendar-container .react-calendar__tile--now {
          background: #f5f5f5 !important;
          color: #171717 !important;
          font-weight: 700;
        }
        .calendar-container .react-calendar__tile--active {
          background: #171717 !important;
          color: white !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        }
        .calendar-container .react-calendar__tile:enabled:hover {
          background-color: #f5f5f5;
        }
        .calendar-container .react-calendar__tile--active:enabled:hover {
          background-color: #171717;
        }
      `}</style>
    </div>
  );
}
