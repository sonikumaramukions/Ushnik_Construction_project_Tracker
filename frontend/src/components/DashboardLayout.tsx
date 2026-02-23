// ================================================================
// DASHBOARD LAYOUT (components/DashboardLayout.tsx)
// ================================================================
// PURPOSE: The main page layout wrapper for ALL dashboard pages.
//
// PROVIDES:
//   - Left sidebar navigation with role-specific menu items
//   - Top app bar with user name + logout button
//   - Notification bell icon with unread count
//   - Mobile-responsive: sidebar collapses on small screens
//   - Breadcrumb navigation
//
// HOW IT WORKS:
//   Every dashboard page is wrapped in <DashboardLayout>.
//   The sidebar menu items change based on user role.
//
// ROLE-SPECIFIC MENUS:
//   L1 Admin     → Users, Projects, Sheets, Collaboration, Analytics
//   CEO          → Executive Dashboard, Reports
//   Engineer     → My Sheets, My Tasks, Profile
//   Ground Mgr   → My Tasks, Sheet View
//
// USED BY: Every single dashboard page in the app
// ================================================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';  // Navigation hooks
import {
  // Layout components
  Box, AppBar, Toolbar, Container, Drawer,
  // Navigation/List components
  List, ListItem, ListItemIcon, ListItemText, ListItemButton,
  // UI components
  Typography, IconButton, Avatar, Menu, MenuItem, Divider,
  // Responsive helpers
  useTheme, useMediaQuery,
  // Notification UI
  Badge, Popover, Paper,
} from '@mui/material';
import {
  Menu as MenuIcon,             // Hamburger menu (mobile)
  Dashboard as DashboardIcon,   // Default menu item icon
  Business as ProjectIcon,      // Projects menu icon
  TableChart as SheetIcon,      // Sheets menu icon
  People as UsersIcon,          // Users menu icon
  Person as PersonIcon,         // Profile menu icon
  Logout as LogoutIcon,         // Logout menu icon
  Construction as ConstructionIcon,  // Logo icon in sidebar
  Notifications as NotificationsIcon,  // Bell icon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';           // Get current user + logout
import { authService } from '../services/authService';       // getRoleName helper
import { assignmentsAPI, AppNotification } from '../services/assignmentsAPI';  // Notifications API
import { useSocket } from '../contexts/SocketContext';       // Real-time notification updates

// ─── COMPONENT PROPS ───
// Each dashboard page passes these when using <DashboardLayout>:
interface DashboardLayoutProps {
  children: React.ReactNode;  // The page content that goes inside the layout
  title: string;              // Shown in the top bar (e.g., "Admin Dashboard")
  menuItems: Array<{          // Sidebar navigation links
    label: string;            // Display text (e.g., "Projects")
    path: string;             // URL to navigate to (e.g., "/admin/projects")
    exact?: boolean;          // Exact path match for highlighting
    icon?: React.ReactNode;   // Optional custom icon
  }>;
}

// ─── MAIN DASHBOARD LAYOUT COMPONENT ───
const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  title,
  menuItems,
}) => {
  // ---- STATE ----
  const [drawerOpen, setDrawerOpen] = useState(false);         // Is mobile sidebar open?
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null); // Profile dropdown anchor
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);  // Notification popup anchor
  const [notifications, setNotifications] = useState<AppNotification[]>([]);  // List of notifications
  const [unreadCount, setUnreadCount] = useState(0);           // Badge number on bell icon
  
  // ---- HOOKS ----
  const { user, logout } = useAuth();      // Current user info + logout function
  const { socket } = useSocket();          // WebSocket connection for real-time updates
  const navigate = useNavigate();          // Programmatic navigation
  const location = useLocation();          // Current URL path
  const theme = useTheme();                // MUI theme (colors, breakpoints)
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));  // Is screen < 900px?

  const drawerWidth = 240;  // Sidebar width in pixels

  // ---- NOTIFICATION LOADING ----
  // Fetch notifications from the database (called on mount + when socket events arrive)
  const loadNotifications = async () => {
    try {
      const data = await assignmentsAPI.getNotifications();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silently fail — user may not be authenticated yet
    }
  };

  // Load notifications once when the component first renders
  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  // ---- REAL-TIME NOTIFICATION UPDATES ----
  // When the server sends a socket event about tasks/assignments,
  // automatically refresh the notification list.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadNotifications();
    socket.on('task_assigned', refresh);              // New task assigned to me
    socket.on('task_response', refresh);              // Someone responded to my task
    socket.on('assignment_status_changed', refresh);  // Task status changed
    // Cleanup: remove listeners when component unmounts
    return () => {
      socket.off('task_assigned', refresh);
      socket.off('task_response', refresh);
      socket.off('assignment_status_changed', refresh);
    };
  }, [socket]);

  // Mark all notifications as read (when user clicks "Mark all read")
  const handleMarkAllRead = async () => {
    try {
      await assignmentsAPI.markNotificationsRead('all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch { /* ignore */ }
  };

  // ---- UI EVENT HANDLERS ----

  // Toggle the mobile sidebar (hamburger menu)
  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  // Open the profile dropdown menu (avatar click)
  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileMenuAnchor(event.currentTarget);
  };

  // Close the profile dropdown menu
  const handleProfileMenuClose = () => {
    setProfileMenuAnchor(null);
  };

  // Navigate to a page (and close mobile drawer if open)
  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setDrawerOpen(false);  // Auto-close sidebar on mobile after clicking
    }
  };

  // Log out and close the profile menu
  const handleLogout = () => {
    handleProfileMenuClose();
    logout();
  };

  // Pick an icon based on the menu item's URL path
  const getMenuIcon = (path: string) => {
    if (path.includes('projects')) return <ProjectIcon />;
    if (path.includes('sheets')) return <SheetIcon />;
    if (path.includes('users')) return <UsersIcon />;
    return <DashboardIcon />;  // Default icon
  };

  // ---- SIDEBAR CONTENT ----
  // This is the sidebar navigation panel (left side of the screen).
  // It shows the app logo and a list of navigation links.
  const drawer = (
    <Box>
      {/* Sidebar header: logo + app name */}
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          minHeight: 64,           // Same height as the top app bar
          bgcolor: 'primary.main', // Blue background
          color: 'white',
        }}
      >
        <ConstructionIcon sx={{ mr: 2 }} />  {/* Hard hat icon */}
        <Typography variant="h6" noWrap>
          UCAT Systems
        </Typography>
      </Box>
      <Divider />
      {/* Navigation links list */}
      <List>
        {menuItems.map((item) => {
          // Highlight the current page's menu item
          const isActive = item.exact 
            ? location.pathname === item.path        // Exact match
            : location.pathname.startsWith(item.path); // Starts with (for nested pages)
          
          return (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={isActive}
                onClick={() => handleNavigation(item.path)}
                sx={{
                  '&.Mui-selected': {
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                    '&:hover': {
                      backgroundColor: 'primary.main',
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isActive ? 'primary.contrastText' : 'inherit',
                  }}
                >
                  {item.icon || getMenuIcon(item.path)}
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  // ---- MAIN LAYOUT STRUCTURE ----
  // The page is a horizontal flex container:
  //   [Sidebar] [Main Content Area]
  // On mobile, the sidebar becomes a slide-out drawer.
  return (
    <Box sx={{ display: 'flex' }}>
      {/* ---- TOP APP BAR ---- */}
      {/* Fixed at the top. On desktop, it's offset by the sidebar width. */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* ---- NOTIFICATION BELL ---- */}
            {/* Shows unread count as a red badge. Clicking opens a dropdown. */}
            <IconButton color="inherit" onClick={(e) => setNotifAnchor(e.currentTarget)}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
            <Popover
              open={Boolean(notifAnchor)}
              anchorEl={notifAnchor}
              onClose={() => setNotifAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <Paper sx={{ width: 360, maxHeight: 420, overflow: 'auto' }}>
                <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
                  <Typography variant="subtitle1" fontWeight="bold">Notifications</Typography>
                  {unreadCount > 0 && (
                    <Typography
                      variant="caption"
                      color="primary"
                      sx={{ cursor: 'pointer' }}
                      onClick={handleMarkAllRead}
                    >
                      Mark all read
                    </Typography>
                  )}
                </Box>
                {notifications.length === 0 ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">No notifications</Typography>
                  </Box>
                ) : (
                  notifications.slice(0, 20).map(n => (
                    <Box
                      key={n.id}
                      sx={{
                        p: 1.5,
                        borderBottom: '1px solid #f0f0f0',
                        bgcolor: n.isRead ? 'inherit' : 'action.hover',
                        borderLeft: n.isRead ? 'none' : '3px solid #1976d2',
                      }}
                    >
                      <Typography variant="subtitle2" fontSize="0.8rem">{n.title}</Typography>
                      <Typography variant="body2" color="text.secondary" fontSize="0.75rem">{n.message}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(n.createdAt).toLocaleString()}
                      </Typography>
                    </Box>
                  ))
                )}
              </Paper>
            </Popover>
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.firstName} {user?.lastName}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.5,
                bgcolor: 'rgba(255,255,255,0.2)',
                borderRadius: 1,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              {authService.getRoleName(user?.role || '')}
            </Typography>
            <IconButton
              size="small"
              onClick={handleProfileMenuOpen}
              sx={{ ml: 1 }}
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.firstName?.charAt(0)}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* ---- SIDEBAR NAVIGATION ---- */}
      {/* On desktop: permanent sidebar always visible */}
      {/* On mobile: temporary drawer that slides in/out */}
      <Box
        component="nav"
        sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}  // Different behavior per screen size
          open={isMobile ? drawerOpen : true}              // Mobile: controlled by state; Desktop: always open
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,  // Better mobile performance (don't destroy when closed)
          }}
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* ---- MAIN CONTENT AREA ---- */}
      {/* This is where the actual page content (children) is rendered. */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,                                    // Take up remaining width
          width: { md: `calc(100% - ${drawerWidth}px)` }, // Subtract sidebar width on desktop
          minHeight: '100vh',                              // Full viewport height
          bgcolor: 'background.default',                   // Light gray background
        }}
      >
        <Toolbar />  {/* Spacer: push content below the fixed app bar */}
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {children}  {/* The actual page content passed by the parent */}
        </Container>
      </Box>

      {/* ---- PROFILE DROPDOWN MENU ---- */}
      {/* Opens when clicking the avatar in the top-right corner. */}
      <Menu
        anchorEl={profileMenuAnchor}
        open={Boolean(profileMenuAnchor)}
        onClose={handleProfileMenuClose}
      >
        <MenuItem onClick={() => { handleProfileMenuClose(); navigate('/profile'); }}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default DashboardLayout;