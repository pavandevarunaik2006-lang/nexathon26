import bcrypt from 'bcryptjs';
import { db } from './index.js';
import { recalculateIncidentConfidence } from '../services/verificationEngine.js';
import { evaluateJourneyDelay } from '../services/delayVerificationService.js';

export const DEMO_IDS = {
  users: {
    passenger: '11111111-1111-4111-8111-111111111101',
    employee: '11111111-1111-4111-8111-111111111102',
    employee2: '11111111-1111-4111-8111-111111111106',
    employer: '11111111-1111-4111-8111-111111111103',
    employerOther: '11111111-1111-4111-8111-111111111107',
    authority: '11111111-1111-4111-8111-111111111104',
    admin: '11111111-1111-4111-8111-111111111105',
  },
  orgs: {
    primary: '22222222-2222-4222-8222-222222222201',
    secondary: '22222222-2222-4222-8222-222222222202',
  },
  consents: {
    employeeActive: '33333333-3333-4333-8333-333333333301',
    employee2Active: '33333333-3333-4333-8333-333333333302',
  },
  journeys: {
    activeCommute: '44444444-4444-4444-8444-444444444401',
    completedCommute: '44444444-4444-4444-8444-444444444402',
    employee2Commute: '44444444-4444-4444-8444-444444444403',
  },
};

