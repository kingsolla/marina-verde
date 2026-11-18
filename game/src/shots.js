// Marina Verde — screenshot staging. Each named shot arranges the real game
// state (player, cars, police, mission, wanted level) and the camera, then the
// normal loop renders it, so every screenshot is a genuine frame of the game.
// ?shot=cover|chase|street|hud — window.__shotReady is set by main.js once
// a few frames have rendered. Banners are suppressed for the shots: the
// objective bar at the top already tells the story.
import { PLACES } from './config.js';
import { startMission } from './missions.js';

function placePlayer(game, x, z, heading) {
  game.playerX = x;
  game.playerZ = z;
  game.playerHeading = heading;
  game.playerMesh.position.set(x, 0, z);
  game.playerMesh.rotation.y = heading;
  game.cameraYaw = heading;
}

// Put a parked car of the fleet beside the player for the cover shot.
function parkCarBeside(game, x, z, heading) {
  const car = game.allCars.find((c) => c.driver === null && !c.isPolice);
  if (!car) return null;
  car.x = x;
  car.z = z;
  car.heading = heading;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  return car;
}

function noBanner(game) {
  game.missions.banner = null;
}

export function stageShot(name, game, ctx) {
  const { enterCar, spawnPoliceIfNeeded, spawnRivals } = ctx;
  game.time = 0;
  // Golden-hour light is the default; keep the clock fixed for the shots.
  game.clock = 17 * 60 + 5;

  if (name === 'chase') {
    // Mission 2, driving east down the beachfront road with two police cars
    // on the tail and three wanted stars. The camera sits side-rear so the
    // police are in frame behind the player's car.
    startMission(game.missions, game, 1);
    game.missions.step = 1; // deliver leg, so the HUD shows a live objective
    noBanner(game);
    const car = parkCarBeside(game, 40, 182, Math.PI / 2);
    placePlayer(game, 40, 178, Math.PI / 2);
    if (car) enterCar(car);
    game.playerCar.speed = 26;
    game.wanted.stars = 3;
    game.wanted.heat = 0;
    spawnPoliceIfNeeded();
    // Pull the police in close behind the player for a real chase frame.
    game.policeCars.forEach((pc, i) => {
      pc.x = game.playerX - 12 - i * 9;
      pc.z = game.playerZ + (i === 0 ? 2 : -3);
      pc.heading = Math.PI / 2;
      pc.speed = 24;
      pc.mesh.position.set(pc.x, 0, pc.z);
    });
    // Two traffic cars ahead on the same road, for a living street.
    game.trafficCars.slice(0, 2).forEach((tc, i) => {
      tc.x = game.playerX + 48 + i * 30;
      tc.z = 182 + (i === 0 ? 2.4 : -2.4);
      tc.heading = Math.PI / 2;
      tc.speed = 10;
      tc.ai.axis = 'x';
      tc.ai.dir = 1;
      tc.mesh.position.set(tc.x, 0, tc.z);
    });
    game.cameraYaw = Math.PI / 2 - 2.4; // camera ahead-side, looking back: police in frame behind the player
    game.cameraPitch = 0.2;
    game.objective = '2 · Sunset Courier: Deliver the parcel to the Coral Hotel';
    return;
  }

  if (name === 'street') {
    // Mission 4 on foot in the market alley, rival crew in frame, one star.
    startMission(game.missions, game, 3);
    noBanner(game);
    placePlayer(game, PLACES.alley.x, PLACES.alley.z + 12, Math.PI);
    spawnRivals();
    game.wanted.stars = 1;
    game.wanted.heat = 0;
    game.combat.ammo = 18;
    game.cameraYaw = Math.PI + 0.25;
    game.cameraPitch = 0.3;
    return;
  }

  if (name === 'hud') {
    // Mission 2, driving east along the beachfront: palms and sea on the
    // right, city on the left, HUD + minimap + speed all reading at a glance.
    startMission(game.missions, game, 1);
    noBanner(game);
    const car = parkCarBeside(game, -40, 182, Math.PI / 2);
    placePlayer(game, -40, 178, Math.PI / 2);
    if (car) enterCar(car);
    game.playerCar.speed = 18;
    game.money = 540;
    game.cameraYaw = Math.PI / 2 + 0.15;
    game.cameraPitch = 0.26;
    return;
  }

  // Default: cover. Nico on foot on the sand beside a car, the whole city
  // skyline and Verde Tower behind him, wide camera for the vista.
  startMission(game.missions, game, 0);
  noBanner(game);
  placePlayer(game, -20, 186, Math.PI * 0.95);
  parkCarBeside(game, -15.5, 183.5, Math.PI * 0.55);
  game.money = 250;
  game.cameraYaw = Math.PI * 0.98;
  game.cameraPitch = 0.3;
  game.cameraDistOverride = 11;
}
