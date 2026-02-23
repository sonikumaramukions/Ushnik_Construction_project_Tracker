// ================================================================
// LOADING SPINNER (components/LoadingSpinner.tsx)
// ================================================================
// PURPOSE: A reusable loading indicator shown while data is
//          being fetched from the server.
//
// PROPS:
//   message (optional) — Text shown below the spinner
//
// USED BY: Almost every page while loading data
// ================================================================

import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

// Props for the LoadingSpinner component
interface LoadingSpinnerProps {
  message?: string;  // Text below the spinner (default: "Loading...")
  size?: number;     // Spinner diameter in pixels (default: 40)
}

// A centered spinning circle with a message below it.
// Usage: <LoadingSpinner message="Loading sheets..." />
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 40 
}) => {
  return (
    // Flexbox container: centers everything vertically and horizontally
    <Box
      display="flex"
      flexDirection="column"  /* Stack spinner above text */
      alignItems="center"     /* Horizontal center */
      justifyContent="center" /* Vertical center */
      p={4}                   /* Padding around the whole thing */
    >
      {/* The spinning circle animation (MUI built-in) */}
      <CircularProgress size={size} sx={{ mb: 2 }} />
      {/* The message text below the spinner */}
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
};

export default LoadingSpinner;