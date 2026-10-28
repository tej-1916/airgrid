import React, { useEffect, useState } from 'react';
import {
  Laptop,
  Radio,
  Search,
  Plus,
  RotateCw,
  Ban,
  Eye,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  X,
  Server,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Collector {
  id: string;
  name: string;
  host_label: string;
  description: string | null;
  status: 'active' | 'revoked';
  campus_id: string | null;
  building_id: string | null;
  floor_id: string | null;
  submission_count: number;
  rejected_count: number;
  last_submitted_at: string | null;
  created_at: string;
}

interface AccessPoint {
  id: string;
  floor_id: string | null;
  name: string;
  mac_address: string;
  model: string | null;
  vendor: string | null;
  x_coord: number | null;
  y_coord: number | null;
  channel_24ghz: number | null;
  channel_5ghz: number | null;
  tx_power_dbm: number | null;
  status: string;
  notes: string | null;
  source: string;
}

interface Observation {
  id: string;
  collected_at: string;
  ssid: string | null;
  bssid: string | null;
  rssi_dbm: number | null;
  band: string | null;
  channel: number | null;
  collection_status: string;
  rx_bitrate_mbps: number | null;
  tx_bitrate_mbps: number | null;
}

interface Campus {
  id: string;
  name: string;
  buildings: Array<{
    id: string;
    name: string;
    floors: Array<{
      id: string;
      name: string;
      floor_number: number;
    }>;
  }>;
}

export const DevicesPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'administrator';
  const isEngineerOrAdmin = isAdmin || user?.role === 'network_engineer';

  const [activeTab, setActiveTab] = useState<'collectors' | 'aps'>('collectors');
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedFloorId, setSelectedFloorId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Collector registration modal
  const [showCollectorModal, setShowCollectorModal] = useState(false);
  const [newCollectorName, setNewCollectorName] = useState('');
  const [newCollectorHost, setNewCollectorHost] = useState('');
  const [newCollectorDesc, setNewCollectorDesc] = useState('');
  const [newCollectorFloor, setNewCollectorFloor] = useState('');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // AP registration modal
  const [showApModal, setShowApModal] = useState(false);
  const [newApName, setNewApName] = useState('');
  const [newApMac, setNewApMac] = useState('');
  const [newApModel, setNewApModel] = useState('');
  const [newApVendor, setNewApVendor] = useState('');
  const [newApFloor, setNewApFloor] = useState('');
  const [newApCh24, setNewApCh24] = useState<number | ''>('');
  const [newApCh5, setNewApCh5] = useState<number | ''>('');
  const [newApTx, setNewApTx] = useState<number | ''>('');

  // Observation inspection modal
  const [inspectCollector, setInspectCollector] = useState<Collector | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loadingObservations, setLoadingObservations] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [colls, campusData] = await Promise.all([
        apiRequest<Collector[]>('/api/v1/collectors'),
        apiRequest<{ items: Campus[] }>('/api/v1/campuses'),
      ]);
      setCollectors(colls);
      setCampuses(campusData.items || []);

      // If a floor is selected or exists, fetch APs
      const firstFloorId = campusData.items?.[0]?.buildings?.[0]?.floors?.[0]?.id || '';
      const floorToUse = selectedFloorId || firstFloorId;
      if (floorToUse) {
        setSelectedFloorId(floorToUse);
        try {
          const aps = await apiRequest<AccessPoint[]>(`/api/v1/optimization/access-points?floor_id=${floorToUse}`);
          setAccessPoints(aps);
        } catch {
          setAccessPoints([]);
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load device inventory.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFloorChange = async (floorId: string) => {
    setSelectedFloorId(floorId);
    if (!floorId) {
      setAccessPoints([]);
      return;
    }
    try {
      const aps = await apiRequest<AccessPoint[]>(`/api/v1/optimization/access-points?floor_id=${floorId}`);
      setAccessPoints(aps);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch access points.' });
    }
  };

  const handleRegisterCollector = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ collector: Collector; secret: string }>('/api/v1/collectors', {
        method: 'POST',
        body: JSON.stringify({
          name: newCollectorName,
          host_label: newCollectorHost,
          description: newCollectorDesc || undefined,
          floor_id: newCollectorFloor || undefined,
        }),
      });
      setCreatedSecret(res.secret);
      setCollectors([res.collector, ...collectors]);
      setMessage({ type: 'success', text: `Collector "${res.collector.name}" registered successfully.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Collector registration failed.' });
    }
  };

  const handleRevokeCollector = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to revoke collector "${name}"? It will no longer be able to ingest observations.`)) {
      return;
    }
    try {
      const updated = await apiRequest<Collector>(`/api/v1/collectors/${id}/revoke`, { method: 'POST' });
      setCollectors(collectors.map((c) => (c.id === id ? updated : c)));
      setMessage({ type: 'success', text: `Collector "${name}" revoked.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Revocation failed.' });
    }
  };

  const handleRotateSecret = async (id: string, name: string) => {
    if (!window.confirm(`Rotate secret for collector "${name}"? Existing configuration using previous secret will fail.`)) {
      return;
    }
    try {
      const res = await apiRequest<{ collector: Collector; secret: string }>(`/api/v1/collectors/${id}/rotate`, { method: 'POST' });
      setCreatedSecret(res.secret);
      setShowCollectorModal(true);
      setCollectors(collectors.map((c) => (c.id === id ? res.collector : c)));
      setMessage({ type: 'success', text: `Secret for "${name}" rotated successfully.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rotation failed.' });
    }
  };

  const handleInspectObservations = async (collector: Collector) => {
    setInspectCollector(collector);
    setLoadingObservations(true);
    try {
      const obs = await apiRequest<Observation[]>(`/api/v1/collectors/${collector.id}/observations?limit=50`);
      setObservations(obs);
    } catch (err) {
      setObservations([]);
    } finally {
      setLoadingObservations(false);
    }
  };

  const handleRegisterAp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApFloor) {
      setMessage({ type: 'error', text: 'Please select a floor for the access point.' });
      return;
    }
    try {
      const newAp = await apiRequest<AccessPoint>('/api/v1/optimization/access-points', {
        method: 'POST',
        body: JSON.stringify({
          name: newApName,
          mac_address: newApMac,
          floor_id: newApFloor,
          model: newApModel || undefined,
          vendor: newApVendor || undefined,
          channel_24ghz: newApCh24 === '' ? undefined : Number(newApCh24),
          channel_5ghz: newApCh5 === '' ? undefined : Number(newApCh5),
          tx_power_dbm: newApTx === '' ? undefined : Number(newApTx),
        }),
      });
      if (newApFloor === selectedFloorId) {
        setAccessPoints([...accessPoints, newAp]);
      }
      setShowApModal(false);
      setNewApName('');
      setNewApMac('');
      setNewApModel('');
      setNewApVendor('');
      setMessage({ type: 'success', text: `Access Point "${newAp.name}" registered.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'AP registration failed.' });
    }
  };

  const handleDeleteAp = async (id: string, name: string) => {
    if (!window.confirm(`Delete access point "${name}"?`)) return;
    try {
      await apiRequest(`/api/v1/optimization/access-points/${id}`, { method: 'DELETE' });
      setAccessPoints(accessPoints.filter((a) => a.id !== id));
      setMessage({ type: 'success', text: `Access Point "${name}" deleted.` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete AP.' });
    }
  };

  const filteredCollectors = collectors.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.host_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAps = accessPoints.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.mac_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.vendor && a.vendor.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#D9DBDE]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#BE6B37]">Hardware & Agents</span>
            <span className="text-xs bg-[#E5E7EB] text-neutral-700 px-2 py-0.5 rounded-full font-mono">Infrastructure</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 text-[#0B0B0D]">Device & Access Point Inventory</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Registered Linux collectors, authenticated telemetry probes, and floor-level access points.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'collectors' && isAdmin && (
            <button
              onClick={() => {
                setCreatedSecret(null);
                setShowCollectorModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-sm font-medium hover:bg-[#A85B2D] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Register Collector</span>
            </button>
          )}

          {activeTab === 'aps' && isEngineerOrAdmin && (
            <button
              onClick={() => {
                setNewApFloor(selectedFloorId);
                setShowApModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-[#BE6B37] text-white rounded-lg text-sm font-medium hover:bg-[#A85B2D] transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Register AP</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          role="alert"
          className={`p-4 rounded-xl text-sm border flex items-start justify-between gap-3 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-neutral-500 hover:text-neutral-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs and Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-[#E5E7EB]/60 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('collectors')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'collectors'
                ? 'bg-white text-[#0B0B0D] shadow-sm'
                : 'text-neutral-600 hover:text-[#0B0B0D]'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Linux Collectors ({collectors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('aps')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'aps'
                ? 'bg-white text-[#0B0B0D] shadow-sm'
                : 'text-neutral-600 hover:text-[#0B0B0D]'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Access Points ({accessPoints.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'aps' && (
            <div className="flex items-center gap-2 text-xs">
              <Layers className="w-4 h-4 text-neutral-500" />
              <select
                value={selectedFloorId}
                onChange={(e) => handleFloorChange(e.target.value)}
                className="bg-white border border-[#D9DBDE] rounded-lg px-3 py-1.5 text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
              >
                <option value="">-- Select Floor --</option>
                {campuses.flatMap((c) =>
                  c.buildings.flatMap((b) =>
                    b.floors.map((f) => (
                      <option key={f.id} value={f.id}>
                        {c.name} » {b.name} » {f.name} (L{f.floor_number})
                      </option>
                    ))
                  )
                )}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder={activeTab === 'collectors' ? 'Search collectors…' : 'Search APs or MAC…'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-[#D9DBDE] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#0B0B0D] placeholder-neutral-400 focus:outline-none focus:border-[#BE6B37] w-56"
            />
          </div>
        </div>
      </div>

      {/* Main Content Tables */}
      {loading ? (
        <div className="p-12 text-center text-sm text-neutral-500">Loading devices…</div>
      ) : activeTab === 'collectors' ? (
        filteredCollectors.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
            <Server className="w-10 h-10 text-neutral-400 mx-auto" />
            <h3 className="text-base font-semibold text-[#0B0B0D]">No Linux Collectors Found</h3>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Register a Linux host as a signed telemetry collector to securely ingest Wi-Fi signal, bitrate, and gateway observations.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
                <tr>
                  <th className="py-3 px-4">Collector Name</th>
                  <th className="py-3 px-4">Host Identifier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Submissions / Rejections</th>
                  <th className="py-3 px-4">Last Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {filteredCollectors.map((c) => (
                  <tr key={c.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0B0B0D]">{c.name}</div>
                      {c.description && <div className="text-[11px] text-neutral-500 mt-0.5">{c.description}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono text-neutral-600">{c.host_label}</td>
                    <td className="py-3 px-4">
                      {c.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <span className="text-neutral-900 font-medium">{c.submission_count}</span>
                      <span className="text-neutral-400"> / </span>
                      <span className={c.rejected_count > 0 ? 'text-red-600 font-medium' : 'text-neutral-500'}>
                        {c.rejected_count}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-neutral-600">
                      {c.last_submitted_at ? new Date(c.last_submitted_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleInspectObservations(c)}
                          title="View Telemetry Observations"
                          className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && c.status === 'active' && (
                          <>
                            <button
                              onClick={() => handleRotateSecret(c.id, c.name)}
                              title="Rotate Secret"
                              className="p-1.5 rounded-md hover:bg-neutral-100 text-neutral-600 transition-colors"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRevokeCollector(c.id, c.name)}
                              title="Revoke Collector"
                              className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : filteredAps.length === 0 ? (
        <div className="p-12 rounded-2xl bg-white border border-[#D9DBDE] text-center space-y-3">
          <Radio className="w-10 h-10 text-neutral-400 mx-auto" />
          <h3 className="text-base font-semibold text-[#0B0B0D]">No Access Points Found</h3>
          <p className="text-xs text-neutral-500 max-w-md mx-auto">
            {selectedFloorId
              ? 'No access points registered on this floor yet. Register access points to track transmitter locations and power.'
              : 'Select a floor above to view registered access points.'}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#D9DBDE] bg-white overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
              <tr>
                <th className="py-3 px-4">AP Name</th>
                <th className="py-3 px-4">MAC Address</th>
                <th className="py-3 px-4">Model / Vendor</th>
                <th className="py-3 px-4">Channels (2.4 / 5 GHz)</th>
                <th className="py-3 px-4">Tx Power</th>
                <th className="py-3 px-4">Status</th>
                {isEngineerOrAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {filteredAps.map((ap) => (
                <tr key={ap.id} className="hover:bg-neutral-50/60 transition-colors font-mono">
                  <td className="py-3 px-4 font-sans font-semibold text-[#0B0B0D]">{ap.name}</td>
                  <td className="py-3 px-4 text-neutral-700">{ap.mac_address}</td>
                  <td className="py-3 px-4 font-sans text-neutral-600">
                    {ap.vendor || ap.model ? `${ap.vendor || ''} ${ap.model || ''}`.trim() : 'Generic'}
                  </td>
                  <td className="py-3 px-4 text-neutral-600">
                    {ap.channel_24ghz ?? '—'} / {ap.channel_5ghz ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-neutral-600">
                    {ap.tx_power_dbm !== null ? `${ap.tx_power_dbm} dBm` : 'Unspecified'}
                  </td>
                  <td className="py-3 px-4 font-sans">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {ap.status}
                    </span>
                  </td>
                  {isEngineerOrAdmin && (
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteAp(ap.id, ap.name)}
                        className="text-red-600 hover:text-red-800 text-xs font-sans"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collector Registration / Secret Display Modal */}
      {showCollectorModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#D9DBDE] max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DBDE]">
              <h3 className="text-base font-bold text-[#0B0B0D]">
                {createdSecret ? 'Collector Secret Credentials' : 'Register New Linux Collector'}
              </h3>
              <button
                onClick={() => {
                  setShowCollectorModal(false);
                  setCreatedSecret(null);
                }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdSecret ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                  <strong>Important:</strong> Save this collector secret now. It is derived securely via HMAC and will{' '}
                  <em>never be displayed again</em>.
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700">Collector Secret</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdSecret}
                      className="bg-neutral-50 border border-[#D9DBDE] rounded-lg px-3 py-2 text-xs font-mono text-neutral-900 w-full select-all"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdSecret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="flex items-center gap-1 px-3 py-2 bg-[#BE6B37] text-white rounded-lg text-xs font-medium hover:bg-[#A85B2D] transition-colors"
                    >
                      {copiedSecret ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowCollectorModal(false);
                    setCreatedSecret(null);
                  }}
                  className="w-full py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors"
                >
                  I Have Stored the Secret Securely
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegisterCollector} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Collector Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science Hall Survey Laptop"
                    value={newCollectorName}
                    onChange={(e) => setNewCollectorName(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Host Label *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. laptop-thinkpad-x1"
                    value={newCollectorHost}
                    onChange={(e) => setNewCollectorHost(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] font-mono focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Floor Association (Optional)</label>
                  <select
                    value={newCollectorFloor}
                    onChange={(e) => setNewCollectorFloor(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  >
                    <option value="">-- No fixed floor scope --</option>
                    {campuses.flatMap((c) =>
                      c.buildings.flatMap((b) =>
                        b.floors.map((f) => (
                          <option key={f.id} value={f.id}>
                            {c.name} » {b.name} » {f.name}
                          </option>
                        ))
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Description (Optional)</label>
                  <textarea
                    rows={2}
                    placeholder="Notes on antenna configuration or collector role..."
                    value={newCollectorDesc}
                    onChange={(e) => setNewCollectorDesc(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCollectorModal(false)}
                    className="px-3 py-2 border border-[#D9DBDE] text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#BE6B37] text-white rounded-lg hover:bg-[#A85B2D] font-medium"
                  >
                    Register & Generate Secret
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* AP Registration Modal */}
      {showApModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#D9DBDE] max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DBDE]">
              <h3 className="text-base font-bold text-[#0B0B0D]">Register Access Point</h3>
              <button onClick={() => setShowApModal(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRegisterAp} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">AP Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AP-SCI-101"
                  value={newApName}
                  onChange={(e) => setNewApName(e.target.value)}
                  className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">MAC Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 02:00:00:00:00:01"
                  value={newApMac}
                  onChange={(e) => setNewApMac(e.target.value)}
                  className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 font-mono text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Floor *</label>
                <select
                  required
                  value={newApFloor}
                  onChange={(e) => setNewApFloor(e.target.value)}
                  className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                >
                  <option value="">-- Select Floor --</option>
                  {campuses.flatMap((c) =>
                    c.buildings.flatMap((b) =>
                      b.floors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {c.name} » {b.name} » {f.name}
                        </option>
                      ))
                    )
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Cisco"
                    value={newApVendor}
                    onChange={(e) => setNewApVendor(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Model</label>
                  <input
                    type="text"
                    placeholder="e.g. Catalyst 9120"
                    value={newApModel}
                    onChange={(e) => setNewApModel(e.target.value)}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-3 py-2 text-[#0B0B0D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">2.4GHz Ch</label>
                  <input
                    type="number"
                    placeholder="1-14"
                    value={newApCh24}
                    onChange={(e) => setNewApCh24(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-2 py-2 text-center"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">5GHz Ch</label>
                  <input
                    type="number"
                    placeholder="36-165"
                    value={newApCh5}
                    onChange={(e) => setNewApCh5(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-2 py-2 text-center"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">Tx (dBm)</label>
                  <input
                    type="number"
                    placeholder="dBm"
                    value={newApTx}
                    onChange={(e) => setNewApTx(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-white border border-[#D9DBDE] rounded-lg px-2 py-2 text-center"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowApModal(false)}
                  className="px-3 py-2 border border-[#D9DBDE] text-neutral-700 rounded-lg hover:bg-neutral-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#BE6B37] text-white rounded-lg hover:bg-[#A85B2D] font-medium"
                >
                  Register AP
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Observations Drawer */}
      {inspectCollector && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#D9DBDE] max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DBDE]">
              <div>
                <h3 className="text-base font-bold text-[#0B0B0D]">
                  Collector Telemetry: {inspectCollector.name}
                </h3>
                <p className="text-xs font-mono text-neutral-500">{inspectCollector.host_label}</p>
              </div>
              <button onClick={() => setInspectCollector(null)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingObservations ? (
                <div className="p-8 text-center text-xs text-neutral-500">Loading observations…</div>
              ) : observations.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">No observations recorded by this collector yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b border-[#D9DBDE]">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">SSID / BSSID</th>
                      <th className="py-2.5 px-3">Band / Ch</th>
                      <th className="py-2.5 px-3">RSSI</th>
                      <th className="py-2.5 px-3">Bitrates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB] font-mono text-[11px]">
                    {observations.map((o) => (
                      <tr key={o.id} className="hover:bg-neutral-50/60">
                        <td className="py-2.5 px-3 text-neutral-600">
                          {new Date(o.collected_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-sans font-medium text-[#0B0B0D]">{o.ssid || 'Hidden'}</div>
                          <div className="text-[10px] text-neutral-500">{o.bssid || '—'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          {o.band || '—'} Ch {o.channel ?? '—'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-900">
                          {o.rssi_dbm !== null ? `${o.rssi_dbm} dBm` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          {o.rx_bitrate_mbps ? `${o.rx_bitrate_mbps} Mbps` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-[#D9DBDE] flex justify-end">
              <button
                onClick={() => setInspectCollector(null)}
                className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-medium hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
