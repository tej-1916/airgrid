import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Building2,
  Layers,
  Plus,
  Search,
  Upload,
  Ruler,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  Edit3,
  X,
  AlertCircle,
  FileImage,
  CheckCircle2,
} from 'lucide-react';
import { useCampus } from '../context/CampusContext';
import { useAuth } from '../context/AuthContext';
import { campusService } from '../services/campusService';
import {
  Campus,
  Building,
  Floor,
  CampusCreatePayload,
  BuildingCreatePayload,
  FloorCreatePayload,
  CalibrationPoint,
} from '../types/campus';

export const CampusesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    campuses,
    selectedCampusId,
    setSelectedCampusId,
    refreshCampuses,
  } = useCampus();

  const isAdmin = user?.role === 'administrator';
  const isEngineerOrAdmin = user?.role === 'administrator' || user?.role === 'network_engineer';

  // Selection states
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  // Search & view mode
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'2d' | 'isometric'>('2d');

  // Modals state
  const [campusModalOpen, setCampusModalOpen] = useState<boolean>(false);
  const [buildingModalOpen, setBuildingModalOpen] = useState<boolean>(false);
  const [floorModalOpen, setFloorModalOpen] = useState<boolean>(false);
  const [editingCampus, setEditingCampus] = useState<Campus | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);

  // Calibration state
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [calibPoint1, setCalibPoint1] = useState<CalibrationPoint | null>(null);
  const [calibPoint2, setCalibPoint2] = useState<CalibrationPoint | null>(null);
  const [calibDistanceM, setCalibDistanceM] = useState<string>('20.0');
  const [calibModalOpen, setCalibModalOpen] = useState<boolean>(false);

  // Viewer Pan & Zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Form states
  const [campusForm, setCampusForm] = useState<CampusCreatePayload>({
    name: '',
    code: '',
    description: '',
    address: '',
  });

  const [buildingForm, setBuildingForm] = useState<BuildingCreatePayload>({
    name: '',
    building_code: '',
    description: '',
    floors_count: 1,
  });

  const [floorForm, setFloorForm] = useState<FloorCreatePayload>({
    floor_number: 1,
    name: '',
    dimensions_width_m: 50.0,
    dimensions_height_m: 30.0,
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Open create modal if query parameter ?action=create is present
  useEffect(() => {
    if (searchParams.get('action') === 'create' && isAdmin) {
      setCampusForm({ name: '', code: '', description: '', address: '' });
      setEditingCampus(null);
      setCampusModalOpen(true);
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isAdmin]);

  // Sync selected campus with context
  useEffect(() => {
    if (campuses.length > 0) {
      if (selectedCampusId) {
        const found = campuses.find((c) => c.id === selectedCampusId);
        if (found) {
          setSelectedCampus(found);
          // Auto select first building if none selected
          if (found.buildings && found.buildings.length > 0 && !selectedBuildingId) {
            setSelectedBuildingId(found.buildings[0].id);
          }
          return;
        }
      }
      // Default to first campus
      setSelectedCampus(campuses[0]);
      setSelectedCampusId(campuses[0].id);
      if (campuses[0].buildings && campuses[0].buildings.length > 0 && !selectedBuildingId) {
        setSelectedBuildingId(campuses[0].buildings[0].id);
      }
    } else {
      setSelectedCampus(null);
      setSelectedBuildingId(null);
      setSelectedFloorId(null);
    }
  }, [campuses, selectedCampusId, setSelectedCampusId, selectedBuildingId]);

  // Derived selections
  const selectedBuilding: Building | null =
    selectedCampus?.buildings?.find((b) => b.id === selectedBuildingId) ||
    selectedCampus?.buildings?.[0] ||
    null;

  const selectedFloor: Floor | null =
    selectedBuilding?.floors?.find((f) => f.id === selectedFloorId) ||
    selectedBuilding?.floors?.[0] ||
    null;

  // Sync selectedFloorId when selectedBuilding changes
  useEffect(() => {
    if (selectedBuilding?.floors && selectedBuilding.floors.length > 0) {
      if (!selectedFloorId || !selectedBuilding.floors.some((f) => f.id === selectedFloorId)) {
        setSelectedFloorId(selectedBuilding.floors[0].id);
      }
    } else {
      setSelectedFloorId(null);
    }
  }, [selectedBuilding, selectedFloorId]);

  // Reset calibration and zoom when floor changes
  useEffect(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
    setCalibrating(false);
    setCalibPoint1(null);
    setCalibPoint2(null);
  }, [selectedFloorId]);

  // Notification clear timer
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (calibrating) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || calibrating) return;
    setPanPosition({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  };

  // Image calibration click handler
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!calibrating || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const naturalWidth = imageRef.current.naturalWidth;
    const naturalHeight = imageRef.current.naturalHeight;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to original image pixel coordinates
    const originalX = Math.round((clickX / rect.width) * naturalWidth);
    const originalY = Math.round((clickY / rect.height) * naturalHeight);

    if (!calibPoint1) {
      setCalibPoint1({ x: originalX, y: originalY });
    } else if (!calibPoint2) {
      setCalibPoint2({ x: originalX, y: originalY });
      setCalibModalOpen(true);
    }
  };

  // Save calibration
  const handleSaveCalibration = async () => {
    if (!selectedFloor?.floor_plan?.id || !calibPoint1 || !calibPoint2) return;
    const dist = parseFloat(calibDistanceM);
    if (isNaN(dist) || dist <= 0.05) {
      setErrorMsg('Please enter a valid real-world distance greater than 0.05 meters.');
      return;
    }

    try {
      setLoading(true);
      await campusService.calibrateFloorPlan(selectedFloor.floor_plan.id, {
        point1: calibPoint1,
        point2: calibPoint2,
        distance_m: dist,
      });
      setSuccessMsg('Floor plan scale calibrated successfully! Physical dimensions updated.');
      setCalibModalOpen(false);
      setCalibrating(false);
      setCalibPoint1(null);
      setCalibPoint2(null);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save calibration.');
    } finally {
      setLoading(false);
    }
  };

  // Floor plan file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFloor) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      await campusService.uploadFloorPlan(selectedFloor.id, file);
      setSuccessMsg(`Floor plan '${file.name}' uploaded and processed successfully.`);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload floor plan image.');
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Campus CRUD handlers
  const handleSaveCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);
      if (editingCampus) {
        await campusService.updateCampus(editingCampus.id, campusForm);
        setSuccessMsg('Campus updated successfully.');
      } else {
        const created = await campusService.createCampus(campusForm);
        setSuccessMsg(`Campus '${created.name}' created successfully.`);
        setSelectedCampusId(created.id);
      }
      setCampusModalOpen(false);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save campus.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampus = async (campusId: string) => {
    if (!confirm('Are you sure you want to delete this campus and all its buildings and floors?')) return;
    try {
      setLoading(true);
      await campusService.deleteCampus(campusId);
      setSuccessMsg('Campus deleted successfully.');
      setSelectedCampusId(null);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete campus.');
    } finally {
      setLoading(false);
    }
  };

  // Building CRUD handlers
  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampus) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      if (editingBuilding) {
        await campusService.updateBuilding(editingBuilding.id, buildingForm);
        setSuccessMsg('Building updated successfully.');
      } else {
        const b = await campusService.createBuilding(selectedCampus.id, buildingForm);
        setSuccessMsg(`Building '${b.name}' created successfully.`);
        setSelectedBuildingId(b.id);
      }
      setBuildingModalOpen(false);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save building.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBuilding = async (buildingId: string) => {
    if (!confirm('Are you sure you want to delete this building and all its floors?')) return;
    try {
      setLoading(true);
      await campusService.deleteBuilding(buildingId);
      setSuccessMsg('Building deleted successfully.');
      setSelectedBuildingId(null);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete building.');
    } finally {
      setLoading(false);
    }
  };

  // Floor CRUD handlers
  const handleSaveFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBuilding) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      if (editingFloor) {
        await campusService.updateFloor(editingFloor.id, floorForm);
        setSuccessMsg('Floor updated successfully.');
      } else {
        const f = await campusService.createFloor(selectedBuilding.id, floorForm);
        setSuccessMsg(`Floor '${f.name}' created successfully.`);
        setSelectedFloorId(f.id);
      }
      setFloorModalOpen(false);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save floor.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteFloor = async (floorId: string) => {
    if (!confirm('Are you sure you want to delete this floor and its uploaded plan?')) return;
    try {
      setLoading(true);
      await campusService.deleteFloor(floorId);
      setSuccessMsg('Floor deleted successfully.');
      setSelectedFloorId(null);
      await refreshCampuses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete floor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Messages */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 3-Column Workspace (Reference B OptiSpace style) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-140px)] min-h-[650px]">
        {/* ========================================================================= */}
        {/* COLUMN 1: Campus Hierarchy Tree & Selector (3 cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-[#D9DBDE] bg-white shadow-sm overflow-hidden h-full">
          {/* Header */}
          <div className="p-4 border-b border-[#D9DBDE] flex items-center justify-between bg-[#F5F5F3]/50">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B0B0D]">
                Campus Infrastructure
              </h3>
              <p className="text-[11px] text-[#737373]">Hierarchical Topology</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditingCampus(null);
                  setCampusForm({ name: '', code: '', description: '', address: '' });
                  setCampusModalOpen(true);
                }}
                className="p-1.5 rounded-lg bg-[#BE6B37] text-white hover:bg-[#9A5226] transition-colors"
                title="Add New Campus"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-[#D9DBDE]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#737373]" />
              <input
                type="text"
                placeholder="Search buildings & floors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] placeholder-[#737373] focus:outline-none focus:border-[#BE6B37]"
              />
            </div>
          </div>

          {/* Campus Selector Dropdown inside Left Panel */}
          <div className="p-3 border-b border-[#D9DBDE] bg-[#ECECE8]/40">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#737373]">Active Campus</span>
              {selectedCampus && isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingCampus(selectedCampus);
                      setCampusForm({
                        name: selectedCampus.name,
                        code: selectedCampus.code,
                        description: selectedCampus.description || '',
                        address: selectedCampus.address || '',
                      });
                      setCampusModalOpen(true);
                    }}
                    className="p-1 text-[#737373] hover:text-[#0B0B0D]"
                    title="Edit Campus"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteCampus(selectedCampus.id)}
                    className="p-1 text-[#737373] hover:text-rose-600"
                    title="Delete Campus"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            <select
              value={selectedCampus?.id || ''}
              onChange={(e) => {
                setSelectedCampusId(e.target.value);
                setSelectedBuildingId(null);
                setSelectedFloorId(null);
              }}
              className="w-full py-1.5 px-2.5 rounded-lg bg-white border border-[#D9DBDE] text-xs font-semibold text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37] cursor-pointer"
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Buildings & Floors List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-[#737373] uppercase tracking-wider">
                Buildings ({selectedCampus?.buildings?.length || 0})
              </span>
              {isAdmin && selectedCampus && (
                <button
                  onClick={() => {
                    setEditingBuilding(null);
                    setBuildingForm({ name: '', building_code: '', description: '', floors_count: 1 });
                    setBuildingModalOpen(true);
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#BE6B37] hover:text-[#9A5226]"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Building</span>
                </button>
              )}
            </div>

            {(!selectedCampus?.buildings || selectedCampus.buildings.length === 0) ? (
              <div className="p-4 rounded-xl border border-dashed border-[#D9DBDE] text-center text-[#737373] text-xs">
                No buildings in this campus. Click &quot;Add Building&quot; to begin.
              </div>
            ) : (
              selectedCampus.buildings
                .filter(
                  (b) =>
                    !searchQuery ||
                    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    b.building_code.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((b) => {
                  const isBuildingActive = selectedBuilding?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isBuildingActive
                          ? 'border-[#BE6B37] bg-[#BE6B37]/5 shadow-sm'
                          : 'border-[#D9DBDE] bg-white hover:border-[#737373]'
                      }`}
                    >
                      {/* Building Row */}
                      <div
                        onClick={() => setSelectedBuildingId(b.id)}
                        className="p-2.5 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2
                            className={`w-4 h-4 flex-shrink-0 ${
                              isBuildingActive ? 'text-[#BE6B37]' : 'text-[#737373]'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#0B0B0D] truncate leading-tight">
                              {b.name}
                            </p>
                            <p className="text-[10px] text-[#737373] font-mono leading-tight">
                              {b.building_code} • {b.floors?.length || 0} floors
                            </p>
                          </div>
                        </div>

                        {isAdmin && isBuildingActive && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingBuilding(b);
                                setBuildingForm({
                                  name: b.name,
                                  building_code: b.building_code,
                                  description: b.description || '',
                                  floors_count: b.floors_count,
                                });
                                setBuildingModalOpen(true);
                              }}
                              className="p-1 text-[#737373] hover:text-[#0B0B0D]"
                              title="Edit Building"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteBuilding(b.id)}
                              className="p-1 text-[#737373] hover:text-rose-600"
                              title="Delete Building"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Floor Levels (Sub-items) */}
                      {isBuildingActive && (
                        <div className="px-2 pb-2 pt-1 border-t border-[#D9DBDE]/60 space-y-1">
                          <div className="flex items-center justify-between px-1 py-0.5 text-[10px] font-semibold text-[#737373]">
                            <span>FLOOR LEVELS</span>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingFloor(null);
                                  setFloorForm({
                                    floor_number: (b.floors?.length || 0) + 1,
                                    name: `Level ${(b.floors?.length || 0) + 1}`,
                                    dimensions_width_m: 50.0,
                                    dimensions_height_m: 30.0,
                                  });
                                  setFloorModalOpen(true);
                                }}
                                className="text-[#BE6B37] hover:underline"
                              >
                                + Add Floor
                              </button>
                            )}
                          </div>

                          {(!b.floors || b.floors.length === 0) ? (
                            <p className="text-[10px] text-[#737373] italic px-1">
                              No floor plans added yet.
                            </p>
                          ) : (
                            b.floors.map((fl) => {
                              const isFloorActive = selectedFloor?.id === fl.id;
                              return (
                                <button
                                  key={fl.id}
                                  onClick={() => setSelectedFloorId(fl.id)}
                                  className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                                    isFloorActive
                                      ? 'bg-white text-[#BE6B37] font-semibold shadow-xs border border-[#BE6B37]/30'
                                      : 'text-[#737373] hover:bg-white/80 hover:text-[#0B0B0D]'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                                    <span className="truncate">{fl.name}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {fl.has_floor_plan && (
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full ${
                                          fl.floor_plan?.is_calibrated
                                            ? 'bg-emerald-500'
                                            : 'bg-amber-500'
                                        }`}
                                        title={
                                          fl.floor_plan?.is_calibrated
                                            ? 'Scale Calibrated'
                                            : 'Uncalibrated'
                                        }
                                      />
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 2: Central Interactive Floor Plan Workspace (6 cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 flex flex-col rounded-2xl border border-[#D9DBDE] bg-white shadow-sm overflow-hidden h-full">
          {/* Workspace Top Toolbar */}
          <div className="p-3 border-b border-[#D9DBDE] flex items-center justify-between bg-[#F5F5F3]/50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-[#0B0B0D] truncate">
                {selectedBuilding?.name || 'Building'} • {selectedFloor?.name || 'Floor Plan'}
              </span>
              {selectedFloor?.floor_plan && (
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                    selectedFloor.floor_plan.is_calibrated
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {selectedFloor.floor_plan.is_calibrated
                    ? `${selectedFloor.floor_plan.scale_pixels_per_meter} px/m`
                    : 'Uncalibrated'}
                </span>
              )}
            </div>

            {/* Mode Toggle: 2D Floor Plan vs Illustrative Isometric */}
            <div className="flex items-center gap-1 bg-[#ECECE8] p-0.5 rounded-lg border border-[#D9DBDE]">
              <button
                onClick={() => setViewMode('2d')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  viewMode === '2d'
                    ? 'bg-white text-[#0B0B0D] shadow-xs'
                    : 'text-[#737373] hover:text-[#0B0B0D]'
                }`}
              >
                2D Plan
              </button>
              <button
                onClick={() => setViewMode('isometric')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  viewMode === 'isometric'
                    ? 'bg-white text-[#0B0B0D] shadow-xs'
                    : 'text-[#737373] hover:text-[#0B0B0D]'
                }`}
              >
                3D Diagram
              </button>
            </div>
          </div>

          {/* Central Canvas Container (Dark #0D0F12 as authorized for technical preview) */}
          <div
            ref={viewerContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`
              relative flex-1 bg-[#0D0F12] overflow-hidden flex items-center justify-center select-none
              ${isPanning ? 'cursor-grabbing' : calibrating ? 'cursor-crosshair' : 'cursor-grab'}
            `}
            style={{
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {/* VIEW MODE 1: 2D Real Floor Plan */}
            {viewMode === '2d' && (
              <>
                {selectedFloor?.floor_plan ? (
                  <div
                    style={{
                      transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                      transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                    }}
                    className="relative max-w-full max-h-full"
                  >
                    <img
                      ref={imageRef}
                      src={selectedFloor.floor_plan.image_url}
                      alt={selectedFloor.name}
                      onClick={handleImageClick}
                      className="max-w-none shadow-2xl rounded border border-white/20"
                      style={{ maxHeight: '550px' }}
                    />

                    {/* Calibration point markers on canvas */}
                    {calibPoint1 && imageRef.current && (
                      <div
                        className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-[#BE6B37] border-2 border-white shadow-lg pointer-events-none flex items-center justify-center text-[8px] text-white font-bold"
                        style={{
                          left: `${(calibPoint1.x / imageRef.current.naturalWidth) * 100}%`,
                          top: `${(calibPoint1.y / imageRef.current.naturalHeight) * 100}%`,
                        }}
                      >
                        A
                      </div>
                    )}

                    {calibPoint2 && imageRef.current && (
                      <div
                        className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-emerald-500 border-2 border-white shadow-lg pointer-events-none flex items-center justify-center text-[8px] text-white font-bold"
                        style={{
                          left: `${(calibPoint2.x / imageRef.current.naturalWidth) * 100}%`,
                          top: `${(calibPoint2.y / imageRef.current.naturalHeight) * 100}%`,
                        }}
                      >
                        B
                      </div>
                    )}
                  </div>
                ) : (
                  /* Empty State: No Plan Uploaded */
                  <div className="p-8 text-center text-slate-400 space-y-4 max-w-sm">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#BE6B37]">
                      <FileImage className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">No Floor Plan Uploaded</h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Upload an architectural floor plan (PNG, JPEG, WebP) to begin wireless airspace
                        visualization.
                      </p>
                    </div>

                    {isEngineerOrAdmin ? (
                      <div>
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] cursor-pointer transition-colors shadow-sm">
                          <Upload className="w-4 h-4" />
                          <span>Upload Floor Plan</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        Network Engineer or Administrator permissions required to upload plans.
                      </p>
                    )}
                  </div>
                )}

                {/* Floating Map Toolbar Controls (Reference B style) */}
                {selectedFloor?.floor_plan && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/20 text-white shadow-lg">
                    <button
                      onClick={handleZoomIn}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleZoomOut}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleResetZoom}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-xs font-mono"
                      title="Reset View"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <div className="h-4 w-px bg-white/20 mx-0.5" />
                    {isEngineerOrAdmin && (
                      <button
                        onClick={() => {
                          setCalibrating(!calibrating);
                          setCalibPoint1(null);
                          setCalibPoint2(null);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                          calibrating
                            ? 'bg-[#BE6B37] text-white'
                            : 'hover:bg-white/20 text-slate-200'
                        }`}
                        title="Calibrate Physical Scale"
                      >
                        <Ruler className="w-3.5 h-3.5" />
                        <span>{calibrating ? 'Cancel' : 'Calibrate'}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Calibration Guide Banner */}
                {calibrating && (
                  <div className="absolute top-4 left-4 right-4 p-2.5 rounded-xl bg-[#BE6B37] text-white text-xs flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4 flex-shrink-0 animate-bounce" />
                      <span>
                        {!calibPoint1
                          ? 'Step 1: Click Point A on a known distance (e.g. wall or doorway).'
                          : 'Step 2: Click Point B on the other end of that distance.'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setCalibrating(false);
                        setCalibPoint1(null);
                        setCalibPoint2(null);
                      }}
                      className="text-white hover:text-black font-semibold text-xs ml-2"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}

            {/* VIEW MODE 2: Original Illustrative Isometric Diagram */}
            {viewMode === 'isometric' && (
              <div className="p-8 text-center text-white space-y-4 max-w-md">
                <div className="w-48 h-32 mx-auto rounded-xl bg-white/5 border border-white/10 flex items-center justify-center relative overflow-hidden">
                  {/* Stylized isometric grid representation */}
                  <svg className="w-full h-full text-[#BE6B37]" viewBox="0 0 100 60">
                    <polygon
                      points="50,5 90,25 50,45 10,25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <polygon
                      points="50,15 80,30 50,45 20,30"
                      fill="rgba(190, 107, 55, 0.15)"
                      stroke="currentColor"
                      strokeWidth="1"
                    />
                    <line x1="50" y1="45" x2="50" y2="55" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="90" y1="25" x2="90" y2="35" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="10" y1="25" x2="10" y2="35" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="50" cy="25" r="3" fill="#22D3EE" />
                    <circle cx="35" cy="20" r="2" fill="#BE6B37" />
                    <circle cx="65" cy="22" r="2" fill="#BE6B37" />
                  </svg>
                </div>
                <div>
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono border border-white/20 mb-2">
                    Conceptual Simulation Preview
                  </div>
                  <h4 className="text-sm font-bold text-white">Architectural Airspace Mesh</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    This schematic preview illustrates multi-floor wireless signal propagation.
                    Physical Wi-Fi observations and RF heatmap calculations will be rendered in Phase 04.
                  </p>
                </div>
                <button
                  onClick={() => setViewMode('2d')}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-semibold text-white hover:bg-white/20 border border-white/20"
                >
                  Return to 2D Calibrated Plan
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* COLUMN 3: Contextual Details & Floor Plan Specs (3 cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-3 flex flex-col rounded-2xl border border-[#D9DBDE] bg-white shadow-sm overflow-hidden h-full">
          {/* Header */}
          <div className="p-4 border-b border-[#D9DBDE] bg-[#F5F5F3]/50 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B0B0D]">
              Contextual Properties
            </h3>
            {selectedFloor && isAdmin && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingFloor(selectedFloor);
                    setFloorForm({
                      floor_number: selectedFloor.floor_number,
                      name: selectedFloor.name,
                      dimensions_width_m: selectedFloor.dimensions_width_m,
                      dimensions_height_m: selectedFloor.dimensions_height_m,
                    });
                    setFloorModalOpen(true);
                  }}
                  className="p-1 text-[#737373] hover:text-[#0B0B0D]"
                  title="Edit Floor Properties"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteFloor(selectedFloor.id)}
                  className="p-1 text-[#737373] hover:text-rose-600"
                  title="Delete Floor"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Properties Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs text-[#0B0B0D]">
            {/* Campus Info */}
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                Institutional Campus
              </span>
              <p className="font-semibold text-sm text-[#0B0B0D]">
                {selectedCampus?.name || 'No Campus Selected'}
              </p>
              <p className="text-[11px] text-[#737373] font-mono">
                Code: {selectedCampus?.code || '—'}
              </p>
            </div>

            {/* Building Info */}
            <div className="space-y-1 border-t border-[#D9DBDE] pt-3">
              <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                Structural Facility
              </span>
              <p className="font-semibold text-sm text-[#0B0B0D]">
                {selectedBuilding?.name || 'No Building Selected'}
              </p>
              <p className="text-[11px] text-[#737373] font-mono">
                Building Code: {selectedBuilding?.building_code || '—'}
              </p>
            </div>

            {/* Floor Info & Dimensions */}
            <div className="space-y-2 border-t border-[#D9DBDE] pt-3">
              <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                Floor Level Dimensions
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <span className="text-[10px] text-[#737373] block">Width</span>
                  <span className="text-sm font-mono font-bold text-[#0B0B0D]">
                    {selectedFloor?.dimensions_width_m || 0} m
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE]">
                  <span className="text-[10px] text-[#737373] block">Height</span>
                  <span className="text-sm font-mono font-bold text-[#0B0B0D]">
                    {selectedFloor?.dimensions_height_m || 0} m
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#737373]">
                Estimated Area:{' '}
                <span className="font-semibold text-[#0B0B0D]">
                  {Math.round(
                    (selectedFloor?.dimensions_width_m || 0) *
                      (selectedFloor?.dimensions_height_m || 0)
                  )}{' '}
                  m²
                </span>
              </p>
            </div>

            {/* Floor Plan Asset Metadata */}
            <div className="space-y-2 border-t border-[#D9DBDE] pt-3">
              <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                Floor Plan Asset
              </span>
              {selectedFloor?.floor_plan ? (
                <div className="space-y-2 p-3 rounded-xl bg-[#ECECE8]/40 border border-[#D9DBDE] text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#737373]">Resolution</span>
                    <span className="font-mono font-semibold">
                      {selectedFloor.floor_plan.pixel_width} ×{' '}
                      {selectedFloor.floor_plan.pixel_height} px
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#737373]">Format</span>
                    <span className="font-mono uppercase font-semibold">
                      {selectedFloor.floor_plan.file_format}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#737373]">Scale Ratio</span>
                    <span className="font-mono font-semibold text-[#BE6B37]">
                      {selectedFloor.floor_plan.scale_pixels_per_meter} px/m
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#737373]">Status</span>
                    <span
                      className={`font-semibold ${
                        selectedFloor.floor_plan.is_calibrated
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {selectedFloor.floor_plan.is_calibrated
                        ? 'Calibrated'
                        : 'Uncalibrated'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-[#737373] italic">
                  No floor plan file attached to this level.
                </p>
              )}
            </div>

            {/* Quick Actions in Side Panel */}
            {isEngineerOrAdmin && selectedFloor && (
              <div className="space-y-2 border-t border-[#D9DBDE] pt-4">
                <label className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#D9DBDE] bg-white text-xs font-semibold text-[#0B0B0D] hover:bg-[#F5F5F3] cursor-pointer transition-colors shadow-xs">
                  <Upload className="w-3.5 h-3.5 text-[#BE6B37]" />
                  <span>
                    {selectedFloor.floor_plan ? 'Replace Floor Plan' : 'Upload Floor Plan'}
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {selectedFloor.floor_plan && (
                  <button
                    onClick={() => {
                      setCalibrating(true);
                      setCalibPoint1(null);
                      setCalibPoint2(null);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] transition-colors shadow-xs"
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Calibrate Scale</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Calibration Distance Input */}
      {/* ========================================================================= */}
      {calibModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#D9DBDE] p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B0B0D]">Enter Real Distance</h3>
              <button
                onClick={() => setCalibModalOpen(false)}
                className="text-[#737373] hover:text-[#0B0B0D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#737373]">
              Points A and B have been selected. Enter the physical distance between them in meters.
            </p>
            <div>
              <label className="block text-xs font-semibold text-[#0B0B0D] mb-1">
                Distance (meters)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5000"
                value={calibDistanceM}
                onChange={(e) => setCalibDistanceM(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-sm text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCalibModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#737373] hover:bg-[#F5F5F3]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCalibration}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-50"
              >
                Save Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Create / Edit Campus */}
      {/* ========================================================================= */}
      {campusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveCampus}
            className="bg-white rounded-2xl border border-[#D9DBDE] p-6 max-w-md w-full space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B0B0D]">
                {editingCampus ? 'Edit Campus Record' : 'Register New Campus'}
              </h3>
              <button
                type="button"
                onClick={() => setCampusModalOpen(false)}
                className="text-[#737373] hover:text-[#0B0B0D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Campus Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. North Science Campus"
                  value={campusForm.name}
                  onChange={(e) => setCampusForm({ ...campusForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Campus Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NSC-MAIN"
                  value={campusForm.code}
                  onChange={(e) => setCampusForm({ ...campusForm, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono uppercase text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="e.g. 500 University Avenue, Boston, MA"
                  value={campusForm.address || ''}
                  onChange={(e) => setCampusForm({ ...campusForm, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief description of facilities and airspace..."
                  value={campusForm.description || ''}
                  onChange={(e) => setCampusForm({ ...campusForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9DBDE]">
              <button
                type="button"
                onClick={() => setCampusModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#737373] hover:bg-[#F5F5F3]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-50"
              >
                {editingCampus ? 'Update Campus' : 'Create Campus'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Create / Edit Building */}
      {/* ========================================================================= */}
      {buildingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBuilding}
            className="bg-white rounded-2xl border border-[#D9DBDE] p-6 max-w-md w-full space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B0B0D]">
                {editingBuilding ? 'Edit Building Record' : 'Add Structural Building'}
              </h3>
              <button
                type="button"
                onClick={() => setBuildingModalOpen(false)}
                className="text-[#737373] hover:text-[#0B0B0D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Building Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electrical Engineering Complex"
                  value={buildingForm.name}
                  onChange={(e) => setBuildingForm({ ...buildingForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Building Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EEC-01"
                  value={buildingForm.building_code}
                  onChange={(e) => setBuildingForm({ ...buildingForm, building_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono uppercase text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0B0B0D] mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Building purpose, departments, notes..."
                  value={buildingForm.description || ''}
                  onChange={(e) => setBuildingForm({ ...buildingForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9DBDE]">
              <button
                type="button"
                onClick={() => setBuildingModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#737373] hover:bg-[#F5F5F3]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-50"
              >
                {editingBuilding ? 'Update Building' : 'Add Building'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Create / Edit Floor */}
      {/* ========================================================================= */}
      {floorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveFloor}
            className="bg-white rounded-2xl border border-[#D9DBDE] p-6 max-w-md w-full space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B0B0D]">
                {editingFloor ? 'Edit Floor Metadata' : 'Add Floor Level'}
              </h3>
              <button
                type="button"
                onClick={() => setFloorModalOpen(false)}
                className="text-[#737373] hover:text-[#0B0B0D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0B0B0D] mb-1">Floor Index *</label>
                  <input
                    type="number"
                    required
                    value={floorForm.floor_number}
                    onChange={(e) =>
                      setFloorForm({ ...floorForm, floor_number: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#0B0B0D] mb-1">Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Level 2 - East Wing"
                    value={floorForm.name}
                    onChange={(e) => setFloorForm({ ...floorForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#0B0B0D] mb-1">Width (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={floorForm.dimensions_width_m || 50}
                    onChange={(e) =>
                      setFloorForm({
                        ...floorForm,
                        dimensions_width_m: parseFloat(e.target.value) || 50,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#0B0B0D] mb-1">Height (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={floorForm.dimensions_height_m || 30}
                    onChange={(e) =>
                      setFloorForm({
                        ...floorForm,
                        dimensions_height_m: parseFloat(e.target.value) || 30,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#F5F5F3] border border-[#D9DBDE] text-xs font-mono text-[#0B0B0D] focus:outline-none focus:border-[#BE6B37]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D9DBDE]">
              <button
                type="button"
                onClick={() => setFloorModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#D9DBDE] text-xs font-semibold text-[#737373] hover:bg-[#F5F5F3]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-[#BE6B37] text-white text-xs font-semibold hover:bg-[#9A5226] disabled:opacity-50"
              >
                {editingFloor ? 'Update Floor' : 'Add Floor'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
