import { createContext, useContext, useReducer } from 'react';

// ─── State shape ──────────────────────────────────────────────────────────────
// appState: 'disconnected' | 'connecting' | 'ready' | 'listening' | 'speaking'
// messages: [{ id, role: 'user'|'ai', text, streaming }]
// locations: Location[]
// sceneSummary: string

const initialState = {
  appState: 'disconnected',
  messages: [],
  locations: [],
  sceneSummary: '',
  locationHistory: [],
  isLoadingLocations: false,
  sceneSpecs: {},
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case 'SET_APP_STATE':
      if (state.appState === action.payload) return state;
      return { ...state, appState: action.payload };

    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, { id: Date.now(), ...action.payload, streaming: false }],
      };

    // Start or append to a streaming AI message
    case 'STREAM_AI_TEXT': {
      const last = state.messages.at(-1);
      if (last?.role === 'ai' && last.streaming) {
        const updated = state.messages.map((m) =>
          m.id === last.id ? { ...m, text: m.text + action.payload } : m
        );
        return { ...state, messages: updated };
      }
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: Date.now(), role: 'ai', text: action.payload, streaming: true },
        ],
      };
    }

    case 'FINISH_AI_STREAM': {
      const updated = state.messages.map((m) =>
        m.streaming ? { ...m, streaming: false } : m
      );
      return { ...state, messages: updated };
    }

    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };

    case 'SET_LOCATIONS':
      return { ...state, locations: action.payload };

    case 'SET_SCENE_SUMMARY':
      return { ...state, sceneSummary: action.payload };

    case 'PUSH_LOCATION_HISTORY':
      return {
        ...state,
        locationHistory: [action.payload, ...state.locationHistory],
      };

    case 'SET_LOADING_LOCATIONS':
      return { ...state, isLoadingLocations: action.payload };

    // Merge new spec fields into existing sceneSpecs (model calls this incrementally)
    case 'SET_SCENE_SPECS':
      return { ...state, sceneSpecs: { ...state.sceneSpecs, ...action.payload } };

    case 'CLEAR_SCENE_SPECS':
      return { ...state, sceneSpecs: {} };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
