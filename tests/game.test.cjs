const assert = require('node:assert/strict');

class ClassList {
  constructor() { this.values = new Set(); }
  add(...items) { items.forEach((item) => this.values.add(item)); }
  remove(...items) { items.forEach((item) => this.values.delete(item)); }
  toggle(item, force) {
    if (force === true) this.values.add(item);
    else if (force === false) this.values.delete(item);
    else if (this.values.has(item)) this.values.delete(item);
    else this.values.add(item);
  }
}

function makeElement() {
  return {
    classList: new ClassList(),
    style: {},
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: '0',
    addEventListener() {},
    setAttribute() {},
    querySelector() { return makeElement(); },
    close() {},
    showModal() {},
  };
}

const gradient = { addColorStop() {} };
const context = new Proxy({}, {
  get(target, property) {
    if (!(property in target)) target[property] = property === 'createRadialGradient' ? () => gradient : () => {};
    return target[property];
  },
  set(target, property, value) { target[property] = value; return true; },
});

const elements = new Map();
const canvas = Object.assign(makeElement(), {
  width: 1448,
  height: 1086,
  getContext: () => context,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1448, height: 1086 }),
  setPointerCapture() {},
});
elements.set('#gameCanvas', canvas);

global.document = {
  body: makeElement(),
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  },
  querySelectorAll(selector) {
    if (selector === '#touchDots i') return [makeElement(), makeElement(), makeElement()];
    return [];
  },
  addEventListener() {},
};
global.window = {
  requestAnimationFrame() {},
  setTimeout() { return 1; },
  clearTimeout() {},
  scrollTo() {},
  addEventListener() {},
};
global.performance = { now: () => 0 };
global.Image = class {
  constructor() { this.complete = false; this.naturalWidth = 0; }
  addEventListener() {}
};

require('../game.js');
const api = window.__copaBotao;
const game = api.state;

function prepareMoving() {
  game.phase = 'moving';
  game.pendingOutcome = null;
  game.foul = false;
  game.foulImpactSpeed = 0;
  game.ballTouched = false;
  game.ownBlock = false;
  game.launchPlayer = game.players.find((player) => player.team === game.activeTeam);
}

assert.equal(api.selectTeams(0, 0), true, 'os dois jogadores devem poder escolher o mesmo time');
assert.deepEqual(game.teamChoices, [0, 0], 'a escolha Argentina x Argentina deve ser preservada');
assert.equal(api.selectedTeamImagePath(0), 'assets/argentina.webp', 'o Jogador 1 deve manter a camisa principal');
assert.equal(api.selectedTeamImagePath(1), 'assets/argentina2.webp', 'o Jogador 2 deve usar a camisa 2 da Argentina');
assert.equal(api.selectTeams(1, 1), true, 'os dois jogadores também podem escolher a Espanha');
assert.equal(api.selectedTeamImagePath(1), 'assets/espanha2.webp', 'a Espanha repetida deve usar sua camisa 2 no lado direito');
assert.equal(api.selectTeams(0, 1), true, 'também deve ser possível escolher times diferentes');
assert.equal(api.selectedTeamImagePath(1), 'assets/espanha.webp', 'times diferentes devem usar as camisas principais');
assert.equal(api.selectTeams(4, 1), false, 'uma opção de time inexistente deve ser rejeitada');

