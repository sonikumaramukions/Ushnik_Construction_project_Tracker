// ================================================================
// SOCKET CONTEXT (contexts/SocketContext.tsx)
// ================================================================
// PURPOSE: Manages the WebSocket (Socket.io) connection for real-time features.
//
// WHAT IS A WEBSOCKET?
//   Normal HTTP: Browser asks → Server answers (one-time)
//   WebSocket: Browser and Server stay connected permanently
//   Server can PUSH updates instantly (e.g., "cell B3 was just edited")
//
// THIS CONTEXT PROVIDES:
//   socket        — The Socket.io connection object
//   isConnected   — Whether we're currently connected
//   joinRoom()    — Subscribe to updates for a project/sheet
//   leaveRoom()   — Unsubscribe from updates
//
// LIFECYCLE:
//   1. User logs in → Socket connects with JWT token
//   2. User opens a sheet → joinRoom('sheet_123')
//   3. Another user edits a cell → server pushes update → UI updates
//   4. User logs out → Socket disconnects
//
// USED BY: SheetViewPage (live cell updates), DashboardLayout (notifications)
// ================================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';  // Socket.io client library for real-time communication
import { useAuth } from './AuthContext';          // Get user's login token for socket authentication
import { SheetUpdateEvent, CellUpdateEvent } from '../types';  // TypeScript types

// ─── SOCKET CONTEXT TYPE ───
// This defines what useSocket() gives you when you call it.
// Every function here is available to any component in the app.
interface SocketContextType {
  socket: Socket | null;        // The raw socket connection (null if not connected)
  isConnected: boolean;         // Are we currently connected to the server?
  
  // ROOM MANAGEMENT: Join/leave rooms to get updates for specific projects/sheets
  joinProject: (projectId: string) => void;   // Subscribe to project updates
  leaveProject: (projectId: string) => void;  // Unsubscribe from project updates
  joinSheet: (sheetId: string) => void;       // Subscribe to sheet cell updates
  leaveSheet: (sheetId: string) => void;      // Unsubscribe from sheet updates
  
  // SENDING UPDATES: Tell the server about changes this user made
  emitSheetUpdate: (data: SheetUpdateEvent) => void;  // "I changed the sheet structure"
  emitCellUpdate: (data: CellUpdateEvent) => void;    // "I edited cell B3"
  
  // LISTENING FOR UPDATES: Get notified when OTHER users make changes
  onSheetUpdate: (callback: (data: SheetUpdateEvent) => void) => () => void;   // Sheet structure changed
  onCellUpdate: (callback: (data: CellUpdateEvent) => void) => () => void;     // A cell was edited
  onSheetReceived: (callback: (data: any) => void) => () => void;              // A sheet was pushed to you
  onSheetSyncReceived: (callback: (data: any) => void) => () => void;          // Sheet data was synced
  onBulkCellsUpdated: (callback: (data: any) => void) => () => void;           // Multiple cells updated at once
}

// ─── CREATE THE CONTEXT ───
const SocketContext = createContext<SocketContextType | undefined>(undefined);

