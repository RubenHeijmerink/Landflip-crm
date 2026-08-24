import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInAnonymously, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, getDocs, addDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Property, Offer, Settings } from './types';
import Dashboard from './components/Dashboard';
import UnderwritingSheet from './components/UnderwritingSheet';
import OffersTracking from './components/OffersTracking';
import CalendarView from './components/CalendarView';
import MapView from './components/MapView';
import MarketChart from './components/MarketChart';
import DealEvaluatorPage from './components/DealEvaluatorPage';
import { LayoutDashboard, FileSpreadsheet, Send, Calendar, Map as MapIcon, LogOut, LogIn, Loader2, LineChart, ChevronLeft, ChevronRight, Menu, Sparkles, UserCheck } from 'lucide-react';
import { cn } from './lib/utils';
import { getDefaultLeonCountyAnalysis } from './data/defaultLeonCountyData';
import { sanitizeListing, cleanObjectForFirestore } from './lib/marketUtils';

type Page = 'dashboard' | 'underwriting' | 'offers' | 'calendar' | 'map' | 'market-chart' | 'deal-evaluator';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('market-chart');
  const [properties, setProperties] = useState<Property[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settings, setSettings] = useState<Settings>({ offerPercentage: 40, uid: '' });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Seed default Leon County analysis if no market analysis exists for this user/guest
    const checkAndSeedMarketAnalysis = async () => {
      try {
        const qAnalyses = query(
          collection(db, 'marketAnalyses'),
          where('uid', '==', user.uid)
        );
        const snap = await getDocs(qAnalyses);
        if (snap.empty) {
          const defaultAnalysis = getDefaultLeonCountyAnalysis(user.uid);
          const cleanActive = defaultAnalysis.activeListings.map(sanitizeListing);
          const cleanSold = defaultAnalysis.soldListings.map(sanitizeListing);
          const payload = cleanObjectForFirestore({
            ...defaultAnalysis,
            activeListings: cleanActive,
            soldListings: cleanSold,
            createdAt: Timestamp.now(),
            uid: user.uid
          });
          await addDoc(collection(db, 'marketAnalyses'), payload);
        }
      } catch (err) {
        console.error('Error verifying/seeding default Leon County analysis:', err);
      }
    };

    checkAndSeedMarketAnalysis();

    const qProperties = query(
      collection(db, 'properties'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubProperties = onSnapshot(qProperties, (snapshot) => {
      const props = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Property));
      setProperties(props);
    });

    const qOffers = query(
      collection(db, 'offers'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc')
    );
    const unsubOffers = onSnapshot(qOffers, (snapshot) => {
      const offrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Offer));
      setOffers(offrs);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as Settings);
      }
    });

    return () => {
      unsubProperties();
      unsubOffers();
      unsubSettings();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setIsLoggingIn(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGuestLogin = async () => {
    try {
      setIsLoggingIn(true);
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Guest login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
        <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-sm border border-neutral-200 text-center">
          <div className="w-12 h-12 bg-neutral-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <LineChart className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900 mb-2">Land Flip CRM</h1>
          <p className="text-neutral-500 mb-6 text-sm">Manage your land deals, analyze market comps, and track offers with ease.</p>
          
          {/* Sample preloaded highlight */}
          <div className="mb-6 p-3 bg-blue-50/80 border border-blue-100 rounded-xl text-left flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900">
              <span className="font-semibold">Leon County, FL Market Preloaded:</span> Instant access to active listings and sold comps with charts, heatmaps, and deal swiper.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors font-medium cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Sign in with Google
            </button>

            <button
              onClick={handleGuestLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 transition-colors font-medium rounded-xl cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-5 h-5 text-neutral-600" />
              Continue as Guest (Instant Demo)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'underwriting', label: 'Underwriting', icon: FileSpreadsheet },
    { id: 'offers', label: 'Offers', icon: Send },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'market-chart', label: 'Market Chart', icon: LineChart },
    { id: 'deal-evaluator', label: 'Deal Evaluator', icon: Sparkles },
  ];

  const displayName = user.displayName || (user.isAnonymous ? 'Guest Explorer' : 'User');
  const userSubtitle = user.email || (user.isAnonymous ? 'Leon County Demo Mode' : 'Signed In');
  const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=3b82f6&color=fff`;

  return (
    <div className="flex min-h-screen bg-neutral-50 flex-col md:flex-row min-w-0">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-30 shadow-xs">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-700 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold tracking-tight text-neutral-900">Land Flip CRM</h1>
        </div>
        <span className="text-xs font-semibold text-neutral-500 capitalize bg-neutral-100 px-2.5 py-1 rounded-full">
          {currentPage.replace('-', ' ')}
        </span>
      </div>

      {/* Sidebar Overlay on Mobile when open */}
      {!sidebarCollapsed && (
        <div 
          className="md:hidden fixed inset-0 bg-neutral-900/50 backdrop-blur-xs z-30"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-neutral-200 flex flex-col fixed inset-y-0 transition-all duration-300 z-40",
        "max-md:top-0 max-md:bottom-0",
        sidebarCollapsed ? "-translate-x-full md:translate-x-0 md:w-20" : "translate-x-0 w-64"
      )}>
        <div className={cn(
          "p-6 flex items-center justify-between",
          sidebarCollapsed && "px-4 justify-center"
        )}>
          {!sidebarCollapsed && <h1 className="text-xl font-bold tracking-tight text-neutral-900">Land Flip CRM</h1>}
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-500 transition-colors"
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentPage(item.id as Page);
                if (window.innerWidth < 768) setSidebarCollapsed(true);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer",
                currentPage === item.id 
                  ? "bg-neutral-100 text-neutral-900 font-bold" 
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50",
                sidebarCollapsed && "justify-center px-2"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-200">
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 mb-2",
            sidebarCollapsed && "px-0 justify-center"
          )}>
            <img 
              src={avatarUrl} 
              alt={displayName} 
              className="w-8 h-8 rounded-full border border-neutral-200 object-cover"
              referrerPolicy="no-referrer"
            />
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{displayName}</p>
                <p className="text-xs text-neutral-500 truncate">{userSubtitle}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer",
              sidebarCollapsed && "justify-center px-2"
            )}
            title={sidebarCollapsed ? "Sign Out" : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 p-3 sm:p-6 lg:p-8 pt-16 md:pt-8 transition-all duration-300 w-full min-w-0",
        sidebarCollapsed ? "md:ml-20" : "md:ml-64"
      )}>
        <div className="max-w-7xl mx-auto w-full">
          {currentPage === 'dashboard' && (
            <Dashboard 
              properties={properties} 
              offers={offers} 
              user={user} 
              onNavigateToUnderwriting={(propId) => {
                if (propId) setSelectedPropertyId(propId);
                setCurrentPage('underwriting');
              }}
            />
          )}
          {currentPage === 'underwriting' && (
            <UnderwritingSheet 
              properties={properties} 
              settings={settings} 
              user={user} 
              initialPropertyId={selectedPropertyId}
            />
          )}
          {currentPage === 'offers' && (
            <OffersTracking offers={offers} properties={properties} user={user} />
          )}
          {currentPage === 'calendar' && (
            <CalendarView offers={offers} user={user} />
          )}
          {currentPage === 'map' && (
            <MapView user={user} />
          )}
          {currentPage === 'market-chart' && (
            <MarketChart user={user} />
          )}
          {currentPage === 'deal-evaluator' && (
            <DealEvaluatorPage user={user} />
          )}
        </div>
      </main>
    </div>
  );
}
