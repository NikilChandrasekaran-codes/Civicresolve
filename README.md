# CivicResolve 🏛️
**AI-Powered Municipal Issue Resolution & Triage Platform**

CivicResolve is a modern single-page web application (HTML5, CSS3, JavaScript) that empowers citizens to report urban infrastructure issues and enables city administrators to review, prioritize, and dispatch municipal services.

---

## 🌟 Key Features

### 👤 Citizen Portal
- **Smart Complaint Reporting**: Submit issues with Title, Category, Location (manual or 1-click GPS detection), Description, and optional Photo Evidence (with drag-and-drop & live thumbnail preview).
- **Gemini AI Auto-Triage**: Sends newly submitted complaints to Google's Gemini API with structured JSON output:
  - **Category**: Verified municipal category.
  - **Priority Score**: `Low`, `Medium`, `High`, or `Critical`.
  - **AI Justification**: A concise one-line public safety and risk rationale.
  - **Recommended Department**: Auto-routes to the appropriate municipal entity (e.g. *Department of Public Works*, *Water & Sewer Authority*, *Bureau of Street Lighting*).
- **AI Triage Spotlight Card**: Prominently highlights the real-time AI evaluation and department recommendation right after submission or upon clicking any complaint.
- **My Submitted Complaints Feed**: Filterable by status (`Reported`, `In Progress`, `Resolved`) with timestamps, badges, and department tags.

### 🛡️ Admin Dispatcher Hub
- **Executive Metric Counters**: Real-time count badges for:
  - Total Complaints
  - Status Breakdown: `Reported`, `In Progress`, `Resolved`
  - Priority Breakdown: `Critical`, `High`, `Medium`, `Low`
- **Instant Status Management**: Change the status of any complaint via an inline dropdown; updates the state, counters, and `localStorage` in real-time.
- **Live Search & Multi-Filters**: Filter by status, priority, or search by keyword, landmark, or department.
- **Detailed Inspection Modal**: View full-resolution photos, issue logs, and AI reasoning.
- **Data Export & Reset**: Export records to JSON or restore default sample data at any time.

### ⚙️ Gemini API Configuration
- **Privacy-First**: Your Gemini API key is stored strictly inside `localStorage` in your browser. It is **never** hardcoded or sent to any server other than Google Generative Language endpoints.
- **Key Testing Tool**: In-modal connection verification to test your key against `gemini-flash-lite-latest` (default), `gemini-flash-latest`, `gemini-pro-latest`, or `gemini-2.5-flash`. Includes 30s timeout, 3x automated retries (2s, 4s, 8s backoff on 503/429/timeout), and automatic fallback model switching. Displays exact URL (with API key masked as `**`), model name, and full error text with zero console key leakage.
- **Graceful Error Handling**: If no API key is provided or if network/quota issues occur, CivicResolve displays a friendly error banner and applies intelligent fallback heuristics so citizen reports are never lost.

### 📦 Pre-loaded Sample Complaints
Includes 5 pre-configured sample complaints with realistic SVG illustrations and varied statuses:
1. 🕳️ **Pothole** (*Main St & 5th Ave*) — High Priority, *In Progress*
2. 🗑️ **Overflowing Garbage** (*Central Market Back Alley*) — Medium Priority, *Reported*
3. 💡 **Broken Streetlight** (*Westside Elementary School*) — Medium Priority, *In Progress*
4. 💧 **Water Leak** (*240 Grand Ave*) — Critical Priority, *Reported*
5. 🛣️ **Damaged Road** (*Riverbank Way*) — Low Priority, *Resolved*

---

## 🚀 How to Run

1. Open `index.html` directly in any web browser (Chrome, Edge, Firefox, Safari).
2. Click the **Gear icon** in the top right to paste your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Switch between **Citizen Portal** and **Admin Dashboard** using the navigation pill at the top.
