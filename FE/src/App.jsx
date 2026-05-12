import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import {
  calculateAccuracy,
  clamp,
  getJudgement,
  getJudgementLabel,
  summarizeChain,
} from './game';

const CHAIN_LENGTH = 3;
const chainSteps = ['plug', 'charge', 'sync'];
const stepLabels = {
  plug: 'Plug In',
  charge: 'Charge Hold',
  sync: 'Power Sync',
};
const stepInstructions = {
  plug: 'Tap when the plug lines up with the moving socket',
  charge: 'Tap when the charge fill reaches the target line',
  sync: 'Tap when the sync pulse locks into the narrow core',
};

const difficultyOptions = {
  easy: {
    label: 'Easy',
    speed: 0.046,
    acceleration: 0.03,
    perfectWindow: 0.6,
    distancePenalty: 2.8,
    obstaclePenalty: 8,
    targetSpeed: 0.012,
  },
  normal: {
    label: 'Normal',
    speed: 0.058,
    acceleration: 0.05,
    perfectWindow: 0.36,
    distancePenalty: 3.4,
    obstaclePenalty: 14,
    targetSpeed: 0.016,
  },
  hard: {
    label: 'Hard',
    speed: 0.072,
    acceleration: 0.07,
    perfectWindow: 0.22,
    distancePenalty: 4.1,
    obstaclePenalty: 20,
    targetSpeed: 0.021,
  },
};

const initialAuth = {
  mode: 'login',
  email: '',
  password: '',
  nickname: '',
};

function createPhase(index, difficulty, context = {}) {
  const stepType = chainSteps[index] ?? 'plug';
  const baseTarget = 42 + Math.random() * 16;
  const obstacleDirection = Math.random() > 0.5 ? 1 : -1;
  const obstacleOffset = 16 + Math.random() * 10;
  const chargerStartsLeft = index % 2 === 0;
  const gaugeTarget = clamp(34 + Math.random() * 32, 24, 76);
  const gaugeWidths = {
    easy: { charge: 18, sync: 12 },
    normal: { charge: 14, sync: 9 },
    hard: { charge: 10, sync: 6 },
  };
  const gaugeSpeeds = {
    easy: { charge: 0.08, sync: 0.11 },
    normal: { charge: 0.1, sync: 0.135 },
    hard: { charge: 0.125, sync: 0.16 },
  };

  if (stepType === 'charge') {
    return {
      id: `${difficulty}-${stepType}-${index}-${Date.now()}-${Math.random()}`,
      type: stepType,
      anchorPosition: context.anchorPosition ?? 50,
      targetPosition: gaugeTarget,
      targetWidth: gaugeWidths[difficulty][stepType],
      chargerPosition: 0,
      direction: 1,
      gaugeSpeed: gaugeSpeeds[difficulty][stepType],
      targetDirection: 0,
      obstaclePosition: -100,
      speedLevel: 1,
    };
  }

  if (stepType === 'sync') {
    const gaugeStartsLeft = Math.random() > 0.5;
    return {
      id: `${difficulty}-${stepType}-${index}-${Date.now()}-${Math.random()}`,
      type: stepType,
      anchorPosition: context.anchorPosition ?? 50,
      targetPosition: gaugeTarget,
      targetWidth: gaugeWidths[difficulty][stepType],
      chargerPosition: gaugeStartsLeft ? 6 : 94,
      direction: gaugeStartsLeft ? 1 : -1,
      gaugeSpeed: gaugeSpeeds[difficulty][stepType],
      targetDirection: 0,
      obstaclePosition: -100,
      speedLevel: 1,
    };
  }

  return {
    id: `${difficulty}-${index}-${Date.now()}-${Math.random()}`,
    type: stepType,
    targetPosition: clamp(baseTarget, 28, 72),
    targetDirection: Math.random() > 0.5 ? 1 : -1,
    obstaclePosition: clamp(baseTarget + obstacleDirection * obstacleOffset, 14, 86),
    chargerPosition: chargerStartsLeft ? 12 : 88,
    direction: chargerStartsLeft ? 1 : -1,
    speedLevel: 1 + index * 0.08,
  };
}

