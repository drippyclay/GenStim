import React, { useState, useRef } from 'react';
import { Deck, StimulusCard } from '../types';
import { generateStimulusVariations, generateVideoFromDescription, ImageStyle } from '../services/gemini';
import { Trash2, Plus, Save, ArrowLeft, Loader2, Image as ImageIcon, RefreshCw, X, Edit2, Check, Video, Film, PlayCircle, Upload, Zap, Layers } from 'lucide-react';
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

  const resetEditor = () => {
    setEditingCardId(null);
    setCurrentLabel('');
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      setCurrentMediaUri(dataUri);
      setCurrentMediaType(file.type.includes('video') || file.type.includes('gif') ? 'video' : 'image');
      if (!currentLabel) setCurrentLabel(file.name.split('.')[0]);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!currentLabel.trim()) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedItems([]);
    setSelectedIndices(new Set());
    
    try {
      if (creationMode === 'moving') {
        const videoUri = await generateVideoFromDescription(currentLabel);
        if (videoUri) {
          setGeneratedItems([{ mediaUri: videoUri, description: currentLabel, mediaType: 'video' }]);
          setSelectedIndices(new Set([0]));
        } else {
          throw new Error("Video generation failed.");
        }
      } else if (creationMode === 'burst') {
        const items = await generateStimulusVariations(currentLabel, imageStyle, 'action');
        if (items.length > 0) {
          const uris = items.map(it => it.imageData);
          setGeneratedItems([{ 
            mediaUri: uris[0], 
            burstUris: uris, 
            description: currentLabel, 
            mediaType: 'burst' 
          }]);
          setSelectedIndices(new Set([0]));
        }
      } else {
        const items = await generateStimulusVariations(currentLabel, imageStyle, 'generalization');
        setGeneratedItems(items.map(it => ({ ...it, mediaUri: it.imageData, mediaType: 'image' })));
        // Auto-select all variations by default for faster program building
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
    if (!currentLabel.trim()) return;

    if (editingCardId) {
      // Editing single card
      let mediaToSave = currentMediaUri;
      let typeToSave = currentMediaType;
      let burstToSave = currentBurstUris;
      let descriptionToSave = currentDescription;

      if (generatedItems.length > 0) {
        const selectedIdx = Array.from(selectedIndices)[0];
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
        label: currentLabel,
        mediaUri: mediaToSave!,
        mediaType: typeToSave!,
        burstUris: burstToSave,
        originalDescription: descriptionToSave || c.label,
      } : c));
    } else {
      // Adding new cards (supports multiple)
      const itemsToAdd: GeneratedItem[] = [];
      
      if (generatedItems.length > 0) {
        generatedItems.forEach((item, i) => {
          if (selectedIndices.has(i)) itemsToAdd.push(item);
        });
      } else if (currentMediaUri) {
        itemsToAdd.push({ 
          mediaUri: currentMediaUri, 
          description: currentLabel, 
          mediaType: currentMediaType, 
          burstUris: currentBurstUris 
        });
      }

      if (itemsToAdd.length === 0) return;

      const newCards = itemsToAdd.map(item => ({
        id: uuidv4(),
        label: currentLabel,
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

  const themeColor = deck.color || '#6366f1';
  const selectedCount = selectedIndices.size;

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} disabled={isSaving} className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-5 h-5 mr-2" />
          Dashboard
        </button>
        <button 
          onClick={() => { setIsSaving(true); onSave({...deck, name: deckName, cards, updatedAt: Date.now()}); setIsSaving(false); }}
          className="flex items-center text-white px-6 py-2 rounded-lg font-medium shadow-sm transition-opacity disabled:opacity-50"
          style={{ backgroundColor: themeColor }}
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Program
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <input
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className="w-full text-xl font-bold bg-white border-b border-gray-100 focus:outline-none py-1"
          style={{ color: themeColor }}
          placeholder="Program Name"
        />
      </div>

      <div className="grid lg:grid-cols-12 gap-6 h-[700px]">
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingCardId ? 'Edit Stimulus' : 'Create Stimulus'}
              </h2>
              <div className="flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,.gif" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                  title="Upload GIF or Photo"
                >
                  <Upload className="w-4 h-4" />
                </button>
                {editingCardId && <button onClick={resetEditor} className="p-2 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
              </div>
            </div>
            
            <div className="space-y-4 flex-1 overflow-y-auto pr-1">
              <input
                type="text"
                value={currentLabel}
                onChange={(e) => setCurrentLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2 focus:ring-1 outline-none"
                placeholder="Target Label (e.g., Doctor)"
              />

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-3">
                <div className="flex gap-1 bg-white p-1 rounded-lg border border-gray-200">
                   <button onClick={() => setCreationMode('static')} className={`flex-1 flex flex-col items-center py-2 rounded-md text-[10px] font-bold ${creationMode === 'static' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                     <ImageIcon className="w-4 h-4 mb-1" /> STATIC
                   </button>
                   <button onClick={() => setCreationMode('burst')} className={`flex-1 flex flex-col items-center py-2 rounded-md text-[10px] font-bold ${creationMode === 'burst' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                     <Zap className="w-4 h-4 mb-1" /> ACTION GIF
                   </button>
                   <button onClick={() => setCreationMode('moving')} className={`flex-1 flex flex-col items-center py-2 rounded-md text-[10px] font-bold ${creationMode === 'moving' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>
                     <Film className="w-4 h-4 mb-1" /> AI VIDEO
                   </button>
                </div>
                
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !currentLabel}
                  className="w-full text-white py-2.5 rounded-lg font-bold text-sm shadow-sm disabled:opacity-50"
                  style={{ backgroundColor: themeColor }}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Generate Variations`}
                </button>
              </div>

              <div className="aspect-square bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden">
                {isGenerating ? (
                  <div className="text-center p-4">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-600" />
                    <p className="text-xs text-gray-500 font-medium">Providing diverse variations...</p>
                  </div>
                ) : generatedItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 p-2 h-full w-full overflow-y-auto">
                    {generatedItems.map((item, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => toggleSelection(idx)}
                        className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${selectedIndices.has(idx) ? 'border-indigo-600 bg-indigo-50' : 'border-transparent'}`}
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
                   <div className="relative w-full h-full group">
                     {currentMediaType === 'video' ? <video src={currentMediaUri} autoPlay loop muted className="w-full h-full object-contain" /> : <img src={currentMediaUri} className="w-full h-full object-contain" />}
                     <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-[10px] font-bold uppercase">Manual Upload</div>
                   </div>
                ) : (
                  <div className="text-center p-6 space-y-2">
                    <Layers className="w-10 h-10 text-gray-200 mx-auto" />
                    <p className="text-xs text-gray-400">Variations of your label will appear here. Multi-select is enabled!</p>
                  </div>
                )}
              </div>
              {error && <p className="text-red-500 text-[10px] font-bold bg-red-50 p-2 rounded text-center">{error}</p>}
            </div>

            <button
              onClick={handleSaveCard}
              disabled={!currentLabel || (generatedItems.length === 0 && !currentMediaUri) || (generatedItems.length > 0 && selectedCount === 0)}
              className="mt-4 w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
            >
              {editingCardId ? 'Update Stimulus' : `Add ${selectedCount > 1 ? selectedCount : ''} Stimuli to Program`}
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col overflow-hidden">
          <h2 className="font-bold text-gray-900 mb-4 flex items-center">
            Program Stimuli
            <span className="ml-2 bg-gray-100 text-gray-500 text-[10px] px-2 py-1 rounded-full">{cards.length}</span>
          </h2>
          <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-2 custom-scrollbar">
            {cards.map((card) => (
              <div 
                key={card.id} 
                onClick={() => handleEditCard(card)}
                className={`relative aspect-square rounded-xl border group cursor-pointer overflow-hidden ${editingCardId === card.id ? 'border-indigo-600 ring-2 ring-indigo-100' : 'border-gray-100 hover:border-gray-300'}`}
              >
                {card.mediaType === 'video' ? <video src={card.mediaUri} className="w-full h-full object-cover opacity-80" muted /> : <img src={card.mediaUri} className="w-full h-full object-cover opacity-80" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-2">
                  <span className="text-white text-[10px] font-bold truncate">{card.label}</span>
                </div>
                <div className="absolute top-1 left-1">
                  {card.mediaType === 'video' && <Film className="w-3 h-3 text-white fill-white" />}
                  {card.mediaType === 'burst' && <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setCards(cards.filter(c => c.id !== card.id)); }}
                  className="absolute top-1 right-1 p-1 bg-white/20 hover:bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {cards.length === 0 && (
              <div className="col-span-3 py-20 text-center text-gray-300">
                <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No stimuli added yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};