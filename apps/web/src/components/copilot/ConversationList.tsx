import React, { useState } from 'react';
import { Plus, Search, MessageSquare, Trash2, Edit2, Check, X, Sparkles } from 'lucide-react';
import { ConversationSummary } from '../../types/copilot';

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  loading?: boolean;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  loading = false,
}) => {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.model.toLowerCase().includes(search.toLowerCase())
  );

  const startEditing = (c: ConversationSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
  };

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editTitle.trim()) return;
    try {
      await onRename(editingId, editTitle.trim());
      setEditingId(null);
    } catch {
      // handled upstream
    }
  };

  const confirmDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await onDelete(id);
      setDeletingId(null);
    } catch {
      // handled upstream
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#D9DBDE] w-72 sm:w-80 flex-shrink-0 select-none">
      {/* Top Action Bar */}
      <div className="p-3.5 border-b border-[#D9DBDE] space-y-2.5">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#BE6B37] hover:bg-[#A85B2D] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New AI Conversation</span>
        </button>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[#F5F5F3] border border-[#D9DBDE] rounded-lg text-xs text-[#0B0B0D] placeholder-neutral-400 focus:outline-none focus:border-[#BE6B37]"
          />
        </div>
      </div>

      {/* Conversation List Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && conversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-400">Loading history...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-neutral-300 mx-auto" />
            <p className="text-xs text-neutral-500 font-medium">No conversations found</p>
            <p className="text-[11px] text-neutral-400">
              {search ? 'Try clearing your search query.' : 'Click "New AI Conversation" to start.'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => !isEditing && onSelect(conv.id)}
                className={`group relative p-2.5 rounded-xl cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-[#BE6B37]/10 border-[#BE6B37]/40 text-[#0B0B0D] shadow-xs'
                    : 'bg-white border-transparent hover:bg-[#F5F5F3] hover:border-[#D9DBDE] text-neutral-700'
                }`}
              >
                {isEditing ? (
                  <form onSubmit={submitRename} className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-white border border-[#BE6B37] rounded text-xs text-[#0B0B0D] focus:outline-none"
                    />
                    <button type="submit" className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Save">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 text-neutral-400 hover:text-neutral-600 rounded"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <MessageSquare
                        className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                          isActive ? 'text-[#BE6B37]' : 'text-neutral-400'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${isActive ? 'text-[#0B0B0D]' : 'text-neutral-800'}`}>
                          {conv.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400 font-mono">
                          <span>{conv.model}</span>
                          <span>•</span>
                          <span>{new Date(conv.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons on hover/active */}
                    <div
                      className={`flex items-center gap-0.5 flex-shrink-0 ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      } transition-opacity`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => startEditing(conv, e)}
                        className="p-1 text-neutral-400 hover:text-[#0B0B0D] rounded hover:bg-black/5"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {deletingId === conv.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-0.5 rounded border border-red-200">
                          <button
                            onClick={(e) => confirmDelete(conv.id, e)}
                            className="text-[10px] text-red-700 font-bold px-1 hover:underline"
                          >
                            Del
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="text-[10px] text-neutral-500 px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingId(conv.id)}
                          className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
