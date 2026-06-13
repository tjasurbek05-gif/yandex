// Required code module for the apps-engine deploy. STACK is a solo, client-only arcade game: all
// simulation runs in the browser (see ./src/), so this is the platform's mandated no-op rules stub.
export const meta = { game: 'stack', minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
