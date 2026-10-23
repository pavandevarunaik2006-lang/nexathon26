import { Router } from 'express';
import {
  handleSearchLocations,
  handleReverseGeocode,
  handleGetMapIncidents,
  handlePlanRoute,
  handleGetPlannedRoute,
} from '../controllers/mapAndRoutesController.js';

export const mapAndRoutesRouter = Router();

mapAndRoutesRouter.get('/locations/search', handleSearchLocations);
mapAndRoutesRouter.get('/locations/reverse', handleReverseGeocode);
mapAndRoutesRouter.get('/map/incidents', handleGetMapIncidents);
mapAndRoutesRouter.post('/routes/plan', handlePlanRoute);
mapAndRoutesRouter.get('/routes/:id', handleGetPlannedRoute);
