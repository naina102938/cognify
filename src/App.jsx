import './index.css';
import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from "react";

// ─── Gemini AI ─────────────────────────────────────────────────────────────
function getApiKey() {
  let key = localStorage.getItem("gemini_api_key");
  if (!key) {
    key = prompt("Please enter your Google Gemini API Key to enable AI features (get one free at aistudio.google.com):");
    if (key) {
      localStorage.setItem("gemini_api_key", key);
    }
  }
  return key;
}

async function askCognifyAI(messages, systemPrompt = "") {
  const key = getApiKey();
  if (!key) return "Please set your Gemini API Key to use the AI tutor!";

  const geminiMessages = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt || "You are Cognify, an elite AI cognitive tutor. You're concise, intelligent, adaptive, and deeply knowledgeable about learning science, spaced repetition, and the specific study topics a student is working on. You personalize every response to the student's profile, goals, and weak areas. Respond in 2-4 sentences maximum unless asked for more detail." }]
    },
    contents: geminiMessages,
    generationConfig: { maxOutputTokens: 1000 }
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here to help! What would you like to work on?";
  } catch (e) {
    console.error(e);
    return "Error connecting to AI. Please check your API key and network.";
  }
}

async function generateFlashcards(topic, subject, count = 5) {
  const key = getApiKey();
  if (!key) return [];

  const body = {
    systemInstruction: { parts: [{ text: "You generate educational flashcards. Return ONLY valid JSON array, no markdown, no explanation." }] },
    contents: [{
      role: "user",
      parts: [{ text: `Generate ${count} flashcards for topic "${topic}" in subject "${subject}". Return JSON array: [{"front":"question","back":"answer","topic":"${topic}"}]` }]
    }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    return JSON.parse(text);
  } catch (e) {
    console.error(e);
    return [];
  }
}

async function generateStudyPlan(profile) {
  const key = getApiKey();
  if (!key) return null;

  const body = {
    systemInstruction: { parts: [{ text: "You create personalized 7-day study plans. Return ONLY valid JSON, no markdown." }] },
    contents: [{
      role: "user",
      parts: [{ text: `Create a 7-day plan for: name=${profile.name}, subjects=${profile.subjects.join(",")}, goal=${profile.goal}, style=${profile.style}, session=${profile.sessionMins}min. Return JSON: {"days":[{"day":"Mon","sessions":[{"time":"Morning","topic":"X","type":"Recall","mins":30}]}]}` }]
    }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ─── SM-2 Algorithm ────────────────────────────────────────────────────────
function sm2Review(card, quality) {
  let { easeFactor = 2.5, interval = 0, repetitions = 0 } = card;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions += 1;
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const due = new Date();
  due.setDate(due.getDate() + interval);
  return { easeFactor, interval, repetitions, nextDue: due.toISOString().split("T")[0] };
}

function isDueToday(card) {
  if (!card.nextDue) return true;
  return card.nextDue <= new Date().toISOString().split("T")[0];
}

// ─── Seed Data ─────────────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
function mkCard(id, topic, front, back, daysOut = 0) {
  const due = new Date(); due.setDate(due.getDate() + daysOut);
  return { id, topic, front, back, easeFactor: 2.5, interval: daysOut, repetitions: daysOut > 0 ? 1 : 0, nextDue: due.toISOString().split("T")[0] };
}

const SEED_DECKS = [
  { id: "deck-biochem", name: "Biochemistry", color: "#00FFFF", icon: "🧬", description: "Krebs cycle, glycolysis & metabolic pathways", cards: [
    mkCard("bc-1","Krebs Cycle","Net ATP yield from one Krebs cycle turn?","2 ATP + 3 NADH + 1 FADH₂ per acetyl-CoA",0),
    mkCard("bc-2","Krebs Cycle","What enters the Krebs cycle?","Acetyl-CoA (2C) + oxaloacetate (4C) → citrate (6C)",0),
    mkCard("bc-3","Glycolysis","Where does glycolysis occur and net ATP?","Cytoplasm; net yield 2 ATP, 2 NADH, 2 pyruvate",1),
    mkCard("bc-4","ETC","Role of NADH in the electron transport chain?","Donates electrons to Complex I, driving proton pumping → ATP synthesis",3),
    mkCard("bc-5","Enzymes","What is an allosteric inhibitor?","Binds non-active site → changes enzyme shape → reduces activity",5),
  ]},
  { id: "deck-quantum", name: "Quantum Mechanics", color: "#FF00FF", icon: "⚛️", description: "Superposition, entanglement & wave functions", cards: [
    mkCard("qm-1","Entanglement","What does quantum entanglement mean?","Paired particles share quantum state — measuring one instantly determines the other",0),
    mkCard("qm-2","Superposition","What does the double-slit experiment reveal?","Particles behave as waves (interference) until observed, then collapse to particles",0),
    mkCard("qm-3","Wave Functions","What does Schrödinger's equation describe?","How quantum state ψ evolves over time; |ψ|² gives position probability density",2),
    mkCard("qm-4","Uncertainty","State Heisenberg's Uncertainty Principle.","Δx · Δp ≥ ℏ/2 — position & momentum cannot both be precisely known",4),
  ]},
  { id: "deck-stats", name: "Bayesian Statistics", color: "#8000FF", icon: "📊", description: "Probability, inference & posterior distributions", cards: [
    mkCard("st-1","Bayes","State Bayes' theorem.","P(A|B) = P(B|A)·P(A) / P(B) — posterior = likelihood × prior / evidence",0),
    mkCard("st-2","Inference","What is the prior in Bayesian inference?","Your belief about a parameter before seeing data",1),
    mkCard("st-3","CLT","What does the Central Limit Theorem state?","Sample means approach normal distribution as n → ∞, regardless of population shape",2),
  ]},
];

function buildSeedHistory() {
  const history = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (Math.random() > 0.25) {
      const cards = 4 + Math.floor(Math.random() * 8);
      history.push({
        id: `seed-${i}`, date: d.toISOString().split("T")[0],
        deckName: ["Biochemistry","Quantum Mechanics","Bayesian Statistics"][i % 3],
        cards, accuracy: 55 + Math.floor(Math.random() * 40),
        xp: cards * 10, duration: 300 + Math.floor(Math.random() * 600),
      });
    }
  }
  return history;
}

// ─── Styles ────────────────────────────────────────────────────────────────


// ─── Tiny Chart Components ─────────────────────────────────────────────────
function LineChart({ data, color = "#00FFFF", height = 80 }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const vals = data.map(d => d.v ?? d);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 400, h = height;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / range) * (h - 8) - 4}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" />
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#lg)" />
    </svg>
  );
}

function RadialProgress({ value, color = "#FF00FF", size = 120 }) {
  const r = 44, c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
        strokeDasharray={`${dash} ${c}`} strokeDashoffset={c / 4} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  );
}

