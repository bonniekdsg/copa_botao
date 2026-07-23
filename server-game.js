'use strict';

const WIDTH = 1448;
const HEIGHT = 1086;
const FIELD = { left: 40, right: 1408, top: 29, bottom: 1042 };
const GOAL = { top: 428, bottom: 615 };
const GOAL_LINE = { left: 87, right: 1361 };
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
const TEAM_NAMES = ['Argentina', 'Espanha'];

class ServerGame {
  constructor({ starter = 0, teamChoices = [0, 1] } = {}) {
    this.events = [];
    this.state = {
      phase: 'ready',
      players: [],
      ball: null,
      activeTeam: Number(starter),
      startingTeam: Number(starter),
      teamChoices: [...teamChoices],
      score: [0, 0],
      discipline: this.createDiscipline(),
      teamFouls: [0, 0],
      teamFoulStreak: [0, 0],
      touchesUsed: 0,
      shots: 0,
      launchPlayer: null,
      shotCurve: 0,
      ballCurve: 0,
      ballCurveRemaining: 0,
      ballCurveSource: null,
      ballTouched: false,
      firstContact: null,
      foul: false,
      foulImpactSpeed: 0,
      ownBlock: false,
      pendingOutcome: null,
      stillFrames: 0,
      goalEndsMatch: false,
      goalResumeAt: 0,
    };
    this.resetFormation();
  }

  createDiscipline() {
    return Array.from({ length: 2 }, () =>
      Array.from({ length: 12 }, (_, number) => ({ number, yellow: 0, red: false, fouls: 0 })),
    );
  }

  makePlayer(team, number, x, y, keeper = false) {
    return {
      type: 'player',
      team,
      number,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: keeper ? 33 : PLAYER_RADIUS,
      mass: keeper ? 3.1 : 2.5,
      keeper,
      discipline: this.state.discipline[team][number],
    };
  }

  resetFormation() {
    const make = (...args) => this.makePlayer(...args);
    this.state.players = [
      make(0, 1, 170, 543, true),
      make(0, 2, 330, 185),
      make(0, 3, 330, 420),
      make(0, 4, 330, 666),
      make(0, 5, 330, 901),
      make(0, 6, 480, 285),
      make(0, 7, 480, 543),
      make(0, 8, 480, 801),
      make(0, 9, 620, 250),
      make(0, 10, 620, 543),
      make(0, 11, 620, 836),
      make(1, 1, 1278, 543, true),
      make(1, 2, 1118, 185),
      make(1, 3, 1118, 420),
      make(1, 4, 1118, 666),
      make(1, 5, 1118, 901),
      make(1, 6, 968, 285),
      make(1, 7, 968, 543),
      make(1, 8, 968, 801),
      make(1, 9, 828, 250),
      make(1, 10, 828, 543),
      make(1, 11, 828, 836),
    ].filter((player) => !player.discipline.red);
    this.state.ball = {
      type: 'ball',
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: BALL_RADIUS,
      mass: 0.72,
    };
    this.state.launchPlayer = null;
    this.state.shotCurve = 0;
    this.clearBallCurve();
  }

  teamName(side) {
    return TEAM_NAMES[this.state.teamChoices[side]] || `Jogador ${side + 1}`;
  }

  sideLabel(side) {
    return this.state.teamChoices[0] === this.state.teamChoices[1]
      ? `Jogador ${side + 1} · ${this.teamName(side)}`
      : this.teamName(side);
  }

  emit(type, detail = {}) {
    this.events.push({ ...detail, type });
  }

  drainEvents() {
    return this.events.splice(0);
  }

  snapshot() {
    const state = this.state;
    return {
      phase: state.phase,
      activeTeam: state.activeTeam,
      startingTeam: state.startingTeam,
      teamChoices: [...state.teamChoices],
      score: [...state.score],
      discipline: state.discipline.map((team) => team.map((record) => ({ ...record }))),
      teamFouls: [...state.teamFouls],
      touchesUsed: state.touchesUsed,
      shots: state.shots,
      players: state.players.map((player) => ({
        type: 'player',
        team: player.team,
        number: player.number,
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        radius: player.radius,
        mass: player.mass,
        keeper: player.keeper,
      })),
      ball: { ...state.ball },
    };
  }