api.startMatch(0);
assert.equal(game.players.length, 22, 'deve criar dez jogadores de linha e um goleiro por time');
assert.equal(game.players.filter((player) => player.keeper).length, 2, 'deve criar dois goleiros');
assert.ok(game.players.filter((player) => player.keeper).every((player) => player.number === 1), 'todo goleiro deve usar o número 1');
for (const team of [0, 1]) {
  assert.deepEqual(
    game.players.filter((player) => player.team === team).map((player) => player.number).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'cada time deve ter numeração única de 1 a 11',
  );
}
assert.deepEqual([game.ball.x, game.ball.y], [724, 543], 'a bola começa no centro');
assert.deepEqual(api.constants.FRICTION, { player: 520, ball: 420 }, 'o campo deve desacelerar rapidamente jogadores e bola');
const curveAttacker = game.players.find((player) => player.team === 0 && player.number === 10);
game.phase = 'ready';
game.selected = curveAttacker;
assert.equal(api.setAimCurve(1), true, 'o atacante 10 deve aceitar curva à direita');
assert.equal(game.aimCurve, 1, 'a escolha da curva deve ficar registrada na mira');
game.selected = game.players.find((player) => player.team === 0 && player.number === 8);
game.aimCurve = 0;
assert.equal(api.setAimCurve(1), false, 'um jogador que não seja 9, 10 ou 11 não deve aceitar curva');
const curveDrag = 100;
const curveAt20Percent = api.curveAngleForDrag(api.constants.MAX_DRAG * 0.2);
const curveAt100Percent = api.curveAngleForDrag(api.constants.MAX_DRAG);
assert.ok(curveAt20Percent > 0.11 && curveAt20Percent < 0.14, '20% de força deve produzir cerca de 7 graus');
assert.ok(
  Math.abs(curveAt100Percent - api.constants.BALL_CURVE_MAX_ANGLE) < 0.0001,
  '100% de força deve produzir a curva máxima de 50 graus',
);
const originalPlayers = game.players;
const pathBlocker = originalPlayers.find((player) => player !== curveAttacker);
game.ball.x = 500;
game.ball.y = 300;
curveAttacker.x = 300;
curveAttacker.y = 300;
pathBlocker.x = 380;
pathBlocker.y = 300;
game.players = [curveAttacker, pathBlocker];
assert.equal(
  api.predictBallContact(curveAttacker, 1, 0, curveDrag),
  null,
  'a previsão de curva não deve aparecer quando outro botão será atingido antes da bola',
);
game.ball.x = 300;
game.ball.y = 300;
curveAttacker.x = game.ball.x - curveAttacker.radius - game.ball.radius - 2;
curveAttacker.y = game.ball.y;
game.players = [curveAttacker];
const predictedCurve = api.predictCurvedBallPath(curveAttacker, 1, 0, curveDrag, 1);
assert.ok(predictedCurve.length > 80, 'a previsão deve amostrar a curva física até o fim do efeito');
const weakerCurve = api.predictCurvedBallPath(curveAttacker, 1, 0, 70, 1);
assert.ok(
  Math.hypot(
    predictedCurve.at(-1).x - predictedCurve[0].x,
    predictedCurve.at(-1).y - predictedCurve[0].y,
  ) >
    Math.hypot(
      weakerCurve.at(-1).x - weakerCurve[0].x,
      weakerCurve.at(-1).y - weakerCurve[0].y,
    ),
  'a força usada deve alterar o comprimento do tracejado previsto',
);
const predictedBlocker = pathBlocker;
predictedBlocker.x = predictedCurve[20].x;
predictedBlocker.y = predictedCurve[20].y;
game.players = [curveAttacker, predictedBlocker];
const blockedPrediction = api.predictCurvedBallPath(curveAttacker, 1, 0, curveDrag, 1);
assert.ok(blockedPrediction.length < predictedCurve.length, 'o tracejado deve terminar ao prever outro botão');
game.players = [curveAttacker];
curveAttacker.vx = (curveDrag / api.constants.MAX_DRAG) * api.constants.MAX_SPEED;
curveAttacker.vy = 0;
game.launchPlayer = curveAttacker;
game.shotCurve = 1;
game.shotCurveAngle = api.curveAngleForDrag(curveDrag);
game.firstContact = null;
game.phase = 'moving';
api.update(1 / 120);
assert.ok(Math.abs(curveAttacker.vy) < 0.001, 'o atacante deve seguir reto até tocar a bola');
assert.equal(game.ballCurve, 1, 'o atacante 10 deve transferir a curva escolhida para a bola');
for (let step = 0; step < 180 && game.ballCurve !== 0; step += 1) api.update(api.constants.PHYSICS_STEP);
const predictedEnd = predictedCurve.at(-1);
assert.ok(game.ball.vy > 0, 'a física local deve curvar a trajetória da bola para a direita depois do contato');
assert.ok(
  Math.hypot(game.ball.x - predictedEnd.x, game.ball.y - predictedEnd.y) < 5,
  'a bola real deve terminar o trecho de efeito sobre o tracejado físico previsto',
);
game.players = originalPlayers;
api.resetFormation();
game.phase = 'ready';

