import React, { useState } from 'react';
import { Workflow, Send } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';

export const AutomationsPage: React.FC = () => {
  const [testResult, setTestResult] = useState<any>(null);
  const [sending, setSending] = useState(false);

  const handleTestDispatch = async () => {
    setSending(true);
    try {
      const res = await fetch('/api/v1/automations/dispatch-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'network.degradation',
          severity: 'warning',
          data: {
            campus_name: 'North Campus Engineering',
            building_code: 'NC-ENG',
            floor_name: 'Floor 2',
            ap_name: 'AP-ENG-201',
            mean_rssi_dbm: -81.4,
            affected_clients: 14,
          },
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ status: 'error', error_message: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="13. n8n Automation Center"
        phase00Scope="HMAC-SHA256 signed webhook dispatch interface and replay defense verification established."
        nextPhaseMilestone="Phase 02 will connect the live n8n workflow container on port 5680 for Slack/email routing."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Target n8n Webhook Port</div>
          <div className="text-sm font-semibold text-white font-mono">Port 5680 (Isolated)</div>
          <div className="text-[11px] text-slate-500 mt-1">Avoids port collisions on host</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Webhook Signing Algorithm</div>
          <div className="text-sm font-semibold text-white font-mono">HMAC-SHA256</div>
          <div className="text-[11px] text-slate-500 mt-1">X-AirGrid-Signature header</div>
        </div>

        <div className="p-4 rounded-xl border border-navy-800 bg-navy-900/40">
          <div className="text-xs text-slate-400 mb-1">Replay Defense Window</div>
          <div className="text-sm font-semibold text-white font-mono">± 300 Seconds</div>
          <div className="text-[11px] text-slate-500 mt-1">X-AirGrid-Timestamp header</div>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-navy-800 bg-navy-900/40 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Workflow className="w-4 h-4 text-electric-cyan" />
              <span>Simulate Signed Webhook Dispatch</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Validates cryptographic signing and event construction without sending live emails in Phase 00.
            </p>
          </div>

          <button
            onClick={handleTestDispatch}
            disabled={sending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-electric-cyan text-void font-semibold text-xs hover:bg-electric-cyan-bright transition-all disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sending ? 'Signing & Dispatching...' : 'Dispatch Test Payload'}</span>
          </button>
        </div>

        {testResult && (
          <div className="p-4 rounded-lg bg-navy-950 border border-navy-850 space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Delivery ID:</span>
              <span className="text-white">{testResult.delivery_id}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="text-emerald-400 uppercase font-semibold">{testResult.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Execution Mode:</span>
              <span className="text-amber-400">Simulated (Zero production email side-effects)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
