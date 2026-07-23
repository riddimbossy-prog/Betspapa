import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Flame,
  History,
  Info,
  ListPlus,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  TrendingUp,
  X,
  Zap
} from 'lucide-react';
import { loadHistoricalDashboard, loadPredictions } from './api';
import type { HistoricalDashboard, Prediction, PredictionDashboard } from './types';

const emptyPredictions: PredictionDashboard = {
  source: 'offline',
  generatedAt: new Date().toISOString(),
  window: { from: '', to: '', days: [] },
  metrics: { fixtures: 0, picks: 0, bankers: 0, leagues: 0, lowOddsUpgrades: 0 },
  bankers: [],
  predictions: []
};

const emptyHistory: HistoricalDashboard = {
  source: 'demo',
  lastUpdated: new Date().toISOString(),
  metrics: { matches: 0, leagues: 0, patterns: 0, validated: 0 }
};

function dayLabel(date: string, index: number) {
  const value = new Date(`${date}T12:00:00Z`);
  return {
    short: index === 0 ? 'Today' : new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(value),
    date: new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(value)
  };
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' }).format(new Date(value));
}

function updatedLabel(value: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' }).format(new Date(value));
}

function confidenceLabel(value: number) {
  if (value >= 85) return 'Elite';
  if (value >= 80) return 'Strong';
  return 'Qualified';
}

function evidenceValue(prediction: Prediction, key: string, fallback = '—') {
  const value = prediction.evidence[key];
  return value == null ? fallback : String(value);
}

function engineName(key: string) {
  const map: Record<string, string> = { chronos: 'Historical odds', athena: 'Team stats', zeus: 'Market edge', leonidas: 'Strict filter' };
  return map[key] || key;
}

