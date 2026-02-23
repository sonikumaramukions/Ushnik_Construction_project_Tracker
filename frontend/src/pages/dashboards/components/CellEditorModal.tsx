// ================================================================
// CELL EDITOR MODAL (pages/dashboards/components/CellEditorModal.tsx)
// ================================================================
// PURPOSE: Pop-up dialog for editing a single cell's value.
//
// FEATURES:
//   - Text input for the cell value
//   - Formula input (=SUM, =AVG, etc.)
//   - Cell type selector (text, number, date, formula)
//   - Validation rules display
//   - Lock/unlock toggle (admin only)
//   - History of previous values
//
// PROPS:
//   open, cellData, onSave, onClose, readOnly
//
// USED BY: Sheet editor components when a cell is double-clicked
// ================================================================

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Divider,
  FormControlLabel,
  Checkbox,
  Grid,
  Chip,
  Alert,
  IconButton,
  Collapse
} from '@mui/material';
import {
  Functions as FunctionsIcon,
  Lock as LockIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import socketService from '../../../services/socketService';

// ─── PROPS for the Cell Editor Modal ───
interface CellEditorModalProps {
  open: boolean;                 // Whether the dialog is visible
  cellId: string | null;         // Which cell is being edited (e.g. "A1")
  sheetId: string;               // Which sheet the cell belongs to
  currentValue: string;          // The cell's current value to pre-fill
  onClose: () => void;           // Called when dialog closes
  onSave: (cellId: string, value: string) => void;  // Called after save
  onReload?: () => void;         // Optional: reload sheet data after save
}

// ─── TYPE: Per-role permission for a cell ───
interface RolePermission {
  role: string;       // e.g. "L2_SENIOR_ENGINEER"
  canView: boolean;   // Can this role see the cell?
  canEdit: boolean;   // Can this role edit the cell?
}

// All 6 roles with their display names and UI colors
const AVAILABLE_ROLES = [
  { value: 'L1_ADMIN', label: 'Head Officer', color: '#d32f2f' },
  { value: 'L2_SENIOR_ENGINEER', label: 'Planning Manager', color: '#1976d2' },
  { value: 'L3_JUNIOR_ENGINEER', label: 'Site Engineer', color: '#388e3c' },
  { value: 'PROJECT_MANAGER', label: 'Project Manager', color: '#f57c00' },
  { value: 'GROUND_MANAGER', label: 'Ground Manager', color: '#7b1fa2' },
  { value: 'CEO', label: 'CEO', color: '#424242' }
];

// Supported formulas with examples for the formula picker
const AVAILABLE_FORMULAS = [
  { name: 'SUM', example: '=SUM(A1:A10)', description: 'Sum values in range' },
  { name: 'AVG', example: '=AVG(A1:A10)', description: 'Average of values' },
  { name: 'COUNT', example: '=COUNT(A1:A10)', description: 'Count numbers' },
  { name: 'MIN', example: '=MIN(A1:A10)', description: 'Minimum value' },
  { name: 'MAX', example: '=MAX(A1:A10)', description: 'Maximum value' },
  { name: 'ROUND', example: '=ROUND(A1, 2)', description: 'Round number' }
];

// ─── CELL EDITOR MODAL COMPONENT ───
// Opens when admin double-clicks a cell in the sheet editor.
// Lets them: edit the value, set formulas, configure per-role permissions.
const CellEditorModal: React.FC<CellEditorModalProps> = ({
  open, cellId, sheetId, currentValue, onClose, onSave, onReload
}) => {
  const [value, setValue] = useState(currentValue);                // Cell value being edited
  const [formula, setFormula] = useState('');                       // Formula string (e.g. "=SUM(A1:A5)")
  const [permissions, setPermissions] = useState<RolePermission[]>([]); // Per-role permissions
  const [showFormulaSection, setShowFormulaSection] = useState(false);  // Expand/collapse formula UI
  const [showPermissionSection, setShowPermissionSection] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && cellId) {
      setValue(currentValue);
      loadCellData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cellId, currentValue]);

  const loadCellData = async () => {
    if (!cellId || !sheetId) return;

    setLoading(true);
    try {
      // Load existing formula if any
      try {
        const formulaRes = await api.get(`/formulas/${sheetId}/${cellId}`);
        if (formulaRes.data.success) {
          setFormula(formulaRes.data.data.formula);
        }
      } catch (err) {
        // No formula exists, that's fine
        setFormula('');
      }

      // Load existing permissions
      try {
        const permRes = await api.get(`/sheets/${sheetId}/permissions/${cellId}`);
        if (permRes.data.success && permRes.data.permission) {
          const perm = permRes.data.permission;
          const rolePerms: RolePermission[] = AVAILABLE_ROLES.map(r => ({
            role: r.value,
            canView: perm.canViewRoles?.includes(r.value) || false,
            canEdit: perm.canEditRoles?.includes(r.value) || false
          }));
          setPermissions(rolePerms);
        } else {
          // Default: all roles can view and edit
          setPermissions(AVAILABLE_ROLES.map(r => ({
            role: r.value,
            canView: true,
            canEdit: true
          })));
        }
      } catch (err) {
        // No permissions set, use defaults
        setPermissions(AVAILABLE_ROLES.map(r => ({
          role: r.value,
          canView: true,
          canEdit: true
        })));
      }
    } catch (error) {
      console.error('Failed to load cell data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (role: string, type: 'view' | 'edit', checked: boolean) => {
    setPermissions(prev => prev.map(p => {
      if (p.role === role) {
        return {
          ...p,
          [type === 'view' ? 'canView' : 'canEdit']: checked
        };
      }
      return p;
    }));
  };

  const insertFormula = (formulaExample: string) => {
    setFormula(formulaExample);
    setValue(formulaExample);
  };

  const handleSave = async () => {
    if (!cellId) return;

    setLoading(true);
    try {
      const userId = localStorage.getItem('userId') || 'admin';
      
      // 1. Save cell value (only if not a formula)
      if (!formula || !formula.startsWith('=')) {
        onSave(cellId, value);
      }

      // 2. Save formula if provided
      if (formula && formula.startsWith('=')) {
        try {
          const response = await api.post(`/formulas/set/${sheetId}/${cellId}`, { formula });
          
          // Backend returns { success, message, data: { cellId, formula, calculatedValue, dependencies } }
          if (response.data?.success && response.data?.data) {
            const calculatedValue = response.data.data.calculatedValue;
            
            if (calculatedValue !== undefined && calculatedValue !== null) {
              // Update local display with calculated value
              onSave(cellId, String(calculatedValue));
              toast.success(`Formula applied! Result: ${calculatedValue}`);
            } else {
              toast.success('Formula applied successfully');
            }
            
            // Reload data after a short delay to ensure backend is updated
            if (onReload) {
              setTimeout(() => onReload(), 500);
            }
          } else {
            toast.success('Formula applied');
            if (onReload) {
              setTimeout(() => onReload(), 500);
            }
          }
          
          // Emit socket event for formula update
          socketService.emitFormulaUpdate({
            sheetId,
            cellId,
            formula,
            userId
          });
        } catch (err: any) {
          console.error('Formula error:', err.response?.data || err);
          const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Unknown error';
          toast.error(`Failed to apply formula: ${errorMsg}`);
        }
      }

      // 3. Save permissions
      try {
        const canViewRoles = permissions.filter(p => p.canView).map(p => p.role);
        const canEditRoles = permissions.filter(p => p.canEdit).map(p => p.role);

        await api.post(`/sheets/${sheetId}/permissions/cell`, {
          cellId,
          canViewRoles,
          canEditRoles,
          canViewUsers: [],
          canEditUsers: [],
          isLocked: false
        });
        toast.success('Permissions saved');
        
        // Emit socket event for permission update
        socketService.emitPermissionUpdate({
          sheetId,
          cellId,
          permissions: { canViewRoles, canEditRoles },
          userId
        });
      } catch (err: any) {
        toast.error('Failed to save permissions: ' + (err.response?.data?.message || 'Unknown error'));
      }

      toast.success(`Cell ${cellId} updated successfully`);
      onClose();
    } catch (error: any) {
      toast.error('Failed to save cell: ' + (error.response?.data?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const getRoleColor = (roleValue: string) => {
    return AVAILABLE_ROLES.find(r => r.value === roleValue)?.color || '#757575';
  };

  const getRoleLabel = (roleValue: string) => {
    return AVAILABLE_ROLES.find(r => r.value === roleValue)?.label || roleValue;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h6">Edit Cell: {cellId}</Typography>
          <Chip label={cellId} color="primary" size="small" />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* Cell Value */}
        <Box mb={3}>
          <Typography variant="subtitle2" gutterBottom fontWeight="bold">
            Cell Value
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter cell value..."
            disabled={loading}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Formula Section */}
        <Box mb={2}>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' }, p: 1, borderRadius: 1 }}
            onClick={() => setShowFormulaSection(!showFormulaSection)}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <FunctionsIcon color="primary" />
              <Typography variant="subtitle2" fontWeight="bold">
                Formula (Optional)
              </Typography>
            </Box>
            <IconButton size="small">
              {showFormulaSection ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showFormulaSection}>
            <Box mt={2}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Formulas start with "=" (e.g., =SUM(A1:A10)). Click a formula below to insert it.
              </Alert>

              <Grid container spacing={1} mb={2}>
                {AVAILABLE_FORMULAS.map((f) => (
                  <Grid item xs={6} key={f.name}>
                    <Button
                      fullWidth
                      variant="outlined"
                      size="small"
                      onClick={() => insertFormula(f.example)}
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    >
                      <Box textAlign="left">
                        <Typography variant="caption" display="block" fontWeight="bold">
                          {f.name}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {f.description}
                        </Typography>
                      </Box>
                    </Button>
                  </Grid>
                ))}
              </Grid>

              <TextField
                fullWidth
                label="Formula"
                value={formula}
                onChange={(e) => {
                  setFormula(e.target.value);
                  if (e.target.value.startsWith('=')) {
                    setValue(e.target.value);
                  }
                }}
                placeholder="=SUM(A1:A10)"
                disabled={loading}
                helperText="Enter a formula starting with ="
              />
            </Box>
          </Collapse>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Permissions Section */}
        <Box>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'grey.50' }, p: 1, borderRadius: 1 }}
            onClick={() => setShowPermissionSection(!showPermissionSection)}
          >
            <Box display="flex" alignItems="center" gap={1}>
              <LockIcon color="secondary" />
              <Typography variant="subtitle2" fontWeight="bold">
                Role Permissions
              </Typography>
            </Box>
            <IconButton size="small">
              {showPermissionSection ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={showPermissionSection}>
            <Box mt={2}>
              <Alert severity="info" sx={{ mb: 2 }}>
                Control which roles can view or edit this specific cell. Unchecked = role cannot access.
              </Alert>

              <Box>
                {permissions.map((perm) => (
                  <Box
                    key={perm.role}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      p: 1.5,
                      mb: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      bgcolor: 'grey.50'
                    }}
                  >
                    <Chip
                      label={getRoleLabel(perm.role)}
                      size="small"
                      sx={{ bgcolor: getRoleColor(perm.role), color: 'white', minWidth: 180 }}
                    />
                    <Box display="flex" gap={2}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={perm.canView}
                            onChange={(e) => handlePermissionChange(perm.role, 'view', e.target.checked)}
                            disabled={loading}
                          />
                        }
                        label="Can View"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={perm.canEdit}
                            onChange={(e) => handlePermissionChange(perm.role, 'edit', e.target.checked)}
                            disabled={loading}
                          />
                        }
                        label="Can Edit"
                      />
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          </Collapse>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={loading || !cellId}
        >
          {loading ? 'Saving...' : 'Save Cell'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CellEditorModal;
