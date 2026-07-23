'use strict';

const assert = require('node:assert/strict');
const { ServerGame, constants } = require('../server-game');

function runUntilSettled(game, maxSteps = 5000) {
  let now = Date.now();
  for (let step = 0; step < maxSteps && game.state.phase === 'moving'; step += 1) {
    now += 1000 / 120;
    game.update(1 / 120, now);
  }
  assert.notEqual(game.state.phase, 'moving', 'o servidor deve concluir o lance');
}

const game = new ServerGame({ starter: 0, teamChoices: [0, 0] });
assert.equal(game.state.players.length, 22, 'o servidor deve criar os dois times completos');
assert.deepEqual(game.state.teamChoices, [0, 0], 'o servidor deve preservar times repetidos');
assert.equal(
  game.shoot(1, { bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 100 }).ok,
  false,
  'o servidor deve rejeitar jogada fora da vez',
);
assert.equal(
  game.shoot(0, { bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 100 }).ok,
  true,
  'o servidor deve aceitar a jogada do dono da vez',
);
runUntilSettled(game);

const outGame = new ServerGame({ starter: 0 });
outGame.state.phase = 'moving';
outGame.state.lastTouchedTeam = 0;
outGame.state.lastTouchedPlayer = { team: 0, number: 10 };
outGame.state.ball.x = 724;
outGame.state.ball.y = constants.FIELD.top - outGame.state.ball.radius - 1;
outGame.state.ball.vy = -120;
outGame.update(1 / 120, Date.now());
assert.equal(outGame.state.restart.type, 'throwIn', 'o servidor deve marcar lateral');
assert.equal(outGame.state.activeTeam, 1, 'o lateral deve ir para o adversário do último toque');
assert.ok(
  outGame.drainEvents().some((event) => event.type === 'ball-out'),
  'o servidor deve publicar o evento de bola fora',
);

const goalGame = new ServerGame({ starter: 0 });
goalGame.state.score = [2, 0];
goalGame.state.phase = 'moving';
goalGame.state.ball.x = constants.GOAL_LINE.right + goalGame.state.ball.radius - 0.5;
goalGame.state.ball.y = (constants.GOAL.top + constants.GOAL.bottom) / 2;
goalGame.state.ball.vx = 180;
const goalTime = Date.now();
goalGame.update(1 / 120, goalTime);
assert.deepEqual(goalGame.state.score, [3, 0], 'o servidor deve confirmar o terceiro gol');
assert.equal(goalGame.state.phase, 'paused', 'a comemoração deve pausar o estado autoritativo');
assert.ok(goalGame.drainEvents().some((event) => event.type === 'goal'), 'o servidor deve publicar o gol');
goalGame.update(1 / 120, goalTime + 2801);
assert.equal(goalGame.state.phase, 'finished', 'o servidor deve finalizar após a comemoração');
assert.ok(
  goalGame.drainEvents().some((event) => event.type === 'match-finished'),
  'o servidor deve publicar o encerramento',
);

console.log('OK — física e regras autoritativas do servidor passaram.');
