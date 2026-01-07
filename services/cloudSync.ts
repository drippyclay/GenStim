import { Deck } from '../types';

// Using npoint.io for keyless JSON storage. 
// Note: The root endpoint is used for creation and updating.
const BASE_URL = 'https://api.npoint.io';

export const cloudSyncService = {
  /**
   * Pushes a new deck to the cloud. Returns a cloudSyncId.
   */
  async uploadDeck(deck: Deck): Promise<string> {
    // Strip images to keep payload small. 
    // We regenerate them on the other end using the AI descriptions to keep the sync light.
    const skeletonDeck = {
      ...deck,
      cards: deck.cards.map(c => ({
        ...c,
        // Fix: Use mediaUri instead of imageData to strip the data correctly
        mediaUri: '' 
      }))
    };

    try {
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(skeletonDeck),
      });

      if (!response.ok) {
        throw new Error(`Cloud storage failed: ${response.status}`);
      }
      
      const data = await response.json();
      // npoint returns the id in the response body as { "id": "..." }
      if (!data || !data.id) {
        throw new Error("Invalid response from cloud storage: missing ID");
      }
      return data.id;
    } catch (error) {
      console.error('Failed to upload deck:', error);
      throw error;
    }
  },

  /**
   * Updates an existing cloud deck
   */
  async updateDeck(id: string, deck: Deck): Promise<void> {
    const skeletonDeck = {
      ...deck,
      cards: deck.cards.map(c => ({
        ...c,
        // Fix: Use mediaUri instead of imageData to strip the data correctly
        mediaUri: ''
      }))
    };

    try {
      const response = await fetch(`${BASE_URL}/${id}`, {
        method: 'POST', // npoint uses POST to the ID URL to update existing bins
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(skeletonDeck),
      });

      if (!response.ok) {
        throw new Error(`Cloud update failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to update cloud deck:', error);
      throw error;
    }
  },

  /**
   * Fetches a deck from the cloud by its sync ID
   */
  async downloadDeck(id: string): Promise<Deck> {
    try {
      const response = await fetch(`${BASE_URL}/${id}`);
      if (!response.ok) {
        throw new Error('Program not found. Please check the code.');
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to download deck:', error);
      throw error;
    }
  }
};