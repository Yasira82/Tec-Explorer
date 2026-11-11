/**
 * This app's identity, in ONE place — the installable manifest and the share card
 * (Open Graph) read it (App Excellence Standard E11). The tab title stays in layout.tsx.
 */
export const APP_META = {
  name:        'TEC Explorer',
  shortName:   'Explorer',
  description: 'Find Pi-accepting businesses, services, and opportunities near you. The discovery layer of the TEC Federated Platform.',
  /** The page background — this app's dark `--tec-bg` (#101014, the Hub's neutral charcoal, C-83 §5.6); also the browser chrome and splash colour. */
  themeColor:  '#101014',
} as const;
