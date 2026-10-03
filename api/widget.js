// CallGuard embeddable widget
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const { provider = '1', amount = '1', label = 'Pay with CallGuard' } = req.query;

  const script = `
(function() {
  if (window.__cgWidgetLoaded) return;
  window.__cgWidgetLoaded = true;

  const STYLE = \`
    .cg-widget-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; background: #10b981; color: white;
      border: none; border-radius: 8px; font-size: 14px;
      font-weight: 600; cursor: pointer; font-family: inherit;
      transition: all .2s;
    }
    .cg-widget-btn:hover { background: #059669; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(16,185,129,.4); }
    .cg-widget-modal {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,.7); display: flex;
      align-items: center; justify-content: center; font-family: system-ui;
    }
    .cg-widget-card {
      background: #0f1623; border: 1px solid #1f2d42; border-radius: 16px;
      padding: 24px; max-width: 360px; width: 94%; color: #e8edf5;
    }
  \`;

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  document.querySelectorAll('[data-callguard-provider]').forEach(btn => {
    const pid = btn.dataset.callguardProvider || '${provider}';
    const amt = btn.dataset.callguardAmount || '${amount}';
    const lbl = btn.dataset.callguardLabel || '${label}';

    btn.innerHTML = \`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>\${lbl}\`;
    btn.className += ' cg-widget-btn';
    btn.onclick = () => {
      const modal = document.createElement('div');
      modal.className = 'cg-widget-modal';
      modal.innerHTML = \`<div class="cg-widget-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-weight:700;font-size:16px">Pay with CallGuard</div>
          <button onclick="this.closest('.cg-widget-modal').remove()" style="background:none;border:none;color:#8899b4;font-size:20px;cursor:pointer">×</button>
        </div>
        <div style="background:#131c2e;border:1px solid #1f2d42;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px">
          <div style="color:#8899b4;margin-bottom:4px">Provider</div>
          <div style="font-weight:600">#\${pid}</div>
          <div style="color:#8899b4;margin-top:8px;margin-bottom:4px">Amount</div>
          <div style="font-weight:600;color:#10b981">\${amt} USDC</div>
          <div style="color:#8899b4;margin-top:8px;font-size:11px">SLA-guaranteed · Refunded if missed</div>
        </div>
        <a href="https://arcsla.vercel.app/app/?provider=\${pid}" target="_blank"
          style="display:block;text-align:center;padding:12px;background:#10b981;color:white;border-radius:8px;font-weight:600;text-decoration:none">
          Open in CallGuard →
        </a>
      </div>\`;
      document.body.appendChild(modal);
      modal.onclick = e => { if (e.target === modal) modal.remove(); };
    };
  });
})();
`;

  res.status(200).send(script);
}
