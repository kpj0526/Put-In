import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { calculateAccuracy, getJudgement, getJudgementLabel } from './game';

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
  const [authNotice, setAuthNotice] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [screen, setScreen] = useState('start');
  const [gameState, setGameState] = useState('idle');
  const [chargerPosition, setChargerPosition] = useState(12);
  const [direction, setDirection] = useState(1);
  const [result, setResult] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardError, setLeaderboardError] = useState('');
  const [isSavingScore, setIsSavingScore] = useState(false);
  const frameRef = useRef(null);
  const lastFrameRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get('verifyToken');

    async function boot() {
      try {
        if (verifyToken) {
          const data = await api.verifyEmail(verifyToken);
          if (!mounted) return;
          setAccessToken(data.accessToken);
          setUser(data.user);
          setAuthNotice('Email verified. You are signed in.');
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

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
        let nextPosition = position + direction * delta * 0.045;
        let nextDirection = direction;
        if (nextPosition >= 88) {
          nextPosition = 88;
          nextDirection = -1;
        }
        if (nextPosition <= 12) {
          nextPosition = 12;
          nextDirection = 1;
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
  }, [direction, gameState]);

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
    setAuthNotice('');
    setIsSubmittingAuth(true);

    try {
      const payload = {
        email: authForm.email,
        password: authForm.password,
        ...(authForm.mode === 'register' ? { nickname: authForm.nickname } : {}),
      };

      if (authForm.mode === 'register') {
        await api.register(payload);
        setPendingEmail(payload.email);
        setAuthNotice('Verification email sent. Check your inbox.');
        setAuthForm({ ...initialAuth, email: payload.email });
        return;
      }

      const data = await api.login(payload);
      setAccessToken(data.accessToken);
      setUser(data.user);
      setAuthForm(initialAuth);
      setScreen('start');
    } catch (error) {
      setAuthError(error.message);
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        setPendingEmail(authForm.email);
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function resendVerification() {
    const email = pendingEmail || authForm.email;
    if (!email) return;
    setAuthError('');
    setAuthNotice('');
    try {
      await api.resendVerification(email);
      setAuthNotice('Verification email sent again.');
    } catch (error) {
      setAuthError(error.message);
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
    setScreen('game');
    setGameState('playing');
    setResult(null);
    setChargerPosition(12);
    setDirection(1);
  }

  async function stopCharger() {
    if (gameState !== 'playing') return;
    const accuracy = calculateAccuracy(chargerPosition);
    const judgement = getJudgement(accuracy);
    setGameState('result');
    setResult({
      accuracy,
      judgement,
      rank: null,
      saveError: '',
      isSaved: false,
    });
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
            {authNotice && <p className="success-text">{authNotice}</p>}
            {authError && <p className="error-text">{authError}</p>}
            <button className="primary-button" disabled={isSubmittingAuth}>
              {authForm.mode === 'register' ? 'Create account' : 'Log in'}
            </button>
          </form>

          {(pendingEmail || authError === 'Please verify your email before logging in.') && (
            <button className="secondary-button wide auth-extra" onClick={resendVerification}>
              Resend verification email
            </button>
          )}

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
          <div className="socket">
            <div className="socket-hole" />
            <div className="socket-hole" />
          </div>
          <div className="track">
            <div className="target-line" />
            <div
              className={`charger ${gameState === 'result' ? 'stopped' : ''}`}
              style={{ left: `${chargerPosition}%` }}
            >
              <span className="charger-head" />
              <span className="charger-cable" />
            </div>
          </div>
          {gameState === 'playing' && <p className="tap-label">TAP</p>}
          {gameState === 'result' && result && (
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
  return (
    <div className={`result-panel judgement-${result.judgement.toLowerCase()}`}>
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
