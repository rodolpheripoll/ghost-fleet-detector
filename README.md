# Ghost Fleet Detector — Hackathon Albert School 2026

Detection of ghost fleet ships using AIS maritime data, ML anomaly detection, and a Next.js dashboard.

## Stack
- **Pipeline**: Python, pandas, scikit-learn (Isolation Forest), NetworkX, fpdf2
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Next.js 14, Tailwind CSS, Leaflet.js, Plotly.js
- **Deployment**: Vercel (frontend) + Supabase (backend)

## Setup

### 1. Run the Python pipeline
```bash
pip install -r requirements.txt
cp .env.example .env  # fill in your Supabase keys
python main.py
```

### 2. Run the frontend
```bash
cd frontend
npm install
npm run dev
```

## Detection Methods
- **Rule-based**: 6 rules with justified thresholds (IMO, SOLAS, Windward)
- **ML**: Isolation Forest (contamination=0.05)
- **Composite scoring**: weighted combination of all signals

## Team
Hackathon Albert School — Mai 2026