  shoot(side, command) {
    const state = this.state;
    if (state.phase !== 'ready') return { ok: false, error: 'Aguarde o lance atual terminar.' };
    if (Number(side) !== state.activeTeam) return { ok: false, error: 'Não é a sua vez.' };

    let selected;
    if (command.bodyType === 'ball') {
      return { ok: false, error: 'Selecione um botão do seu time para fazer a jogada.' };
    } else {
      selected = state.players.find((player) =>
        player.team === side && player.number === Number(command.number) && !player.discipline.red,
      );
      if (!selected) return { ok: false, error: 'Botão inválido.' };
    }

    const curve = Number(command.curve ?? 0);
    if (![-1, 0, 1].includes(curve)) return { ok: false, error: 'Curva inválida.' };
    if (curve !== 0 && !CURVE_ATTACKERS.includes(selected.number)) {
      return { ok: false, error: 'Somente os jogadores 9, 10 e 11 podem fazer curvas.' };
    }

    const dx = Number(command.dx);
    const dy = Number(command.dy);
    const requestedDrag = Number(command.drag);
    if (![dx, dy, requestedDrag].every(Number.isFinite)) return { ok: false, error: 'Jogada inválida.' };
    const vectorLength = Math.hypot(dx, dy);
    const drag = Math.min(MAX_DRAG, Math.max(0, requestedDrag));
    if (vectorLength < 0.001 || drag < 12) return { ok: false, error: 'A força do lançamento é muito baixa.' };

    const speed = (drag / MAX_DRAG) * MAX_SPEED;
    this.clearBallCurve();
    selected.vx = (dx / vectorLength) * speed;
    selected.vy = (dy / vectorLength) * speed;
    state.launchPlayer = selected;
    state.shotCurve = curve;
    state.ballTouched = false;
    state.firstContact = null;
    state.foul = false;
    state.foulImpactSpeed = 0;
    state.ownBlock = false;
    state.pendingOutcome = null;
    state.stillFrames = 0;
    state.shots += 1;
    state.phase = 'moving';
    this.emit('shot-started', { side });
    return { ok: true };
  }

