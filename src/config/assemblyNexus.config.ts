import { DEFAULT_WORKER_STATE_MAPPING } from '@/domain/status';
import type { DashboardConfig } from './types';

/**
 * First-party Assembly Nexus configuration.
 *
 * Other deployments should copy this file, change what they need, and pass
 * their config to <App config={…} />. Nothing in the component tree imports
 * this file directly except the app entry point.
 */
export const assemblyNexusConfig: DashboardConfig = {
  branding: {
    productName: 'Assembly Nexus',
    surfaceName: 'Forge Floor',
    monogram: 'A•N',
    hierarchy: [
      'Founder #0007',
      'A•N',
      '《Assembly▪︎Nexus》',
      'Wolf◇Technologies',
      'Ghost○●Company-07',
    ],
    tagline: 'Operations floor for autonomous crews',
  },
  governance: {
    humanAuthority: 'Founder #0007',
    requireConfirmation: true,
    noteRequiredFor: ['DENY'],
  },
  themes: [
    {
      id: 'forge',
      label: 'Forge',
      description: 'Dark command floor with ember and cyan instrumentation.',
      i18n: {
        es: {
          label: 'Forja',
          description: 'Sala de mando oscura con instrumentación ámbar y cian.',
        },
      },
    },
    {
      id: 'snow-wolf',
      label: 'Snow Wolf',
      description: 'Cold-steel variant with ice-blue illumination.',
      i18n: {
        es: {
          label: 'Lobo de las Nieves',
          description: 'Variante de acero frío con iluminación azul hielo.',
        },
      },
    },
  ],
  defaultThemeId: 'forge',
  floor: {
    rooms: [
      {
        id: 'planning',
        label: 'Planning Bay',
        kind: 'planning',
        area: { x: 0, y: 0, w: 24, h: 32 },
        equipment: ['whiteboard', 'terminal'],
        description: 'Missions are broken down into tasks here.',
        i18n: {
          es: {
            label: 'Bahía de planificación',
            description: 'Aquí las misiones se desglosan en tareas.',
          },
        },
      },
      {
        id: 'research',
        label: 'Research Lab',
        kind: 'research',
        area: { x: 24, y: 0, w: 24, h: 32 },
        equipment: ['microscope', 'terminal'],
        description: 'Investigations, benchmarks and experiments.',
        i18n: {
          es: {
            label: 'Laboratorio de investigación',
            description: 'Investigaciones, pruebas comparativas y experimentos.',
          },
        },
      },
      {
        id: 'build',
        label: 'Build Forge',
        kind: 'build',
        area: { x: 48, y: 0, w: 52, h: 32 },
        equipment: ['forge', 'workbench', 'workbench', 'server-rack'],
        description: 'Where code, artifacts and builds are hammered out.',
        i18n: {
          es: {
            label: 'Forja de compilación',
            description: 'Donde se forjan el código, los artefactos y las compilaciones.',
          },
        },
      },
      {
        id: 'security',
        label: 'Security Vault',
        kind: 'security',
        area: { x: 0, y: 32, w: 24, h: 34 },
        equipment: ['vault', 'scanner'],
        description: 'Secrets handling, audits and threat review.',
        i18n: {
          es: {
            label: 'Cámara de seguridad',
            description: 'Gestión de secretos, auditorías y revisión de amenazas.',
          },
        },
      },
      {
        id: 'review',
        label: 'Review Chamber',
        kind: 'review',
        area: { x: 24, y: 32, w: 24, h: 34 },
        equipment: ['console', 'terminal'],
        description: 'Independent review of produced work.',
        i18n: {
          es: {
            label: 'Sala de revisión',
            description: 'Revisión independiente del trabajo producido.',
          },
        },
      },
      {
        id: 'certification',
        label: 'Certification Lab',
        kind: 'certification',
        area: { x: 48, y: 32, w: 26, h: 34 },
        equipment: ['scanner', 'stamp-press'],
        description: 'Release candidates are verified and certified.',
        i18n: {
          es: {
            label: 'Laboratorio de certificación',
            description: 'Las versiones candidatas se verifican y certifican.',
          },
        },
      },
      {
        id: 'operations',
        label: 'Ops Deck',
        kind: 'operations',
        area: { x: 74, y: 32, w: 26, h: 34 },
        equipment: ['console', 'server-rack'],
        description: 'Runtime operations, incidents and infrastructure.',
        i18n: {
          es: {
            label: 'Cubierta de operaciones',
            description: 'Operaciones en ejecución, incidentes e infraestructura.',
          },
        },
      },
      {
        id: 'founder-gate',
        label: 'Founder Gate',
        kind: 'founder-gate',
        area: { x: 0, y: 66, w: 36, h: 34 },
        equipment: ['gate', 'console'],
        description:
          'Workers wait here for human approval. Only the human authority opens the gate.',
        i18n: {
          es: {
            label: 'Puerta del Founder',
            description:
              'Los trabajadores esperan aquí una aprobación humana. Solo la autoridad humana abre la puerta.',
          },
        },
      },
      {
        id: 'snow-wolf-den',
        label: 'Snow Wolf Den',
        kind: 'den',
        area: { x: 36, y: 66, w: 32, h: 34 },
        equipment: ['snow-banner', 'terminal'],
        description: 'Reserved quarters for the Snow Wolf crew.',
        i18n: {
          es: {
            label: 'Guarida del Lobo de las Nieves',
            description: 'Cuartel reservado para el equipo Lobo de las Nieves.',
          },
        },
        crewId: 'snow-wolf',
      },
      {
        id: 'break',
        label: 'Break Room',
        kind: 'break',
        area: { x: 68, y: 66, w: 32, h: 34 },
        equipment: ['coffee', 'couch'],
        description: 'Idle workers recharge here.',
        i18n: {
          es: {
            label: 'Sala de descanso',
            description: 'Los trabajadores inactivos recargan energía aquí.',
          },
        },
      },
    ],
    stateRoutes: {
      IDLE: 'break',
      PLANNING: 'planning',
      WORKING: 'home',
      WAITING: 'home',
      BLOCKED: 'home',
      REVIEWING: 'review',
      CERTIFYING: 'certification',
      COMPLETE: 'home',
      FAILED: 'home',
      STOPPED: 'break',
      UNKNOWN: 'home',
    },
    approvalRoomId: 'founder-gate',
  },
  crews: [
    {
      id: 'forge',
      label: 'The Forge Crew',
      motto: 'The Forge took their hair as payment.',
      i18n: {
        es: { label: 'El equipo de la Forja', motto: 'La Forja se cobró su pelo como pago.' },
      },
      status: 'active',
      emblem: 'forge',
    },
    {
      id: 'snow-wolf',
      label: 'Snow Wolf Crew',
      motto: 'Reserved — identity and assets pending.',
      i18n: {
        es: {
          label: 'Equipo Lobo de las Nieves',
          motto: 'Reservado: identidad y recursos pendientes.',
        },
      },
      status: 'reserved',
      emblem: 'snow-wolf',
    },
  ],
  characters: {
    bramwell: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#e8b995',
        hair: '#c9cdd3',
        hairStyle: 'wild',
        coat: '#eef1f4',
        accent: '#f59e0b',
        eyewear: 'glasses',
        tool: 'clipboard',
        facialHair: 'mustache',
        brow: 0,
      },
    },
    ada: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#f1c6a8',
        hair: '#c2410c',
        hairStyle: 'bun',
        coat: '#e7ecf2',
        accent: '#22d3ee',
        eyewear: 'goggles',
        tool: 'wrench',
        facialHair: 'none',
        brow: 1,
      },
    },
    otto: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#c68a62',
        hair: '#3f2a1d',
        hairStyle: 'sides',
        coat: '#e2e8f0',
        accent: '#f97316',
        eyewear: 'none',
        tool: 'wrench',
        facialHair: 'beard',
        brow: 1,
      },
    },
    mina: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#e0ac86',
        hair: '#111827',
        hairStyle: 'swoop',
        coat: '#f1f5f9',
        accent: '#a78bfa',
        eyewear: 'monocle',
        tool: 'magnifier',
        facialHair: 'none',
        brow: 0,
      },
    },
    cyrus: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#8d5a3b',
        hair: '#e5e7eb',
        hairStyle: 'sides',
        coat: '#dfe6ee',
        accent: '#34d399',
        eyewear: 'visor',
        tool: 'shield',
        facialHair: 'goatee',
        brow: 1,
      },
    },
    pim: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#f5d0b5',
        hair: '#a16207',
        hairStyle: 'tufts',
        coat: '#eef2f7',
        accent: '#60a5fa',
        eyewear: 'glasses',
        tool: 'tablet',
        facialHair: 'none',
        brow: -1,
      },
    },
    hedda: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#d9a07b',
        hair: '#9ca3af',
        hairStyle: 'bun',
        coat: '#f8fafc',
        accent: '#facc15',
        eyewear: 'glasses',
        tool: 'stamp',
        facialHair: 'none',
        brow: 0,
      },
    },
    rook: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#6b4430',
        hair: '#1f2937',
        hairStyle: 'tufts',
        coat: '#e5eaf0',
        accent: '#fb7185',
        eyewear: 'none',
        tool: 'headset',
        facialHair: 'mustache',
        brow: 0,
      },
    },
    juniper: {
      kind: 'procedural-scientist',
      appearance: {
        skin: '#f3cfb3',
        hair: '#65a30d',
        hairStyle: 'wild',
        coat: '#edf2f7',
        accent: '#4ade80',
        eyewear: 'goggles',
        tool: 'flask',
        facialHair: 'none',
        brow: -1,
      },
    },
    kestrel: {
      kind: 'procedural-wolf',
      appearance: { fur: '#dbe4ee', accent: '#7dd3fc', coat: '#1e293b' },
    },
  },
  features: {
    forgeFloor: true,
    approvals: true,
    alerts: true,
    workerMessaging: true,
    redAlertMode: true,
  },
  statusMapping: DEFAULT_WORKER_STATE_MAPPING,
  adapter: { kind: 'demo', tickMs: 3500, seed: 7 },
};
