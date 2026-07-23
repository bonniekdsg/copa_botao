import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const pages = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json());
const browserPage = pages.find((page) => page.type === 'page');
assert.ok(browserPage?.webSocketDebuggerUrl, 'Chrome não está disponível na porta 9222');
const mobile = process.argv.includes('--mobile');

const socket = new WebSocket(browserPage.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const pending = new Map();
const events = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method && events.has(message.method)) {
    events.get(message.method).splice(0).forEach((resolve) => resolve(message.params));
  }
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const messageId = ++id;
    pending.set(messageId, { resolve, reject });
    socket.send(JSON.stringify({ id: messageId, method, params }));
  });
}

function nextEvent(method) {
  return new Promise((resolve) => {
    if (!events.has(method)) events.set(method, []);
    events.get(method).push(resolve);
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForPhase(phase, timeout = 6000) {
  await evaluate(`new Promise((resolve, reject) => {
    const deadline = performance.now() + ${timeout};
    const check = () => {
      if (window.__copaBotao.state.phase === ${JSON.stringify(phase)}) resolve(true);
      else if (performance.now() >= deadline) reject(new Error('Tempo esgotado aguardando a fase ${phase}'));
      else setTimeout(check, 40);
    };
    check();
  })`);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Network.enable');
await command('Network.setCacheDisabled', { cacheDisabled: true });
await command('Emulation.setDeviceMetricsOverride', {
  width: mobile ? 390 : 1280,
  height: mobile ? 844 : 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const loaded = nextEvent('Page.loadEventFired');
await command('Page.navigate', { url: 'http://127.0.0.1:4173' });
await loaded;

assert.equal(await evaluate('typeof window.__copaBotao'), 'object', 'a API do jogo deve carregar');
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/bola.webp'))`),
  'a textura da bola deve ser carregada pelo navegador',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/logo_copa_botao.webp'))`),
  'a logo da Copa de Botão deve ser carregada na abertura',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/campo_tela_inicial.webp'))`),
  'o campo próprio da tela inicial deve ser carregado',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/icone_jogo.webp'))`),
  'o ícone do cabeçalho deve ser carregado',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/argentina2.webp'))`),
  'a camisa 2 da Argentina deve ser carregada',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/espanha2.webp'))`),
  'a camisa 2 da Espanha deve ser carregada',
);
assert.ok(
  await evaluate(`performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/assets/gol.webp'))`),
  'a imagem de comemoração de gol deve ser carregada',
);
assert.deepEqual(
  await evaluate(`['kickAudio', 'whistleAudio', 'crowdAudio', 'clickAudio', 'finalAudio', 'menuBackgroundAudio'].map((id) => {
    const audio = document.querySelector('#' + id);
    return new URL(audio.getAttribute('src'), location.href).pathname;
  })`),
  ['/assets/chute.wav', '/assets/apito.mp3', '/assets/torcida.mp3', '/assets/clique.wav', '/assets/final.mp3', '/assets/sound_background.mp3'],
  'cada evento deve apontar para o arquivo de áudio solicitado',
);
await evaluate(`(() => {
  window.__playedAudio = [];
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    window.__playedAudio.push(new URL(this.currentSrc || this.src, location.href).pathname);
    return originalPlay.apply(this, args);
  };
})()`);
assert.ok(
  await evaluate(`document.querySelector('#boardWrap').getBoundingClientRect().height >= window.innerHeight - 2`),
  'a tela inicial deve preencher toda a altura visível',
);
const startScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(
  mobile ? '/tmp/copa-botao-start-mobile.png' : '/tmp/copa-botao-start.png',
  Buffer.from(startScreenshot.data, 'base64'),
);
assert.deepEqual(
  await evaluate(`(() => {
    const background = document.querySelector('#menuBackgroundAudio');
    return { loop: background.loop, paused: background.paused, volume: background.volume };
  })()`),
  { loop: true, paused: false, volume: 0.62 },
  'a tela inicial deve manter somente sound_background.mp3 como ambiente em repetição',
);
await evaluate("document.querySelector('#localButton').click()");
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'team-selection', 'o botão Jogar deve abrir a seleção de times');
assert.equal(
  await evaluate("getComputedStyle(document.querySelector('#startOverlay')).display"),
  'none',
  'a abertura deve sair de cena antes da seleção',
);
assert.notEqual(
  await evaluate("getComputedStyle(document.querySelector('#teamSelectOverlay')).display"),
  'none',
  'a tela de seleção de times deve ficar visível',
);
assert.equal(
  await evaluate("document.querySelector('#menuBackgroundAudio').paused"),
  true,
  'o fundo da tela inicial deve parar ao avançar para a seleção de times',
);
const selectionScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(
  mobile ? '/tmp/copa-botao-selection-mobile.png' : '/tmp/copa-botao-selection.png',
  Buffer.from(selectionScreenshot.data, 'base64'),
);

await evaluate(`document.querySelector('input[name="teamChoice1"][value="0"]').click()`);
await evaluate("document.querySelector('#confirmPlayer0Button').click()");
assert.deepEqual(
  await evaluate('window.__copaBotao.state.teamConfirmed'),
  [true, false],
  'o primeiro jogador deve confirmar sem avançar sozinho',
);
await evaluate("document.querySelector('#confirmPlayer1Button').click()");
await waitForPhase('coin-toss', 2500);
assert.deepEqual(
  await evaluate('window.__copaBotao.state.teamChoices'),
  [0, 0],
  'o fluxo deve aceitar Argentina contra Argentina',
);
assert.equal(
  await evaluate("document.querySelector('#coinStage').classList.contains('is-tossing')"),
  true,
  'a moeda deve iniciar a animação no ar',
);
const coinScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(
  mobile ? '/tmp/copa-botao-coin-mobile.png' : '/tmp/copa-botao-coin.png',
  Buffer.from(coinScreenshot.data, 'base64'),
);
await waitForPhase('ready', 6000);
assert.ok([0, 1].includes(await evaluate('window.__copaBotao.state.startingTeam')), 'o sorteio deve escolher um dos jogadores');
assert.ok(
  (await evaluate('window.__playedAudio')).includes('/assets/clique.wav'),
  'clicar em Jogar e nos demais botões deve usar clique.wav',
);
assert.ok(
  (await evaluate('window.__playedAudio')).includes('/assets/apito.mp3'),
  'o início da partida deve tocar apito.mp3',
);
assert.ok(
  (await evaluate('window.__playedAudio')).includes('/assets/torcida.mp3'),
  'a partida deve iniciar a torcida ambiente',
);
assert.deepEqual(
  await evaluate(`(() => {
    const crowd = document.querySelector('#crowdAudio');
    return { loop: crowd.loop, paused: crowd.paused, volume: crowd.volume };
  })()`),
  { loop: true, paused: false, volume: 0.62 },
  'a torcida deve permanecer em repetição e audível durante a partida',
);
assert.deepEqual(
  await evaluate(`[document.querySelector('#team0Name').textContent, document.querySelector('#team1Name').textContent]`),
  ['Argentina', 'Argentina'],
  'o placar deve refletir as escolhas independentes',
);
assert.equal(
  await evaluate(`document.querySelector('#team1Image').getAttribute('src')`),
  'assets/argentina2.webp',
  'o Jogador 2 deve usar a camisa alternativa quando o time se repetir',
);
if (!mobile) {
  const fit = await evaluate(`({
    viewport: window.innerHeight,
    document: document.documentElement.scrollHeight,
    bodyClass: document.body.className,
    stageWidth: document.querySelector('#gameStage').getBoundingClientRect().width,
    boardHeight: document.querySelector('#boardWrap').getBoundingClientRect().height,
    boardTop: document.querySelector('#boardWrap').getBoundingClientRect().top,
    fieldBottom: document.querySelector('#boardWrap').getBoundingClientRect().bottom,
  })`);
  assert.ok(
    fit.document <= fit.viewport + 2,
    `a partida completa deve caber sem rolagem (${JSON.stringify(fit)})`,
  );
}

await evaluate(`(() => {
  const api = window.__copaBotao;
  api.resetFormation();
  const player = api.state.players.find((item) => item.team === api.state.activeTeam && item.number === 10);
  const ball = api.state.ball;
  player.x = ball.x - player.radius - ball.radius + 1;
  player.y = ball.y;
  player.vx = 180;
  player.vy = 0;
  ball.vx = 0;
  ball.vy = 0;
  api.state.launchPlayer = player;
  api.state.firstContact = null;
  api.state.ballTouched = false;
  api.state.phase = 'moving';
  api.update(1 / 120);
})()`);
assert.equal(
  (await evaluate('window.__playedAudio')).at(-1),
  '/assets/chute.wav',
  'o contato de um botão com a bola deve usar somente chute.wav',
);
await evaluate(`(() => {
  const api = window.__copaBotao;
  api.resetFormation();
  api.state.phase = 'ready';
})()`);

const rect = await evaluate(`(() => {
  const rect = document.querySelector('#gameCanvas').getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
})()`);
const playerPosition = await evaluate(`(() => {
  const api = window.__copaBotao;
  const player = api.state.players.find((item) => item.team === api.state.activeTeam && item.number === 10);
  return { x: player.x, y: player.y };
})()`);
const start = {
  x: rect.left + (playerPosition.x / 1448) * rect.width,
  y: rect.top + (playerPosition.y / 1086) * rect.height,
};
const pull = { x: start.x - 80, y: start.y };

assert.equal(
  await evaluate(`document.elementFromPoint(${start.x}, ${start.y})?.id`),
  'gameCanvas',
  'a coordenada do jogador deve apontar para o canvas',
);
await evaluate(`window.__inputSeen = [];
  document.querySelector('#gameCanvas').addEventListener('pointerdown', () => window.__inputSeen.push('pointerdown'));
  document.querySelector('#gameCanvas').addEventListener('mousedown', () => window.__inputSeen.push('mousedown'));`);
await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
assert.equal(
  await evaluate('window.__copaBotao.state.phase'),
  'aiming',
  `pressionar o botão deve iniciar a mira (canvas: ${JSON.stringify(rect)}, ponto: ${JSON.stringify(start)}, eventos: ${await evaluate('window.__inputSeen.join()')})`,
);
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...pull, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pull, button: 'left', buttons: 0, clickCount: 1 });
await new Promise((resolve) => setTimeout(resolve, 150));

assert.equal(await evaluate('window.__copaBotao.state.shots'), 1, 'arrastar e soltar deve registrar um lance');
assert.notEqual(await evaluate('window.__copaBotao.state.phase'), 'aiming', 'soltar deve encerrar a mira');

await evaluate(`(() => {
  const api = window.__copaBotao;
  const offender = api.state.players.find((player) => player.team === 0 && player.number === 2);
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.launchPlayer = offender;
  api.state.foul = true;
  api.state.foulImpactSpeed = api.constants.CARD_THRESHOLD.yellow + 1;
  api.evaluatePlay();
})()`);
assert.equal(await evaluate('window.__copaBotao.state.discipline[0][2].yellow'), 1, 'a falta média deve aplicar amarelo no navegador');
assert.equal(await evaluate("document.querySelector('#yellow0').textContent"), '1', 'o HUD deve exibir o cartão amarelo');

await evaluate(`(() => {
  window.__whistlesBeforeBallOut = window.__playedAudio.filter((path) => path === '/assets/apito.mp3').length;
  const api = window.__copaBotao;
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.lastTouchedTeam = 0;
  api.state.lastTouchedPlayer = { team: 0, number: 10 };
  api.state.launchPlayer = api.state.players.find((player) => player.team === 0);
  api.state.foul = false;
  api.state.pendingOutcome = null;
  api.state.ball.x = 724;
  api.state.ball.y = api.constants.FIELD.top - api.state.ball.radius - 1;
  api.state.ball.vx = 0;
  api.state.ball.vy = -120;
  api.update(1 / 120);
})()`);
assert.equal(await evaluate('window.__copaBotao.state.activeTeam'), 1, 'a bola fora deve transferir a posse ao adversário');
assert.ok(await evaluate('window.__copaBotao.state.ball.y > window.__copaBotao.constants.FIELD.top'), 'a reposição deve deixar a bola dentro do campo');
assert.equal(await evaluate('window.__copaBotao.state.restart.type'), 'throwIn', 'a saída pela lateral deve criar um lateral');
assert.equal(
  await evaluate("window.__playedAudio.filter((path) => path === '/assets/apito.mp3').length"),
  await evaluate('window.__whistlesBeforeBallOut + 1'),
  'a saída pela lateral deve tocar apito.mp3',
);

const restartBall = await evaluate(`(() => {
  const ball = window.__copaBotao.state.ball;
  return { x: ball.x, y: ball.y };
})()`);
const restartPoint = {
  x: rect.left + (restartBall.x / 1448) * rect.width,
  y: rect.top + (restartBall.y / 1086) * rect.height,
};
const restartPull = { x: restartPoint.x, y: restartPoint.y - 60 };
await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...restartPoint, button: 'left', buttons: 1, clickCount: 1 });
assert.equal(await evaluate('window.__copaBotao.state.selected?.type'), 'ball', 'o lateral deve selecionar diretamente a bola');
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...restartPull, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...restartPull, button: 'left', buttons: 0, clickCount: 1 });
assert.equal(await evaluate('window.__copaBotao.state.shots'), 2, 'a cobrança direta na bola deve registrar um lance');
assert.equal(await evaluate('window.__copaBotao.state.restart'), null, 'a cobrança deve encerrar o estado de lateral');

