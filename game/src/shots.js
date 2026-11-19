// Ember Vice — shots.js
// One job: the four deterministic screenshot scenes behind ?shot=drive|street|
// chase|marina. Each one poses the real game (a real car, real police, a real
// mission) and then plays it forward a few seconds with a scripted driver, so
// the frame is what playing really looks like — and the same seed always
// gives the same frame.

export function stageShot(game, name) {
  const g = game;
  const P = g.player;

  function driveFor(seconds, steerFn) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i += 1) {
      const input = { keys: { up: true, down: false, left: false, right: false }, pressed: {}, mouseDX: 0, mouseDY: 0, endFrame() {} };
      if (steerFn) steerFn(input, i / 60);
      g.step(1 / 60, input);
    }
  }

  function walkFor(seconds) {
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i += 1) {
      g.step(1 / 60, { keys: {}, pressed: {}, mouseDX: 0, mouseDY: 0, endFrame() {} });
    }
  }

  if (name === 'street') {
    // On foot south of The Rusty Anchor: the gold ring close ahead, the bar
    // and its sign ahead-right, the avenue's traffic crossing the frame.
    g.setPlayerPos(-48, -70, -0.88);
    P.camYaw = -0.88;
    P.camPitch = 0.26;
    g.missions.start(g);
    walkFor(3);
    return;
  }

  if (name === 'chase') {
    // Three stars, police on the tail, the Big Score escape running.
    // The car starts ON the avenue (x = 60, right-hand lane) heading north,
    // so the drive stays on the road and the cop cars can close in behind.
    g.setPlayerPos(62.8, -140, 0);
    const car = g.traffic.comet; // the red Comet GT, the getaway car
    car.x = 62.8; car.z = -140; car.heading = 0; car.speed = 18;
    g.putPlayerInCar(car);
    g.missions.restore({ index: 4, completed: 4, allDone: false });
    g.missions.start(g);
    g.missions.active.stage = 'escape';
    g.police.setHeat(130, g);
    driveFor(5, (input, t) => {
      // Stay in the avenue's northbound lane (x = 62.8).
      const c = g.playerCar;
      if (c) {
        const err = 62.8 - c.x;
        if (err > 1.5) input.keys.right = true;
        if (err < -1.5) input.keys.left = true;
      }
    });
    return;
  }

  if (name === 'marina') {
    // Dockside Heat: four Vultures at the marina, Dario on foot close in,
    // pistol out, the gold ring and the MARINA sign in frame.
    g.setPlayerPos(212, 50, Math.PI * 0.5);
    P.camYaw = Math.PI * 0.5;
    P.camPitch = 0.28;
    g.missions.restore({ index: 3, completed: 3, allDone: false });
    g.missions.start(g);
    walkFor(2.5);
    return;
  }

  // Default: 'drive' — the cover. Cruising downtown in a sports car with
  // two stars, a cop car closing in, the Package Run on the HUD.
  // The car starts ON the avenue (x = 0, right-hand lane) heading north.
  g.setPlayerPos(2.8, -140, 0);
  const car = g.traffic.parked.find((c) => c.kind === 'sport') || g.traffic.parked[0];
  car.x = 2.8; car.z = -140; car.heading = 0; car.speed = 12;
  g.putPlayerInCar(car);
  g.missions.restore({ index: 1, completed: 1, allDone: false });
  g.missions.start(g);
  g.police.setHeat(70, g);
  driveFor(4, (input) => {
    const c = g.playerCar;
    if (c) {
      const err = 2.8 - c.x; // ride the avenue's northbound lane
      if (err > 1.5) input.keys.right = true;
      if (err < -1.5) input.keys.left = true;
    }
  });
}
