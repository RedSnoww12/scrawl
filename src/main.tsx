import { createRoot } from 'react-dom/client';
import App from './App';
import { applySavedTheme } from './lib/theme';
import './styles.css';

applySavedTheme();
createRoot(document.getElementById('root')!).render(<App />);