// ─── useSocket() HOOK ───
// Any component can call this to get the socket connection and its methods.
// Example:
//   const { joinSheet, onCellUpdate, isConnected } = useSocket();
//   joinSheet('sheet_123');  // Start listening for updates on sheet 123
export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);  // The socket connection
  const [isConnected, setIsConnected] = useState(false);       // Connection status
  const { user, token } = useAuth();  // Get user info and JWT token

  // ─── CONNECT/DISCONNECT WHEN USER LOGS IN/OUT ───
  // This useEffect runs whenever user or token changes.
  // When user logs in → create socket connection
  // When user logs out → destroy socket connection
  useEffect(() => {
    if (user && token) {
      // ─── CREATE NEW SOCKET CONNECTION ───
      // Connect to the backend server with the JWT token for authentication.
      // The server reads the token to know WHO is connecting.
      // Derive socket URL from API URL — strip the /api suffix
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
      const socketUrl = apiUrl.replace(/\/api\/?$/, '');
      const newSocket = io(socketUrl, {
        auth: {
          token,  // Send JWT token so server knows who we are
        },
        transports: ['websocket', 'polling'],  // Try WebSocket first, fall back to HTTP polling
        reconnection: true,           // Auto-reconnect if connection drops
        reconnectionAttempts: 10,     // Try up to 10 times
        reconnectionDelay: 1000,      // Start with 1-second delay between retries
        reconnectionDelayMax: 10000,  // Max 10 seconds between retries
        timeout: 20000,               // 20-second connection timeout
        forceNew: false,              // Reuse existing connection if possible
      });

      // ─── CONNECTION EVENT HANDLERS ───
      // These fire when the socket connects, disconnects, or has an error.
      
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);  // Log the unique socket ID
        setIsConnected(true);  // Update state: we're connected!
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);  // Log why we disconnected
        setIsConnected(false);  // Update state: we're not connected
        // If the SERVER kicked us out, try to reconnect
        if (reason === 'io server disconnect') {
          newSocket.connect();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.warn('Socket connection error:', error.message);
        setIsConnected(false);
      });

      // Prevent Node.js EventEmitter memory leak warnings (not a real leak)
      try { (newSocket as any).setMaxListeners?.(20); } catch {}

      setSocket(newSocket);

      return () => {
        newSocket.removeAllListeners();
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    } else {
      // Clean up socket when user logs out
      if (socket) {
        socket.removeAllListeners();
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [user, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── ROOM MANAGEMENT FUNCTIONS ───
  // "Rooms" are like chat rooms but for data. When you join a sheet room,
  // you get all updates for that sheet. When you leave, you stop getting them.
  //
  // HOW ROOMS WORK:
  //   1. User opens sheet #5 → joinSheet('5')
  //   2. Server adds this socket to room "sheet_5"
  //   3. When ANY user edits sheet #5, server broadcasts to room "sheet_5"
  //   4. All users in the room get the update instantly
  //   5. User closes sheet #5 → leaveSheet('5')

  const joinProject = (projectId: string) => {
    if (socket && isConnected) {
      socket.emit('join_project', projectId);  // Tell server: "I want project updates"
      console.log('Joined project:', projectId);
    }
  };

  const leaveProject = (projectId: string) => {
    if (socket && isConnected) {
      socket.emit('leave_project', projectId);  // Tell server: "Stop sending project updates"
      console.log('Left project:', projectId);
    }
  };

  const joinSheet = (sheetId: string) => {
    if (socket && isConnected) {
      socket.emit('join_sheet', sheetId);  // Tell server: "I want cell updates for this sheet"
      console.log('Joined sheet:', sheetId);
    }
  };

  const leaveSheet = (sheetId: string) => {
    if (socket && isConnected) {
      socket.emit('leave_sheet', sheetId);  // Tell server: "Stop sending cell updates"
      console.log('Left sheet:', sheetId);
    }
  };

  // ─── SENDING UPDATES TO SERVER ───
  // These functions send data FROM this user TO the server,
  // which then broadcasts it to all other users in the same room.

  // Tell server: "I changed the sheet structure" (e.g., added a column)
  const emitSheetUpdate = (data: SheetUpdateEvent) => {
    if (socket && isConnected) {
      socket.emit('sheet_update', data);
    }
  };

  // Tell server: "I edited a cell" (e.g., changed cell B3 to "500")
  const emitCellUpdate = (data: CellUpdateEvent) => {
    if (socket && isConnected) {
      socket.emit('cell_update', data);
    }
  };

  // ─── LISTENING FOR UPDATES FROM OTHER USERS ───
  // These functions let components register callbacks.
  // When an event arrives from the server, the callback runs.
  // They return a cleanup function that REMOVES the listener (prevents memory leaks).
  //
  // Example usage in a component:
  //   useEffect(() => {
  //     const cleanup = onCellUpdate((data) => {
  //       console.log('Cell was updated by another user!', data);
  //       updateMyUI(data);  // Refresh the cell in the UI
  //     });
  //     return cleanup;  // Remove listener when component unmounts
  //   }, []);

  // Listen for sheet structure changes (columns added/removed, etc.)
  const onSheetUpdate = (callback: (data: SheetUpdateEvent) => void) => {
    if (socket) {
      socket.on('sheet_updated', callback);
      return () => { socket.off('sheet_updated', callback); };  // Cleanup function
    }
    return () => { };
  };

  // Listen for cell value changes (another user edited a cell)
  const onCellUpdate = (callback: (data: CellUpdateEvent) => void) => {
    if (socket) {
      socket.on('cell_updated', callback);
      return () => { socket.off('cell_updated', callback); };  // Cleanup function
    }
    return () => { };
  };

  // Listen for "sheet was pushed to you" (admin assigned you a sheet)
  const onSheetReceived = (callback: (data: any) => void) => {
    if (socket) {
      socket.on('sheet_received', callback);
      console.log('Listening for sheet_received events');
      return () => { socket.off('sheet_received', callback); };
    }
    return () => { };
  };

  // Listen for sheet data sync (server sent fresh data)
  const onSheetSyncReceived = (callback: (data: any) => void) => {
    if (socket) {
      socket.on('sheet_sync_received', callback);
      console.log('Listening for sheet_sync_received events');
      return () => { socket.off('sheet_sync_received', callback); };
    }
    return () => { };
  };

  // Listen for bulk cell updates (multiple cells changed at once)
  const onBulkCellsUpdated = (callback: (data: any) => void) => {
    if (socket) {
      socket.on('bulk_cells_updated', callback);
      return () => { socket.off('bulk_cells_updated', callback); };
    }
    return () => { };
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    joinProject,
    leaveProject,
    joinSheet,
    leaveSheet,
    emitSheetUpdate,
    emitCellUpdate,
    onSheetUpdate,
    onCellUpdate,
    onSheetReceived,
    onSheetSyncReceived,
    onBulkCellsUpdated,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};