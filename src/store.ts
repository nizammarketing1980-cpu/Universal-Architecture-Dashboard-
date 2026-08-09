import { create } from 'zustand';

export interface StateItem {
  id: string;
  label: string;
  isChecked: boolean;
}

export interface Step {
  id: string;
  title: string;
  description: string;
  actionSnippet: string;
  completingState: string;
  targetContext?: string;
  category?: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface AppState {
  problem: string;
  setProblem: (problem: string) => void;
  
  newStateLabel: string;
  setNewStateLabel: (label: string) => void;
  
  states: StateItem[];
  setStates: (states: StateItem[]) => void;
  addState: (label: string) => void;
  toggleState: (id: string) => void;
  removeState: (id: string) => void;
  
  steps: Step[];
  setSteps: (steps: Step[]) => void;
  
  loading: boolean;
  setLoading: (loading: boolean) => void;
  
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  
  history: StateItem[][];
  pushHistory: (currentStates: StateItem[]) => void;
  undoHistory: () => void;
  
  theme: string;
  setTheme: (theme: string) => void;
  
  scale: string;
  setScale: (scale: string) => void;
  
  diagnosis: string | null;
  setDiagnosis: (diagnosis: string | null) => void;
  
  chatHistory: ChatMessage[];
  setChatHistory: (history: ChatMessage[]) => void;
  
  handleNewChat: () => void;
  handleClearAll: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  problem: '',
  setProblem: (problem) => set({ problem }),
  
  newStateLabel: '',
  setNewStateLabel: (newStateLabel) => set({ newStateLabel }),
  
  states: [{ id: 'initial-state-1', label: 'Device is Powered On', isChecked: false }],
  setStates: (states) => set({ states }),
  
  addState: (label) => {
    const { states, pushHistory } = get();
    if (!label.trim()) return;
    if (states.some(s => s.label.toLowerCase() === label.trim().toLowerCase())) {
      set({ newStateLabel: '' });
      return;
    }
    pushHistory(states);
    set({
      states: [...states, { id: Math.random().toString(36).substring(7), label: label.trim(), isChecked: true }],
      newStateLabel: ''
    });
  },
  
  toggleState: (id) => {
    const { states, pushHistory } = get();
    pushHistory(states);
    set({
      states: states.map(s => s.id === id ? { ...s, isChecked: !s.isChecked } : s)
    });
  },
  
  removeState: (id) => {
    const { states, pushHistory } = get();
    pushHistory(states);
    set({
      states: states.filter(s => s.id !== id)
    });
  },
  
  steps: [],
  setSteps: (steps) => set({ steps }),
  
  loading: false,
  setLoading: (loading) => set({ loading }),
  
  copiedId: null,
  setCopiedId: (copiedId) => set({ copiedId }),
  
  history: [],
  pushHistory: (currentStates) => {
    const { history } = get();
    set({ history: [...history, currentStates].slice(-20) });
  },
  
  undoHistory: () => {
    const { history } = get();
    if (history.length === 0) return;
    const prevStates = history[history.length - 1];
    set({
      states: prevStates,
      history: history.slice(0, -1)
    });
  },
  
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  
  scale: 'medium',
  setScale: (scale) => set({ scale }),
  
  diagnosis: null,
  setDiagnosis: (diagnosis) => set({ diagnosis }),
  
  chatHistory: [],
  setChatHistory: (chatHistory) => set({ chatHistory }),
  
  handleNewChat: () => {
    set({
      problem: '',
      steps: [],
      diagnosis: null,
      states: [{ id: 'initial-state-1', label: 'Device is Powered On', isChecked: false }],
      history: [],
      chatHistory: []
    });
  },
  
  handleClearAll: () => {
    if (window.confirm("Are you sure you want to clear all states and steps? This will not reset the chat session.")) {
      const { states } = get();
      set({
        steps: [],
        diagnosis: null,
        states: states.map(s => ({ ...s, isChecked: false })),
        history: []
      });
    }
  }
}));
