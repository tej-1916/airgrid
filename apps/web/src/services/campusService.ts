import { apiRequest } from './api';
import {
  Campus,
  CampusCreatePayload,
  CampusUpdatePayload,
  Building,
  BuildingCreatePayload,
  BuildingUpdatePayload,
  Floor,
  FloorCreatePayload,
  FloorUpdatePayload,
  FloorPlanAsset,
  CalibrationPayload,
  FloorOutlinePayload,
} from '../types/campus';

export interface CampusListResult {
  total: number;
  skip: number;
  limit: number;
  items: Campus[];
}

export const campusService = {
  // Campuses
  async listCampuses(params?: { skip?: number; limit?: number; q?: string }): Promise<CampusListResult> {
    const search = new URLSearchParams();
    if (params?.skip !== undefined) search.set('skip', String(params.skip));
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.q) search.set('q', params.q);
    const qs = search.toString();
    return apiRequest<CampusListResult>(`/api/v1/campuses${qs ? `?${qs}` : ''}`);
  },

  async getCampus(id: string): Promise<Campus> {
    return apiRequest<Campus>(`/api/v1/campuses/${id}`);
  },

  async createCampus(data: CampusCreatePayload): Promise<Campus> {
    return apiRequest<Campus>('/api/v1/campuses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCampus(id: string, data: CampusUpdatePayload): Promise<Campus> {
    return apiRequest<Campus>(`/api/v1/campuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteCampus(id: string): Promise<void> {
    return apiRequest<void>(`/api/v1/campuses/${id}`, {
      method: 'DELETE',
    });
  },

  // Buildings
  async listBuildings(campusId: string): Promise<Building[]> {
    return apiRequest<Building[]>(`/api/v1/campuses/${campusId}/buildings`);
  },

  async createBuilding(campusId: string, data: BuildingCreatePayload): Promise<Building> {
    return apiRequest<Building>(`/api/v1/campuses/${campusId}/buildings`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateBuilding(id: string, data: BuildingUpdatePayload): Promise<Building> {
    return apiRequest<Building>(`/api/v1/buildings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteBuilding(id: string): Promise<void> {
    return apiRequest<void>(`/api/v1/buildings/${id}`, {
      method: 'DELETE',
    });
  },

  // Floors
  async listFloors(buildingId: string): Promise<Floor[]> {
    return apiRequest<Floor[]>(`/api/v1/buildings/${buildingId}/floors`);
  },

  async createFloor(buildingId: string, data: FloorCreatePayload): Promise<Floor> {
    return apiRequest<Floor>(`/api/v1/buildings/${buildingId}/floors`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateFloor(id: string, data: FloorUpdatePayload): Promise<Floor> {
    return apiRequest<Floor>(`/api/v1/floors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async deleteFloor(id: string): Promise<void> {
    return apiRequest<void>(`/api/v1/floors/${id}`, {
      method: 'DELETE',
    });
  },

  // Floor Plans
  async uploadFloorPlan(floorId: string, file: File): Promise<FloorPlanAsset> {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<FloorPlanAsset>(`/api/v1/floors/${floorId}/plans`, {
      method: 'POST',
      body: formData,
    });
  },

  async calibrateFloorPlan(planId: string, data: CalibrationPayload): Promise<FloorPlanAsset> {
    return apiRequest<FloorPlanAsset>(`/api/v1/floor-plans/${planId}/calibration`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async createFloorOutline(floorId: string, data: FloorOutlinePayload): Promise<FloorPlanAsset> {
    return apiRequest<FloorPlanAsset>(`/api/v1/floors/${floorId}/outline-plan`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
