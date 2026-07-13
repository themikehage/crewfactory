export const CUSTOM_TOOL_THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Outfit', sans-serif;
    background: #121212;
    color: #e2e8f0;
    padding: 1rem;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  :root {
    --bg: #121212;
    --surface: #171717;
    --surface-hover: #313131;
    --accent: #4ade80;
    --text-primary: #e2e8f0;
    --text-secondary: #a2a2a2;
    --success: #4ade80;
    --warning: #fbbf24;
    --error: #ca3214;
    --border: #2a2a2a;
  }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .card-title { color: var(--text-primary); font-size: 14px; font-weight: 600; }
  .card-desc { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
  .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-success { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .badge-warning { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .badge-error { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }
  .badge-info { background: color-mix(in srgb, #60a5fa 15%, transparent); color: #60a5fa; }
  .badge-neutral { background: color-mix(in srgb, var(--text-secondary) 15%, transparent); color: var(--text-secondary); }
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; color: var(--text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .table td { padding: 8px 12px; color: var(--text-primary); border-bottom: 1px solid var(--border); }
  .table tr.striped:nth-child(even) { background: color-mix(in srgb, var(--surface-hover) 50%, transparent); }
  .metric-value { font-size: 32px; font-weight: 700; color: var(--accent); }
  .metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
  pre.code { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; overflow-x: auto; }
  .section-title { color: var(--text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .section { padding: 12px 0; }
  .tabs-header { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
  .tab-btn { padding: 8px 16px; font-size: 13px; font-weight: 500; color: var(--text-secondary); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .markdown-content { line-height: 1.7; }
  .markdown-content h1,.markdown-content h2,.markdown-content h3 { color: var(--text-primary); margin: 16px 0 8px; }
  .markdown-content p { margin: 8px 0; }
  .markdown-content code { background: var(--surface); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent); }
  .progress-bar { background: var(--surface); border-radius: 6px; height: 8px; overflow: hidden; }
  .progress-fill { background: var(--accent); height: 100%; border-radius: 6px; transition: width 0.4s ease; }
  .progress-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; justify-content: space-between; }
  .accordion-item { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
  .accordion-header { padding: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .accordion-body { padding: 0 12px 12px; }
  .diff-container { display: grid; grid-template-columns: 1fr 1fr; gap: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .diff-pane { overflow-x: auto; }
  .diff-header { padding: 6px 12px; font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
  .diff-line { padding: 2px 12px; white-space: pre; }
  .diff-add { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .diff-remove { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }
  .steps-list { position: relative; padding-left: 24px; }
  .steps-list::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .step-item { position: relative; padding-bottom: 16px; }
  .step-dot { position: absolute; left: -16px; top: 2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border); }
  .step-dot.done { background: var(--success); border-color: var(--success); }
  .step-dot.active { background: var(--accent); border-color: var(--accent); }
  .step-dot.error { background: var(--error); border-color: var(--error); }
  .step-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .step-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  .stats-grid { display: grid; gap: 12px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
  .stat-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
  .stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
  .stat-change { font-size: 12px; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; }
  .timeline-list { position: relative; padding-left: 24px; }
  .timeline-list::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .timeline-item { position: relative; padding-bottom: 16px; }
  .timeline-dot { position: absolute; left: -16px; top: 2px; width: 12px; height: 12px; border-radius: 50%; }
  .timeline-dot.success { background: var(--success); }
  .timeline-dot.warning { background: var(--warning); }
  .timeline-dot.error { background: var(--error); }
  .timeline-date { font-size: 11px; color: var(--text-secondary); }
  .timeline-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-top: 2px; }
  .timeline-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  .audio-player { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; }
  .audio-cover { width: 48px; height: 48px; border-radius: 6px; background: var(--border); flex-shrink: 0; }
  .audio-info { flex: 1; min-width: 0; }
  .audio-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .audio-artist { font-size: 11px; color: var(--text-secondary); }
  .audio-waveform { height: 32px; background: var(--accent); opacity: 0.3; border-radius: 4px; }
  .video-wrapper { position: relative; background: #000; border-radius: 8px; overflow: hidden; }
  .video-wrapper video { width: 100%; display: block; }
`;