const leftKeeper = game.players.find((player) => player.team === 0 && player.keeper);
const rightKeeper = game.players.find((player) => player.team === 1 && player.keeper);
game.phase = 'moving';
leftKeeper.x = 400;
leftKeeper.vx = 180;
rightKeeper.y = 120;
rightKeeper.vy = -180;
api.update(1 / 120);
assert.equal(leftKeeper.x, api.constants.PENALTY_AREA.leftEnd - leftKeeper.radius, 'o goleiro esquerdo não pode sair da grande área');
assert.equal(rightKeeper.y, api.constants.PENALTY_AREA.top + rightKeeper.radius, 'o goleiro direito não pode ultrapassar o topo da grande área');
api.resetFormation();
game.phase = 'ready';

prepareMoving();
game.ballTouched = true;
api.evaluatePlay();
assert.equal(game.activeTeam, 0, 'um toque válido mantém a posse');
assert.equal(game.touchesUsed, 1, 'um toque válido consome um dos três toques');

prepareMoving();
api.evaluatePlay();
assert.equal(game.activeTeam, 1, 'errar a bola troca a posse');
assert.equal(game.touchesUsed, 0, 'a nova posse começa com três toques');

prepareMoving();
game.foul = true;
api.evaluatePlay();
assert.equal(game.activeTeam, 0, 'a falta entrega a posse ao adversário');
assert.equal(game.teamFouls[1], 1, 'a falta deve entrar no total da equipe');

prepareMoving();
const scoreBeforeCancelledGoal = [...game.score];
game.foul = true;
game.foulImpactSpeed = 100;
game.pendingOutcome = { type: 'goal', team: game.activeTeam };
api.evaluatePlay();
assert.deepEqual(game.score, scoreBeforeCancelledGoal, 'um gol originado após atingir o adversário deve ser anulado');
assert.equal(game.phase, 'ready', 'a falta deve ter prioridade sobre a comemoração do gol');

prepareMoving();
const teamBeforeRightRebound = game.activeTeam;
game.ball.x = api.constants.FIELD.right - game.ball.radius + 1;
game.ball.y = 220;
game.ball.vx = 240;
api.update(1 / 120);
assert.equal(
  game.ball.x,
  api.constants.FIELD.right - game.ball.radius,
  'a bola deve permanecer dentro do campo ao atingir o fundo direito',
);
assert.ok(game.ball.vx < 0, 'a bola deve voltar para a esquerda após atingir o fundo direito');
assert.equal(game.activeTeam, teamBeforeRightRebound, 'o rebote não deve trocar a posse durante o lance');
assert.equal(game.pendingOutcome, null, 'o rebote fora das traves não deve encerrar o lance');

prepareMoving();
game.ball.x = api.constants.FIELD.left + game.ball.radius - 1;
game.ball.y = 220;
game.ball.vx = -240;
api.update(1 / 120);
assert.equal(game.ball.x, api.constants.FIELD.left + game.ball.radius, 'a bola deve permanecer dentro do fundo esquerdo');
assert.ok(game.ball.vx > 0, 'a bola deve voltar para a direita após atingir o fundo esquerdo');

