import { apiRequest } from './api';
import {
  DashboardSummary,
  CampusInventoryItem,
  DashboardActivityItem,
  SystemStatusData,
} from '../types/campus';

export const dashboardService = {
  async getSummary(campusId?: string): Promise<DashboardSummary> {
    const qs = campusId ? `?campus_id=${encodeURIComponent(campusId)}` : '';
    return apiRequest<DashboardSummary>(`/api/v1/dashboard/summary${qs}`);
  },

  async getInventory(): Promise<{ total: number; items: CampusInventoryItem[] }> {
    return apiRequest<{ total: number; items: CampusInventoryItem[] }>('/api/v1/dashboard/inventory');
  },

  async getActivity(limit: number = 20): Promise<{ items: DashboardActivityItem[] }> {
    return apiRequest<{ items: DashboardActivityItem[] }>(`/api/v1/dashboard/activity?limit=${limit}`);
  },

  async getSystemStatus(): Promise<SystemStatusData> {
    return apiRequest<SystemStatusData>('/api/v1/dashboard/system-status');
  },
};
