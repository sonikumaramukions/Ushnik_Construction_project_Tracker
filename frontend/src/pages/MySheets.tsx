// ================================================================
// MY SHEETS PAGE (pages/MySheets.tsx)
// ================================================================
// PURPOSE: Shows all sheets assigned to the current user.
//
// FEATURES:
//   - List of sheets with project name, sheet name, status
//   - Click a sheet to open it in the sheet editor
//   - Search/filter sheets
//   - Shows last modified date
//
// DATA: Calls GET /api/user-sheets/my-sheets
// USED BY: Engineer dashboards, sidebar navigation
// ================================================================

import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Card, CardContent, CardActions,
    Button, Chip, LinearProgress, Alert, Container,
} from '@mui/material';
import {
    Assignment as AssignmentIcon,      // Task icon
    Edit as EditIcon,                  // Edit/pencil icon
    CheckCircle as CheckCircleIcon,    // Completed checkmark
    Schedule as ScheduleIcon,          // Clock icon (pending)
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// ─── TYPE: A sheet assigned to the current user ───
interface UserSheet {
    id: string;
    sheetId: string;         // The actual sheet ID to open
    sheetName: string;       // Display name
    status: string;          // pending, in_progress, completed, submitted
    progress: number;        // 0-100% completion
    assignedAt: string;      // When it was assigned to me
    lastModified: string;    // When I last edited it
    cellChanges: any;        // My cell edits
}

// ─── MY SHEETS PAGE COMPONENT ───
// Shows cards for each sheet assigned to the current user.
// Each card has: name, status chip, progress bar, and "Start/Continue" button.
const MySheets: React.FC = () => {
    const [sheets, setSheets] = useState<UserSheet[]>([]);  // List of assigned sheets
    const [loading, setLoading] = useState(true);           // Loading state
    const navigate = useNavigate();

    // Load sheets on first render
    useEffect(() => {
        loadMySheets();
    }, []);

    // Fetch all sheets assigned to the current user
    const loadMySheets = async () => {
        try {
            setLoading(true);
            const response = await api.get('/my-sheets');  // GET /api/my-sheets
            setSheets(response.data.sheets || []);
        } catch (error: any) {
            console.error('Failed to load sheets:', error);
            toast.error(error.response?.data?.message || 'Failed to load assigned sheets');
        } finally {
            setLoading(false);
        }
    };

    // Map status strings to MUI Chip colors
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':   return 'success';   // Green
            case 'in_progress': return 'primary';   // Blue
            case 'pending':     return 'warning';   // Orange
            case 'submitted':   return 'info';      // Light blue
            default:            return 'default';   // Gray
        }
    };

    // Map status strings to icons
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':   return <CheckCircleIcon />;
            case 'in_progress': return <EditIcon />;
            case 'pending':     return <ScheduleIcon />;
            default:            return <AssignmentIcon />;
        }
    };

    // Navigate to the sheet editor when user clicks a card button
    const handleOpenSheet = (sheetId: string) => {
        navigate(`/my-sheets/${sheetId}`);  // Opens the sheet for editing
    };

    // --- LOADING STATE ---
    // Show a progress bar while sheets are being fetched from the server
    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <LinearProgress />
                <Typography sx={{ mt: 2 }}>Loading your sheets...</Typography>
            </Container>
        );
    }

    // --- MAIN RENDER ---
    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            {/* Page heading */}
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" gutterBottom>
                    My Assigned Sheets
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    View and edit sheets that have been assigned to you
                </Typography>
            </Box>

            {/* If no sheets assigned, show info alert */}
            {sheets.length === 0 ? (
                <Alert severity="info">
                    No sheets have been assigned to you yet. Check back later!
                </Alert>
            ) : (
                /* Grid of sheet cards — responsive: 1 col on mobile, 2 on tablet, 3 on desktop */
                <Grid container spacing={3}>
                    {sheets.map((sheet) => (
                        <Grid item xs={12} md={6} lg={4} key={sheet.id}>
                            {/* Each card lifts up on hover (translateY + shadow) */}
                            <Card
                                sx={{
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: 4,
                                    },
                                }}
                            >
                                <CardContent sx={{ flexGrow: 1 }}>
                                    {/* Sheet name with status icon */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                        {getStatusIcon(sheet.status)}
                                        <Typography variant="h6" sx={{ ml: 1 }}>
                                            {sheet.sheetName}
                                        </Typography>
                                    </Box>

                                    {/* Status chip (colored badge: PENDING, IN PROGRESS, etc.) */}
                                    <Box sx={{ mb: 2 }}>
                                        <Chip
                                            label={sheet.status.toUpperCase().replace('_', ' ')}
                                            color={getStatusColor(sheet.status) as any}
                                            size="small"
                                            sx={{ mb: 1 }}
                                        />
                                    </Box>

                                    {/* Progress bar — shows how much of the sheet is filled */}
                                    <Box sx={{ mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Progress
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {sheet.progress}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={sheet.progress}
                                            sx={{ height: 8, borderRadius: 4 }}
                                        />
                                    </Box>

                                    {/* Date info: when assigned and last edited */}
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        Assigned: {new Date(sheet.assignedAt).toLocaleDateString()}
                                    </Typography>
                                    {sheet.lastModified && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            Last modified: {new Date(sheet.lastModified).toLocaleDateString()}
                                        </Typography>
                                    )}
                                </CardContent>

                                {/* Action button — text changes based on current status */}
                                <CardActions>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        startIcon={<EditIcon />}
                                        onClick={() => handleOpenSheet(sheet.sheetId)}
                                    >
                                        {sheet.status === 'pending' ? 'Start Working' : 'Continue Editing'}
                                    </Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Container>
    );
};

export default MySheets;
