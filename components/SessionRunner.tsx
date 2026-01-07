import React, { useState, useEffect } from 'react';
import { Deck, SessionResult, StimulusCard } from '../types';
import { Check, X, RotateCcw, Home, Eye, EyeOff, Zap } from 'lucide-react';
import { dbService } from '../services/db';

interface SessionRunnerProps {
  deck: Deck;
  onExit: () => void;
}

export const SessionRunner: React.FC<SessionRunnerProps> = ({ deck, onExit }) => {
  const [queue, setQueue] = useState(() => [...deck.cards].sort(() => Math.random() - 0.5));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [results, setResults] = useState<{ card: StimulusCard; correct: boolean }[]>([]);
  const [showLabel, setShowLabel] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  // Burst Animation State
  const [burstFrame, setBurstFrame] = useState(0);

  const currentCard = queue[currentIndex];

  useEffect(() => {
    let interval: any;
    if (currentCard?.mediaType === 'burst' && currentCard.burstUris && currentCard.burstUris.length > 0) {
      interval = setInterval(() => {
        setBurstFrame(f => (f + 1) % currentCard.burstUris!.length);
      }, 150); // Faster frame rate (150ms) for smoother "GIF" feel
    } else {
      setBurstFrame(0);
    }
    return () => clearInterval(interval);
  }, [currentCard]);

  const handleResponse = (correct: boolean) => {
    setResults(prev => [...prev, { card: currentCard, correct }]);
    if (correct) setCorrectCount(c => c + 1);
    else setIncorrectCount(c => c + 1);

    if (currentIndex < queue.length - 1) {
      setCurrentIndex(c => c + 1);
      setShowLabel(false);
      setBurstFrame(0);
    } else {
      setIsComplete(true);
      dbService.saveSession({
        deckId: deck.id,
        date: Date.now(),
        totalCards: deck.cards.length,
        correctCount: correct ? correctCount + 1 : correctCount,
        incorrectCount: correct ? incorrectCount : incorrectCount + 1,
        durationSeconds: 0, // Simplified
      });
    }
  };

  if (isComplete) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="bg-white p-10 rounded-3xl shadow-xl border border-gray-100 max-w-sm w-full">
           <h2 className="text-2xl font-bold mb-2">Well Done!</h2>
           <p className="text-gray-500 mb-8">Session complete for {deck.name}</p>
           <div className="flex justify-around mb-8">
             <div className="text-green-600 font-bold text-2xl">{correctCount}<div className="text-[10px] uppercase text-gray-400">Correct</div></div>
             <div className="text-red-500 font-bold text-2xl">{incorrectCount}<div className="text-[10px] uppercase text-gray-400">Incorrect</div></div>
           </div>
           <div className="space-y-3">
             <button onClick={() => { setQueue([...deck.cards].sort(() => Math.random() - 0.5)); setCurrentIndex(0); setCorrectCount(0); setIncorrectCount(0); setIsComplete(false); }} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center"><RotateCcw className="w-4 h-4 mr-2" /> Play Again</button>
             <button onClick={onExit} className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold flex items-center justify-center"><Home className="w-4 h-4 mr-2" /> Dashboard</button>
           </div>
        </div>
      </div>
    );
  }

  const activeUri = (currentCard?.mediaType === 'burst' && currentCard.burstUris) 
    ? currentCard.burstUris[burstFrame] 
    : currentCard?.mediaUri;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <span className="font-bold text-gray-900">{deck.name} <span className="text-gray-400 font-normal ml-2">{currentIndex + 1}/{queue.length}</span></span>
        <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-400" /></button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xl aspect-square bg-white rounded-3xl shadow-xl border border-gray-200 flex items-center justify-center relative group">
          {currentCard?.mediaType === 'video' ? (
            <video src={activeUri} autoPlay loop muted className="max-w-full max-h-full p-6 object-contain mix-blend-multiply" />
          ) : (
            <img src={activeUri} className="max-w-full max-h-full p-6 object-contain mix-blend-multiply transition-opacity duration-150" alt="stimulus" />
          )}

          {currentCard?.mediaType === 'burst' && (
            <div className="absolute top-4 left-4 bg-yellow-400 text-white p-1 rounded-full shadow-lg">
              <Zap className="w-4 h-4 fill-white" />
            </div>
          )}

          <button onClick={() => setShowLabel(!showLabel)} className="absolute bottom-4 right-4 p-3 bg-gray-900/10 hover:bg-gray-900/20 text-gray-600 rounded-full transition-all">
            {showLabel ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          
          {showLabel && <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-full font-bold shadow-2xl animate-in zoom-in duration-200">{currentCard.label}</div>}
        </div>

        <div className="flex gap-6 mt-10 w-full max-w-sm">
          <button onClick={() => handleResponse(false)} className="flex-1 bg-white border-2 border-red-50 text-red-500 py-6 rounded-2xl flex flex-col items-center justify-center hover:bg-red-50 transition-colors shadow-sm">
            <X className="w-8 h-8 mb-1" />
            <span className="font-bold">Incorrect</span>
          </button>
          <button onClick={() => handleResponse(true)} className="flex-1 bg-white border-2 border-green-50 text-green-500 py-6 rounded-2xl flex flex-col items-center justify-center hover:bg-green-50 transition-colors shadow-sm">
            <Check className="w-8 h-8 mb-1" />
            <span className="font-bold">Correct</span>
          </button>
        </div>
      </div>
    </div>
  );
};