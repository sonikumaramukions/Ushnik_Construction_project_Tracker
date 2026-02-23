// ================================================================
// THEME.TS — Material UI Theme Configuration
// ================================================================
// PURPOSE: Defines the visual style of the entire application.
//
// This sets up:
//   - Colors: Blue primary (#1565c0), Orange secondary (#e65100)
//   - Typography: System fonts, heading sizes
//   - Component overrides: Card, Button, Table styles
//   - Responsive breakpoints for mobile/tablet/desktop
//
// USED BY: index.tsx wraps everything in <ThemeProvider theme={theme}>
// ================================================================

import { createTheme } from '@mui/material/styles';  // MUI's theme creator

// ─── CREATE THE APP THEME ───
// This theme controls the look of EVERY MUI component in the app.
// Change a color here → it changes everywhere in the app automatically.
const theme = createTheme({
  // ─── COLOR PALETTE ───
  // These colors are used by MUI components:
  //   <Button color="primary"> uses primary.main (#1976d2 blue)
  //   <Chip color="success"> uses success.main (#4caf50 green)
  palette: {
    primary: {
      main: '#1976d2',       // Construction blue — main buttons, links, app bar
      light: '#42a5f5',      // Lighter blue — hover states
      dark: '#1565c0',       // Darker blue — active/pressed states
      contrastText: '#fff',  // White text on blue backgrounds
    },
    secondary: {
      main: '#ff6f00',       // Construction orange — secondary actions, highlights
      light: '#ffb74d',
      dark: '#e65100',
      contrastText: '#fff',
    },
    error: {
      main: '#f44336',       // Red — errors, delete buttons, rejected status
      light: '#ef5350',
      dark: '#c62828',
    },
    warning: {
      main: '#ffc107',       // Yellow — warnings, pending status
      light: '#ffecb3',
      dark: '#f57c00',
    },
    success: {
      main: '#4caf50',       // Green — success messages, approved status
      light: '#81c784',
      dark: '#388e3c',
    },
    info: {
      main: '#2196f3',       // Blue — info messages, help text
      light: '#64b5f6',
      dark: '#1976d2',
    },
    background: {
      default: '#f5f5f5',    // Light grey — page background color
      paper: '#ffffff',      // White — cards, dialogs, paper surfaces
    },
    text: {
      primary: '#212121',    // Almost black — main text
      secondary: '#757575',  // Grey — secondary/helper text
    },
  },
  // ─── TYPOGRAPHY (fonts and text sizes) ───
  // MUI uses these for <Typography variant="h1">, <Typography variant="body1">, etc.
  typography: {
    fontFamily: [                  // System fonts (fast, no download needed)
      '-apple-system',              // Mac
      'BlinkMacSystemFont',         // Mac Chrome
      '"Segoe UI"',                 // Windows
      'Roboto',                     // Android/Google
      '"Helvetica Neue"',           // Older Mac
      'Arial',                      // Universal fallback
      'sans-serif',                 // Final fallback
    ].join(','),
    h1: { fontSize: '2.5rem', fontWeight: 600, lineHeight: 1.2 },   // Page titles
    h2: { fontSize: '2rem', fontWeight: 600, lineHeight: 1.3 },     // Section titles
    h3: { fontSize: '1.75rem', fontWeight: 600, lineHeight: 1.4 },  // Sub-sections
    h4: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },   // Card titles
    h5: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.5 },  // Small headings
    h6: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.5 }, // Smallest headings
    body1: { fontSize: '1rem', lineHeight: 1.6 },    // Normal paragraph text
    body2: { fontSize: '0.875rem', lineHeight: 1.5 }, // Small text
    button: { textTransform: 'none', fontWeight: 600 }, // Button text (no ALL CAPS)
  },
  shape: {
    borderRadius: 8,  // Rounded corners on all components (8px radius)
  },
  spacing: 8,  // Base spacing unit (MUI uses multiples: p={2} = 16px, p={3} = 24px)
  
  // ─── RESPONSIVE BREAKPOINTS ───
  // These define screen sizes for responsive design:
  //   xs: phones (0-599px)
  //   sm: tablets (600-959px)
  //   md: small laptops (960-1279px)
  //   lg: desktops (1280-1919px)
  //   xl: large monitors (1920px+)
  breakpoints: {
    values: {
      xs: 0,
      sm: 600,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
  // ─── COMPONENT STYLE OVERRIDES ───
  // These customize the default look of MUI components app-wide.
  // Instead of adding sx={{}} to every single Button, we set it once here.
  components: {
    // BUTTONS: Rounded, no shadow, touch-friendly height
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 24px',
          fontSize: '0.875rem',
          fontWeight: 600,
          minHeight: 44,        // 44px = minimum touch target size (accessibility)
          boxShadow: 'none',    // No shadow by default
          '&:hover': {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',  // Subtle shadow on hover
          },
        },
        sizeLarge: {
          padding: '12px 32px',
          fontSize: '1rem',
          minHeight: 48,
        },
        sizeSmall: {
          padding: '6px 16px',
          fontSize: '0.75rem',
          minHeight: 36,
        },
      },
    },
    // CARDS: Rounded corners, subtle shadow + border
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,                             // More rounded than buttons
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',       // Subtle elevation shadow
          border: '1px solid rgba(0,0,0,0.05)',          // Very faint border
        },
      },
    },
    // TEXT FIELDS: Rounded, touch-friendly, subtle borders
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            minHeight: 44,    // Touch-friendly (easy to tap on mobile)
            '& fieldset': {
              borderColor: 'rgba(0,0,0,0.15)',   // Light border when unfocused
            },
            '&:hover fieldset': {
              borderColor: 'rgba(0,0,0,0.3)',    // Darker border on hover
            },
            '&.Mui-focused fieldset': {
              borderWidth: 2,                     // Thicker border when focused
            },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },
    // TABLE CELLS: Used in the sheet editor and data tables throughout the app
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(0,0,0,0.1)',  // Light cell borders
          padding: '12px 16px',             // Comfortable cell padding
        },
        head: {
          fontWeight: 600,                  // Bold header text
          backgroundColor: '#f8f9fa',       // Light grey header background
          color: '#212121',                 // Dark text
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          '&:hover': {
            boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 48,
          fontSize: '0.875rem',
        },
      },
    },
  },
});

export default theme;