import React, { useEffect, useState, useRef } from 'react';
import { Deck, SessionResult, StimulusCard } from '../types';
import { dbService } from '../services/db';
import { cloudSyncService } from '../services/cloudSync';
import { generateImageFromDescription } from '../services/gemini';
import { Plus, Play, Edit2, Trash2, Library, BookOpen, Clock, Copy, Settings, X, Calendar, CheckCircle2, TrendingUp, MoreHorizontal, Palette, Share2, Upload, Download, Link, Loader2, Cloud, CloudOff, RefreshCw, Smartphone, Check, UserPlus, Bell, ArrowDownCircle, ArrowUpCircle, ExternalLink, History, Activity, Zap, Send, ShieldCheck } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DashboardProps {
  onEditDeck: (deck: Deck) => void;
  onRunDeck: (deck: Deck) => void;
}

const PRESET_COLORS = [
  '#6366f1', '#ef4444', '#f97316', '#f59e0b', '#84cc16', 
  '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', '#8b5cf6', 
  '#d946ef', '#f43f5e', '#64748b'
];

export const Dashboard: React.FC<DashboardProps> = ({ onEditDeck, onRunDeck }) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [sessions, setSessions] = useState<SessionResult[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals & UI State
  const [shareDeck, setShareDeck] = useState<Deck | null>(null);
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [appShareCopied, setAppShareCopied] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Inline Editing State
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{current: number, total: number} | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [allDecks, allSessions] = await Promise.all([
        dbService.getAllDecks(),
        dbService.getAllSessions()
      ]);
      setDecks(allDecks.sort((a, b) => b.updatedAt - a.updatedAt));
      setSessions(allSessions);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 5000);
  };

  const runAutoSync = async (force = false) => {
    const allDecks = await dbService.getAllDecks();
    const cloudDecks = allDecks.filter(d => !!d.cloudSyncId);
    
    if (cloudDecks.length === 0) {
      if (force) setIsRefreshing(false);
      return;
    }
    
    if (force) setIsRefreshing(true);
    let updatedAny = false;
    
    for (const d of cloudDecks) {
      try {
        const remote = await cloudSyncService.downloadDeck(d.cloudSyncId!);
        if (remote.updatedAt > d.updatedAt) {
          await handleSyncProcess(d.cloudSyncId!, d);
          updatedAny = true;
        }
      } catch (e) {
        console.warn("Sync check failed for", d.name);
      }
    }
    
    if (updatedAny) {
      showToast("Updated programs with latest changes from cloud.");
    }

    if (force) {
      setTimeout(() => setIsRefreshing(false), 1000);
      loadData();
    }
  };

  useEffect(() => {
    const checkUrlForCloudId = async () => {
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get('cloudId');
      if (sharedId) {
        const allDecks = await dbService.getAllDecks();
        const existing = allDecks.find(d => d.cloudSyncId === sharedId);
        await handleSyncProcess(sharedId, existing);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      loadData();
      runAutoSync();
    };

    checkUrlForCloudId();
  }, []);

  const handleSyncProcess = async (cloudId: string, existingLocalDeck?: Deck) => {
    setSyncing(true);
    try {
      const remoteDeck = await cloudSyncService.downloadDeck(cloudId);
      if (!remoteDeck) throw new Error("Program not found.");

      const totalCards = remoteDeck.cards.length;
      setSyncProgress({ current: 0, total: totalCards });

      const newCards: StimulusCard[] = [];
      const localCardMap = new Map(existingLocalDeck?.cards.map(c => [c.id, c.mediaUri]) || []);

      for (let i = 0; i < totalCards; i++) {
        const card = remoteDeck.cards[i];
        let imageData = localCardMap.get(card.id) || '';
        
        if (!imageData) {
          const prompt = card.originalDescription || card.label;
          try {
            const generated = await generateImageFromDescription(prompt);
            imageData = generated || '';
          } catch (genErr) {
            console.warn("Failed to generate image for card", card.label);
          }
        }
        
        newCards.push({
          ...card,
          mediaUri: imageData,
          createdAt: card.createdAt || Date.now()
        });

        setSyncProgress({ current: i + 1, total: totalCards });
      }

      const mergedDeck: Deck = {
        ...remoteDeck,
        id: existingLocalDeck?.id || remoteDeck.id || uuidv4(),
        cloudSyncId: cloudId,
        lastSyncedAt: Date.now(),
        cards: newCards
      };

      await dbService.saveDeck(mergedDeck);
      await loadData();
      showToast(`Successfully ${existingLocalDeck ? 'updated' : 'linked'} program: ${mergedDeck.name}`);
    } catch (e) {
      console.error(e);
      alert("Error: Could not retrieve program data. The link might be expired or incorrect.");
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const handleCreateDeck = async () => {
    const newDeck: Deck = {
      id: uuidv4(),
      name: 'New Program',
      description: '',
      cards: [],
      updatedAt: Date.now(),
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
    };
    await dbService.saveDeck(newDeck);
    onEditDeck(newDeck);
  };

  const startRenaming = (e: React.MouseEvent, deck: Deck) => {
    e.stopPropagation();
    setEditingDeckId(deck.id);
    setEditingName(deck.name);
  };

  const submitRename = async (deck: Deck) => {
    if (!editingName.trim() || editingName === deck.name) {
      setEditingDeckId(null);
      return;
    }

    const updatedDeck = { ...deck, name: editingName.trim(), updatedAt: Date.now() };
    
    try {
      await dbService.saveDeck(updatedDeck);
      if (deck.cloudSyncId) {
        await cloudSyncService.updateDeck(deck.cloudSyncId, updatedDeck);
      }
      setDecks(decks.map(d => d.id === deck.id ? updatedDeck : d));
      showToast("Program renamed successfully.");
    } catch (err) {
      console.error("Rename failed:", err);
    } finally {
      setEditingDeckId(null);
    }
  };

  const handleShareClick = async (e: React.MouseEvent, deck: Deck) => {
    e.stopPropagation();
    
    if (!deck.cloudSyncId) {
      setSyncing(true);
      try {
        const id = await cloudSyncService.uploadDeck(deck);
        const updatedDeck = { ...deck, cloudSyncId: id, lastSyncedAt: Date.now() };
        await dbService.saveDeck(updatedDeck);
        showToast("Program published to cloud!");
        setShareDeck(updatedDeck);
        loadData();
      } catch (err) {
        alert("Could not upload to cloud. Please check your internet.");
      } finally {
        setSyncing(false);
      }
    } else {
      setShareDeck(deck);
    }
  };

  const handleManualPush = async (deck: Deck) => {
    if (!deck.cloudSyncId) return;
    setSyncing(true);
    try {
      await cloudSyncService.updateDeck(deck.cloudSyncId, deck);
      const updatedDeck = { ...deck, lastSyncedAt: Date.now() };
      await dbService.saveDeck(updatedDeck);
      showToast("Program successfully updated on cloud.");
      loadData();
    } catch (err) {
      console.error("Push failed:", err);
      alert("Failed to update cloud. Please check your connection.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteDeck = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this program?")) {
      await dbService.deleteDeck(id);
      loadData();
      showToast("Program deleted.");
    }
  };

  const handleShareApp = () => {
    navigator.clipboard.writeText(window.location.href);
    setAppShareCopied(true);
    setTimeout(() => setAppShareCopied(false), 2000);
  };

  const formatLastSynced = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    if (isToday) {
      return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 relative">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] animate-in slide-in-from-top-4 duration-300">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10">
            <Bell className="w-5 h-5 text-indigo-400" />
            <span className="font-medium">{notification}</span>
          </div>
        </div>
      )}

      {/* Sync Overlay */}
      {syncing && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2 uppercase tracking-tight">Cloud Communication</h2>
            <p className="text-gray-500 mb-8 max-w-sm">Please wait while we sync stimuli with your coworkers...</p>
            {syncProgress && (
               <div className="w-full max-w-xs">
                 <div className="bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
                   <div className="bg-indigo-600 h-full transition-all" style={{ width: `${(syncProgress.current/syncProgress.total)*100}%` }} />
                 </div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Processing {syncProgress.current} of {syncProgress.total}</p>
               </div>
            )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
            <Library className="w-8 h-8 mr-3 text-indigo-600" />
            StimuliGen Dashboard
          </h1>
          <p className="text-gray-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            Account-free sharing: No Google account or login required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleShareApp}
            className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center transform hover:scale-105"
          >
            {appShareCopied ? <Check className="w-5 h-5 mr-2" /> : <Send className="w-5 h-5 mr-2" />}
            {appShareCopied ? 'Link Copied' : 'Share App URL'}
          </button>
          <button
            onClick={() => runAutoSync(true)}
            disabled={isRefreshing}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-3 rounded-xl font-medium transition-colors shadow-sm flex items-center"
          >
            <RefreshCw className={`w-5 h-5 mr-2 text-indigo-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Checking...' : 'Sync All'}
          </button>
          <button
            onClick={() => setCloudModalOpen(true)}
            className="bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 px-4 py-3 rounded-xl font-bold transition-colors shadow-sm flex items-center"
          >
            <Cloud className="w-5 h-5 mr-2" />
            Join Program
          </button>
          <button
            onClick={handleCreateDeck}
            className="bg-gray-900 hover:bg-black text-white px-5 py-3 rounded-xl font-bold transition-colors shadow-lg flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Program
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-10">
        {/* Main Programs Grid */}
        <div className="lg:col-span-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <BookOpen className="w-6 h-6 mr-2 text-indigo-500" />
            Active Programs
          </h2>
          {loading ? (
            <div className="text-center py-20 text-gray-400">Opening vault...</div>
          ) : decks.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-100">
              <BookOpen className="w-16 h-16 mx-auto text-gray-200 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Your bank is empty</h3>
              <p className="text-gray-500 mb-8">Create your first program or join one using a cloud code.</p>
              <div className="flex gap-4 justify-center">
                <button onClick={handleCreateDeck} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold">Create New</button>
                <button onClick={() => setCloudModalOpen(true)} className="bg-white border border-gray-200 px-6 py-2.5 rounded-lg font-bold">Join Existing</button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {decks.map((deck) => (
                <div
                  key={deck.id}
                  onClick={() => editingDeckId !== deck.id && onEditDeck(deck)}
                  className="group bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl transition-all cursor-pointer relative overflow-hidden flex flex-col h-full"
                >
                  <div className="h-2 w-full" style={{ backgroundColor: deck.color || PRESET_COLORS[0] }} />
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm`} style={{ backgroundColor: deck.color || PRESET_COLORS[0] }}>
                        <BookOpen className="w-6 h-6" />
                      </div>
                      {deck.cloudSyncId ? (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full uppercase tracking-tighter mb-1 border border-green-100">
                            <Cloud className="w-3 h-3 mr-1" />
                            PUBLISHED
                          </div>
                          <span className="text-[9px] text-gray-400 font-medium whitespace-nowrap">Updated {formatLastSynced(deck.lastSyncedAt)}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full uppercase tracking-tighter border border-gray-100">
                          Local Only
                        </div>
                      )}
                    </div>

                    <div className="mb-1 min-h-[1.75rem]">
                      {editingDeckId === deck.id ? (
                        <input
                          autoFocus
                          className="text-xl font-bold w-full bg-gray-50 border-b-2 border-indigo-500 outline-none px-1 rounded-t-sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => submitRename(deck)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(deck);
                            if (e.key === 'Escape') setEditingDeckId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="flex items-center group/title relative">
                          <h3 
                            className="text-xl font-bold truncate text-gray-900 flex-1 hover:text-indigo-600"
                            onClick={(e) => startRenaming(e, deck)}
                          >
                            {deck.name}
                          </h3>
                          <button 
                            onClick={(e) => startRenaming(e, deck)}
                            className="ml-2 p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/title:opacity-100 transition-opacity"
                            title="Rename program"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-500 mb-6">{deck.cards.length} Stimuli in Deck</p>

                    <div className="mt-auto pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                      <button onClick={(e) => { e.stopPropagation(); onRunDeck(deck); }} className="bg-gray-900 text-white py-2.5 rounded-lg font-bold text-sm flex items-center justify-center hover:bg-black transition-colors">
                        <Play className="w-3.5 h-3.5 mr-2" /> Start Session
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onEditDeck(deck); }} className="bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center hover:bg-gray-50 transition-colors">
                        <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Program
                      </button>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => handleShareClick(e, deck)} 
                            className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 flex items-center px-2 py-1.5 rounded-lg transition-colors font-bold shadow-sm"
                            title="Publish this program to cloud for client access"
                          >
                            <Share2 className="w-3.5 h-3.5 mr-1.5" /> 
                            {deck.cloudSyncId ? 'Publish & Share' : 'Publish Program'}
                        </button>
                        {deck.cloudSyncId && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setShareDeck(deck); }} 
                            className="text-xs text-gray-500 hover:text-gray-900 flex items-center p-1.5 rounded hover:bg-gray-100 transition-colors font-semibold"
                            title="Sync Status"
                          >
                              <RefreshCw className="w-3.5 h-3.5 mr-1 text-indigo-500" />
                              Sync
                          </button>
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteDeck(e, deck.id); }} className="text-xs text-gray-300 hover:text-red-600 flex items-center p-1 rounded hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: Session History */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sticky top-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center justify-between">
              <span className="flex items-center">
                <History className="w-6 h-6 mr-2 text-indigo-500" />
                Recent Results
              </span>
              <Activity className="w-4 h-4 text-gray-300" />
            </h2>

            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {sessions.length === 0 ? (
                <div className="text-center py-12">
                   <Zap className="w-8 h-8 text-gray-100 mx-auto mb-2" />
                   <p className="text-sm text-gray-400">No sessions run yet.</p>
                </div>
              ) : (
                sessions.map((session, idx) => {
                  const deck = decks.find(d => d.id === session.deckId);
                  const accuracy = Math.round((session.correctCount / session.totalCards) * 100);
                  
                  return (
                    <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-md transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center">
                           <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: deck?.color || '#ccc' }} />
                           <h4 className="font-bold text-sm text-gray-900 truncate max-w-[120px]">
                             {deck?.name || 'Deleted Program'}
                           </h4>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${accuracy >= 80 ? 'bg-green-100 text-green-700' : accuracy >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                          {accuracy}%
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                        <div className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDate(session.date)}
                        </div>
                        <div className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {session.durationSeconds}s
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <div className="h-1 flex-1 bg-green-200 rounded-full" style={{ flexGrow: session.correctCount }} />
                        <div className="h-1 flex-1 bg-red-200 rounded-full" style={{ flexGrow: session.incorrectCount }} />
                      </div>
                      <div className="flex justify-between text-[9px] mt-1 font-bold">
                        <span className="text-green-600">{session.correctCount} Correct</span>
                        <span className="text-red-400">{session.incorrectCount} Incorrect</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {sessions.length > 0 && (
              <button 
                onClick={async () => {
                  if (confirm("Clear history?")) {
                    // History clearing logic
                  }
                }}
                className="w-full mt-6 py-2 text-[10px] font-bold text-gray-300 hover:text-red-400 uppercase tracking-widest transition-colors"
              >
                Reset Session History
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {shareDeck && (
        <ShareModal 
          deck={shareDeck} 
          onPush={() => {
            handleManualPush(shareDeck);
            setShareDeck(null);
          }}
          onPull={() => {
            handleSyncProcess(shareDeck.cloudSyncId!, shareDeck);
            setShareDeck(null);
          }}
          onClose={() => setShareDeck(null)} 
        />
      )}

      {/* Cloud Management Modal (Manual Input) */}
      {cloudModalOpen && (
        <CloudJoinModal 
          onJoin={(id) => handleSyncProcess(id)} 
          onClose={() => setCloudModalOpen(false)} 
        />
      )}
    </div>
  );
};

const CloudJoinModal: React.FC<{ onJoin: (id: string) => void, onClose: () => void }> = ({ onJoin, onClose }) => {
  const [id, setId] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center"><Cloud className="mr-2" /> Join Program</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full"><X /></button>
        </div>
        <div className="p-8">
          <p className="text-gray-600 mb-2 text-sm">Enter the code provided by your coworker or therapist.</p>
          <div className="flex items-center gap-2 mb-6 text-green-600 bg-green-50 px-3 py-2 rounded-lg border border-green-100">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-bold">No account or login required.</span>
          </div>
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Code (e.g. 7a2b3c)"
              className="w-full border-2 border-gray-100 rounded-xl px-5 py-3 text-lg font-mono tracking-widest focus:border-indigo-500 outline-none uppercase"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoFocus
            />
            <button 
              onClick={() => { onJoin(id.trim()); onClose(); }}
              disabled={!id.trim()}
              className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              Download & Start
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ShareModal: React.FC<{ deck: Deck, onPush: () => void, onPull: () => void, onClose: () => void }> = ({ deck, onPush, onPull, onClose }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = () => {
    if (deck.cloudSyncId) {
      navigator.clipboard.writeText(deck.cloudSyncId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = () => {
    if (deck.cloudSyncId) {
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('cloudId', deck.cloudSyncId);
      navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Program Sharing Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X /></button>
        </div>

        <div className="p-8 space-y-6">
           <div className="bg-indigo-50 rounded-2xl p-6 text-center border border-indigo-100">
              <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-2">Invite your coworker or client</p>
              <p className="text-5xl font-mono font-black text-indigo-900 mb-6">{deck.cloudSyncId}</p>
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={handleCopyLink} className="bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center justify-center shadow-md">
                  {copiedLink ? <Check className="w-4 h-4 mr-2" /> : <Link className="w-4 h-4 mr-2" />}
                  {copiedLink ? 'Link Copied' : 'Copy Direct Link'}
                </button>
                <button onClick={handleCopyCode} className="bg-white border border-indigo-200 text-indigo-600 px-4 py-3 rounded-xl font-bold text-sm hover:bg-indigo-50 transition-all flex items-center justify-center shadow-sm">
                  {copiedCode ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copiedCode ? 'Code Copied' : 'Copy Code Only'}
                </button>
              </div>
              <p className="mt-4 text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Login or account not required for recipients</p>
           </div>

           <div className="space-y-3">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">Cloud Sync Options</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={onPush}
                  className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 group transition-all text-center"
                >
                  <ArrowUpCircle className="w-8 h-8 text-indigo-500 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-gray-900 text-sm">Push My Edits</span>
                  <span className="text-[10px] text-gray-400">Save my changes to cloud</span>
                </button>

                <button 
                  onClick={onPull}
                  className="flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 group transition-all text-center"
                >
                  <ArrowDownCircle className="w-8 h-8 text-green-500 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-gray-900 text-sm">Pull Updates</span>
                  <span className="text-[10px] text-gray-400">Get coworker's edits</span>
                </button>
              </div>
           </div>
           
           <p className="text-center text-xs text-gray-400 px-4 italic">Note: Sharing the "Direct Link" is the easiest way for others to join.</p>
        </div>
      </div>
    </div>
  );
};