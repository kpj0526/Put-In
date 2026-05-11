import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BatteryCharging, LogOut, PlugZap, RotateCcw, Trophy } from 'lucide-react';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App
      icons={{
        BatteryCharging,
        LogOut,
        PlugZap,
        RotateCcw,
        Trophy,
      }}
    />
  </StrictMode>,
);
