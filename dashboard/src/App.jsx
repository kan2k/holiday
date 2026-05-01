import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AgentSidebar from './components/AgentSidebar';
import ChartPanel from './components/ChartPanel';
import DecisionFeed from './components/DecisionFeed';
import BacktestPanel from './components/BacktestPanel';
import StatusBar from './components/StatusBar';
import ResizeHandle from './components/ResizeHandle';
import CreateAgentDialog from './components/CreateAgentDialog';

export default function App() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [allDecisions, setAllDecisions] = useState([]);
  const [totalDecisions, setTotalDecisions] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingDecisions, setLoadingDecisions] = useState(false);
  const [research, setResearch] = useState([]);
  const [ready, setReady] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const [sidebarTab, setSidebarTab] = useState('agents');
  const [backtests, setBacktests] = useState([]);
  const [selectedBacktest, setSelectedBacktest] = useState(null);
  const [backtestData, setBacktestData] = useState(null);

  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(340);

  const handleLeftResize = useCallback((delta) => {
    setLeftWidth(prev => Math.max(180, Math.min(400, prev + delta)));
  }, []);

  const handleRightResize = useCallback((delta) => {
    setRightWidth(prev => Math.max(260, Math.min(500, prev - delta)));
  }, []);

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        setAgents(data);
        setSelectedAgent((prev) => {
          if (prev && data.some((a) => a.id === prev)) return prev;
          return data.length > 0 ? data[0].id : null;
        });
        setTimeout(() => setReady(true), 300);
      })
      .catch(() => setReady(true));
  }, []);

  const handleDeleteAgent = useCallback(
    async (id, evt) => {
      evt?.stopPropagation?.();
      evt?.preventDefault?.();
      if (
        !window.confirm(
          `Delete agent "${id}"? This removes its config file from disk (decision logs are kept).`,
        )
      ) {
        return;
      }
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(body.error || 'Delete failed');
        return;
      }
      fetchAgents();
    },
    [fetchAgents],
  );

  useEffect(() => { fetchAgents(); }, []);

  useEffect(() => {
    fetch('/api/research')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setResearch(data); })
      .catch(() => {});
  }, []);

  // Fetch backtests
  useEffect(() => {
    fetch('/api/backtests')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setBacktests(data); })
      .catch(() => {});
  }, []);

  // Load selected backtest data
  useEffect(() => {
    if (!selectedBacktest) { setBacktestData(null); return; }
    fetch(`/api/backtests/${selectedBacktest}`)
      .then(r => r.json())
      .then(data => setBacktestData(data))
      .catch(() => setBacktestData(null));
  }, [selectedBacktest]);

  useEffect(() => {
    if (!selectedAgent) return;
    setDecisions([]);
    setOffset(0);
    setTotalDecisions(0);
    setLoadingDecisions(true);

    Promise.all([
      fetch(`/api/agents/${selectedAgent}/decisions?offset=0&limit=10`).then(r => r.json()),
      fetch(`/api/agents/${selectedAgent}/decisions/all`).then(r => r.json())
    ]).then(([paginated, all]) => {
      setDecisions(paginated.decisions);
      setTotalDecisions(paginated.total);
      setOffset(paginated.decisions.length);
      setAllDecisions(all);
      setLoadingDecisions(false);
    }).catch(() => setLoadingDecisions(false));
  }, [selectedAgent]);

  const loadMore = useCallback(() => {
    if (!selectedAgent || loadingDecisions || offset >= totalDecisions) return;
    setLoadingDecisions(true);
    fetch(`/api/agents/${selectedAgent}/decisions?offset=${offset}&limit=10`)
      .then(r => r.json())
      .then(data => {
        setDecisions(prev => [...prev, ...data.decisions]);
        setOffset(prev => prev + data.decisions.length);
        setLoadingDecisions(false);
      })
      .catch(() => setLoadingDecisions(false));
  }, [selectedAgent, offset, totalDecisions, loadingDecisions]);

  const selectedAgentData = agents.find(a => a.id === selectedAgent);
  const isBacktestView = sidebarTab === 'backtests' && selectedBacktest && backtestData;

  return (
    <div className="h-screen flex flex-col bg-terminal-bg overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,170,0.08) 2px, rgba(0,212,170,0.08) 4px)'
        }}
      />

      <StatusBar
        agentCount={agents.length}
        selectedAgent={isBacktestView ? null : selectedAgentData}
        backtestMode={isBacktestView}
        backtestAgent={isBacktestView ? backtestData?.config?.agentId : null}
      />

      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {ready && (
            <>
              {/* Left column - Agents/Backtests */}
              <motion.div
                initial={{ x: -80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="flex-shrink-0 border-r border-terminal-border"
                style={{ width: leftWidth }}
              >
                <AgentSidebar
                  agents={agents}
                  selected={selectedAgent}
                  onSelect={(id) => { setSelectedAgent(id); setSidebarTab('agents'); }}
                  onDeleteAgent={handleDeleteAgent}
                  onAddAgent={() => setShowCreateDialog(true)}
                  backtests={backtests}
                  selectedBacktest={selectedBacktest}
                  onSelectBacktest={setSelectedBacktest}
                  activeTab={sidebarTab}
                  onTabChange={setSidebarTab}
                />
              </motion.div>

              <ResizeHandle onResize={handleLeftResize} />

              {/* Center */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 min-w-[300px] overflow-hidden"
              >
                <ChartPanel
                  agent={isBacktestView
                    ? {
                        id: backtestData.config?.agentId,
                        pairs: backtestData.agentPairs || [...new Set((backtestData.trades || []).map(t => t.symbol))],
                        leverage: backtestData.leverage
                      }
                    : selectedAgentData}
                  decisions={isBacktestView
                    ? (backtestData.trades || []).flatMap(t => {
                        const markers = [];
                        const entryTs = new Date(t.day + 'T12:00:00Z').getTime() / 1000;
                        markers.push({
                          timestamp: entryTs,
                          action: t.action,
                          symbol: t.symbol,
                          size: null,
                          reason: `Entry @ $${t.entryPrice?.toFixed(2)}`,
                        });
                        if (t.exitDay && t.exitPrice) {
                          const exitTs = new Date(t.exitDay + 'T12:00:00Z').getTime() / 1000;
                          markers.push({
                            timestamp: exitTs,
                            action: 'CLOSE',
                            symbol: t.symbol,
                            size: null,
                            reason: `Exit @ $${t.exitPrice?.toFixed(2)} | PnL: $${t.pnl?.toFixed(2)} (${t.reason})`,
                          });
                        }
                        return markers;
                      })
                    : allDecisions}
                  research={research}
                  backtestTrades={isBacktestView ? backtestData.trades : null}
                  backtestEquity={isBacktestView ? backtestData.equityHistory : null}
                />
              </motion.div>

              <ResizeHandle onResize={handleRightResize} />

              {/* Right column */}
              <motion.div
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex-shrink-0 border-l border-terminal-border"
                style={{ width: rightWidth }}
              >
                {isBacktestView ? (
                  <BacktestPanel backtest={backtestData} />
                ) : (
                  <DecisionFeed
                    decisions={decisions}
                    total={totalDecisions}
                    loading={loadingDecisions}
                    onLoadMore={loadMore}
                    hasMore={offset < totalDecisions}
                  />
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <CreateAgentDialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          fetch('/api/backtests').then(r => r.json()).then(data => {
            if (Array.isArray(data)) setBacktests(data);
          }).catch(() => {});
        }}
        onCreated={() => { fetchAgents(); }}
      />
    </div>
  );
}
