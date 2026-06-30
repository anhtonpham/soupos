import { useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { verifyTicketFn } from '../server/verify';

export const Route = createFileRoute('/staff/verify')({
  component: StaffVerify,
});

type Outcome =
  | { kind: 'idle' }
  | { kind: 'unauthorized' }
  | { kind: 'valid'; name: string | null; eventName: string; code: string }
  | { kind: 'invalid' };

/** A scanned QR encodes `<base>/t/<code>`; manual entry is the bare code. */
function extractCode(raw: string): string {
  const v = raw.trim();
  const i = v.indexOf('/t/');
  return i >= 0 ? v.slice(i + 3).split(/[?#/]/)[0] : v;
}

function StaffVerify() {
  const verify = useServerFn(verifyTicketFn);
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Pull the staff token captured at the /staff gate; bounce there if missing.
  useEffect(() => {
    const t = sessionStorage.getItem('sl_staff_token');
    if (!t) void navigate({ to: '/staff' });
    else setToken(t);
  }, [navigate]);

  async function run(raw: string) {
    if (!token) return;
    const c = extractCode(raw);
    if (!c) return;
    const res = await verify({ data: { code: c, staffToken: token } });
    if (!res.authorized) {
      setOutcome({ kind: 'unauthorized' });
      return;
    }
    if (res.result.valid) {
      setOutcome({ kind: 'valid', name: res.result.holderName, eventName: res.result.eventName, code: c });
    } else {
      setOutcome({ kind: 'invalid' });
    }
  }

  // Camera scanning via the browser BarcodeDetector (graceful fallback to manual).
  useEffect(() => {
    if (!camOn) return;
    const Detector = (globalThis as any).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCamError('Camera scanning isn’t supported here — use manual entry below.');
      setCamOn(false);
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Detector({ formats: ['qr_code'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              setCamOn(false);
              void run(codes[0].rawValue);
              return;
            }
          } catch {
            /* keep scanning */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setCamError('Couldn’t open the camera — check permissions or use manual entry.');
        setCamOn(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, token]);

  function reset() {
    setOutcome({ kind: 'idle' });
    setCode('');
  }

  const valid = outcome.kind === 'valid' ? outcome : null;
  const showResult = outcome.kind === 'valid' || outcome.kind === 'invalid';

  return (
    <div className="sl-phone sl-scan">
      <div className="sl-phone-status"><b style={{ color: '#fff' }}>9:41</b><span style={{ fontSize: 11, color: '#9fb595' }}>●●● ▾ ▮</span></div>

      <div className="sl-scan-top">
        <div className="sl-scan-top-head"><b>Verify pass</b><span>STAFF · READ-ONLY</span></div>
        <div className="sl-viewfinder">
          {camOn && <video ref={videoRef} muted playsInline />}
          <div className="sl-vf-frame"><div><b /><b /><b /><b /></div></div>
        </div>
        {!camOn && !showResult && (
          <button className="sl-scan-btn-ghost" style={{ width: '100%', margin: '12px 0' }} onClick={() => { setCamError(null); setCamOn(true); }}>
            Scan with camera
          </button>
        )}
        {camError && <div style={{ color: '#e7c98e', fontSize: 12, margin: '10px 0' }}>{camError}</div>}
      </div>

      {valid && (
        <div className="sl-scan-result valid">
          <div className="sl-scan-mark">✓</div>
          <h2>VALID</h2>
          <div className="sl-scan-info">
            <div className="k">HOLDER</div>
            <div className="name">{valid.name ?? 'Pass holder'}</div>
            <div className="meta"><span>{valid.eventName}</span><span style={{ fontFamily: "'Space Mono',monospace" }}>{valid.code.slice(0, 6)}</span></div>
          </div>
          <div className="sl-scan-note">⚠ Match name to a photo ID before serving</div>
          <div className="sl-scan-actions" style={{ marginTop: 14 }}>
            <button className="sl-scan-btn-light" onClick={reset}>Scan next →</button>
          </div>
        </div>
      )}

      {outcome.kind === 'invalid' && (
        <div className="sl-scan-result invalid">
          <div className="sl-scan-mark">✕</div>
          <h2>INVALID</h2>
          <div className="sl-scan-info">This code isn’t recognized. It may be from another event, already refunded, or mistyped.</div>
          <div className="sl-scan-actions">
            <button className="sl-scan-btn-light" onClick={reset}>Scan again</button>
          </div>
        </div>
      )}

      {outcome.kind === 'unauthorized' && (
        <div className="sl-scan-result invalid">
          <div className="sl-scan-mark">🔒</div>
          <h2>LOCKED</h2>
          <div className="sl-scan-info">Wrong staff code for this device.</div>
          <div className="sl-scan-actions">
            <button className="sl-scan-btn-light" onClick={() => { sessionStorage.removeItem('sl_staff_token'); void navigate({ to: '/staff' }); }}>Re-enter code</button>
          </div>
        </div>
      )}

      {!valid && (
        <div className="sl-manual">
          <div className="k">CAMERA TROUBLE? ENTER CODE</div>
          <div className="sl-manual-row">
            <input
              className="sl-input"
              placeholder="Pass code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(code)}
            />
            <button className="sl-manual-go" onClick={() => run(code)} aria-label="Verify code">→</button>
          </div>
          <div style={{ fontSize: 11, color: '#9aa595', marginTop: 11, textAlign: 'center', fontFamily: "'Space Mono',monospace" }}>
            READ-ONLY · NO REDEMPTION · verifyTicket()
          </div>
        </div>
      )}

      <div className="sl-phone-home" style={{ background: showResult && !valid ? '#fff' : '#0f1d09' }}>
        <i style={{ background: showResult && !valid ? '#d8ddd3' : 'rgba(159,181,118,.5)' }} />
      </div>
    </div>
  );
}