function PredictionCard({ prediction, onExplain, inList, onToggleList }: {
  prediction: Prediction;
  onExplain: () => void;
  inList: boolean;
  onToggleList: () => void;
}) {
  const passes = prediction.engines.filter((engine) => engine.pass).length;
  return (
    <article className={`prediction-card ${prediction.banker ? 'banker-card' : ''}`}>
      <div className="prediction-topline">
        <div>
          <span className="league-label">{prediction.country ? `${prediction.country} · ` : ''}{prediction.leagueName}</span>
          <span className="kickoff"><Clock3 size={14} />{timeLabel(prediction.kickoff)}</span>
        </div>
        <div className="card-badges">
          {prediction.upgraded && <span className="upgrade-badge"><TrendingUp size={13} />Upgraded</span>}
          {prediction.banker && <span className="banker-badge"><Star size={13} />Banker</span>}
        </div>
      </div>

      <div className="fixture-line">
        <strong>{prediction.homeTeam}</strong>
        <span>vs</span>
        <strong>{prediction.awayTeam}</strong>
      </div>

      <div className="selection-panel">
        <div><small>Chronos selection</small><h3>{prediction.selection}</h3></div>
        <div className="price"><small>Odds</small><strong>{prediction.odds.toFixed(2)}</strong></div>
      </div>

      <p className="plain-summary">{prediction.summary}</p>

      <div className="stat-strip">
        <span><small>Model</small><strong>{Math.round(prediction.probability)}%</strong></span>
        <span><small>History</small><strong>{Math.round(Number(prediction.evidence.historicalHitRate ?? 0))}%</strong></span>
        <span><small>Edge</small><strong className={prediction.edge >= 0 ? 'positive' : ''}>{prediction.edge >= 0 ? '+' : ''}{prediction.edge.toFixed(1)}%</strong></span>
        <span><small>Engines</small><strong>{passes}/4</strong></span>
      </div>

      <div className="engine-row">
        {prediction.engines.map((engine) => (
          <span className={engine.pass ? 'engine-pass' : 'engine-fail'} key={engine.key} title={engine.note}>
            {engine.pass ? <Check size={12} /> : <X size={12} />}{engine.name}
          </span>
        ))}
      </div>

      <div className="card-footer">
        <button className="why-button" onClick={onExplain}><Info size={16} />Why this pick?<ChevronRight size={16} /></button>
        <button className={`list-button ${inList ? 'added' : ''}`} onClick={onToggleList}>
          {inList ? <Check size={16} /> : <ListPlus size={16} />}{inList ? 'Added' : 'Add to list'}
        </button>
      </div>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState<PredictionDashboard>(emptyPredictions);
  const [history, setHistory] = useState<HistoricalDashboard>(emptyHistory);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [analysisList, setAnalysisList] = useState<Set<string>>(new Set());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    Promise.allSettled([loadPredictions(), loadHistoricalDashboard()]).then(([predictionsResult, historyResult]) => {
      if (predictionsResult.status === 'fulfilled') {
        setData(predictionsResult.value);
        setSelectedDate(predictionsResult.value.window.days[0] || '');
      }
      if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const datePredictions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.predictions
      .filter((prediction) => prediction.date === selectedDate)
      .filter((prediction) => !q || `${prediction.homeTeam} ${prediction.awayTeam} ${prediction.leagueName} ${prediction.selection}`.toLowerCase().includes(q))
      .sort((a, b) => b.confidence - a.confidence || a.kickoff.localeCompare(b.kickoff));
  }, [data.predictions, selectedDate, query]);

  const bankers = useMemo(() => datePredictions.filter((prediction) => prediction.banker).slice(0, 3), [datePredictions]);
  const regular = useMemo(() => datePredictions.filter((prediction) => !prediction.banker), [datePredictions]);
  const selectedLabel = selectedDate ? dayLabel(selectedDate, data.window.days.indexOf(selectedDate)) : { short: 'Today', date: '' };

  const toggleList = (fixtureId: string) => {
    setAnalysisList((current) => {
      const next = new Set(current);
      if (next.has(fixtureId)) next.delete(fixtureId);
      else next.add(fixtureId);
      return next;
    });
  };

  const addAllBankers = () => {
    setAnalysisList((current) => {
      const next = new Set(current);
      bankers.forEach((prediction) => next.add(prediction.fixtureId));
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Betynz home">
          <span className="brand-mark">ϟ</span>
          <span className="brand-copy"><strong>BETYNZ</strong><small>.com</small></span>
        </a>
        <label className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search teams, leagues or picks" />
        </label>
        <div className="header-actions">
          <div className="last-updated"><Clock3 size={14} /><span>Updated</span><strong>{updatedLabel(data.generatedAt)}</strong></div>
          <button className="install-button" onClick={install} disabled={!installPrompt}><Download size={17} />Install App</button>
          <button className="analysis-pill"><ListPlus size={17} />Analysis List <b>{analysisList.size}</b></button>
          <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={14} /> CHRONOS FUSION 2.3</span>
            <h1>Six days.<br /><span>Only qualified picks.</span></h1>
            <p>BetExplorer all-league fixtures and 1X2 prices are checked against historical odds, team form, league strength, venue records and table pressure before a pick is allowed onto the board.</p>
            <div className="hero-actions">
              <a className="primary-button" href="#bankers"><Star size={18} />See Today’s Bankers</a>
              <a className="secondary-button" href="#board"><BarChart3 size={18} />Open Full Board</a>
            </div>
            <div className="trust-row">
              <span><ShieldCheck size={15} /> No forced picks</span>
              <span><TrendingUp size={15} /> Odds below 1.19 are upgraded</span>
              <span><History size={15} /> {history.metrics.matches.toLocaleString()} settled matches</span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="hero-orbit"><span>CHRONOS</span><strong>{data.metrics.picks}</strong><small>qualified picks over six days</small></div>
            <div className="hero-metric-grid">
              <span><small>Bankers</small><strong>{data.metrics.bankers}</strong></span>
              <span><small>Fixtures checked</small><strong>{data.metrics.fixtures}</strong></span>
              <span><small>Leagues</small><strong>{data.metrics.leagues}</strong></span>
              <span><small>Upgrades</small><strong>{data.metrics.lowOddsUpgrades}</strong></span>
            </div>
          </div>
        </section>

        <section className="date-bar" aria-label="Prediction dates">
          <div className="date-tabs">
            {data.window.days.map((date, index) => {
              const label = dayLabel(date, index);
              const count = data.predictions.filter((prediction) => prediction.date === date).length;
              return (
                <button key={date} className={selectedDate === date ? 'active' : ''} onClick={() => setSelectedDate(date)}>
                  <span>{label.short}</span><strong>{label.date}</strong><small>{count} pick{count === 1 ? '' : 's'}</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="metrics-row">
          <article><span><Target /></span><div><small>{selectedLabel.short} qualified picks</small><strong>{datePredictions.length}</strong></div></article>
          <article><span><Trophy /></span><div><small>{selectedLabel.short} bankers</small><strong>{bankers.length}</strong></div></article>
          <article><span><BrainCircuit /></span><div><small>Engine version</small><strong>2.3</strong></div></article>
          <article><span><Activity /></span><div><small>Weak matches rejected</small><strong>{Math.max(0, data.metrics.fixtures - data.metrics.picks)}</strong></div></article>
        </section>

        <section className="content-section banker-section" id="bankers">
          <div className="section-heading">
            <div><span className="eyebrow"><Flame size={14} /> STRICTEST SECTION</span><h2>{selectedLabel.short}’s Bankers</h2><p>The top three picks only when all four engines agree. Banker does not mean guaranteed.</p></div>
            {bankers.length > 0 && <button className="add-all-button" onClick={addAllBankers}><ListPlus size={17} />Add all {bankers.length}</button>}
          </div>
          {bankers.length > 0 ? (
            <div className="banker-grid">
              {bankers.map((prediction) => (
                <PredictionCard
                  key={prediction.fixtureId}
                  prediction={prediction}
                  onExplain={() => setSelectedPrediction(prediction)}
                  inList={analysisList.has(prediction.fixtureId)}
                  onToggleList={() => toggleList(prediction.fixtureId)}
                />
              ))}
            </div>
          ) : (
            <div className="empty-panel compact">
              <ShieldCheck />
              <div><h3>No banker passed for this day</h3><p>Leonidas rejected every candidate that did not meet the strictest limits.</p></div>
            </div>
          )}
        </section>

        <section className="engine-consensus content-section">
          <div className="section-heading">
            <div><span className="eyebrow">THE OLYMPIAN ROOM</span><h2>How every pick is checked</h2></div>
            <span className="status-pill">4 / 4 online</span>
          </div>
          <div className="engine-grid">
            <article><span>◴</span><div><h3>Chronos</h3><p>Finds similar old matches and odds patterns.</p></div></article>
            <article><span>Α</span><div><h3>Athena</h3><p>Checks form, scoring, defence and venue records.</p></div></article>
            <article><span>ϟ</span><div><h3>Zeus</h3><p>Checks market price, strength gap and value.</p></div></article>
            <article><span>Λ</span><div><h3>Leonidas</h3><p>Rejects contradictions and weak samples.</p></div></article>
          </div>
        </section>

        <section className="content-section board-section" id="board">
          <div className="section-heading">
            <div><span className="eyebrow"><CalendarDays size={14} /> {selectedLabel.short.toUpperCase()} BOARD</span><h2>All qualified predictions</h2><p>One best market per fixture, explained in simple English.</p></div>
            <span className="board-count">{regular.length} regular + {bankers.length} bankers</span>
          </div>

          {loading ? (
            <div className="loading-panel"><div className="spinner" /><h3>Chronos is loading the six-day board…</h3></div>
          ) : data.source === 'offline' ? (
            <div className="empty-panel"><Info /><div><h3>The live prediction API is unavailable</h3><p>No demo picks are shown. Check the frontend API URL and Render CORS settings.</p></div></div>
          ) : datePredictions.length === 0 ? (
            <div className="empty-panel"><ShieldCheck /><div><h3>No qualified picks for {selectedLabel.short.toLowerCase()}</h3><p>This is normal. Betynz will not force a selection when the statistics or odds do not agree.</p></div></div>
          ) : (
            <div className="prediction-grid">
              {regular.map((prediction) => (
                <PredictionCard
                  key={prediction.fixtureId}
                  prediction={prediction}
                  onExplain={() => setSelectedPrediction(prediction)}
                  inList={analysisList.has(prediction.fixtureId)}
                  onToggleList={() => toggleList(prediction.fixtureId)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="method-note">
          <Zap />
          <div><h3>The 1.19 minimum is enforced</h3><p>When a selected market is priced below 1.19, Betynz tests the next stronger related market. The upgrade is published only when it passes stricter probability, sample and contradiction checks.</p></div>
        </section>
      </main>

      <footer className="footer">
        <span>© 2026 Betynz.com</span>
        <nav><a href="#">Responsible Gambling</a><a href="#">Terms</a><a href="#">Privacy</a><a href="#">Disclaimer</a></nav>
        <p>Football analytics only. 18+. No outcome is guaranteed.</p>
      </footer>

      <div className={`drawer-backdrop ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)} />
      <aside className={`drawer ${menuOpen ? 'open' : ''}`}>
        <button className="drawer-close" onClick={() => setMenuOpen(false)}><X /></button>
        <span className="eyebrow">BETYNZ NAVIGATION</span>
        <a href="#top" onClick={() => setMenuOpen(false)}>Overview</a>
        <a href="#bankers" onClick={() => setMenuOpen(false)}>Bankers</a>
        <a href="#board" onClick={() => setMenuOpen(false)}>Six-day board</a>
        <a href="#" onClick={() => setMenuOpen(false)}>Chronos Lab</a>
        <a href="#" onClick={() => setMenuOpen(false)}>Proof</a>
      </aside>

      <div className={`modal-backdrop ${selectedPrediction ? 'open' : ''}`} onClick={() => setSelectedPrediction(null)} />
      <aside className={`explanation-drawer ${selectedPrediction ? 'open' : ''}`}>
        {selectedPrediction && (
          <>
            <button className="drawer-close" onClick={() => setSelectedPrediction(null)}><X /></button>
            <span className="eyebrow"><BrainCircuit size={14} /> WHY THIS PICK?</span>
            <h2>{selectedPrediction.selection}</h2>
            <p className="modal-fixture">{selectedPrediction.homeTeam} vs {selectedPrediction.awayTeam}</p>
            <div className="modal-summary"><ShieldCheck /><p>{selectedPrediction.summary}</p></div>
            {selectedPrediction.upgraded && (
              <div className="upgrade-note"><TrendingUp /><div><strong>Low-odds upgrade</strong><p>{selectedPrediction.originalMarketLabel} at {selectedPrediction.originalOdds?.toFixed(2)} was below the 1.19 minimum, so the engine tested and approved the stronger market.</p></div></div>
            )}
            <h3>Simple statistical reasons</h3>
            <ol className="reason-list">{selectedPrediction.explanation.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ol>
            <div className="evidence-grid">
              <span><small>Historical sample</small><strong>{selectedPrediction.sample}</strong></span>
              <span><small>Historical hit rate</small><strong>{evidenceValue(selectedPrediction, 'historicalHitRate')}%</strong></span>
              <span><small>Home position</small><strong>{evidenceValue(selectedPrediction, 'homePosition')}</strong></span>
              <span><small>Away position</small><strong>{evidenceValue(selectedPrediction, 'awayPosition')}</strong></span>
              <span><small>Home venue PPG</small><strong>{evidenceValue(selectedPrediction, 'homeVenuePpg')}</strong></span>
              <span><small>Away venue PPG</small><strong>{evidenceValue(selectedPrediction, 'awayVenuePpg')}</strong></span>
            </div>
            <h3>Engine checks</h3>
            <div className="engine-detail-list">
              {selectedPrediction.engines.map((engine) => (
                <div key={engine.key} className={engine.pass ? 'pass' : 'fail'}>
                  <span>{engine.pass ? <Check /> : <X />}</span>
                  <div><strong>{engine.name} · {engineName(engine.key)}</strong><p>{engine.note}</p></div>
                  <b>{Math.round(engine.score)}</b>
                </div>
              ))}
            </div>
            <p className="disclaimer-note">Confidence is a model score, not a guarantee. Only stake what you can afford to lose.</p>
          </>
        )}
      </aside>

      <nav className="mobile-nav">
        <a href="#top"><Activity /><span>Home</span></a>
        <a href="#bankers"><Star /><span>Bankers</span></a>
        <a href="#board"><BarChart3 /><span>Board</span></a>
        <button onClick={() => setMenuOpen(true)}><Menu /><span>Menu</span></button>
      </nav>
    </div>
  );
}