export async function seedDatabase(options?: { force?: boolean }): Promise<void> {
  await db.init();

  const existingUsers = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM users`);
  if (Number(existingUsers.rows[0]?.count || 0) > 0 && !options?.force) {
    return;
  }

  // Clear existing data in reverse foreign-key order if force re-seeding
  await db.exec(`
    DELETE FROM delay_verifications;
    DELETE FROM organization_invitations;
    DELETE FROM problem_reports;
    DELETE FROM complaints;
    DELETE FROM audit_logs;
    DELETE FROM incident_reviews;
    DELETE FROM notifications;
    DELETE FROM organization_tracking_policies;
    DELETE FROM journey_checkpoints;
    DELETE FROM journeys;
    DELETE FROM tracking_consents;
    DELETE FROM incident_corroborations;
    DELETE FROM incident_evidences;
    DELETE FROM incidents;
    DELETE FROM organization_memberships;
    DELETE FROM organizations;
    DELETE FROM users;
    DELETE FROM system_configs;
  `);

  const passwordHash = await bcrypt.hash('RoadAlert@2026', 10);

  // 1. Seed Users (5 required roles + secondary employee & secondary employer for isolation testing)
  const users = [
    {
      id: DEMO_IDS.users.passenger,
      name: 'Karthik Shetty (Demo Passenger)',
      email: 'passenger@roadalert.in',
      role: 'PASSENGER',
    },
    {
      id: DEMO_IDS.users.employee,
      name: 'Ananya Rao (Demo Employee)',
      email: 'employee@roadalert.in',
      role: 'EMPLOYEE',
    },
    {
      id: DEMO_IDS.users.employee2,
      name: 'Rohan Kamath (Surathkal Commuter)',
      email: 'rohan.employee@roadalert.in',
      role: 'EMPLOYEE',
    },
    {
      id: DEMO_IDS.users.employer,
      name: 'Vikram Pai (Karavali Tech Operations)',
      email: 'employer@roadalert.in',
      role: 'EMPLOYER',
    },
    {
      id: DEMO_IDS.users.employerOther,
      name: 'Meera Shenoy (Udupi FinCorp HR)',
      email: 'other.employer@roadalert.in',
      role: 'EMPLOYER',
    },
    {
      id: DEMO_IDS.users.authority,
      name: 'ACP Praveen Nayak (Mangaluru Traffic Control)',
      email: 'authority@roadalert.in',
      role: 'TRAFFIC_AUTHORITY',
    },
    {
      id: DEMO_IDS.users.admin,
      name: 'Siddharth Alva (System Administrator)',
      email: 'admin@roadalert.in',
      role: 'ADMIN',
    },
  ];

  for (const u of users) {
    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [u.id, u.name, u.email, passwordHash, u.role]
    );
  }

  // 2. Seed Organizations & Memberships
  await db.query(
    `INSERT INTO organizations (
      id, name, organization_type, contact_email, contact_phone,
      address, city, default_shift_start, default_shift_end, status
    ) VALUES
     ($1, 'Karavali Coastal Tech Park Pvt Ltd (Mangaluru)', 'IT_ENTERPRISE', 'ops@karavalitech.in', '+91 824 2490001', 'Kavoor NH-66 Corridor, Mangaluru, KA 575015', 'Mangaluru', '09:00', '18:00', 'ACTIVE'),
     ($2, 'Udupi FinCorp Coastal Services', 'FINANCIAL_SERVICES', 'hr@udupifincorp.in', '+91 820 2520002', 'Karavali Bypass Road, Udupi, KA 576101', 'Udupi', '09:30', '18:30', 'ACTIVE')`,
    [DEMO_IDS.orgs.primary, DEMO_IDS.orgs.secondary]
  );

  await db.query(
    `INSERT INTO organization_memberships (
      id, organization_id, user_id, membership_role, status,
      department, employee_code, usual_commute_origin, usual_commute_destination,
      usual_commute_origin_lat, usual_commute_origin_lng, usual_commute_dest_lat,
      usual_commute_dest_lng, usual_commute_corridor, shift_start_time, shift_end_time, notes
    ) VALUES
     ('22222222-2222-4222-8222-222222222211', $1, $3, 'EMPLOYER_ADMIN', 'ACTIVE', 'Operations Management', 'EMP-001', 'Hampankatta / State Bank, Mangaluru', 'Pumpwell Circle, Mangaluru (NH-66)', 12.8698, 74.8431, 12.8669, 74.8692, 'Mangaluru Central', '08:30', '17:30', 'Company Administrator'),
     ('22222222-2222-4222-8222-222222222212', $1, $4, 'EMPLOYEE', 'ACTIVE', 'Platform Engineering', 'EMP-104', 'Udupi Karavali Bypass (NH-66)', 'Pumpwell Circle, Mangaluru (NH-66)', 13.3409, 74.7351, 12.8669, 74.8692, 'NH-66 Coastal Corridor', '09:00', '18:00', 'Daily intercity NH-66 commuter'),
     ('22222222-2222-4222-8222-222222222213', $1, $5, 'EMPLOYEE', 'ACTIVE', 'Infrastructure & Quality', 'EMP-208', 'Surathkal NITK Toll Gate (NH-66)', 'Nanthoor Junction, Mangaluru (NH-66)', 13.0108, 74.7943, 12.8825, 74.8648, 'NH-66 North Corridor', '09:30', '18:30', 'Surathkal coastal transit'),
     ('22222222-2222-4222-8222-222222222214', $2, $6, 'EMPLOYER_ADMIN', 'ACTIVE', 'People Operations', 'FIN-001', 'Kaup (Kapu) Junction (NH-66)', 'Udupi Karavali Bypass (NH-66)', 13.2244, 74.7484, 13.3409, 74.7351, 'Udupi South', '09:00', '18:00', 'HR Operations Lead')`,
    [
      DEMO_IDS.orgs.primary,
      DEMO_IDS.orgs.secondary,
      DEMO_IDS.users.employer,
      DEMO_IDS.users.employee,
      DEMO_IDS.users.employee2,
      DEMO_IDS.users.employerOther,
    ]
  );

  // Seed sample invitation
  await db.query(
    `INSERT INTO organization_invitations (
      id, organization_id, email, invite_code, membership_role,
      department, usual_commute_origin, usual_commute_destination, status, created_by, expires_at
    ) VALUES (
      '22222222-2222-4222-8222-222222222288', $1, 'new.hire@karavalitech.in', 'ROAD-DEMO2026', 'EMPLOYEE',
      'Data Analytics', 'KPT Junction, Mangaluru (NH-66)', 'Pumpwell Circle, Mangaluru (NH-66)',
      'PENDING', $2, NOW() + INTERVAL '7 days'
    )`,
    [DEMO_IDS.orgs.primary, DEMO_IDS.users.employer]
  );

  // 3. Seed Organization Tracking Policies
  await db.query(
    `INSERT INTO organization_tracking_policies (id, organization_id, tracking_mode, retention_days, require_consent, allow_precise_coordinate)
     VALUES
     ('22222222-2222-4222-8222-222222222291', $1, 'SESSION_ONLY_EXPLICIT', 30, TRUE, FALSE),
     ('22222222-2222-4222-8222-222222222292', $2, 'SESSION_ONLY_EXPLICIT', 14, TRUE, FALSE)`,
    [DEMO_IDS.orgs.primary, DEMO_IDS.orgs.secondary]
  );

  // 4. Seed 18 Realistic Coastal Karnataka Incidents (Mangaluru -> Udupi NH-66 & NH-75)
  const now = Date.now();
  const hourMs = 3600 * 1000;
  const dayMs = 24 * hourMs;

  const incidents = [
    {
      id: '55555555-5555-4555-8555-555555555501',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Severe Monsoon Waterlogging Under Pumpwell Flyover Service Road',
      description:
        '[SEEDED DEMO DATA] Heavy water accumulation (1.5 ft) on the Pumpwell Circle NH-66 underpass service road toward Nanthoor and Kankanady. Two-wheelers and low-floor sedans are stalling; traffic diverted onto single elevated lane.',
      category: 'Flood/waterlogging',
      severity: 'CRITICAL',
      latitude: 12.8669,
      longitude: 74.8692,
      roadName: 'Pumpwell Circle, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 1.5 * hourMs).toISOString(),
      reportedAt: new Date(now - 1.4 * hourMs).toISOString(),
      status: 'VERIFIED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 35,
    },
    {
      id: '55555555-5555-4555-8555-555555555502',
      reporterId: DEMO_IDS.users.employee,
      title: 'Multi-Axle Container Breakdown on Thokkottu Flyover Ramp',
      description:
        '[SEEDED DEMO DATA] Loaded container truck suffered a broken rear axle on the northbound incline of Thokkottu Flyover (NH-66 Ullal-Mangaluru corridor), blocking the left carriageway ahead of Netravati Bridge.',
      category: 'Vehicle breakdown',
      severity: 'HIGH',
      latitude: 12.8127,
      longitude: 74.8615,
      roadName: 'Thokkottu Flyover, NH-66 South',
      occurrenceTime: new Date(now - 2.2 * hourMs).toISOString(),
      reportedAt: new Date(now - 2.0 * hourMs).toISOString(),
      status: 'VERIFIED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 28,
    },
    {
      id: '55555555-5555-4555-8555-555555555503',
      reporterId: DEMO_IDS.users.employee2,
      title: 'Emergency Culvert & Approach Concreting Closure at Mulki Junction',
      description:
        '[SEEDED DEMO DATA] NHAI emergency culvert slab stabilization at Mulki Bappanadu stretch on NH-66. Northbound main carriageway towards Padubidri and Udupi is barricaded; contraflow operating with heavy queue.',
      category: 'Road closure',
      severity: 'CRITICAL',
      latitude: 13.0908,
      longitude: 74.7864,
      roadName: 'Mulki Junction, NH-66 Coastal Corridor',
      occurrenceTime: new Date(now - 3.5 * hourMs).toISOString(),
      reportedAt: new Date(now - 3.2 * hourMs).toISOString(),
      status: 'VERIFIED',
      authorityConfirmed: true,
      roadClosed: true,
      estimatedDelayMinutes: 45,
    },
    {
      id: '55555555-5555-4555-8555-555555555504',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Traffic Signal Failure & Multi-Directional Gridlock at Nanthoor Circle',
      description:
        '[SEEDED DEMO DATA] Primary signal controller at Nanthoor Junction (NH-66 / NH-73 Bikarnakatte intersection) is dark following power surge. Long tailbacks toward KPT and Bikarnakatte flyover approach.',
      category: 'Traffic signal failure',
      severity: 'HIGH',
      latitude: 12.8825,
      longitude: 74.8648,
      roadName: 'Nanthoor Junction, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 1.1 * hourMs).toISOString(),
      reportedAt: new Date(now - 1.0 * hourMs).toISOString(),
      status: 'VERIFIED',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 22,
    },
    {
      id: '55555555-5555-4555-8555-555555555505',
      reporterId: DEMO_IDS.users.employee2,
      title: 'Rear-End Collision Near Surathkal NITK Toll Plaza Approach',
      description:
        '[SEEDED DEMO DATA] Two-car minor collision near NITK Surathkal beach road intersection on NH-66. Right fast lane partially obstructed while highway patrol documents the scene.',
      category: 'Accident',
      severity: 'HIGH',
      latitude: 13.0108,
      longitude: 74.7943,
      roadName: 'Surathkal NITK Approach, NH-66',
      occurrenceTime: new Date(now - 0.8 * hourMs).toISOString(),
      reportedAt: new Date(now - 0.7 * hourMs).toISOString(),
      status: 'UNDER_REVIEW',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 20,
    },
    {
      id: '55555555-5555-4555-8555-555555555506',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Expansion Joint Maintenance on Kuloor Old Arch Bridge',
      description:
        '[SEEDED DEMO DATA] PWD bridge inspection and bearing maintenance on Kuloor Bridge across Phalguni River. Heavy commercial vehicles restricted to single outer lane.',
      category: 'Bridge/road maintenance',
      severity: 'MEDIUM',
      latitude: 12.9261,
      longitude: 74.8267,
      roadName: 'Kuloor Bridge, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 5 * hourMs).toISOString(),
      reportedAt: new Date(now - 4.8 * hourMs).toISOString(),
      status: 'VERIFIED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 18,
    },
    {
      id: '55555555-5555-4555-8555-555555555507',
      reporterId: DEMO_IDS.users.employee,
      title: 'Temple Rathotsava Procession Diversion at Padubidri Town',
      description:
        '[SEEDED DEMO DATA] Annual cultural procession crossing Padubidri Karkala SH-1 / NH-66 junction. Local police managing intermittent 15-minute traffic holds.',
      category: 'Festival/public event',
      severity: 'MEDIUM',
      latitude: 13.1422,
      longitude: 74.7731,
      roadName: 'Padubidri Junction, NH-66 / SH-1',
      occurrenceTime: new Date(now - 2.8 * hourMs).toISOString(),
      reportedAt: new Date(now - 2.6 * hourMs).toISOString(),
      status: 'UNDER_REVIEW',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 16,
    },
    {
      id: '55555555-5555-4555-8555-555555555508',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Surface Trenching & Pipeline Repair at KPT Junction Service Lane',
      description:
        '[SEEDED DEMO DATA] Underground water main repair near KPT polytechnic entrance causing bottleneck for Airport Road (Bondel) turning traffic.',
      category: 'Road repair/construction',
      severity: 'MEDIUM',
      latitude: 12.8935,
      longitude: 74.8594,
      roadName: 'KPT Junction, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 6 * hourMs).toISOString(),
      reportedAt: new Date(now - 5.5 * hourMs).toISOString(),
      status: 'REPORTED',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 14,
    },
    {
      id: '55555555-5555-4555-8555-555555555509',
      reporterId: DEMO_IDS.users.employee2,
      title: 'Heavy Coastal Downpour & Reduced Visibility Near Kaup (Kapu) Bypass',
      description:
        '[SEEDED DEMO DATA] Intense monsoon squall between Uchila and Kaup on NH-66. Standing water sheets in the fast lane; vehicles moving at 25 km/h with hazard lights.',
      category: 'Heavy rain',
      severity: 'MEDIUM',
      latitude: 13.2244,
      longitude: 74.7484,
      roadName: 'Kaup (Kapu) Bypass, NH-66 Udupi',
      occurrenceTime: new Date(now - 1.9 * hourMs).toISOString(),
      reportedAt: new Date(now - 1.8 * hourMs).toISOString(),
      status: 'REPORTED',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 12,
    },
    {
      id: '55555555-5555-4555-8555-555555555510',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Peak-Hour Bus & Tanker Congestion at Udupi Karavali Flyover',
      description:
        '[SEEDED DEMO DATA] Express buses and inter-district tankers merging at Karavali Junction underpass toward Manipal NH-169A causing slow-moving queue.',
      category: 'Heavy traffic',
      severity: 'MEDIUM',
      latitude: 13.3409,
      longitude: 74.7351,
      roadName: 'Karavali Bypass Junction, Udupi',
      occurrenceTime: new Date(now - 1.2 * hourMs).toISOString(),
      reportedAt: new Date(now - 1.1 * hourMs).toISOString(),
      status: 'UNDER_REVIEW',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 15,
    },
    {
      id: '55555555-5555-4555-8555-555555555511',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Embankment Soil Slip on Kulshekar–arkula NH-75 Cut Section',
      description:
        '[SEEDED DEMO DATA] Minor laterite soil and boulder slip from hillside cut near Kettikal / Kulshekar after overnight rain. Earthmover deployed to clear outer shoulder.',
      category: 'Landslide',
      severity: 'HIGH',
      latitude: 12.8842,
      longitude: 74.9012,
      roadName: 'Kulshekar–Kettikal Slope, NH-75',
      occurrenceTime: new Date(now - 2 * dayMs).toISOString(),
      reportedAt: new Date(now - 2 * dayMs + 900000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 40,
    },
    {
      id: '55555555-5555-4555-8555-555555555512',
      reporterId: DEMO_IDS.users.employee,
      title: 'Industrial Tanker Protest Hold at Baikampady APMC Gate',
      description:
        '[SEEDED DEMO DATA] Brief demonstration by logistics operators near Baikampady industrial cross on NH-66 demanding service road resurfacing.',
      category: 'Strike/protest',
      severity: 'MEDIUM',
      latitude: 12.9522,
      longitude: 74.8105,
      roadName: 'Baikampady Industrial Area, NH-66',
      occurrenceTime: new Date(now - 3 * dayMs).toISOString(),
      reportedAt: new Date(now - 3 * dayMs + 600000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 25,
    },
    {
      id: '55555555-5555-4555-8555-555555555513',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Convoy Movement Corridor Hold at Airport Road–Yeyyadi Junction',
      description:
        '[SEEDED DEMO DATA] Rolling 10-minute security corridor hold along Airport Road (Maryhill–Yeyyadi–KPT) for official convoy transit.',
      category: 'VIP movement',
      severity: 'LOW',
      latitude: 12.9082,
      longitude: 74.8639,
      roadName: 'Airport Road, Yeyyadi Mangaluru',
      occurrenceTime: new Date(now - 4 * dayMs).toISOString(),
      reportedAt: new Date(now - 4 * dayMs + 300000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 10,
    },
    {
      id: '55555555-5555-4555-8555-555555555514',
      reporterId: DEMO_IDS.users.employee2,
      title: 'Security Check Barricade at Manipal Tiger Circle (NH-169A)',
      description:
        '[SEEDED DEMO DATA] Evening traffic calming and police check barricade near Tiger Circle Manipal causing 10-minute slowdown on Syndicate Circle approach.',
      category: 'Police/security restriction',
      severity: 'LOW',
      latitude: 13.3525,
      longitude: 74.7868,
      roadName: 'Tiger Circle, Manipal (NH-169A)',
      occurrenceTime: new Date(now - 5 * dayMs).toISOString(),
      reportedAt: new Date(now - 5 * dayMs + 600000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 10,
    },
    {
      id: '55555555-5555-4555-8555-555555555515',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Recurring Stormwater Drain Overflow at Pumpwell Service Curve',
      description:
        '[SEEDED DEMO DATA] Historical monsoon waterlogging incident recorded at Pumpwell NH-66 eastern slip road due to choked box drain.',
      category: 'Flood/waterlogging',
      severity: 'HIGH',
      latitude: 12.8673,
      longitude: 74.8698,
      roadName: 'Pumpwell Circle, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 7 * dayMs).toISOString(),
      reportedAt: new Date(now - 7 * dayMs + 600000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 32,
    },
    {
      id: '55555555-5555-4555-8555-555555555516',
      reporterId: DEMO_IDS.users.employee,
      title: 'Heavy Truck Rear-End Skidding at Nanthoor Downhill Approach',
      description:
        '[SEEDED DEMO DATA] Brakeline failure on loaded lorry descending from Bikarnakatte toward Nanthoor Circle on wet pavement.',
      category: 'Accident',
      severity: 'CRITICAL',
      latitude: 12.8829,
      longitude: 74.8652,
      roadName: 'Nanthoor Junction, NH-66 Mangaluru',
      occurrenceTime: new Date(now - 9 * dayMs).toISOString(),
      reportedAt: new Date(now - 9 * dayMs + 600000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 38,
    },
    {
      id: '55555555-5555-4555-8555-555555555517',
      reporterId: DEMO_IDS.users.passenger,
      title: 'Sudden Unexplained Slowdown at BC Road Flyover Approach',
      description:
        '[SEEDED DEMO DATA] Commuters reporting 15-minute bumper-to-bumper queue on NH-75 BC Road approach toward Bantwal; cause initially unknown.',
      category: 'Unknown reason',
      severity: 'LOW',
      latitude: 12.8789,
      longitude: 75.0258,
      roadName: 'BC Road Flyover, Bantwal (NH-75)',
      occurrenceTime: new Date(now - 0.5 * hourMs).toISOString(),
      reportedAt: new Date(now - 0.4 * hourMs).toISOString(),
      status: 'REPORTED',
      authorityConfirmed: false,
      roadClosed: false,
      estimatedDelayMinutes: 12,
    },
    {
      id: '55555555-5555-4555-8555-555555555518',
      reporterId: DEMO_IDS.users.employee2,
      title: 'Approach Pothole Patching & Lane Narrowing at Thokkottu Junction',
      description:
        '[SEEDED DEMO DATA] Wet-mix macadam patching on Thokkottu Kallapu stretch of NH-66 causing 20-minute morning commute bottleneck.',
      category: 'Road repair/construction',
      severity: 'HIGH',
      latitude: 12.8131,
      longitude: 74.8618,
      roadName: 'Thokkottu Flyover, NH-66 South',
      occurrenceTime: new Date(now - 12 * dayMs).toISOString(),
      reportedAt: new Date(now - 12 * dayMs + 600000).toISOString(),
      status: 'RESOLVED',
      authorityConfirmed: true,
      roadClosed: false,
      estimatedDelayMinutes: 24,
    },
  ];

  for (const inc of incidents) {
    await db.query(
      `INSERT INTO incidents (
        id, reporter_id, title, description, category, severity,
        latitude, longitude, road_name, occurrence_time, reported_at,
        status, authority_confirmed, road_closed, estimated_delay_minutes, demo_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)`,
      [
        inc.id,
        inc.reporterId,
        inc.title,
        inc.description,
        inc.category,
        inc.severity,
        inc.latitude,
        inc.longitude,
        inc.roadName,
        inc.occurrenceTime,
        inc.reportedAt,
        inc.status,
        inc.authorityConfirmed,
        inc.roadClosed,
        inc.estimatedDelayMinutes,
      ]
    );
  }

  // 5. Seed Evidence & Corroborations for key incidents so confidence engine computes rich scores
  const corroborations = [
    // Pumpwell (inc 1): 2 distinct corroborators + 1 GPS congestion
    {
      id: '66666666-6666-4666-8666-666666666601',
      incidentId: incidents[0].id,
      userId: DEMO_IDS.users.employee,
      type: 'CORROBORATE',
      lat: 12.8671,
      lng: 74.8694,
      speed: 8,
      notes: '[SIMULATED DEMO CORROBORATION] Water level above curb at Pumpwell slip road.',
    },
    {
      id: '66666666-6666-4666-8666-666666666602',
      incidentId: incidents[0].id,
      userId: DEMO_IDS.users.employee2,
      type: 'CORROBORATE',
      lat: 12.8665,
      lng: 74.8689,
      speed: 6,
      notes: '[SIMULATED DEMO CORROBORATION] Traffic police redirecting vehicles to main flyover.',
    },
    {
      id: '66666666-6666-4666-8666-666666666603',
      incidentId: incidents[0].id,
      userId: DEMO_IDS.users.employee,
      type: 'GPS_CONGESTION',
      lat: 12.8668,
      lng: 74.8691,
      speed: 5.5,
      notes: '[SIMULATED DEMO TELEMETRY] Consented commute session recorded average speed 5.5 km/h.',
    },
    // Thokkottu (inc 2): 2 distinct corroborators + GPS congestion
    {
      id: '66666666-6666-4666-8666-666666666604',
      incidentId: incidents[1].id,
      userId: DEMO_IDS.users.passenger,
      type: 'CORROBORATE',
      lat: 12.8129,
      lng: 74.8617,
      speed: 11,
      notes: '[SIMULATED DEMO CORROBORATION] Crane arriving at Thokkottu flyover ramp.',
    },
    {
      id: '66666666-6666-4666-8666-666666666605',
      incidentId: incidents[1].id,
      userId: DEMO_IDS.users.employee2,
      type: 'GPS_CONGESTION',
      lat: 12.8125,
      lng: 74.8614,
      speed: 9.0,
      notes: '[SIMULATED DEMO TELEMETRY] Queue back to Kallapu.',
    },
    // Mulki closure (inc 3): 2 distinct corroborators + GPS congestion
    {
      id: '66666666-6666-4666-8666-666666666606',
      incidentId: incidents[2].id,
      userId: DEMO_IDS.users.passenger,
      type: 'CORROBORATE',
      lat: 13.091,
      lng: 74.7862,
      speed: 4,
      notes: '[SIMULATED DEMO CORROBORATION] NHAI barricades confirmed at Mulki Bappanadu.',
    },
    {
      id: '66666666-6666-4666-8666-666666666607',
      incidentId: incidents[2].id,
      userId: DEMO_IDS.users.employee,
      type: 'CORROBORATE',
      lat: 13.0905,
      lng: 74.7866,
      speed: 7,
      notes: '[SIMULATED DEMO CORROBORATION] Northbound carriageway closed; contraflow active.',
    },
    {
      id: '66666666-6666-4666-8666-666666666608',
      incidentId: incidents[2].id,
      userId: DEMO_IDS.users.employee2,
      type: 'GPS_CONGESTION',
      lat: 13.0907,
      lng: 74.7865,
      speed: 6.2,
      notes: '[SIMULATED DEMO TELEMETRY] 6.2 km/h crawl through Mulki contraflow.',
    },
    // Nanthoor (inc 4)
    {
      id: '66666666-6666-4666-8666-666666666609',
      incidentId: incidents[3].id,
      userId: DEMO_IDS.users.employee,
      type: 'CORROBORATE',
      lat: 12.8826,
      lng: 74.8649,
      speed: 10,
      notes: '[SIMULATED DEMO CORROBORATION] Manual traffic marshals deployed at Nanthoor.',
    },
    {
      id: '66666666-6666-4666-8666-666666666610',
      incidentId: incidents[3].id,
      userId: DEMO_IDS.users.employee2,
      type: 'GPS_CONGESTION',
      lat: 12.8824,
      lng: 74.8647,
      speed: 8.4,
      notes: '[SIMULATED DEMO TELEMETRY] Signal dark at Nanthoor.',
    },
    // Surathkal NITK (inc 5)
    {
      id: '66666666-6666-4666-8666-666666666611',
      incidentId: incidents[4].id,
      userId: DEMO_IDS.users.passenger,
      type: 'CORROBORATE',
      lat: 13.011,
      lng: 74.7944,
      speed: 18,
      notes: '[SIMULATED DEMO CORROBORATION] Tow truck on scene near NITK gate.',
    },
  ];

  for (const c of corroborations) {
    await db.query(
      `INSERT INTO incident_corroborations (id, incident_id, user_id, corroboration_type, latitude, longitude, speed_kmh, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.id, c.incidentId, c.userId, c.type, c.lat, c.lng, c.speed, c.notes]
    );
  }

  // Seed Evidences
  const evidences = [
    {
      id: '77777777-7777-4777-8777-777777777701',
      incidentId: incidents[0].id,
      submittedBy: DEMO_IDS.users.passenger,
      evidenceType: 'PHOTO',
      storageKey: 'demo-pumpwell-waterlogging.jpg',
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Simulated Demo Evidence: Waterlogged underpass slip road at Pumpwell Circle',
        mimeType: 'image/jpeg',
      },
    },
    {
      id: '77777777-7777-4777-8777-777777777702',
      incidentId: incidents[0].id,
      submittedBy: DEMO_IDS.users.employee,
      evidenceType: 'GPS_TELEMETRY',
      storageKey: null,
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Consented Commute Session Telemetry: 5.5 km/h over 850m segment',
      },
    },
    {
      id: '77777777-7777-4777-8777-777777777703',
      incidentId: incidents[1].id,
      submittedBy: DEMO_IDS.users.employee,
      evidenceType: 'PHOTO',
      storageKey: 'demo-thokkottu-breakdown.jpg',
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Simulated Demo Evidence: Stalled container lorry on Thokkottu Flyover incline',
        mimeType: 'image/jpeg',
      },
    },
    {
      id: '77777777-7777-4777-8777-777777777704',
      incidentId: incidents[2].id,
      submittedBy: DEMO_IDS.users.employee2,
      evidenceType: 'PHOTO',
      storageKey: 'demo-mulki-closure-barricade.jpg',
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Simulated Demo Evidence: NHAI Culvert work barricade at Mulki NH-66',
        mimeType: 'image/jpeg',
      },
    },
    {
      id: '77777777-7777-4777-8777-777777777705',
      incidentId: incidents[2].id,
      submittedBy: DEMO_IDS.users.employee,
      evidenceType: 'GPS_TELEMETRY',
      storageKey: null,
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Consented Commute Telemetry: Northbound contraflow queue at Mulki',
      },
    },
    {
      id: '77777777-7777-4777-8777-777777777706',
      incidentId: incidents[3].id,
      submittedBy: DEMO_IDS.users.passenger,
      evidenceType: 'PHOTO',
      storageKey: 'demo-nanthoor-signal.jpg',
      metadata: {
        simulatedDemoEvidence: true,
        caption: 'Simulated Demo Evidence: Unlit traffic signal head at Nanthoor Junction',
        mimeType: 'image/jpeg',
      },
    },
  ];

  for (const ev of evidences) {
    await db.query(
      `INSERT INTO incident_evidences (id, incident_id, submitted_by, evidence_type, storage_key, metadata, validation_status)
       VALUES ($1,$2,$3,$4,$5,$6,'VALIDATED')`,
      [
        ev.id,
        ev.incidentId,
        ev.submittedBy,
        ev.evidenceType,
        ev.storageKey,
        JSON.stringify(ev.metadata),
      ]
    );
  }

  // Seed Authority Reviews
  const reviews = [
    {
      id: '88888888-8888-4888-8888-888888888801',
      incidentId: incidents[0].id,
      reviewerId: DEMO_IDS.users.authority,
      decision: 'CONFIRM',
      reason:
        '[SIMULATED DEMO REVIEW] Mangaluru South Traffic Control confirmed waterlogging under Pumpwell flyover; dewatering pump team alerted.',
    },
    {
      id: '88888888-8888-4888-8888-888888888802',
      incidentId: incidents[1].id,
      reviewerId: DEMO_IDS.users.authority,
      decision: 'CONFIRM',
      reason:
        '[SIMULATED DEMO REVIEW] Heavy recovery crane dispatched to Thokkottu Flyover northbound ramp.',
    },
    {
      id: '88888888-8888-4888-8888-888888888803',
      incidentId: incidents[2].id,
      reviewerId: DEMO_IDS.users.authority,
      decision: 'MARK_ROAD_CLOSED',
      reason:
        '[SIMULATED DEMO REVIEW] Mulki northbound carriageway closed for emergency culvert stabilization; contraflow enforced.',
    },
  ];

  for (const rev of reviews) {
    await db.query(
      `INSERT INTO incident_reviews (id, incident_id, reviewer_id, decision, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [rev.id, rev.incidentId, rev.reviewerId, rev.decision, rev.reason]
    );
  }

  // Recalculate confidence scores for all seeded incidents using the real verification engine
  for (const inc of incidents) {
    await recalculateIncidentConfidence(inc.id);
  }

  // 6. Seed Tracking Consents & Journeys (Mangaluru <-> Udupi Commute Demo)
  await db.query(
    `INSERT INTO tracking_consents (id, user_id, organization_id, policy_version, purpose, share_precise_coords, granted_at)
     VALUES
     ($1, $2, $3, 'v2026.1-PRIVACY-FIRST', 'Explicit session-only commute delay verification along NH-66 corridor (Udupi/Mulki to Mangaluru Tech Park)', FALSE, NOW() - INTERVAL '7 days'),
     ($4, $5, $3, 'v2026.1-PRIVACY-FIRST', 'Explicit session-only commute delay verification along Surathkal–Mangaluru corridor', FALSE, NOW() - INTERVAL '5 days')`,
    [
      DEMO_IDS.consents.employeeActive,
      DEMO_IDS.users.employee,
      DEMO_IDS.orgs.primary,
      DEMO_IDS.consents.employee2Active,
      DEMO_IDS.users.employee2,
    ]
  );

  // Active Journey for Demo Employee (Udupi -> Mangaluru via Mulki & Pumpwell)
  await db.query(
    `INSERT INTO journeys (
      id, employee_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
      started_at, status, consent_record_id, estimated_delay_min, verified_delay_min, verification_level, demo_data
    ) VALUES (
      $1, $2, 'Udupi Karavali Bypass (NH-66)', 'Pumpwell Circle, Mangaluru (NH-66)',
      13.3409, 74.7351, 12.8669, 74.8692,
      NOW() - INTERVAL '48 minutes', 'DELAYED', $3, 35, 28, 5, TRUE
    )`,
    [
      DEMO_IDS.journeys.activeCommute,
      DEMO_IDS.users.employee,
      DEMO_IDS.consents.employeeActive,
    ]
  );

  // Completed Historical Journey for Demo Employee
  await db.query(
    `INSERT INTO journeys (
      id, employee_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
      started_at, ended_at, status, consent_record_id, estimated_delay_min, verified_delay_min, verification_level, demo_data
    ) VALUES (
      $1, $2, 'Thokkottu Flyover, Ullal (NH-66)', 'KPT Junction, Mangaluru (NH-66)',
      12.8127, 74.8615, 12.8935, 74.8594,
      NOW() - INTERVAL '1 day 2 hours', NOW() - INTERVAL '1 day 1 hour', 'COMPLETED', $3, 28, 25, 6, TRUE
    )`,
    [
      DEMO_IDS.journeys.completedCommute,
      DEMO_IDS.users.employee,
      DEMO_IDS.consents.employeeActive,
    ]
  );

  // Active Journey for Second Employee (Surathkal -> Mangaluru)
  await db.query(
    `INSERT INTO journeys (
      id, employee_id, origin, destination, origin_lat, origin_lng, dest_lat, dest_lng,
      started_at, status, consent_record_id, estimated_delay_min, verified_delay_min, verification_level, demo_data
    ) VALUES (
      $1, $2, 'Surathkal NITK Toll Gate (NH-66)', 'Nanthoor Junction, Mangaluru (NH-66)',
      13.0108, 74.7943, 12.8825, 74.8648,
      NOW() - INTERVAL '32 minutes', 'DELAYED', $3, 22, 18, 4, TRUE
    )`,
    [
      DEMO_IDS.journeys.employee2Commute,
      DEMO_IDS.users.employee2,
      DEMO_IDS.consents.employee2Active,
    ]
  );

  // Checkpoints for Active Journey
  await db.query(
    `INSERT INTO journey_checkpoints (id, journey_id, latitude, longitude, speed, source_type, status_note)
     VALUES
     ('44444444-4444-4444-8444-444444444411', $1, 13.2244, 74.7484, 54.0, 'BROWSER_GPS', 'Passed Kaup Bypass smoothly'),
     ('44444444-4444-4444-8444-444444444412', $1, 13.0908, 74.7864, 6.5, 'BROWSER_GPS', 'Delayed in Mulki NH-66 culvert contraflow queue'),
     ('44444444-4444-4444-8444-444444444413', $1, 12.9261, 74.8267, 18.0, 'BROWSER_GPS', 'Crossing Kuloor Bridge toward Nanthoor/Pumpwell')`,
    [DEMO_IDS.journeys.activeCommute]
  );

  // Automatically evaluate and store realistic evidence-based delay verifications for seeded journeys
  await evaluateJourneyDelay({ journeyId: DEMO_IDS.journeys.activeCommute, organizationId: DEMO_IDS.orgs.primary, forceReevaluate: true });
  await evaluateJourneyDelay({ journeyId: DEMO_IDS.journeys.completedCommute, organizationId: DEMO_IDS.orgs.primary, forceReevaluate: true });
  await evaluateJourneyDelay({ journeyId: DEMO_IDS.journeys.employee2Commute, organizationId: DEMO_IDS.orgs.primary, forceReevaluate: true });

  // 7. Seed Notifications
  const notifications = [
    {
      id: '99999999-9999-4999-8999-999999999901',
      userId: DEMO_IDS.users.passenger,
      type: 'HIGH_CONFIDENCE_ALERT',
      title: '[DEMO ALERT] High-Confidence Waterlogging at Pumpwell Circle',
      message:
        'Simulated Demo Notification: Verified flooding (Confidence 100/100) reported under Pumpwell Flyover NH-66. Estimated delay +35 min.',
      incidentId: incidents[0].id,
      journeyId: null,
    },
    {
      id: '99999999-9999-4999-8999-999999999902',
      userId: DEMO_IDS.users.passenger,
      type: 'ROAD_CLOSURE',
      title: '[DEMO ALERT] Road Closure at Mulki Junction (NH-66)',
      message:
        'Simulated Demo Notification: Northbound carriageway closed at Mulki for culvert work. Consider SH-1 Bajpe–Padubidri inland bypass.',
      incidentId: incidents[2].id,
      journeyId: null,
    },
    {
      id: '99999999-9999-4999-8999-999999999903',
      userId: DEMO_IDS.users.employee,
      type: 'COMMUTE_DELAY',
      title: '[DEMO ALERT] Active Commute Delay Corroborated (+28 min)',
      message:
        'Your consented Udupi → Mangaluru commute session intersects verified incidents at Mulki Junction and Pumpwell Circle. Delay evidence has been attached to your session.',
      incidentId: incidents[2].id,
      journeyId: DEMO_IDS.journeys.activeCommute,
    },
    {
      id: '99999999-9999-4999-8999-999999999904',
      userId: DEMO_IDS.users.authority,
      type: 'CORROBORATION',
      title: '[DEMO ALERT] Nanthoor Signal Failure Reached Corroborated Threshold',
      message:
        'Multiple commuters and GPS telemetry corroborated traffic signal failure at Nanthoor Junction. Ready for authority dispatch review.',
      incidentId: incidents[3].id,
      journeyId: null,
    },
  ];

  for (const n of notifications) {
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, incident_id, journey_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [n.id, n.userId, n.type, n.title, n.message, n.incidentId, n.journeyId]
    );
  }

  // 8. Seed Problem Report & Complaints & Initial Audit Logs
  const sampleReportData = {
    locationName: 'Pumpwell Circle & Service Underpass, NH-66 Mangaluru',
    isDemoData: true,
    totalIncidents: 4,
    averageDelayMinutes: 33.5,
    maxDelayMinutes: 35,
    categoryBreakdown: {
      'Flood/waterlogging': 2,
      'Heavy traffic': 1,
      Accident: 1,
    },
    peakPeriods: ['08:30–10:30 IST (Morning Monsoon Peak)', '17:30–20:00 IST (Evening Return)'],
    historicalRecurrence: 'High recurrence during coastal monsoon downpours (>40mm/hr)',
    evidenceCoverage: '85% of recorded incidents backed by multi-user photos and GPS telemetry',
    dataQualityLimitations:
      'Analysis derived from seeded demonstration records and crowd-verified commuter telemetry; formal hydrological survey required before civil works.',
    suggestedInvestigations: [
      'Decision-Support Suggestion: Investigate stormwater box-drain outfall capacity and siltation under Pumpwell Flyover slip road',
      'Decision-Support Suggestion: Conduct junction merge geometry study for Kankanady–Nanthoor–Ullal slip lanes',
      'Decision-Support Suggestion: Install automated water-level warning signage prior to underpass entry',
    ],
  };

  await db.query(
    `INSERT INTO problem_reports (id, created_by, location_name, period_start, period_end, report_data)
     VALUES ($1, $2, $3, NOW() - INTERVAL '30 days', NOW(), $4)`,
    [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
      DEMO_IDS.users.authority,
      'Pumpwell Circle & Service Underpass, NH-66 Mangaluru',
      JSON.stringify(sampleReportData),
    ]
  );

  await db.query(
    `INSERT INTO complaints (id, reporter_id, incident_id, reason, status)
     VALUES ($1, $2, $3, $4, 'OPEN')`,
    [
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
      DEMO_IDS.users.passenger,
      incidents[16].id,
      '[SIMULATED DEMO COMPLAINT] Report at BC Road Flyover appears to be a routine toll/junction slowdown rather than an obstruction; requesting authority verification.',
    ]
  );

  await db.query(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES
     ('cccccccc-cccc-4ccc-8ccc-cccccccccc01', $1, 'AUTHORITY_CONFIRM_INCIDENT', 'INCIDENT', $2, $3),
     ('cccccccc-cccc-4ccc-8ccc-cccccccccc02', $4, 'EMPLOYER_POLICY_CONFIGURED', 'ORGANIZATION', $5, $6)`,
    [
      DEMO_IDS.users.authority,
      incidents[0].id,
      JSON.stringify({ decision: 'CONFIRM', roadName: 'Pumpwell Circle, NH-66 Mangaluru', demo: true }),
      DEMO_IDS.users.employer,
      DEMO_IDS.orgs.primary,
      JSON.stringify({ trackingMode: 'SESSION_ONLY_EXPLICIT', allowPreciseCoordinate: false }),
    ]
  );

  await db.query(
    `INSERT INTO system_configs (key, value)
     VALUES
     ('verification_weights', $1),
     ('platform_mode', $2)`,
    [
      JSON.stringify({
        independentReportsMax: 30,
        locationTimeProximityMax: 20,
        gpsCorroborationMax: 20,
        mediaEvidenceMax: 15,
        authorityConfirmationMax: 15,
      }),
      JSON.stringify({
        region: 'Mangaluru–Udupi Coastal Karnataka (NH-66 / NH-75)',
        demoDataBannerEnabled: true,
        strictPrivacyConsentRequired: true,
      }),
    ]
  );
}
