import SpeedTest from '@cloudflare/speedtest';
import { SpeedTestProvider } from './speedTestProvider';
import { SpeedTestState, SpeedTestMetrics, SpeedTestPhase } from '../types/speedTest';

export class CloudflareSpeedTestAdapter implements SpeedTestProvider {
  readonly id = 'cloudflare';
  readonly name = 'Cloudflare Edge Speed Test';
  readonly description = 'Measures HTTP/2 throughput and latency directly against Cloudflare global edge points.';
  readonly providerEngine = 'cloudflare';
  readonly supportsPause = true;
  readonly supportsCancel = true;
  readonly supportsPacketLoss = false;
  readonly packetLossDisclaimer = 'WebRTC TURN relay measurement is excluded for operator privacy and bandwidth conservatism.';

  private engine: any = null;
  private isAborted = false;
  private isPaused = false;
  private startTime = 0;
  private onUpdateCallback: ((state: SpeedTestState) => void) | null = null;
  private currentState: SpeedTestState = this.getInitialState();
  private rejectPromise?: (reason?: any) => void;

  getState(): SpeedTestState {
    return { ...this.currentState };
  }

  private getInitialState(): SpeedTestState {
    return {
      phase: 'idle',
      progressPercent: 0,
      isRunning: false,
      isPaused: false,
      currentPhaseName: 'Idle — Ready to Begin',
      metrics: {
        packetLossPct: null,
      },
    };
  }

  async start(onUpdate: (state: SpeedTestState) => void): Promise<SpeedTestMetrics> {
    if (this.currentState.isRunning) {
      throw new Error('A speed test is already active in this browser session.');
    }

    this.onUpdateCallback = onUpdate;
    this.isAborted = false;
    this.isPaused = false;
    this.startTime = Date.now();

    this.currentState = {
      phase: 'preparing',
      progressPercent: 5,
      isRunning: true,
      isPaused: false,
      currentPhaseName: 'Contacting Cloudflare Edge...',
      startedAt: new Date().toISOString(),
      metrics: {
        packetLossPct: null,
      },
    };
    this.emitUpdate();

    return new Promise<SpeedTestMetrics>((resolve, reject) => {
      this.rejectPromise = reject;
      try {
        // Configure conservative speed test without TURN packet loss or telemetry logs
        // NOTE: Total payload volume is governed by discrete stepped measurement chunks:
        // - Download: (2 x 250KB) + (2 x 1MB) + (2 x 4MB) = 10.5 MB
        // - Upload: (2 x 250KB) + (2 x 1MB) = 2.5 MB
        // - Static Chunk Total: ~13.0 MB
        // - Estimated Total Wire Traffic (including TLS, HTTP/2 framing & loaded latency probes): ~14.5 - 16.0 MB
        // IMPORTANT: This traffic ceiling is an approximate conservative upper bound derived from
        // discrete chunk scheduling, NOT a kernel-enforced packet-level hard quota.
        this.engine = new SpeedTest({
          autoStart: false,
          logMeasurementApiUrl: null,
          logAimApiUrl: null,
          measureDownloadLoadedLatency: true,
          measureUploadLoadedLatency: true,
          bandwidthFinishRequestDuration: 1000,
          measurements: [
            { type: 'latency', numPackets: 8 },
            { type: 'download', bytes: 250000, count: 2 },
            { type: 'download', bytes: 1000000, count: 2 },
            { type: 'download', bytes: 4000000, count: 2 },
            { type: 'upload', bytes: 250000, count: 2 },
            { type: 'upload', bytes: 1000000, count: 2 },
          ],
        });

        // 1. Phase change listener
        this.engine.onPhaseChange = (payload: { measurementId: number; measurement: { type: string } }) => {
          if (this.isAborted) return;
          const phaseType = payload.measurement?.type;
          let phase: SpeedTestPhase = 'preparing';
          let progress = 10;
          let label = 'Testing...';

          if (phaseType === 'latency' || phaseType === 'latencyUnderLoad') {
            phase = 'latency';
            progress = 15;
            label = 'Measuring Unloaded Latency & Ping...';
          } else if (phaseType === 'download') {
            phase = 'download';
            progress = 40;
            label = 'Measuring Download Throughput...';
          } else if (phaseType === 'upload') {
            phase = 'upload';
            progress = 75;
            label = 'Measuring Upload Throughput...';
          }

          this.currentState.phase = phase;
          this.currentState.progressPercent = progress;
          this.currentState.currentPhaseName = label;
          this.updateMetricsFromEngine();
          this.emitUpdate();
        };

        // 2. Continuous results listener
        this.engine.onResultsChange = () => {
          if (this.isAborted) return;
          this.updateMetricsFromEngine();
          this.emitUpdate();
        };

        // 3. Running state change
        this.engine.onRunningChange = (running: boolean) => {
          if (this.isAborted) return;
          this.currentState.isRunning = running;
          this.emitUpdate();
        };

        // 4. Error listener
        this.engine.onError = (message: string) => {
          if (this.isAborted) return;
          this.currentState.isRunning = false;
          this.currentState.phase = 'failed';
          this.currentState.error = message || 'Cloudflare measurement request failed';
          this.currentState.currentPhaseName = 'Test Failed';
          this.emitUpdate();
          this.rejectPromise = undefined;
          reject(new Error(this.currentState.error));
        };

        // 5. Completion listener
        this.engine.onFinish = () => {
          if (this.isAborted) return;
          const duration = Math.round((Date.now() - this.startTime) / 100) / 10;
          this.updateMetricsFromEngine();
          this.currentState.isRunning = false;
          this.currentState.phase = 'completed';
          this.currentState.progressPercent = 100;
          this.currentState.currentPhaseName = 'Measurement Completed';
          this.currentState.completedAt = new Date().toISOString();
          this.currentState.metrics.durationSeconds = duration;
          this.emitUpdate();
          this.rejectPromise = undefined;
          resolve(this.currentState.metrics);
        };

        // Explicit user-initiated start
        this.engine.play();
      } catch (err: any) {
        this.currentState.isRunning = false;
        this.currentState.phase = 'failed';
        this.currentState.error = err.message || 'Initialization error';
        this.emitUpdate();
        reject(err);
      }
    });
  }

