import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { calculateAccuracy, clamp, getJudgement, getJudgementLabel } from './game';

const difficultyOptions = {
  easy: {
    label: 'Easy',
    speed: 0.046,
    acceleration: 0.035,
    perfectWindow: 0.55,
    distancePenalty: 2.9,
    obstaclePenalty: 10,
  },
  normal: {
    label: 'Normal',
    speed: 0.058,
    acceleration: 0.055,
    perfectWindow: 0.34,
    distancePenalty: 3.5,
    obstaclePenalty: 15,
  },
  hard: {
    label: 'Hard',
    speed: 0.072,
    acceleration: 0.075,
    perfectWindow: 0.2,
    distancePenalty: 4.15,
    obstaclePenalty: 22,
  },
};

const initialAuth = {
  mode: 'login',
  email: '',
  password: '',
  nickname: '',
};

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
  const [chargerPosition, setChargerPosition] = useState(12);
  const [targetPosition, setTargetPosition] = useState(50);
  const [obstaclePosition, setObstaclePosition] = useState(28);
  const [direction, setDirection] = useState(1);
  const [result, setResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [combo, setCombo] = useState(0);
  const frameRef = useRef(null);
  const lastFrameRef = useRef(null);
  const resultTimerRef = useRef(null);
  const speedLevelRef = useRef(1);

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

      setChargerPosition((position) => {
        const config = difficultyOptions[difficulty];
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

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameRef.current);
      lastFrameRef.current = null;
    };
  }, [difficulty, direction, gameState]);

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
  }, []);

  async function loadLeaderboard() {
    setLeaderboardError('');
    try {
      const data = await api.leaderboard(10);
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

  function startGame() {
    const nextTarget = Math.round(35 + Math.random() * 30);
    const obstacleDirection = Math.random() > 0.5 ? 1 : -1;
    const nextObstacle = clamp(nextTarget + obstacleDirection * (14 + Math.random() * 18), 14, 86);
    setScreen('game');
    setGameState('playing');
    setIsResultVisible(false);
    clearTimeout(resultTimerRef.current);
    setResult(null);
    setTargetPosition(nextTarget);
    setObstaclePosition(nextObstacle);
    setChargerPosition(12);
    setDirection(1);
    speedLevelRef.current = 1;
  }

  async function stopCharger() {
    if (gameState !== 'playing') return;
    const config = difficultyOptions[difficulty];
    const rawAccuracy = calculateAccuracy(chargerPosition, targetPosition, config);
    const obstacleDistance = Math.abs(chargerPosition - obstaclePosition);
    const obstacleHit = obstacleDistance <= 5;
    const comboBonus = rawAccuracy >= 90 ? Math.min(combo * 2, 6) : 0;
    const accuracy = clamp(
      rawAccuracy + comboBonus - (obstacleHit ? config.obstaclePenalty : 0),
      0,
      100,
    );
    const judgement = getJudgement(accuracy);
    setCombo((currentCombo) => (accuracy >= 90 ? currentCombo + 1 : 0));
    setGameState('result');
    setResult({
      accuracy,
      rawAccuracy,
      judgement,
      rank: null,
      saveError: '',
      isSaved: false,
      obstacleHit,
      comboBonus,
      difficulty: config.label,
    });
    resultTimerRef.current = window.setTimeout(() => setIsResultVisible(true), 900);
    setIsSavingScore(true);

    try {
      const data = await api.saveScore(accessToken, accuracy);
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
            <button className="secondary-button" onClick={() => setScreen('leaderboard')}>
              <Trophy size={18} />
              Leaderboard
            </button>
          </div>
        </section>
      )}

      {screen === 'game' && (
        <section className="game-stage" onPointerDown={stopCharger}>
          <div className="battery-meter" aria-label="Battery 1%">
            <div style={{ width: `${result?.accuracy ?? 1}%` }} />
          </div>
          <div className="hazard-zone" style={{ left: `${obstaclePosition}%` }}>
            <span />
            <strong>NOISE</strong>
          </div>
          <div className="combo-chip">
            {difficultyOptions[difficulty].label} · Combo x{combo}
          </div>
          <div className="socket" style={{ left: `${targetPosition}%` }}>
            <div className="socket-hole" />
            <div className="socket-hole" />
          </div>
          <div className="track">
            <div className="target-line" />
            <div
              className={[
                'charger',
                gameState === 'result' ? 'stopped' : '',
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
          {gameState === 'result' && result && isResultVisible && (
            <ResultPanel
              result={result}
              isSavingScore={isSavingScore}
              onRetry={startGame}
              onLeaderboard={() => setScreen('leaderboard')}
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
      <p>
        {isSavingScore
          ? 'Saving score'
          : result.saveError
            ? result.saveError
            : `Current rank #${result.rank}`}
      </p>
      <p className="result-meta">
        {result.difficulty}
        {result.comboBonus > 0 ? ` · Combo bonus +${result.comboBonus}` : ''}
        {result.obstacleHit ? ` · Noise penalty` : ''}
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

function LeaderboardPanel({ entries, error, onReload, onBack, Trophy }) {
  return (
    <section className="leaderboard-stage">
      <div className="section-heading">
        <Trophy size={26} />
        <div>
          <p>TOP 10</p>
          <h1>Leaderboard</h1>
        </div>
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
      {!error && entries.length === 0 && (
        <div className="empty-state">No scores yet.</div>
      )}
      <button className="secondary-button wide" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
