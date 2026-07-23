'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');

const port = 43173;
const server = spawn(process.execPath, ['server.js'], {
  cwd: require('node:path').resolve(__dirname, '..'),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', COIN_TOSS_MS: '40' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Servidor não iniciou')), 5000);
    server.once('exit', (code) => reject(new Error(`Servidor encerrou com código ${code}`)));
    server.stdout.on('data', (data) => {
      if (data.toString().includes('Copa de Botão online')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function createClient() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  });
  return {
    socket,
    messages,
    open: () => new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    }),
    send: (payload) => socket.send(JSON.stringify(payload)),
    waitFor(predicate, timeout = 5000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error('Mensagem WebSocket não recebida'));
          }, timeout),
        };
        waiters.push(waiter);
      });
    },
  };
}

(async () => {
  let playerOne;
  let playerTwo;
  try {
    await waitForServer();
    playerOne = createClient();
    playerTwo = createClient();
    await Promise.all([playerOne.open(), playerTwo.open()]);

    playerOne.send({ type: 'create-room' });
    const joinedOne = await playerOne.waitFor((message) => message.type === 'room-joined');
    assert.equal(joinedOne.side, 0, 'quem cria a sala deve ser o Jogador 1');
    assert.match(joinedOne.roomCode, /^[A-Z2-9]{5}$/, 'a sala deve ter um código compartilhável');

    playerTwo.send({ type: 'join-room', roomCode: joinedOne.roomCode });
    const joinedTwo = await playerTwo.waitFor((message) => message.type === 'room-joined');
    assert.equal(joinedTwo.side, 1, 'quem entra na sala deve ser o Jogador 2');
    await playerOne.waitFor((message) =>
      message.type === 'room-state' && message.room.connected.every(Boolean),
    );

    playerOne.send({ type: 'confirm-team', choice: 0 });
    playerTwo.send({ type: 'confirm-team', choice: 0 });
    const toss = await playerOne.waitFor((message) => message.type === 'coin-toss');
    assert.ok([0, 1].includes(toss.winner), 'o servidor deve sortear a saída');

    const [startOne, startTwo] = await Promise.all([
      playerOne.waitFor((message) => message.type === 'match-start'),
      playerTwo.waitFor((message) => message.type === 'match-start'),
    ]);
    assert.deepEqual(startOne.state.teamChoices, [0, 0], 'times iguais devem ser sincronizados');
    assert.deepEqual(startOne.state, startTwo.state, 'os dois jogadores devem receber o mesmo estado inicial');

    const wrongClient = toss.winner === 0 ? playerTwo : playerOne;
    wrongClient.send({ type: 'shot', bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 80 });
    const rejected = await wrongClient.waitFor((message) => message.type === 'error' && message.code === 'INVALID_SHOT');
    assert.equal(rejected.message, 'Não é a sua vez.', 'o servidor deve rejeitar ações do adversário');

    const activeClient = toss.winner === 0 ? playerOne : playerTwo;
    activeClient.send({ type: 'shot', bodyType: 'player', number: 10, dx: 100, dy: 0, drag: 80 });
    const moving = await playerOne.waitFor((message) =>
      message.type === 'game-update' && message.state.phase === 'moving',
    );
    assert.equal(moving.state.shots, 1, 'a jogada aceita deve ser computada uma única vez');

    console.log('OK — duas conexões, sala, times, sorteio e jogada online passaram.');
  } finally {
    playerOne?.socket.close();
    playerTwo?.socket.close();
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
