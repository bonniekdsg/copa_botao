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

const rightCurveGame = new ServerGame({ starter: 0 });
const rightCurveAttacker = rightCurveGame.state.players.find((player) => player.team === 0 && player.number === 10);
rightCurveAttacker.x =
  rightCurveGame.state.ball.x - rightCurveAttacker.radius - rightCurveGame.state.ball.radius - 2;
rightCurveAttacker.y = rightCurveGame.state.ball.y;
assert.equal(
  rightCurveGame.shoot(0, { bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 100, curve: 1 }).ok,
  true,
  'o servidor deve aceitar curva à direita dos atacantes',
);
rightCurveGame.update(1 / 120, Date.now());
assert.ok(Math.abs(rightCurveAttacker.vy) < 0.001, 'o servidor deve manter reto o caminho do atacante');
assert.equal(rightCurveGame.state.ballCurve, 1, 'o servidor deve transferir a curva à direita para a bola');
rightCurveGame.update(1 / 120, Date.now());
assert.ok(rightCurveGame.state.ball.vy > 0, 'a curva à direita deve desviar a bola para baixo');

const leftCurveGame = new ServerGame({ starter: 0 });
const leftCurveAttacker = leftCurveGame.state.players.find((player) => player.team === 0 && player.number === 10);
leftCurveAttacker.x = leftCurveGame.state.ball.x - leftCurveAttacker.radius - leftCurveGame.state.ball.radius - 2;
leftCurveAttacker.y = leftCurveGame.state.ball.y;
assert.equal(
  leftCurveGame.shoot(0, { bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 100, curve: -1 }).ok,
  true,
  'o servidor deve aceitar curva à esquerda dos atacantes',
);
leftCurveGame.update(1 / 120, Date.now());
assert.equal(leftCurveGame.state.ballCurve, -1, 'o servidor deve transferir a curva à esquerda para a bola');
leftCurveGame.update(1 / 120, Date.now());
assert.ok(leftCurveGame.state.ball.vy < 0, 'a curva à esquerda deve desviar a bola para cima');

const blocker = rightCurveGame.state.players.find((player) => player !== rightCurveAttacker);
blocker.x = rightCurveGame.state.ball.x + rightCurveGame.state.ball.radius + blocker.radius - 1;
blocker.y = rightCurveGame.state.ball.y;
rightCurveGame.resolveCollision(rightCurveGame.state.ball, blocker);
assert.equal(rightCurveGame.state.ballCurve, 0, 'o efeito deve terminar quando a bola toca outro botão');

const limitedCurveGame = new ServerGame({ starter: 0 });
limitedCurveGame.state.ball.vx = 700;
limitedCurveGame.state.ball.vy = 0;
limitedCurveGame.state.ballCurve = 1;
limitedCurveGame.state.ballCurveRemaining = constants.BALL_CURVE_MAX_ANGLE;
for (let index = 0; index < 120 && limitedCurveGame.state.ballCurve !== 0; index += 1) {
  limitedCurveGame.applyBallCurve(1 / 120);
}
const finalCurveAngle = Math.atan2(limitedCurveGame.state.ball.vy, limitedCurveGame.state.ball.vx);
assert.ok(
  finalCurveAngle <= constants.BALL_CURVE_MAX_ANGLE + 0.001,
  'a curva da bola não deve ultrapassar o limite de 40 graus',
);
assert.ok(finalCurveAngle > 0.65, 'a curva completa de 40 graus deve ser claramente perceptível');

const invalidCurveGame = new ServerGame({ starter: 0 });
assert.equal(
  invalidCurveGame.shoot(0, { bodyType: 'player', number: 8, dx: 100, dy: 0, drag: 100, curve: 1 }).ok,
  false,
  'o servidor deve rejeitar curva de um jogador que não seja 9, 10 ou 11',
);

const foulGoalGame = new ServerGame({ starter: 0 });
const foulGoalOffender = foulGoalGame.state.players.find((player) => player.team === 0 && player.number === 6);
const foulGoalOpponent = foulGoalGame.state.players.find((player) => player.team === 1 && player.number === 6);
foulGoalGame.state.players = [foulGoalOffender, foulGoalOpponent];
foulGoalOffender.x = 1240;
foulGoalOffender.y = 521.5;
foulGoalOpponent.x = 1305;
foulGoalOpponent.y = 521.5;
foulGoalGame.state.ball.x = 1360;
foulGoalGame.state.ball.y = 521.5;
assert.equal(
  foulGoalGame.shoot(0, { bodyType: 'player', number: 6, dx: 100, dy: 0, drag: 110 }).ok,
  true,
  'o servidor deve iniciar o cenário de colisão em cadeia',
);
runUntilSettled(foulGoalGame);
assert.deepEqual(foulGoalGame.state.score, [0, 0], 'o servidor deve anular o gol cometido depois da falta');
assert.equal(foulGoalOffender.discipline.yellow, 1, 'a força média da colisão que anulou o gol deve gerar amarelo');
const foulGoalEvents = foulGoalGame.drainEvents();
assert.ok(!foulGoalEvents.some((event) => event.type === 'goal'), 'o servidor não deve publicar o gol anulado');
assert.ok(
  foulGoalEvents.some(
    (event) => event.type === 'discipline' && event.cancelledGoal && event.text.startsWith('Gol anulado'),
  ),
  'o servidor deve informar a falta e o gol anulado aos dois jogadores',
);

const reboundGame = new ServerGame({ starter: 0 });
reboundGame.state.phase = 'moving';
reboundGame.state.ball.x = 724;
reboundGame.state.ball.y = constants.FIELD.top + reboundGame.state.ball.radius - 1;
reboundGame.state.ball.vy = -120;
reboundGame.update(1 / 120, Date.now());
assert.equal(
  reboundGame.state.ball.y,
  constants.FIELD.top + reboundGame.state.ball.radius,
  'o servidor deve manter a bola dentro da lateral superior',
);
assert.ok(reboundGame.state.ball.vy > 0, 'o servidor deve refletir a bola para dentro do campo');
assert.equal(reboundGame.state.activeTeam, 0, 'o rebote não deve trocar a equipe ativa');
assert.ok(
  reboundGame.drainEvents().some((event) => event.type === 'sound' && event.sound === 'edge'),
  'o servidor deve publicar o som de impacto da bola na borda',
);
reboundGame.state.phase = 'ready';
assert.equal(
  reboundGame.shoot(0, { bodyType: 'ball', dx: 100, dy: 0, drag: 100 }).ok,
  false,
  'o servidor não deve permitir cobrança direta na bola',
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
