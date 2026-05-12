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

function createPhase(index, difficulty) {
  const baseTarget = 42 + Math.random() * 16;
  const obstacleDirection = Math.random() > 0.5 ? 1 : -1;
  const obstacleOffset = 16 + Math.random() * 10;
  const chargerStartsLeft = index % 2 === 0;

  return {
    id: `${difficulty}-${index}-${Date.now()}-${Math.random()}`,
    targetPosition: clamp(baseTarget, 28, 72),
    targetDirection: Math.random() > 0.5 ? 1 : -1,
    obstaclePosition: clamp(baseTarget + obstacleDirection * obstacleOffset, 14, 86),
    chargerPosition: chargerStartsLeft ? 12 : 88,
    direction: chargerStartsLeft ? 1 : -1,
    speedLevel: 1 + index * 0.08,
  };
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
  const [phaseResults, setPhaseResults] = useState([]);
  const [phaseFlash, setPhaseFlash] = useState(null);
  const isInNoise = gameState === 'playing' && Math.abs(chargerPosition - obstaclePosition) <= 8;
  const frameRef = useRef(null);
  const lastFrameRef = useRef(null);
  const resultTimerRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const speedLevelRef = useRef(1);
  const currentPhaseRef = useRef(null);
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

  function applyPhase(nextPhase, nextIndex, nextResults = []) {
    currentPhaseRef.current = nextPhase;
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
  }

  function queueNextPhase(nextResults) {
    const nextIndex = nextResults.length;
    if (nextIndex >= CHAIN_LENGTH) {
      finalizeRun(nextResults);
      return;
    }

    const nextPhase = createPhase(nextIndex, difficulty);
    phaseTimerRef.current = window.setTimeout(() => {
      applyPhase(nextPhase, nextIndex, nextResults);
      setGameState('playing');
    }, 850);
  }

  function playBeatSound(accuracy) {
    const beatSound = beatSoundRef.current;
    if (!beatSound) return;

    beatSound.pause();
    beatSound.currentTime = 0;
    beatSound.playbackRate = accuracy >= 90 ? 1.06 : accuracy >= 70 ? 1.02 : 0.98;
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

  async function finalizeRun(phases) {
    const config = difficultyOptions[difficulty];
    const summary = summarizeChain(phases);
    const judgement = getJudgement(summary.accuracy);
    playResultSound(summary.accuracy);

    setGameState('result');
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

  function stopCharger() {
    if (gameState !== 'playing') return;
    const config = difficultyOptions[difficulty];
    const rawAccuracy = calculateAccuracy(chargerPosition, targetPosition, config);
    const obstacleDistance = Math.abs(chargerPosition - obstaclePosition);
    const obstacleHit = obstacleDistance <= 5;
    const phaseAccuracy = clamp(rawAccuracy - (obstacleHit ? config.obstaclePenalty : 0), 0, 100);
    const phaseJudgement = getJudgement(phaseAccuracy);
    const nextResults = [
      ...phaseResults,
      {
        step: phaseIndex + 1,
        accuracy: phaseAccuracy,
        rawAccuracy,
        obstacleHit,
        judgement: phaseJudgement,
      },
    ];

    playBeatSound(phaseAccuracy);
    setPhaseResults(nextResults);
    setPhaseFlash({
      step: phaseIndex + 1,
      accuracy: phaseAccuracy,
      judgement: phaseJudgement,
      obstacleHit,
    });
    setGameState('transition');
    queueNextPhase(nextResults);
  }

  const progressRatio =
    gameState === 'result'
      ? 1
      : clamp((phaseResults.length + (gameState === 'transition' ? 1 : 0)) / CHAIN_LENGTH, 0, 1);
  const liveBattery = result?.accuracy ?? Math.max(1, Math.round(progressRatio * 100));

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
        <div className="brand-lockup compact">
          <div className="brand-icon">
            <PlugZap size={24} />
          </div>
          <div>
            <p>PLUG RUSH</p>
            <strong>{user.nickname}</strong>
          </div>
        </div>
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

          <div className="phase-hud">
            <strong>
              Beat {Math.min(phaseIndex + 1, CHAIN_LENGTH)}/{CHAIN_LENGTH}
            </strong>
            <span>
              {gameState === 'transition'
                ? 'Hold the rhythm'
                : 'Tap when the plug lines up with the moving socket'}
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
                  <span>{phase ? `${phase.accuracy}%` : `0${index + 1}`}</span>
                </div>
              );
            })}
          </div>

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

          {gameState === 'playing' && <p className="tap-label">TAP</p>}

          {gameState === 'transition' && phaseFlash && (
            <div className={`phase-card judgement-${phaseFlash.judgement.toLowerCase()}`}>
              <p>Beat {phaseFlash.step} locked</p>
              <strong>{phaseFlash.accuracy}%</strong>
              <span>{getJudgementLabel(phaseFlash.judgement)}</span>
              {phaseFlash.obstacleHit && <em>Noise penalty applied</em>}
            </div>
          )}

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
            <span>Beat {phase.step}</span>
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
