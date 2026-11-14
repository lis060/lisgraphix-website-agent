// SAMPLE DATA ONLY. These are fictional examples to show the layout.
// They are not real businesses. Real data arrives once the database is connected.
export type Stage = 'New Lead' | 'Qualified' | 'Demo Ready' | 'Contacted' | 'Interested' | 'Negotiating' | 'Won' | 'Lost';
export const STAGES: Stage[] = ['New Lead','Qualified','Demo Ready','Contacted','Interested','Negotiating','Won','Lost'];

export interface Lead {
  id: number | string; name: string; category: string; city: string;
  /** null = not verified or scored yet. */
  websiteStatus: string; confidence: number | null; score: number | null;
  contact: string; discovered: string; demo: 'None' | 'Ready' | 'Failed' | 'Archived'; stage: Stage;
  /** Only set for a deployment that is ready and whose URL was checked. */
  demoUrl?: string;
}
export interface SettingsView {
  cities: string[]; categories: string[]; dailyDiscoveryLimit: number | string; shortlist: number | string;
  dailyDemoLimit: number | string; minScore: number | string; schedule: string; imageSource: string;
}
export const LEADS: Lead[] = [
  { id: 1, name: 'Sample Beauty Studio', category: 'Beauty salon', city: 'Accra', websiteStatus: 'No official website identified', confidence: 85, score: 91, contact: 'Phone', discovered: '2026-11-14', demo: 'Ready', stage: 'Demo Ready' },
  { id: 2, name: 'Sample Kitchen', category: 'Restaurant', city: 'Kumasi', websiteStatus: 'No official website identified', confidence: 78, score: 84, contact: 'Phone, email', discovered: '2026-11-14', demo: 'None', stage: 'Qualified' },
  { id: 3, name: 'Sample Cuts', category: 'Barbershop', city: 'Tema', websiteStatus: 'Social media only', confidence: 60, score: 62, contact: 'Phone', discovered: '2026-11-13', demo: 'None', stage: 'New Lead' },
  { id: 4, name: 'Sample Guest Lodge', category: 'Guesthouse', city: 'Accra', websiteStatus: 'Needs manual verification', confidence: 50, score: 48, contact: 'None', discovered: '2026-11-13', demo: 'Failed', stage: 'New Lead' },
];
export const SETTINGS: SettingsView = {
  cities: ['Accra','Tema','Kumasi'], categories: ['Restaurant','Beauty salon','Barbershop','Fashion boutique','Guesthouse','Cleaning service','Event planning','Car rental','Furniture'],
  dailyDiscoveryLimit: 20, shortlist: 5, dailyDemoLimit: 2, minScore: 60,
  schedule: 'Daily at 9:30 AM, Africa/Accra', imageSource: 'AI-generated (daily cap 8)',
};
