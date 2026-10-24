import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError } from '../middleware/errorHandler.js';
import {
  startPassengerJourney,
  getActivePassengerJourney,
  monitorPassengerJourney,
  switchPassengerRoute,
  endPassengerJourney,
} from '../services/passengerJourneyService.js';

const StartPassengerJourneySchema = z.object({
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  originLat: z.number().min(-90).max(90),
  originLng: z.number().min(-180).max(180),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
  selectedRouteId: z.string().min(1, 'Selected route ID is required'),
  selectedRouteName: z.string().min(1, 'Selected route name is required'),
  distanceKm: z.number().positive(),
  baseDurationMin: z.number().positive(),
  routeGeometry: z.array(z.tuple([z.number(), z.number()])).min(2, 'Route geometry must have at least 2 points'),
});

const SwitchRouteSchema = z.object({
  alternativeRouteId: z.string().min(1, 'Alternative route ID is required'),
  reason: z.string().optional().default('Passenger selected Avoid This Route'),
});

export async function handleStartPassengerJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = StartPassengerJourneySchema.parse(req.body);
    const userId = req.user!.userId;

    const journey = await startPassengerJourney(userId, parsed);
    res.status(201).json({
      success: true,
      data: journey,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleGetActivePassengerJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const active = await getActivePassengerJourney(userId);

    res.json({
      success: true,
      data: active,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleMonitorPassengerJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const journeyId = String(req.params.id);

    if (!journeyId) {
      throw new ApiError(400, 'JOURNEY_ID_REQUIRED', 'Journey ID parameter is required');
    }

    const alert = await monitorPassengerJourney(userId, journeyId);
    res.json({
      success: true,
      data: alert,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleSwitchPassengerRoute(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const journeyId = String(req.params.id);
    const parsed = SwitchRouteSchema.parse(req.body);

    const updated = await switchPassengerRoute(
      userId,
      journeyId,
      parsed.alternativeRouteId,
      parsed.reason
    );

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function handleEndPassengerJourney(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const journeyId = String(req.params.id);

    const result = await endPassengerJourney(userId, journeyId);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
