import { createRoot } from 'react-dom/client';
import '../common/theme.css';
import './admin.css';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(<App />);