function getPhaseAccuracyOptions(phaseType, difficultyKey, baseConfig) {
  if (phaseType === 'charge') {
    const chargeProfiles = {
      easy: { perfectWindow: 1.8, distancePenalty: 3.2 },
      normal: { perfectWindow: 1.25, distancePenalty: 4.1 },
      hard: { perfectWindow: 0.85, distancePenalty: 5.1 },
    };
    return chargeProfiles[difficultyKey];
  }

  if (phaseType === 'sync') {
    const syncProfiles = {
      easy: { perfectWindow: 1.1, distancePenalty: 4.5 },
      normal: { perfectWindow: 0.72, distancePenalty: 5.4 },
      hard: { perfectWindow: 0.45, distancePenalty: 6.4 },
    };
    return syncProfiles[difficultyKey];
  }

  return baseConfig;
}

export default function App({ icons }) {
  const { BatteryCharging, LogOut, PlugZap, RotateCcw, Trophy } = icons;
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState(initialAuth);
  const [authError, setAuthError] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [screen, setScreen] = useState('start');
  const [gameState, setGameState] = useState('idle');
  const [isResultVisible, setIsResultVisible] = useState(false);
  const [difficulty, setDifficulty] = useState('normal');
  const [leaderboardDifficulty, setLeaderboardDifficulty] = useState('normal');
  const [chargerPosition, setChargerPosition] = useState(12);
  const [targetPosition, setTargetPosition] = useState(50);
  const [obstaclePosition, setObstaclePosition] = useState(28);
  const [direction, setDirection] = useState(1);
  const [targetDirection, setTargetDirection] = useState(1);
  const [result, setResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(null);
  const [phaseResults, setPhaseResults] = useState([]);
  const [phaseFlash, setPhaseFlash] = useState(null);
  const [displayBattery, setDisplayBattery] = useState(1);
  const isInNoise = gameState === 'playing' && Math.abs(chargerPosition - obstaclePosition) <= 8;
  const frameRef = useRef(null);
  const lastFrameRef = useRef(null);
  const resultTimerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const speedLevelRef = useRef(1);
  const beatSoundRef = useRef(null);
  const resultSoundRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const { accessToken: refreshedToken } = await api.refresh();
        if (!mounted) return;
        setAccessToken(refreshedToken);
        const me = await api.me(refreshedToken);
        if (!mounted) return;
        setUser(me.user);
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        if (mounted) setIsBooting(false);
      }
    }

    boot();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const tick = (time) => {
      const lastFrame = lastFrameRef.current ?? time;
      const delta = Math.min(time - lastFrame, 32);
      lastFrameRef.current = time;
      const config = difficultyOptions[difficulty];
      if (!currentPhase) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      if (currentPhase.type === 'charge') {
        setChargerPosition((position) => {
          const nextPosition = position + delta * currentPhase.gaugeSpeed;
          return Math.min(nextPosition, 100);
        });

        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      if (currentPhase.type === 'sync') {
        setChargerPosition((position) => {
          let nextPosition = position + direction * delta * currentPhase.gaugeSpeed;
          let nextDirection = direction;

          if (nextPosition >= 96) {
            nextPosition = 96;
            nextDirection = -1;
          }
          if (nextPosition <= 4) {
            nextPosition = 4;
            nextDirection = 1;
          }
          if (nextDirection !== direction) {
            setDirection(nextDirection);
          }
          return nextPosition;
        });

        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      setChargerPosition((position) => {
        let nextPosition = position + direction * delta * config.speed * speedLevelRef.current;
        let nextDirection = direction;

        if (nextPosition >= 88) {
          nextPosition = 88;
          nextDirection = -1;
          speedLevelRef.current += config.acceleration;
        }
        if (nextPosition <= 12) {
          nextPosition = 12;
          nextDirection = 1;
          speedLevelRef.current += config.acceleration;
        }
        if (nextDirection !== direction) {
          setDirection(nextDirection);
        }
        return nextPosition;
      });

      setTargetPosition((position) => {
        let nextPosition = position + targetDirection * delta * config.targetSpeed;
        let nextDirection = targetDirection;

        if (nextPosition >= 70) {
          nextPosition = 70;
          nextDirection = -1;
        }
        if (nextPosition <= 30) {
          nextPosition = 30;
          nextDirection = 1;
        }
        if (nextDirection !== targetDirection) {
          setTargetDirection(nextDirection);
        }
        return nextPosition;
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      lastFrameRef.current = null;
    };
  }, [difficulty, direction, gameState, targetDirection]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (gameState !== 'playing') return;
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        stopCharger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    if (gameState !== 'playing' || currentPhase?.type !== 'charge') return;
    if (chargerPosition < 100) return;
    resolvePhase(100);
  }, [chargerPosition, currentPhase, gameState]);

  useEffect(() => {
    loadLeaderboard();
  }, [leaderboardDifficulty]);

  useEffect(() => {
    return () => {
      clearTimeout(resultTimerRef.current);
      clearTimeout(phaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const beatSound = new Audio('/beat-pop.mp3');
    beatSound.preload = 'auto';
    beatSound.volume = 0.12;
    beatSoundRef.current = beatSound;
    const resultSound = new Audio('/charge-tick.mp3');
    resultSound.preload = 'auto';
    resultSound.volume = 0.14;
    resultSoundRef.current = resultSound;

    return () => {
      beatSound.pause();
      resultSound.pause();
      beatSoundRef.current = null;
      resultSoundRef.current = null;
    };
  }, []);

  async function loadLeaderboard() {
    setLeaderboardError('');
    try {
      const data = await api.leaderboard(10, leaderboardDifficulty);
      setLeaderboard(data.entries ?? []);
    } catch (error) {
      setLeaderboardError(error.message);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setIsSubmittingAuth(true);

    try {
      const payload = {
        email: authForm.email,
        password: authForm.password,
        ...(authForm.mode === 'register' ? { nickname: authForm.nickname } : {}),
      };

      const data =
        authForm.mode === 'register'
          ? await api.register(payload)
          : await api.login(payload);
      setAccessToken(data.accessToken);
      setUser(data.user);
      setAuthForm(initialAuth);
      setScreen('start');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    setAccessToken(null);
    setUser(null);
    setResult(null);
    setGameState('idle');
    setScreen('start');
  }

  function goToStart() {
    clearTimeout(resultTimerRef.current);
    clearTimeout(phaseTimerRef.current);
    setGameState('idle');
    setResult(null);
    setPhaseFlash(null);
    setPhaseResults([]);
    setPhaseIndex(0);
    setCurrentPhase(null);
    setDisplayBattery(1);
    setIsResultVisible(false);
    setScreen('start');
  }

  function applyPhase(nextPhase, nextIndex, nextResults = []) {
    setCurrentPhase(nextPhase);
    setPhaseIndex(nextIndex);
    setPhaseResults(nextResults);
    setPhaseFlash(null);
    setTargetPosition(nextPhase.targetPosition);
    setTargetDirection(nextPhase.targetDirection);
    setObstaclePosition(nextPhase.obstaclePosition);
    setChargerPosition(nextPhase.chargerPosition);
    setDirection(nextPhase.direction);
    speedLevelRef.current = nextPhase.speedLevel;
  }

  function startGame() {
    clearTimeout(resultTimerRef.current);
    clearTimeout(phaseTimerRef.current);
    const openingPhase = createPhase(0, difficulty);
    applyPhase(openingPhase, 0, []);
    setScreen('game');
    setGameState('playing');
    setIsResultVisible(false);
    setResult(null);
    setDisplayBattery(1);
  }

  function queueNextPhase(nextResults, nextBattery, context = {}) {
    const nextIndex = nextResults.length;
    if (nextIndex >= CHAIN_LENGTH) {
      finalizeRun(nextResults, nextBattery);
      return;
    }

    const nextPhase = createPhase(nextIndex, difficulty, context);
    phaseTimerRef.current = window.setTimeout(() => {
      applyPhase(nextPhase, nextIndex, nextResults);
      setGameState('playing');
    }, 260);
  }

  function playBeatSound(accuracy) {
    const beatSound = beatSoundRef.current;
    if (!beatSound) return;

    beatSound.pause();
    beatSound.currentTime = 0;
    beatSound.playbackRate = accuracy >= 90 ? 1.18 : accuracy >= 70 ? 1.06 : 0.96;
    beatSound.volume = accuracy >= 90 ? 0.16 : accuracy >= 70 ? 0.13 : 0.1;
    beatSound.play().catch(() => {});
  }

  function playResultSound(accuracy) {
    const resultSound = resultSoundRef.current;
    if (!resultSound) return;

    resultSound.pause();
    resultSound.currentTime = 0;
    resultSound.playbackRate = accuracy >= 90 ? 1 : 0.94;
    resultSound.volume = accuracy >= 90 ? 0.18 : accuracy >= 70 ? 0.13 : 0.08;
    resultSound.play().catch(() => {});
  }

  async function finalizeRun(phases, chargedBattery) {
    const config = difficultyOptions[difficulty];
    const summary = summarizeChain(phases);
    const judgement = getJudgement(summary.accuracy);
    playResultSound(summary.accuracy);

    setGameState('result');
    setDisplayBattery(chargedBattery ?? summary.accuracy);
    setResult({
      accuracy: summary.accuracy,
      rawAccuracy: summary.averageAccuracy,
      judgement,
      rank: null,
      saveError: '',
      isSaved: false,
      difficulty: config.label,
      phases,
      consistencyBonus: summary.consistencyBonus,
      perfectCount: summary.perfectCount,
      obstacleHits: summary.obstacleHits,
    });
    resultTimerRef.current = window.setTimeout(() => setIsResultVisible(true), 700);
    setIsSavingScore(true);

    try {
      const data = await api.saveScore(accessToken, summary.accuracy, difficulty);
      setResult((current) => ({
        ...current,
        rank: data.entry.rank,
        isSaved: true,
      }));
      await loadLeaderboard();
    } catch (error) {
      setResult((current) => ({
        ...current,
        saveError: error.message,
      }));
    } finally {
      setIsSavingScore(false);
    }
  }

  function resolvePhase(inputPosition = chargerPosition) {
    if (gameState !== 'playing') return;
    const config = difficultyOptions[difficulty];
    const accuracyConfig = getPhaseAccuracyOptions(currentPhase?.type, difficulty, config);
    const rawAccuracy = calculateAccuracy(inputPosition, targetPosition, accuracyConfig);
    const obstacleDistance = Math.abs(inputPosition - obstaclePosition);
    const obstacleHit = currentPhase?.type === 'plug' ? obstacleDistance <= 5 : false;
    const phaseAccuracy = clamp(rawAccuracy - (obstacleHit ? config.obstaclePenalty : 0), 0, 100);
    const phaseJudgement = getJudgement(phaseAccuracy);
    const nextResults = [
      ...phaseResults,
      {
        step: phaseIndex + 1,
        type: currentPhase?.type ?? 'plug',
        label: stepLabels[currentPhase?.type ?? 'plug'],
        accuracy: phaseAccuracy,
        rawAccuracy,
        obstacleHit,
        judgement: phaseJudgement,
      },
    ];
    const chainAverage = Math.round(
      nextResults.reduce((total, phase) => total + phase.accuracy, 0) / nextResults.length,
    );
    const nextBattery = clamp(
      Math.round((chainAverage * nextResults.length) / CHAIN_LENGTH),
      1,
      100,
    );
    const transitionAnchor =
      currentPhase?.type === 'plug'
        ? targetPosition
        : currentPhase?.anchorPosition ?? 50;

    setDisplayBattery(nextBattery);
    setPhaseResults(nextResults);
    setGameState('transition');
    phaseTimerRef.current = window.setTimeout(() => {
      playBeatSound(phaseAccuracy);
      queueNextPhase(nextResults, nextBattery, { anchorPosition: transitionAnchor });
    }, 420);
  }

  function stopCharger() {
    resolvePhase(chargerPosition);
  }

  const liveBattery = result?.accuracy ?? displayBattery;
  const currentStepType = currentPhase?.type ?? chainSteps[phaseIndex] ?? 'plug';
  const currentStepLabel = stepLabels[currentStepType];
  const currentInstruction = stepInstructions[currentStepType];
  const gaugeTargetStart = clamp(targetPosition - (currentPhase?.targetWidth ?? 10) / 2, 4, 92);
  const gaugeTargetWidth = currentPhase?.targetWidth ?? 10;

  if (isBooting) {
    return (
      <main className="app-shell centered">
        <div className="boot-mark">
          <BatteryCharging size={42} />
          <span>Preparing charge</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell auth-shell">
        <section className="auth-panel">
          <div className="brand-lockup">
            <div className="brand-icon">
              <PlugZap size={30} />
            </div>
            <div>
              <p>CHARGE TIMING</p>
              <h1>Plug Rush</h1>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) =>
                  setAuthForm((form) => ({ ...form, email: event.target.value }))
                }
                placeholder="player@example.com"
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) =>
                  setAuthForm((form) => ({ ...form, password: event.target.value }))
                }
                placeholder="Game1234!"
                autoComplete={
                  authForm.mode === 'register' ? 'new-password' : 'current-password'
                }
              />
            </label>
            {authForm.mode === 'register' && (
              <label>
                Nickname
                <input
                  value={authForm.nickname}
                  onChange={(event) =>
                    setAuthForm((form) => ({
                      ...form,
                      nickname: event.target.value,
                    }))
                  }
                  placeholder="player1"
                  autoComplete="nickname"
                />
              </label>
            )}
            {authForm.mode === 'register' && (
              <p className="field-hint">
                Password needs 8+ chars with uppercase, lowercase, number, and symbol.
              </p>
            )}
            {authError && <p className="error-text">{authError}</p>}
            <button className="primary-button" disabled={isSubmittingAuth}>
              {authForm.mode === 'register' ? 'Create account' : 'Log in'}
            </button>
          </form>

          <button
            className="link-button"
            onClick={() =>
              setAuthForm((form) => ({
                ...form,
                mode: form.mode === 'register' ? 'login' : 'register',
              }))
            }
          >
            {authForm.mode === 'register' ? 'Switch to login' : 'Create account'}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <button className="brand-lockup compact brand-home-button" onClick={goToStart}>
          <div className="brand-icon">
            <PlugZap size={24} />
          </div>
          <div>
            <p>PLUG RUSH</p>
            <strong>{user.nickname}</strong>
          </div>
        </button>
        <button className="icon-button" aria-label="Log out" onClick={handleLogout}>
          <LogOut size={20} />
        </button>
      </header>

      {screen === 'start' && (
        <section className="start-stage">
          <div className="battery-hero">
            <BatteryCharging size={78} />
            <span>1%</span>
          </div>
          <h1>Plug it clean</h1>
          <p className="start-copy">3-beat rhythm chain. Stop the plug three times and build one clean charge.</p>
          <div className="difficulty-picker" aria-label="Difficulty">
            {Object.entries(difficultyOptions).map(([key, option]) => (
              <button
                key={key}
                className={difficulty === key ? 'active' : ''}
                onClick={() => setDifficulty(key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="start-actions">
            <button className="primary-button huge" onClick={startGame}>
              Start
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setLeaderboardDifficulty(difficulty);
                setScreen('leaderboard');
              }}
            >
              <Trophy size={18} />
              Leaderboard
            </button>
          </div>
        </section>
      )}

      {screen === 'game' && (
        <section
          className={`game-stage ${isInNoise ? 'noise-active' : ''} ${
            gameState === 'transition' ? 'phase-transition' : ''
          }`}
          onPointerDown={gameState === 'playing' ? stopCharger : undefined}
        >
          <div className="battery-meter" aria-label={`Battery ${liveBattery}%`}>
            <div style={{ width: `${liveBattery}%` }} />
          </div>
          <div className="battery-meter-label">
            <strong>BATTERY</strong>
            <span>{liveBattery}%</span>
          </div>

          <div className="phase-hud">
            <strong>
              {currentStepLabel} {Math.min(phaseIndex + 1, CHAIN_LENGTH)}/{CHAIN_LENGTH}
            </strong>
            <span>
              {gameState === 'transition'
                ? 'Switching to the next step'
                : currentInstruction}
            </span>
          </div>

          <div className="chain-meter" aria-label="Charge chain progress">
            {Array.from({ length: CHAIN_LENGTH }, (_, index) => {
              const phase = phaseResults[index];
              const isActive = !phase && index === phaseIndex && gameState !== 'result';
              return (
                <div
                  key={index}
                  className={[
                    'chain-node',
                    phase ? `judgement-${phase.judgement.toLowerCase()}` : '',
                    isActive ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span>{phase ? `${phase.accuracy}%` : stepLabels[chainSteps[index]].slice(0, 2).toUpperCase()}</span>
                </div>
              );
            })}
          </div>

          {gameState !== 'result' && currentStepType === 'plug' ? (
            <>
              <div className="hazard-zone" style={{ left: `${obstaclePosition}%` }}>
                <span />
                <strong>NOISE</strong>
              </div>

              {isInNoise && <div className="noise-alert" aria-hidden="true">NOISE</div>}

              <div className="socket socket-moving" style={{ left: `${targetPosition}%` }}>
                <div className="socket-hole" />
                <div className="socket-hole" />
              </div>

              <div className="target-orbit" style={{ left: `${targetPosition}%` }} aria-hidden="true" />

              <div className="track">
                <div
                  className={[
                    'charger',
                    gameState === 'transition' || gameState === 'result' ? 'stopped' : '',
                    isInNoise ? 'in-noise' : '',
                    result ? `judgement-${result.judgement.toLowerCase()}` : '',
                    result?.accuracy === 100 ? 'accuracy-perfect' : '',
                    result?.accuracy >= 95 && result?.accuracy < 100 ? 'accuracy-super' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: `${chargerPosition}%` }}
                >
                  <span className="charger-head" />
                  <span className="charger-cable" />
                </div>
              </div>
            </>
          ) : gameState !== 'result' && currentStepType === 'charge' ? (
            <div className="timing-stage timing-charge">
              <div className="charge-stage-shell">
                <div className="charge-stage-top">
                  <div className="charge-stage-copy">
                    <p>{currentStepLabel}</p>
                    <strong>Hit the line as the charge rises</strong>
                    <span>One pass only. Miss it and the charge spills past.</span>
                  </div>
                  <div
                    className="plug-anchor-scene compact"
                    style={{ left: `${currentPhase?.anchorPosition ?? 50}%` }}
                  >
                    <div className="socket socket-anchored">
                      <div className="socket-hole" />
                      <div className="socket-hole" />
                    </div>
                    <div className="charger charger-plugged plugged-visual">
                      <span className="charger-head" />
                      <span className="charger-cable" />
                    </div>
                  </div>
                </div>
                <div className="charge-lane-shell">
                  <div className="charge-lane-labels">
                    <span>0%</span>
                    <strong>TARGET</strong>
                    <span>100%</span>
                  </div>
                  <div className="charge-lane">
                    <div className="charge-lane-track" />
                    <div className="charge-lane-fill" style={{ width: `${chargerPosition}%` }} />
                    <div className="charge-lane-glow" style={{ left: `${chargerPosition}%` }} />
                    <div className="charge-target-line" style={{ left: `${targetPosition}%` }} />
                    <div
                      className="charge-target-band"
                      style={{ left: `${gaugeTargetStart}%`, width: `${gaugeTargetWidth}%` }}
                    />
                  </div>
                  <p className="charge-lane-hint">Tap as the fill reaches the center line.</p>
                </div>
              </div>
            </div>
          ) : gameState !== 'result' ? (
            <div className={`timing-stage timing-${currentStepType}`}>
              <div className="timing-stage-header">
                <p>{currentStepLabel}</p>
                <strong>Hit the sync core</strong>
              </div>
              <div className="timing-lane">
                <div
                  className={`timing-target timing-target-${currentStepType}`}
                  style={{ left: `${gaugeTargetStart}%`, width: `${gaugeTargetWidth}%` }}
                />
                <div
                  className={`timing-cursor timing-cursor-${currentStepType}`}
                  style={{ left: `${chargerPosition}%` }}
                />
              </div>
            </div>
          ) : null}

          {gameState === 'playing' && <p className="tap-label">TAP</p>}

          {gameState === 'result' && result && isResultVisible && (
            <ResultPanel
              result={result}
              isSavingScore={isSavingScore}
              onRetry={startGame}
              onLeaderboard={() => {
                setLeaderboardDifficulty(difficulty);
                setScreen('leaderboard');
              }}
              RotateCcw={RotateCcw}
              Trophy={Trophy}
            />
          )}
        </section>
      )}

      {screen === 'leaderboard' && (
        <LeaderboardPanel
          entries={leaderboard}
          error={leaderboardError}
          activeDifficulty={leaderboardDifficulty}
          difficultyOptions={difficultyOptions}
          onDifficultyChange={setLeaderboardDifficulty}
          onReload={loadLeaderboard}
          onBack={() => setScreen('start')}
          Trophy={Trophy}
        />
      )}
    </main>
  );
}

function ResultPanel({ result, isSavingScore, onRetry, onLeaderboard, RotateCcw, Trophy }) {
  const showBurst = result.accuracy >= 90;
  return (
    <div
      className={[
        'result-panel',
        `judgement-${result.judgement.toLowerCase()}`,
        result.accuracy === 100 ? 'accuracy-perfect' : '',
        result.accuracy >= 95 && result.accuracy < 100 ? 'accuracy-super' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={`result-effect effect-${result.judgement.toLowerCase()}`} aria-hidden="true" />
      {showBurst && <div className="success-burst" aria-hidden="true" />}
      <div className="score-readout">
        <strong>{result.accuracy}%</strong>
        <span>{getJudgementLabel(result.judgement)}</span>
      </div>
      <div className="charge-result">
        <div style={{ width: `${result.accuracy}%` }} />
      </div>
      <div className="phase-summary">
        {result.phases.map((phase) => (
          <div key={phase.step} className={`phase-pill judgement-${phase.judgement.toLowerCase()}`}>
            <span>{phase.label}</span>
            <strong>{phase.accuracy}%</strong>
          </div>
        ))}
      </div>
      <p>
        {isSavingScore
          ? 'Saving score'
          : result.saveError
            ? result.saveError
            : `Current rank #${result.rank}`}
      </p>
      <p className="result-meta">
        {result.difficulty} chain average {result.rawAccuracy}%
        {result.consistencyBonus > 0 ? ` | consistency +${result.consistencyBonus}` : ''}
        {result.obstacleHits > 0 ? ` | noise hits ${result.obstacleHits}` : ''}
      </p>
      <div className="result-actions">
        <button className="primary-button" onClick={onRetry}>
          <RotateCcw size={18} />
          Retry
        </button>
        <button className="secondary-button" onClick={onLeaderboard}>
          <Trophy size={18} />
          Leaderboard
        </button>
      </div>
    </div>
  );
}

function LeaderboardPanel({
  entries,
  error,
  activeDifficulty,
  difficultyOptions,
  onDifficultyChange,
  onReload,
  onBack,
  Trophy,
}) {
  return (
    <section className="leaderboard-stage">
      <div className="section-heading">
        <Trophy size={26} />
        <div>
          <p>TOP 10</p>
          <h1>Leaderboard</h1>
        </div>
      </div>
      <div className="leaderboard-tabs" aria-label="Leaderboard difficulty">
        {Object.entries(difficultyOptions).map(([key, option]) => (
          <button
            key={key}
            className={activeDifficulty === key ? 'active' : ''}
            onClick={() => onDifficultyChange(key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && (
        <div className="empty-state">
          <p>{error}</p>
          <button className="secondary-button" onClick={onReload}>
            Reload
          </button>
        </div>
      )}
      {!error && (
        <ol className="leaderboard-list">
          {entries.map((entry) => (
            <li key={entry.id} className={entry.rank <= 3 ? 'podium' : ''}>
              <span className="rank">#{entry.rank}</span>
              <span className="nickname">{entry.nickname}</span>
              <span className="accuracy">{entry.accuracy}%</span>
              <span className="judgement">{getJudgementLabel(entry.judgement)}</span>
            </li>
          ))}
        </ol>
      )}
      {!error && entries.length === 0 && <div className="empty-state">No scores yet.</div>}
      <button className="secondary-button wide" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
