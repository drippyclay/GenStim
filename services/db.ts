import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Deck, StimulusCard, SessionResult } from '../types';

interface StimuliDB extends DBSchema {
  decks: {
    key: string;
    value: Deck;
    indexes: { 'by-updated': number };
  };
  sessions: {
    key: number;
    value: SessionResult;
    indexes: { 'by-deck': string };
  };
}

let dbPromise: Promise<IDBPDatabase<StimuliDB>>;

// Subscription system for real-time updates
type ChangeListener = (data: { type: 'DECK_UPDATE' | 'DECK_DELETE', payload: any }) => void;
const listeners: Set<ChangeListener> = new Set();

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<StimuliDB>('stimuli-gen-db', 1, {
      upgrade(db) {
        const deckStore = db.createObjectStore('decks', { keyPath: 'id' });
        deckStore.createIndex('by-updated', 'updatedAt');
        
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'date' });
        sessionStore.createIndex('by-deck', 'deckId');
      },
    });
  }
  return dbPromise;
};

export const dbService = {
  // Subscribe to changes (from P2P or other tabs)
  subscribe(listener: ChangeListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async getAllDecks(): Promise<Deck[]> {
    const db = await getDB();
    return db.getAllFromIndex('decks', 'by-updated');
  },

  async getDeck(id: string): Promise<Deck | undefined> {
    const db = await getDB();
    return db.get('decks', id);
  },

  // Added 'fromSync' flag to prevent infinite loops when saving data received from P2P
  async saveDeck(deck: Deck, fromSync = false): Promise<void> {
    const db = await getDB();
    await db.put('decks', deck);
    
    // Notify subscribers (UI and P2P service)
    listeners.forEach(l => l({ 
      type: 'DECK_UPDATE', 
      payload: { deck, fromSync } 
    }));
  },

  async deleteDeck(id: string, fromSync = false): Promise<void> {
    const db = await getDB();
    await db.delete('decks', id);
    
    listeners.forEach(l => l({ 
      type: 'DECK_DELETE', 
      payload: { id, fromSync } 
    }));
  },

  async saveSession(session: SessionResult): Promise<void> {
    const db = await getDB();
    await db.put('sessions', session);
  },
  
  async getSessionsForDeck(deckId: string): Promise<SessionResult[]> {
    const db = await getDB();
    return db.getAllFromIndex('sessions', 'by-deck', deckId);
  },

  async getAllSessions(): Promise<SessionResult[]> {
    const db = await getDB();
    const sessions = await db.getAll('sessions');
    return sessions.sort((a, b) => b.date - a.date);
  }
};