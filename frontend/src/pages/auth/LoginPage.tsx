// ================================================================
// LOGIN PAGE (pages/auth/LoginPage.tsx)
// ================================================================
// PURPOSE: The login form where users enter email + password.
//
// FLOW:
//   1. User enters email and password
//   2. On submit → calls AuthContext.login()
//   3. If success → redirects to their role-specific dashboard
//   4. If fail → shows error message
//
// FEATURES:
//   - Password visibility toggle
//   - Loading state during login
//   - Error messages for invalid credentials
//   - Remembers redirect URL (came from protected page)
//
// ROLE REDIRECTS:
//   L1 Admin → /admin, CEO → /ceo, Engineer → /engineer, etc.
//
// USED BY: App.tsx route at /login
// ================================================================

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';  // Navigation hooks
import {
  Box, Paper, TextField, Button, Typography, Alert,
  Container, Card, CardContent, InputAdornment, IconButton,
} from '@mui/material';
import {
  Visibility,               // Eye icon (show password)
  VisibilityOff,            // Eye-off icon (hide password)
  Email as EmailIcon,       // Email field icon
  Lock as LockIcon,         // Password field icon
  Construction as ConstructionIcon,  // Logo icon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';       // Login function + error state
import { authService } from '../../services/authService';   // getRoleName helper
import { LoginForm } from '../../types';                    // Type for form data
import LoadingSpinner from '../../components/LoadingSpinner'; // Loading indicator

const LoginPage: React.FC = () => {
  // ---- STATE ----
  const [formData, setFormData] = useState<LoginForm>({
    email: '',      // Email field value
    password: '',   // Password field value
  });
  const [showPassword, setShowPassword] = useState(false);  // Toggle password visibility
  const [isLoading, setIsLoading] = useState(false);        // Is login in progress?

  // ---- HOOKS ----
  const { login, error, clearError } = useAuth();  // Auth context: login function + error
  const navigate = useNavigate();                   // Redirect after login
  const location = useLocation();                   // Get the page user came from

  // If user was redirected here from a protected page, go back there after login.
  // Otherwise, go to the home page (which redirects to their role-specific dashboard).
  const from = location.state?.from?.pathname || '/';

  // ---- EVENT HANDLERS ----

  // Update form field when user types (works for both email and password)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;  // name="email" or name="password"
    setFormData(prev => ({
      ...prev,
      [name]: value,   // Update just the changed field
    }));
    
    // Clear any existing error message when user starts typing
    if (error) {
      clearError();
    }
  };

  // Submit the login form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();       // Prevent page reload (default form behavior)
    setIsLoading(true);       // Show loading spinner

    try {
      const success = await login(formData);  // Call the auth login function
      if (success) {
        navigate(from, { replace: true });    // Redirect to dashboard
      }
    } finally {
      setIsLoading(false);    // Hide loading spinner (even if login failed)
    }
  };

  // Toggle password field between visible text and hidden dots
  const handleTogglePassword = () => {
    setShowPassword(prev => !prev);
  };

  // ---- DEMO CREDENTIALS ----
  // Quick-login buttons for testing (each role has a preset account)
  const demoCredentials = [
    { role: 'L1_ADMIN', email: 'admin@construction.com', password: 'admin123' },
    { role: 'L2_SENIOR_ENGINEER', email: 'senior@construction.com', password: 'senior123' },
    { role: 'L3_JUNIOR_ENGINEER', email: 'junior@construction.com', password: 'junior123' },
    { role: 'PROJECT_MANAGER', email: 'pm@construction.com', password: 'pm123' },
    { role: 'GROUND_MANAGER', email: 'ground@construction.com', password: 'ground123' },
    { role: 'CEO', email: 'ceo@construction.com', password: 'ceo123' },
  ];

  const handleDemoLogin = (email: string, password: string) => {
    setFormData({ email, password });
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          py: 4,
        }}
      >
        <Card elevation={3}>
          <CardContent sx={{ p: 4 }}>
            {/* Header */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <ConstructionIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
                UCAT Systems
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Project Management System
              </Typography>
            </Box>

            {/* Error Alert */}
            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={clearError}>
                {error}
              </Alert>
            )}

            {/* Login Form */}
            <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
              <TextField
                fullWidth
                id="email"
                name="email"
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={isLoading}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon color="action" />
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                fullWidth
                id="password"
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                required
                disabled={isLoading}
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={handleTogglePassword}
                        disabled={isLoading}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={isLoading || !formData.email || !formData.password}
                sx={{ mb: 2, py: 1.5 }}
              >
                {isLoading ? <LoadingSpinner message="" size={20} /> : 'Sign In'}
              </Button>
            </Box>

            {/* Demo Credentials */}
            <Paper 
              variant="outlined" 
              sx={{ p: 2, backgroundColor: 'grey.50' }}
            >
              <Typography variant="subtitle2" gutterBottom color="text.secondary">
                Demo Credentials (Click to fill):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {demoCredentials.map((cred) => (
                  <Button
                    key={cred.role}
                    variant="outlined"
                    size="small"
                    onClick={() => handleDemoLogin(cred.email, cred.password)}
                    disabled={isLoading}
                    sx={{ 
                      fontSize: '0.75rem',
                      minWidth: 'auto',
                      px: 1,
                      py: 0.5,
                    }}
                  >
                    {authService.getRoleName(cred.role)}
                  </Button>
                ))}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                All demo passwords are: [role]123 (e.g., admin123, senior123)
              </Typography>
            </Paper>
          </CardContent>
        </Card>

        {/* Footer */}
        <Typography 
          variant="caption" 
          color="text.secondary" 
          textAlign="center" 
          sx={{ mt: 3 }}
        >
          © 2026 UCAT Systems. All rights reserved.
        </Typography>
      </Box>
    </Container>
  );
};

export default LoginPage;