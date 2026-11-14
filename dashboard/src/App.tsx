import { useState } from 'react';
import { AuthGate } from './auth';
import { LEADS, SETTINGS, STAGES, type Lead, type SettingsView, type Stage } from './data';
import { useLiveData } from './live';

type Tab = 'Overview' | 'Leads' | 'Demos' | 'Pipeline' | 'Settings';
const TABS: Tab[] = ['Overview', 'Leads', 'Demos', 'Pipeline', 'Settings'];
const dash = (v: number | null, suffix = '') => (v === null ? '–' : `${v}${suffix}`);

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="card stat"><div className="num">{value}</div><div className="label">{label}</div></div>;
}

function Overview({ leads, failedRuns }: { leads: Lead[]; failedRuns: number }) {
  const inStage = (...s: Stage[]) => leads.filter((l) => s.includes(l.stage)).length;
  return (
    <div className="grid">
      <Stat label="Businesses discovered" value={leads.length} />
      <Stat label="Without identified website" value={leads.filter((l) => l.websiteStatus.startsWith('No official')).length} />
      <Stat label="High-priority prospects" value={leads.filter((l) => (l.score ?? 0) >= 80).length} />
      <Stat label="Demos generated" value={leads.filter((l) => l.demo === 'Ready').length} />
      <Stat label="Successful deployments" value={leads.filter((l) => l.demoUrl).length} />
      <Stat label="Contacted" value={inStage('Contacted', 'Interested', 'Negotiating', 'Won', 'Lost')} />
      <Stat label="Interested" value={inStage('Interested', 'Negotiating')} />
      <Stat label="Converted" value={inStage('Won')} />
      <Stat label="Failed tasks" value={leads.filter((l) => l.demo === 'Failed').length + failedRuns} />
    </div>
  );
}

function Leads({ leads }: { leads: Lead[] }) {
  const [q, setQ] = useState('');
  const rows = leads.filter((l) => `${l.name} ${l.category} ${l.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <input className="search" placeholder="Search leads" aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table>
        <thead><tr>{['Business','Category','City','Website status','Confidence','Score','Contact','Found','Demo','Stage'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id}><td>{l.mapsUrl ? <a className="link" href={l.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps</a> : l.name}</td><td>{l.category}</td><td>{l.city}</td><td>{l.websiteStatus}</td>
            <td>{dash(l.confidence, '%')}</td><td><b>{dash(l.score)}</b>{l.score !== null && '/100'}</td>
            <td>{l.contact}</td><td>{l.discovered}</td><td>{l.demo}</td><td>{l.stage}</td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">{leads.length === 0 ? 'No businesses yet. They appear here after the first discovery run.' : 'No leads match.'}</p>}
    </div>
  );
}

function Demos({ leads }: { leads: Lead[] }) {
  const demos = leads.filter((l) => l.demo !== 'None');
  if (demos.length === 0) return <div className="card"><p className="muted">No demo websites yet.</p></div>;
  return (
    <div className="grid">{demos.map((l) => (
      <div className="card" key={l.id}>
        <div className="thumb" aria-hidden />
        <h3>{l.name}</h3>
        <p className="muted">Status: {l.demo}{l.demo === 'Ready' && !l.demoUrl ? ' (not deployed)' : ''}</p>
        {l.demoUrl
          ? <a className="link" href={l.demoUrl} target="_blank" rel="noopener noreferrer">View website</a>
          : <p className="muted">No verified live URL.</p>}
        <div><button disabled title="Not built yet">Rebuild</button> <button disabled title="Not built yet">Archive</button></div>
      </div>))}
    </div>
  );
}

function Pipeline({ leads, onMove }: { leads: Lead[]; onMove?: (id: Lead['id'], s: Stage) => Promise<string | null> }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      {msg && <p className="error" role="alert">{msg}</p>}
      <div className="board">{STAGES.map((s) => (
        <div className="col" key={s}><h4>{s}</h4>
          {leads.filter((l) => l.stage === s).map((l) => (
            <div className="card mini" key={l.id}>{l.mapsUrl ? `${l.category} (Google listing)` : l.name}<span className="muted"> · {l.city}</span>
              {onMove && (
                <select aria-label={`Move ${l.name} to stage`} value={l.stage}
                  onChange={async (e) => setMsg(await onMove(l.id, e.target.value as Stage))}>
                  {STAGES.map((x) => <option key={x}>{x}</option>)}
                </select>)}
            </div>))}
        </div>))}
      </div>
    </>
  );
}

function Settings({ settings, live }: { settings: SettingsView; live: boolean }) {
  const rows: [string, string][] = [
    ['Cities', settings.cities.join(', ') || 'None'],
    [live ? 'Categories found so far' : 'Categories', settings.categories.join(', ') || 'None yet'],
    ['Daily discovery limit', String(settings.dailyDiscoveryLimit)], ['Shortlist size', String(settings.shortlist)],
    ['Daily demo limit', String(settings.dailyDemoLimit)], ['Minimum score', String(settings.minScore)],
    ['Schedule', settings.schedule], ['Image source', settings.imageSource],
  ];
  return <div className="card"><p className="muted">Read-only for now. Editing is not built yet.</p>
    <dl>{rows.map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
}

function Shell({ connected, email, signOut }: { connected: boolean; email?: string; signOut?: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview');
  const live = useLiveData(connected);
  const leads = connected ? live.leads : LEADS;
  const settings = connected ? live.settings : SETTINGS;
  return (
    <div className="shell">
      <aside><div className="brand">Lisgraphix<small>The Brand Builders</small></div>
        <nav>{TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
        {connected && <div className="who"><span>{email}</span><button onClick={live.reload}>Refresh</button><button onClick={signOut}>Sign out</button></div>}
      </aside>
      <main>
        {!connected && <div className="banner" role="note">Login is not connected. Sample data only. Nothing here is a real business.</div>}
        {connected && live.error && <div className="banner" role="alert">{live.error}</div>}
        <h1>{tab}</h1>
        {connected && live.loading ? <p className="muted">Loading…</p> : <>
          {tab === 'Overview' && <Overview leads={leads} failedRuns={connected ? live.failedRuns : 0} />}
          {tab === 'Leads' && <Leads leads={leads} />}
          {tab === 'Demos' && <Demos leads={leads} />}
          {tab === 'Pipeline' && <Pipeline leads={leads} onMove={connected ? live.setStage : undefined} />}
          {tab === 'Settings' && <Settings settings={settings} live={connected} />}
        </>}
      </main>
    </div>
  );
}

export function App() {
  return <AuthGate>{(ctx) => <Shell {...ctx} />}</AuthGate>;
}
