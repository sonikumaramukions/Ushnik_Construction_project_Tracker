// ================================================================
// CELL PERMISSIONS DIALOG (components/CellPermissionsDialog.tsx)
// ================================================================
// PURPOSE: Modal dialog for setting read/write permissions on
//          individual cells or cell ranges in a sheet.
//
// FEATURES:
//   - Select cells by row/column or range
//   - Assign read/write/lock per user or per role
//   - Preview which users are affected
//   - Save permissions via cellPermissions API
//
// USED BY: Sheet editor pages (admin clicks a cell → this dialog)
// ================================================================

import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, FormControl, FormLabel, FormGroup, FormControlLabel,
    Checkbox, Typography, Box, Divider, Chip,
    Select, MenuItem, InputLabel, ListItemText, Alert,
} from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';  // Padlock icon for locked cells
import api from '../services/api';                        // Axios instance
import { authService } from '../services/authService';    // For getRoleName() display
import toast from 'react-hot-toast';                      // Toast notifications

// ─── TYPE: A user that can be selected for permissions ───
interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
}

// ─── TYPE: The permission settings for one cell ───
// Controls who can view and edit this specific cell.
interface CellPermission {
    canViewRoles: string[];   // Roles that can see this cell (e.g. ['L2_SENIOR_ENGINEER'])
    canViewUsers: string[];   // Specific user IDs that can see this cell
    canEditRoles: string[];   // Roles that can edit this cell
    canEditUsers: string[];   // Specific user IDs that can edit this cell
    isLocked: boolean;        // If true, nobody can edit (overrides everything)
    notes?: string;
}

// ─── PROPS for this dialog ───
interface CellPermissionsDialogProps {
    open: boolean;                           // Whether the dialog is visible
    onClose: () => void;                     // Called when the dialog closes
    cellId: string;                          // Which cell we're setting permissions for (e.g. "A1")
    sheetId: string;                         // Which sheet the cell belongs to
    currentPermissions?: CellPermission;     // Existing permissions to pre-fill the form
    onSave: (permissions: CellPermission) => void;  // Called after successful save
}

// The roles that can be selected (L1_ADMIN is excluded — admin always has full access)
const AVAILABLE_ROLES = [
    { value: 'L2_SENIOR_ENGINEER', label: 'Planning Manager' },
    { value: 'L3_JUNIOR_ENGINEER', label: 'Site Engineer' },
    { value: 'PROJECT_MANAGER', label: 'Project Manager' },
    { value: 'GROUND_MANAGER', label: 'Ground Manager' },
];

