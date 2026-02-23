// ================================================================
// PROFILE PAGE (pages/shared/ProfilePage.tsx)
// ================================================================
// PURPOSE: Shows the current user's profile information.
//
// DISPLAYS:
//   - Name, email, role
//   - Account creation date
//   - (Placeholder for future: change password, avatar)
//
// DATA: Uses AuthContext.user (already loaded)
// ROLE ACCESS: All logged-in users
// USED BY: Sidebar navigation → "Profile"
// ================================================================

import React from 'react';
import { Typography, Box, Paper } from '@mui/material';

// ─── PROFILE PAGE ───────────────────────────────────────────
// Placeholder page for user profile management.
// In the future this will allow:
//   - Editing name/email
//   - Changing password
//   - Uploading avatar
//   - Setting notification preferences
// Currently just shows a placeholder message.
// Accessible to ALL logged-in users via sidebar → "Profile".
// ────────────────────────────────────────────────────────
const ProfilePage: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        User Profile
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Typography variant="body1">
          User profile management will be implemented here.
          Features include: profile editing, password change, preferences.
        </Typography>
      </Paper>
    </Box>
  );
};

export default ProfilePage;