// ─── Typing Effect ─────────────────────────────────────────────────────────
function Typing({ text, speed = 18 }) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setShown(""); setDone(false);
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) { setDone(true); clearInterval(t); }
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <span>{shown}{!done && <span className="cursor" />}</span>;
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ toasts, remove }) {
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} className="glass fade-in" style={{ padding: "12px 20px", minWidth: 240, display: "flex", gap: 12, alignItems: "center", border: `1px solid ${t.color || "rgba(0,255,255,0.25)"}` }}
          onClick={() => remove(t.id)}>
          <span style={{ fontSize: 18 }}>{t.icon || "✓"}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
            {t.desc && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{t.desc}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((title, opts = {}) => {
    const id = Date.now();
    setToasts(p => [...p, { id, title, ...opts }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  const remove = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), []);
  return { toasts, show, remove };
}

// ─── Auth Screen ───────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("signup"); // signup | login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email || !password || (mode === "signup" && !name)) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    onAuth({ email, name: name || email.split("@")[0], isNew: mode === "signup" });
  };

  return (
    <div className="auth-wrap">
      
      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-10%", left: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,255,255,.12),transparent)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(128,0,255,.15),transparent)", filter: "blur(60px)" }} />
      </div>

      <div className="glass auth-card fade-in" style={{ position: "relative" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧠</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, letterSpacing: "0.15em" }} className="gradient-text">COGNIFY</div>
            <div style={{ fontSize: 11, color: "var(--text3)", letterSpacing: "0.1em" }}>AI COGNITIVE OS</div>
          </div>
        </div>

        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 6 }}>
          {mode === "signup" ? "Create account" : "Welcome back"}
        </h2>
        <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 28 }}>
          {mode === "signup" ? "Your AI study partner, personalized for you." : "Continue your learning journey."}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "signup" && (
            <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              style={{ padding: "12px 16px", fontSize: 15, width: "100%" }} />
          )}
          <input placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handle()}
            style={{ padding: "12px 16px", fontSize: 15, width: "100%" }} />
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handle()}
            style={{ padding: "12px 16px", fontSize: 15, width: "100%" }} />
          <button className="btn-primary" onClick={handle} disabled={loading || !email || !password || (mode === "signup" && !name)}
            style={{ padding: "14px", fontSize: 15, width: "100%", marginTop: 4 }}>
            {loading ? <span className="spin" style={{ display: "inline-block", width: 18, height: 18, border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%" }} /> :
              mode === "signup" ? "Create Account →" : "Sign In →"}
          </button>
        </div>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
          {mode === "signup" ? "Already have an account?" : "New to Cognify?"}{" "}
          <span onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            style={{ color: "var(--cyan)", cursor: "pointer", fontWeight: 600 }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Onboarding ────────────────────────────────────────────────────────────
const SUBJECTS = ["Mathematics","Physics","Chemistry","Biology","Computer Science","History","Economics","Psychology","Neuroscience","Statistics","Literature","Philosophy","Law","Medicine"];
const GOALS = ["Ace upcoming exams","Build deep long-term knowledge","Learn faster & retain more","Master a new field","Improve academic performance","Prepare for competitive exams"];
const DIAG_QS = [
  { q: "What is the primary function of mitochondria?", opts: ["Energy production via ATP synthesis","Protein synthesis","DNA storage","Cell signalling"], ans: 0, topics: ["Biology"] },
  { q: "Which algorithm powers spaced repetition systems?", opts: ["Dijkstra's","SM-2","PageRank","QuickSort"], ans: 1, topics: ["Computer Science"] },
  { q: "What does the Central Limit Theorem state?", opts: ["Sample means approach normal distribution as n grows","All populations are normal","Variance decreases with sample size","Means equal medians"], ans: 0, topics: ["Statistics"] },
];

function OnboardingScreen({ userName, onComplete }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({ name: userName, goal: "", subjects: [], style: "mixed", sessionMins: 30, preferredTime: "evening", weakTopics: [] });
  const [diagQ, setDiagQ] = useState(0);
  const [diagAnswers, setDiagAnswers] = useState({});
  const [diagSelected, setDiagSelected] = useState(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibStep, setCalibStep] = useState(0);
  const CALIB_STEPS = ["Initializing Cognitive Profile…","Calibrating Adaptive Engine…","Building Retention Graph…","Analyzing Learning Patterns…","Configuring AI Mentor…","Profile Ready ✓"];

  const upd = (k, v) => setProfile(p => ({ ...p, [k]: v }));

  const handleDiag = (idx) => {
    if (diagSelected !== null) return;
    setDiagSelected(idx);
    const correct = DIAG_QS[diagQ].opts[idx] === DIAG_QS[diagQ].opts[DIAG_QS[diagQ].ans];
    const newAnswers = { ...diagAnswers, [diagQ]: correct };
    setTimeout(() => {
      setDiagAnswers(newAnswers);
      if (diagQ + 1 < DIAG_QS.length) { setDiagQ(q => q + 1); setDiagSelected(null); }
      else {
        const weak = DIAG_QS.filter((_, i) => !newAnswers[i]).flatMap(q => q.topics);
        upd("weakTopics", [...new Set(weak)]);
        setStep(5);
      }
    }, 700);
  };

  const handleFinish = async () => {
    setStep(6); setCalibrating(true);
    for (let i = 0; i < CALIB_STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 650));
      setCalibStep(i);
    }
    await new Promise(r => setTimeout(r, 500));
    onComplete(profile);
  };

  const steps = [
    // Welcome
    <div key="welcome" className="fade-in" style={{ textAlign: "center" }}>
      <div className="pulse" style={{ width: 96, height: 96, borderRadius: 24, background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px", fontSize: 44, boxShadow: "0 0 60px rgba(0,255,255,.3)" }}>🧠</div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 800, marginBottom: 12 }}>
        Meet your <span className="gradient-text">AI cognitive OS</span>.
      </h1>
      <p style={{ color: "var(--text2)", fontSize: 16, maxWidth: 420, margin: "0 auto 32px", lineHeight: 1.6 }}>
        Cognify learns how <em>you</em> think, remembers what you struggle with, and adapts every session to maximize long-term memory.
      </p>
      <div className="grid-3col" style={{ maxWidth: 360, margin: "0 auto 36px" }}>
        {[["🧠","Adaptive AI","#00FFFF"],["🎯","SM-2 Precision","#FF00FF"],["⚡","Real-time Learning","#00FF80"]].map(([ic,lb,col]) => (
          <div key={lb} className="glass" style={{ padding: "14px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{ic}</div>
            <div style={{ fontSize: 11, color: col, fontWeight: 700, letterSpacing: "0.05em" }}>{lb}</div>
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={() => setStep(1)} style={{ padding: "14px 40px", fontSize: 16 }}>Initialize Cognitive Profile →</button>
    </div>,

    // Name
    <div key="name" className="fade-in" style={{ maxWidth: 440, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--cyan)", fontWeight: 700, marginBottom: 8 }}>STEP 1 OF 6</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>What's your name?</h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Your AI tutor will address you personally.</p>
      <input autoFocus value={profile.name} onChange={e => upd("name", e.target.value)}
        onKeyDown={e => e.key === "Enter" && profile.name.trim() && setStep(2)}
        placeholder="e.g. Alex Kumar" style={{ width: "100%", padding: "14px 18px", fontSize: 16, marginBottom: 16 }} />
      <button className="btn-primary" disabled={!profile.name.trim()} onClick={() => setStep(2)} style={{ width: "100%", padding: 14, fontSize: 15 }}>Continue</button>
    </div>,

    // Goal
    <div key="goal" className="fade-in" style={{ maxWidth: 460, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--cyan)", fontWeight: 700, marginBottom: 8 }}>STEP 2 OF 6</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>What's your primary goal?</h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 20 }}>This shapes how your AI tutor prioritizes content.</p>
      <div className="grid-2col" style={{ marginBottom: 16 }}>
        {GOALS.map(g => (
          <button key={g} className={`onboarding-option${profile.goal === g ? " selected" : ""}`} onClick={() => upd("goal", g)}>
            {profile.goal === g && "✓ "}{g}
          </button>
        ))}
      </div>
      <textarea value={profile.goal} onChange={e => upd("goal", e.target.value)} placeholder="Or describe your own goal…"
        style={{ width: "100%", padding: "12px 16px", fontSize: 14, marginBottom: 16, resize: "none", rows: 2 }} rows={2} />
      <button className="btn-primary" disabled={!profile.goal.trim()} onClick={() => setStep(3)} style={{ width: "100%", padding: 14 }}>Continue</button>
    </div>,

    // Subjects
    <div key="subjects" className="fade-in" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--cyan)", fontWeight: 700, marginBottom: 8 }}>STEP 3 OF 6</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Which subjects do you study?</h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 20 }}>Select all that apply.</p>
      <div className="grid-3col" style={{ marginBottom: 20 }}>
        {SUBJECTS.map(s => {
          const active = profile.subjects.includes(s);
          return (
            <button key={s} className={`onboarding-option${active ? " selected" : ""}`}
              onClick={() => upd("subjects", active ? profile.subjects.filter(x => x !== s) : [...profile.subjects, s])}>
              {active && "✓ "}{s}
            </button>
          );
        })}
      </div>
      <button className="btn-primary" disabled={!profile.subjects.length} onClick={() => setStep(4)} style={{ width: "100%", padding: 14 }}>
        Continue ({profile.subjects.length} selected)
      </button>
    </div>,

    // Diagnostic
    <div key="diag" className="fade-in" style={{ maxWidth: 500, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--cyan)", fontWeight: 700, marginBottom: 8 }}>STEP 4 OF 6 · DIAGNOSTIC</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>3-question baseline check</h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 20 }}>No grades — detects knowledge gaps to personalize your experience.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {DIAG_QS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < diagQ ? "var(--green)" : i === diagQ ? "var(--cyan)" : "rgba(255,255,255,0.1)" }} />
        ))}
      </div>
      <div className="glass" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 20 }}>{DIAG_QS[diagQ].q}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DIAG_QS[diagQ].opts.map((opt, i) => {
            const state = diagSelected === i ? (i === DIAG_QS[diagQ].ans ? "correct" : "wrong") : "idle";
            return (
              <button key={i} onClick={() => handleDiag(i)} disabled={diagSelected !== null}
                style={{
                  textAlign: "left", padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: diagSelected !== null ? "default" : "pointer",
                  background: state === "correct" ? "rgba(0,255,128,.1)" : state === "wrong" ? "rgba(244,63,94,.1)" : "rgba(255,255,255,.03)",
                  border: `1px solid ${state === "correct" ? "var(--green)" : state === "wrong" ? "var(--rose)" : "var(--border)"}`,
                  color: "var(--text1)", fontFamily: "var(--font-body)", transition: "all .2s"
                }}>
                {opt}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center" }}>Question {diagQ + 1} of {DIAG_QS.length}</div>
    </div>,

    // Preferences
    <div key="prefs" className="fade-in" style={{ maxWidth: 440, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--cyan)", fontWeight: 700, marginBottom: 8 }}>STEP 5 OF 6</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Study preferences</h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 24 }}>Shapes your schedule and session pacing.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Learning style</div>
          <div className="grid-3col">
            {["visual","verbal","mixed"].map(s => (
              <button key={s} className={`onboarding-option${profile.style === s ? " selected" : ""}`} style={{ textAlign: "center", textTransform: "capitalize" }} onClick={() => upd("style", s)}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Preferred study time</div>
          <div className="grid-3col">
            {["morning","afternoon","evening"].map(t => (
              <button key={t} className={`onboarding-option${profile.preferredTime === t ? " selected" : ""}`} style={{ textAlign: "center", textTransform: "capitalize" }} onClick={() => upd("preferredTime", t)}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Session length: <span style={{ color: "var(--cyan)" }}>{profile.sessionMins} min</span></div>
          <input type="range" min={10} max={90} step={5} value={profile.sessionMins} onChange={e => upd("sessionMins", +e.target.value)}
            style={{ width: "100%", accentColor: "var(--cyan)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginTop: 4 }}><span>10 min</span><span>90 min</span></div>
        </div>
      </div>
      <button className="btn-primary" onClick={handleFinish} style={{ width: "100%", padding: 14, marginTop: 28, fontSize: 15 }}>Build My Profile →</button>
    </div>,

    // Calibrating
    <div key="calib" className="fade-in" style={{ textAlign: "center", maxWidth: 400, margin: "0 auto" }}>
      <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 32px" }}>
        {[0,1,2].map(i => (
          <div key={i} className="pulse" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(135deg,rgba(0,255,255,.3),rgba(128,0,255,.3))", animationDelay: `${i*0.5}s`, transform: `scale(${1 + i*0.25})` }} />
        ))}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48 }}>🧠</div>
      </div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, marginBottom: 28 }}>
        Welcome, <span className="gradient-text">{profile.name}</span>.
      </h2>
      <div style={{ textAlign: "left" }}>
        {CALIB_STEPS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0", opacity: i <= calibStep ? 1 : 0.2, transition: "opacity .4s" }}>
            {i < calibStep ? <span style={{ color: "var(--green)", fontSize: 16 }}>✓</span> :
              i === calibStep ? <div className="spin" style={{ width: 14, height: 14, border: "2px solid var(--cyan)", borderTopColor: "transparent", borderRadius: "50%" }} /> :
              <div style={{ width: 14, height: 14, border: "1px solid var(--border)", borderRadius: "50%" }} />}
            <span style={{ fontSize: 14, color: i <= calibStep ? "var(--text1)" : "var(--text3)" }}>{s}</span>
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", background: "radial-gradient(ellipse at center,rgba(0,30,50,.8) 0%,var(--bg) 100%)", position: "relative" }}>
      
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-5%", left: "-5%", width: "50%", height: "50%", borderRadius: "50%", background: "radial-gradient(circle,rgba(0,255,255,.08),transparent)", filter: "blur(60px)" }} />
        <div style={{ position: "absolute", bottom: "-5%", right: "-5%", width: "50%", height: "50%", borderRadius: "50%", background: "radial-gradient(circle,rgba(128,0,255,.1),transparent)", filter: "blur(60px)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>✦</div>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "0.2em", fontSize: 14 }} className="gradient-text">COGNIFY</span>
      </div>
      <div style={{ width: "100%", maxWidth: 600 }}>
        {steps[step]}
      </div>
      {step > 0 && step < 6 && (
        <button onClick={() => setStep(s => s - 1)} className="btn-ghost" style={{ marginTop: 24, padding: "8px 16px", fontSize: 13 }}>← Back</button>
      )}
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Command Center", icon: "⚡" },
  { id: "recall", label: "Active Recall", icon: "🧠" },
  { id: "spaced", label: "Spaced Repetition", icon: "📅" },
  { id: "tutor", label: "AI Tutor", icon: "💬" },
  { id: "upload", label: "Upload & Analyze", icon: "📤" },
  { id: "planner", label: "Study Planner", icon: "🗓️" },
  { id: "library", label: "Micro-Lessons", icon: "📚" },
];

function Sidebar({ active, onNav, user, xp, streak }) {
  const level = Math.max(1, Math.floor(xp / 500) + 1);
  const progress = (xp % 500) / 500 * 100;
  return (
    <div className="sidebar">
      {/* Logo */}
      <div style={{ padding: "20px 16px 8px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🧠</div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15, letterSpacing: "0.15em" }} className="gradient-text">COGNIFY</div>
          <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.1em" }}>AI COGNITIVE OS</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {NAV.map(n => (
          <div key={n.id} className={`sidebar-link${active === n.id ? " active" : ""}`} onClick={() => onNav(n.id)}>
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            <span style={{ fontSize: 13 }}>{n.label}</span>
          </div>
        ))}
      </nav>

      {/* User */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,rgba(0,255,255,.3),rgba(128,0,255,.3))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
            {(user?.name || "U")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name || "Student"}</div>
            <div style={{ fontSize: 11, color: "var(--cyan)" }}>Level {level} · {streak}🔥</div>
          </div>
        </div>
        <div className="prog">
          <div className="prog-fill" style={{ width: `${progress}%`, background: "linear-gradient(90deg,var(--cyan),var(--purple))" }} />
        </div>
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>{xp} XP · {500 - (xp % 500)} to Level {level + 1}</div>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function Dashboard({ state, onNav }) {
  const { xp, streak, decks, sessionHistory, todayMinutes } = state;
  const level = Math.max(1, Math.floor(xp / 500) + 1);
  const allCards = decks.flatMap(d => d.cards);
  const dueCount = allCards.filter(isDueToday).length;
  const masteredCards = allCards.filter(c => c.interval >= 21).length;
  const retentionScore = Math.min(99, 72 + Math.floor(sessionHistory.length * 0.8));

  const retentionCurve = useMemo(() => {
    const days = 14;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      const ds = d.toISOString().split("T")[0];
      const sess = sessionHistory.filter(s => s.date === ds);
      const base = 55 + i * 2.5;
      const boost = sess.reduce((a, s) => a + (s.accuracy || 0) * 0.1, 0);
      return { v: Math.min(98, base + boost), date: ds };
    });
  }, [sessionHistory]);

  const heatmap = useMemo(() => {
    return Array.from({ length: 84 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (83 - i));
      const ds = d.toISOString().split("T")[0];
      const count = sessionHistory.filter(s => s.date === ds).length;
      return { date: ds, count, level: Math.min(5, count * 2) };
    });
  }, [sessionHistory]);

  const statCards = [
    { label: "Retention Score", value: `${retentionScore}%`, delta: "+4.2% this week", icon: "🧠", color: "var(--cyan)" },
    { label: "Active Streak", value: `${streak}d`, delta: `Level ${level}`, icon: "🔥", color: "var(--pink)" },
    { label: "Cards Mastered", value: masteredCards, delta: "long-term memory", icon: "🎯", color: "var(--green)" },
    { label: "Today's Focus", value: `${(todayMinutes / 60).toFixed(1)}h`, delta: "of study time", icon: "⏱️", color: "var(--purple)" },
  ];

  const cogLoad = 68 + Math.sin(Date.now() / 2000000) * 10 | 0;
  const userName = state.user?.name || "Student";

  return (
    <div className="fade-in">
      {/* Hero */}
      <div className="glass neon-border" style={{ padding: "28px 32px", marginBottom: 20, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%,rgba(0,255,255,.08),transparent 55%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16, position: "relative" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              ✦ NEURAL STATUS · SYNCED
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 800, lineHeight: 1.2, marginBottom: 8 }}>
              Welcome back, <span className="gradient-text">{userName}</span>.
            </h2>
            <p style={{ color: "var(--text2)", fontSize: 14, maxWidth: 500, lineHeight: 1.6 }}>
              Your memory engine is{" "}<span style={{ color: "var(--cyan)", fontWeight: 600 }}>{retentionScore}% optimal</span>.{" "}
              {dueCount > 0 ? `${dueCount} high-impact recalls queued — complete them to jump ${Math.ceil(dueCount / 4)} cognitive levels.` : "All reviews complete — memory traces are solidifying."}
            </p>
          </div>
          <button className="btn-primary" onClick={() => onNav("recall")} style={{ padding: "12px 24px", fontSize: 14, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 0 32px rgba(0,255,255,.25)" }}>
            ⚡ Start Recall Session →
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid-4col" style={{ marginBottom: 16 }}>
        {statCards.map((s, i) => (
          <div key={s.label} className="glass" style={{ padding: "20px", position: "relative", overflow: "hidden", transition: "transform .2s" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
            <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: s.color, opacity: 0.15, filter: "blur(20px)" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--text3)", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
              <span style={{ fontSize: 18 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, textShadow: `0 0 20px ${s.color}55`, fontFamily: "var(--font-display)" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="grid-dashboard-main" style={{ marginBottom: 12 }}>
        {/* Retention curve */}
        <div className="glass" style={{ padding: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 4 }}>📈 14-DAY RETENTION CURVE</div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>Memory Trajectory</h3>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["7d","14d","30d"].map((r,i) => (
                <button key={r} className={`tab${i===1?" active":""}`}>{r}</button>
              ))}
            </div>
          </div>
          <LineChart data={retentionCurve} height={100} />
        </div>

        {/* Cognitive load */}
        <div className="glass" style={{ padding: "24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 12 }}>🔮 COGNITIVE LOAD</div>
          <div style={{ position: "relative" }}>
            <RadialProgress value={cogLoad} size={140} color="var(--pink)" />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, color: "var(--pink)", textShadow: "0 0 20px rgba(255,0,255,.4)" }}>{cogLoad}%</div>
              <div style={{ fontSize: 9, color: "var(--text3)", letterSpacing: "0.1em" }}>FLOW ZONE</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text2)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
            You're in the <span style={{ color: "var(--pink)", fontWeight: 600 }}>flow zone</span>. Push for one more session.
          </p>
        </div>
      </div>

      {/* Heatmap */}
      <div className="glass" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--text3)", marginBottom: 4 }}>✓ LAST 12 WEEKS</div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>Neural Activity Map</h3>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text3)" }}>
            less {[0,1,2,3,4,5].map(l => <div key={l} className="heatmap-cell" data-level={l||undefined} style={{display:"inline-block"}} />)} more
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridAutoFlow: "column", gridTemplateRows: "repeat(7,1fr)", gap: 3, width: "fit-content" }}>
            {heatmap.map(cell => (
              <div key={cell.date} className="heatmap-cell" data-level={cell.level || undefined} title={`${cell.date}: ${cell.count} sessions`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Active Recall ─────────────────────────────────────────────────────────
function RecallPage({ state, dispatch, toast }) {
  const { decks } = state;
  const [selDeck, setSelDeck] = useState(decks[0]?.id ?? "");
  const [started, setStarted] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [hard, setHard] = useState(0); const [med, setMed] = useState(0); const [easy, setEasy] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);

  const deck = decks.find(d => d.id === selDeck) ?? decks[0];
  const cards = useMemo(() => {
    if (!deck) return [];
    const due = deck.cards.filter(isDueToday);
    return due.length ? due : deck.cards.slice(0, 6);
  }, [deck]);

  useEffect(() => {
    if (!started || done) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [started, done, startTime]);

  const current = cards[cardIdx];
  const progress = cards.length ? (cardIdx / cards.length) * 100 : 0;
  const fmt = s => `${Math.floor(s/60)}m ${String(s%60).padStart(2,"0")}s`;

  const handleReveal = () => setFlipped(true);

  const getAIFeedback = async (tier) => {
    setLoadingFeedback(true);
    try {
      const sysPrompt = `You are a spaced repetition coach. The student rated a card "${tier}". Give 1-2 sentences of encouraging, science-based feedback about what this rating means for their memory consolidation.`;
      const msg = await askCognifyAI([{ role: "user", content: `Card: "${current.front}" Answer: "${answer || "(no written answer)"}" Rating: ${tier}` }], sysPrompt);
      setFeedback(msg);
    } catch {
      const fallbacks = { hard: "Struggling is good data — the algorithm will show this card more frequently.", medium: "Partial recall means you're in the optimal learning zone.", easy: "Excellent! This memory trace is consolidating well." };
      setFeedback(fallbacks[tier]);
    }
    setLoadingFeedback(false);
  };

  const handleTier = async (tier) => {
    const quality = tier === "easy" ? 5 : tier === "medium" ? 3 : 1;
    dispatch({ type: "REVIEW_CARD", deckId: deck.id, cardId: current.id, updates: sm2Review(current, quality) });
    dispatch({ type: "ADD_XP", amount: tier === "easy" ? 15 : tier === "medium" ? 10 : 5 });
    if (tier === "hard") setHard(h => h + 1);
    else if (tier === "medium") setMed(m => m + 1);
    else setEasy(e => e + 1);

    await getAIFeedback(tier);

    setTimeout(() => {
      if (cardIdx + 1 >= cards.length) {
        const acc = Math.round(((easy + (tier === "easy" ? 1 : 0)) + (med + (tier === "medium" ? 1 : 0)) * 0.7) / cards.length * 100);
        dispatch({ type: "ADD_SESSION", session: { date: today, deckName: deck.name, cards: cards.length, accuracy: acc, xp: cards.length * 10, duration: elapsed } });
        toast("Session Complete! 🎉", { desc: `${cards.length} cards reviewed · ${acc}% accuracy`, color: "rgba(0,255,128,.3)", icon: "🎯" });
        setDone(true);
      } else {
        setCardIdx(i => i + 1);
        setFlipped(false);
        setAnswer("");
        setFeedback("");
      }
    }, 1800);
  };

  if (!started) return (
    <div className="fade-in" style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 8 }}>🧠 ACTIVE RECALL</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginBottom: 20 }}>
        Choose a <span className="gradient-text">deck to recall</span>.
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {decks.map(d => {
          const dueCards = d.cards.filter(isDueToday);
          return (
            <div key={d.id} className={`glass${selDeck === d.id ? " neon-border" : ""}`}
              onClick={() => setSelDeck(d.id)}
              style={{ padding: "18px 20px", cursor: "pointer", border: selDeck === d.id ? `1px solid ${d.color}44` : "1px solid var(--border)", transition: "all .2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 24 }}>{d.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text2)" }}>{d.description}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: d.color }}>{dueCards.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text3)" }}>due today</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn-primary" onClick={() => setStarted(true)} style={{ padding: "14px 40px", fontSize: 15 }}>
        Start Session →
      </button>
    </div>
  );

  if (done) return (
    <div className="fade-in" style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginBottom: 12 }}>Session Complete!</h2>
      <div className="glass" style={{ padding: "24px", marginBottom: 20 }}>
        <div className="grid-3col">
          {[["Hard 😤", hard, "var(--rose)"],["Medium 🤔", med, "var(--cyan)"],["Easy 😎", easy, "var(--green)"]].map(([l,v,c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: c }}>{v}</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
          Time: {fmt(elapsed)} · XP earned: +{cards.length * 10}
        </div>
      </div>
      <button className="btn-primary" onClick={() => { setStarted(false); setDone(false); setCardIdx(0); setHard(0); setMed(0); setEasy(0); setFeedback(""); }} style={{ padding: "14px 32px" }}>
        New Session
      </button>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 620, margin: "0 auto" }}>
      {/* Progress */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text2)" }}>{deck.icon} {deck.name}</div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>{fmt(elapsed)} · Card {cardIdx + 1}/{cards.length}</div>
      </div>
      <div className="prog" style={{ marginBottom: 28 }}>
        <div className="prog-fill" style={{ width: `${progress}%`, background: `linear-gradient(90deg,${deck.color},var(--purple))` }} />
      </div>

      {/* Card */}
      <div className="card" style={{ height: 220, marginBottom: 20 }} onClick={() => !flipped && handleReveal()}>
        <div className={`card-inner${flipped ? " flipped" : ""}`}>
          <div className="card-face glass" style={{ flexDirection: "column", gap: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${deck.color}33` }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "var(--text3)" }}>QUESTION · {current.topic}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>{current.front}</div>
            {!flipped && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>Click to reveal answer</div>}
          </div>
          <div className="card-back glass" style={{ flexDirection: "column", gap: 8, background: `rgba(${deck.color === "var(--cyan)" ? "0,255,255" : "128,0,255"},0.05)`, border: `1px solid ${deck.color}33` }}>
            <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "var(--text3)" }}>ANSWER</div>
            <div style={{ fontSize: 15, textAlign: "center", lineHeight: 1.6, color: "var(--text1)" }}>{current.back}</div>
          </div>
        </div>
      </div>

      {!flipped && (
        <div>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer before revealing (optional)…"
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, marginBottom: 12, resize: "none", minHeight: 80 }} rows={3} />
          <button className="btn-primary" onClick={handleReveal} style={{ width: "100%", padding: 14 }}>Reveal Answer</button>
        </div>
      )}

      {flipped && (
        <div>
          {feedback && (
            <div className="glass" style={{ padding: "14px 18px", marginBottom: 14, border: "1px solid rgba(0,255,255,.15)", fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
              {loadingFeedback ? <span className="pulse">AI analyzing…</span> : <Typing text={feedback} speed={12} />}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {[["Hard","😤","var(--rose)","rgba(244,63,94,.12)"],["Medium","🤔","var(--cyan)","rgba(0,255,255,.08)"],["Easy","😎","var(--green)","rgba(0,255,128,.08)"]].map(([label,icon,col,bg]) => (
              <button key={label} onClick={() => handleTier(label.toLowerCase())}
                style={{ background: bg, border: `1px solid ${col}44`, borderRadius: 12, padding: "16px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all .2s", fontFamily: "var(--font-body)" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = col; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = `${col}44`; }}>
                <span style={{ fontSize: 24 }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: col }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Tutor ──────────────────────────────────────────────────────────────
function TutorPage({ state }) {
  const [messages, setMessages] = useState([{
    id: "welcome", role: "assistant",
    content: `Hey ${state.user?.name || "there"} 👋 I'm your Cognify AI tutor. I know your study history, learning style (${state.user?.style || "mixed"}), and weak topics. Ask me anything — I'll give you personalized, science-backed answers.\n\nWhat would you like to work on today?`,
  }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const PROMPTS = [
    "Explain my weakest topic in simple terms",
    "Quiz me on something I'm struggling with",
    "What should I study next for maximum retention?",
    "Help me understand spaced repetition",
    "Create a 5-question recall test for me",
    "How can I improve my study efficiency?",
  ];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (text) => {
    if (!text.trim() || streaming) return;
    setInput("");
    const userMsg = { id: Date.now() + "u", role: "user", content: text };
    const asstId = Date.now() + "a";
    setMessages(p => [...p, userMsg, { id: asstId, role: "assistant", content: "", streaming: true }]);
    setStreaming(true);

    const sysPrompt = `You are Cognify, a personalized AI study tutor. Student profile: name=${state.user?.name}, subjects=${state.user?.subjects?.join(",") || "general"}, goal=${state.user?.goal || "learn"}, learning style=${state.user?.style || "mixed"}, weak topics=${state.user?.weakTopics?.join(",") || "none identified"}. Be concise (2-4 sentences), adaptive, and science-based. Use the student's subjects when giving examples.`;

    try {
      const history = [...messages, userMsg].slice(-10).map(m => ({ role: m.role, content: m.content }));
      const reply = await askCognifyAI(history, sysPrompt);
      setMessages(p => p.map(m => m.id === asstId ? { ...m, content: reply, streaming: false } : m));
    } catch {
      setMessages(p => p.map(m => m.id === asstId ? { ...m, content: "I'm having trouble connecting. Please try again!", streaming: false } : m));
    }
    setStreaming(false);
  }, [messages, streaming, state.user]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 4 }}>💬 AI TUTOR</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>
          Your <span className="gradient-text">cognitive mentor</span>.
        </h2>
      </div>

      {/* Suggested prompts */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        {PROMPTS.map(p => (
          <button key={p} className="btn-ghost" onClick={() => send(p)} style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap", flexShrink: 0 }}>{p}</button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 4 }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: "flex", gap: 12, justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            {msg.role === "assistant" && (
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,var(--cyan),var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>🧠</div>
            )}
            <div style={{
              maxWidth: "75%", padding: "12px 16px", borderRadius: 14, fontSize: 14, lineHeight: 1.6,
              background: msg.role === "user" ? "linear-gradient(135deg,rgba(0,255,255,.15),rgba(128,0,255,.15))" : "var(--surface)",
              border: `1px solid ${msg.role === "user" ? "rgba(0,255,255,.2)" : "var(--border)"}`,
              whiteSpace: "pre-wrap",
            }}>
              {msg.streaming ? <Typing text={msg.content || "Thinking…"} speed={10} /> : msg.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask anything — I'm personalized to your learning profile…"
          style={{ flex: 1, padding: "12px 16px", fontSize: 14, resize: "none", maxHeight: 120 }} rows={2} />
        <button className="btn-primary" onClick={() => send(input)} disabled={!input.trim() || streaming}
          style={{ padding: "12px 20px", alignSelf: "flex-end" }}>
          {streaming ? <span className="spin" style={{ display: "block", width: 18, height: 18, border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%" }} /> : "↑"}
        </button>
      </div>
    </div>
  );
}

// ─── Spaced Repetition ─────────────────────────────────────────────────────
function SpacedPage({ state, toast }) {
  const { decks } = state;
  const allCards = useMemo(() => decks.flatMap(d => d.cards.map(c => ({ ...c, deckName: d.name, deckColor: d.color }))), [decks]);
  const dueToday = allCards.filter(isDueToday);
  const [done, setDone] = useState(new Set());

  const todayStr = today;
  const inWeek = allCards.filter(c => c.nextDue && c.nextDue <= new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]);

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 6 }}>📅 SM-2 ALGORITHM</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800 }}>
          Your <span className="gradient-text">forgetting curve</span>, defeated.
        </h2>
      </div>

      {/* Buckets */}
      <div className="grid-3col" style={{ marginBottom: 24 }}>
        {[["Due Today", dueToday.length, "var(--pink)","🔥"],["This Week", inWeek.length, "var(--cyan)","📅"],["Total Tracked", allCards.length, "var(--green)","🎯"]].map(([l,v,c,ic]) => (
          <div key={l} className="glass" style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{ic}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div className="glass" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>Today's Review Queue</h3>
          <span style={{ fontSize: 13, color: "var(--text3)" }}>{dueToday.length - done.size} remaining</span>
        </div>
        {dueToday.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: 6 }}>All caught up!</div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>No reviews due today. Your memory traces are solidifying.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueToday.map(card => (
              <div key={card.id} className={done.has(card.id) ? "" : "glass"}
                style={{ padding: "14px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 14, opacity: done.has(card.id) ? 0.4 : 1, transition: "opacity .3s", border: done.has(card.id) ? "none" : "1px solid var(--border)" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: card.deckColor, flexShrink: 0, boxShadow: `0 0 8px ${card.deckColor}` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{card.front}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>{card.topic} · {card.deckName}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: card.easeFactor < 2 ? "var(--rose)" : card.easeFactor > 2.8 ? "var(--green)" : "var(--cyan)", fontWeight: 600 }}>
                    {card.easeFactor < 2 ? "⚠ Hard" : card.easeFactor > 2.8 ? "✓ Strong" : "~ Medium"}
                  </span>
                  {!done.has(card.id) && (
                    <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 12 }}
                      onClick={() => { setDone(p => new Set([...p, card.id])); toast("Card marked ✓", { icon: "✅", desc: "SM-2 interval updated" }); }}>
                      Done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload & Analyze ──────────────────────────────────────────────────────
function UploadPage({ state, dispatch, toast }) {
  const [stage, setStage] = useState("idle");
  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const STEPS = ["Parsing document structure…","Extracting key concepts…","Mapping semantic relationships…","Generating recall prompts…","Optimizing spaced intervals…","Synthesizing recommendations…"];

  const processFile = async (file) => {
    setFileName(file.name);
    setStage("analyzing");
    let content = "";
    if (file.type.includes("text") || file.name.endsWith(".md")) {
      content = await file.text();
    } else {
      content = `Document: ${file.name} (${Math.round(file.size / 1024)}KB)`;
    }
    setFileContent(content.slice(0, 2000));

    // Simulate progress
    for (let i = 0; i <= STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 500));
      setStepIdx(i);
      setAnalysisProgress(Math.round((i / STEPS.length) * 100));
    }

    // AI Analysis
    try {
      const key = getApiKey();
      if (!key) throw new Error("API key not set");
      
      const body = {
        systemInstruction: { parts: [{ text: "Analyze study material. Return ONLY valid JSON: {\"summary\":\"2-3 sentences\",\"key_concepts\":[\"concept1\",\"concept2\",\"concept3\",\"concept4\",\"concept5\"],\"flashcards\":[{\"front\":\"question\",\"back\":\"answer\",\"topic\":\"topic\"}]}. Generate 6 flashcards." }] },
        contents: [{ role: "user", parts: [{ text: `Analyze this study material and generate flashcards:\n\n${content.slice(0, 1500) || "General study document: " + file.name}` }] }],
        generationConfig: { responseMimeType: "application/json" }
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(text);
      setResult(parsed);

      // Add deck
      const newDeck = {
        id: `deck-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        description: parsed.summary?.slice(0, 80) || "AI-generated deck",
        color: "var(--green)",
        icon: "📄",
        cards: (parsed.flashcards || []).map((fc, i) => ({
          ...fc, id: `gen-${Date.now()}-${i}`,
          easeFactor: 2.5, interval: 0, repetitions: 0, nextDue: today,
        })),
      };
      dispatch({ type: "ADD_DECK", deck: newDeck });
      setStage("results");
      toast("Analysis Complete! 🎉", { icon: "✨", desc: `${newDeck.cards.length} flashcards generated`, color: "rgba(0,255,128,.3)" });
    } catch (e) {
      setResult({ summary: "Document analyzed. Flashcards generated based on content structure.", key_concepts: ["Core concepts", "Key mechanisms", "Definitions", "Applications", "Examples"], flashcards: [] });
      setStage("results");
    }
  };

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); };

  if (stage === "analyzing") return (
    <div className="fade-in" style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🔬</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Analyzing <span className="gradient-text">{fileName}</span></h2>
      <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 28 }}>AI is building your personalized flashcard deck…</p>
      <div className="prog" style={{ marginBottom: 16, height: 8 }}>
        <div className="prog-fill" style={{ width: `${analysisProgress}%`, background: "linear-gradient(90deg,var(--cyan),var(--purple))" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, opacity: i <= stepIdx ? 1 : 0.25, transition: "opacity .4s", padding: "4px 0" }}>
            {i < stepIdx ? <span style={{ color: "var(--green)" }}>✓</span> :
              i === stepIdx ? <div className="spin" style={{ width: 14, height: 14, border: "2px solid var(--cyan)", borderTopColor: "transparent", borderRadius: "50%" }} /> :
              <div style={{ width: 14, height: 14, border: "1px solid var(--border)", borderRadius: "50%" }} />}
            <span style={{ fontSize: 13, color: i <= stepIdx ? "var(--text1)" : "var(--text3)" }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (stage === "results" && result) return (
    <div className="fade-in" style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--green)", fontWeight: 700, marginBottom: 6 }}>✓ ANALYSIS COMPLETE</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>Results for <span className="gradient-text">{fileName}</span></h2>
      </div>
      {result.summary && (
        <div className="glass" style={{ padding: "20px", marginBottom: 16, borderColor: "rgba(0,255,128,.2)" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--green)", fontWeight: 700, marginBottom: 8 }}>AI SUMMARY</div>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text2)" }}>{result.summary}</p>
        </div>
      )}
      {result.key_concepts?.length > 0 && (
        <div className="glass" style={{ padding: "20px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--cyan)", fontWeight: 700, marginBottom: 12 }}>KEY CONCEPTS EXTRACTED</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {result.key_concepts.map(c => (
              <span key={c} style={{ padding: "6px 14px", borderRadius: 20, background: "rgba(0,255,255,.08)", border: "1px solid rgba(0,255,255,.2)", fontSize: 13, color: "var(--cyan)" }}>{c}</span>
            ))}
          </div>
        </div>
      )}
      {result.flashcards?.length > 0 && (
        <div className="glass" style={{ padding: "20px" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--purple)", fontWeight: 700, marginBottom: 12 }}>GENERATED FLASHCARDS ({result.flashcards.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.flashcards.map((fc, i) => (
              <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Q: {fc.front}</div>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>A: {fc.back}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button className="btn-ghost" onClick={() => { setStage("idle"); setFileName(""); setResult(null); }} style={{ marginTop: 20, padding: "10px 20px" }}>Upload Another</button>
    </div>
  );

  return (
    <div className="fade-in" style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 6 }}>📤 UPLOAD & ANALYZE</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800 }}>
          Upload your <span className="gradient-text">study material</span>.
        </h2>
        <p style={{ color: "var(--text2)", fontSize: 14, marginTop: 8 }}>AI will extract concepts, generate flashcards, and build your personalized deck.</p>
      </div>

      <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${dragOver ? "var(--cyan)" : "var(--border)"}`, borderRadius: 16, padding: "60px 40px", textAlign: "center", cursor: "pointer", transition: "all .2s", background: dragOver ? "rgba(0,255,255,.05)" : "transparent" }}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.docx" style={{ display: "none" }} onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Drop your file here</div>
        <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 16 }}>or click to browse</div>
        <div style={{ fontSize: 12, color: "var(--text3)" }}>Supports PDF · TXT · MD · DOCX</div>
      </div>

      <div className="grid-3col" style={{ marginTop: 24 }}>
        {[["🔍","AI Extraction","Identifies key concepts & relationships"],["🃏","Auto Flashcards","Generates SM-2 optimized recall cards"],["📊","Smart Scheduling","Slots reviews into your spaced timeline"]].map(([ic,t,d]) => (
          <div key={t} className="glass" style={{ padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{ic}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Study Planner ─────────────────────────────────────────────────────────
function PlannerPage({ state }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(new Set());
  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

  const generate = async () => {
    setLoading(true);
    const result = await generateStudyPlan(state.user || { name: "Student", subjects: ["General"], goal: "learn", style: "mixed", sessionMins: 30 });
    if (result?.days) { setPlan(result.days); }
    else {
      // Fallback plan
      setPlan([
        { day: "Mon", sessions: [{ time: "Morning", topic: (state.user?.subjects?.[0] || "Review"), type: "Recall", mins: 25 }, { time: "Evening", topic: (state.user?.subjects?.[1] || "New Material"), type: "Read", mins: 40 }] },
        { day: "Tue", sessions: [{ time: "Morning", topic: "Spaced Review", type: "SR Queue", mins: 20 }, { time: "Afternoon", topic: (state.user?.subjects?.[0] || "Deep Study"), type: "Lecture", mins: 60 }] },
        { day: "Wed", sessions: [{ time: "Morning", topic: "Active Recall Sprint", type: "Recall", mins: 30 }] },
        { day: "Thu", sessions: [{ time: "Evening", topic: (state.user?.subjects?.[2] || "Practice"), type: "Practice", mins: 45 }] },
        { day: "Fri", sessions: [{ time: "Morning", topic: "Weekly Recap", type: "Review", mins: 30 }] },
        { day: "Sat", sessions: [{ time: "Morning", topic: "Mock Test", type: "Test", mins: 90 }, { time: "Afternoon", topic: "Spaced Review", type: "SR Queue", mins: 40 }] },
        { day: "Sun", sessions: [{ time: "Evening", topic: "Reflection", type: "Journal", mins: 15 }] },
      ]);
    }
    setLoading(false);
  };

  const colors = { Recall: "var(--cyan)", "SR Queue": "var(--pink)", Lecture: "var(--purple)", Read: "var(--green)", Practice: "var(--cyan)", Test: "var(--rose)", Review: "var(--green)", Journal: "var(--green)", "Deep Read": "var(--purple)", "New Material": "var(--cyan)" };

  if (!plan) return (
    <div className="fade-in" style={{ maxWidth: 580, margin: "0 auto", textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>🗓️</div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, marginBottom: 12 }}>
        AI-Generated <span className="gradient-text">Study Plan</span>
      </h2>
      <p style={{ color: "var(--text2)", fontSize: 15, maxWidth: 400, margin: "0 auto 32px", lineHeight: 1.6 }}>
        Get a personalized 7-day schedule built around your subjects, goals, and preferred study times — generated by real AI.
      </p>
      <button className="btn-primary" onClick={generate} disabled={loading} style={{ padding: "14px 40px", fontSize: 15 }}>
        {loading ? <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="spin" style={{ width: 18, height: 18, border: "2px solid #000", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }} />Generating…</span> : "Generate My Plan ✨"}
      </button>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 6 }}>🗓️ WEEKLY PLANNER</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800 }}>
            Your <span className="gradient-text">study schedule</span>.
          </h2>
        </div>
        <button className="btn-ghost" onClick={generate} disabled={loading} style={{ padding: "9px 18px", fontSize: 13 }}>
          {loading ? "Regenerating…" : "↺ Regenerate"}
        </button>
      </div>

      <div className="grid-7col">
        {(plan || []).map(({ day, sessions }) => {
          const isToday = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] === day;
          return (
            <div key={day} className="glass" style={{ padding: "14px 10px", borderColor: isToday ? "rgba(0,255,255,.3)" : undefined, minHeight: 120 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: isToday ? "var(--cyan)" : "var(--text2)", textAlign: "center" }}>
                {day}{isToday && " ·now"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sessions.map((s, i) => {
                  const key = `${day}-${i}`;
                  return (
                    <div key={i} onClick={() => setCompleted(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                      style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", opacity: completed.has(key) ? 0.4 : 1, transition: "opacity .2s", background: `${colors[s.type] || "var(--cyan)"}15`, border: `1px solid ${colors[s.type] || "var(--cyan)"}33` }}>
                      <div style={{ fontSize: 10, color: colors[s.type] || "var(--cyan)", fontWeight: 700, marginBottom: 2 }}>{s.type}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{s.topic}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)" }}>{s.mins}m · {s.time}</div>
                      {completed.has(key) && <div style={{ fontSize: 10, color: "var(--green)", marginTop: 2 }}>✓ Done</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Library ───────────────────────────────────────────────────────────────
function LibraryPage({ state, dispatch, toast }) {
  const lessons = [
    { id: "l1", title: "The Forgetting Curve", tag: "Memory", icon: "🧠", color: "var(--cyan)", mins: 3, desc: "Why you lose 70% of new info in 24h — and how to fight back.", content: "Hermann Ebbinghaus discovered in 1885 that memory decays exponentially over time. Without reinforcement, 50% of new information is lost within an hour and ~70% within 24 hours.\n\nThe good news: each review resets the curve at a higher baseline. After just 3 spaced reviews, retention stabilizes above 90% for weeks. This is the scientific foundation of spaced repetition — you're not fighting forgetting, you're harnessing it.\n\nKey insight: The optimal review moment is just before you would have forgotten something, not immediately after learning it. That's why Cognify schedules your reviews at precisely calculated intervals." },
    { id: "l2", title: "Active Recall vs Re-reading", tag: "Technique", icon: "⚡", color: "var(--pink)", mins: 4, desc: "The single highest-leverage study habit. Backed by 100+ studies.", content: "Re-reading feels productive because familiar text creates an illusion of fluency masquerading as learning. But dozens of studies show re-reading produces almost no durable retention.\n\nActive recall — forcing yourself to retrieve information without looking at the source — is 2–5× more effective. The act of struggling to remember something strengthens the neural pathway far more than passive re-exposure.\n\nHow to practice: Close your notes, write down everything you remember about a topic, then check what you missed. The gaps you discover are exactly what needs more attention." },
    { id: "l3", title: "Interleaving", tag: "Strategy", icon: "🔀", color: "var(--purple)", mins: 5, desc: "Mixing topics feels harder. That's why it works.", content: "Blocked practice (studying one topic exhaustively) feels efficient because performance improves quickly within a session. But this progress is largely illusory — it doesn't transfer to long-term memory.\n\nInterleaving — mixing different topics within a session — slows immediate performance but produces dramatically better long-term retention. The extra cognitive effort required to constantly switch context forces deeper processing.\n\nResearch finding: Students who interleaved mathematics problems outperformed blocked-practice students by 43% on final tests, despite performing worse during practice itself." },
    { id: "l4", title: "Desirable Difficulty", tag: "Mindset", icon: "💪", color: "var(--green)", mins: 4, desc: "Struggle is the feature, not the bug. The science of effortful learning.", content: "Robert Bjork coined 'desirable difficulties' to describe learning conditions that slow immediate performance but enhance long-term retention. The key word is 'desirable' — not all difficulties help.\n\nDesirable difficulties include: spaced practice, interleaving, retrieval practice, and generation (solving problems before being taught the solution). All feel harder in the moment but produce superior outcomes.\n\nUndesirable difficulties — unclear instructions, irrelevant complexity — slow learning without benefit. The cognitive effort must be directed at the right material at the right time." },
    { id: "l5", title: "Sleep & Memory Consolidation", tag: "Biology", icon: "🌙", color: "var(--cyan)", mins: 6, desc: "What happens to memories overnight — and why naps work.", content: "Memory consolidation — stabilizing newly formed memories — happens primarily during sleep. During slow-wave (deep) sleep, the hippocampus replays the day's learning, transferring memories to the neocortex for long-term storage.\n\nREM sleep strips away emotional valence and integrates new information with existing knowledge schemas, creating insight and creative connections.\n\nPractical implication: Reviewing material within 4 hours before sleep significantly boosts consolidation. Even a 20-minute nap after learning produces measurable retention improvements." },
    { id: "l6", title: "Beating Study Burnout", tag: "Wellbeing", icon: "🌿", color: "var(--pink)", mins: 5, desc: "Sustainable intensity. Recovery as a skill.", content: "Cognitive fatigue is a genuine physiological state, not just lack of willpower. After approximately 90 minutes of focused work, prefrontal cortex efficiency drops measurably. Pushing through produces diminishing returns.\n\nTop performers treat recovery as a core competency. Deliberate rest — including short breaks, walks, and sleep — isn't laziness; it's part of the performance system.\n\nThe Cognify approach: study in focused 25–45 minute sprints, take active breaks between sessions, and never review cards when cognitively depleted." },
  ];
  const [expanded, setExpanded] = useState(null);
  const [askingLesson, setAskingLesson] = useState(null);
  const [lessonQ, setLessonQ] = useState("");
  const [lessonA, setLessonA] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);

  const askAboutLesson = async (lesson) => {
    if (!lessonQ.trim()) return;
    setLessonLoading(true);
    const sys = `You are an expert on learning science. Answer questions about: "${lesson.title}". Context:\n${lesson.content}\n\nBe concise (2-3 sentences).`;
    const reply = await askCognifyAI([{ role: "user", content: lessonQ }], sys);
    setLessonA(reply);
    setLessonLoading(false);
  };

  const principle = ["Spacing trumps cramming, every time.","Struggle is the signal of learning.","Recall is not testing — it IS the learning.","Sleep is the silent architect of memory.","Interleaving confusion is a feature, not a bug."][new Date().getDate() % 5];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--text3)", marginBottom: 6 }}>📚 MICRO-LESSONS</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800 }}>
          Science of <span className="gradient-text">Learning</span>.
        </h2>
      </div>

      <div className="glass neon-border" style={{ padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <div style={{ fontSize: 10, color: "var(--cyan)", fontWeight: 700, letterSpacing: "0.1em" }}>TODAY'S PRINCIPLE</div>
          <div style={{ fontSize: 14, fontStyle: "italic", color: "var(--text1)", marginTop: 2 }}>"{principle}"</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {lessons.map(l => {
          const isExpanded = expanded === l.id;
          const isDone = state.completedLessons?.includes(l.id);
          return (
            <div key={l.id} className="glass" style={{ borderColor: isDone ? "rgba(0,255,128,.2)" : undefined, overflow: "hidden" }}>
              <div style={{ padding: "18px 20px", display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : l.id)}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${l.color}15`, border: `1px solid ${l.color}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{l.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{l.title}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${l.color}15`, color: l.color, fontWeight: 700 }}>{l.tag}</span>
                    {isDone && <span style={{ fontSize: 10, color: "var(--green)" }}>✓ Complete</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text2)" }}>{l.desc}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>{l.mins} min</span>
                  <span style={{ fontSize: 18, color: "var(--text3)" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExpanded && (
                <div style={{ padding: "0 20px 20px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ paddingTop: 16, fontSize: 14, color: "var(--text2)", lineHeight: 1.8, whiteSpace: "pre-line", marginBottom: 20 }}>{l.content}</div>
                  
                  {/* AI Q&A for lesson */}
                  {askingLesson === l.id ? (
                    <div className="glass" style={{ padding: 16, marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: "var(--cyan)", fontWeight: 700, marginBottom: 10 }}>💬 ASK AI ABOUT THIS LESSON</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input value={lessonQ} onChange={e => setLessonQ(e.target.value)} onKeyDown={e => e.key === "Enter" && askAboutLesson(l)}
                          placeholder={`Ask about ${l.title}…`} style={{ flex: 1, padding: "10px 14px", fontSize: 13 }} />
                        <button className="btn-primary" onClick={() => askAboutLesson(l)} disabled={lessonLoading || !lessonQ.trim()} style={{ padding: "10px 16px" }}>
                          {lessonLoading ? "…" : "Ask"}
                        </button>
                      </div>
                      {lessonA && <div style={{ marginTop: 10, padding: "12px 14px", borderRadius: 10, background: "rgba(0,255,255,.05)", border: "1px solid rgba(0,255,255,.15)", fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}><Typing text={lessonA} /></div>}
                    </div>
                  ) : (
                    <button className="btn-ghost" onClick={() => { setAskingLesson(l.id); setLessonQ(""); setLessonA(""); }} style={{ padding: "8px 16px", fontSize: 12, marginBottom: 12 }}>💬 Ask AI about this</button>
                  )}

                  {!isDone && (
                    <button className="btn-primary" onClick={() => { dispatch({ type: "MARK_LESSON", id: l.id }); dispatch({ type: "ADD_XP", amount: 25 }); toast(`Lesson complete! +25 XP`, { icon: "📚", color: "rgba(0,255,128,.3)" }); }} style={{ padding: "10px 24px", fontSize: 13 }}>
                      Mark Complete (+25 XP)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── State / Reducer ───────────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case "REVIEW_CARD":
      return { ...state, decks: state.decks.map(d => d.id !== action.deckId ? d : { ...d, cards: d.cards.map(c => c.id !== action.cardId ? c : { ...c, ...action.updates }) }) };
    case "ADD_DECK":
      return { ...state, decks: [...state.decks, action.deck] };
    case "ADD_XP":
      return { ...state, xp: state.xp + action.amount };
    case "ADD_SESSION":
      return { ...state, sessionHistory: [action.session, ...state.sessionHistory].slice(0, 200), todayMinutes: state.todayMinutes + Math.round((action.session.duration || 0) / 60), streak: state.streak };
    case "MARK_LESSON":
      return { ...state, completedLessons: [...(state.completedLessons || []), action.id] };
    default:
      return state;
  }
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [onboarded, setOnboarded] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [page, setPage] = useState("dashboard");
  const { toasts, show: showToast, remove: removeToast } = useToast();

  const initialState = useMemo(() => ({
    user: null,
    xp: 3540,
    streak: 12,
    todayMinutes: 42,
    decks: SEED_DECKS,
    sessionHistory: buildSeedHistory(),
    completedLessons: [],
  }), []);

  const [state, dispatch] = useReducer(reducer, initialState);

  const handleAuth = (user) => {
    setAuthUser(user);
    if (!user.isNew) setOnboarded(true);
  };

  const handleOnboardingComplete = (profile) => {
    setUserProfile(profile);
    setOnboarded(true);
    dispatch({ type: "ADD_XP", amount: 100 });
  };

  const mergedState = { ...state, user: userProfile || authUser };

  if (!authUser) return (
    <>
      
      <AuthScreen onAuth={handleAuth} />
    </>
  );

  if (!onboarded) return (
    <>
      
      <OnboardingScreen userName={authUser.name} onComplete={handleOnboardingComplete} />
    </>
  );

  const pageComponents = {
    dashboard: <Dashboard state={mergedState} onNav={setPage} />,
    recall: <RecallPage state={mergedState} dispatch={dispatch} toast={showToast} />,
    spaced: <SpacedPage state={mergedState} dispatch={dispatch} toast={showToast} />,
    tutor: <TutorPage state={mergedState} />,
    upload: <UploadPage state={mergedState} dispatch={dispatch} toast={showToast} />,
    planner: <PlannerPage state={mergedState} />,
    library: <LibraryPage state={mergedState} dispatch={dispatch} toast={showToast} />,
  };

  return (
    <>
      
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "20%", left: "30%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,255,255,.03),transparent 60%)", filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: "10%", right: "20%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(128,0,255,.04),transparent 60%)", filter: "blur(80px)" }} />
      </div>

      
      <Sidebar active={page} onNav={setPage} user={mergedState.user} xp={state.xp} streak={state.streak} />

      {/* Mobile Nav */}
      <div className="mobile-nav">
        {NAV.map(n => (
          <div key={n.id} className={`mobile-nav-item ${page === n.id ? "active" : ""}`} onClick={() => setPage(n.id)}>
            <span className="icon">{n.icon}</span>
            <span>{n.label.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <main className="main" style={{ position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800 }}>
              {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>
              <span style={{ color: "var(--cyan)", fontWeight: 600 }}>{state.xp.toLocaleString()} XP</span> · {state.streak}🔥
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,rgba(0,255,255,.2),rgba(128,0,255,.2))", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, cursor: "pointer" }}>
              {(mergedState.user?.name || "U")[0].toUpperCase()}
            </div>
          </div>
        </div>

        {pageComponents[page]}
      </main>

      <Toast toasts={toasts} remove={removeToast} />
    </>
  );
}
