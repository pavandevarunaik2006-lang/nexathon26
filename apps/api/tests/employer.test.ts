import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/db/index.js';
import { seedDatabase, DEMO_IDS } from '../src/db/seedData.js';

process.env.NODE_ENV = 'test';

const app = createApp();

let employerToken = '';
let otherEmployerToken = '';
let employeeToken = '';
let registeredOrgId = '';
let registeredAdminToken = '';
let createdInviteCode = '';
let addedEmployeeId = '';

beforeAll(async () => {
  await db.init({ memory: true });
  await seedDatabase({ force: true });

  // Login primary employer
  const empRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employerToken = empRes.body.data.accessToken;

  // Login other employer
  const otherRes = await request(app).post('/api/v1/auth/login').send({
    email: 'other.employer@roadalert.in',
    password: 'RoadAlert@2026',
  });
  otherEmployerToken = otherRes.body.data.accessToken;

  // Login employee
  const employeeRes = await request(app).post('/api/v1/auth/login').send({
    email: 'employee@roadalert.in',
    password: 'RoadAlert@2026',
  });
  employeeToken = employeeRes.body.data.accessToken;
});

describe('RoadAlert Employer / Company Module — Full Test Suite', () => {
  it('1. Allows self-service company registration and returns organization profile with JWT tokens', async () => {
    const regRes = await request(app).post('/api/v1/auth/register-company').send({
      organizationName: 'Udupi Robotics & Automation Hub',
      organizationType: 'LOGISTICS_TECH',
      contactEmail: 'contact@udupirobotics.in',
      contactPhone: '+91 820 2599999',
      address: 'NH-66 Karavali Bypass, Udupi',
      city: 'Udupi',
      defaultShiftStart: '09:00',
      defaultShiftEnd: '18:00',
      adminName: 'Suresh Bhat',
      adminEmail: 'suresh.bhat@udupirobotics.in',
      adminPassword: 'RoadAlert@2026',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.organization.id).toBeDefined();
    expect(regRes.body.data.user.role).toBe('EMPLOYER');
    expect(regRes.body.data.user.membershipRole).toBe('EMPLOYER_ADMIN');
    expect(regRes.body.data.accessToken).toBeDefined();

    registeredOrgId = regRes.body.data.organization.id;
    registeredAdminToken = regRes.body.data.accessToken;
  });

  it('2. Retrieves and updates organization profile and commute shift policies', async () => {
    const profRes = await request(app)
      .get('/api/v1/employer/profile')
      .set('Authorization', `Bearer ${registeredAdminToken}`);

    expect(profRes.status).toBe(200);
    expect(profRes.body.data.name).toBe('Udupi Robotics & Automation Hub');
    expect(profRes.body.data.city).toBe('Udupi');

    const updateRes = await request(app)
      .patch('/api/v1/employer/profile')
      .set('Authorization', `Bearer ${registeredAdminToken}`)
      .send({
        description: 'Pioneering coastal Karnataka automated logistics on NH-66',
        contactPhone: '+91 820 2598888',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.description).toContain('Pioneering coastal');
    expect(updateRes.body.data.contact_phone).toBe('+91 820 2598888');
  });

  it('3. Fetches employer dashboard with summary KPI cards, active journeys, and sample display records', async () => {
    const dashRes = await request(app)
      .get('/api/v1/employer/dashboard')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(dashRes.status).toBe(200);
    expect(dashRes.body.success).toBe(true);

    const { metrics, activeJourneys, sampleDisplayJourneys } = dashRes.body.data;
    expect(metrics.totalEmployees).toBeGreaterThanOrEqual(2);
    expect(metrics.travellingCount).toBeGreaterThanOrEqual(1);
    expect(metrics.delayedCount).toBeGreaterThanOrEqual(1);
    expect(metrics.verifiedDelaysCount).toBeGreaterThanOrEqual(1);
    expect(metrics.avgVerifiedDelayMin).toBeGreaterThan(0);

    // Verify sample display records exist as requested in prompt section 3
    expect(sampleDisplayJourneys.length).toBe(3);
    expect(sampleDisplayJourneys[0].employee).toContain('Employee 1');
    expect(sampleDisplayJourneys[0].route).toBe('Mangaluru–Udupi');
    expect(sampleDisplayJourneys[0].verification).toBe('Verified');
    expect(sampleDisplayJourneys[1].route).toBe('Ullal–Mangaluru');
    expect(sampleDisplayJourneys[1].status).toBe('Normal');

    // Verify real active journeys have clean verification details
    expect(activeJourneys.length).toBeGreaterThanOrEqual(1);
    const activeCommute = activeJourneys.find((j: any) => j.id === DEMO_IDS.journeys.activeCommute);
    expect(activeCommute).toBeDefined();
    expect(activeCommute.verificationStatus).toBe('VERIFIED');
    expect(['Traffic', 'Road Block']).toContain(activeCommute.status);
  });

  it('4. Allows registering a new employee with usual commute route and prevents duplicate association', async () => {
    const addRes = await request(app)
      .post('/api/v1/employer/employees')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        name: 'Ganesh Naik',
        email: 'ganesh.naik@karavalitech.in',
        membershipRole: 'EMPLOYEE',
        department: 'Embedded Systems',
        employeeCode: 'EMP-305',
        usualCommuteOrigin: 'Mulki Bus Stand (NH-66)',
        usualCommuteDestination: 'Pumpwell Circle, Mangaluru (NH-66)',
        usualCommuteOriginLat: 13.0908,
        usualCommuteOriginLng: 74.7864,
        usualCommuteDestLat: 12.8669,
        usualCommuteDestLng: 74.8692,
        usualCommuteCorridor: 'NH-66 Coastal',
        shiftStartTime: '09:00',
        shiftEndTime: '18:00',
      });

    expect(addRes.status).toBe(201);
    expect(addRes.body.data.name).toBe('Ganesh Naik');
    expect(addRes.body.data.membershipRole).toBe('EMPLOYEE');
    addedEmployeeId = addRes.body.data.userId;

    // Attempting to register the same employee to the same organization should return 409
    const dupRes = await request(app)
      .post('/api/v1/employer/employees')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        name: 'Ganesh Naik',
        email: 'ganesh.naik@karavalitech.in',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe('DUPLICATE_MEMBERSHIP');
  });

  it('5. Lists organization employees with assigned usual commute routes and shift details', async () => {
    const listRes = await request(app)
      .get('/api/v1/employer/employees')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(3);

    const ananya = listRes.body.data.find((e: any) => e.email === 'employee@roadalert.in');
    expect(ananya).toBeDefined();
    expect(ananya.usualCommuteRoute).toContain('Udupi');
    expect(ananya.department).toBe('Platform Engineering');
    expect(ananya.activeConsentsCount).toBeGreaterThanOrEqual(1);
  });

  it('6. Allows updating an employee’s commute route and department', async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/employer/employees/${addedEmployeeId}`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        department: 'Senior Embedded Firmware',
        usualCommuteDestination: 'KPT Junction, Mangaluru (NH-66)',
        shiftStartTime: '08:30',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.department).toBe('Senior Embedded Firmware');
    expect(patchRes.body.data.usual_commute_destination).toBe('KPT Junction, Mangaluru (NH-66)');
  });

  it('7. Supports employee invitation creation and acceptance flow', async () => {
    // 1. Employer creates invitation
    const invRes = await request(app)
      .post('/api/v1/employer/invitations')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        email: 'priya.hegde@karavalitech.in',
        membershipRole: 'EMPLOYEE',
        department: 'Mobile Apps',
        usualCommuteOrigin: 'Surathkal NITK Toll Gate (NH-66)',
        usualCommuteDestination: 'Pumpwell Circle, Mangaluru (NH-66)',
      });

    expect(invRes.status).toBe(201);
    expect(invRes.body.data.inviteCode).toBeDefined();
    createdInviteCode = invRes.body.data.inviteCode;

    // 2. Public inspects invitation link
    const inspectRes = await request(app).get(`/api/v1/auth/invites/${createdInviteCode}`);
    expect(inspectRes.status).toBe(200);
    expect(inspectRes.body.data.email).toBe('priya.hegde@karavalitech.in');
    expect(inspectRes.body.data.organizationName).toContain('Karavali');

    // 3. Employee accepts invitation and registers
    const acceptRes = await request(app).post('/api/v1/auth/accept-invite').send({
      inviteCode: createdInviteCode,
      name: 'Priya Hegde',
      password: 'RoadAlert@2026',
    });

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.user.email).toBe('priya.hegde@karavalitech.in');
    expect(acceptRes.body.data.accessToken).toBeDefined();

    // 4. Second attempt with same code fails
    const reAcceptRes = await request(app).post('/api/v1/auth/accept-invite').send({
      inviteCode: createdInviteCode,
      name: 'Priya Hegde',
      password: 'RoadAlert@2026',
    });
    expect(reAcceptRes.status).toBe(400);
  });

  it('8. Enforces strict organization isolation on employee management and journey inspections', async () => {
    // Other employer attempts to view primary organization's employees
    const crossRes = await request(app)
      .get(`/api/v1/employer/employees?organizationId=${DEMO_IDS.orgs.primary}`)
      .set('Authorization', `Bearer ${otherEmployerToken}`);

    expect(crossRes.status).toBe(403);
    expect(crossRes.body.error.code).toBe('ORGANIZATION_ISOLATION_VIOLATION');

    // Other employer attempts to inspect primary org journey
    const crossJourneyRes = await request(app)
      .get(`/api/v1/employer/journeys/${DEMO_IDS.journeys.activeCommute}`)
      .set('Authorization', `Bearer ${otherEmployerToken}`);

    expect(crossJourneyRes.status).toBe(403);
    expect(crossJourneyRes.body.error.code).toBe('ORGANIZATION_ISOLATION_VIOLATION');
  });

  it('9. Retrieves detailed employee journey with evidence-based delay verification and redacted GPS coordinates', async () => {
    const detailRes = await request(app)
      .get(`/api/v1/employer/journeys/${DEMO_IDS.journeys.activeCommute}`)
      .set('Authorization', `Bearer ${employerToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.success).toBe(true);

    const j = detailRes.body.data;
    expect(j.employeeName).toBe('Ananya Rao (Demo Employee)');
    expect(['Traffic', 'Road Block', 'Delayed']).toContain(j.status);
    expect(j.preciseCoordinatesRedacted).toBe(true);
    expect(j.originLat).toBeUndefined();

    // Check evidence-based delay verification details
    expect(j.verification).toBeDefined();
    expect(j.verification.verificationStatus).toBe('VERIFIED');
    expect(j.verification.conclusionText).toContain('Available employee GPS observations');
    expect(j.verification.incidentDetails.length).toBeGreaterThanOrEqual(1);

    // Verify checkpoints are redacted
    expect(j.checkpoints.length).toBe(3);
    for (const cp of j.checkpoints) {
      expect(cp.coordinateRedacted).toBe(true);
      expect(cp.latitude).toBeUndefined();
    }
  });

  it('10. Re-evaluates delay verification on demand and preserves evidence record in delay_verifications table', async () => {
    const verifyRes = await request(app)
      .post(`/api/v1/employer/journeys/${DEMO_IDS.journeys.activeCommute}/verify-delay`)
      .set('Authorization', `Bearer ${employerToken}`)
      .send();

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.verificationStatus).toBe('VERIFIED');
    expect(verifyRes.body.data.spatialIntersection).toBe(true);
    expect(verifyRes.body.data.speedDropDetected).toBe(true);
  });

  it('11. Lists all delay verification records for an organization', async () => {
    const verListRes = await request(app)
      .get('/api/v1/employer/verifications')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(verListRes.status).toBe(200);
    expect(verListRes.body.data.length).toBeGreaterThanOrEqual(2);
    for (const v of verListRes.body.data) {
      expect(['VERIFIED', 'PARTIALLY_VERIFIED', 'UNVERIFIED', 'NOT_TRAFFIC_RELATED']).toContain(
        v.verificationStatus
      );
      expect(v.conclusionText).toBeTruthy();
    }
  });

  it('12. Allows employer to remove an employee association and revokes organization tracking consent', async () => {
    const delRes = await request(app)
      .delete(`/api/v1/employer/employees/${addedEmployeeId}`)
      .set('Authorization', `Bearer ${employerToken}`);

    expect(delRes.status).toBe(200);

    // Verify employee is no longer in organization's employee list
    const listRes = await request(app)
      .get('/api/v1/employer/employees')
      .set('Authorization', `Bearer ${employerToken}`);

    expect(listRes.body.data.some((e: any) => e.id === addedEmployeeId)).toBe(false);
  });
});
