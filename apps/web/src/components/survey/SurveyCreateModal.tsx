import React, { useState } from 'react';
import { X, Plus, Layers, AlertCircle } from 'lucide-react';
import { SurveySessionCreatePayload } from '../../types/survey';

interface SurveyCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorId: string;
  floorName: string;
  campusId?: string;
  buildingId?: string;
  onCreate: (payload: SurveySessionCreatePayload) => Promise<void>;
}

export const SurveyCreateModal: React.FC<SurveyCreateModalProps> = ({
  isOpen,
  onClose,
  floorId,
  floorName,
  campusId,
  buildingId,
  onCreate,
}) => {
  const [sessionName, setSessionName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim()) {
      setErrorMsg('Please enter a descriptive survey session name.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      await onCreate({
        floor_id: floorId,
        campus_id: campusId,
        building_id: buildingId,
        session_name: sessionName.trim(),
        description: description.trim() || undefined,
      });
      setSessionName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create survey session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D9DBDE] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[#D9DBDE] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#BE6B37]/10 flex items-center justify-center text-[#BE6B37]">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0B0B0D] tracking-tight">
                Create Survey Session
              </h2>
              <p className="text-xs text-[#737373] flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#BE6B37]" />
                <span>Target: {floorName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#737373] hover:text-[#0B0B0D] hover:bg-[#F5F5F3]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0B0B0D] block">
              Session Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Q4 Baseline Wi-Fi Walkthrough"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-white border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0B0B0D] block">
              Description (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Surveying 5 GHz coverage across open-office workstations and meeting rooms."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-white border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9DBDE]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-1.5 px-4 rounded-xl border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="py-1.5 px-4 rounded-xl bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-50 transition-colors shadow-xs"
            >
              {loading ? 'Creating...' : 'Start Survey'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
