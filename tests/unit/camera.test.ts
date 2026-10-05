import { describe, expect, it } from 'vitest';

import { cameraScroll } from '@core/map/camera';

describe('cameraScroll', () => {
  it('follows the target and clamps to the map edges', () => {
    expect(cameraScroll(1280, 960, 640, 360, 640, 480)).toEqual({ scrollX: 320, scrollY: 300 });
    expect(cameraScroll(1280, 960, 640, 360, 10, 10)).toEqual({ scrollX: 0, scrollY: 0 });
    expect(cameraScroll(1280, 960, 640, 360, 1270, 950)).toEqual({ scrollX: 640, scrollY: 600 });
  });

  it('centres axes where the map is smaller than the viewport', () => {
    expect(cameraScroll(384, 320, 640, 360, 100, 100)).toEqual({ scrollX: -128, scrollY: -20 });
    expect(cameraScroll(384, 960, 640, 360, 100, 500)).toEqual({ scrollX: -128, scrollY: 320 });
  });
});
