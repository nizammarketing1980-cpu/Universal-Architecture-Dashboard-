/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { CheckCircle2, Circle, Copy, Plus, Loader2, Activity, Play, Check, Trash2, ArrowRight, Zap, Target, Undo } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore, StateItem, Step } from './store';

export default function App() {
  const {
    problem, setProblem,
    newStateLabel, setNewStateLabel,
    states, setStates, addState, toggleState: _toggleState, removeState: _removeState,
    steps, setSteps,
    loading, setLoading,
    copiedId, setCopiedId,
    history, undoHistory,
    theme, setTheme,
    scale, setScale,
    diagnosis, setDiagnosis,
    chatHistory, setChatHistory,
    handleNewChat, handleClearAll
  } = useStore();

  const toggleState = (id: string) => {
    _toggleState(id);
    setTimeout(() => {
      if (problem.trim()) generateSolution(true);
    }, 100);
  };

  const removeState = (id: string) => {
    _removeState(id);
    setTimeout(() => {
      if (problem.trim()) generateSolution(true);
    }, 100);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-scale', scale);
  }, [scale]);

  const handleAddState = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newStateLabel.trim()) return;
    addState(newStateLabel);
    // Auto-sync with Gemini when a manual state is typed
    setTimeout(() => {
      generateSolution(true);
    }, 100);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const generateSolution = async (isAutoSync: boolean = false) => {
    if (!problem.trim()) return;
    setLoading(true);

    try {
      // Ensure we fetch API key properly configured in vite environment
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const currentStates = useStore.getState().states;
      const currentStateContext = currentStates.map(s => `- ${s.label}: ${s.isChecked ? 'True (Completed/Verified)' : 'False (Pending/Unverified)'}`).join('\n');

      const systemInstruction = `You are a Universal Self-Healing Expert System predicting precise steps to solve a problem.

Context (Current Known States):
${currentStateContext || "No context states provided."}

Task:
Generate a clear, sequential list of steps to diagnose or solve the problem. Provide a brief diagnosis of why this might be happening.

For technical help or errors: 
- ALWAYS suggest simple, non-technical fixes first like downloading from App Stores (e.g., Microsoft Store).
- Prioritize GUI settings and restarts.
- AVOID manual 'Path' editing, complex commands, or registry changes unless absolutely necessary.
- Tone: Casual and beginner-friendly for a headache-free experience.

Guidelines for Fields:
- 'diagnosis': A 1-2 sentence casual and beginner-friendly explanation of why the problem might be occurring.
- 'category': Categorize the step as either "Simple / Non-Technical" (e.g., GUI, settings, restarts, App Stores) or "Advanced / Technical" (e.g., terminal, code, configs).
- 'title': Very brief, max 4 words.
- 'description': Clear explanation of why this step is taken.
- 'actionSnippet': MUST be ONLY the exact, raw executable command (e.g., 'systemctl restart nginx', 'npm install react'), literal button sequence (e.g., 'Menu > Settings > Network'), or specific piece of code to copy-paste. DO NOT include conversational text, explanations, or backticks (\`\`\`) in the snippet. It must be 100% directly copy-pasteable and actionable.
- 'targetContext': Identify where this action needs to be executed. One or two words. Examples: 'cmd', 'PowerShell', 'Browser', 'Settings App', '/etc/nginx'.
- 'completingState': A highly specific, binary, and verifiable state condition that proves this step succeeded. Max 3-5 words. (e.g., 'Nginx Service Running', 'Port 8080 Open', 'Config File Saved'). Avoid vague states. This state will be tracked in the dashboard to auto-advance completion.

Rules:
- Break complex actions into single, atomic steps.
- Start with Simple / Non-Technical steps before Advanced / Technical steps.
- Prioritize actionable commands and highly verifiable states.
- Reply ONLY with the JSON object containing 'diagnosis' and 'steps' array.
- Do NOT generate steps if they are already True in Context, unless they are part of a larger repeating loop. Keep steps actionable.`;

      const currentChatHistory = useStore.getState().chatHistory;
      const isUpdate = (typeof isAutoSync === 'boolean' && isAutoSync) || currentChatHistory.length > 0;
      const userMessageText = isUpdate
          ? `I have updated the System States. Please re-evaluate the diagnosis and steps based on the NEW Context. Provide only the necessary steps to continue solving: ${problem}`
          : problem;

      const userMessage = { role: 'user' as const, parts: [{ text: userMessageText }] };
      const contents = [...currentChatHistory, userMessage];

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              diagnosis: { type: "STRING" },
              steps: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    title: { type: "STRING" },
                    description: { type: "STRING" },
                    actionSnippet: { type: "STRING" },
                    completingState: { type: "STRING" },
                    targetContext: { type: "STRING" },
                    category: { type: "STRING" }
                  },
                  required: ["id", "title", "description", "actionSnippet", "completingState", "targetContext", "category"]
                }
              }
            },
            required: ["diagnosis", "steps"]
          }
        }
      });

      const responseText = response.text;
      const data = responseText ? JSON.parse(responseText) : {};
      const newSteps: Step[] = data.steps || [];
      
      const latestChatHistory = useStore.getState().chatHistory;
      const modelMessage = { role: 'model' as const, parts: [{ text: responseText || "" }] };
      setChatHistory([...latestChatHistory, userMessage, modelMessage]);

      if (data.diagnosis) {
        setDiagnosis(data.diagnosis);
      }

      // Discover new states from steps and add them into the state manager as unchecked
      let newStatesAdded = false;
      const updatedStates = [...useStore.getState().states];
      
      newSteps.forEach((step) => {
        const stateExists = updatedStates.find(s => s.label.toLowerCase() === step.completingState.toLowerCase());
        if (!stateExists) {
          updatedStates.push({
            id: Math.random().toString(36).substring(7),
            label: step.completingState,
            isChecked: false
          });
          newStatesAdded = true;
        }
      });

      if (newStatesAdded) setStates(updatedStates);
      setSteps(newSteps);

    } catch (err) {
      console.error("AI Generation Error:", err);
      setDiagnosis(err instanceof Error ? err.message : "Failed to generate solution.");
    } finally {
      setLoading(false);
    }
  };

  // Determine priority step (first step whose completingState is false)
  const firstPendingIndex = steps.findIndex(step => {
    const matchingState = states.find(s => s.label.toLowerCase() === step.completingState.toLowerCase());
    return !matchingState?.isChecked;
  });

  const getTargetColor = (target: string | undefined, isPriority: boolean, isCompleted: boolean) => {
    if (isCompleted) return 'text-brand-muted/70';
    if (!target) return 'text-brand-muted';
    const t = target.toLowerCase();
    if (t.includes('cmd') || t.includes('command prompt') || t.includes('terminal')) return 'text-red-500';
    if (t.includes('powershell')) return 'text-blue-500';
    if (t.includes('browser') || t.includes('chrome') || t.includes('edge')) return 'text-orange-500';
    if (t.includes('setting')) return 'text-purple-500';
    if (t.includes('/') || t.includes('\\') || t.includes('explorer')) return 'text-emerald-500';
    return isPriority ? 'text-indigo-400' : 'text-brand-accent/80';
  };

  return (
    <div className="w-full min-h-screen bg-brand-base text-brand-text font-sans flex flex-col selection:bg-brand-accent/30">
      <header className="flex items-center justify-between px-6 py-4 border-b border-brand-border bg-brand-panel shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-accent flex items-center justify-center">
            <Activity className="w-5 h-5 text-brand-text" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-brand-text uppercase hidden sm:block">
            Universal Architecture Dashboard <span className="text-brand-accent font-mono text-xs ml-2">v4.2.0-STABLE</span>
          </h1>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex gap-2">
            <select 
              value={scale}
              onChange={(e) => setScale(e.target.value)}
              className="bg-brand-input border border-brand-border text-brand-muted text-[10px] rounded px-2 py-1 outline-none focus:border-brand-accent uppercase tracking-wider font-bold cursor-pointer transition-colors"
              title="UI Scale"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="xlarge">X-Large</option>
            </select>
            <select 
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="bg-brand-input border border-brand-border text-brand-muted text-[10px] rounded px-2 py-1 outline-none focus:border-brand-accent uppercase tracking-wider font-bold cursor-pointer transition-colors"
              title="Theme"
            >
              <option value="high-density">High Density</option>
              <option value="cyber">Cyber</option>
              <option value="light">Light</option>
            </select>
            <button
              onClick={handleClearAll}
              className="bg-brand-input border border-brand-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 text-brand-muted text-[10px] rounded px-3 py-1 outline-none uppercase tracking-wider font-bold cursor-pointer transition-colors"
              title="Clear All States and Steps"
            >
              CLEAR ALL
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] uppercase font-bold text-emerald-500 hidden sm:inline">System Ready</span>
          </div>
        </div>
      </header>

      <main className="flex-grow p-4 md:p-6 flex flex-col lg:flex-row gap-4 md:gap-6">
        {/* LEFT PANEL: States */}
        <div className="w-full lg:w-[300px] xl:w-[340px] flex flex-col gap-4 md:gap-6 shrink-0">
          <section className="flex flex-col bg-brand-panel border border-brand-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-brand-border bg-brand-header flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-widest text-brand-muted">System States</h2>
                {history.length > 0 && (
                  <button onClick={undoHistory} className="flex items-center gap-1 text-[10px] text-brand-accent hover:text-indigo-300 font-bold transition-colors">
                    <Undo className="w-3 h-3" /> UNDO
                  </button>
                )}
              </div>
              <span className="px-2 py-0.5 bg-brand-border rounded text-[10px] text-brand-muted">{states.filter(s => s.isChecked).length} ACTIVE</span>
            </div>
            
            <div className="p-4 bg-brand-input border-b border-brand-border shrink-0">
              <form onSubmit={handleAddState} className="relative">
                <input
                  type="text"
                  value={newStateLabel}
                  onChange={(e) => setNewStateLabel(e.target.value)}
                  placeholder="Add state (e.g. WiFi Linked)"
                  className="w-full bg-brand-base border border-brand-border rounded-md py-2 pl-3 pr-10 text-xs focus:outline-none focus:border-brand-accent text-brand-text placeholder-slate-600"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!newStateLabel.trim()}
                  className="absolute right-2 top-1.5 text-brand-accent hover:text-brand-accent disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </form>
            </div>

            <div className="p-4 space-y-2">
              <AnimatePresence>
                {states.map((state) => (
                  <motion.div
                    key={state.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`flex items-center justify-between p-3 rounded-lg border group cursor-pointer transition-colors ${
                      state.isChecked
                        ? 'bg-brand-accent/10 border-brand-accent/20'
                        : 'bg-brand-border/20 border-brand-border'
                    }`}
                    onClick={() => toggleState(state.id)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={state.isChecked}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-brand-border bg-slate-900 text-brand-accent-hover focus:ring-brand-accent focus:ring-offset-0 pointer-events-none"
                      />
                      <span className={`text-xs font-medium ${state.isChecked ? 'text-brand-text' : 'text-brand-muted'}`}>
                        {state.label}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeState(state.id);
                      }}
                      className="text-brand-muted/70 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
                {states.length === 0 && (
                  <p className="text-brand-muted/70 text-xs text-center py-4">No system states tracking.</p>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* RIGHT PANEL: Diagnostics & Sequence */}
        <div className="flex-grow flex flex-col gap-4 md:gap-6 min-w-0">
          {/* Diagnostics Console */}
          <section className="flex flex-col bg-brand-panel border border-brand-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-brand-border bg-brand-header flex justify-between items-center shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-brand-muted">Diagnostics Console</h2>
              <div className="flex items-center gap-2">
                {chatHistory.length > 0 && (
                  <button
                    onClick={handleNewChat}
                    className="flex items-center gap-2 bg-brand-border hover:bg-brand-muted/20 text-brand-text text-[10px] font-bold py-1.5 px-3 rounded transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">NEW CHAT</span>
                  </button>
                )}
                <button
                  onClick={generateSolution}
                  disabled={loading || !problem.trim()}
                  className="flex items-center gap-2 bg-brand-accent hover:bg-indigo-500 disabled:opacity-50 disabled:bg-brand-border disabled:text-brand-muted text-brand-text text-[10px] font-bold py-1.5 px-4 rounded transition-all"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span className="hidden sm:inline">GENERATE SOLUTION</span>
                  <span className="sm:hidden">GENERATE</span>
                </button>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                spellCheck="false"
                className="w-full min-h-[140px] bg-brand-base text-brand-accent font-mono text-[11px] lg:text-xs p-4 border border-brand-border rounded-lg resize-y focus:outline-none focus:border-brand-accent/50 leading-relaxed custom-scrollbar"
                placeholder="Paste error message or problem description here..."
              />
              {diagnosis && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-red-500 font-mono"
                >
                  <span className="font-bold uppercase inline-block mb-1">Reason:</span> {diagnosis}
                </motion.div>
              )}
            </div>
          </section>

          {/* Sequence Protocol (Grid) */}
          <section className="flex flex-col bg-brand-panel border border-brand-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-brand-border bg-brand-header shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-widest text-brand-muted">Sequence Protocol (Self-Healing)</h2>
            </div>
            <div className="p-4">
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-brand-muted/70 min-h-[200px]">
                  <Target className="w-8 h-8 mb-3 opacity-50" />
                  <p className="text-xs uppercase tracking-widest font-bold">Awaiting Diagnostics</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {Object.entries(
                    steps.reduce((acc, step) => {
                      const cat = step.category || 'General Fixes';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(step);
                      return acc;
                    }, {} as Record<string, Step[]>)
                  ).map(([category, catSteps]) => (
                    <div key={category} className="w-full">
                      <h3 className="text-sm sm:text-base font-bold tracking-widest text-brand-text mb-4 border-b border-brand-border pb-2 leading-tight">{category}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <AnimatePresence>
                          {catSteps.map((step) => {
                            const index = steps.findIndex(s => s.id === step.id);
                            const matchingState = states.find(s => s.label.toLowerCase() === step.completingState.toLowerCase());
                            const isCompleted = matchingState?.isChecked || false;
                            const isPriority = index === firstPendingIndex;

                            return (
                              <motion.div
                                key={step.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`flex flex-col rounded-lg p-3 transition-all ${
                                  isCompleted
                                    ? 'border border-brand-border bg-brand-base opacity-60'
                                    : isPriority
                                    ? 'border border-brand-accent/50 bg-brand-accent/10'
                                    : 'border border-brand-border bg-brand-panel hover:border-brand-accent/50'
                                }`}
                              >
                                <div className="flex justify-between items-start mb-3">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-tighter ${
                                    isCompleted ? 'bg-brand-border text-brand-muted' : isPriority ? 'bg-brand-accent/10 text-brand-accent' : 'bg-brand-border text-brand-muted'
                                  }`}>
                                    Step {String(index + 1).padStart(2, '0')}
                                  </span>
                                  <span className={`text-[10px] font-bold ${
                                    isCompleted ? 'text-emerald-500' : isPriority ? 'text-brand-accent' : 'text-brand-muted/70'
                                  }`}>
                                    {isCompleted ? 'COMPLETED' : isPriority ? 'ACTIVE' : 'PENDING'}
                                  </span>
                                </div>
                                
                                <h3 className={`text-sm font-semibold mb-1 ${isCompleted ? 'text-brand-muted' : 'text-brand-text'}`}>
                                  {step.title}
                                </h3>
                                <p className={`text-[11px] mb-4 flex-grow line-clamp-2 ${isCompleted ? 'text-brand-muted/70' : 'text-brand-muted'}`}>
                                  {step.description}
                                </p>
                                
                                <div className="mt-auto">
                                  <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 pl-1 ${getTargetColor(step.targetContext, isPriority, isCompleted)}`}>
                                    {step.targetContext ? `[ Executing in: ${step.targetContext} ]` : '[ Context Unspecified ]'}
                                  </div>
                                  <div className="flex bg-brand-base border border-brand-border rounded-md overflow-hidden h-8">
                                    <code className={`flex-grow px-3 py-1.5 text-[11px] font-mono overflow-hidden whitespace-nowrap text-ellipsis flex items-center ${
                                      isCompleted ? 'text-brand-muted/70' : isPriority ? 'text-indigo-300' : 'text-brand-muted'
                                    }`}>
                                      {step.actionSnippet}
                                    </code>
                                    <button
                                      onClick={() => handleCopy(step.actionSnippet, step.id)}
                                      className={`px-3 border-l border-brand-border transition-colors flex items-center justify-center min-w-[40px] flex-shrink-0 ${
                                        copiedId === step.id
                                          ? 'bg-emerald-900/20 text-emerald-500'
                                          : 'hover:bg-brand-border text-brand-muted hover:text-brand-text'
                                      }`}
                                    >
                                      {copiedId === step.id ? (
                                        <Check className="h-3.5 w-3.5" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="mt-3 text-[10px] text-brand-muted/70 flex justify-between tracking-wide font-medium">
                                    <span className="truncate pr-2">Goal: {step.completingState}</span>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="h-10 border-t border-brand-border bg-brand-base px-6 flex items-center justify-between shrink-0">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-brand-muted/70 uppercase font-bold">Latency:</span>
            <span className="text-[10px] text-emerald-500 font-mono">14ms</span>
          </div>
          <div className="flex items-center gap-2 hidden sm:flex">
            <span className="text-[10px] text-brand-muted/70 uppercase font-bold">CPU:</span>
            <span className="text-[10px] text-brand-accent font-mono">12%</span>
          </div>
        </div>
        <div className="text-[10px] text-brand-muted/70 tracking-wider uppercase font-medium hidden sm:block">
          Connected to Central Intelligence Hub <span className="text-slate-700">|</span> <span className="text-brand-muted">Last sync 1m ago</span>
        </div>
      </footer>

      {/* Scrollbar overrides for custom inner scrollers */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4f46e5; }
      `}} />
    </div>
  );
}
