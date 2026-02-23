// ================================================================
// COLLABORATION MANAGER (pages/dashboards/components/CollaborationManager.tsx)
// ================================================================
// PURPOSE: Admin tool for pushing sheets to users/roles.
//
// FEATURES:
//   - Select a sheet to push
//   - Choose target: specific users or entire roles
//   - Assign specific rows/columns per user
//   - Set permissions (read-only vs editable)
//   - View current assignments
//   - Revoke assignments
//
// DATA: Calls collaboration, sheets, users APIs
// PARENT: AdminDashboard.tsx (rendered in "Collaboration" tab)
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import {
  Share as ShareIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../../services/api';

// ─── TYPE: A user/role that has access to a sheet ───
interface Collaborator {
  role: string;           // e.g. "L2_SENIOR_ENGINEER"
  sharedAt: string;       // When the sheet was shared
  permissions: {
    canView: boolean;     // Can see the sheet
    canEdit: boolean;     // Can edit cells
    canApprove: boolean;  // Can approve submissions
  };
}

// Optional prop: if a sheetId is passed, only manage that one sheet
interface Props {
  sheetId?: string;
}

// All available roles that can be selected for collaboration
const AVAILABLE_ROLES = [
  'L1_ADMIN',
  'L2_SENIOR_ENGINEER',
  'L3_JUNIOR_ENGINEER',
  'PROJECT_MANAGER',
  'GROUND_MANAGER',
  'CEO'
];

// ─── COLLABORATION MANAGER COMPONENT ───
// Lets admin push/share a sheet to specific roles, and see who already has access.
const CollaborationManager: React.FC<Props> = ({ sheetId }) => {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]); // Current collaborators
  const [loading, setLoading] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);          // Share dialog
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);       // Roles to share with

  // Reload collaborators when sheetId changes
  useEffect(() => {
    if (sheetId) {
      fetchCollaborators();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  // Fetch current collaborators for this sheet via GET /api/sheets/:id/collaborators
  const fetchCollaborators = async () => {
    if (!sheetId) return;
    try {
      setLoading(true);
      const response = await api.get(`/sheets/${sheetId}/collaborators`);
      setCollaborators(response.data.collaborators || []);
    } catch (error: any) {
      toast.error('Failed to fetch collaborators');
    } finally {
      setLoading(false);
    }
  };

  const handlePushCollaborate = async () => {
    if (!sheetId || selectedRoles.length === 0) {
      toast.error('Please select at least one role');
      return;
    }

    try {
      setLoading(true);
      await api.post(`/sheets/${sheetId}/push-collaborate`, {
        rolesToShare: selectedRoles
      });

      toast.success(`Sheet shared with ${selectedRoles.length} role(s)!`);
      fetchCollaborators();
      setShareDialogOpen(false);
      setSelectedRoles([]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to share sheet');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollaborator = async (role: string) => {
    if (!sheetId) return;

    try {
      setLoading(true);
      await api.delete(`/sheets/${sheetId}/collaboration/${role}`);
      toast.success(`Removed ${role} from collaborators`);
      fetchCollaborators();
    } catch (error: any) {
      toast.error('Failed to remove collaborator');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToDashboard = async (role: string) => {
    if (!sheetId) return;

    try {
      setLoading(true);
      await api.post(`/sheets/${sheetId}/sync-dashboard/${role}`);
      toast.success(`Sheet synced to ${role} dashboard!`);
    } catch (error: any) {
      toast.error('Failed to sync dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="👥 Sheet Collaboration Manager"
        subheader="Push sheets to roles and see real-time updates"
        action={
          <Button
            variant="contained"
            startIcon={<ShareIcon />}
            onClick={() => setShareDialogOpen(true)}
            disabled={loading || !sheetId}
          >
            Share with Roles
          </Button>
        }
      />
      <CardContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <InfoIcon sx={{ mr: 1, fontSize: '1rem' }} />
          When you push a sheet to roles, it appears in their dashboards with real-time synchronization.
        </Alert>

        {collaborators.length > 0 ? (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Current Collaborators ({collaborators.length})
            </Typography>
            <TableContainer component={Paper}>
              <Table>
                <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                  <TableRow>
                    <TableCell><strong>Role</strong></TableCell>
                    <TableCell><strong>Can View</strong></TableCell>
                    <TableCell><strong>Can Edit</strong></TableCell>
                    <TableCell><strong>Can Approve</strong></TableCell>
                    <TableCell><strong>Shared Date</strong></TableCell>
                    <TableCell align="right"><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {collaborators.map((collab) => (
                    <TableRow key={collab.role}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <PersonIcon fontSize="small" />
                          <strong>{collab.role}</strong>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {collab.permissions.canView ? (
                          <CheckCircleIcon fontSize="small" sx={{ color: 'green' }} />
                        ) : (
                          '✗'
                        )}
                      </TableCell>
                      <TableCell>
                        {collab.permissions.canEdit ? (
                          <CheckCircleIcon fontSize="small" sx={{ color: 'green' }} />
                        ) : (
                          '✗'
                        )}
                      </TableCell>
                      <TableCell>
                        {collab.permissions.canApprove ? (
                          <CheckCircleIcon fontSize="small" sx={{ color: 'green' }} />
                        ) : (
                          '✗'
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(collab.sharedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="success"
                          onClick={() => handleSyncToDashboard(collab.role)}
                          disabled={loading}
                          sx={{ mr: 1 }}
                        >
                          Sync Dashboard
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleRemoveCollaborator(collab.role)}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ) : (
          <Alert severity="warning">
            No collaborators yet. Share this sheet with roles to get started!
          </Alert>
        )}

        {/* Share Dialog */}
        <Dialog
          open={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Share Sheet with Roles</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Select one or more roles to share this sheet:
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Roles to Share</InputLabel>
              <Select
                multiple
                value={selectedRoles}
                onChange={(e) => setSelectedRoles(
                  typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value
                )}
                label="Roles to Share"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((role) => (
                      <Chip key={role} label={role} size="small" />
                    ))}
                  </Box>
                )}
              >
                {AVAILABLE_ROLES.map((role) => (
                  <MenuItem
                    key={role}
                    value={role}
                    disabled={collaborators.some(c => c.role === role)}
                  >
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShareDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePushCollaborate}
              variant="contained"
              disabled={loading || selectedRoles.length === 0}
            >
              Share Sheet
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default CollaborationManager;