await evaluate(`(() => {
  window.__whistlesBeforeGoalLineOut = window.__playedAudio.filter((path) => path === '/assets/apito.mp3').length;
  const api = window.__copaBotao;
  api.state.players.forEach((player) => { player.vx = 0; player.vy = 0; });
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.lastTouchedTeam = 0;
  api.state.lastTouchedPlayer = { team: 0, number: 10 };
  api.state.launchPlayer = api.state.players.find((player) => player.team === 0 && player.number === 10);
  api.state.foul = false;
  api.state.pendingOutcome = null;
  api.state.ball.x = api.constants.FIELD.right + api.state.ball.radius + 1;
  api.state.ball.y = 400;
  api.state.ball.vx = 120;
  api.state.ball.vy = 0;
  api.update(1 / 120);
})()`);
assert.equal(await evaluate('window.__copaBotao.state.restart.type'), 'goalKick', 'o último toque do ataque deve gerar tiro de meta');
assert.equal(await evaluate('window.__copaBotao.state.activeTeam'), 1, 'o tiro de meta deve pertencer à defesa');
assert.equal(
  await evaluate("window.__playedAudio.filter((path) => path === '/assets/apito.mp3').length"),
  await evaluate('window.__whistlesBeforeGoalLineOut + 1'),
  'a saída pela linha de fundo deve tocar apito.mp3',
);
assert.deepEqual(
  await evaluate(`(() => {
    const api = window.__copaBotao;
    return [api.state.ball.x, api.state.ball.y];
  })()`),
  await evaluate(`(() => {
    const api = window.__copaBotao;
    const inset = api.state.ball.radius + 9;
    return [api.constants.GOAL_AREA.rightStart + inset, api.constants.GOAL_AREA.top + inset];
  })()`),
  'a bola deve ficar no canto superior esquerdo da pequena área direita',
);

