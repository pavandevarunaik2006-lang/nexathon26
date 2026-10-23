import { Request, Response, NextFunction } from 'express';
import { analyzeIncidentTextHeuristic } from '../services/aiAssistantService.js';
import {
  listIncidentsFiltered,
  createIncidentReport,
  getIncidentDetailById,
  patchIncidentById,
  attachIncidentEvidence,
  submitIncidentCorroboration,
  flagSuspiciousIncident,
  reviewIncidentByAuthority,
  resolveIncidentByAuthority,
} from '../services/incidentService.js';

export async function handleAiAssist(req: Request, res: Response, next: NextFunction) {
  try {
    const { title = '', description = '', roadName = '' } = req.body || {};
    const suggestion = analyzeIncidentTextHeuristic(
      String(title),
      String(description),
      String(roadName)
    );
    res.json({
      success: true,
      data: suggestion,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleListIncidents(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listIncidentsFiltered(req.query);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCreateIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const headerKey = req.headers['x-idempotency-key'] as string | undefined;
    const result = await createIncidentReport(req.user!.userId, req.body, headerKey);
    res.status(result.statusCode).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetIncidentDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getIncidentDetailById(String(req.params.id));
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handlePatchIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await patchIncidentById(String(req.params.id), req.user!.userId, req.body);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleAttachEvidence(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await attachIncidentEvidence(
      String(req.params.id),
      req.user!.userId,
      req.file,
      req.body
    );
    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleCorroborateIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await submitIncidentCorroboration(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleFlagIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await flagSuspiciousIncident(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleReviewIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await reviewIncidentByAuthority(
      String(req.params.id),
      req.user!.userId,
      req.body
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleResolveIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await resolveIncidentByAuthority(
      String(req.params.id),
      req.user!.userId,
      req.body?.reason
    );
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}
