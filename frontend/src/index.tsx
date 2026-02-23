// ================================================================
// INDEX.TSX — Application Entry Point
// ================================================================
// PURPOSE: The FIRST file that runs when the app starts.
//
// It wraps the entire app in "providers" (like layers of an onion):
//   BrowserRouter  → URL routing (react-router-dom)
//   ThemeProvider   → MUI Material Design theme (colors, fonts)
//   AuthProvider    → Login/logout state management
//   SocketProvider  → Real-time WebSocket connection
//   Toaster         → Toast notifications (success/error popups)
//
// RENDERS: <App /> component which contains all the routes
// ================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import App from './App';                               // The main app component with all routes (see App.tsx)
import { AuthProvider } from './contexts/AuthContext';  // Provides login/logout state to entire app
import { SocketProvider } from './contexts/SocketContext'; // Provides real-time WebSocket connection

// ─── THEME SETUP ───────────────────────────────────────────────────
// This creates the visual "look" of the app (colors, fonts, button styles)
// Every MUI component (Button, Card, etc.) will use these settings
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',   // Blue — used for main buttons, links, app bar
    },
    secondary: {
      main: '#dc004e',   // Pink/Red — used for secondary actions, alerts
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',  // Prevents ALL CAPS on buttons
        },
      },
    },
  },
});

// ─── ERROR BOUNDARY ────────────────────────────────────────────────
// This is a "safety net". If any component crashes (throws an error),
// instead of the WHOLE APP going white/blank, this shows a friendly
// error message: "Something went wrong. Please refresh."
//
// Think of it like a try/catch but for React components.
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },       // children = the entire app
  { hasError: boolean; error?: Error }  // state = did something crash?
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };   // Start with no errors
  }

  // React calls this when a child component throws an error
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };   // Switch to error state
  }

  // Log the error details (useful for debugging)
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>Please refresh the page or contact support if the problem persists.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── MOUNT THE APP ─────────────────────────────────────────────────
// Find the <div id="root"> in public/index.html and put our app inside it
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// ─── RENDER THE APP ────────────────────────────────────────────────
// The providers are nested like layers of an onion:
//   Outermost → Innermost means: loaded first → loaded last
//   Each provider gives its "power" to everything inside it.
//
//   StrictMode     → Extra React warnings in development only
//   ErrorBoundary  → Catches crashes, shows friendly error page
//   BrowserRouter  → Enables URL routing (/login, /admin, /sheets/1)
//   ThemeProvider  → Applies colors, fonts, styles to all MUI components
//   CssBaseline    → Resets browser default CSS (margins, fonts)
//   AuthProvider   → Makes user/login/logout available everywhere
//   SocketProvider → Makes real-time WebSocket available everywhere
//   App            → The actual app with all pages and routes
//   Toaster        → Shows success/error popup messages (top-right corner)
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AuthProvider>
            <SocketProvider>
              <App />
              <Toaster
                position="top-right"       // Popups appear in top-right corner
                toastOptions={{
                  duration: 4000,           // Each popup stays for 4 seconds
                  style: {
                    background: '#333',     // Dark background
                    color: '#fff',          // White text
                  },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);