const goalKickContext = await evaluate(`(() => {
  const api = window.__copaBotao;
  const rect = document.querySelector('#gameCanvas').getBoundingClientRect();
  return {
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    ball: { x: api.state.ball.x, y: api.state.ball.y },
  };
})()`);
const goalKickPoint = {
  x: goalKickContext.rect.left + (goalKickContext.ball.x / 1448) * goalKickContext.rect.width,
  y: goalKickContext.rect.top + (goalKickContext.ball.y / 1086) * goalKickContext.rect.height,
};
// O estilingue é puxado para fora para lançar a bola de volta ao interior do campo.
const goalKickPull = { x: goalKickPoint.x + 60, y: goalKickPoint.y };
await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...goalKickPoint, button: 'left', buttons: 1, clickCount: 1 });
assert.equal(await evaluate('window.__copaBotao.state.selected?.type'), 'ball', 'o tiro de meta deve selecionar diretamente a bola');
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...goalKickPull, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...goalKickPull, button: 'left', buttons: 0, clickCount: 1 });
assert.equal(await evaluate('window.__copaBotao.state.shots'), 3, 'a cobrança do tiro de meta deve registrar um lance');
assert.equal(await evaluate('window.__copaBotao.state.restart'), null, 'a cobrança deve encerrar o estado de tiro de meta');