  update(dt, now = Date.now()) {
    const state = this.state;
    if (state.phase === 'paused') {
      if (now >= state.goalResumeAt) this.completeGoalCelebration();
      return;
    }
    if (state.phase !== 'moving') return;

    this.edgeSoundThisTick = false;
    this.kickSoundThisTick = false;
    this.pieceSoundThisTick = false;
    const bodies = [...state.players, state.ball];
    const previousBall = { x: state.ball.x, y: state.ball.y };
    for (const body of bodies) {
      if (body === state.ball) this.applyBallCurve(dt);
      body.x += body.vx * dt;
      body.y += body.vy * dt;
      const speed = Math.hypot(body.vx, body.vy);
      const friction = FRICTION[body.type];
      if (speed > 0) {
        const next = Math.max(0, speed - friction * dt);
        body.vx *= next / speed;
        body.vy *= next / speed;
      }
      if (body.type === 'player') this.constrainPlayer(body);
    }

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) this.resolveCollision(bodies[i], bodies[j]);
    }

    this.checkBallBoundary(previousBall);
    if (state.pendingOutcome) {
      this.settleImmediately();
      this.evaluatePlay(now);
      return;
    }

    const allStill = bodies.every((body) => Math.hypot(body.vx, body.vy) < STOP_SPEED);
    state.stillFrames = allStill ? state.stillFrames + 1 : 0;
    if (state.stillFrames > 18) {
      this.settleImmediately();
      this.evaluatePlay(now);
    }
  }

  constrainPlayer(player) {
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
    if (hitEdge && !this.edgeSoundThisTick) {
      this.edgeSoundThisTick = true;
      this.emit('sound', { sound: 'edge' });
    }
  }

  clearBallCurve() {
    this.state.ballCurve = 0;
    this.state.ballCurveRemaining = 0;
    this.state.ballCurveSource = null;
  }

  startBallCurve(source) {
    const state = this.state;
    if (!state.shotCurve || !CURVE_ATTACKERS.includes(source?.number)) return;
    state.ballCurve = state.shotCurve;
    state.ballCurveRemaining = BALL_CURVE_MAX_ANGLE;
    state.ballCurveSource = source;
  }

  applyBallCurve(dt) {
    const state = this.state;
    const ball = state.ball;
    if (!ball || state.ballCurve === 0 || state.ballCurveRemaining <= 0) return;
    if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
      this.clearBallCurve();
      return;
    }
    const step = Math.min(BALL_CURVE_RATE * dt, state.ballCurveRemaining);
    const angle = state.ballCurve * step;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const vx = ball.vx;
    const vy = ball.vy;
    ball.vx = vx * cosine - vy * sine;
    ball.vy = vx * sine + vy * cosine;
    state.ballCurveRemaining -= step;
    if (state.ballCurveRemaining <= 0.0001) this.clearBallCurve();
  }

  resolveCollision(a, b) {
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
      const involvesBall = a.type === 'ball' || b.type === 'ball';
      if (impactSpeed > 25) {
        if (involvesBall && !this.kickSoundThisTick) {
          this.kickSoundThisTick = true;
          this.emit('sound', { sound: 'kick' });
        } else if (!involvesBall && !this.pieceSoundThisTick) {
          this.pieceSoundThisTick = true;
          this.emit('sound', { sound: 'piece' });
        }
      }
      const restitution = involvesBall ? BALL_RESTITUTION : 0.7;
      const impulse = (-(1 + restitution) * relative) / (1 / a.mass + 1 / b.mass);
      a.vx -= (impulse / a.mass) * nx;
      a.vy -= (impulse / a.mass) * ny;
      b.vx += (impulse / b.mass) * nx;
      b.vy += (impulse / b.mass) * ny;
    }
    this.registerContact(a, b, nx, ny, Math.max(0, -relative));
    if (this.state.ballCurve !== 0) {
      const player = a.type === 'ball' ? b : b.type === 'ball' ? a : null;
      if (player?.type === 'player' && player !== this.state.ballCurveSource) this.clearBallCurve();
    }
  }

  registerContact(a, b, nx, ny, impactSpeed) {
    const state = this.state;
    const launched = state.launchPlayer;
    if (!launched) return;
    const other = a === launched ? b : b === launched ? a : null;
    if (!other) return;

    if (other.type === 'ball') {
      if (state.firstContact === null) state.firstContact = 'ball';
      if (state.firstContact === 'ball') {
        if (!state.ballTouched && this.isShootingZone(launched)) {
          const direction = a === launched ? 1 : -1;
          state.ball.vx += nx * direction * 155;
          state.ball.vy += ny * direction * 155;
          this.emit('banner', { text: 'Chute!', kind: 'neutral', duration: 600 });
        }
        if (!state.ballTouched) this.startBallCurve(launched);
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

  isShootingZone(player) {
    return player.team === 0 ? player.x > 1110 : player.x < 338;
  }

  checkBallBoundary(previousBall) {
    const state = this.state;
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
    if (hitEdge && !this.edgeSoundThisTick) {
      this.edgeSoundThisTick = true;
      this.emit('sound', { sound: 'edge' });
    }
  }

  settleImmediately() {
    for (const body of [...this.state.players, this.state.ball]) {
      body.vx = 0;
      body.vy = 0;
    }
    this.clearBallCurve();
    this.state.stillFrames = 0;
  }

  applyDiscipline() {
    const state = this.state;
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
    const label = `${this.sideLabel(team)} #${offender.number}`;
    const text = type === 'red'
      ? `${secondYellow ? 'Segundo amarelo · ' : 'Cartão vermelho · '}${label}`
      : type === 'yellow'
        ? `Cartão amarelo · ${label}`
        : `Falta · ${label}`;
    return { type, text, forfeit, team };
  }

  evaluatePlay(now) {
    const state = this.state;
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
      state.goalEndsMatch = this.isMatchOver();
      state.goalResumeAt = now + 2800;
      this.emit('goal', { team: outcome.team, text: `Gol · ${this.sideLabel(outcome.team)}!` });
      return;
    }

    if (state.foul) {
      const decision = this.applyDiscipline();
      const cancelledGoal = outcome?.type === 'goal';
      if (decision.forfeit) {
        state.score[1 - decision.team] = 3;
        this.emit('banner', {
          text: `Time sem jogadores · vitória de ${this.sideLabel(1 - decision.team)}`,
          kind: 'danger',
          duration: 1800,
        });
        this.finishMatch();
        return;
      }
      this.switchTurn();
      this.emit('discipline', {
        ...decision,
        text: `${cancelledGoal ? 'Gol anulado · ' : ''}${decision.text}`,
        decisionType: decision.type,
        cancelledGoal,
      });
    } else if (state.ballTouched && !state.ownBlock) {
      state.teamFoulStreak[actingTeam] = 0;
      state.touchesUsed += 1;
      if (state.touchesUsed >= 3) {
        this.switchTurn();
        this.emit('banner', { text: 'Três toques · troca de vez', kind: 'neutral', duration: 900 });
      } else {
        state.phase = 'ready';
        this.emit('banner', {
          text: `Bom toque · mais ${3 - state.touchesUsed}`,
          kind: 'neutral',
          duration: 750,
        });
      }
    } else {
      state.teamFoulStreak[actingTeam] = 0;
      this.switchTurn();
      this.emit('banner', {
        text: state.ownBlock ? 'Companheiro atingido · troca de vez' : 'Não tocou na bola · troca de vez',
        kind: 'neutral',
        duration: 1000,
      });
    }

    if (this.isMatchOver()) {
      this.finishMatch();
      return;
    }
    state.launchPlayer = null;
    state.shotCurve = 0;
    state.pendingOutcome = null;
  }

  switchTurn() {
    this.state.activeTeam = 1 - this.state.activeTeam;
    this.state.touchesUsed = 0;
    this.state.phase = 'ready';
  }

  isMatchOver() {
    return this.state.score.some((score) => score >= 3) || this.state.shots >= 40;
  }

  completeGoalCelebration() {
    const state = this.state;
    if (state.phase !== 'paused') return;
    if (state.goalEndsMatch) {
      state.goalEndsMatch = false;
      this.finishMatch();
      return;
    }
    state.goalEndsMatch = false;
    this.resetFormation();
    state.phase = 'ready';
    this.emit('goal-complete');
  }

  finishMatch() {
    if (this.state.phase === 'finished') return;
    this.state.shotCurve = 0;
    this.clearBallCurve();
    this.state.phase = 'finished';
    const [a, b] = this.state.score;
    const winner = a === b ? null : a > b ? 0 : 1;
    this.emit('match-finished', {
      winner,
      title: winner === null ? 'Empate de respeito!' : `${this.sideLabel(winner)} venceu!`,
      score: `${a} × ${b}`,
    });
  }
}

module.exports = {
  ServerGame,
  constants: {
    WIDTH,
    HEIGHT,
    FIELD,
    GOAL,
    GOAL_LINE,
    PENALTY_AREA,
    PLAYER_RADIUS,
    BALL_RADIUS,
    MAX_DRAG,
    MAX_SPEED,
    BALL_EDGE_RESTITUTION,
    BALL_RESTITUTION,
    BALL_CURVE_RATE,
    BALL_CURVE_MAX_ANGLE,
    CURVE_ATTACKERS,
    CARD_THRESHOLD,
    STOP_SPEED,
    FRICTION,
  },
};
