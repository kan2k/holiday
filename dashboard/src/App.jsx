import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import AgentSidebar from './components/AgentSidebar';
import ChartPanel from './components/ChartPanel';
import DecisionFeed from './components/DecisionFeed';
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

  // Resizable column widths
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(340);

  const handleLeftResize = useCallback((delta) => {
    setLeftWidth(prev => Math.max(180, Math.min(400, prev + delta)));
  }, []);

  const handleRightResize = useCallback((delta) => {
    setRightWidth(prev => Math.max(260, Math.min(500, prev - delta)));
  }, []);

  // Fetch agents
  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        setAgents(data);
        if (data.length > 0 && !selectedAgent) {
          setSelectedAgent(data[0].id);
        }
        setTimeout(() => setReady(true), 300);
      })
      .catch(() => setReady(true));
  }, [selectedAgent]);

  useEffect(() => { fetchAgents(); }, []);

  // Fetch research reports
  useEffect(() => {
    fetch('/api/research')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setResearch(data); })
      .catch(() => {});
  }, []);

  // Fetch decisions when agent changes
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

  // Load more decisions
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

  return (
    <div className="h-screen flex flex-col bg-terminal-bg overflow-hidden">
      {/* Scan line effect */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.015]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,170,0.08) 2px, rgba(0,212,170,0.08) 4px)'
        }}
      />

      {/* Top bar */}
      <StatusBar agentCount={agents.length} selectedAgent={selectedAgentData} />

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          {ready && (
            <>
              {/* Left column - Agents */}
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
                  onSelect={setSelectedAgent}
                  onAddAgent={() => setShowCreateDialog(true)}
                />
              </motion.div>

              {/* Left resize handle */}
              <ResizeHandle onResize={handleLeftResize} />

              {/* Center - Charts */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 min-w-[300px] overflow-hidden"
              >
                <ChartPanel
                  agent={selectedAgentData}
                  decisions={allDecisions}
                  research={research}
                />
              </motion.div>

              {/* Right resize handle */}
              <ResizeHandle onResize={handleRightResize} />

              {/* Right column - Decisions */}
              <motion.div
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex-shrink-0 border-l border-terminal-border"
                style={{ width: rightWidth }}
              >
                <DecisionFeed
                  decisions={decisions}
                  total={totalDecisions}
                  loading={loadingDecisions}
                  onLoadMore={loadMore}
                  hasMore={offset < totalDecisions}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Create Agent Dialog */}
      <CreateAgentDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          fetchAgents();
        }}
      />
    </div>
  );
}
