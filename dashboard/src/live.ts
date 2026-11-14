import { useCallback, useEffect, useState } from 'react';
import { supabase } from './auth';
import { SETTINGS, type Lead, type SettingsView, type Stage } from './data';
import { mapLead, mapSettings, type BusinessRow } from './mapLead';

const LEAD_SELECT =
  'id,name,source,external_id,category,city,phone,email,discovered_at,client_status,' +
  'website_verifications(status,confidence,verified_at),' +
  'lead_scores(total,scored_at),' +
  'generated_demos(status,created_at,deployments(status,deployment_url,url_reachable,created_at))';

export interface LiveData {
  leads: Lead[]; settings: SettingsView; failedRuns: number;
  loading: boolean; error: string | null;
  /** Attribution or status line for names fetched from Google. */
  namesNote: string | null;
  reload: () => void;
  setStage: (id: Lead['id'], stage: Stage) => Promise<string | null>;
}

/** Reads real data from Supabase. Only used when signed in. */
export function useLiveData(enabled: boolean): LiveData {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState<SettingsView>({ ...SETTINGS, categories: [] });
  const [failedRuns, setFailedRuns] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [namesNote, setNamesNote] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !supabase) return;
    setLoading(true);
    const [b, s, sch, runs] = await Promise.all([
      supabase.from('businesses').select(LEAD_SELECT).order('discovered_at', { ascending: false }).limit(500),
      supabase.from('app_settings').select('key,value'),
      supabase.from('automation_schedules').select('cron,timezone,enabled').limit(1),
      supabase.from('automation_executions').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);
    const failed = b.error ?? s.error ?? sch.error ?? runs.error;
    if (failed) {
      setError('Could not load data from the database. Try again.');
    } else {
      const mapped = ((b.data ?? []) as unknown as BusinessRow[]).map(mapLead);
      setLeads(mapped);
      void loadNames(mapped);
      setSettings(mapSettings(s.data ?? [], sch.data ?? [], [...new Set(mapped.map((l) => l.category))].sort()));
      setFailedRuns(runs.count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, [enabled]);

  // Names for Google leads are fetched fresh and kept only in this browser tab.
  const loadNames = useCallback(async (list: Lead[]) => {
    if (!supabase) return;
    const ids = list.filter((l) => l.mapsUrl).slice(0, 50).map((l) => String(l.id));
    for (let i = 0; i < ids.length; i += 25) {
      const { data, error } = await supabase.functions.invoke('place-details', { body: { ids: ids.slice(i, i + 25) } });
      if (error || !data?.places) { setNamesNote('Business names are not available right now. Use the Google Maps links.'); return; }
      const places = data.places as Record<string, { name: string | null }>;
      setLeads((ls) => ls.map((l) => (places[String(l.id)]?.name ? { ...l, name: places[String(l.id)]!.name! } : l)));
    }
    setNamesNote(ids.length ? 'Business names from Google Maps.' : null);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const setStage = useCallback(async (id: Lead['id'], stage: Stage) => {
    if (!supabase) return 'Not connected.';
    const { error } = await supabase.from('businesses').update({ client_status: stage }).eq('id', id);
    if (error) return 'Could not update the stage.';
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage } : l)));
    return null;
  }, []);

  return { leads, settings, failedRuns, loading, error, namesNote, reload: () => void reload(), setStage };
}
