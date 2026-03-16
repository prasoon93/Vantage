import { createRoot } from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')).render(
  <AppProvider>
    <App />
  </AppProvider>
);
