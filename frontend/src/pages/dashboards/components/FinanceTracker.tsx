// ================================================================
// FINANCE TRACKER (pages/dashboards/components/FinanceTracker.tsx)
// ================================================================
// PURPOSE: Financial management dashboard for L1 Admin / PM.
//
// FEATURES:
//   - COMPANY TAB: Summary cards, all financial records, year/quarter filters
//   - PROJECT TAB: Per-project finance, budget usage bars, budget exceed warnings
//   - QUARTERLY TAB: Quarterly breakdown with budget-per-quarter analysis
//   - CRUD for financial records linked to projects and sheets
//   - Auto-calculation of profit and margin
//   - Budget exceed warnings (80% warning, 90% critical, 100% exceeded)
//
// DATA: Calls /api/finance endpoints
// PARENT: AdminDashboard.tsx (rendered in "Finance" tab)
// ================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Chip,
  CircularProgress,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Tabs,
  Tab,
  LinearProgress,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon,
  MonetizationOn as MoneyIcon,
  Receipt as ReceiptIcon,
  Assessment as AssessmentIcon,
  Warning as WarningIcon,
  CalendarMonth as CalendarIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import api from '../../../services/api';

// ─── Types ───
interface FinancialRecord {
  id: string;
  quarter: number;
  year: number;
  revenue: number;
  profit: number;
  margin: number;
  operationalCost: number;
  expenses: number;
  recordDate: string;
  notes: string;
  projectId?: string;
  sheetId?: string;
  category?: string;
  description?: string;
  project?: { id: string; name: string };
  sheet?: { id: string; name: string };
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

interface FinanceSummary {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  averageMargin: number;
  recordCount: number;
}

interface BudgetWarning {
  projectId: string;
  projectName: string;
  estimatedBudget: number;
  totalSpent: number;
  percentUsed: number;
  status: 'WARNING' | 'CRITICAL' | 'EXCEEDED';
}

interface ProjectOption {
  id: string;
  name: string;
  estimatedBudget?: number;
  budget?: number;
  sheets?: Array<{ id: string; name: string }>;
}

interface ProjectFinanceData {
  project: { id: string; name: string; estimatedBudget: number };
  summary: {
    totalExpenses: number;
    totalRevenue: number;
    totalProfit: number;
    percentUsed: number;
    budgetStatus: string;
    remaining: number;
  };
  sheetBreakdown: Array<{
    sheetId: string | null;
    sheetName: string;
    totalExpenses: number;
    totalRevenue: number;
    recordCount: number;
  }>;
  records: FinancialRecord[];
}

interface QuarterlyData {
  year: number;
  quarter: number;
  label: string;
  totalRevenue: number;
  totalExpenses: number;
  totalOperationalCost: number;
  totalProfit: number;
  recordCount: number;
  budgetPerQuarter: number;
  totalSpent: number;
  overBudget: boolean;
  percentOfQuarterBudget: number;
}

interface RecordForm {
  quarter: number;
  year: number;
  revenue: string;
  expenses: string;
  operationalCost: string;
  profit: string;
  margin: string;
  recordDate: string;
  notes: string;
  projectId: string;
  sheetId: string;
  category: string;
  description: string;
}

const emptyForm: RecordForm = {
  quarter: Math.ceil((new Date().getMonth() + 1) / 3),
  year: new Date().getFullYear(),
  revenue: '',
  expenses: '',
  operationalCost: '',
  profit: '',
  margin: '',
  recordDate: new Date().toISOString().split('T')[0],
  notes: '',
  projectId: '',
  sheetId: '',
  category: 'GENERAL',
  description: '',
};

const CATEGORIES = ['GENERAL', 'MATERIAL', 'LABOR', 'EQUIPMENT', 'SUBCONTRACTOR', 'OVERHEAD'];

// ─── FINANCE TRACKER COMPONENT ───
const FinanceTracker: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({
    totalRevenue: 0, totalExpenses: 0, totalProfit: 0, averageMargin: 0, recordCount: 0,
  });
  const [budgetWarnings, setBudgetWarnings] = useState<BudgetWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FinancialRecord | null>(null);
  const [form, setForm] = useState<RecordForm>(emptyForm);

