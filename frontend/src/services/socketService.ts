// ================================================================
// SOCKET SERVICE (services/socketService.ts)
// ================================================================
// PURPOSE: Manages the WebSocket (Socket.io) client connection.
//
// WHAT IT DOES:
//   connect(token)      — Connect to server with JWT authentication
//   disconnect()        — Close the connection
//   emit(event, data)   — Send a message to the server
//   onCellUpdated(cb)   — Listen for cell changes from other users
//   onSheetUpdated(cb)  — Listen for sheet structure changes
//   sendBulkUpdate(data) — Send multiple cell updates at once
//   requestSheetSync()  — Request fresh data from server
//
// HOW REAL-TIME WORKS:
//   1. User A edits cell B3
//   2. Frontend sends 'cell:update' event via socket
//   3. Server broadcasts to all users in the same sheet room
//   4. User B's UI updates instantly without refreshing
//
// USED BY: contexts/SocketContext.tsx, sheet editor pages
// ================================================================

import { io, Socket } from 'socket.io-client';

// ─── SOCKET SERVICE CLASS ───
// This is the LOW-LEVEL WebSocket manager.
// It wraps the Socket.io library and provides easy methods for:
//   - Connecting/disconnecting
//   - Joining/leaving sheet "rooms"
//   - Sending and receiving real-time updates
//
// Think of it as a WALKIE-TALKIE:
//   emit()  = pressing the talk button (sending a message)
//   on()    = listening for incoming messages
//   room    = a channel that only people viewing the same sheet can hear
//
// NOTE: SocketContext.tsx (a React context) wraps this service to make
//       it available throughout the React app. Most components use
//       SocketContext, not this class directly.
class SocketService {
  private socket: Socket | null = null;      // The actual Socket.io connection
  private isConnected: boolean = false;       // Are we connected right now?

  // ─── CONNECT TO SERVER ───
  // Called when a user logs in. The JWT token proves who they are.
  connect(token: string): void {
    // Don't connect again if already connected
    if (this.socket && this.isConnected) {
      console.log('Socket already connected');
      return;
    }

    // Server URL (defaults to localhost:5001 during development)
    const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

    // Create the WebSocket connection
    this.socket = io(SOCKET_URL, {
      auth: {
        token    // Send our JWT token so the server knows who we are
      },
      reconnection: true,           // Auto-reconnect if connection drops
      reconnectionDelay: 1000,      // Wait 1 second before first retry
      reconnectionDelayMax: 5000,   // Max wait between retries: 5 seconds
      reconnectionAttempts: 5       // Give up after 5 failed attempts
    });

    // ─── CONNECTION EVENT HANDLERS ───

    // Successfully connected to server
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.isConnected = true;
    });

    // Lost connection (server went down, network issue, etc.)
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.isConnected = false;
    });

    // Failed to connect (bad token, server unreachable, etc.)
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.isConnected = false;
    });
  }

  // ─── DISCONNECT FROM SERVER ───
  // Called when a user logs out.
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('Socket disconnected');
    }
  }

  // ─── ROOM MANAGEMENT ───
  // "Rooms" are like chat channels. When you open a sheet, you join its room.
  // Only users in the same room receive each other's real-time updates.

  // Join a sheet's room (called when opening a sheet for editing)
  joinSheet(sheetId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join-sheet', { sheetId });
      console.log('Joined sheet room:', sheetId);
    }
  }

  // Leave a sheet's room (called when navigating away from a sheet)
  leaveSheet(sheetId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave-sheet', { sheetId });
      console.log('Left sheet room:', sheetId);
    }
  }

  // ─── CELL UPDATES ───
  // When I edit a cell, tell everyone else in the room.

  // Send: "I just changed cell B3 to '500'"
  emitCellUpdate(data: {
    sheetId: string;
    cellId: string;
    value: string;
    userId: string;
    userName: string;
  }): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('cell-update', data);
      console.log('Emitted cell update:', data);
    }
  }

  // Listen: "Someone else changed a cell" → update my display
  onCellUpdate(callback: (data: {
    sheetId: string;
    cellId: string;
    value: string;
    userId: string;
    userName: string;
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('cell-updated', callback);
    }
  }

  // Stop listening for cell updates (cleanup when leaving the sheet)
  offCellUpdate(): void {
    if (this.socket) {
      this.socket.off('cell-updated');
    }
  }

  // ─── FORMULA UPDATES ───
  // Formulas (e.g., =SUM(B1:B5)) are calculated on the server.
  // When a formula is updated, the calculated result is broadcast.

  // Send: "I changed the formula in cell C10"
  emitFormulaUpdate(data: {
    sheetId: string;
    cellId: string;
    formula: string;
    userId: string;
  }): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('formula-update', data);
      console.log('Emitted formula update:', data);
    }
  }

  // Listen: "A formula was recalculated" → update display with new value
  onFormulaUpdate(callback: (data: {
    sheetId: string;
    cellId: string;
    formula: string;
    calculatedValue: any;   // The computed result
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('formula-updated', callback);
    }
  }

  // Stop listening for formula updates
  offFormulaUpdate(): void {
    if (this.socket) {
      this.socket.off('formula-updated');
    }
  }

  // ─── PERMISSION UPDATES ───
  // When an admin changes who can edit a cell, broadcast to all users.

  // Send: "I changed permissions for cell B3"
  emitPermissionUpdate(data: {
    sheetId: string;
    cellId: string;
    permissions: any;
    userId: string;
  }): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('permission-update', data);
      console.log('Emitted permission update:', data);
    }
  }

  // Listen: "Cell permissions changed" → update my edit/view abilities
  onPermissionUpdate(callback: (data: {
    sheetId: string;
    cellId: string;
    permissions: any;
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('permission-updated', callback);
    }
  }

  // Stop listening for permission updates
  offPermissionUpdate(): void {
    if (this.socket) {
      this.socket.off('permission-updated');
    }
  }

  // ─── SHEET PUSH NOTIFICATIONS ───
  // When admin "pushes" a sheet to users/roles, notify them in real-time.

  // Send: "I just pushed a sheet to junior engineers"
  emitSheetPushed(data: {
    sheetId: string;
    userIds?: string[];     // Specific users to notify
    roles?: string[];       // Or notify all users with these roles
  }): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('sheet-pushed', data);
      console.log('Emitted sheet pushed:', data);
    }
  }

  // Listen: "A sheet was pushed to you!" → show notification
  onSheetPushed(callback: (data: {
    sheetId: string;
    sheetName: string;
    pushedBy: string;
    timestamp: string;
  }) => void): void {
    if (this.socket) {
      this.socket.on('sheet-pushed-notification', callback);
    }
  }

  // Stop listening for sheet push notifications
  offSheetPushed(): void {
    if (this.socket) {
      this.socket.off('sheet-pushed-notification');
    }
  }

  // ─── GENERIC EVENT METHODS ───
  // These are "catch-all" methods for any event name.
  // Used when you need a custom event that doesn't have a dedicated method above.

  // Listen for any named event
  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  // Stop listening for any named event
  off(event: string): void {
    if (this.socket) {
      this.socket.off(event);
    }
  }

  // Send any named event with data
  emit(event: string, data: any): void {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    }
  }

  // Read-only property to check if we're connected
  get connected(): boolean {
    return this.isConnected;
  }
}

// ─── SINGLETON INSTANCE ───
// Only ONE SocketService exists for the entire app.
// Everyone imports this same instance, so they all share the same connection.
const socketService = new SocketService();
export default socketService;
