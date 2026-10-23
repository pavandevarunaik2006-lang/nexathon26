import { Request, Response, NextFunction } from 'express';
import {
  getAuthorityDashboardMetrics,
  getAuthorityHotspots,
  getAuthorityAnalytics,
  listProblemReports,
  generateProblemReport,
} from '../services/authorityService.js';

export async function handleGetAuthorityDashboard(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAuthorityDashboardMetrics();
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAuthorityHotspots(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAuthorityHotspots();
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetAuthorityAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const period = String(req.query.period || 'monthly');
    const format = req.query.format ? String(req.query.format) : undefined;
    const result = await getAuthorityAnalytics(period, format);
    if (result.isCsv) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.csvContent);
      return;
    }
    res.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListProblemReports(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listProblemReports();
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateProblemReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await generateProblemReport(req.user!.userId, req.body);
    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