await evaluate(`(() => {
  const api = window.__copaBotao;
  api.state.players.forEach((player) => { player.vx = 0; player.vy = 0; });
  api.state.score = [0, 0];
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.pendingOutcome = null;
  api.state.foul = false;
  api.state.ball.x = api.constants.GOAL_LINE.right + api.state.ball.radius - 0.5;
  api.state.ball.y = (api.constants.GOAL.top + api.constants.GOAL.bottom) / 2;
  api.state.ball.vx = 180;
  api.state.ball.vy = 0;
  api.update(1 / 120);
})()`);
assert.deepEqual(await evaluate('window.__copaBotao.state.score'), [1, 0], 'o gol deve atualizar o placar no navegador');
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'paused', 'a comemoração deve pausar a partida');
assert.notEqual(
  await evaluate("getComputedStyle(document.querySelector('#goalOverlay')).display"),
  'none',
  'a imagem de gol deve cobrir a tela durante a comemoração',
);
assert.ok(
  (await evaluate('window.__playedAudio')).filter((path) => path === '/assets/apito.mp3').length >= 2,
  'um novo apito deve tocar após o gol',
);
const goalScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(
  mobile ? '/tmp/copa-botao-goal-mobile.png' : '/tmp/copa-botao-goal.png',
  Buffer.from(goalScreenshot.data, 'base64'),
);
await evaluate('window.__copaBotao.completeGoalCelebration()');
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'ready', 'a partida deve continuar após a imagem desaparecer');
assert.equal(
  await evaluate("getComputedStyle(document.querySelector('#goalOverlay')).display"),
  'none',
  'a comemoração deve sair da tela antes de devolver o controle',
);

