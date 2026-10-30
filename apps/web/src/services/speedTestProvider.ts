import { SpeedTestState, SpeedTestMetrics } from '../types/speedTest';

export interface SpeedTestProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly providerEngine: string;
  readonly supportsPause: boolean;
  readonly supportsCancel: boolean;
  readonly supportsPacketLoss: boolean;
  readonly packetLossDisclaimer: string;

  start(onUpdate: (state: SpeedTestState) => void, maxDurationMs?: number): Promise<SpeedTestMetrics>;
  getState(): SpeedTestState;
  pause(): void;
  resume(): void;
  abort(): void;
}

