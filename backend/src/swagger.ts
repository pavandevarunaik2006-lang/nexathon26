export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'RoadAlert API — Intelligent Traffic Incident Verification & Response Platform',
    version: '1.0.0',
    description:
      'REST API for coastal Karnataka (Mangaluru → Udupi) traffic incident reporting, explainable multi-level confidence scoring, privacy-first employee commute verification, and historical infrastructure analytics.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'API and PostgreSQL database health check',
        responses: { 200: { description: 'Healthy' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate user and issue JWT access & refresh tokens',
        responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a new PASSENGER or EMPLOYEE account',
        responses: { 201: { description: 'Created' } },
      },
    },
    '/incidents': {
      get: {
        summary: 'List incidents with category, severity, status, and confidence filters',
        responses: { 200: { description: 'Paginated incidents' } },
      },
      post: {
        summary: 'Report a new traffic incident with idempotency protection',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Incident created and scored' } },
      },
    },
    '/incidents/{id}': {
      get: {
        summary: 'Get incident details, explainable confidence breakdown, evidence, reviews, and audit trail',
        responses: { 200: { description: 'Detailed incident' } },
      },
    },
    '/incidents/{id}/corroborate': {
      post: {
        summary: 'Submit independent corroboration, dispute, or consented GPS congestion telemetry',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Recalculated confidence breakdown' } },
      },
    },
    '/incidents/{id}/evidence': {
      post: {
        summary: 'Upload validated photo/video evidence (max 10MB)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Evidence saved and confidence updated' } },
      },
    },
    '/incidents/{id}/review': {
      post: {
        summary: 'Traffic Authority review, confirmation, road-closure marking, or rejection',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Review recorded and audited' } },
      },
    },
    '/routes/plan': {
      post: {
        summary: 'Calculate origin-to-destination routes with incident delay & road-closure avoidance scoring',
        responses: { 200: { description: 'Evaluated route options' } },
      },
    },
    '/journeys': {
      post: {
        summary: 'Start an explicitly consented employee commute verification session',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Journey started' } },
      },
      get: {
        summary: 'List employee journeys and delay evidence',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Journeys list' } },
      },
    },
    '/employer/dashboard': {
      get: {
        summary: 'Organization-isolated employer commute verification summary (redacts precise coordinates by default)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Employer dashboard' } },
      },
    },
    '/authority/analytics': {
      get: {
        summary: 'SQL-aggregated historical incident analytics and CSV export',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Historical metrics' } },
      },
    },
  },
};
