import re

with open('src/App.jsx', 'r') as f:
    code = f.read()

# 1. Dashboard Grids
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}', 'className="grid-4col" style={{ marginBottom: 16 }}')
code = code.replace('style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}', 'className="grid-dashboard-main" style={{ marginBottom: 12 }}')

# 2. Onboarding Grids
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 360, margin: "0 auto 36px" }}', 'className="grid-3col" style={{ maxWidth: 360, margin: "0 auto 36px" }}')
code = code.replace('style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}', 'className="grid-2col" style={{ marginBottom: 16 }}')
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}', 'className="grid-3col" style={{ marginBottom: 20 }}')
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}', 'className="grid-3col"')

# 3. Spaced Grids
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}', 'className="grid-3col" style={{ marginBottom: 24 }}')

# 4. Upload Grids
code = code.replace('style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}', 'className="grid-3col" style={{ marginTop: 24 }}')

# 5. Planner Grids
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}', 'className="grid-7col"')

# 6. Active Recall Completion
code = code.replace('style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}', 'className="grid-3col"')

# Add mobile nav
nav_code = """
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

      <main className="main" style={{ position: "relative", zIndex: 1 }}>"""

code = code.replace('<Sidebar active={page} onNav={setPage} user={mergedState.user} xp={state.xp} streak={state.streak} />\n\n      <main className="main" style={{ position: "relative", zIndex: 1 }}>', nav_code)

# Add index.css import at top
if "import './index.css'" not in code:
    code = code.replace('import { useState', "import './index.css';\nimport { useState", 1)

with open('src/App.jsx', 'w') as f:
    f.write(code)

print("Grids fixed")
