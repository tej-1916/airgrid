import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CloudflareSpeedTestAdapter } from '../src/services/cloudflareSpeedTestAdapter';

describe('CloudflareSpeedTestAdapter Bounded Duration Enforcement', () => {
  it('cancels test and rejects with DURATION_LIMIT_EXCEEDED when deadline expires', async () => {
    let pausedCalled = false;

    // Mock engine that simulates an active, long-running test
    const mockEngineFactory = (opts: any) => ({
      play: () => {
        // Simulates running without completing
      },
      pause: () => {
        pausedCalled = true;
      },
      results: {
        getDownloadBandwidth: () => 50_000_000,
        getUploadBandwidth: () => undefined,
        getUnloadedLatency: () => 12.5,
        getUnloadedJitter: () => 1.2,
      },
    });

    const adapter = new CloudflareSpeedTestAdapter(mockEngineFactory);

    // Start with a bounded deadline of 100ms
    const startPromise = adapter.start(() => {}, 100);

    // Verify initial state
    assert.equal(adapter.getState().isRunning, true);

    // Expect promise rejection with DURATION_LIMIT_EXCEEDED
    await assert.rejects(
      startPromise,
      (err: Error) => err.message === 'DURATION_LIMIT_EXCEEDED'
    );

    // Verify bounded cancellation state
    assert.equal(pausedCalled, true, 'Engine pause() must be called to abort transfers on the wire');
    const state = adapter.getState();
    assert.equal(state.isRunning, false);
    assert.equal(state.phase, 'aborted');
    assert.match(state.error || '', /duration limit exceeded/i);
    assert.match(state.currentPhaseName, /duration limit exceeded/i);
    assert.equal(state.metrics.downloadMbps, 50.0);
    assert.equal(state.metrics.latencyMs, 12.5);
  });

  it('clears deadline timer when user manually aborts before deadline', async () => {
    let pausedCalled = false;

    const mockEngineFactory = (opts: any) => ({
      play: () => {},
      pause: () => {
        pausedCalled = true;
      },
      results: {},
    });

    const adapter = new CloudflareSpeedTestAdapter(mockEngineFactory);

    // Start with a 500ms deadline
    const startPromise = adapter.start(() => {}, 500);

    // Abort after 30ms (well before deadline)
    setTimeout(() => {
      adapter.abort();
    }, 30);

    await assert.rejects(
      startPromise,
      (err: Error) => err.message === 'USER_ABORTED'
    );

    assert.equal(pausedCalled, true);
    assert.equal(adapter.getState().phase, 'aborted');
    assert.equal(adapter.getState().error, 'Test cancelled by user');

    // Wait past 500ms to ensure no late deadline trigger occurs
    await new Promise((r) => setTimeout(r, 550));
    assert.equal(adapter.getState().error, 'Test cancelled by user');
  });

  it('clears deadline timer on normal completion before deadline', async () => {
    let onFinishCallback: (() => void) | null = null;

    const mockEngineFactory = (opts: any) => {
      const engine = {
        play: () => {
          // Finish quickly after 40ms
          setTimeout(() => {
            if (onFinishCallback) onFinishCallback();
          }, 40);
        },
        pause: () => {},
        set onFinish(cb: () => void) {
          onFinishCallback = cb;
        },
        results: {
          getDownloadBandwidth: () => 100_000_000,
          getUploadBandwidth: () => 50_000_000,
          getUnloadedLatency: () => 10.0,
          getUnloadedJitter: () => 1.0,
        },
      };
      return engine;
    };

    const adapter = new CloudflareSpeedTestAdapter(mockEngineFactory);

    // Start with 500ms deadline; test finishes in 40ms
    const metrics = await adapter.start(() => {}, 500);

    assert.equal(metrics.downloadMbps, 100.0);
    assert.equal(metrics.uploadMbps, 50.0);
    assert.equal(adapter.getState().phase, 'completed');
    assert.equal(adapter.getState().isRunning, false);

    // Wait past 500ms to ensure deadline timer does not trigger post-completion
    await new Promise((r) => setTimeout(r, 550));
    assert.equal(adapter.getState().phase, 'completed');
  });
});
