import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

const debugBase = 'http://127.0.0.1:9222';
const gameUrl = 'http://127.0.0.1:4173';

async function createTarget() {
  const response = await fetch(`${debugBase}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  assert.equal(response.ok, true, 'não foi possível criar uma aba de teste');
  return response.json();
}

function connectTarget(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  const open = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    socket,
    open,
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const commandId = ++id;
        pending.set(commandId, { resolve, reject });
        socket.send(JSON.stringify({ id: commandId, method, params }));
      });
    },
    async evaluate(expression) {
      const result = await this.command('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    async waitFor(expression, timeout = 8000) {
      return this.evaluate(`new Promise((resolve, reject) => {
        const deadline = performance.now() + ${timeout};
        const check = () => {
          let value = false;
          try { value = Boolean(${expression}); } catch (_) {}
          if (value) resolve(true);
          else if (performance.now() >= deadline) reject(new Error('Tempo esgotado: ${expression.replaceAll("'", "\\'")}'));
          else setTimeout(check, 35);
        };
        check();
      })`);
    },
  };
}

const targets = [await createTarget(), await createTarget()];
const players = targets.map(connectTarget);

try {
  await Promise.all(players.map((player) => player.open));
  for (const player of players) {
    await player.command('Page.enable');
    await player.command('Runtime.enable');
    await player.command('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await player.command('Page.navigate', { url: gameUrl });
    await player.waitFor("document.readyState === 'complete' && Boolean(window.__copaBotao)");
  }

  await players[0].evaluate("document.querySelector('#startButton').click()");
  await players[0].waitFor("document.querySelector('#onlineLobbyOverlay').hidden === false");
  await players[0].evaluate("document.querySelector('#createRoomButton').click()");
  await players[0].waitFor('Boolean(window.__copaBotao.online.roomCode)');
  const roomCode = await players[0].evaluate('window.__copaBotao.online.roomCode');
  assert.match(roomCode, /^[A-Z2-9]{5}$/, 'o navegador deve receber o código da sala');
  const waitingScreenshot = await players[0].command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/copa-botao-online-waiting.png', Buffer.from(waitingScreenshot.data, 'base64'));

  await players[1].evaluate("document.querySelector('#startButton').click()");
  await players[1].waitFor("document.querySelector('#onlineLobbyOverlay').hidden === false");
  await players[1].evaluate(`(() => {
    const input = document.querySelector('#roomCodeInput');
    input.value = ${JSON.stringify(roomCode)};
    document.querySelector('#joinRoomForm').requestSubmit();
  })()`);

  await Promise.all(players.map((player) => player.waitFor("window.__copaBotao.state.phase === 'team-selection'")));
  const selectionScreenshot = await players[0].command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/copa-botao-online-selection.png', Buffer.from(selectionScreenshot.data, 'base64'));
  assert.equal(await players[0].evaluate('window.__copaBotao.online.side'), 0, 'o criador deve controlar o lado 1');
  assert.equal(await players[1].evaluate('window.__copaBotao.online.side'), 1, 'o convidado deve controlar o lado 2');

  await players[1].evaluate(`document.querySelector('input[name="teamChoice1"][value="0"]').click()`);
  await players[0].evaluate("document.querySelector('#confirmPlayer0Button').click()");
  await players[1].evaluate("document.querySelector('#confirmPlayer1Button').click()");
  await Promise.all(players.map((player) => player.waitFor("window.__copaBotao.state.phase === 'coin-toss'", 3000)));
  await Promise.all(players.map((player) => player.waitFor("window.__copaBotao.state.phase === 'ready'", 7000)));

  const initialStates = await Promise.all(players.map((player) => player.evaluate(`(() => {
    const state = window.__copaBotao.state;
    return {
      teamChoices: state.teamChoices,
      score: state.score,
      activeTeam: state.activeTeam,
      players: state.players.map(({ team, number, x, y }) => ({ team, number, x, y })),
      ball: { x: state.ball.x, y: state.ball.y },
    };
  })()`)));
  assert.deepEqual(initialStates[0], initialStates[1], 'as duas telas devem iniciar com o mesmo estado');
  assert.deepEqual(initialStates[0].teamChoices, [0, 0], 'o online deve aceitar o mesmo time');
  const matchScreenshot = await players[0].command('Page.captureScreenshot', { format: 'png' });
  await writeFile('/tmp/copa-botao-online-match.png', Buffer.from(matchScreenshot.data, 'base64'));

  const activeSide = initialStates[0].activeTeam;
  const activePlayer = players[activeSide];
  const shot = await activePlayer.evaluate(`(() => {
    const api = window.__copaBotao;
    const player = api.state.players.find((item) => item.team === api.state.activeTeam && item.number === 10);
    const rect = document.querySelector('#gameCanvas').getBoundingClientRect();
    return {
      point: {
        x: rect.left + (player.x / api.constants.WIDTH) * rect.width,
        y: rect.top + (player.y / api.constants.HEIGHT) * rect.height,
      },
      pull: {
        x: rect.left + ((player.x - 75) / api.constants.WIDTH) * rect.width,
        y: rect.top + (player.y / api.constants.HEIGHT) * rect.height,
      },
    };
  })()`);
  await activePlayer.command('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...shot.point,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await activePlayer.command('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    ...shot.pull,
    button: 'left',
    buttons: 1,
  });
  await activePlayer.command('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...shot.pull,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });

  await Promise.all(players.map((player) => player.waitFor('window.__copaBotao.state.shots === 1')));
  await Promise.all(players.map((player) => player.waitFor("window.__copaBotao.state.phase === 'ready'", 7000)));
  const settledStates = await Promise.all(players.map((player) => player.evaluate(`(() => {
    const state = window.__copaBotao.state;
    return {
      score: state.score,
      activeTeam: state.activeTeam,
      shots: state.shots,
      players: state.players.map(({ team, number, x, y }) => ({ team, number, x, y })),
      ball: { x: state.ball.x, y: state.ball.y },
    };
  })()`)));
  assert.deepEqual(settledStates[0], settledStates[1], 'o lance autoritativo deve terminar igual nas duas telas');

  await players[1].evaluate('window.__copaBotao.online.socket.close()');
  await players[1].waitFor("document.querySelector('#networkBadge').classList.contains('reconnecting')");
  await players[1].waitFor(
    "window.__copaBotao.online.socket?.readyState === WebSocket.OPEN && !document.querySelector('#networkBadge').classList.contains('reconnecting')",
    8000,
  );
  assert.equal(
    await players[1].evaluate('window.__copaBotao.online.roomCode'),
    roomCode,
    'a reconexão deve recuperar a mesma sala',
  );

  console.log('OK — duas abas concluíram sala, times, sorteio, lance sincronizado e reconexão.');
} finally {
  for (const player of players) player.socket.close();
  await Promise.all(targets.map((target) =>
    fetch(`${debugBase}/json/close/${target.id}`, { method: 'PUT' }).catch(() => null),
  ));
}
