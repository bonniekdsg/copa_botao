'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const { ServerGame } = require('./server-game');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const COIN_TOSS_MS = Number(process.env.COIN_TOSS_MS) || 3500;
const ROOT = __dirname;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveFile(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const relative = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
  const filePath = path.resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end('Acesso negado');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Arquivo não encontrado');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': mimeTypes[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' || extension === '.js' || extension === '.css'
        ? 'no-cache'
        : 'public, max-age=86400',
      'accept-ranges': 'bytes',
    };
    const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= stat.size) {
        response.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        ...headers,
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { ...headers, 'content-length': stat.size });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer(serveFile);
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (requestUrl.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch (_) {
      socket.destroy();
      return;
    }
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit('connection', webSocket, request);
  });
});

function createRoomCode() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < 5; index += 1) {
      code += ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala.');
}

function createSlot(side, socket, token = crypto.randomUUID()) {
  return {
    side,
    token,
    socket,
    connected: true,
    choice: side,
    confirmed: false,
    reconnectTimer: null,
    rematch: false,
  };
}

function roomPayload(room) {
  return {
    code: room.code,
    phase: room.phase,
    teamChoices: room.players.map((slot, side) => slot?.choice ?? side),
    teamConfirmed: room.players.map((slot) => Boolean(slot?.confirmed)),
    connected: room.players.map((slot) => Boolean(slot?.connected)),
    rematch: room.players.map((slot) => Boolean(slot?.rematch)),
    starter: room.starter,
  };
}

function send(socket, payload) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  for (const slot of room.players) {
    if (slot?.connected) send(slot.socket, payload);
  }
}

function broadcastRoom(room) {
  broadcast(room, { type: 'room-state', room: roomPayload(room) });
}

function attachSocket(socket, room, slot) {
  if (slot.reconnectTimer) clearTimeout(slot.reconnectTimer);
  if (slot.socket && slot.socket !== socket && slot.socket.readyState === WebSocket.OPEN) {
    slot.socket.close(4001, 'Sessão aberta em outro navegador');
  }
  slot.socket = socket;
  slot.connected = true;
  socket.roomCode = room.code;
  socket.side = slot.side;
  socket.playerToken = slot.token;
  send(socket, {
    type: 'room-joined',
    roomCode: room.code,
    side: slot.side,
    token: slot.token,
    room: roomPayload(room),
    game: room.game?.snapshot() || null,
  });
  broadcastRoom(room);
}

function beginTeamSelection(room) {
  if (!room.players.every((slot) => slot?.connected)) return;
  if (room.phase === 'waiting') room.phase = 'team-selection';
  broadcastRoom(room);
}

function beginCoinToss(room) {
  if (room.coinTimer) clearTimeout(room.coinTimer);
  room.phase = 'coin-toss';
  room.starter = crypto.randomInt(2);
  broadcast(room, {
    type: 'coin-toss',
    winner: room.starter,
    room: roomPayload(room),
  });
  room.coinTimer = setTimeout(() => {
    room.game = new ServerGame({
      starter: room.starter,
      teamChoices: room.players.map((slot) => slot.choice),
    });
    room.phase = 'playing';
    room.tickCounter = 0;
    broadcast(room, {
      type: 'match-start',
      sideAssignments: [0, 1],
      state: room.game.snapshot(),
      room: roomPayload(room),
    });
  }, COIN_TOSS_MS);
}

function leaveCurrentRoom(socket, immediate = false) {
  const room = rooms.get(socket.roomCode);
  const slot = room?.players[socket.side];
  if (!room || !slot || slot.token !== socket.playerToken) return;
  slot.connected = false;
  slot.socket = null;
  broadcast(room, { type: 'player-status', side: slot.side, connected: false });
  broadcastRoom(room);

  const remove = () => {
    if (slot.connected) return;
    room.players[slot.side] = null;
    if (room.players.every((player) => !player)) {
      if (room.coinTimer) clearTimeout(room.coinTimer);
      rooms.delete(room.code);
    } else {
      room.phase = room.game ? 'interrupted' : 'waiting';
      broadcast(room, {
        type: 'opponent-left',
        side: slot.side,
        message: `Jogador ${slot.side + 1} saiu da sala.`,
      });
      broadcastRoom(room);
    }
  };

  if (immediate) remove();
  else slot.reconnectTimer = setTimeout(remove, 45_000);
}

function parseMessage(raw) {
  try {
    const message = JSON.parse(raw.toString());
    return message && typeof message.type === 'string' ? message : null;
  } catch (_) {
    return null;
  }
}