prepareMoving();
game.ball.x = 724;
game.ball.y = api.constants.FIELD.top + game.ball.radius - 1;
game.ball.vx = 0;
game.ball.vy = -240;
api.update(1 / 120);
assert.equal(game.ball.y, api.constants.FIELD.top + game.ball.radius, 'a bola deve permanecer dentro da lateral superior');
assert.ok(game.ball.vy > 0, 'a bola deve descer após atingir a lateral superior');

prepareMoving();
game.ball.x = 724;
game.ball.y = api.constants.FIELD.bottom - game.ball.radius + 1;
game.ball.vx = 0;
game.ball.vy = 240;
api.update(1 / 120);
assert.equal(game.ball.y, api.constants.FIELD.bottom - game.ball.radius, 'a bola deve permanecer dentro da lateral inferior');
assert.ok(game.ball.vy < 0, 'a bola deve subir após atingir a lateral inferior');
assert.equal(
  Math.abs(game.ball.vy) < 240,
  true,
  'o ricochete deve perder velocidade para não prolongar demais o lance',
);

game.activeTeam = 0;
prepareMoving();
const twiceBooked = game.launchPlayer;
game.foul = true;
game.foulImpactSpeed = api.constants.CARD_THRESHOLD.yellow + 1;
api.evaluatePlay();
assert.equal(twiceBooked.discipline.yellow, 1, 'impacto médio deve gerar cartão amarelo');
assert.ok(game.players.includes(twiceBooked), 'um amarelo não deve expulsar o botão');

game.activeTeam = 0;
prepareMoving();
game.launchPlayer = twiceBooked;
game.foul = true;
game.foulImpactSpeed = api.constants.CARD_THRESHOLD.yellow + 1;
api.evaluatePlay();
assert.equal(twiceBooked.discipline.red, true, 'o segundo amarelo deve virar vermelho');
assert.ok(!game.players.includes(twiceBooked), 'o botão expulso deve sair do campo');

game.activeTeam = 1;
prepareMoving();
const directlySentOff = game.players.find((player) => player.team === 1 && player.number === 2);
game.launchPlayer = directlySentOff;
game.foul = true;
game.foulImpactSpeed = api.constants.CARD_THRESHOLD.red + 1;
api.evaluatePlay();
assert.equal(directlySentOff.discipline.red, true, 'impacto forte deve gerar vermelho direto');

api.resetFormation();
assert.ok(!game.players.some((player) => player.team === 0 && player.number === twiceBooked.number), 'a expulsão deve persistir após reposicionar o time');
assert.ok(!game.players.some((player) => player.team === 1 && player.number === directlySentOff.number), 'o vermelho direto deve persistir após reposicionar o time');
game.phase = 'ready';

game.score = [2, 0];
game.activeTeam = 0;
prepareMoving();
game.ball.x = api.constants.GOAL_LINE.right + game.ball.radius - 0.5;
game.ball.y = 543;
game.ball.vx = 180;
game.ball.vy = 0;
api.update(1 / 120);
assert.deepEqual(game.score, [3, 0], 'o gol atualiza o placar');
assert.ok(game.ball.x < api.constants.FIELD.right, 'o gol deve valer na frente das traves, antes da linha externa do campo');
assert.equal(game.phase, 'paused', 'a comemoração deve pausar o jogo antes do resultado');
assert.equal(elements.get('#goalOverlay').hidden, false, 'a imagem de gol deve aparecer imediatamente');
assert.ok(elements.get('#goalOverlay').classList.values.has('show'), 'a animação da comemoração deve ser ativada');
api.completeGoalCelebration();
assert.equal(game.phase, 'finished', 'o terceiro gol encerra a partida');
assert.equal(elements.get('#goalOverlay').hidden, true, 'a imagem de gol deve desaparecer antes do resultado');
assert.equal(elements.get('#resultOverlay').hidden, false, 'o resultado deve aparecer depois da comemoração');

console.log('OK — cenários de física, regras e disciplina passaram.');
