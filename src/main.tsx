import '@xyflow/react/dist/base.css';
import './styles/app.css';
import './styles/phase3.css';
import './styles/phase4.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startTodayClock } from './app/today';
import { watchForUpdates } from './app/updates';

watchForUpdates();
startTodayClock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
