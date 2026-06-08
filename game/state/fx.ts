// Transient per-frame values kept OUT of React state to avoid re-renders.
// Read & mutated inside useFrame loops only.

export const renderState = {
  simTime: 0, // ocean wave time used by the renderer this frame
};

export const fx = {
  shake: 10, // camera shake magnitude, decays each frame
};

export function addShake(amount: number) {
  fx.shake = Math.min(5, fx.shake + amount);
}
