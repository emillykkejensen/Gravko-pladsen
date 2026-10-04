import { gameState } from '../state/GameState';

/**
 * Where the "next thing to do" lives.
 *
 * The town's signpost, the button that appears when a machine is ready and the one that
 * appears when a stage is finished all go here, so a child following the big button is
 * always led the same way: build the machine, fill it up, go to work.
 */
export function nextRoute(): { scene: string; data?: object } {
  const step = gameState.nextStep();
  switch (step.kind) {
    case 'assemble':
      return { scene: 'AssembleScene', data: { machine: step.machine } };
    case 'prepare':
      return { scene: 'PrepScene', data: { machine: step.machine } };
    case 'site':
      return { scene: gameState.stage.scene };
  }
}