function handleCreateRoom(socket) {
  if (socket.roomCode) leaveCurrentRoom(socket, true);
  const code = createRoomCode();
  const slot = createSlot(0, socket);
  const room = {
    code,
    phase: 'waiting',
    players: [slot, null],
    starter: 0,
    game: null,
    coinTimer: null,
    tickCounter: 0,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  attachSocket(socket, room, slot);
}

function handleJoinRoom(socket, message) {
  const code = String(message.roomCode || '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    send(socket, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
    return;
  }

  const reconnectSlot = room.players.find((slot) => slot && message.token && slot.token === message.token);
  if (reconnectSlot) {
    attachSocket(socket, room, reconnectSlot);
    if (room.game) {
      send(socket, { type: 'game-update', state: room.game.snapshot(), events: [] });
    }
    return;
  }

  if (room.players[1]) {
    send(socket, { type: 'error', code: 'ROOM_FULL', message: 'Esta sala já possui dois jogadores.' });
    return;
  }
  const slot = createSlot(1, socket);
  room.players[1] = slot;
  attachSocket(socket, room, slot);
  beginTeamSelection(room);
}

function handleRoomMessage(socket, message) {
  const room = rooms.get(socket.roomCode);
  const slot = room?.players[socket.side];
  if (!room || !slot || slot.token !== socket.playerToken) {
    send(socket, { type: 'error', message: 'Entre em uma sala antes de continuar.' });
    return;
  }

  if (message.type === 'choose-team') {
    if (room.phase !== 'team-selection' || slot.confirmed) return;
    const choice = Number(message.choice);
    if (![0, 1].includes(choice)) return;
    slot.choice = choice;
    broadcastRoom(room);
    return;
  }

  if (message.type === 'confirm-team') {
    if (room.phase !== 'team-selection') return;
    const choice = Number(message.choice);
    if (![0, 1].includes(choice)) return;
    slot.choice = choice;
    slot.confirmed = true;
    broadcastRoom(room);
    if (room.players.every((player) => player?.confirmed)) beginCoinToss(room);
    return;
  }

  if (message.type === 'shot') {
    if (room.phase !== 'playing' || !room.game) return;
    const result = room.game.shoot(slot.side, message);
    if (!result.ok) {
      send(socket, { type: 'error', code: 'INVALID_SHOT', message: result.error });
      return;
    }
    broadcast(room, {
      type: 'game-update',
      state: room.game.snapshot(),
      events: room.game.drainEvents(),
    });
    return;
  }

  if (message.type === 'request-rematch') {
    if (room.phase !== 'finished' && room.game?.state.phase !== 'finished') return;
    slot.rematch = true;
    broadcastRoom(room);
    if (room.players.every((player) => player?.connected && player.rematch)) {
      for (const player of room.players) {
        player.confirmed = true;
        player.rematch = false;
      }
      beginCoinToss(room);
    }
    return;
  }

  if (message.type === 'leave-room') {
    leaveCurrentRoom(socket, true);
    socket.roomCode = null;
    socket.side = null;
    socket.playerToken = null;
    send(socket, { type: 'left-room' });
  }
}

webSocketServer.on('connection', (socket) => {
  socket.isAlive = true;
  socket.messageWindowStartedAt = Date.now();
  socket.messageCount = 0;
  socket.on('pong', () => { socket.isAlive = true; });
  send(socket, { type: 'connected' });
  socket.on('message', (raw) => {
    const now = Date.now();
    if (now - socket.messageWindowStartedAt >= 1000) {
      socket.messageWindowStartedAt = now;
      socket.messageCount = 0;
    }
    socket.messageCount += 1;
    if (socket.messageCount > 60) {
      socket.close(1008, 'Muitas mensagens');
      return;
    }
    const message = parseMessage(raw);
    if (!message) {
      send(socket, { type: 'error', message: 'Mensagem inválida.' });
      return;
    }
    if (message.type === 'create-room') handleCreateRoom(socket);
    else if (message.type === 'join-room') handleJoinRoom(socket, message);
    else handleRoomMessage(socket, message);
  });
  socket.on('close', () => leaveCurrentRoom(socket));
});

const simulationTimer = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.game || !['playing', 'finished'].includes(room.phase)) continue;
    const beforePhase = room.game.state.phase;
    room.game.update(1 / 120, now);
    const events = room.game.drainEvents();
    const afterPhase = room.game.state.phase;
    room.tickCounter += 1;
    const shouldBroadcast =
      events.length > 0 ||
      beforePhase !== afterPhase ||
      (afterPhase === 'moving' && room.tickCounter % 4 === 0);
    if (afterPhase === 'finished') room.phase = 'finished';
    if (shouldBroadcast) {
      broadcast(room, {
        type: 'game-update',
        state: room.game.snapshot(),
        events,
      });
      if (afterPhase === 'finished') broadcastRoom(room);
    }
  }
}, 1000 / 120);
simulationTimer.unref();

const heartbeatTimer = setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 25_000);
heartbeatTimer.unref();

server.listen(PORT, HOST, () => {
  console.log(`Copa de Botão online em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

function shutdown() {
  clearInterval(simulationTimer);
  clearInterval(heartbeatTimer);
  for (const room of rooms.values()) if (room.coinTimer) clearTimeout(room.coinTimer);
  webSocketServer.close(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server, rooms };
