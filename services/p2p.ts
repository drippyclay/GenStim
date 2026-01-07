import Peer, { DataConnection } from 'peerjs';
import { dbService } from './db';
import { Deck } from '../types';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

type P2PMessage = 
  | { type: 'SYNC_DECK'; deck: Deck }
  | { type: 'SYNC_DELETE'; id: string }
  | { type: 'HANDSHAKE'; timestamp: number };

class P2PService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private statusListeners: Set<(status: ConnectionStatus, id?: string) => void> = new Set();
  private myId: string | null = null;
  private unsubDb: (() => void) | null = null;

  constructor() {
    // Setup listener for local DB changes to broadcast
    this.unsubDb = dbService.subscribe(async (event) => {
      if (this.conn && this.conn.open) {
        // Only broadcast if the change didn't come from the sync itself (avoid loops)
        if (!event.payload.fromSync) {
          if (event.type === 'DECK_UPDATE') {
            this.send({ type: 'SYNC_DECK', deck: event.payload.deck });
          } else if (event.type === 'DECK_DELETE') {
            this.send({ type: 'SYNC_DELETE', id: event.payload.id });
          }
        }
      }
    });
  }

  // Generate an ID for Hosting
  async host(): Promise<string> {
    this.cleanup();
    this.notifyStatus('CONNECTING');

    return new Promise((resolve, reject) => {
      // Use PeerJS cloud server (free, no key needed usually)
      const peer = new Peer();
      
      peer.on('open', (id) => {
        this.myId = id;
        this.peer = peer;
        console.log('Hosting on ID:', id);
        this.notifyStatus('DISCONNECTED', id); // Ready to wait for connection
        resolve(id);
      });

      peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  // Join a Host ID
  async join(hostId: string): Promise<void> {
    this.cleanup();
    this.notifyStatus('CONNECTING');

    const peer = new Peer();
    
    peer.on('open', (id) => {
      this.myId = id;
      this.peer = peer;
      const conn = peer.connect(hostId, { reliable: true });
      this.handleConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      this.notifyStatus('DISCONNECTED');
    });
  }

  private handleConnection(conn: DataConnection) {
    this.conn = conn;

    conn.on('open', () => {
      console.log('Connected to peer');
      this.notifyStatus('CONNECTED', this.myId || undefined);
      // Send handshake
      this.send({ type: 'HANDSHAKE', timestamp: Date.now() });
      
      // OPTIONAL: Initial Sync (Push all my decks to them? Or wait for request?)
      // For simplicity in this version, we sync on change. 
      // A full sync on connect could be heavy with images, so we skip auto-full-sync for now 
      // or we could add a "Sync All" button.
    });

    conn.on('data', async (data: any) => {
      console.log('Received P2P data:', data);
      await this.handleMessage(data as P2PMessage);
    });

    conn.on('close', () => {
      console.log('Connection closed');
      this.notifyStatus('DISCONNECTED');
      this.conn = null;
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.notifyStatus('DISCONNECTED');
    });
  }

  private async handleMessage(msg: P2PMessage) {
    if (msg.type === 'SYNC_DECK') {
      // Save incoming deck, mark as fromSync=true to prevent echo
      await dbService.saveDeck(msg.deck, true);
    } else if (msg.type === 'SYNC_DELETE') {
      await dbService.deleteDeck(msg.id, true);
    }
  }

  private send(msg: P2PMessage) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  disconnect() {
    this.cleanup();
    this.notifyStatus('DISCONNECTED');
  }

  private cleanup() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  subscribeStatus(cb: (status: ConnectionStatus, id?: string) => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private notifyStatus(status: ConnectionStatus, id?: string) {
    this.statusListeners.forEach(cb => cb(status, id));
  }
}

export const p2pService = new P2PService();