  // Projects & sheets
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSheets, setProjectSheets] = useState<Array<{ id: string; name: string }>>([]);

  // Filters
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterQuarter, setFilterQuarter] = useState<number | ''>('');
  const [filterProjectId, setFilterProjectId] = useState<string>('');

  // Project finance tab
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectFinance, setProjectFinance] = useState<ProjectFinanceData | null>(null);
  const [projectFinanceLoading, setProjectFinanceLoading] = useState(false);

  // Quarterly tab
  const [quarterlyProjectId, setQuarterlyProjectId] = useState<string>('');
  const [quarterlyData, setQuarterlyData] = useState<QuarterlyData[]>([]);
  const [quarterlyBudgetPerQuarter, setQuarterlyBudgetPerQuarter] = useState(0);
  const [quarterlyLoading, setQuarterlyLoading] = useState(false);

  // Budget dialog
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [budgetProjectId, setBudgetProjectId] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const response = await api.get('/projects');
      const data = response.data;
      const projectList = Array.isArray(data) ? data : (data.projects || []);
      setProjects(projectList);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  }, []);

  // Load main data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterYear) params.append('year', String(filterYear));
      if (filterQuarter) params.append('quarter', String(filterQuarter));
      if (filterProjectId) params.append('projectId', filterProjectId);

      const [recordsRes, summaryRes] = await Promise.allSettled([
        api.get(`/finance?${params.toString()}`),
        api.get('/finance/summary/overview'),
      ]);

      if (recordsRes.status === 'fulfilled' && recordsRes.value.data?.records) {
        setRecords(recordsRes.value.data.records);
      }
      if (summaryRes.status === 'fulfilled') {
        const d = summaryRes.value.data;
        if (d?.summary) setSummary(d.summary);
        if (d?.budgetWarnings) setBudgetWarnings(d.budgetWarnings);
      }
    } catch (err) {
      console.error('Failed to load financial data:', err);
      toast.error('Failed to load financial data');
    } finally {
      setLoading(false);
    }
  }, [filterYear, filterQuarter, filterProjectId]);

  // Load project finance
  const loadProjectFinance = useCallback(async (projectId: string) => {
    if (!projectId) { setProjectFinance(null); return; }
    try {
      setProjectFinanceLoading(true);
      const response = await api.get(`/finance/project/${projectId}`);
      if (response.data?.success) {
        setProjectFinance(response.data);
      }
    } catch (err) {
      console.error('Failed to load project finance:', err);
      toast.error('Failed to load project finance');
    } finally {
      setProjectFinanceLoading(false);
    }
  }, []);

  // Load quarterly data
  const loadQuarterlyData = useCallback(async (projectId: string) => {
    if (!projectId) { setQuarterlyData([]); return; }
    try {
      setQuarterlyLoading(true);
      const response = await api.get(`/finance/project/${projectId}/quarterly`);
      if (response.data?.success) {
        setQuarterlyData(response.data.quarterlyData || []);
        setQuarterlyBudgetPerQuarter(response.data.budgetPerQuarter || 0);
      }
    } catch (err) {
      console.error('Failed to load quarterly data:', err);
      toast.error('Failed to load quarterly data');
    } finally {
      setQuarterlyLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); loadProjects(); }, [loadData, loadProjects]);

  useEffect(() => {
    if (activeTab === 1 && selectedProjectId) loadProjectFinance(selectedProjectId);
  }, [activeTab, selectedProjectId, loadProjectFinance]);

  useEffect(() => {
    if (activeTab === 2 && quarterlyProjectId) loadQuarterlyData(quarterlyProjectId);
  }, [activeTab, quarterlyProjectId, loadQuarterlyData]);

  // Load sheets for selected project in form
  useEffect(() => {
    if (form.projectId) {
      const project = projects.find(p => p.id === form.projectId);
      if (project?.sheets) {
        setProjectSheets(project.sheets);
      } else {
        // Fetch sheets
        api.get(`/sheets?projectId=${form.projectId}`).then(res => {
          const sheets = res.data?.sheets || [];
          setProjectSheets(sheets);
        }).catch(() => setProjectSheets([]));
      }
    } else {
      setProjectSheets([]);
      setForm(prev => ({ ...prev, sheetId: '' }));
    }
  }, [form.projectId, projects]);

  // Auto-calculate profit and margin
  useEffect(() => {
    const rev = parseFloat(form.revenue) || 0;
    const exp = parseFloat(form.expenses) || 0;
    const profit = rev - exp;
    const margin = rev > 0 ? ((profit / rev) * 100) : 0;
    setForm(prev => ({
      ...prev,
      profit: profit.toFixed(2),
      margin: margin.toFixed(2),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.revenue, form.expenses]);

  const handleOpenCreate = (projectId?: string, sheetId?: string) => {
    setEditingRecord(null);
    setForm({
      ...emptyForm,
      projectId: projectId || '',
      sheetId: sheetId || '',
    });
    setShowDialog(true);
  };

  const handleOpenEdit = (record: FinancialRecord) => {
    setEditingRecord(record);
    setForm({
      quarter: record.quarter,
      year: record.year,
      revenue: String(record.revenue || 0),
      expenses: String(record.expenses || 0),
      operationalCost: String(record.operationalCost || 0),
      profit: String(record.profit || 0),
      margin: String(record.margin || 0),
      recordDate: record.recordDate ? record.recordDate.split('T')[0] : new Date().toISOString().split('T')[0],
      notes: record.notes || '',
      projectId: record.projectId || '',
      sheetId: record.sheetId || '',
      category: record.category || 'GENERAL',
      description: record.description || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    try {
      const payload: any = {
        quarter: Number(form.quarter),
        year: Number(form.year),
        revenue: parseFloat(form.revenue) || 0,
        expenses: parseFloat(form.expenses) || 0,
        operationalCost: parseFloat(form.operationalCost) || 0,
        profit: parseFloat(form.profit) || 0,
        margin: parseFloat(form.margin) || 0,
        recordDate: form.recordDate,
        notes: form.notes,
        category: form.category,
        description: form.description,
      };
      if (form.projectId) payload.projectId = form.projectId;
      if (form.sheetId) payload.sheetId = form.sheetId;

      if (editingRecord) {
        await api.put(`/finance/${editingRecord.id}`, payload);
        toast.success('Financial record updated');
      } else {
        await api.post('/finance', payload);
        toast.success('Financial record created');
      }

      setShowDialog(false);
      loadData();
      if (selectedProjectId) loadProjectFinance(selectedProjectId);
      if (quarterlyProjectId) loadQuarterlyData(quarterlyProjectId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save record');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this financial record? This cannot be undone.')) return;
    try {
      await api.delete(`/finance/${id}`);
      toast.success('Record deleted');
      loadData();
      if (selectedProjectId) loadProjectFinance(selectedProjectId);
      if (quarterlyProjectId) loadQuarterlyData(quarterlyProjectId);
    } catch (_error) {
      toast.error('Failed to delete record');
    }
  };

  const handleSaveBudget = async () => {
    if (!budgetProjectId || !budgetAmount) return;
    try {
      await api.put(`/finance/project/${budgetProjectId}/budget`, {
        estimatedBudget: parseFloat(budgetAmount),
      });
      toast.success('Estimated budget updated');
      setShowBudgetDialog(false);
      loadData();
      if (selectedProjectId === budgetProjectId) loadProjectFinance(selectedProjectId);
      if (quarterlyProjectId === budgetProjectId) loadQuarterlyData(quarterlyProjectId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update budget');
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

  const getBudgetColor = (pct: number): string => {
    if (pct >= 100) return '#d32f2f';
    if (pct >= 90) return '#ed6c02';
    if (pct >= 80) return '#ffa726';
    return '#4caf50';
  };

  // ═══════════════════════════════════════════
  // COMPANY TAB
  // ═══════════════════════════════════════════
  const renderCompanyTab = () => (
    <Box>
      {/* Budget Warnings */}
      {budgetWarnings.length > 0 && (
        <Box mb={3}>
          {budgetWarnings.map(w => (
            <Alert
              key={w.projectId}
              severity={w.status === 'EXCEEDED' ? 'error' : w.status === 'CRITICAL' ? 'warning' : 'info'}
              icon={<WarningIcon />}
              sx={{ mb: 1 }}
            >
              <AlertTitle>
                {w.status === 'EXCEEDED' ? '🚨 Budget Exceeded' : w.status === 'CRITICAL' ? '⚠️ Budget Critical' : '📊 Budget Warning'}
                {' — '}{w.projectName}
              </AlertTitle>
              {formatCurrency(w.totalSpent)} spent of {formatCurrency(w.estimatedBudget)} budget ({w.percentUsed}%)
            </Alert>
          ))}
        </Box>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: '4px solid #4caf50' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <MoneyIcon sx={{ color: '#4caf50', fontSize: 32 }} />
                <Box>
                  <Typography variant="h5" fontWeight="bold" color="success.main">
                    {formatCurrency(summary.totalRevenue)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Total Revenue</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: '4px solid #f44336' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <ReceiptIcon sx={{ color: '#f44336', fontSize: 32 }} />
                <Box>
                  <Typography variant="h5" fontWeight="bold" color="error.main">
                    {formatCurrency(summary.totalExpenses)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Total Expenses</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: `4px solid ${summary.totalProfit >= 0 ? '#2196f3' : '#ff9800'}` }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                {summary.totalProfit >= 0
                  ? <TrendingUpIcon sx={{ color: '#2196f3', fontSize: 32 }} />
                  : <TrendingDownIcon sx={{ color: '#ff9800', fontSize: 32 }} />}
                <Box>
                  <Typography variant="h5" fontWeight="bold" color={summary.totalProfit >= 0 ? 'primary.main' : 'warning.main'}>
                    {formatCurrency(summary.totalProfit)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Total Profit</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderLeft: '4px solid #9c27b0' }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1}>
                <AssessmentIcon sx={{ color: '#9c27b0', fontSize: 32 }} />
                <Box>
                  <Typography variant="h5" fontWeight="bold" color="secondary.main">
                    {formatPercent(summary.averageMargin)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Avg Margin ({summary.recordCount} records)
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Typography variant="subtitle2">Filters:</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Year</InputLabel>
          <Select value={filterYear} onChange={(e) => setFilterYear(e.target.value as number | '')} label="Year">
            <MenuItem value="">All Years</MenuItem>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Quarter</InputLabel>
          <Select value={filterQuarter} onChange={(e) => setFilterQuarter(e.target.value as number | '')} label="Quarter">
            <MenuItem value="">All Quarters</MenuItem>
            <MenuItem value={1}>Q1</MenuItem><MenuItem value={2}>Q2</MenuItem>
            <MenuItem value={3}>Q3</MenuItem><MenuItem value={4}>Q4</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Project</InputLabel>
          <Select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} label="Project">
            <MenuItem value="">All Projects</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" onClick={() => { setFilterYear(''); setFilterQuarter(''); setFilterProjectId(''); }} variant="text">
          Clear
        </Button>
      </Paper>

      {/* Records Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : records.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <AccountBalanceIcon sx={{ fontSize: 60, color: '#ccc', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No financial records found</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCreate()} sx={{ mt: 2 }}>
            Add First Record
          </Button>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Q/Year</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Project</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Sheet</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Revenue</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Expenses</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Profit</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Margin</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Notes</TableCell>
                <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id} hover>
                  <TableCell>
                    <Chip label={`Q${record.quarter} ${record.year}`} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{record.project?.name || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{record.sheet?.name || '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={record.category || 'GENERAL'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#4caf50', fontWeight: 'bold' }}>
                    {formatCurrency(record.revenue)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#f44336' }}>
                    {formatCurrency(record.expenses)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', color: record.profit >= 0 ? '#2196f3' : '#f44336' }}>
                    {formatCurrency(record.profit)}
                  </TableCell>
                  <TableCell align="right">
                    <Chip label={formatPercent(record.margin)} size="small"
                      color={record.margin >= 20 ? 'success' : record.margin >= 10 ? 'warning' : 'error'} />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={record.notes || 'No notes'}>
                      <Typography variant="caption" noWrap sx={{ maxWidth: 100, display: 'block' }}>
                        {record.notes || '-'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => handleOpenEdit(record)} title="Edit"><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(record.id)} title="Delete"><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );

  // ═══════════════════════════════════════════
  // PROJECT FINANCE TAB
  // ═══════════════════════════════════════════
  const renderProjectTab = () => (
    <Box>
      <Box display="flex" gap={2} alignItems="center" mb={3} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 250 }}>
          <InputLabel>Select Project</InputLabel>
          <Select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} label="Select Project">
            <MenuItem value="">— Choose a project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="outlined" size="small" startIcon={<MoneyIcon />}
          onClick={() => { setBudgetProjectId(selectedProjectId); setBudgetAmount(''); setShowBudgetDialog(true); }}
          disabled={!selectedProjectId}>
          Set Budget
        </Button>
        <Button variant="contained" size="small" startIcon={<AddIcon />}
          onClick={() => handleOpenCreate(selectedProjectId)}
          disabled={!selectedProjectId}>
          Add Record
        </Button>
      </Box>

      {!selectedProjectId ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <FolderIcon sx={{ fontSize: 60, color: '#ccc', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Select a project to view its finances</Typography>
        </Paper>
      ) : projectFinanceLoading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : projectFinance ? (
        <>
          {/* Budget Status */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              📊 {projectFinance.project.name} — Budget Status
            </Typography>
            {projectFinance.project.estimatedBudget > 0 ? (
              <>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="body2">
                    {formatCurrency(projectFinance.summary.totalExpenses)} / {formatCurrency(projectFinance.project.estimatedBudget)}
                  </Typography>
                  <Chip
                    label={projectFinance.summary.budgetStatus}
                    size="small"
                    color={
                      projectFinance.summary.budgetStatus === 'EXCEEDED' ? 'error' :
                      projectFinance.summary.budgetStatus === 'CRITICAL' ? 'warning' :
                      projectFinance.summary.budgetStatus === 'WARNING' ? 'info' : 'success'
                    }
                  />
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(projectFinance.summary.percentUsed, 100)}
                  sx={{
                    height: 12, borderRadius: 6,
                    bgcolor: '#e0e0e0',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: getBudgetColor(projectFinance.summary.percentUsed),
                      borderRadius: 6,
                    },
                  }}
                />
                <Box display="flex" justifyContent="space-between" mt={1}>
                  <Typography variant="caption" color="text.secondary">
                    {projectFinance.summary.percentUsed}% used
                  </Typography>
                  <Typography variant="caption" color={projectFinance.summary.remaining >= 0 ? 'success.main' : 'error.main'}>
                    {projectFinance.summary.remaining >= 0 ? 'Remaining' : 'Over budget'}: {formatCurrency(Math.abs(projectFinance.summary.remaining))}
                  </Typography>
                </Box>
                {projectFinance.summary.budgetStatus !== 'OK' && (
                  <Alert severity={projectFinance.summary.budgetStatus === 'EXCEEDED' ? 'error' : 'warning'} sx={{ mt: 2 }}>
                    {projectFinance.summary.budgetStatus === 'EXCEEDED'
                      ? `⚠️ This project has EXCEEDED its estimated budget by ${formatCurrency(Math.abs(projectFinance.summary.remaining))}!`
                      : `This project is at ${projectFinance.summary.percentUsed}% of its estimated budget. Review expenses carefully.`
                    }
                  </Alert>
                )}
              </>
            ) : (
              <Alert severity="info">
                No estimated budget set for this project. Click "Set Budget" to define one.
              </Alert>
            )}

            {/* Summary cards */}
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Revenue</Typography>
                <Typography variant="h6" color="success.main">{formatCurrency(projectFinance.summary.totalRevenue)}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Expenses</Typography>
                <Typography variant="h6" color="error.main">{formatCurrency(projectFinance.summary.totalExpenses)}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Profit</Typography>
                <Typography variant="h6" color={projectFinance.summary.totalProfit >= 0 ? 'primary.main' : 'error.main'}>
                  {formatCurrency(projectFinance.summary.totalProfit)}
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Per-Sheet Breakdown */}
          {projectFinance.sheetBreakdown.length > 0 && (
            <Paper sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>📋 Per-Sheet Breakdown</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>Sheet</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Revenue</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="right">Expenses</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }} align="center">Records</TableCell>
                    <TableCell align="center"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projectFinance.sheetBreakdown.map((sb, i) => (
                    <TableRow key={i} hover>
                      <TableCell>{sb.sheetName}</TableCell>
                      <TableCell align="right" sx={{ color: '#4caf50' }}>{formatCurrency(sb.totalRevenue)}</TableCell>
                      <TableCell align="right" sx={{ color: '#f44336' }}>{formatCurrency(sb.totalExpenses)}</TableCell>
                      <TableCell align="center"><Chip label={sb.recordCount} size="small" /></TableCell>
                      <TableCell align="center">
                        {sb.sheetId && (
                          <Button size="small" onClick={() => handleOpenCreate(selectedProjectId, sb.sheetId || '')}>
                            + Add
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          {/* Records table */}
          {projectFinance.records.length > 0 && (
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Q/Year</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Sheet</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Revenue</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Expenses</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="right">Profit</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }}>Notes</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', bgcolor: '#f5f5f5' }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projectFinance.records.map((record) => (
                    <TableRow key={record.id} hover>
                      <TableCell><Chip label={`Q${record.quarter} ${record.year}`} size="small" variant="outlined" /></TableCell>
                      <TableCell><Typography variant="caption">{record.sheet?.name || '-'}</Typography></TableCell>
                      <TableCell><Chip label={record.category || 'GENERAL'} size="small" variant="outlined" /></TableCell>
                      <TableCell align="right" sx={{ color: '#4caf50' }}>{formatCurrency(record.revenue)}</TableCell>
                      <TableCell align="right" sx={{ color: '#f44336' }}>{formatCurrency(record.expenses)}</TableCell>
                      <TableCell align="right" sx={{ color: record.profit >= 0 ? '#2196f3' : '#f44336', fontWeight: 'bold' }}>
                        {formatCurrency(record.profit)}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" noWrap sx={{ maxWidth: 100, display: 'block' }}>
                          {record.notes || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => handleOpenEdit(record)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(record.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      ) : null}
    </Box>
  );

  // ═══════════════════════════════════════════
  // QUARTERLY TAB
  // ═══════════════════════════════════════════
  const renderQuarterlyTab = () => (
    <Box>
      <Box display="flex" gap={2} alignItems="center" mb={3}>
        <FormControl size="small" sx={{ minWidth: 250 }}>
          <InputLabel>Select Project</InputLabel>
          <Select value={quarterlyProjectId} onChange={(e) => setQuarterlyProjectId(e.target.value)} label="Select Project">
            <MenuItem value="">— Choose a project —</MenuItem>
            {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        {quarterlyBudgetPerQuarter > 0 && (
          <Chip
            icon={<CalendarIcon />}
            label={`Budget per quarter: ${formatCurrency(quarterlyBudgetPerQuarter)}`}
            color="primary"
            variant="outlined"
          />
        )}
      </Box>

      {!quarterlyProjectId ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CalendarIcon sx={{ fontSize: 60, color: '#ccc', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">Select a project to view quarterly breakdown</Typography>
        </Paper>
      ) : quarterlyLoading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : quarterlyData.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">No quarterly data available</Typography>
          <Typography variant="body2" color="text.secondary">
            Ensure the project has start/end dates and financial records.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {quarterlyData.map((q) => (
            <Grid item xs={12} sm={6} md={4} key={q.label}>
              <Card sx={{
                border: q.overBudget ? '2px solid #f44336' : '1px solid #e0e0e0',
                position: 'relative',
              }}>
                {q.overBudget && (
                  <Chip
                    label="OVER BUDGET"
                    color="error"
                    size="small"
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  />
                )}
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" gutterBottom>
                    📅 {q.label}
                  </Typography>
                  <Divider sx={{ mb: 1 }} />

                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">Revenue</Typography>
                    <Typography variant="body2" color="success.main" fontWeight="bold">{formatCurrency(q.totalRevenue)}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">Expenses</Typography>
                    <Typography variant="body2" color="error.main">{formatCurrency(q.totalExpenses)}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">Op. Cost</Typography>
                    <Typography variant="body2" color="warning.main">{formatCurrency(q.totalOperationalCost)}</Typography>
                  </Box>
                  <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" color="text.secondary">Profit</Typography>
                    <Typography variant="body2" color={q.totalProfit >= 0 ? 'primary.main' : 'error.main'} fontWeight="bold">
                      {formatCurrency(q.totalProfit)}
                    </Typography>
                  </Box>

                  {q.budgetPerQuarter > 0 && (
                    <Box mt={1}>
                      <Box display="flex" justifyContent="space-between" mb={0.5}>
                        <Typography variant="caption">Budget Use</Typography>
                        <Typography variant="caption" fontWeight="bold" color={getBudgetColor(q.percentOfQuarterBudget)}>
                          {q.percentOfQuarterBudget}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(q.percentOfQuarterBudget, 100)}
                        sx={{
                          height: 8, borderRadius: 4,
                          bgcolor: '#e0e0e0',
                          '& .MuiLinearProgress-bar': {
                            bgcolor: getBudgetColor(q.percentOfQuarterBudget),
                            borderRadius: 4,
                          },
                        }}
                      />
                    </Box>
                  )}

                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {q.recordCount} record{q.recordCount !== 1 ? 's' : ''}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h4" fontWeight="bold">💰 Finance Tracker</Typography>
          <Typography variant="body2" color="text.secondary">
            Track revenue, expenses, and budgets across projects, sheets, and quarters
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <IconButton onClick={() => { loadData(); if (selectedProjectId) loadProjectFinance(selectedProjectId); }} title="Refresh">
            <RefreshIcon />
          </IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCreate()}>
            Add Record
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="fullWidth">
          <Tab icon={<AccountBalanceIcon />} label="Company Overview" iconPosition="start" />
          <Tab icon={<FolderIcon />} label="Project Finance" iconPosition="start" />
          <Tab icon={<CalendarIcon />} label="Quarterly" iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {activeTab === 0 && renderCompanyTab()}
      {activeTab === 1 && renderProjectTab()}
      {activeTab === 2 && renderQuarterlyTab()}

      {/* ═══ CREATE/EDIT DIALOG ═══ */}
      <Dialog open={showDialog} onClose={() => setShowDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRecord ? '✏️ Edit Financial Record' : '➕ New Financial Record'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {/* Project & Sheet */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Project</InputLabel>
                <Select
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value, sheetId: '' })}
                  label="Project"
                >
                  <MenuItem value="">None (Company-level)</MenuItem>
                  {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small" disabled={!form.projectId}>
                <InputLabel>Sheet</InputLabel>
                <Select value={form.sheetId} onChange={(e) => setForm({ ...form, sheetId: e.target.value })} label="Sheet">
                  <MenuItem value="">None (Project-level)</MenuItem>
                  {projectSheets.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            {/* Quarter & Year */}
            <Grid item xs={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Quarter</InputLabel>
                <Select value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value as number })} label="Quarter">
                  <MenuItem value={1}>Q1</MenuItem><MenuItem value={2}>Q2</MenuItem>
                  <MenuItem value={3}>Q3</MenuItem><MenuItem value={4}>Q4</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Year</InputLabel>
                <Select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value as number })} label="Year">
                  {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} label="Category">
                  {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Description"
                fullWidth size="small"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is this expense for?"
              />
            </Grid>

            <Grid item xs={12}><Divider>Financial Data</Divider></Grid>

            <Grid item xs={6}>
              <TextField label="Revenue (₹)" fullWidth size="small" type="number"
                value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })}
                InputProps={{ inputProps: { min: 0 } }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Expenses (₹)" fullWidth size="small" type="number"
                value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })}
                InputProps={{ inputProps: { min: 0 } }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Operational Cost (₹)" fullWidth size="small" type="number"
                value={form.operationalCost} onChange={(e) => setForm({ ...form, operationalCost: e.target.value })}
                InputProps={{ inputProps: { min: 0 } }} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Record Date" fullWidth size="small" type="date"
                value={form.recordDate} onChange={(e) => setForm({ ...form, recordDate: e.target.value })}
                InputLabelProps={{ shrink: true }} />
            </Grid>

            <Grid item xs={12}><Divider>Auto-Calculated</Divider></Grid>

            <Grid item xs={6}>
              <TextField label="Profit (₹)" fullWidth size="small" type="number"
                value={form.profit} InputProps={{ readOnly: true }}
                sx={{ bgcolor: '#f5f5f5' }} helperText="Revenue - Expenses" />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Margin (%)" fullWidth size="small" type="number"
                value={form.margin} InputProps={{ readOnly: true }}
                sx={{ bgcolor: '#f5f5f5' }} helperText="(Profit / Revenue) × 100" />
            </Grid>

            <Grid item xs={12}>
              <TextField label="Notes" fullWidth size="small" multiline rows={2}
                value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes..." />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {editingRecord ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ BUDGET DIALOG ═══ */}
      <Dialog open={showBudgetDialog} onClose={() => setShowBudgetDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>💰 Set Estimated Budget</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Project</InputLabel>
              <Select value={budgetProjectId} onChange={(e) => setBudgetProjectId(e.target.value)} label="Project">
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Estimated Budget (₹)"
              fullWidth size="small" type="number"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              InputProps={{ inputProps: { min: 0 } }}
              helperText="Warning at 80%, Critical at 90%, Alert at 100%"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBudgetDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveBudget} disabled={!budgetProjectId || !budgetAmount}>
            Save Budget
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FinanceTracker;
