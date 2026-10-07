import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, stringToBytes, keccak256 } from 'viem'
import { CONFIG, PPC_ABI } from '../../lib/config'

const ADDR = CONFIG.ppcAddress as `0x${string}`
const S = {
  wrap: { padding: '24px', maxWidth: '640px' },
  h1: { fontSize: '22px', fontWeight: 700, marginBottom: '4px', color: 'var(--text)' },
  sub: { fontSize: '13px', color: 'var(--text-dim)', marginBottom: '24px' },
  card: { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px' },
  label: { fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-faint)', textTransform: 'uppercase' as const, marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' as const },
  btn: { padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}

interface CsvRow { provider_id: string; payload: string; status: string; }

export default function BulkCall() {
  const { address } = useAccount()
  const [providerId, setProviderId] = useState('1')
  const [payload, setPayload] = useState('ping')
  const [count, setCount] = useState(3)
  const [results, setResults] = useState<{ i: number; hash?: string; error?: string }[]>([])
  const [running, setRunning] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [csvMode, setCsvMode] = useState(false)
  const { writeContractAsync } = useWriteContract()

  function parseCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) || "";
      const lines = text.trim().split("\n").filter(l => l.trim());
      const rows: CsvRow[] = lines.slice(1).map(l => {
        const parts = l.split(",");
        return { provider_id: (parts[0] || "").trim(), payload: (parts[1] || "ping").trim(), status: "pending" };
      }).filter(r => r.provider_id);
      setCsvRows(rows);
      setCsvMode(true);
    };
    reader.readAsText(file);
  }

  async function runCsvBatch() {
    if (!address || running || !csvRows.length) return;
    setRunning(true); setResults([]);
    for (let i = 0; i < csvRows.length; i++) {
      const r = csvRows[i];
      try {
        const requestHash = keccak256(stringToBytes(`${r.payload}-${i}-${Date.now()}`));
        const hash = await writeContractAsync({ address: ADDR, abi: PPC_ABI, functionName: "callService", args: [BigInt(r.provider_id), requestHash] });
        setResults(prev => [...prev, { i: i + 1, hash }]);
      } catch (_err: unknown) { const e = _err as any;
        setResults(prev => [...prev, { i: i + 1, error: e.shortMessage || (e instanceof Error ? e.message : String(e)) }]);
      }
      await new Promise(res => setTimeout(res, 800));
    }
    setRunning(false);
  }

  const estimatedCost = count * 1

  async function runBatch() {
    if (!address || running) return
    setRunning(true)
    setResults([])
    for (let i = 0; i < count; i++) {
      try {
        const requestHash = keccak256(stringToBytes(`${payload}-${i}-${Date.now()}`))
        const hash = await writeContractAsync({
          address: ADDR,
          abi: PPC_ABI,
          functionName: 'callService',
          args: [BigInt(providerId), requestHash],
        })
        setResults(r => [...r, { i: i + 1, hash }])
      } catch (_err: unknown) { const e = _err as any;
        setResults(r => [...r, { i: i + 1, error: e.shortMessage || (e instanceof Error ? e.message : String(e)) }])
      }
      await new Promise(res => setTimeout(res, 1000))
    }
    setRunning(false)
  }

  return (
    <div style={S.wrap}>
      <div style={S.h1}>Bulk Call</div>
      <div style={S.sub}>Send multiple calls to a provider in sequence. Useful for testing and benchmarking.</div>

      <div style={S.card}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}><div style={S.label}>Provider ID</div><input style={S.input} value={providerId} onChange={e => setProviderId(e.target.value)} /></div>
          <div style={{ flex: 1 }}><div style={S.label}>Payload</div><input style={S.input} value={payload} onChange={e => setPayload(e.target.value)} /></div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={S.label}>Number of Calls</div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>{count}</span>
          </div>
          <input type="range" min="1" max="20" value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}><span>1</span><span>20</span></div>
        </div>

        <div style={{ background: 'var(--bg-3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-dim)' }}>Estimated cost</span>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>~{estimatedCost} USDC</span>
        </div>

        <button style={{ ...S.btn, width: '100%', opacity: running || !address ? 0.6 : 1 }} onClick={runBatch} disabled={running || !address}>
          {running ? `Running... (${results.length}/${count})` : `Send ${count} Calls →`}
        </button>
      </div>

      {/* CSV Upload */}
      <div style={S.card}>
        <div style={{ fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 }}>
          Bulk from CSV
        </div>
        <div
          style={{ border: "2px dashed var(--border)", borderRadius: 8, padding: 24, textAlign: "center" as const, cursor: "pointer" }}
          onClick={() => document.getElementById("bulkCsvInput")?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseCsvFile(f); }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Click to select CSV file</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>or drag & drop • columns: provider_id, payload</div>
          <input id="bulkCsvInput" type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) parseCsvFile(f); }} />
        </div>
        {csvRows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>{csvRows.length} calls loaded from CSV</div>
            {csvRows.slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                <span style={{ color: "var(--text-faint)", width: 20 }}>#{i + 1}</span>
                <span>Provider #{r.provider_id}</span>
                <span style={{ color: "var(--text-faint)", flex: 1 }}>{r.payload.slice(0, 30)}</span>
              </div>
            ))}
            {csvRows.length > 5 && <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "4px 0" }}>+{csvRows.length - 5} more</div>}
            <button style={{ ...S.btn, marginTop: 12, width: "100%", opacity: running || !address ? 0.6 : 1 }} onClick={runCsvBatch} disabled={running || !address}>
              {running ? `Running... (${results.length}/${csvRows.length})` : `Run ${csvRows.length} CSV Calls →`}
            </button>
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-faint)" }}>
          CSV format: <code style={{ background: "var(--bg-3)", padding: "1px 4px", borderRadius: 3 }}>provider_id,payload</code><br />
          Example: <code style={{ background: "var(--bg-3)", padding: "1px 4px", borderRadius: 3 }}>1,ping</code>
        </div>
      </div>

      {results.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '12px' }}>Results ({results.length}/{count})</div>
          {results.map(r => (
            <div key={r.i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-faint)', width: '20px' }}>#{r.i}</span>
              {r.hash ? (
                <a href={`https://explorer.testnet.arc.io/tx/${r.hash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px' }}>{r.hash.slice(0, 20)}...</a>
              ) : (
                <span style={{ color: '#ef4444', fontSize: '12px' }}>{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
