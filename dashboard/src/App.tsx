import { useState } from 'react';
import { AuthGate } from './auth';
import { LEADS, SETTINGS, STAGES, type Lead } from './data';

type Tab = 'Overview' | 'Leads' | 'Demos' | 'Pipeline' | 'Settings';
const TABS: Tab[] = ['Overview', 'Leads', 'Demos', 'Pipeline', 'Settings'];

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="card stat"><div className="num">{value}</div><div className="label">{label}</div></div>;
}

function Overview() {
  const gap = LEADS.filter((l) => l.websiteStatus.startsWith('No official')).length;
  return (
    <div className="grid">
      <Stat label="Businesses discovered" value={LEADS.length} />
      <Stat label="Without identified website" value={gap} />
      <Stat label="High-priority prospects" value={LEADS.filter((l) => l.score >= 80).length} />
      <Stat label="Demos generated" value={LEADS.filter((l) => l.demo === 'Ready').length} />
      <Stat label="Successful deployments" value={0} />
      <Stat label="Contacted" value={0} />
      <Stat label="Interested" value={0} />
      <Stat label="Converted" value={0} />
      <Stat label="Failed tasks" value={LEADS.filter((l) => l.demo === 'Failed').length} />
    </div>
  );
}

function Leads() {
  const [q, setQ] = useState('');
  const rows = LEADS.filter((l) => `${l.name} ${l.category} ${l.city}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <input className="search" placeholder="Search leads" aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll"><table>
        <thead><tr>{['Business','Category','City','Website status','Confidence','Score','Contact','Found','Demo','Stage'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((l: Lead) => (
          <tr key={l.id}><td>{l.name}</td><td>{l.category}</td><td>{l.city}</td><td>{l.websiteStatus}</td>
            <td>{l.confidence}%</td><td><b>{l.score}</b>/100</td><td>{l.contact}</td><td>{l.discovered}</td><td>{l.demo}</td><td>{l.stage}</td></tr>
        ))}</tbody>
      </table></div>
      {rows.length === 0 && <p className="muted">No leads match.</p>}
    </div>
  );
}

function Demos() {
  const ready = LEADS.filter((l) => l.demo !== 'None');
  return (
    <div className="grid">{ready.map((l) => (
      <div className="card" key={l.id}>
        <div className="thumb" aria-hidden />
        <h3>{l.name}</h3>
        <p className="muted">Status: {l.demo === 'Ready' ? 'Built locally (not deployed)' : 'Failed'}</p>
        <p className="muted">No live URL: deployment is not connected.</p>
        <button disabled>View website</button> <button disabled>Rebuild</button> <button disabled>Archive</button>
      </div>))}
    </div>
  );
}

function Pipeline() {
  return (
    <div className="board">{STAGES.map((s) => (
      <div className="col" key={s}><h4>{s}</h4>
        {LEADS.filter((l) => l.stage === s).map((l) => <div className="card mini" key={l.id}>{l.name}<span className="muted"> · {l.city}</span></div>)}
      </div>))}
    </div>
  );
}

function Settings() {
  const rows: [string, string][] = [
    ['Cities', SETTINGS.cities.join(', ')], ['Categories', SETTINGS.categories.join(', ')],
    ['Daily discovery limit', String(SETTINGS.dailyDiscoveryLimit)], ['Shortlist size', String(SETTINGS.shortlist)],
    ['Daily demo limit', String(SETTINGS.dailyDemoLimit)], ['Minimum score', String(SETTINGS.minScore)],
    ['Schedule', SETTINGS.schedule], ['Image source', SETTINGS.imageSource],
  ];
  return <div className="card"><p className="muted">Read-only preview. Editing arrives with the database.</p>
    <dl>{rows.map(([k, v]) => <div className="row" key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>;
}

export function App() {
  const [tab, setTab] = useState<Tab>('Overview');
  return (
    <AuthGate>{({ connected, email, signOut }) => (
      <div className="shell">
        <aside><div className="brand">Lisgraphix<small>The Brand Builders</small></div>
          <nav>{TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
          {connected && <div className="who"><span>{email}</span><button onClick={signOut}>Sign out</button></div>}
        </aside>
        <main>
          <div className="banner" role="note">
            {connected
              ? 'Signed in. The screens still show sample data until live data is wired up.'
              : 'Login is not connected. Sample data only. Nothing here is a real business.'}
          </div>
          <h1>{tab}</h1>
          {tab === 'Overview' && <Overview />}{tab === 'Leads' && <Leads />}{tab === 'Demos' && <Demos />}
          {tab === 'Pipeline' && <Pipeline />}{tab === 'Settings' && <Settings />}
        </main>
      </div>
    )}</AuthGate>
  );
}
