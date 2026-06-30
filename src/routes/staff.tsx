import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/staff')({
  component: StaffGate,
});

/**
 * Staff gate: capture the shared staff code once, keep it in sessionStorage for
 * the shift, and head to the scanner. The real check happens server-side in
 * `verifyTicketFn`; this is just convenience so staff don't re-type each scan.
 */
function StaffGate() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  function unlock() {
    if (!code.trim()) return;
    sessionStorage.setItem('sl_staff_token', code.trim());
    void navigate({ to: '/staff/verify' });
  }

  return (
    <main style={{ padding: '8px 20px' }}>
      <div className="sl-gate">
        <div className="ic">🔑</div>
        <h1>Staff access</h1>
        <p>Enter the staff code once. We’ll remember this device so you can scan all shift.</p>
        <div style={{ marginTop: 22 }}>
          <input
            className="sl-input"
            placeholder="Staff code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && unlock()}
          />
        </div>
        <button className="sl-button sl-button-primary" style={{ marginTop: 16, background: '#5bbf4f', color: '#0f1d09' }} onClick={unlock}>
          Unlock scanner →
        </button>
        <div className="sl-gate-note">STORED ON THIS DEVICE · NO LOGIN</div>
      </div>
    </main>
  );
}
