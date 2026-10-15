import React from 'react';
import { Router as RouterIcon, Laptop, Filter, Search } from 'lucide-react';
import { PhaseNotice } from '../components/common/PhaseNotice';
import { StatusBadge } from '../components/common/StatusBadge';

export const DevicesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <PhaseNotice
        pageTitle="07. Device & Access Point Manager"
        phase00Scope="Hardware inventory schema and data table layout established."
        nextPhaseMilestone="Phase 01 will wire database records for live AP states, MAC lookups, and survey devices."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Access Points & Measurement Probes</h2>
          <p className="text-xs text-slate-400">Inventory of campus wireless transmitters and survey client laptops.</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search BSSID, MAC, or Name..."
              className="bg-navy-950 border border-navy-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-electric-cyan"
            />
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-900 border border-navy-700 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-navy-800 bg-navy-900/40 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-navy-950 text-slate-400 font-semibold border-b border-navy-800">
            <tr>
              <th className="py-3 px-4">Device Name</th>
              <th className="py-3 px-4">Type / Vendor</th>
              <th className="py-3 px-4">MAC Address</th>
              <th className="py-3 px-4">Location / Floor</th>
              <th className="py-3 px-4">Radio Band</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-850 text-slate-300 font-mono">
            <tr className="hover:bg-navy-850/50">
              <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2">
                <RouterIcon className="w-4 h-4 text-electric-cyan" />
                <span>AP-ENG-201</span>
              </td>
              <td className="py-3 px-4 font-sans text-slate-400">Aruba AP-535</td>
              <td className="py-3 px-4 text-slate-300">AA:BB:CC:DD:EE:01</td>
              <td className="py-3 px-4 font-sans text-slate-400">Floor 2 (Labs)</td>
              <td className="py-3 px-4">5 GHz (Ch 36)</td>
              <td className="py-3 px-4">
                <StatusBadge status="Active" variant="active" />
              </td>
            </tr>
            <tr className="hover:bg-navy-850/50">
              <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2">
                <RouterIcon className="w-4 h-4 text-electric-cyan" />
                <span>AP-ENG-202</span>
              </td>
              <td className="py-3 px-4 font-sans text-slate-400">Aruba AP-535</td>
              <td className="py-3 px-4 text-slate-300">AA:BB:CC:DD:EE:02</td>
              <td className="py-3 px-4 font-sans text-slate-400">Floor 2 (Faculty)</td>
              <td className="py-3 px-4">5 GHz (Ch 44)</td>
              <td className="py-3 px-4">
                <StatusBadge status="Active" variant="active" />
              </td>
            </tr>
            <tr className="hover:bg-navy-850/50">
              <td className="py-3 px-4 font-sans font-medium text-white flex items-center gap-2">
                <Laptop className="w-4 h-4 text-blue-400" />
                <span>SURVEY-RIG-ARCH-01</span>
              </td>
              <td className="py-3 px-4 font-sans text-slate-400">Field Laptop (Linux iw)</td>
              <td className="py-3 px-4 text-slate-300">E4:5F:01:89:AB:CD</td>
              <td className="py-3 px-4 font-sans text-slate-400">Mobile Rover</td>
              <td className="py-3 px-4">Dual-Band Scanner</td>
              <td className="py-3 px-4">
                <StatusBadge status="Authorized" variant="healthy" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
