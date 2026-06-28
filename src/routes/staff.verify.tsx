import { useState, type CSSProperties } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { verifyTicketFn } from '../server/verify';

export const Route = createFileRoute('/staff/verify')({
  component: StaffVerify,
});

type Outcome =
  | { kind: 'idle' }
  | { kind: 'unauthorized' }
  | { kind: 'valid'; name: string | null; eventName: string }
  | { kind: 'invalid' };

function StaffVerify() {
  const verify = useServerFn(verifyTicketFn);
  const [staffToken, setStaffToken] = useState('');
  const [code, setCode] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });

  async function run() {
    const res = await verify({ data: { code: code.trim(), staffToken } });
    if (!res.authorized) return setOutcome({ kind: 'unauthorized' });
    if (res.result.valid) {
      setOutcome({ kind: 'valid', name: res.result.holderName, eventName: res.result.eventName });
    } else {
      setOutcome({ kind: 'invalid' });
    }
  }

  return (
    <main style={{ maxWidth: 440, margin: '0 auto', padding: 24 }}>
      <h1>Staff — verify a pass</h1>
      <p style={{ color: '#78716c' }}>
        Stub scanner: paste/enter the pass code. (Camera QR scanning is a later enhancement.)
      </p>
      <input style={input} placeholder="Staff access code" value={staffToken} onChange={(e) => setStaffToken(e.target.value)} />
      <input style={input} placeholder="Pass / ticket code" value={code} onChange={(e) => setCode(e.target.value)} />
      <button style={primary} onClick={run}>Verify</button>

      <div style={{ marginTop: 20 }}>
        {outcome.kind === 'unauthorized' && <Banner color="#b91c1c">Wrong staff access code.</Banner>}
        {outcome.kind === 'invalid' && <Banner color="#b91c1c">❌ INVALID — not a valid pass.</Banner>}
        {outcome.kind === 'valid' && (
          <Banner color="#16a34a">
            ✓ VALID — {outcome.name ?? 'Pass holder'} · {outcome.eventName}
          </Banner>
        )}
      </div>
    </main>
  );
}

function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return <div style={{ background: color, color: '#fff', padding: 16, borderRadius: 8, fontWeight: 700 }}>{children}</div>;
}

const input: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #d6d3d1', borderRadius: 8, fontSize: 16, marginBottom: 10 };
const primary: CSSProperties = { background: '#1c1917', color: '#fff', padding: '12px 16px', border: 0, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' };
