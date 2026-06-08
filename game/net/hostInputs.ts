import type { Mode } from "./protocol";

export interface BoatInput {
  throttle: number;
  steer: number;
  mode: Mode;
  aimYaw: number;
  aimPitch: number;
  fireSeq: number;
}

export const NEUTRAL_INPUT: BoatInput = {
  throttle: 0,
  steer: 0,
  mode: 0,
  aimYaw: 0,
  aimPitch: 0.18,
  fireSeq: 0,
};

// Latest input per remote player, written by the connection layer on the host.
export const hostInputs = new Map<string, BoatInput>();
