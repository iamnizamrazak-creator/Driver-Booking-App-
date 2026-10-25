import { createRoot } from 'react-dom/client';
import '../common/theme.css';
import './driver.css';
import { registerServiceWorker } from '../common/session.ts';
import { App } from './App.tsx';

document.body.classList.add('phone');
registerServiceWorker();
createRoot(document.getElementById('root')!).render(<App />);
