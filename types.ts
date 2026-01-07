export interface StimulusCard {
  id: string;
  label: string; // The word to tact (e.g., "Apple")
  mediaUri: string; // Primary media (or first frame of burst)
  mediaType: 'image' | 'video' | 'burst';
  burstUris?: string[]; // Collection of images for burst animation
  originalDescription?: string; // The prompt used to generate this
  createdAt: number;
}

// Backward compatibility helper
export function normalizeCard(card: any): StimulusCard {
  return {
    ...card,
    mediaUri: card.mediaUri || card.imageData || '',
    mediaType: card.mediaType || 'image',
    burstUris: card.burstUris || [],
  };
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  cards: StimulusCard[];
  targetLabels?: string[]; // The list of targets (e.g., ["Eating", "Drinking"])
  updatedAt: number;
  color?: string; // Hex code
  cloudSyncId?: string;
  lastSyncedAt?: number;
}

export interface SessionResult {
  deckId: string;
  date: number;
  totalCards: number;
  correctCount: number;
  incorrectCount: number;
  durationSeconds: number;
}

export type AppView = 'DASHBOARD' | 'EDITOR' | 'SESSION';

export interface ViewState {
  currentView: AppView;
  activeDeckId: string | null;
}