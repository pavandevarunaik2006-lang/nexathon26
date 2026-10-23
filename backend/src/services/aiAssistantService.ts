import { INCIDENT_CATEGORIES, IncidentCategory } from '@roadalert/shared';

export interface AiIncidentAssistResult {
  suggestedCategory: IncidentCategory;
  suggestedSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  conciseSummary: string;
  suggestedEvidenceToCollect: string[];
  disclaimer: string;
  providerUsed: 'GEMINI_API' | 'DETERMINISTIC_HEURISTIC';
}

export function analyzeIncidentTextHeuristic(
  title: string,
  description: string,
  roadName?: string
): AiIncidentAssistResult {
  const combined = `${title} ${description} ${roadName || ''}`.toLowerCase();

  let suggestedCategory: IncidentCategory = 'Heavy traffic';
  let suggestedSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
  let suggestedEvidenceToCollect: string[] = [
    'Wide-angle photo showing traffic queue or obstruction safely from roadside',
    'Location landmark confirmation near nearest junction',
  ];

  if (combined.includes('water') || combined.includes('flood') || combined.includes('submerged') || combined.includes('drain')) {
    suggestedCategory = 'Flood/waterlogging';
    suggestedSeverity = 'HIGH';
    suggestedEvidenceToCollect = [
      'Photo showing water depth relative to median or road curb',
      'GPS speed-drop telemetry from vehicles traversing the service road',
    ];
  } else if (combined.includes('accident') || combined.includes('collision') || combined.includes('crash') || combined.includes('overturned')) {
    suggestedCategory = 'Accident';
    suggestedSeverity = 'CRITICAL';
    suggestedEvidenceToCollect = [
      'Safe distance photo confirming lane blockage without obstructing emergency responders',
      'Traffic Police control room confirmation',
    ];
  } else if (combined.includes('repair') || combined.includes('construction') || combined.includes('concreting') || combined.includes('nhai') || combined.includes('trench')) {
    suggestedCategory = 'Road repair/construction';
    suggestedSeverity = 'MEDIUM';
    suggestedEvidenceToCollect = [
      'Photo of NHAI/PWD work-zone barricades and diversion signage',
      'Multiple commuter corroborations confirming single-lane contraflow',
    ];
  } else if (combined.includes('signal') || combined.includes('light') || combined.includes('blinking')) {
    suggestedCategory = 'Traffic signal failure';
    suggestedSeverity = 'MEDIUM';
    suggestedEvidenceToCollect = [
      'Short video or photo of unlit/malfunctioning signal head at junction',
      'Independent reports from cross-traffic commuters',
    ];
  } else if (combined.includes('closed') || combined.includes('closure') || combined.includes('blocked') || combined.includes('barricade')) {
    suggestedCategory = 'Road closure';
    suggestedSeverity = 'CRITICAL';
    suggestedEvidenceToCollect = [
      'Photo of official barricade or diversion notice',
      'Traffic Authority confirmation before marking route impassable',
    ];
  } else if (combined.includes('breakdown') || combined.includes('stalled') || combined.includes('axle') || combined.includes('lorry') || combined.includes('truck')) {
    suggestedCategory = 'Vehicle breakdown';
    suggestedSeverity = 'HIGH';
    suggestedEvidenceToCollect = [
      'Photo of stalled heavy vehicle and remaining passable lane width',
      'Location pin on bridge or flyover approach',
    ];
  } else if (combined.includes('festival') || combined.includes('procession') || combined.includes('rathotsava') || combined.includes('event')) {
    suggestedCategory = 'Festival/public event';
    suggestedSeverity = 'MEDIUM';
  } else if (combined.includes('strike') || combined.includes('protest') || combined.includes('bandh') || combined.includes('rasta roko')) {
    suggestedCategory = 'Strike/protest';
    suggestedSeverity = 'HIGH';
  } else if (combined.includes('landslide') || combined.includes('mudslide') || combined.includes('boulder') || combined.includes('slope')) {
    suggestedCategory = 'Landslide';
    suggestedSeverity = 'CRITICAL';
  } else if (combined.includes('rain') || combined.includes('downpour') || combined.includes('monsoon')) {
    suggestedCategory = 'Heavy rain';
    suggestedSeverity = 'MEDIUM';
  } else if (combined.includes('bridge') || combined.includes('expansion joint') || combined.includes('flyover maintenance')) {
    suggestedCategory = 'Bridge/road maintenance';
    suggestedSeverity = 'HIGH';
  } else if (combined.includes('vip') || combined.includes('convoy')) {
    suggestedCategory = 'VIP movement';
    suggestedSeverity = 'MEDIUM';
  }

  // Ensure category is valid
  if (!INCIDENT_CATEGORIES.includes(suggestedCategory)) {
    suggestedCategory = 'Unknown reason';
  }

  const conciseSummary = `${suggestedCategory} reported near ${roadName || 'coastal corridor'}: ${title.trim()}. Recommended severity: ${suggestedSeverity}.`;

  return {
    suggestedCategory,
    suggestedSeverity,
    conciseSummary,
    suggestedEvidenceToCollect,
    disclaimer:
      'AI/Heuristic Decision-Support Suggestion: Category and summary are advisory only. Incidents are never automatically declared genuine based on generated text.',
    providerUsed: 'DETERMINISTIC_HEURISTIC',
  };
}