const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(mobile ? '/tmp/copa-botao-game-mobile.png' : '/tmp/copa-botao-game.png', Buffer.from(screenshot.data, 'base64'));

await evaluate(`(() => {
  const api = window.__copaBotao;
  api.state.players.forEach((player) => { player.vx = 0; player.vy = 0; });
  api.state.score = [2, 0];
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.pendingOutcome = null;
  api.state.foul = false;
  api.state.ball.x = api.constants.GOAL_LINE.right + api.state.ball.radius - 0.5;
  api.state.ball.y = (api.constants.GOAL.top + api.constants.GOAL.bottom) / 2;
  api.state.ball.vx = 180;
  api.state.ball.vy = 0;
  api.update(1 / 120);
  api.completeGoalCelebration();
})()`);
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'finished', 'o terceiro gol deve finalizar a partida');
assert.equal(
  (await evaluate('window.__playedAudio')).at(-1),
  '/assets/final.mp3',
  'o encerramento da partida deve tocar final.mp3',
);
assert.equal(
  await evaluate("document.querySelector('#crowdAudio').paused"),
  true,
  'a torcida ambiente deve parar antes do som final',
);
await evaluate("document.querySelector('#newMatchButton').click()");
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'menu', 'voltar ao início deve restaurar a tela inicial');
assert.equal(
  await evaluate("document.querySelector('#menuBackgroundAudio').paused"),
  false,
  'voltar ao início deve reiniciar sound_background.mp3',
);
socket.close();

console.log('OK — carregamento, início e lance real no canvas passaram.');
