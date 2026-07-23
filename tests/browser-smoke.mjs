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
await evaluate(`(() => {
  const api = window.__copaBotao;
  api.clearBannerQueue();
  api.showBanner('Falta simples', 'neutral', 10000, {
    dismissible: true,
    actionLabel: 'Fechar',
  });
  api.showBanner('Cartão amarelo', 'yellow', 10000, {
    dismissible: true,
    actionLabel: 'Continuar',
  });
})()`);
assert.equal(
  await evaluate(`document.querySelector('#eventBannerText').textContent`),
  'Falta simples',
  'a primeira notificação deve permanecer visível',
);
assert.equal(
  await evaluate(`window.__copaBotao.state.bannerQueue.length`),
  1,
  'a notificação seguinte deve aguardar na fila',
);
assert.equal(
  await evaluate(`document.querySelector('#eventBannerClose').textContent`),
  'Fechar',
  'ocorrências comuns devem oferecer fechamento antecipado',
);
await evaluate(`document.querySelector('#eventBannerClose').click()`);
await evaluate(`new Promise((resolve) => setTimeout(resolve, 280))`);
assert.equal(
  await evaluate(`document.querySelector('#eventBannerText').textContent`),
  'Cartão amarelo',
  'a segunda notificação deve aparecer após fechar a primeira',
);
assert.equal(
  await evaluate(`document.querySelector('#eventBannerClose').textContent`),
  'Continuar',
  'cartões devem oferecer a ação Continuar',
);
await evaluate(`window.__copaBotao.clearBannerQueue()`);
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
assert.deepEqual(
  await evaluate("[...document.querySelectorAll('.coin-face img')].map((image) => new URL(image.src).pathname)"),
  ['/assets/moeda1.webp', '/assets/moeda2.webp'],
  'o sorteio deve usar as faces numeradas dos jogadores 1 e 2',
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

const cancelledGoal = await evaluate(`(() => {
  const api = window.__copaBotao;
  api.clearBannerQueue();
  const offender = api.state.players.find(
    (player) => player.team === api.state.activeTeam && player.number === 6,
  );
  const scoreBefore = [...api.state.score];
  api.state.launchPlayer = offender;
  api.state.foul = true;
  api.state.foulImpactSpeed = api.constants.CARD_THRESHOLD.yellow + 1;
  api.state.pendingOutcome = { type: 'goal', team: api.state.activeTeam };
  api.state.phase = 'moving';
  api.evaluatePlay();
  return {
    scoreBefore,
    scoreAfter: [...api.state.score],
    offenderTeam: offender.team,
    yellow: offender.discipline.yellow,
    message: document.querySelector('#eventBannerText').textContent,
  };
})()`);
assert.deepEqual(cancelledGoal.scoreAfter, cancelledGoal.scoreBefore, 'o gol provocado depois de uma falta deve ser anulado');
assert.equal(cancelledGoal.yellow, 1, 'a colisão média que anulou o gol deve gerar cartão amarelo');
assert.ok(cancelledGoal.message.startsWith('Gol anulado · Cartão amarelo'), 'o aviso deve explicar o gol anulado e o cartão');
await evaluate(`(() => {
  const api = window.__copaBotao;
  api.closeCurrentBanner();
  const team = ${cancelledGoal.offenderTeam};
  api.state.discipline[team][6].yellow = 0;
  api.state.discipline[team][6].fouls = 0;
  api.state.teamFouls[team] = 0;
  api.state.teamFoulStreak[team] = 0;
})()`);

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
  for (const player of api.state.players) {
    if (player.team !== api.state.activeTeam && Math.abs(player.y - api.state.ball.y) < 100) {
      player.y += 180;
    }
  }
  api.state.phase = 'ready';
})()`);

const rect = await evaluate(`(() => {
  const rect = document.querySelector('#gameCanvas').getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
})()`);
const playerPosition = await evaluate(`(() => {
  const api = window.__copaBotao;
  const player = api.state.players.find((item) => item.team === api.state.activeTeam && item.number === 10);
  return { x: player.x, y: player.y, ballX: api.state.ball.x, ballY: api.state.ball.y };
})()`);
const start = {
  x: rect.left + (playerPosition.x / 1448) * rect.width,
  y: rect.top + (playerPosition.y / 1086) * rect.height,
};
const ballDirection = {
  x: playerPosition.ballX - playerPosition.x,
  y: playerPosition.ballY - playerPosition.y,
};
const ballDirectionLength = Math.hypot(ballDirection.x, ballDirection.y);
const pull = {
  x: start.x - (ballDirection.x / ballDirectionLength) * 80,
  y: start.y - (ballDirection.y / ballDirectionLength) * 80,
};

assert.equal(
  await evaluate(`document.elementFromPoint(${start.x}, ${start.y})?.id`),
  'gameCanvas',
  'a coordenada do jogador deve apontar para o canvas',
);
await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...start, button: 'left', buttons: 0, clickCount: 1 });
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'ready', 'um toque curto no atacante deve preparar a escolha da curva');
assert.equal(await evaluate('window.__copaBotao.state.selected?.number'), 10, 'o atacante tocado deve permanecer selecionado');
assert.equal(await evaluate("document.querySelector('#curveControl').hidden"), false, 'os controles de curva devem aparecer para o atacante 10');
await evaluate(`document.querySelector('[data-curve="1"]').click()`);
assert.equal(await evaluate('window.__copaBotao.state.aimCurve'), 1, 'o usuário deve conseguir escolher curva à direita');
assert.equal(
  await evaluate(`document.querySelector('[data-curve="1"]').classList.contains('is-active')`),
  true,
  'o tipo de curva escolhido deve ficar destacado',
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
assert.ok(
  await evaluate(`(() => {
    const api = window.__copaBotao;
    const player = api.state.selected;
    const dx = player.x - api.state.dragPoint.x;
    const dy = player.y - api.state.dragPoint.y;
    const drag = Math.hypot(dx, dy);
    return api.predictCurvedBallPath(player, dx / drag, dy / drag, drag, api.state.aimCurve).length > 1;
  })()`),
  'a mira deve gerar um tracejado usando a previsão física da bola',
);
const curveScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
await writeFile(
  mobile ? '/tmp/copa-botao-curve-mobile.png' : '/tmp/copa-botao-curve.png',
  Buffer.from(curveScreenshot.data, 'base64'),
);
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...pull, button: 'left', buttons: 0, clickCount: 1 });
await new Promise((resolve) => setTimeout(resolve, 150));

assert.equal(await evaluate('window.__copaBotao.state.shots'), 1, 'arrastar e soltar deve registrar um lance');
assert.equal(await evaluate('window.__copaBotao.state.shotCurve'), 1, 'o lance deve preservar a curva escolhida durante o movimento');
await evaluate(`new Promise((resolve) => {
  const api = window.__copaBotao;
  const deadline = performance.now() + 1200;
  const check = () => {
    if (api.state.ballCurve === 1 || performance.now() >= deadline) resolve();
    else setTimeout(check, 20);
  };
  check();
})`);
assert.equal(await evaluate('window.__copaBotao.state.ballCurve'), 1, 'o atacante deve transferir a curva escolhida para a bola');
assert.ok(await evaluate('Math.abs(window.__copaBotao.state.ball.vy) > 0.1'), 'a bola deve sair da trajetória reta após o contato');
assert.equal(await evaluate("document.querySelector('#curveControl').hidden"), true, 'os controles de curva devem sumir depois do chute');
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
  const api = window.__copaBotao;
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.launchPlayer = api.state.players.find((player) => player.team === 0);
  api.state.foul = false;
  api.state.pendingOutcome = null;
  api.state.ball.x = 724;
  api.state.ball.y = api.constants.FIELD.top + api.state.ball.radius - 1;
  api.state.ball.vx = 0;
  api.state.ball.vy = -120;
  api.update(1 / 120);
})()`);
assert.equal(await evaluate('window.__copaBotao.state.activeTeam'), 0, 'o rebote não deve trocar a equipe ativa');
assert.ok(
  await evaluate(`(() => {
    const api = window.__copaBotao;
    const limit = api.constants.FIELD.top + api.state.ball.radius;
    return api.state.ball.y >= limit && api.state.ball.y < limit + 12;
  })()`),
  'a bola deve permanecer dentro da lateral superior',
);
assert.ok(await evaluate('window.__copaBotao.state.ball.vy > 0'), 'a bola deve rebater para baixo na lateral superior');
assert.equal(await evaluate('window.__copaBotao.state.phase'), 'moving', 'o rebote deve manter o lance em movimento');

await evaluate(`(() => {
  const api = window.__copaBotao;
  api.state.players.forEach((player) => { player.vx = 0; player.vy = 0; });
  api.state.phase = 'moving';
  api.state.activeTeam = 0;
  api.state.launchPlayer = api.state.players.find((player) => player.team === 0 && player.number === 10);
  api.state.foul = false;
  api.state.pendingOutcome = null;
  api.state.ball.x = api.constants.FIELD.right - api.state.ball.radius + 1;
  api.state.ball.y = 220;
  api.state.ball.vx = 120;
  api.state.ball.vy = 0;
  api.update(1 / 120);
})()`);
assert.ok(
  await evaluate(`(() => {
    const api = window.__copaBotao;
    const limit = api.constants.FIELD.right - api.state.ball.radius;
    return api.state.ball.x <= limit && api.state.ball.x > limit - 12;
  })()`),
  'a bola deve permanecer dentro do fundo direito',
);
assert.ok(await evaluate('window.__copaBotao.state.ball.vx < 0'), 'a bola deve rebater para a esquerda no fundo direito');
assert.equal(await evaluate('window.__copaBotao.state.activeTeam'), 0, 'o rebote no fundo não deve trocar a posse');

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
