export const COARSE_3D_ERROR = 48;
export const DETAIL_3D_ERROR = 12;
const SETTLE_MS = 600;

export class ThreeDetail {
  private interacting = false;
  private lastChange = 0;
  private refining = false;

  start(now: number) {
    this.interacting = true;
    this.change(now);
  }

  change(now: number) {
    this.lastChange = now;
    this.refining = false;
  }

  end(now: number) {
    this.interacting = false;
    this.change(now);
  }

  update(now: number, previewReady: boolean) {
    if (!this.interacting && previewReady && now - this.lastChange >= SETTLE_MS) {
      this.refining = true;
    }
    return this.refining ? DETAIL_3D_ERROR : COARSE_3D_ERROR;
  }
}
