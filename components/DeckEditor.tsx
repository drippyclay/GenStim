import React, { useState, useRef, useEffect } from 'react';
import { Deck, StimulusCard } from '../types';
import { generateStimulusVariations, generateVideoFromDescription, ImageStyle } from '../services/gemini';
import { Trash2, Plus, Save, ArrowLeft, Loader2, Image as ImageIcon, RefreshCw, X, Edit2, Check, Video, Film, PlayCircle, Upload, Zap, Layers, Target as TargetIcon, ChevronRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DeckEditorProps {
  deck: Deck;
  onSave: (updatedDeck: Deck) => void;
  onBack: () => void;
}

interface GeneratedItem {
  mediaUri: string;
  description: string;
  mediaType: 'image' | 'video' | 'burst';
  burstUris?: string[];
}

export const DeckEditor: React.FC<DeckEditorProps> = ({ deck, onSave, onBack }) => {
  const [deckName, setDeckName] = useState(deck.name);
  const [cards, setCards] = useState<StimulusCard[]>(deck.cards);
  const [targetLabels, setTargetLabels] = useState<string[]>(deck.targetLabels || []);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState('');
  const [currentMediaUri, setCurrentMediaUri] = useState<string | null>(null);
  const [currentMediaType, setCurrentMediaType] = useState<'image' | 'video' | 'burst'>('image');
  const [currentBurstUris, setCurrentBurstUris] = useState<string[]>([]);
  const [currentDescription, setCurrentDescription] = useState<string | null>(null);
  
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [creationMode, setCreationMode] = useState<'static' | 'burst' | 'moving'>('static');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize targets if empty but cards exist
  useEffect(() => {
    if (targetLabels.length === 0 && cards.length > 0) {
      const uniqueLabels = Array.from(new Set(cards.map(c => c.label)));
      setTargetLabels(uniqueLabels);
      if (uniqueLabels.length > 0) setActiveTarget(uniqueLabels[0]);
    } else if (targetLabels.length > 0 && !activeTarget) {
      setActiveTarget(targetLabels[0]);
    }
  }, []);

  // Sync currentLabel with activeTarget when switching
  useEffect(() => {
    if (activeTarget) {
      setCurrentLabel(activeTarget);
    }
  }, [activeTarget]);

  const resetEditor = () => {
    setEditingCardId(null);
    setCurrentLabel(activeTarget || '');
    setCurrentMediaUri(null);
    setCurrentMediaType('image');
    setCurrentBurstUris([]);
    setCurrentDescription(null);
    setGeneratedItems([]);
    setSelectedIndices(new Set());
    setError(null);
  };

  const handleEditCard = (card: StimulusCard) => {
    setEditingCardId(card.id);
    setCurrentLabel(card.label);
    setCurrentMediaUri(card.mediaUri);
    setCurrentMediaType(card.mediaType);
    setCurrentBurstUris(card.burstUris || []);
    setCurrentDescription(card.originalDescription || null);
    setGeneratedItems([]);
    setSelectedIndices(new Set());
    setError(null);
  };

  const handleAddTarget = () => {
    const name = prompt("Enter Target Name (e.g., Eating, Waving):");
    if (name && !targetLabels.includes(name)) {
      const newTargets = [...targetLabels, name];
      setTargetLabels(newTargets);
      setActiveTarget(name);
    }
  };

  const handleRemoveTarget = (target: string) => {
    if (confirm(`Remove "${target}" and all its stimuli?`)) {
      setTargetLabels(targetLabels.filter(t => t !== target));
      setCards(cards.filter(c => c.label !== target));
      if (activeTarget === target) setActiveTarget(targetLabels[0] || null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      setCurrentMediaUri(dataUri);
      setCurrentMediaType(file.type.includes('video') || file.type.includes('gif') ? 'video' : 'image');
      if (!currentLabel) setCurrentLabel(activeTarget || file.name.split('.')[0]);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    const targetToUse = currentLabel.trim() || activeTarget;
    if (!targetToUse) return;
    
    setIsGenerating(true);
    setError(null);
    setGeneratedItems([]);
    setSelectedIndices(new Set());
    
    try {
      if (creationMode === 'moving') {
        const videoUri = await generateVideoFromDescription(targetToUse);
        if (videoUri) {
          setGeneratedItems([{ mediaUri: videoUri, description: targetToUse, mediaType: 'video' }]);
          setSelectedIndices(new Set([0]));
        } else {
          throw new Error("Video generation failed.");
        }
      } else if (creationMode === 'burst') {
        const items = await generateStimulusVariations(targetToUse, imageStyle, 'action');
        if (items.length > 0) {
          const uris = items.map(it => it.imageData);
          setGeneratedItems([{ 
            mediaUri: uris[0], 
            burstUris: uris, 
            description: targetToUse, 
            mediaType: 'burst' 
          }]);
          setSelectedIndices(new Set([0]));
        }
      } else {
        const items = await generateStimulusVariations(targetToUse, imageStyle, 'generalization');
        setGeneratedItems(items.map(it => ({ ...it, mediaUri: it.imageData, mediaType: 'image' })));
        setSelectedIndices(new Set(items.map((_, i) => i)));
      }
    } catch (e) {
      setError(creationMode === 'moving' ? "AI Video requires a Paid Key. Try 'Action GIF' mode instead!" : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (editingCardId || creationMode !== 'static') {
        newSet.clear(); 
        newSet.add(index);
    } else {
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const handleSaveCard = () => {
    const targetToSave = currentLabel.trim() || activeTarget;
    if (!targetToSave) return;

    // Ensure the target exists in the sidebar
    if (!targetLabels.includes(targetToSave)) {
      setTargetLabels([...targetLabels, targetToSave]);
    }

    if (editingCardId) {
      let mediaToSave = currentMediaUri;
      let typeToSave = currentMediaType;
      let burstToSave = currentBurstUris;
      let descriptionToSave = currentDescription;

      if (generatedItems.length > 0) {
        // Fix: Explicitly type selectedIdx as number | undefined to prevent 'unknown' index type error during access
        const selectedIdx = Array.from(selectedIndices)[0] as number | undefined;
        if (selectedIdx !== undefined) {
            mediaToSave = generatedItems[selectedIdx].mediaUri;
            typeToSave = generatedItems[selectedIdx].mediaType;
            burstToSave = generatedItems[selectedIdx].burstUris || [];
            descriptionToSave = generatedItems[selectedIdx].description;
        }
      }

      if (!mediaToSave) return;

      setCards(cards.map(c => c.id === editingCardId ? {
        ...c,
        label: targetToSave,
        mediaUri: mediaToSave!,
        mediaType: typeToSave!,
        burstUris: burstToSave,
        originalDescription: descriptionToSave || c.label,
      } : c));
    } else {
      const itemsToAdd: GeneratedItem[] = [];
      
      if (generatedItems.length > 0) {
        generatedItems.forEach((item, i) => {
          if (selectedIndices.has(i)) itemsToAdd.push(item);
        });
      } else if (currentMediaUri) {
        itemsToAdd.push({ 
          mediaUri: currentMediaUri, 
          description: targetToSave, 
          mediaType: currentMediaType, 
          burstUris: currentBurstUris 
        });
      }

      if (itemsToAdd.length === 0) return;

      const newCards = itemsToAdd.map(item => ({
        id: uuidv4(),
        label: targetToSave,
        mediaUri: item.mediaUri,
        mediaType: item.mediaType,
        burstUris: item.burstUris,
        originalDescription: item.description,
        createdAt: Date.now(),
      }));
      setCards([...cards, ...newCards]);
    }
    resetEditor();
  };

  const filteredCards = activeTarget ? cards.filter(c => c.label === activeTarget) : cards;
  const themeColor = deck.color || '#6366f1';
  const selectedCount = selectedIndices.size;

  return (
    <div className="flex flex-col h-screen max-w-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="text-lg font-bold bg-transparent border-none focus:outline-none p-0 focus:ring-0"
              style={{ color: themeColor }}
              placeholder="Program Name"
            />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Master Program</span>
          </div>
        </div>
        <button 
          onClick={() => { setIsSaving(true); onSave({...deck, name: deckName, cards, targetLabels, updatedAt: Date.now()}); setIsSaving(false); }}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Program
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Targets */}
        <div className="w-64 bg-white border-r border-gray-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
              <TargetIcon className="w-4 h-4 mr-2" /> Targets
            </h2>
            <button onClick={handleAddTarget} className="p-1 hover:bg-gray-100 rounded text-indigo-600">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {targetLabels.length === 0 && (
              <p className="p-4 text-xs text-gray-400 italic">No targets yet. Add one to start.</p>
            )}
            {targetLabels.map((target) => {
              const count = cards.filter(c => c.label === target).length;
              return (
                <div 
                  key={target} 
                  onClick={() => setActiveTarget(target)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all group ${activeTarget === target ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <div className="flex items-center min-w-0">
                    <ChevronRight className={`w-3 h-3 mr-2 transition-transform ${activeTarget === target ? 'rotate-90' : ''}`} />
                    <span className="text-sm font-bold truncate">{target}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${activeTarget === target ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>{count}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRemoveTarget(target); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 2: Generator */}
        <div className="w-[400px] border-r border-gray-100 p-6 flex flex-col bg-white overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {editingCardId ? 'Edit Stimulus' : 'Add Stimuli'}
              {activeTarget && <span className="text-xs font-normal text-gray-400 italic">to {activeTarget}</span>}
            </h2>
            <div className="flex gap-2">
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,.gif" />
              <button onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg border border-gray-100" title="Upload">
                <Upload className="w-4 h-4" />
              </button>
              {editingCardId && <button onClick={resetEditor} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
            </div>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Name</label>
              <input
                type="text"
                value={currentLabel}
                onChange={(e) => setCurrentLabel(e.target.value)}
                className="w-full border-2 border-gray-100 rounded-xl px-4 py-3 focus:border-indigo-500 outline-none font-bold"
                placeholder="Target (e.g., Eating)"
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-4">
              <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200">
                 <button onClick={() => setCreationMode('static')} className={`flex-1 flex flex-col items-center py-2 rounded-lg text-[10px] font-black transition-all ${creationMode === 'static' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400'}`}>
                   <ImageIcon className="w-4 h-4 mb-1" /> STATIC
                 </button>
                 <button onClick={() => setCreationMode('burst')} className={`flex-1 flex flex-col items-center py-2 rounded-lg text-[10px] font-black transition-all ${creationMode === 'burst' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400'}`}>
                   <Zap className="w-4 h-4 mb-1" /> ACTION GIF
                 </button>
                 <button onClick={() => setCreationMode('moving')} className={`flex-1 flex flex-col items-center py-2 rounded-lg text-[10px] font-black transition-all ${creationMode === 'moving' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400'}`}>
                   <Film className="w-4 h-4 mb-1" /> AI VIDEO
                 </button>
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={isGenerating || (!currentLabel && !activeTarget)}
                className="w-full text-white py-3.5 rounded-xl font-black text-sm shadow-lg disabled:opacity-50 transition-all active:scale-95"
                style={{ backgroundColor: themeColor }}
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `GENERATE ${creationMode.toUpperCase()}`}
              </button>
            </div>

            <div className="aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
              {isGenerating ? (
                <div className="text-center p-4">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-indigo-600 opacity-50" />
                  <p className="text-xs text-gray-500 font-black uppercase tracking-widest">Processing...</p>
                </div>
              ) : generatedItems.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 p-3 h-full w-full overflow-y-auto">
                  {generatedItems.map((item, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => toggleSelection(idx)}
                      className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${selectedIndices.has(idx) ? 'border-indigo-600 bg-indigo-50 shadow-inner' : 'border-transparent'}`}
                    >
                      {item.mediaType === 'video' ? (
                        <video src={item.mediaUri} autoPlay loop muted className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.mediaUri} className="w-full h-full object-cover" />
                      )}
                      {selectedIndices.has(idx) && (
                        <div className="absolute top-1 right-1 bg-indigo-600 text-white rounded-full p-0.5 shadow-lg">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : currentMediaUri ? (
                 <div className="relative w-full h-full group bg-white">
                   {currentMediaType === 'video' ? <video src={currentMediaUri} autoPlay loop muted className="w-full h-full object-contain p-4" /> : <img src={currentMediaUri} className="w-full h-full object-contain p-4" />}
                   <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-center backdrop-blur-sm">Manual Upload</div>
                 </div>
              ) : (
                <div className="text-center p-10 space-y-3 opacity-30">
                  <Layers className="w-12 h-12 mx-auto" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Select Target & Generate</p>
                </div>
              )}
            </div>
            {error && <p className="text-red-500 text-[10px] font-black bg-red-50 p-3 rounded-xl border border-red-100 text-center uppercase tracking-tighter">{error}</p>}
          </div>

          <button
            onClick={handleSaveCard}
            disabled={(!currentLabel && !activeTarget) || (generatedItems.length === 0 && !currentMediaUri) || (generatedItems.length > 0 && selectedCount === 0)}
            className="mt-6 w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-sm hover:bg-black disabled:opacity-50 shadow-2xl flex items-center justify-center gap-2 transform transition-transform active:scale-95"
          >
            {editingCardId ? 'UPDATE STIMULUS' : `ADD ${selectedCount > 1 ? selectedCount : ''} TO TARGET`}
          </button>
        </div>

        {/* Column 3: Stimuli Library */}
        <div className="flex-1 bg-white p-6 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              Target Library: <span className="ml-2 text-indigo-600">{activeTarget || 'All'}</span>
              <span className="ml-3 bg-gray-100 text-gray-500 text-[10px] font-black px-2 py-1 rounded-full">{filteredCards.length}</span>
            </h2>
            <div className="flex gap-2">
              <button onClick={() => setActiveTarget(null)} className={`text-[10px] font-black px-3 py-1.5 rounded-lg border transition-all ${!activeTarget ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-400 border-gray-200'}`}>SHOW ALL</button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {filteredCards.map((card) => (
              <div 
                key={card.id} 
                onClick={() => handleEditCard(card)}
                className={`group relative aspect-square rounded-2xl border-2 transition-all cursor-pointer overflow-hidden ${editingCardId === card.id ? 'border-indigo-600 ring-4 ring-indigo-50 shadow-lg' : 'border-gray-50 hover:border-gray-200'}`}
              >
                {card.mediaType === 'video' ? <video src={card.mediaUri} className="w-full h-full object-cover opacity-90" muted /> : <img src={card.mediaUri} className="w-full h-full object-cover opacity-90" />}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-[10px] font-black uppercase tracking-widest truncate">{card.label}</span>
                  <p className="text-white/60 text-[9px] truncate">{card.originalDescription || 'No description'}</p>
                </div>

                <div className="absolute top-3 left-3 flex gap-1">
                  {card.mediaType === 'video' && <div className="bg-black/60 backdrop-blur-md p-1.5 rounded-lg"><Film className="w-3 h-3 text-white fill-white" /></div>}
                  {card.mediaType === 'burst' && <div className="bg-yellow-400 p-1.5 rounded-lg shadow-lg"><Zap className="w-3 h-3 text-white fill-white" /></div>}
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); setCards(cards.filter(c => c.id !== card.id)); }}
                  className="absolute top-3 right-3 p-1.5 bg-white/20 hover:bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm shadow-xl"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            
            {filteredCards.length === 0 && (
              <div className="col-span-full py-32 text-center text-gray-200 space-y-4">
                <ImageIcon className="w-16 h-16 mx-auto opacity-10" />
                <p className="text-xs font-black uppercase tracking-widest opacity-30">No stimuli in this target yet</p>
                <button 
                  onClick={handleGenerate} 
                  className="bg-indigo-50 text-indigo-600 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                >
                  Quick Generate for "{activeTarget}"
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};