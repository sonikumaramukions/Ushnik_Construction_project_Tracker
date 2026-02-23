// ================================================================
// ANALYTICS ROUTES (routes/analytics.js)
// ================================================================
// PURPOSE: CEO/Admin executive dashboard data endpoints.
//
// These endpoints power the CEO's dashboard with business metrics:
//   GET /api/analytics/executive-summary  — All metrics in one call
//   GET /api/analytics/client-satisfaction — Customer satisfaction %
//   GET /api/analytics/profit-margin      — Company profit margin
//   GET /api/analytics/market-share       — Industry market share
//   GET /api/analytics/revenue-growth     — Year-over-year growth
//   GET /api/analytics/financial-trends   — Quarterly financials
//   GET /api/analytics/project-portfolio  — Projects by status
//
// ACCESS: L1_ADMIN and CEO only
// USES: services/AnalyticsService.js for calculations
// ================================================================

const express = require('express');
const router = express.Router();
const AnalyticsService = require('../services/AnalyticsService');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

/**
 * Analytics Routes
 * CEO and L1 Admin only
 */

/**
 * Get executive summary metrics
 * GET /api/analytics/executive-summary
 */
router.get('/executive-summary',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_EXECUTIVE_SUMMARY', 'ANALYTICS'),
    async (req, res) => {
        try {
            const summary = await AnalyticsService.getExecutiveSummary();

            res.status(200).json({
                success: true,
                data: summary,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching executive summary:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch executive summary',
                error: error.message,
            });
        }
    }
);

/**
 * Get client satisfaction score
 * GET /api/analytics/client-satisfaction
 */
router.get('/client-satisfaction',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_CLIENT_SATISFACTION', 'ANALYTICS'),
    async (req, res) => {
        try {
            const satisfaction = await AnalyticsService.getClientSatisfaction();

            res.status(200).json({
                success: true,
                data: { clientSatisfaction: satisfaction },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching client satisfaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch client satisfaction',
                error: error.message,
            });
        }
    }
);

/**
 * Get profit margin
 * GET /api/analytics/profit-margin
 */
router.get('/profit-margin',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_PROFIT_MARGIN', 'ANALYTICS'),
    async (req, res) => {
        try {
            const margin = await AnalyticsService.calculateProfitMargin();

            res.status(200).json({
                success: true,
                data: { profitMargin: margin },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching profit margin:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch profit margin',
                error: error.message,
            });
        }
    }
);

/**
 * Get market share
 * GET /api/analytics/market-share
 */
router.get('/market-share',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_MARKET_SHARE', 'ANALYTICS'),
    async (req, res) => {
        try {
            const marketShare = await AnalyticsService.getMarketShare();

            res.status(200).json({
                success: true,
                data: { marketShare },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching market share:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch market share',
                error: error.message,
            });
        }
    }
);

/**
 * Get revenue growth (YoY)
 * GET /api/analytics/revenue-growth
 */
router.get('/revenue-growth',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_REVENUE_GROWTH', 'ANALYTICS'),
    async (req, res) => {
        try {
            const growth = await AnalyticsService.calculateRevenueGrowth();

            res.status(200).json({
                success: true,
                data: { revenueGrowth: growth },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching revenue growth:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch revenue growth',
                error: error.message,
            });
        }
    }
);

/**
 * Get financial trends
 * GET /api/analytics/financial-trends?quarters=4
 */
router.get('/financial-trends',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_FINANCIAL_TRENDS', 'ANALYTICS'),
    async (req, res) => {
        try {
            const { quarters = 4 } = req.query;
            const trends = await AnalyticsService.getFinancialTrends(parseInt(quarters));

            res.status(200).json({
                success: true,
                data: { trends },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching financial trends:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch financial trends',
                error: error.message,
            });
        }
    }
);

/**
 * Get project portfolio analysis
 * GET /api/analytics/portfolio
 */
router.get('/portfolio',
    authenticateToken,
    authorizeRole(['L1_ADMIN', 'CEO']),
    auditLog('VIEW_PORTFOLIO', 'ANALYTICS'),
    async (req, res) => {
        try {
            const portfolio = await AnalyticsService.getProjectPortfolioAnalysis();

            res.status(200).json({
                success: true,
                data: portfolio,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Error fetching portfolio analysis:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch portfolio analysis',
                error: error.message,
            });
        }
    }
);

module.exports = router;
