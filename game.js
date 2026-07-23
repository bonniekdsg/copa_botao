(() => {
  'use strict';

  const WIDTH = 1448;
  const HEIGHT = 1086;
  const FIELD = { left: 40, right: 1408, top: 29, bottom: 1042 };
  // A abertura acompanha somente as traves desenhadas no asset campo.webp.
  const GOAL = { top: 428, bottom: 615 };
  // Linha frontal das traves, onde a bola efetivamente entra no gol.
  const GOAL_LINE = { left: 87, right: 1361 };
  // Limites das grandes áreas desenhadas no campo.
  const PENALTY_AREA = { top: 226, bottom: 836, leftEnd: 262, rightStart: 1186 };
  const PLAYER_RADIUS = 31;
  const BALL_RADIUS = 18;
  const MAX_DRAG = 205;
  const MAX_SPEED = 1420;
  const BALL_EDGE_RESTITUTION = 0.68;
  const BALL_RESTITUTION = 0.83;
  const BALL_CURVE_RATE = 0.78;
  const BALL_CURVE_MAX_ANGLE = Math.PI * (40 / 180);
  const CURVE_ATTACKERS = [9, 10, 11];
  const CARD_THRESHOLD = { yellow: MAX_SPEED * 0.3, red: MAX_SPEED * 0.7 };
  const STOP_SPEED = 14;
  const FRICTION = { player: 520, ball: 420 };
  const PHYSICS_STEP = 1 / 120;
  const TEAM_OPTIONS = [
    { name: 'Argentina', image: 'assets/argentina.webp', alternateImage: 'assets/argentina2.webp', color: '#6ec6ec' },
    { name: 'Espanha', image: 'assets/espanha.webp', alternateImage: 'assets/espanha2.webp', color: '#f0443d' },
  ];

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    startOverlay: document.querySelector('#startOverlay'),
    onlineLobbyOverlay: document.querySelector('#onlineLobbyOverlay'),
    onlineActions: document.querySelector('#onlineActions'),
    onlineStatus: document.querySelector('#onlineStatus'),
    roomWaiting: document.querySelector('#roomWaiting'),
    roomCodeInput: document.querySelector('#roomCodeInput'),
    roomCodeDisplay: document.querySelector('#roomCodeDisplay'),
    createRoomButton: document.querySelector('#createRoomButton'),
    copyRoomButton: document.querySelector('#copyRoomButton'),
    networkBadge: document.querySelector('#networkBadge'),
    networkBadgeText: document.querySelector('#networkBadgeText'),
    teamSelectOverlay: document.querySelector('#teamSelectOverlay'),
    teamSelectTitle: document.querySelector('#teamSelectTitle'),
    teamSelectDescription: document.querySelector('#teamSelectDescription'),
    coinTossOverlay: document.querySelector('#coinTossOverlay'),
    coinStage: document.querySelector('#coinStage'),
    tossCoin: document.querySelector('#tossCoin'),
    coinStatus: document.querySelector('#coinStatus'),
    resultOverlay: document.querySelector('#resultOverlay'),
    resultTitle: document.querySelector('#resultTitle'),
    resultScore: document.querySelector('#resultScore'),
    eventBanner: document.querySelector('#eventBanner'),
    eventBannerText: document.querySelector('#eventBannerText'),
    eventBannerClose: document.querySelector('#eventBannerClose'),
    goalOverlay: document.querySelector('#goalOverlay'),
    powerMeter: document.querySelector('#powerMeter'),
    powerFill: document.querySelector('#powerFill'),
    powerText: document.querySelector('#powerText'),
    cancelButton: document.querySelector('#cancelButton'),
    curveControl: document.querySelector('#curveControl'),
    curveButtons: [...document.querySelectorAll('[data-curve]')],
    turnStrip: document.querySelector('#turnStrip'),
    turnText: document.querySelector('#turnText'),
    touchText: document.querySelector('#touchText'),
    touchDots: [...document.querySelectorAll('#touchDots i')],
    score: [document.querySelector('#score0'), document.querySelector('#score1')],
    cards: [document.querySelector('#team0Card'), document.querySelector('#team1Card')],
    teamNames: [document.querySelector('#team0Name'), document.querySelector('#team1Name')],
    teamImages: [document.querySelector('#team0Image'), document.querySelector('#team1Image')],
    disciplineLines: [document.querySelector('#disciplineLine0'), document.querySelector('#disciplineLine1')],
    playerTeamPickers: [...document.querySelectorAll('.player-team-picker')],
    playerConfirmButtons: [document.querySelector('#confirmPlayer0Button'), document.querySelector('#confirmPlayer1Button')],
    teamConfirmStatus: document.querySelector('#teamConfirmStatus'),
    yellowCards: [document.querySelector('#yellow0'), document.querySelector('#yellow1')],
    redCards: [document.querySelector('#red0'), document.querySelector('#red1')],
    teamFouls: [document.querySelector('#fouls0'), document.querySelector('#fouls1')],
    shotCount: document.querySelector('#shotCount'),
    hintText: document.querySelector('#hintText'),
    soundButton: document.querySelector('#soundButton'),
    gameStage: document.querySelector('#gameStage'),
    boardWrap: document.querySelector('#boardWrap'),
    audio: {
      kick: document.querySelector('#kickAudio'),
      whistle: document.querySelector('#whistleAudio'),
      crowd: document.querySelector('#crowdAudio'),
      click: document.querySelector('#clickAudio'),
      final: document.querySelector('#finalAudio'),
      menuBackground: document.querySelector('#menuBackgroundAudio'),
    },
  };

  const images = {
    field: loadImage('assets/campo.webp'),
    teams: TEAM_OPTIONS.map((team) => ({
      primary: loadImage(team.image),
      alternate: loadImage(team.alternateImage),
    })),
    ball: loadImage('assets/bola.webp'),
  };

  const state = {
    mode: 'local',
    phase: 'menu',
    players: [],
    ball: null,
    activeTeam: 0,
    startingTeam: 0,
    teamChoices: [0, 1],
    teamConfirmed: [false, false],
    score: [0, 0],
    discipline: createDiscipline(),
    teamFouls: [0, 0],
    teamFoulStreak: [0, 0],
    touchesUsed: 0,
    shots: 0,
    selected: null,
    pointerId: null,
    dragPoint: null,
    aimCurve: 0,
    shotCurve: 0,
    ballCurve: 0,
    ballCurveRemaining: 0,
    ballCurveSource: null,
    launchPlayer: null,
    ballTouched: false,
    firstContact: null,
    foul: false,
    foulImpactSpeed: 0,
    ownBlock: false,
    pendingOutcome: null,
    stillFrames: 0,
    bannerTimer: 0,
    bannerTransitionTimer: 0,
    bannerQueue: [],
    currentBanner: null,
    bannerSequence: 0,
    goalTimer: 0,
    goalEndsMatch: false,
    sounds: true,
    lastTime: performance.now(),
    accumulator: 0,
  };
  let flowTimers = [];
  const online = {
    enabled: false,
    socket: null,
    connecting: null,
    side: null,
    roomCode: null,
    token: null,
    room: null,
    shouldReconnect: false,
    reconnectTimer: 0,
    reconnectAttempts: 0,
  };

  function selectedTeam(side) {
    return TEAM_OPTIONS[state.teamChoices[side] ?? side] ?? TEAM_OPTIONS[side];
  }

  function teamName(side) {
    return selectedTeam(side).name;
  }

  function usesAlternateKit(side) {
    return side === 1 && state.teamChoices[0] === state.teamChoices[1];
  }

  function selectedTeamImagePath(side) {
    const team = selectedTeam(side);
    return usesAlternateKit(side) ? team.alternateImage : team.image;
  }

  function selectedTeamCanvasImage(side) {
    const teamImages = images.teams[state.teamChoices[side]];
    return usesAlternateKit(side) ? teamImages.alternate : teamImages.primary;
  }

  function sideLabel(side) {
    const repeatedTeam = state.teamChoices[0] === state.teamChoices[1];
    return repeatedTeam ? `Jogador ${side + 1} · ${teamName(side)}` : teamName(side);
  }

  function selectTeams(playerOneChoice, playerTwoChoice) {
    const choices = [Number(playerOneChoice), Number(playerTwoChoice)];
    if (choices.some((choice) => !Number.isInteger(choice) || !TEAM_OPTIONS[choice])) return false;
    state.teamChoices = choices;
    updateTeamPresentation();
    return true;
  }

  function updateTeamPresentation() {
    for (const side of [0, 1]) {
      const team = selectedTeam(side);
      ui.teamNames[side].textContent = team.name;
      ui.teamImages[side].src = selectedTeamImagePath(side);
      ui.teamImages[side].alt = '';
      ui.disciplineLines[side].setAttribute('aria-label', `Disciplina de ${team.name}, Jogador ${side + 1}`);
    }
  }

  function clearFlowTimers() {
    flowTimers.forEach((timer) => window.clearTimeout(timer));
    flowTimers = [];
  }

  function setOnlineStatus(text, error = false) {
    ui.onlineStatus.textContent = text;
    ui.onlineStatus.classList.toggle('error', error);
  }

  function setNetworkBadge(status, text) {
    ui.networkBadge.hidden = !status;
    ui.networkBadge.className = `network-badge${status && status !== 'online' ? ` ${status}` : ''}`;
    ui.networkBadgeText.textContent = text || 'Online';
  }

  function websocketUrl() {
    const protocol = window.location?.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  function sendOnline(payload) {
    if (online.socket?.readyState !== window.WebSocket?.OPEN) return false;
    online.socket.send(JSON.stringify(payload));
    return true;
  }

  function saveOnlineSession() {
    try {
      window.sessionStorage.setItem('copaBotaoRoom', online.roomCode || '');
      window.sessionStorage.setItem('copaBotaoToken', online.token || '');
    } catch (_) { /* A reconexão continua opcional quando o armazenamento está bloqueado. */ }
  }

  function clearSavedOnlineSession() {
    try {
      window.sessionStorage.removeItem('copaBotaoRoom');
      window.sessionStorage.removeItem('copaBotaoToken');
    } catch (_) { /* Sem armazenamento, apenas encerra a conexão atual. */ }
  }

  function connectOnline(reconnecting = false) {
    if (!window.WebSocket) {
      setOnlineStatus('Este navegador não oferece suporte a partidas online.', true);
      return Promise.reject(new Error('WebSocket indisponível'));
    }
    if (online.socket?.readyState === window.WebSocket.OPEN) return Promise.resolve(online.socket);
    if (online.connecting) return online.connecting;

    setOnlineStatus(reconnecting ? 'Reconectando à partida…' : 'Conectando ao servidor…');
    online.connecting = new Promise((resolve, reject) => {
      const socket = new window.WebSocket(websocketUrl());
      online.socket = socket;
      socket.addEventListener('open', () => {
        online.connecting = null;
        online.reconnectAttempts = 0;
        dismissBannerByKey('network');
        setNetworkBadge(online.roomCode ? 'online' : null, online.roomCode ? `Sala ${online.roomCode}` : '');
        setOnlineStatus('Servidor conectado.');
        if (reconnecting && online.roomCode && online.token) {
          sendOnline({ type: 'join-room', roomCode: online.roomCode, token: online.token });
        }
        resolve(socket);
      }, { once: true });
      socket.addEventListener('message', handleOnlineMessage);
      socket.addEventListener('close', () => {
        online.connecting = null;
        if (online.shouldReconnect && online.roomCode) scheduleReconnect();
      });
      socket.addEventListener('error', () => {
        setOnlineStatus('Não foi possível conectar ao servidor online.', true);
        if (socket.readyState !== window.WebSocket.OPEN) {
          online.connecting = null;
          reject(new Error('Falha na conexão WebSocket'));
        }
      }, { once: true });
    });
    return online.connecting;
  }

  function scheduleReconnect() {
    window.clearTimeout(online.reconnectTimer);
    online.reconnectAttempts += 1;
    const delay = Math.min(5000, 500 * (2 ** Math.min(online.reconnectAttempts, 4)));
    setNetworkBadge('reconnecting', 'Reconectando…');
    showBanner('Conexão perdida · tentando reconectar', 'yellow', 0, {
      key: 'network',
      dismissible: false,
    });
    online.reconnectTimer = window.setTimeout(() => {
      connectOnline(true).catch(() => scheduleReconnect());
    }, delay);
  }

  function closeOnlineConnection({ leave = true, clear = true } = {}) {
    online.shouldReconnect = false;
    window.clearTimeout(online.reconnectTimer);
    if (leave) sendOnline({ type: 'leave-room' });
    online.socket?.close?.();
    online.socket = null;
    online.connecting = null;
    online.enabled = false;
    online.side = null;
    online.roomCode = null;
    online.token = null;
    online.room = null;
    state.mode = 'local';
    setNetworkBadge(null);
    if (clear) clearSavedOnlineSession();
  }

  function showOnlineLobby(prefilledCode = '') {
    clearFlowTimers();
    stopMenuBackground();
    state.phase = 'online-lobby';
    document.body.classList.remove('game-active');
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = false;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = true;
    ui.resultOverlay.hidden = true;
    ui.onlineActions.hidden = false;
    ui.roomWaiting.hidden = true;
    ui.roomCodeInput.value = prefilledCode;
    setOnlineStatus('Conecte-se para criar ou entrar em uma sala.');
    connectOnline().catch(() => {});
    fitGameToViewport();
  }

  function showWaitingRoom() {
    state.phase = 'online-waiting';
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = false;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = true;
    ui.onlineActions.hidden = true;
    ui.roomWaiting.hidden = false;
    ui.roomCodeDisplay.textContent = online.roomCode;
    setOnlineStatus('Envie o código ou o link ao segundo jogador.');
  }

  function applyOnlineRoom(room) {
    if (!room) return;
    online.room = room;
    state.teamChoices = [...room.teamChoices];
    state.teamConfirmed = [...room.teamConfirmed];
    updateTeamPresentation();
    if (room.connected?.every(Boolean) && online.roomCode) {
      setNetworkBadge('online', `Sala ${online.roomCode} · Jogador ${online.side + 1}`);
    }

    if (room.phase === 'waiting') {
      showWaitingRoom();
      return;
    }
    if (room.phase === 'team-selection') showOnlineTeamSelection();
    if (room.phase === 'finished') {
      ui.teamConfirmStatus.textContent = room.rematch[online.side]
        ? 'Revanche solicitada. Aguardando o adversário…'
        : 'A partida terminou.';
    }
  }

  function showOnlineTeamSelection() {
    state.mode = 'online';
    online.enabled = true;
    state.phase = 'team-selection';
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = false;
    ui.coinTossOverlay.hidden = true;
    ui.resultOverlay.hidden = true;
    ui.teamSelectTitle.textContent = `Você é o Jogador ${online.side + 1}`;
    ui.teamSelectDescription.textContent = 'Escolha o seu time. O adversário confirma a escolha no outro computador.';

    for (const side of [0, 1]) {
      const isOwnSide = side === online.side;
      const confirmed = Boolean(state.teamConfirmed[side]);
      document.querySelectorAll(`input[name="teamChoice${side}"]`).forEach((input) => {
        input.checked = Number(input.value) === state.teamChoices[side];
        input.disabled = !isOwnSide || confirmed;
      });
      ui.playerTeamPickers[side].classList.toggle('is-remote', !isOwnSide);
      ui.playerTeamPickers[side].classList.toggle('is-confirmed', confirmed);
      ui.playerConfirmButtons[side].disabled = !isOwnSide || confirmed;
      ui.playerConfirmButtons[side].textContent = confirmed
        ? 'Confirmado ✓'
        : isOwnSide
          ? `Confirmar Jogador ${side + 1}`
          : 'Aguardando adversário';
    }
    const confirmedCount = state.teamConfirmed.filter(Boolean).length;
    ui.teamConfirmStatus.textContent = confirmedCount === 2
      ? 'Times confirmados. Preparando o sorteio…'
      : state.teamConfirmed[online.side]
        ? 'Sua escolha foi confirmada. Aguardando o adversário…'
        : 'Escolha e confirme o seu time.';
    fitGameToViewport();
  }

  function applyServerState(snapshot) {
    if (!snapshot) return;
    state.teamChoices = [...snapshot.teamChoices];
    state.score = [...snapshot.score];
    state.discipline = snapshot.discipline.map((team) => team.map((record) => ({ ...record })));
    state.teamFouls = [...snapshot.teamFouls];
    state.touchesUsed = snapshot.touchesUsed;
    state.shots = snapshot.shots;
    state.activeTeam = snapshot.activeTeam;
    state.startingTeam = snapshot.startingTeam;
    state.players = snapshot.players.map((player) => ({
      ...player,
      discipline: state.discipline[player.team][player.number],
    }));
    state.ball = { ...snapshot.ball };
    state.phase = snapshot.phase;
    if (snapshot.phase !== 'ready') clearAim();
    canvas.classList.toggle('locked', snapshot.phase === 'moving');
    updateTeamPresentation();
    updateUI();
    draw();
  }

  function startOnlineMatch(snapshot, reconnecting = false) {
    clearBannerQueue();
    online.enabled = true;
    state.mode = 'online';
    document.body.classList.add('game-active');
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = true;
    ui.resultOverlay.hidden = true;
    hideGoalCelebration();
    stopMenuBackground();
    startCrowdAmbient(!reconnecting);
    if (!reconnecting) playSound('whistle');
    applyServerState(snapshot);
    setNetworkBadge('online', `Sala ${online.roomCode} · Jogador ${online.side + 1}`);
    fitGameToViewport();
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function showOnlineResult(event) {
    hideGoalCelebration();
    stopCrowdAmbient();
    playSound('final');
    state.phase = 'finished';
    ui.resultTitle.textContent = event.title;
    ui.resultScore.textContent = event.score;
    ui.resultOverlay.hidden = false;
    updateUI();
  }

  function processServerEvents(events = []) {
    for (const event of events) {
      if (event.type === 'sound') {
        playSound(event.sound);
      } else if (event.type === 'goal') {
        playSound('whistle');
        showBanner(event.text, 'goal', 2800);
        showGoalCelebration();
      } else if (event.type === 'goal-complete') {
        hideGoalCelebration();
      } else if (event.type === 'discipline') {
        playSound(event.decisionType === 'yellow' ? 'yellowCard' : event.decisionType === 'red' ? 'redCard' : 'foul');
        const isCard = event.decisionType === 'yellow' || event.decisionType === 'red';
        showBanner(
          event.text,
          event.decisionType === 'yellow' ? 'yellow' : event.decisionType === 'red' ? 'danger' : 'neutral',
          isCard ? 5000 : 3500,
          {
            dismissible: true,
            actionLabel: isCard ? 'Continuar' : 'Fechar',
          },
        );
      } else if (event.type === 'banner') {
        showBanner(event.text, event.kind, event.duration);
      } else if (event.type === 'match-finished') {
        showOnlineResult(event);
      }
    }
  }

  function handleOnlineMessage(messageEvent) {
    let message;
    try {
      message = JSON.parse(messageEvent.data);
    } catch (_) {
      return;
    }
    if (message.type === 'room-joined') {
      online.enabled = true;
      online.shouldReconnect = true;
      online.side = message.side;
      online.roomCode = message.roomCode;
      online.token = message.token;
      state.mode = 'online';
      saveOnlineSession();
      applyOnlineRoom(message.room);
      setNetworkBadge('online', `Sala ${online.roomCode} · Jogador ${online.side + 1}`);
      if (message.game) startOnlineMatch(message.game, true);
    } else if (message.type === 'room-state') {
      applyOnlineRoom(message.room);
    } else if (message.type === 'coin-toss') {
      applyOnlineRoom(message.room);
      beginCoinToss(message.winner, true);
    } else if (message.type === 'match-start') {
      applyOnlineRoom(message.room);
      startOnlineMatch(message.state);
    } else if (message.type === 'game-update') {
      applyServerState(message.state);
      processServerEvents(message.events);
    } else if (message.type === 'player-status') {
      if (!message.connected && message.side !== online.side) {
        setNetworkBadge('reconnecting', 'Adversário reconectando…');
        showBanner('Adversário desconectado · aguardando retorno', 'yellow', 0, {
          key: 'opponent-network',
          dismissible: false,
        });
      } else if (message.connected) {
        dismissBannerByKey('opponent-network');
        setNetworkBadge('online', `Sala ${online.roomCode} · Jogador ${online.side + 1}`);
      }
    } else if (message.type === 'opponent-left') {
      dismissBannerByKey('opponent-network');
      setNetworkBadge('offline', 'Adversário saiu');
      showBanner(message.message, 'danger', 0, {
        key: 'opponent-left',
        dismissible: true,
        actionLabel: 'Fechar',
      });
    } else if (message.type === 'error') {
      setOnlineStatus(message.message, true);
      showBanner(message.message, 'danger', 4000, {
        dismissible: true,
        actionLabel: 'Fechar',
      });
    }
  }

  function resetTeamConfirmation() {
    state.teamConfirmed = [false, false];
    for (const side of [0, 1]) {
      document.querySelectorAll(`input[name="teamChoice${side}"]`).forEach((input) => { input.disabled = false; });
      ui.playerTeamPickers[side].classList.remove('is-remote');
      ui.playerTeamPickers[side].classList.remove('is-confirmed');
      ui.playerConfirmButtons[side].disabled = false;
      ui.playerConfirmButtons[side].textContent = `Confirmar Jogador ${side + 1}`;
    }
    ui.teamConfirmStatus.textContent = 'Aguardando a confirmação dos dois jogadores.';
  }

  function confirmPlayerTeam(side) {
    if (online.enabled) {
      if (side !== online.side || state.teamConfirmed[side]) return;
      const onlineSelected = document.querySelector(`input[name="teamChoice${side}"]:checked`);
      if (!onlineSelected || !TEAM_OPTIONS[Number(onlineSelected.value)]) return;
      sendOnline({ type: 'confirm-team', choice: Number(onlineSelected.value) });
      ui.playerConfirmButtons[side].disabled = true;
      ui.playerConfirmButtons[side].textContent = 'Confirmando…';
      return;
    }
    if (state.teamConfirmed[side]) return;
    const selected = document.querySelector(`input[name="teamChoice${side}"]:checked`);
    if (!selected || !TEAM_OPTIONS[Number(selected.value)]) return;
    state.teamChoices[side] = Number(selected.value);
    state.teamConfirmed[side] = true;
    updateTeamPresentation();
    document.querySelectorAll(`input[name="teamChoice${side}"]`).forEach((input) => { input.disabled = true; });
    ui.playerTeamPickers[side].classList.add('is-confirmed');
    ui.playerConfirmButtons[side].disabled = true;
    ui.playerConfirmButtons[side].textContent = 'Confirmado ✓';

    const confirmedCount = state.teamConfirmed.filter(Boolean).length;
    ui.teamConfirmStatus.textContent = confirmedCount === 2
      ? 'Times confirmados. Preparando o sorteio…'
      : `Jogador ${side + 1} confirmou. Aguardando o outro jogador.`;
    if (confirmedCount === 2) {
      flowTimers.push(window.setTimeout(beginCoinToss, 650));
    }
  }

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    image.addEventListener('load', draw);
    return image;
  }

  function createDiscipline() {
    return Array.from({ length: 2 }, () =>
      Array.from({ length: 12 }, (_, number) => ({ number, yellow: 0, red: false, fouls: 0 })),
    );
  }

  function makePlayer(team, number, x, y, keeper = false) {
    return {
      type: 'player', team, number, x, y, vx: 0, vy: 0,
      radius: keeper ? 33 : PLAYER_RADIUS,
      mass: keeper ? 3.1 : 2.5,
      keeper,
      discipline: state.discipline[team][number],
    };
  }

  function resetFormation() {
    state.players = [
      // Jogador 1 — 4–3–3
      makePlayer(0, 1, 170, 543, true),
      makePlayer(0, 2, 330, 185),
      makePlayer(0, 3, 330, 420),
      makePlayer(0, 4, 330, 666),
      makePlayer(0, 5, 330, 901),
      makePlayer(0, 6, 480, 285),
      makePlayer(0, 7, 480, 543),
      makePlayer(0, 8, 480, 801),
      makePlayer(0, 9, 620, 250),
      makePlayer(0, 10, 620, 543),
      makePlayer(0, 11, 620, 836),
      // Jogador 2 — 4–3–3 espelhado
      makePlayer(1, 1, 1278, 543, true),
      makePlayer(1, 2, 1118, 185),
      makePlayer(1, 3, 1118, 420),
      makePlayer(1, 4, 1118, 666),
      makePlayer(1, 5, 1118, 901),
      makePlayer(1, 6, 968, 285),
      makePlayer(1, 7, 968, 543),
      makePlayer(1, 8, 968, 801),
      makePlayer(1, 9, 828, 250),
      makePlayer(1, 10, 828, 543),
      makePlayer(1, 11, 828, 836),
    ].filter((player) => !player.discipline.red);
    state.ball = { type: 'ball', x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, radius: BALL_RADIUS, mass: 0.72 };
    state.aimCurve = 0;
    state.shotCurve = 0;
    clearBallCurve();
    clearAim();
  }

  function startMatch(starter = state.startingTeam) {
    clearFlowTimers();
    clearBannerQueue();
    hideGoalCelebration();
    state.goalEndsMatch = false;
    stopMenuBackground();
    document.body.classList.add('game-active');
    fitGameToViewport();
    state.startingTeam = Number(starter);
    state.activeTeam = Number(starter);
    state.score = [0, 0];
    state.discipline = createDiscipline();
    state.teamFouls = [0, 0];
    state.teamFoulStreak = [0, 0];
    state.touchesUsed = 0;
    state.shots = 0;
    state.phase = 'ready';
    state.pendingOutcome = null;
    resetFormation();
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = true;
    ui.resultOverlay.hidden = true;
    startCrowdAmbient(true);
    playSound('whistle');
    showBanner(`${sideLabel(state.activeTeam)} dá a saída`, 'neutral', 1300);
    updateUI();
    draw();
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function showStartScreen() {
    clearFlowTimers();
    clearBannerQueue();
    hideGoalCelebration();
    state.goalEndsMatch = false;
    stopCrowdAmbient();
    state.phase = 'menu';
    document.body.classList.remove('game-active');
    ui.startOverlay.hidden = false;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = true;
    ui.coinTossOverlay.classList.remove('has-winner');
    ui.resultOverlay.hidden = true;
    startMenuBackground(true);
    fitGameToViewport();
  }

  function showTeamSelection() {
    clearFlowTimers();
    stopCrowdAmbient();
    stopMenuBackground();
    online.enabled = false;
    state.mode = 'local';
    resetTeamConfirmation();
    state.phase = 'team-selection';
    document.body.classList.remove('game-active');
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = false;
    ui.coinTossOverlay.hidden = true;
    ui.resultOverlay.hidden = true;
    ui.teamSelectTitle.textContent = 'Escolham seus times';
    ui.teamSelectDescription.textContent = 'Cada jogador pode escolher livremente. É permitido repetir o mesmo time.';
    fitGameToViewport();
  }

  function randomCoinWinner() {
    try {
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      return value[0] % 2;
    } catch (_) {
      return Math.random() < .5 ? 0 : 1;
    }
  }

  function beginCoinToss(forcedWinner = null, waitForServer = false) {
    clearFlowTimers();
    const winner = forcedWinner === null ? randomCoinWinner() : Number(forcedWinner);
    state.phase = 'coin-toss';
    state.startingTeam = winner;
    document.body.classList.remove('game-active');
    ui.startOverlay.hidden = true;
    ui.onlineLobbyOverlay.hidden = true;
    ui.teamSelectOverlay.hidden = true;
    ui.coinTossOverlay.hidden = false;
    ui.coinTossOverlay.classList.remove('has-winner');
    ui.coinStatus.textContent = 'A moeda está no ar…';
    ui.coinStage.classList.remove('is-tossing');
    ui.tossCoin.className = 'toss-coin';
    void ui.tossCoin.offsetWidth;
    ui.tossCoin.classList.add(winner === 0 ? 'lands-player-1' : 'lands-player-2');
    ui.coinStage.classList.add('is-tossing');
    playSound('coin');

    flowTimers.push(window.setTimeout(() => {
      ui.coinTossOverlay.classList.add('has-winner');
      ui.coinStatus.innerHTML = `<strong>Jogador ${winner + 1}</strong>${teamName(winner)} dá a saída`;
    }, 2350));
    if (!waitForServer) flowTimers.push(window.setTimeout(() => startMatch(winner), 3500));
    return winner;
  }

  function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (WIDTH / rect.width),
      y: (event.clientY - rect.top) * (HEIGHT / rect.height),
    };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function rotateVelocity(vx, vy, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
      vx: vx * cosine - vy * sine,
      vy: vx * sine + vy * cosine,
    };
  }

  function canCurve(player) {
    return player?.type === 'player' && CURVE_ATTACKERS.includes(player.number);
  }

  function updateCurveControl() {
    const visible = canCurve(state.selected) && ['ready', 'aiming'].includes(state.phase);
    ui.curveControl.hidden = !visible;
    for (const button of ui.curveButtons) {
      const curve = Number(button.dataset.curve);
      const active = curve === state.aimCurve;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function setAimCurve(curve) {
    const normalized = Number(curve);
    if (!canCurve(state.selected) || ![-1, 0, 1].includes(normalized)) return false;
    state.aimCurve = normalized;
    updateCurveControl();
    updateUI();
    draw();
    return true;
  }

  function getPlayerAt(point) {
    let closest = null;
    let best = Infinity;
    for (const player of state.players) {
      if (player.team !== state.activeTeam) continue;
      const d = distance(point, player);
      if (d <= player.radius + 12 && d < best) { closest = player; best = d; }
    }
    return closest;
  }

  function onPointerDown(event) {
    if (state.phase !== 'ready') return;
    if (online.enabled) {
      if (online.socket?.readyState !== window.WebSocket?.OPEN) {
        showBanner('Reconectando ao servidor…', 'yellow', 1000);
        return;
      }
      if (online.side !== state.activeTeam) {
        showBanner('Aguarde a vez do adversário', 'neutral', 900);
        return;
      }
    }
    const point = getPointerPosition(event);
    const selectedBody = getPlayerAt(point);
    if (!selectedBody) {
      clearAim();
      draw();
      return;
    }
    event.preventDefault();
    if (state.selected !== selectedBody) state.aimCurve = 0;
    state.selected = selectedBody;
    if (selectedBody.type === 'player' && selectedBody.discipline.yellow > 0) {
      showBanner(`Atenção · ${sideLabel(selectedBody.team)} #${selectedBody.number} já tem amarelo`, 'yellow', 1100);
    }
    state.dragPoint = point;
    state.pointerId = event.pointerId;
    state.phase = 'aiming';
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add('aiming');
    ui.cancelButton.disabled = false;
    updateCurveControl();
    updatePower();
    draw();
  }

  function onPointerMove(event) {
    if (state.phase !== 'aiming' || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const point = getPointerPosition(event);
    const dx = point.x - state.selected.x;
    const dy = point.y - state.selected.y;
    const length = Math.hypot(dx, dy);
    const ratio = length > MAX_DRAG ? MAX_DRAG / length : 1;
    state.dragPoint = { x: state.selected.x + dx * ratio, y: state.selected.y + dy * ratio };
    updatePower();
    draw();
  }

  function onPointerUp(event) {
    if (state.phase !== 'aiming' || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const dx = state.selected.x - state.dragPoint.x;
    const dy = state.selected.y - state.dragPoint.y;
    const drag = Math.hypot(dx, dy);
    if (drag < 12) {
      state.phase = 'ready';
      state.pointerId = null;
      state.dragPoint = null;
      canvas.classList.remove('aiming');
      ui.powerMeter.classList.remove('show');
      if (!canCurve(state.selected)) state.selected = null;
      ui.cancelButton.disabled = !canCurve(state.selected);
      updateCurveControl();
      updateUI();
      draw();
      return;
    }
    const speed = (drag / MAX_DRAG) * MAX_SPEED;
    const shotCurve = canCurve(state.selected) ? state.aimCurve : 0;
    if (online.enabled) {
      const command = {
        type: 'shot',
        bodyType: state.selected.type,
        number: state.selected.type === 'player' ? state.selected.number : null,
        dx,
        dy,
        drag,
        curve: shotCurve,
      };
      state.phase = 'moving';
      state.pointerId = null;
      state.dragPoint = null;
      state.selected = null;
      state.aimCurve = 0;
      canvas.classList.remove('aiming');
      canvas.classList.add('locked');
      ui.powerMeter.classList.remove('show');
      ui.cancelButton.disabled = true;
      updateCurveControl();
      updateUI();
      if (!sendOnline(command)) {
        state.phase = 'ready';
        canvas.classList.remove('locked');
        showBanner('Jogada não enviada · reconectando', 'danger', 1200);
      }
      return;
    }
    clearBallCurve();
    state.selected.vx = (dx / drag) * speed;
    state.selected.vy = (dy / drag) * speed;
    state.launchPlayer = state.selected;
    state.shotCurve = shotCurve;
    state.ballTouched = false;
    state.firstContact = null;
    state.foul = false;
    state.foulImpactSpeed = 0;
    state.ownBlock = false;
    state.pendingOutcome = null;
    state.stillFrames = 0;
    state.shots += 1;
    state.phase = 'moving';
    state.pointerId = null;
    state.dragPoint = null;
    state.selected = null;
    state.aimCurve = 0;
    canvas.classList.remove('aiming');
    canvas.classList.add('locked');
    ui.powerMeter.classList.remove('show');
    ui.cancelButton.disabled = true;
    updateCurveControl();
    updateUI();
  }

  function clearAim() {
    state.selected = null;
    state.dragPoint = null;
    state.pointerId = null;
    state.aimCurve = 0;
    if (state.phase === 'aiming') state.phase = 'ready';
    canvas.classList.remove('aiming');
    ui.powerMeter.classList.remove('show');
    ui.cancelButton.disabled = true;
    updateCurveControl();
  }

  function updatePower() {
    if (!state.selected || !state.dragPoint) return;
    const pct = Math.round(Math.min(1, distance(state.selected, state.dragPoint) / MAX_DRAG) * 100);
    ui.powerFill.style.width = `${pct}%`;
    ui.powerText.textContent = `${pct}%`;
    ui.powerMeter.classList.toggle('show', pct > 3);
  }

  function update(dt) {
    if (state.phase !== 'moving') return;
    const bodies = [...state.players, state.ball];
    const previousBall = { x: state.ball.x, y: state.ball.y };
    for (const body of bodies) {
      if (body === state.ball) applyBallCurve(dt);
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      const speed = Math.hypot(body.vx, body.vy);
      const friction = FRICTION[body.type];
      if (speed > 0) {
        const next = Math.max(0, speed - friction * dt);
        body.vx *= next / speed;
        body.vy *= next / speed;
      }
      if (body.type === 'player') constrainPlayer(body);
    }

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) resolveCollision(bodies[i], bodies[j]);
    }

    checkBallBoundary(previousBall);
    if (state.pendingOutcome) {
      settleImmediately();
      evaluatePlay();
      return;
    }

    const allStill = bodies.every((body) => Math.hypot(body.vx, body.vy) < STOP_SPEED);
    state.stillFrames = allStill ? state.stillFrames + 1 : 0;
    if (state.stillFrames > 18) {
      settleImmediately();
      evaluatePlay();
    }
  }

  function constrainPlayer(player) {
    const r = player.radius;
    let hitEdge = false;
    if (player.x - r < FIELD.left) {
      hitEdge ||= player.vx < -30;
      player.x = FIELD.left + r;
      player.vx = Math.abs(player.vx) * 0.62;
    }
    if (player.x + r > FIELD.right) {
      hitEdge ||= player.vx > 30;
      player.x = FIELD.right - r;
      player.vx = -Math.abs(player.vx) * 0.62;
    }
    if (player.y - r < FIELD.top) {
      hitEdge ||= player.vy < -30;
      player.y = FIELD.top + r;
      player.vy = Math.abs(player.vy) * 0.62;
    }
    if (player.y + r > FIELD.bottom) {
      hitEdge ||= player.vy > 30;
      player.y = FIELD.bottom - r;
      player.vy = -Math.abs(player.vy) * 0.62;
    }

    if (player.keeper) {
      const minX = player.team === 0 ? FIELD.left + r : PENALTY_AREA.rightStart + r;
      const maxX = player.team === 0 ? PENALTY_AREA.leftEnd - r : FIELD.right - r;
      const minY = PENALTY_AREA.top + r;
      const maxY = PENALTY_AREA.bottom - r;
      if (player.x < minX) {
        hitEdge ||= player.vx < -30;
        player.x = minX;
        player.vx = Math.abs(player.vx) * 0.5;
      } else if (player.x > maxX) {
        hitEdge ||= player.vx > 30;
        player.x = maxX;
        player.vx = -Math.abs(player.vx) * 0.5;
      }
      if (player.y < minY) {
        hitEdge ||= player.vy < -30;
        player.y = minY;
        player.vy = Math.abs(player.vy) * 0.5;
      } else if (player.y > maxY) {
        hitEdge ||= player.vy > 30;
        player.y = maxY;
        player.vy = -Math.abs(player.vy) * 0.5;
      }
    }
    if (hitEdge) playSound('edge');
  }

  function clearBallCurve() {
    state.ballCurve = 0;
    state.ballCurveRemaining = 0;
    state.ballCurveSource = null;
  }

  function startBallCurve(source) {
    if (!state.shotCurve || !canCurve(source)) return;
    state.ballCurve = state.shotCurve;
    state.ballCurveRemaining = BALL_CURVE_MAX_ANGLE;
    state.ballCurveSource = source;
  }

  function applyBallCurve(dt) {
    const ball = state.ball;
    if (!ball || state.ballCurve === 0 || state.ballCurveRemaining <= 0) return;
    if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
      clearBallCurve();
      return;
    }
    const step = Math.min(BALL_CURVE_RATE * dt, state.ballCurveRemaining);
    const angle = state.ballCurve * step;
    const rotated = rotateVelocity(ball.vx, ball.vy, angle);
    ball.vx = rotated.vx;
    ball.vy = rotated.vy;
    state.ballCurveRemaining -= step;
    if (state.ballCurveRemaining <= 0.0001) clearBallCurve();
  }

  function resolveCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDistance = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDistance * minDistance) return;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minDistance - d;
    const totalMass = a.mass + b.mass;
    a.x -= nx * overlap * (b.mass / totalMass);
    a.y -= ny * overlap * (b.mass / totalMass);
    b.x += nx * overlap * (a.mass / totalMass);
    b.y += ny * overlap * (a.mass / totalMass);

    const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (relative < 0) {
      const impactSpeed = -relative;
      if (impactSpeed > 25) {
        if (a.type === 'ball' || b.type === 'ball') playSound('kick');
        else playSound('piece');
      }
      const restitution = a.type === 'ball' || b.type === 'ball' ? BALL_RESTITUTION : 0.7;
      const impulse = (-(1 + restitution) * relative) / (1 / a.mass + 1 / b.mass);
      a.vx -= (impulse / a.mass) * nx;
      a.vy -= (impulse / a.mass) * ny;
      b.vx += (impulse / b.mass) * nx;
      b.vy += (impulse / b.mass) * ny;
    }
    registerContact(a, b, nx, ny, Math.max(0, -relative));
    if (state.ballCurve !== 0) {
      const player = a.type === 'ball' ? b : b.type === 'ball' ? a : null;
      if (player?.type === 'player' && player !== state.ballCurveSource) clearBallCurve();
    }
  }

  function registerContact(a, b, nx, ny, impactSpeed) {
    const launched = state.launchPlayer;
    if (!launched) return;
    const other = a === launched ? b : b === launched ? a : null;
    if (!other) return;

    if (other.type === 'ball') {
      if (state.firstContact === null) state.firstContact = 'ball';
      if (state.firstContact === 'ball') {
        if (!state.ballTouched) {
          if (isShootingZone(launched)) {
            const direction = a === launched ? 1 : -1;
            state.ball.vx += nx * direction * 155;
            state.ball.vy += ny * direction * 155;
            showBanner('Chute!', 'neutral', 600);
          }
          startBallCurve(launched);
        }
        state.ballTouched = true;
      }
      return;
    }

    if (state.firstContact === null) {
      if (other.team !== launched.team) {
        state.firstContact = 'opponent';
        state.foul = true;
        state.foulImpactSpeed = impactSpeed;
      } else {
        state.firstContact = 'own';
        state.ownBlock = true;
      }
    }
  }

  function isShootingZone(player) {
    return player.team === 0 ? player.x > 1110 : player.x < 338;
  }

  function checkBallBoundary(previousBall) {
    const ball = state.ball;
    const isBetweenPosts = (y) => y - ball.radius > GOAL.top && y + ball.radius < GOAL.bottom;
    const insideGoalMouth = isBetweenPosts(ball.y);
    const previousLeftEdge = previousBall.x + ball.radius;
    const currentLeftEdge = ball.x + ball.radius;
    const previousRightEdge = previousBall.x - ball.radius;
    const currentRightEdge = ball.x - ball.radius;
    let crossedLeftBetweenPosts = false;
    let crossedRightBetweenPosts = false;

    if (previousLeftEdge >= GOAL_LINE.left && currentLeftEdge < GOAL_LINE.left) {
      const progress = (previousLeftEdge - GOAL_LINE.left) / (previousLeftEdge - currentLeftEdge);
      crossedLeftBetweenPosts = isBetweenPosts(previousBall.y + (ball.y - previousBall.y) * progress);
    }
    if (previousRightEdge <= GOAL_LINE.right && currentRightEdge > GOAL_LINE.right) {
      const progress = (GOAL_LINE.right - previousRightEdge) / (currentRightEdge - previousRightEdge);
      crossedRightBetweenPosts = isBetweenPosts(previousBall.y + (ball.y - previousBall.y) * progress);
    }

    if ((currentLeftEdge < GOAL_LINE.left && insideGoalMouth) || crossedLeftBetweenPosts) {
      state.pendingOutcome = { type: 'goal', team: 1 };
      return;
    }
    if ((currentRightEdge > GOAL_LINE.right && insideGoalMouth) || crossedRightBetweenPosts) {
      state.pendingOutcome = { type: 'goal', team: 0 };
      return;
    }

    let hitEdge = false;
    if (ball.x - ball.radius < FIELD.left) {
      hitEdge ||= ball.vx < -30;
      ball.x = FIELD.left + ball.radius;
      ball.vx = Math.abs(ball.vx) * BALL_EDGE_RESTITUTION;
    }
    if (ball.x + ball.radius > FIELD.right) {
      hitEdge ||= ball.vx > 30;
      ball.x = FIELD.right - ball.radius;
      ball.vx = -Math.abs(ball.vx) * BALL_EDGE_RESTITUTION;
    }
    if (ball.y - ball.radius < FIELD.top) {
      hitEdge ||= ball.vy < -30;
      ball.y = FIELD.top + ball.radius;
      ball.vy = Math.abs(ball.vy) * BALL_EDGE_RESTITUTION;
    }
    if (ball.y + ball.radius > FIELD.bottom) {
      hitEdge ||= ball.vy > 30;
      ball.y = FIELD.bottom - ball.radius;
      ball.vy = -Math.abs(ball.vy) * BALL_EDGE_RESTITUTION;
    }
    if (hitEdge) playSound('edge');
  }

  function settleImmediately() {
    for (const body of [...state.players, state.ball]) { body.vx = 0; body.vy = 0; }
    clearBallCurve();
    canvas.classList.remove('locked');
    state.stillFrames = 0;
  }

  function applyDiscipline() {
    const offender = state.launchPlayer;
    const team = offender.team;
    const record = offender.discipline;
    state.teamFouls[team] += 1;
    state.teamFoulStreak[team] += 1;
    record.fouls += 1;

    const directRed = state.foulImpactSpeed >= CARD_THRESHOLD.red;
    const automaticYellow =
      state.foulImpactSpeed >= CARD_THRESHOLD.yellow ||
      state.teamFouls[team] === 3 ||
      state.teamFoulStreak[team] >= 2;

    let type = 'foul';
    let secondYellow = false;
    if (directRed) {
      type = 'red';
      record.red = true;
    } else if (automaticYellow) {
      record.yellow += 1;
      if (record.yellow >= 2) {
        type = 'red';
        secondYellow = true;
        record.red = true;
      } else {
        type = 'yellow';
      }
    }

    if (record.red) state.players = state.players.filter((player) => player !== offender);
    const forfeit = record.red && !state.players.some((player) => player.team === team);
    const label = `${sideLabel(team)} #${offender.number}`;
    const text = type === 'red'
      ? `${secondYellow ? 'Segundo amarelo · ' : 'Cartão vermelho · '}${label}`
      : type === 'yellow'
        ? `Cartão amarelo · ${label}`
        : `Falta · ${label}`;
    return { type, text, forfeit, team };
  }

  function evaluatePlay() {
    if (state.phase !== 'moving') return;
    const outcome = state.pendingOutcome;
    const actingTeam = state.activeTeam;

    if (outcome?.type === 'goal' && !state.foul) {
      state.teamFoulStreak[actingTeam] = 0;
      state.score[outcome.team] += 1;
      state.activeTeam = 1 - outcome.team;
      state.touchesUsed = 0;
      state.phase = 'paused';
      state.pendingOutcome = null;
      state.goalEndsMatch = isMatchOver();
      playSound('whistle');
      updateUI();
      showBanner(`Gol · ${sideLabel(outcome.team)}!`, 'goal', 2800);
      showGoalCelebration();
      state.goalTimer = window.setTimeout(completeGoalCelebration, 2800);
      return;
    }

    if (state.foul) {
      const decision = applyDiscipline();
      const cancelledGoal = outcome?.type === 'goal';
      if (decision.forfeit) {
        state.score[1 - decision.team] = 3;
        showBanner(`Time sem jogadores · vitória de ${sideLabel(1 - decision.team)}`, 'danger', 1800);
        finishMatch();
        return;
      }
      playSound(decision.type === 'yellow' ? 'yellowCard' : decision.type === 'red' ? 'redCard' : 'foul');
      switchTurn();
      const isCard = decision.type === 'yellow' || decision.type === 'red';
      showBanner(
        `${cancelledGoal ? 'Gol anulado · ' : ''}${decision.text}`,
        decision.type === 'yellow' ? 'yellow' : decision.type === 'red' ? 'danger' : 'neutral',
        isCard ? 5000 : 3500,
        {
          dismissible: true,
          actionLabel: isCard ? 'Continuar' : 'Fechar',
        },
      );
    } else if (state.ballTouched && !state.ownBlock) {
      state.teamFoulStreak[actingTeam] = 0;
      state.touchesUsed += 1;
      if (state.touchesUsed >= 3) {
        switchTurn();
        showBanner('Três toques · troca de vez', 'neutral', 900);
      } else {
        state.phase = 'ready';
        showBanner(`Bom toque · mais ${3 - state.touchesUsed}`, 'neutral', 750);
      }
    } else {
      state.teamFoulStreak[actingTeam] = 0;
      switchTurn();
      showBanner(state.ownBlock ? 'Companheiro atingido · troca de vez' : 'Não tocou na bola · troca de vez', 'neutral', 1000);
    }

    if (isMatchOver()) { finishMatch(); return; }
    state.launchPlayer = null;
    state.shotCurve = 0;
    state.pendingOutcome = null;
    updateUI();
  }

  function switchTurn() {
    state.activeTeam = 1 - state.activeTeam;
    state.touchesUsed = 0;
    state.phase = 'ready';
  }

  function isMatchOver() { return state.score.some((score) => score >= 3) || state.shots >= 40; }

  function showGoalCelebration() {
    window.clearTimeout(state.goalTimer);
    ui.goalOverlay.hidden = false;
    ui.goalOverlay.classList.remove('show');
    void ui.goalOverlay.offsetWidth;
    ui.goalOverlay.classList.add('show');
  }

  function hideGoalCelebration() {
    window.clearTimeout(state.goalTimer);
    state.goalTimer = 0;
    ui.goalOverlay.classList.remove('show');
    ui.goalOverlay.hidden = true;
  }

  function completeGoalCelebration() {
    const endsMatch = state.goalEndsMatch;
    state.goalEndsMatch = false;
    hideGoalCelebration();
    if (endsMatch) {
      finishMatch();
      return;
    }
    resetFormation();
    state.launchPlayer = null;
    state.phase = 'ready';
    updateUI();
  }

  function finishMatch() {
    state.shotCurve = 0;
    clearBallCurve();
    state.phase = 'finished';
    stopCrowdAmbient();
    playSound('final');
    const [a, b] = state.score;
    ui.resultTitle.textContent = a === b ? 'Empate de respeito!' : `${sideLabel(a > b ? 0 : 1)} venceu!`;
    ui.resultScore.textContent = `${a} × ${b}`;
    ui.resultOverlay.hidden = false;
    updateUI();
  }

  function displayNextBanner() {
    if (state.currentBanner || state.bannerQueue.length === 0) return;
    const banner = state.bannerQueue.shift();
    state.currentBanner = banner;
    ui.eventBannerText.textContent = banner.text;
    ui.eventBannerClose.textContent = banner.actionLabel;
    ui.eventBannerClose.hidden = !banner.dismissible;
    ui.eventBanner.className = `event-banner show ${banner.kind}${banner.dismissible ? ' is-dismissible' : ''}`;
    ui.eventBanner.setAttribute('aria-hidden', 'false');
    if (banner.duration > 0) {
      state.bannerTimer = window.setTimeout(closeCurrentBanner, banner.duration);
    }
  }

  function closeCurrentBanner() {
    if (!state.currentBanner) return;
    window.clearTimeout(state.bannerTimer);
    window.clearTimeout(state.bannerTransitionTimer);
    state.bannerTimer = 0;
    ui.eventBanner.classList.remove('show');
    ui.eventBanner.setAttribute('aria-hidden', 'true');
    state.bannerTransitionTimer = window.setTimeout(() => {
      state.currentBanner = null;
      ui.eventBanner.className = 'event-banner';
      ui.eventBannerClose.hidden = true;
      displayNextBanner();
    }, 230);
  }

  function dismissBannerByKey(key) {
    if (!key) return;
    state.bannerQueue = state.bannerQueue.filter((banner) => banner.key !== key);
    if (state.currentBanner?.key === key) closeCurrentBanner();
  }

  function clearBannerQueue() {
    window.clearTimeout(state.bannerTimer);
    window.clearTimeout(state.bannerTransitionTimer);
    state.bannerTimer = 0;
    state.bannerTransitionTimer = 0;
    state.bannerQueue = [];
    state.currentBanner = null;
    ui.eventBanner.className = 'event-banner';
    ui.eventBanner.setAttribute('aria-hidden', 'true');
    ui.eventBannerClose.hidden = true;
  }

  function showBanner(text, kind = 'neutral', duration = 900, options = {}) {
    const key = options.key || null;
    if (key && state.currentBanner?.key === key) {
      state.currentBanner.text = text;
      ui.eventBannerText.textContent = text;
      return;
    }
    if (key && state.bannerQueue.some((banner) => banner.key === key)) return;
    const banner = {
      id: ++state.bannerSequence,
      text,
      kind,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 900,
      dismissible: Boolean(options.dismissible),
      actionLabel: options.actionLabel || 'Fechar',
      key,
    };
    state.bannerQueue.push(banner);
    displayNextBanner();
  }

  function updateUI() {
    ui.score[0].textContent = state.score[0];
    ui.score[1].textContent = state.score[1];
    for (const team of [0, 1]) {
      const records = state.discipline[team].slice(1);
      ui.yellowCards[team].textContent = records.reduce((total, record) => total + record.yellow, 0);
      ui.redCards[team].textContent = records.filter((record) => record.red).length;
      ui.teamFouls[team].textContent = state.teamFouls[team];
    }
    ui.shotCount.textContent = state.shots;
    const onlineTurnLabel = online.enabled
      ? state.activeTeam === online.side
        ? `Sua vez · ${sideLabel(state.activeTeam)}`
        : `Vez do adversário · ${sideLabel(state.activeTeam)}`
      : `Vez de ${sideLabel(state.activeTeam)}`;
    ui.turnText.textContent = state.phase === 'moving'
      ? 'Lance em movimento…'
      : onlineTurnLabel;
    ui.turnStrip.classList.toggle('team-1', state.activeTeam === 1);
    ui.cards[0].classList.toggle('is-inactive', state.activeTeam !== 0);
    ui.cards[1].classList.toggle('is-inactive', state.activeTeam !== 1);
    const remaining = 3 - state.touchesUsed;
    ui.touchText.textContent = remaining;
    ui.touchDots.forEach((dot, index) => dot.classList.toggle('used', index >= remaining));
    ui.hintText.innerHTML = state.phase === 'moving'
      ? '<strong>Aguarde:</strong> o lance termina quando todas as peças pararem.'
      : online.enabled && state.phase === 'ready' && state.activeTeam !== online.side
        ? '<strong>Partida online:</strong> aguarde a jogada do adversário.'
        : canCurve(state.selected)
          ? `<strong>Atacante #${state.selected.number}:</strong> escolha o efeito e mire reto na bola; a linha laranja prevê a curva.`
        : '<strong>Como jogar:</strong> arraste um botão para trás e solte para lançar.';
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    if (images.field.complete && images.field.naturalWidth) ctx.drawImage(images.field, 0, 0, WIDTH, HEIGHT);
    else { ctx.fillStyle = '#0a6a32'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }

    drawFinalizationZones();
    for (const player of state.players) drawPlayer(player);
    if (state.ball) drawBall(state.ball);
    if (state.phase === 'aiming' && state.selected && state.dragPoint) drawAim();
  }

  function drawFinalizationZones() {
    ctx.save();
    ctx.fillStyle = 'rgba(196, 244, 94, 0.035)';
    ctx.fillRect(FIELD.left, 222, 225, 622);
    ctx.fillRect(FIELD.right - 225, 222, 225, 622);
    ctx.restore();
  }

  function drawPlayer(player) {
    const inactive = state.phase === 'ready' && player.team !== state.activeTeam;
    const image = selectedTeamCanvasImage(player.team);
    const r = player.radius;
    ctx.save();
    ctx.globalAlpha = inactive ? 0.68 : 1;
    ctx.shadowColor = 'rgba(0,0,0,.48)';
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 7;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (image.complete && image.naturalWidth) ctx.drawImage(image, player.x - r, player.y - r, r * 2, r * 2);
    else { ctx.fillStyle = selectedTeam(player.team).color; ctx.fill(); }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(player.x, player.y, r + 1, 0, Math.PI * 2);
    ctx.strokeStyle = player === state.selected ? '#c4f45e' : player.keeper ? '#f7e07b' : 'rgba(255,255,255,.34)';
    ctx.lineWidth = player === state.selected ? 5 : player.keeper ? 4 : 1.5;
    ctx.stroke();
    const numberSize = player.number >= 10 ? 17 : player.keeper ? 22 : 20;
    ctx.font = `800 ${numberSize}px Manrope, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(3, 10, 6, .9)';
    ctx.lineWidth = 6;
    ctx.strokeText(String(player.number), player.x, player.y + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(player.number), player.x, player.y + 1);
    if (player.discipline.yellow > 0) {
      ctx.save();
      ctx.translate(player.x + r * .68, player.y - r * .62);
      ctx.rotate(.12);
      ctx.fillStyle = '#ffd447';
      ctx.strokeStyle = 'rgba(54, 39, 0, .85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-6, -9, 12, 18, 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBall(ball) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 6;
    if (images.ball.complete && images.ball.naturalWidth) {
      const cropSize = Math.min(images.ball.naturalWidth, images.ball.naturalHeight);
      const sourceX = (images.ball.naturalWidth - cropSize) / 2;
      const sourceY = (images.ball.naturalHeight - cropSize) / 2;
      ctx.drawImage(
        images.ball,
        sourceX,
        sourceY,
        cropSize,
        cropSize,
        ball.x - ball.radius,
        ball.y - ball.radius,
        ball.radius * 2,
        ball.radius * 2,
      );
    } else {
      const gradient = ctx.createRadialGradient(ball.x - 6, ball.y - 8, 2, ball.x, ball.y, ball.radius);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(.68, '#ecebe5');
      gradient.addColorStop(1, '#999c97');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.selected === ball) {
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#c4f45e';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function predictBallContact(player, nx, ny, drag) {
    const toBallX = state.ball.x - player.x;
    const toBallY = state.ball.y - player.y;
    const alongPath = toBallX * nx + toBallY * ny;
    const lateralPath = Math.abs(toBallX * ny - toBallY * nx);
    const contactRadius = player.radius + state.ball.radius;
    const reachesBall = alongPath > 0 && lateralPath <= contactRadius;
    const contactDistance = reachesBall
      ? alongPath - Math.sqrt(Math.max(0, contactRadius * contactRadius - lateralPath * lateralPath))
      : Infinity;
    const blockingDistance = state.players.reduce((nearest, other) => {
      if (other === player) return nearest;
      const toOtherX = other.x - player.x;
      const toOtherY = other.y - player.y;
      const along = toOtherX * nx + toOtherY * ny;
      const collisionRadius = player.radius + other.radius;
      const lateral = Math.abs(toOtherX * ny - toOtherY * nx);
      if (along <= 0 || lateral > collisionRadius) return nearest;
      const hitDistance = along - Math.sqrt(Math.max(0, collisionRadius * collisionRadius - lateral * lateral));
      return Math.min(nearest, hitDistance);
    }, Infinity);
    if (blockingDistance <= contactDistance) return null;
    const launchSpeed = (Math.min(drag, MAX_DRAG) / MAX_DRAG) * MAX_SPEED;
    const estimatedTravel = (launchSpeed * launchSpeed) / (2 * FRICTION.player);
    if (contactDistance > estimatedTravel) return null;
    const speedAtContact = Math.sqrt(Math.max(0, launchSpeed * launchSpeed - 2 * FRICTION.player * contactDistance));
    const playerX = player.x + nx * contactDistance;
    const playerY = player.y + ny * contactDistance;
    const impactX = state.ball.x - playerX;
    const impactY = state.ball.y - playerY;
    const impactLength = Math.hypot(impactX, impactY) || 1;
    return {
      distance: contactDistance,
      speed: speedAtContact,
      nx: impactX / impactLength,
      ny: impactY / impactLength,
    };
  }

  function predictionHitsBoundary(x, y) {
    const r = state.ball.radius;
    const betweenPosts = y - r > GOAL.top && y + r < GOAL.bottom;
    if (betweenPosts && (x + r < GOAL_LINE.left || x - r > GOAL_LINE.right)) return true;
    return x - r <= FIELD.left || x + r >= FIELD.right || y - r <= FIELD.top || y + r >= FIELD.bottom;
  }

  function predictionHitsPlayer(x, y, source) {
    return state.players.some((player) =>
      player !== source && Math.hypot(x - player.x, y - player.y) <= state.ball.radius + player.radius,
    );
  }

  function predictCurvedBallPath(player, nx, ny, drag, curve, contact = null) {
    const predictedContact = contact || predictBallContact(player, nx, ny, drag);
    if (!predictedContact || !curve) return [];
    const approach = Math.max(0, nx * predictedContact.nx + ny * predictedContact.ny);
    if (approach <= 0 || predictedContact.speed <= 0) return [];
    const relative = -predictedContact.speed * approach;
    const impulse =
      (-(1 + BALL_RESTITUTION) * relative) /
      (1 / player.mass + 1 / state.ball.mass);
    let vx = (impulse / state.ball.mass) * predictedContact.nx;
    let vy = (impulse / state.ball.mass) * predictedContact.ny;
    if (isShootingZone(player)) {
      vx += predictedContact.nx * 155;
      vy += predictedContact.ny * 155;
    }

    let x = state.ball.x;
    let y = state.ball.y;
    let remaining = BALL_CURVE_MAX_ANGLE;
    const points = [{ x, y }];
    const dt = PHYSICS_STEP;
    for (let stepIndex = 0; stepIndex < 240 && remaining > 0.0001; stepIndex += 1) {
      const curveStep = Math.min(BALL_CURVE_RATE * dt, remaining);
      const rotated = rotateVelocity(vx, vy, curve * curveStep);
      vx = rotated.vx;
      vy = rotated.vy;
      x += vx * dt;
      y += vy * dt;
      const speed = Math.hypot(vx, vy);
      if (speed <= STOP_SPEED) break;
      const nextSpeed = Math.max(0, speed - FRICTION.ball * dt);
      vx *= nextSpeed / speed;
      vy *= nextSpeed / speed;
      remaining -= curveStep;
      if (predictionHitsPlayer(x, y, player) || predictionHitsBoundary(x, y)) break;
      points.push({ x, y });
    }
    return points;
  }

  function drawAim() {
    const player = state.selected;
    const pull = state.dragPoint;
    const dx = player.x - pull.x;
    const dy = player.y - pull.y;
    const drag = Math.hypot(dx, dy);
    if (drag < 3) return;
    const nx = dx / drag;
    const ny = dy / drag;
    const projected = 105 + (drag / MAX_DRAG) * 170;
    const startX = player.x + nx * (player.radius + 8);
    const startY = player.y + ny * (player.radius + 8);
    const curve = canCurve(player) ? state.aimCurve : 0;
    const predictedContact = predictBallContact(player, nx, ny, drag);
    const playerPathLength = predictedContact
      ? Math.max(player.radius + 8, predictedContact.distance)
      : projected;
    const endX = player.x + nx * playerPathLength;
    const endY = player.y + ny * playerPathLength;

    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(196,244,94,.9)';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    let arrowX = endX;
    let arrowY = endY;
    let tangentX = nx;
    let tangentY = ny;
    let arrowColor = '#c4f45e';
    const curvedPath = predictCurvedBallPath(player, nx, ny, drag, curve, predictedContact);
    if (curvedPath.length > 1) {
      const lastPoint = curvedPath.at(-1);
      const previousPoint = curvedPath.at(-2);
      arrowX = lastPoint.x;
      arrowY = lastPoint.y;
      const tangentLength = Math.hypot(lastPoint.x - previousPoint.x, lastPoint.y - previousPoint.y) || 1;
      tangentX = (lastPoint.x - previousPoint.x) / tangentLength;
      tangentY = (lastPoint.y - previousPoint.y) / tangentLength;
      arrowColor = '#ffbd2e';
      ctx.strokeStyle = 'rgba(255,189,46,.95)';
      ctx.beginPath();
      ctx.moveTo(curvedPath[0].x, curvedPath[0].y);
      for (const point of curvedPath.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(arrowX + tangentX * 14, arrowY + tangentY * 14);
    ctx.lineTo(arrowX - tangentY * 11, arrowY + tangentX * 11);
    ctx.lineTo(arrowX + tangentY * 11, arrowY - tangentX * 11);
    ctx.closePath();
    ctx.fill();

    ctx.translate(pull.x, pull.y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = 'rgba(225,235,229,.48)';
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-25, -17, Math.min(drag + 47, 235), 34, 17);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function playMedia(media, volume, restart = true) {
    if (!state.sounds || typeof media?.play !== 'function') return;
    try {
      media.volume = volume;
      if (restart) media.currentTime = 0;
      const playback = media.play();
      playback?.catch?.(() => {});
    } catch (_) { /* O navegador pode bloquear áudio antes da primeira interação. */ }
  }

  function startCrowdAmbient(reset = false) {
    const crowd = ui.audio.crowd;
    if (!state.sounds || typeof crowd?.play !== 'function') return;
    try {
      crowd.loop = true;
      crowd.volume = .62;
      if (reset) crowd.currentTime = 0;
      const playback = crowd.play();
      playback?.catch?.(() => {});
    } catch (_) { /* O ambiente não deve impedir a partida. */ }
  }

  function stopCrowdAmbient(reset = true) {
    const crowd = ui.audio.crowd;
    if (typeof crowd?.pause !== 'function') return;
    try {
      crowd.pause();
      if (reset) crowd.currentTime = 0;
    } catch (_) { /* Ignora falhas de mídia durante a troca de telas. */ }
  }

  function startMenuBackground(reset = false) {
    const background = ui.audio.menuBackground;
    if (!state.sounds || state.phase !== 'menu' || typeof background?.play !== 'function') return;
    try {
      background.loop = true;
      background.volume = .62;
      if (reset) background.currentTime = 0;
      const playback = background.play();
      playback?.catch?.(() => {});
    } catch (_) { /* Alguns navegadores aguardam a primeira interação para liberar o áudio. */ }
  }

  function stopMenuBackground(reset = true) {
    const background = ui.audio.menuBackground;
    if (typeof background?.pause !== 'function') return;
    try {
      background.pause();
      if (reset) background.currentTime = 0;
    } catch (_) { /* Ignora falhas de mídia durante a troca de telas. */ }
  }

  function playSound(type) {
    if (!state.sounds) return;
    if (type === 'kick') {
      playMedia(ui.audio.kick, 1);
      return;
    }
    if (type === 'whistle') {
      playMedia(ui.audio.whistle, 1);
      return;
    }
    if (type === 'click') {
      playMedia(ui.audio.click, .9);
      return;
    }
    if (type === 'final') {
      playMedia(ui.audio.final, 1);
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = playSound.context || (playSound.context = new AudioContextClass());
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const now = audio.currentTime;
      const config = {
        coin: [980, .16, .16, 'triangle'],
        piece: [175, .055, .19, 'triangle'],
        edge: [105, .07, .18, 'square'],
        foul: [650, .18, .24, 'square'],
        yellowCard: [880, .3, .23, 'square'],
        redCard: [430, .62, .28, 'sawtooth'],
      }[type];
      osc.type = config[3];
      osc.frequency.setValueAtTime(config[0], now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(60, config[0] * .6), now + config[1]);
      gain.gain.setValueAtTime(config[2], now);
      gain.gain.exponentialRampToValueAtTime(.001, now + config[1]);
      osc.connect(gain).connect(audio.destination);
      osc.start(now);
      osc.stop(now + config[1]);
    } catch (_) { /* Som é um aprimoramento, não deve impedir a partida. */ }
  }

  function animate(time) {
    const elapsed = Math.min(.05, (time - state.lastTime) / 1000);
    state.lastTime = time;
    state.accumulator += elapsed;
    const step = PHYSICS_STEP;
    while (state.accumulator >= step) {
      if (!online.enabled) update(step);
      state.accumulator -= step;
    }
    draw();
    window.requestAnimationFrame(animate);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', clearAim);
  document.querySelector('#startButton').addEventListener('click', () => showOnlineLobby());
  document.querySelector('#localButton').addEventListener('click', showTeamSelection);
  document.querySelector('#backFromOnlineButton').addEventListener('click', () => {
    closeOnlineConnection();
    showStartScreen();
  });
  document.querySelector('#backToStartButton').addEventListener('click', () => {
    if (online.enabled) closeOnlineConnection();
    showStartScreen();
  });
  ui.createRoomButton.addEventListener('click', () => {
    ui.createRoomButton.disabled = true;
    connectOnline()
      .then(() => sendOnline({ type: 'create-room' }))
      .catch(() => {})
      .finally(() => { ui.createRoomButton.disabled = false; });
  });
  document.querySelector('#joinRoomForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const roomCode = ui.roomCodeInput.value.trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(roomCode)) {
      setOnlineStatus('Digite o código de cinco caracteres da sala.', true);
      return;
    }
    document.querySelector('#joinRoomButton').disabled = true;
    connectOnline()
      .then(() => sendOnline({ type: 'join-room', roomCode }))
      .catch(() => {})
      .finally(() => { document.querySelector('#joinRoomButton').disabled = false; });
  });
  ui.roomCodeInput.addEventListener('input', () => {
    ui.roomCodeInput.value = ui.roomCodeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
  });
  ui.copyRoomButton.addEventListener('click', async () => {
    const invite = `${window.location.origin}${window.location.pathname}?room=${online.roomCode}`;
    try {
      await window.navigator.clipboard.writeText(invite);
      setOnlineStatus('Convite copiado. Envie ao seu adversário.');
    } catch (_) {
      setOnlineStatus(`Código da sala: ${online.roomCode}`);
    }
  });
  for (const side of [0, 1]) {
    document.querySelectorAll(`input[name="teamChoice${side}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        if (online.enabled && side === online.side && input.checked) {
          sendOnline({ type: 'choose-team', choice: Number(input.value) });
        }
      });
    });
  }
  ui.playerConfirmButtons.forEach((button, side) => {
    button.addEventListener('click', () => confirmPlayerTeam(side));
  });
  document.querySelector('#rematchButton').addEventListener('click', () => {
    ui.resultOverlay.hidden = true;
    if (online.enabled) {
      sendOnline({ type: 'request-rematch' });
      ui.resultOverlay.hidden = false;
      ui.resultTitle.textContent = 'Revanche solicitada';
      ui.resultScore.textContent = 'Aguardando o adversário…';
    } else {
      beginCoinToss();
    }
  });
  document.querySelector('#newMatchButton').addEventListener('click', () => {
    if (online.enabled) closeOnlineConnection();
    showStartScreen();
  });
  ui.cancelButton.addEventListener('click', () => { clearAim(); draw(); });
  for (const button of ui.curveButtons) {
    button.addEventListener('click', () => setAimCurve(button.dataset.curve));
  }
  ui.eventBannerClose.addEventListener('click', closeCurrentBanner);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { clearAim(); document.querySelector('#rulesDialog').close?.(); draw(); }
  });
  const rulesDialog = document.querySelector('#rulesDialog');
  ['#rulesButton', '#startRulesButton'].forEach((selector) => {
    document.querySelector(selector)?.addEventListener('click', () => rulesDialog.showModal());
  });
  document.querySelector('#closeRulesButton').addEventListener('click', () => rulesDialog.close());
  rulesDialog.addEventListener('click', (event) => { if (event.target === rulesDialog) rulesDialog.close(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('button:not(#soundButton):not(#startSoundButton)')) playSound('click');
  });
  document.addEventListener('pointerdown', () => {
    if (state.phase === 'menu' && ui.audio.menuBackground?.paused) startMenuBackground();
  }, { passive: true });

  function toggleSound() {
    const enabling = !state.sounds;
    if (!enabling) playSound('click');
    state.sounds = !state.sounds;
    ui.soundButton.setAttribute('aria-pressed', String(state.sounds));
    ui.soundButton.setAttribute('aria-label', state.sounds ? 'Desativar som' : 'Ativar som');
    ui.soundButton.querySelector('span').textContent = state.sounds ? '♪' : '×';
    const startSoundLabel = document.querySelector('#startSoundLabel');
    if (startSoundLabel) startSoundLabel.textContent = state.sounds ? 'Som ligado' : 'Som desligado';
    if (state.sounds) {
      playSound('click');
      if (state.phase === 'menu') startMenuBackground();
      else if (['ready', 'aiming', 'moving', 'paused'].includes(state.phase)) startCrowdAmbient();
    } else {
      stopCrowdAmbient(false);
      stopMenuBackground(false);
    }
  }

  ui.soundButton.addEventListener('click', toggleSound);
  document.querySelector('#startSoundButton')?.addEventListener('click', toggleSound);
  window.addEventListener('resize', fitGameToViewport);

  function fitGameToViewport() {
    if (!Number.isFinite(window.innerWidth) || !Number.isFinite(window.innerHeight)) return;
    if (!document.body.classList.contains('game-active') || window.innerWidth <= 700) {
      ui.gameStage.style.width = '';
      return;
    }
    const widthFromWindow = window.innerWidth - 56;
    const widthFromHeight = Math.max(320, (window.innerHeight - 242) * (4 / 3));
    ui.gameStage.style.width = `${Math.min(1280, widthFromWindow, widthFromHeight)}px`;
  }

  resetFormation();
  updateTeamPresentation();
  updateUI();
  // O elemento já tenta tocar durante a leitura do HTML; não volte ao início
  // caso a reprodução tenha sido liberada antes do restante do jogo carregar.
  startMenuBackground();
  window.requestAnimationFrame(animate);

  try {
    const savedRoom = window.sessionStorage?.getItem('copaBotaoRoom');
    const savedToken = window.sessionStorage?.getItem('copaBotaoToken');
    const invitedRoom = new URLSearchParams(window.location?.search || '').get('room')?.toUpperCase();
    if (savedRoom && savedToken) {
      online.roomCode = savedRoom;
      online.token = savedToken;
      online.shouldReconnect = true;
      showOnlineLobby(savedRoom);
      connectOnline().then(() => {
        sendOnline({ type: 'join-room', roomCode: savedRoom, token: savedToken });
      }).catch(() => {});
    } else if (invitedRoom && /^[A-Z2-9]{5}$/.test(invitedRoom)) {
      showOnlineLobby(invitedRoom);
    }
  } catch (_) { /* A abertura local continua disponível sem URL ou sessionStorage. */ }

  // Pequena API de diagnóstico para testes automatizados locais.
  window.__copaBotao = {
    state,
    startMatch,
    selectTeams,
    selectedTeamImagePath,
    beginCoinToss,
    update,
    evaluatePlay,
    completeGoalCelebration,
    resetFormation,
    canCurve,
    setAimCurve,
    predictBallContact,
    predictCurvedBallPath,
    showBanner,
    closeCurrentBanner,
    clearBannerQueue,
    online,
    constants: { WIDTH, HEIGHT, FIELD, GOAL, GOAL_LINE, PENALTY_AREA, FRICTION, STOP_SPEED, MAX_SPEED, MAX_DRAG, BALL_EDGE_RESTITUTION, BALL_RESTITUTION, BALL_CURVE_RATE, BALL_CURVE_MAX_ANGLE, CURVE_ATTACKERS, CARD_THRESHOLD, PHYSICS_STEP, TEAM_OPTIONS },
  };
})();