// ─── CELL PERMISSIONS DIALOG COMPONENT ─────────────────────────────
const CellPermissionsDialog: React.FC<CellPermissionsDialogProps> = ({
    open, onClose, cellId, sheetId, currentPermissions, onSave,
}) => {
    // State for each permission category
    const [canViewRoles, setCanViewRoles] = useState<string[]>([]);
    const [canEditRoles, setCanEditRoles] = useState<string[]>([]);
    const [canViewUsers, setCanViewUsers] = useState<string[]>([]);
    const [canEditUsers, setCanEditUsers] = useState<string[]>([]);
    const [isLocked, setIsLocked] = useState(false);
    const [availableUsers, setAvailableUsers] = useState<User[]>([]);  // All users from server
    const [loading, setLoading] = useState(false);

    // When dialog opens, load the user list and pre-fill from currentPermissions
    useEffect(() => {
        if (open) {
            loadUsers();
            if (currentPermissions) {
                // Pre-fill form with existing permissions
                setCanViewRoles(currentPermissions.canViewRoles || []);
                setCanEditRoles(currentPermissions.canEditRoles || []);
                setCanViewUsers(currentPermissions.canViewUsers || []);
                setCanEditUsers(currentPermissions.canEditUsers || []);
                setIsLocked(currentPermissions.isLocked || false);
            } else {
                // Reset to defaults
                setCanViewRoles([]);
                setCanEditRoles([]);
                setCanViewUsers([]);
                setCanEditUsers([]);
                setIsLocked(false);
            }
        }
    }, [open, currentPermissions]);

    // Fetch all users from the server (for the user-specific dropdown)
    const loadUsers = async () => {
        try {
            const response = await api.get('/auth/users');  // GET /api/auth/users
            if (response.data && response.data.users) {
                setAvailableUsers(response.data.users);
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            toast.error('Failed to load users');
        }
    };

    // Toggle a role in the VIEW permissions list (add if missing, remove if present)
    const handleViewRoleToggle = (role: string) => {
        setCanViewRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
    };

    // Toggle a role in the EDIT permissions list
    // Also auto-adds view permission (can't edit what you can't see)
    const handleEditRoleToggle = (role: string) => {
        setCanEditRoles(prev =>
            prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
        );
        // If giving edit permission, also give view permission
        if (!canEditRoles.includes(role) && !canViewRoles.includes(role)) {
            setCanViewRoles(prev => [...prev, role]);
        }
    };

    // Save permissions to the backend via POST /api/sheets/:id/permissions/cell
    const handleSave = async () => {
        setLoading(true);
        try {
            const permissions: CellPermission = {
                canViewRoles,
                canViewUsers,
                canEditRoles,
                canEditUsers,
                isLocked,
            };

            const response = await api.post(`/sheets/${sheetId}/permissions/cell`, {
                cellId,
                ...permissions,
            });

            if (response.data.success) {
                toast.success('Cell permissions saved successfully');
                onSave(permissions);
                onClose();
            }
        } catch (error) {
            console.error('Failed to save permissions:', error);
            toast.error('Failed to save permissions');
        } finally {
            setLoading(false);
        }
    };

    // Map each role to a distinct color for the UI chips
    const getRoleColor = (role: string): string => {
        const colors: { [key: string]: string } = {
            'L2_SENIOR_ENGINEER': '#1976d2',   // Blue
            'L3_JUNIOR_ENGINEER': '#388e3c',   // Green
            'PROJECT_MANAGER': '#f57c00',       // Orange
            'GROUND_MANAGER': '#7b1fa2',        // Purple
        };
        return colors[role] || '#757575';        // Default gray
    };

    // ─── RENDER: The dialog with 3 sections ───
    // 1. Lock Cell checkbox
    // 2. View Permissions (role checkboxes)
    // 3. Edit Permissions (role checkboxes + user dropdown)
    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            {/* Title bar with cell ID and lock icon */}
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Cell {cellId} Permissions</Typography>
                    {isLocked && <LockIcon color="error" />}
                </Box>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ mt: 2 }}>
                    {/* Lock Cell */}
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={isLocked}
                                onChange={(e) => setIsLocked(e.target.checked)}
                                color="error"
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body1" fontWeight="bold">
                                    Lock Cell (Admin Only)
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    When locked, no one can edit this cell (including users with edit permissions)
                                </Typography>
                            </Box>
                        }
                    />

                    <Divider sx={{ my: 3 }} />

                    {/* View Permissions */}
                    <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
                        <FormLabel component="legend">
                            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                Who can VIEW this cell?
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Leave empty to allow all roles to view
                            </Typography>
                        </FormLabel>
                        <FormGroup sx={{ mt: 1 }}>
                            {AVAILABLE_ROLES.map((role) => (
                                <FormControlLabel
                                    key={role.value}
                                    control={
                                        <Checkbox
                                            checked={canViewRoles.includes(role.value)}
                                            onChange={() => handleViewRoleToggle(role.value)}
                                        />
                                    }
                                    label={
                                        <Chip
                                            label={role.label}
                                            size="small"
                                            sx={{ bgcolor: getRoleColor(role.value), color: 'white' }}
                                        />
                                    }
                                />
                            ))}
                        </FormGroup>
                    </FormControl>

                    <Divider sx={{ my: 3 }} />

                    {/* Edit Permissions */}
                    <FormControl component="fieldset" fullWidth sx={{ mb: 3 }} disabled={isLocked}>
                        <FormLabel component="legend">
                            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                                Who can EDIT this cell?
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Leave empty to allow all roles to edit. Edit permission automatically grants view permission.
                            </Typography>
                        </FormLabel>
                        <FormGroup sx={{ mt: 1 }}>
                            {AVAILABLE_ROLES.map((role) => (
                                <FormControlLabel
                                    key={role.value}
                                    control={
                                        <Checkbox
                                            checked={canEditRoles.includes(role.value)}
                                            onChange={() => handleEditRoleToggle(role.value)}
                                            disabled={isLocked}
                                        />
                                    }
                                    label={
                                        <Chip
                                            label={role.label}
                                            size="small"
                                            sx={{ bgcolor: getRoleColor(role.value), color: 'white' }}
                                        />
                                    }
                                />
                            ))}
                        </FormGroup>
                    </FormControl>

                    <Divider sx={{ my: 3 }} />

                    {/* Specific Users (Optional) */}
                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Specific Users (Optional)</InputLabel>
                        <Select
                            multiple
                            value={canEditUsers}
                            onChange={(e) => setCanEditUsers(e.target.value as string[])}
                            disabled={isLocked}
                            renderValue={(selected) => (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {selected.map((userId) => {
                                        const user = availableUsers.find(u => u.id === userId);
                                        return user ? (
                                            <Chip
                                                key={userId}
                                                label={`${user.firstName} ${user.lastName}`}
                                                size="small"
                                            />
                                        ) : null;
                                    })}
                                </Box>
                            )}
                        >
                            {availableUsers.map((user) => (
                                <MenuItem key={user.id} value={user.id}>
                                    <Checkbox checked={canEditUsers.includes(user.id)} />
                                    <ListItemText
                                        primary={`${user.firstName} ${user.lastName}`}
                                        secondary={authService.getRoleName(user.role)}
                                    />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Summary */}
                    <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                            <strong>Summary:</strong>
                            {isLocked && ' Cell is LOCKED - no one can edit.'}
                            {!isLocked && canEditRoles.length === 0 && canEditUsers.length === 0 && ' All roles can edit this cell.'}
                            {!isLocked && (canEditRoles.length > 0 || canEditUsers.length > 0) &&
                                ` Only selected roles/users can edit this cell.`}
                        </Typography>
                    </Alert>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={loading}
                >
                    {loading ? 'Saving...' : 'Save Permissions'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default CellPermissionsDialog;
