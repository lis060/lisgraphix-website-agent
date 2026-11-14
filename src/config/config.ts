/**
 * Default automation settings. The dashboard (not yet built) will override these
 * and store them in the database. Keeping defaults in code makes tests predictable.
 */

export interface CategorySetting {
  name: string;
  enabled: boolean;
  /** How well a simple showcase website fits this category (0 to 15). */
  websiteFit: number;
}

export interface AutomationSettings {
  cities: string[];
  categories: CategorySetting[];
  dailyDiscoveryLimit: number;
  /** Maximum number of qualified leads to shortlist per run. */
  shortlistLimit: number;
  /** Maximum number of demo websites to generate per run. */
  dailyDemoLimit: number;
  minOpportunityScore: number;
  /** Cron expression in the schedule timezone. 9:30 AM daily. */
  scheduleCron: string;
  scheduleTimezone: string;
  /** Where demo images come from. */
  imageSource: 'generated' | 'library' | 'none';
  imagesPerSite: number;
  /** Hard daily cap on generated images, to control cost. */
  maxGeneratedImagesPerDay: number;
}

export const DEFAULT_SETTINGS: AutomationSettings = {
  cities: ['Accra', 'Tema', 'Kumasi'],
  categories: [
    { name: 'Restaurant', enabled: true, websiteFit: 15 },
    { name: 'Beauty salon', enabled: true, websiteFit: 15 },
    { name: 'Barbershop', enabled: true, websiteFit: 12 },
    { name: 'Fashion boutique', enabled: true, websiteFit: 15 },
    { name: 'Guesthouse', enabled: true, websiteFit: 15 },
    { name: 'Cleaning service', enabled: true, websiteFit: 8 },
    { name: 'Event planning', enabled: true, websiteFit: 12 },
    { name: 'Car rental', enabled: true, websiteFit: 10 },
    { name: 'Furniture', enabled: true, websiteFit: 10 },
  ],
  dailyDiscoveryLimit: 20,
  shortlistLimit: 5,
  dailyDemoLimit: 2,
  minOpportunityScore: 60,
  scheduleCron: '30 9 * * *',
  scheduleTimezone: 'Africa/Accra',
  imageSource: 'generated',
  imagesPerSite: 4,
  maxGeneratedImagesPerDay: 8,
};

export function websiteFitFor(settings: AutomationSettings, category: string): number {
  const match = settings.categories.find(
    (c) => c.name.toLowerCase() === category.trim().toLowerCase(),
  );
  return match ? match.websiteFit : 6;
}

export function isCategoryEnabled(settings: AutomationSettings, category: string): boolean {
  const match = settings.categories.find(
    (c) => c.name.toLowerCase() === category.trim().toLowerCase(),
  );
  return match ? match.enabled : false;
}
