import React, { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { DeckEditor } from './components/DeckEditor';
import { SessionRunner } from './components/SessionRunner';
import { Deck, ViewState } from './types';
import { dbService } from './services/db';
import { cloudSyncService } from './services/cloudSync';

const App: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>({
    currentView: 'DASHBOARD',
    activeDeckId: null,
  });
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);

  const handleEditDeck = async (deck: Deck) => {
    const freshDeck = await dbService.getDeck(deck.id);
    setActiveDeck(freshDeck || deck);
    setViewState({ currentView: 'EDITOR', activeDeckId: deck.id });
  };

  const handleRunDeck = async (deck: Deck) => {
    const freshDeck = await dbService.getDeck(deck.id);
    setActiveDeck(freshDeck || deck);
    setViewState({ currentView: 'SESSION', activeDeckId: deck.id });
  };

  const handleSaveDeck = async (updatedDeck: Deck) => {
    // If it's a cloud-linked deck, update the cloud version too
    if (updatedDeck.cloudSyncId) {
      try {
        await cloudSyncService.updateDeck(updatedDeck.cloudSyncId, updatedDeck);
        updatedDeck.lastSyncedAt = Date.now();
      } catch (e) {
        console.error("Cloud update failed during save", e);
      }
    }
    await dbService.saveDeck(updatedDeck);
    setActiveDeck(updatedDeck);
  };

  const handleBackToDashboard = () => {
    setViewState({ currentView: 'DASHBOARD', activeDeckId: null });
    setActiveDeck(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans">
      {viewState.currentView === 'DASHBOARD' && (
        <Dashboard onEditDeck={handleEditDeck} onRunDeck={handleRunDeck} />
      )}

      {viewState.currentView === 'EDITOR' && activeDeck && (
        <DeckEditor 
          deck={activeDeck} 
          onSave={handleSaveDeck} 
          onBack={handleBackToDashboard} 
        />
      )}

      {viewState.currentView === 'SESSION' && activeDeck && (
        <SessionRunner 
          deck={activeDeck} 
          onExit={handleBackToDashboard} 
        />
      )}
    </div>
  );
};

export default App;