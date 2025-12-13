import type { ProviderServiceType, ServiceCategory } from './models';

export const SERVICE_CATALOG: ProviderServiceType[] = [
  {
    id: 'residential',
    title: 'Haushaltsreinigung',
    description: 'Regelmäßige oder einmalige Reinigung von Wohnungen und Häusern.',
    includedOptions: [
      'Böden saugen & wischen',
      'Staub wischen',
      'Bad & WC reinigen',
      'Küche und Oberflächen pflegen',
      'Müll entsorgen',
    ],
  },
  {
    id: 'office',
    title: 'Büroreinigung',
    description:
      'Reinigung von Büros, Praxisräumen oder Co-Working-Flächen außerhalb der Öffnungszeiten.',
    includedOptions: [
      'Arbeitsplätze & Tische reinigen',
      'Sanitärbereiche säubern',
      'Besprechungsräume herrichten',
      'Teeküchen auffrischen',
      'Abfallbehälter leeren',
    ],
  },
  {
    id: 'industrial',
    title: 'Gewerbliche Grundreinigung',
    description: 'Intensive Reinigung von Produktions- oder Lagerflächen inklusive anspruchsvoller Beläge.',
    includedOptions: [
      'Hartböden maschinell reinigen',
      'Arbeitsbereiche und Regale entstauben',
      'Sanitärcontainer säubern',
      'Materialstationen ordnen',
      'Entsorgung nach Vorgaben',
    ],
  },
  {
    id: 'windows',
    title: 'Fenster- & Glasreinigung',
    description: 'Professionelle Reinigung von Fensterflächen, Rahmen und leicht erreichbaren Glasflächen.',
    includedOptions: [
      'Fenster innen & außen reinigen',
      'Rahmen & Falze säubern',
      'Spiegel & Glastrennwände pflegen',
      'Schaufenster streifenfrei reinigen',
    ],
  },
  {
    id: 'disinfection',
    title: 'Desinfektion & Hygieneservices',
    description: 'Gezielte Reinigung mit geprüften Mitteln für stark frequentierte Bereiche.',
    includedOptions: [
      'Kontaktflächen desinfizieren',
      'Sanitärbereiche mit Hygienekonzept',
      'Küchen & Pausenräume gründlich reinigen',
      'Desinfektionsmittel nachführen',
    ],
  },
  {
    id: 'eco_plus',
    title: 'Öko Plus',
    description: 'Reinigungen ausschließlich mit zertifizierten, nachhaltigen Produkten.',
    includedOptions: [
      'Biologisch abbaubare Mittel',
      'Verwendung eigener Materialien möglich',
      'Spezielle Pflege sensibler Oberflächen',
      'Beratung zu nachhaltigen Routinen',
    ],
  },
  {
    id: 'carpet',
    title: 'Teppichreinigung',
    description: 'Pflege und Tiefenreinigung von Teppichen und Läufern.',
    includedOptions: [
      'Trockenschaum oder Sprühextraktion',
      'Fleckenbehandlung',
      'Geruchsbeseitigung',
      'Materialschonende Pflege',
    ],
  },
  {
    id: 'upholstery',
    title: 'Polsterreinigung',
    description: 'Reinigung von Sofas, Sesseln und Stühlen inklusive Fleckenbehandlung.',
    includedOptions: [
      'Stoff- und Lederpflege',
      'Spezialreiniger für empfindliche Materialien',
      'Vorbehandlung hartnäckiger Flecken',
      'Trocknungszeiten abstimmen',
    ],
  },
  {
    id: 'spring',
    title: 'Frühjahrs-/Grundreinigung',
    description: 'Umfassende Komplettreinigung inklusive schwer zugänglicher Bereiche.',
    includedOptions: [
      'Schränke ausräumen & reinigen',
      'Heizkörper & Leisten säubern',
      'Fenster & Rahmen reinigen',
      'Entfernung von Kalk- und Fettrückständen',
    ],
  },
  {
    id: 'final',
    title: 'Endreinigung / Übergabe',
    description: 'Reinigung nach Umzug, Renovierung oder Bauarbeiten inklusive Übergabe-Check.',
    includedOptions: [
      'Baustaub entfernen',
      'Oberflächen gründlich reinigen',
      'Sanitäranlagen entkalken',
      'Müll und Verpackungen entsorgen',
    ],
  },
  {
    id: 'cluttered',
    title: 'Haushalt mit erhöhtem Aufwand',
    description: 'Unterstützung bei stark verschmutzten oder unorganisierten Haushalten.',
    includedOptions: [
      'Sortieren & Vorarbeiten',
      'Zusätzliche Zeitpuffer',
      'Koordination mit Kund:in',
      'Entsorgung größerer Mengen',
    ],
  },
  {
    id: 'construction',
    title: 'Baureinigung',
    description: 'Nach Bau- oder Renovierungsarbeiten.',
    includedOptions: [
      'Entfernung von feinem Baustaub',
      'Beseitigung von Farbresten & Putzspritzern',
      'Fenster- & Rahmenreinigung nach Bauarbeiten',
      'Intensive Bodenreinigung',
      'Entsorgung leichter Bauabfälle',
    ],
  },
  {
    id: 'move_out',
    title: 'Umzugsreinigung',
    description: 'Spezielle Reinigung im Rahmen eines Umzugs.',
    includedOptions: [
      'Reinigung leerer Räume',
      'Komplette Küchenreinigung inklusive Geräte',
      'Intensivreinigung von Bädern',
      'Fensterreinigung',
      'Übergabefertige Endkontrolle',
    ],
  },
  {
    id: 'pigeon_cleanup',
    title: 'Taubenkot entfernen',
    description: 'Spezialreinigung bei kontaminierten Flächen.',
    includedOptions: [
      'Entfernen von Taubenkot',
      'Desinfektion der betroffenen Fläche',
      'Hochdruckreinigung bei Bedarf',
      'Arbeiten mit Schutzkleidung',
    ],
  },
  {
    id: 'restaurant',
    title: 'Gastronomiereinigung',
    description: 'Für Restaurants, Cafés und gastronomische Betriebe.',
    includedOptions: [
      'Professionelle Küchenreinigung',
      'Entfettung von Böden & Geräten',
      'Sanitärreinigung',
      'Essbereiche und Tische reinigen',
      'Schankanlagenoberflächen pflegen',
    ],
  },
  {
    id: 'heavy_dirty',
    title: 'Stark verschmutzte Wohnung',
    description: 'Für extrem verschmutzte Wohnungen (über Standard hinaus).',
    includedOptions: [
      'Entfernung starker Verschmutzungen',
      'Tiefenreinigung von Küche & Bad',
      'Geruchsbeseitigung',
      'Zusatzzeit & Spezialmittel',
    ],
  },
  {
    id: 'carpet_laundry',
    title: 'Teppichwäscherei',
    description: 'Externer oder spezialisierter Teppichservice.',
    includedOptions: [
      'Abholung & Lieferung (optional)',
      'Industrielle Tiefenwäsche',
      'Geruchsentfernung',
      'Antiallergische Behandlung',
    ],
  },
  {
    id: 'wintergarden',
    title: 'Wintergarten reinigen',
    description: 'Reinigung von Wintergärten und verglasten Anbauten.',
    includedOptions: [
      'Glasflächen innen & außen reinigen',
      'Rahmen & Schienen säubern',
      'Bodenreinigung im Wintergarten',
      'Entfernung von Grünbelag',
    ],
  },
  {
    id: 'nicotine_removal',
    title: 'Nikotingeruch entfernen',
    description: 'Spezialservice zur Beseitigung von Nikotinrückständen.',
    includedOptions: [
      'Reinigung von Wänden & Decken',
      'Geruchsneutralisation',
      'Flächen und Vorhänge reinigen',
      'Intensive Behandlung von Raucherbereichen',
    ],
  },
  {
    id: 'fire_damage',
    title: 'Brandreinigung',
    description: 'Reinigung nach einem Brandereignis.',
    includedOptions: [
      'Entfernung von Ruß',
      'Geruchsneutralisation',
      'Reinigung beschädigter Oberflächen',
      'Entsorgung verbrannter Gegenstände',
    ],
  },
  {
    id: 'clearout',
    title: 'Entrümpelung',
    description: 'Beseitigung und Entsorgung von Hausrat.',
    includedOptions: [
      'Entfernung von Möbeln & Gegenständen',
      'Sortierung und Verpackung',
      'Transport & Entsorgung organisieren',
      'Optionale Grundreinigung danach',
    ],
  },
  {
    id: 'wood_terrace',
    title: 'Holzterrasse reinigen',
    description: 'Reinigung von Holzterrassen und ähnlichen Außenflächen.',
    includedOptions: [
      'Hochdruck- oder Handreinigung',
      'Moos- und Algenentfernung',
      'Fugenreinigung',
      'Pflege & Schutzmittel auftragen',
    ],
  },
  {
    id: 'water_damage',
    title: 'Wasserschadenreinigung',
    description: 'Einsatz nach einem Wasserschaden.',
    includedOptions: [
      'Erste Wasserentfernung (wenn möglich)',
      'Trocknungsmaßnahmen einleiten',
      'Desinfektion der betroffenen Bereiche',
      'Reinigung der Oberflächen',
    ],
  },
  {
    id: 'hoarder',
    title: 'Messie Wohnung',
    description: 'Service für extrem vermüllte oder verwahrloste Haushalte.',
    includedOptions: [
      'Komplette Entrümpelung',
      'Tiefenreinigung aller Räume',
      'Geruchsbeseitigung',
      'Flächendesinfektion',
    ],
  },
  {
    id: 'deep_disinfection',
    title: 'Desinfizierende Reinigung',
    description: 'Fokus auf intensive Desinfektion über den Standard hinaus.',
    includedOptions: [
      'Viruzide & bakterizide Flächendesinfektion',
      'Komplettdesinfektion von Bad & Küche',
      'Einsatz medizinisch geprüfter Mittel',
      'Geeignet für sensible Bereiche',
    ],
  },
];

export const SERVICE_CATEGORY_IDS = SERVICE_CATALOG.map((service) => service.id) as ServiceCategory[];
