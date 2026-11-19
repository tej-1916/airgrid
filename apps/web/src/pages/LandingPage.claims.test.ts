import { describe, expect, it } from 'vitest';
import src from './LandingPage.tsx?raw';

// The landing page must not claim more than the code does. Static check of the source text (no rendering needed).
describe('LandingPage claims', () => {
  it.each([
    [/ITU-R/i, 'the prediction model is not an ITU-R implementation'],
    [/coordinate solver/i, 'there is no automatic placement solver'],
    [/channel reassignments?/i, 'channel plans are not modelled'],
    [/maximi[sz]e coverage/i, 'no optimisation objective is solved'],
    [/physics-grounded/i, 'the model is generic and uncalibrated'],
    [/concrete partitions/i, 'wall material is not modelled'],
    [/real-time multi-band/i, 'heatmaps are interpolated from recorded surveys, not real time'],
  ])('does not contain %s (%s)', (pattern) => {
    expect(src).not.toMatch(pattern);
  });

  it('states that predictions are model output, not field-validated', () => {
    expect(src).toMatch(/not field-validated measurements/);
    expect(src).toMatch(/does not solve placement automatically/);
  });
});