  private updateMetricsFromEngine(): void {
    if (!this.engine || !this.engine.results) return;
    const r = this.engine.results;

    const rawDownload = typeof r.getDownloadBandwidth === 'function' ? r.getDownloadBandwidth() : undefined;
    const rawUpload = typeof r.getUploadBandwidth === 'function' ? r.getUploadBandwidth() : undefined;
    const rawLatency = typeof r.getUnloadedLatency === 'function' ? r.getUnloadedLatency() : undefined;
    const rawJitter = typeof r.getUnloadedJitter === 'function' ? r.getUnloadedJitter() : undefined;
    const rawLoadedLat = typeof r.getDownLoadedLatency === 'function' ? r.getDownLoadedLatency() : undefined;

    // Convert bits-per-second to Megabits-per-second (Mbps)
    const downloadMbps = rawDownload !== undefined ? Math.round((rawDownload / 1_000_000) * 100) / 100 : undefined;
    const uploadMbps = rawUpload !== undefined ? Math.round((rawUpload / 1_000_000) * 100) / 100 : undefined;
    const latencyMs = rawLatency !== undefined ? Math.round(rawLatency * 10) / 10 : undefined;
    const jitterMs = rawJitter !== undefined && rawJitter !== null ? Math.round(rawJitter * 10) / 10 : undefined;
    const loadedLatencyMs = rawLoadedLat !== undefined ? Math.round(rawLoadedLat * 10) / 10 : undefined;

    this.currentState.metrics = {
      ...this.currentState.metrics,
      downloadMbps,
      uploadMbps,
      latencyMs,
      jitterMs,
      loadedLatencyMs,
      packetLossPct: null, // Transparently unsupported without TURN
      qualityMetadata: {
        engine: 'cloudflare-speedtest',
        packetLossSupported: false,
        packetLossReason: 'WebRTC TURN relay disabled for operator privacy',
      },
    };
  }

  pause(): void {
    if (!this.currentState.isRunning || this.isPaused || !this.engine) return;
    try {
      this.engine.pause();
      this.isPaused = true;
      this.currentState.isPaused = true;
      this.currentState.phase = 'paused';
      this.currentState.currentPhaseName = 'Paused by Operator';
      this.emitUpdate();
    } catch (e) {
      console.warn('Failed to pause speed test', e);
    }
  }

  resume(): void {
    if (!this.isPaused || !this.engine) return;
    try {
      this.engine.play();
      this.isPaused = false;
      this.currentState.isPaused = false;
      this.currentState.phase = this.currentState.metrics.uploadMbps !== undefined ? 'upload' : 'download';
      this.currentState.currentPhaseName = 'Resuming measurement...';
      this.emitUpdate();
    } catch (e) {
      console.warn('Failed to resume speed test', e);
    }
  }

  abort(): void {
    if (!this.currentState.isRunning && !this.isPaused) return;
    this.isAborted = true;
    try {
      if (this.engine) {
        this.engine.pause();
      }
    } catch (e) {
      // Ignore
    }
    this.currentState.isRunning = false;
    this.currentState.isPaused = false;
    this.currentState.phase = 'aborted';
    this.currentState.currentPhaseName = 'Aborted by Operator';
    this.currentState.completedAt = new Date().toISOString();
    this.currentState.error = 'Test cancelled by user';
    this.emitUpdate();

    if (this.rejectPromise) {
      const reject = this.rejectPromise;
      this.rejectPromise = undefined;
      reject(new Error('USER_ABORTED'));
    }
  }

  private emitUpdate(): void {
    if (this.onUpdateCallback) {
      this.onUpdateCallback({ ...this.currentState });
    }
  }
}

export const cloudflareSpeedTestAdapter = new CloudflareSpeedTestAdapter();
