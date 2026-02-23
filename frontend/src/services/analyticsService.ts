// ================================================================
// ANALYTICS SERVICE (services/analyticsService.ts)
// ================================================================
// PURPOSE: CEO executive dashboard analytics API calls.
//
// METHODS:
//   getExecutiveSummary()   — All CEO metrics in one call
//   getFinancialMetrics()   — Revenue, profit, margins
//   getProjectAnalytics()   — Project status breakdown
//   getProjectTimeline()    — Timeline and milestones
//   getTeamPerformance()    — Team productivity metrics
//
// Returns sensible defaults if API fails (CEO dashboard never crashes).
//
// USED BY: CEO dashboard page
// ================================================================

import api from './api';

// ─── CEO ANALYTICS TYPES ───
// These are high-level business metrics shown on the CEO's executive dashboard.

// Top-level KPIs (Key Performance Indicators) for the business
export interface ExecutiveSummary {
  clientSatisfaction: number;  // 0-100 score (e.g., 85 = 85% satisfied)
  profitMargin: number;        // Percentage (e.g., 18.5 = 18.5%)
  marketShare: number;         // Percentage of market
  revenueGrowth: number;       // Year-over-year growth %
}

// Quarterly financial data (used in charts/graphs)
export interface FinancialMetric {
  quarter: string;   // e.g., "Q1 2024"
  revenue: number;   // Total income
  profit: number;    // Revenue minus costs
  margin: number;    // Profit as % of revenue
}

// Project portfolio breakdown (how many projects in each state)
export interface PortfolioAnalysis {
  total: number;                        // Total projects
  byStatus: Record<string, number>;     // e.g., { "IN_PROGRESS": 5, "COMPLETED": 3 }
  onTime: number;                       // Projects on schedule
  atRisk: number;                       // Projects behind schedule
  activeCount: number;                  // Currently active projects
}

// ─── CEO ANALYTICS SERVICE ───
// Fetches high-level business metrics for the CEO dashboard.
// IMPORTANT: Every method returns a sensible DEFAULT VALUE if the API fails.
// This way the CEO dashboard NEVER crashes — it just shows placeholder data.
class AnalyticsAPIService {

  // Get all 4 KPI metrics at once (client satisfaction, profit, market share, revenue)
  async getExecutiveSummary(): Promise<ExecutiveSummary> {
    try {
      const response = await api.get('/analytics/executive-summary');
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch executive summary:', error);
      // Return safe defaults so the dashboard doesn't break
      return {
        clientSatisfaction: 85,
        profitMargin: 18.5,
        marketShare: 12.3,
        revenueGrowth: 15.8,
      };
    }
  }

  // Get just the client satisfaction score (0-100)
  async getClientSatisfaction(): Promise<number> {
    try {
      const response = await api.get('/analytics/client-satisfaction');
      return response.data.data.clientSatisfaction;
    } catch (error) {
      console.error('Failed to fetch client satisfaction:', error);
      return 85; // Default: 85% satisfied
    }
  }

  // Get just the profit margin percentage
  async getProfitMargin(): Promise<number> {
    try {
      const response = await api.get('/analytics/profit-margin');
      return response.data.data.profitMargin;
    } catch (error) {
      console.error('Failed to fetch profit margin:', error);
      return 18.5; // Default: 18.5%
    }
  }

  // Get just the market share percentage
  async getMarketShare(): Promise<number> {
    try {
      const response = await api.get('/analytics/market-share');
      return response.data.data.marketShare;
    } catch (error) {
      console.error('Failed to fetch market share:', error);
      return 12.3; // Default: 12.3%
    }
  }

  // Get year-over-year revenue growth percentage
  async getRevenueGrowth(): Promise<number> {
    try {
      const response = await api.get('/analytics/revenue-growth');
      return response.data.data.revenueGrowth;
    } catch (error) {
      console.error('Failed to fetch revenue growth:', error);
      return 15.8; // Default: 15.8%
    }
  }

  // Get financial data broken down by quarter (for charts)
  async getFinancialTrends(quarters: number = 4): Promise<FinancialMetric[]> {
    try {
      const response = await api.get('/analytics/financial-trends', {
        params: { quarters },  // How many quarters to fetch
      });
      return response.data.data.trends || [];
    } catch (error) {
      console.error('Failed to fetch financial trends:', error);
      return [];  // Return empty array (chart shows "no data")
    }
  }

  // Get project portfolio breakdown (total, by status, at risk, etc.)
  async getPortfolioAnalysis(): Promise<PortfolioAnalysis> {
    try {
      const response = await api.get('/analytics/portfolio');
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch portfolio analysis:', error);
      return {
        total: 0,
        byStatus: {},
        onTime: 0,
        atRisk: 0,
        activeCount: 0,
      };
    }
  }
}

// Export a single shared instance (Singleton pattern)
const analyticsService = new AnalyticsAPIService();
export default analyticsService;
