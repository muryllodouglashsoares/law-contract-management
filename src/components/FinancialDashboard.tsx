import { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { toErrorMessage, useApiQuery } from '../hooks/useApiQuery';
import { dashboardService } from '../services/dashboard';
import type { ReceivablePeriod } from '../types/api';

const PERIODS: { value: ReceivablePeriod; label: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
  { value: 'last_6_months', label: 'Últimos 6 meses' },
  { value: 'year', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

const BRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthLabel = (key: string) => {
  const [year, month] = key.split('-');
  return `${month}/${(year ?? '').slice(2)}`;
};

/**
 * Inadimplência e receita. Todos os números e o CSV vêm do backend (centavos exatos, sempre pelo escritório
 * da sessão); aqui só há exibição, filtro de período e paginação da tabela.
 */
export default function FinancialDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ReceivablePeriod>('this_month');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const customReady = period !== 'custom' || (range.from !== '' && range.to !== '' && range.from <= range.to);
  const { data, loading, error, refetch } = useApiQuery(
    () =>
      customReady
        ? dashboardService.receivables({ period, from: range.from || undefined, to: range.to || undefined, page, pageSize: 10 })
        : Promise.resolve(null),
    [period, range.from, range.to, page, customReady],
  );

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      await dashboardService.exportReceivables({ period, from: range.from || undefined, to: range.to || undefined });
    } catch (err) {
      setExportError(toErrorMessage(err, 'Não foi possível exportar o CSV.'));
    } finally {
      setExporting(false);
    }
  }

  const card = 'bg-white rounded-xl border p-5';
  const border = { borderColor: 'var(--color-border)' };

  return (
    <section aria-labelledby="fin-title" className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 id="fin-title" className="text-base font-bold text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Financeiro: receita e inadimplência</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="fin-period" className="sr-only">Período</label>
          <select id="fin-period" value={period} onChange={(e) => { setPeriod(e.target.value as ReceivablePeriod); setPage(1); }} className="px-3 py-2 text-sm border rounded-lg bg-white" style={border}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {period === 'custom' && (
            <>
              <input type="date" aria-label="Data inicial" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg bg-white" style={border} />
              <input type="date" aria-label="Data final" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="px-3 py-2 text-sm border rounded-lg bg-white" style={border} />
            </>
          )}
          <button onClick={exportCsv} disabled={exporting || !customReady} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border rounded-lg hover:bg-slate-50 disabled:opacity-50" style={border}>
            <Download size={14} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {exportError && <p role="alert" className="mb-3 text-xs text-red-600">{exportError}</p>}
      {!customReady && <p className="text-xs text-slate-400 mb-3">Informe as datas inicial e final do período.</p>}

      {error && !data && (
        <div role="alert" className="flex items-center gap-3 px-4 py-3 text-sm rounded-lg" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
          {toErrorMessage(error, 'Não foi possível carregar o financeiro.')}
          <button onClick={refetch} className="underline font-semibold">Tentar novamente</button>
        </div>
      )}
      {loading && !data && <p className="text-sm text-slate-400">Carregando financeiro...</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
            {[
              { label: 'Parcelas em atraso', value: String(data.delinquency.overdueCount), tone: '#DC2626' },
              { label: 'Valor em atraso', value: BRL(data.delinquency.overdueTotal), tone: '#DC2626' },
              { label: 'Contratos com atraso', value: String(data.delinquency.contractsWithOverdue), tone: '#B45309' },
              { label: 'Maior atraso', value: `${data.delinquency.maxDaysOverdue} dias`, tone: '#B45309' },
              { label: 'Atraso médio', value: `${data.delinquency.averageDaysOverdue.toLocaleString('pt-BR')} dias`, tone: '#B45309' },
            ].map((m) => (
              <div key={m.label} className={card} style={border}>
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className="text-lg font-bold tabular-nums mt-1" style={{ color: m.tone, fontFamily: 'var(--font-display)' }}>{m.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              { label: 'Receita recebida', value: data.revenue.received, tone: '#059669' },
              { label: 'Receita prevista', value: data.revenue.expected, tone: '#2563EB' },
              { label: 'Receita em atraso', value: data.revenue.overdue, tone: '#DC2626' },
            ].map((m) => (
              <div key={m.label} className={card} style={border}>
                <div className="text-xs text-slate-500">{m.label} <span className="text-slate-400">({data.period.from.split('-').reverse().join('/')} a {data.period.to.split('-').reverse().join('/')})</span></div>
                <div className="text-xl font-bold tabular-nums mt-1" style={{ color: m.tone, fontFamily: 'var(--font-display)' }}>{BRL(m.value)}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className={`${card} lg:col-span-2`} style={border}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Receita recebida × prevista</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <Tooltip formatter={(v) => BRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="expected" name="Prevista" fill="#93C5FD" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="received" name="Recebida" fill="#10B981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={card} style={border}>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Pagamentos por status</h3>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.statusDistribution.filter((d) => d.count > 0)} dataKey="count" nameKey="label" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {data.statusDistribution.filter((d) => d.count > 0).map((d) => <Cell key={d.status} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, _n, item) => [`${v} (${BRL((item?.payload as { total?: number })?.total ?? 0)})`, 'Parcelas']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={`${card} mb-5`} style={border}>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Inadimplência por período</h3>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly.map((m) => ({ ...m, label: monthLabel(m.month) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v) => BRL(Number(v))} />
                  <Bar dataKey="overdue" name="Em atraso" fill="#EF4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden" style={border}>
            <div className="flex items-center gap-2 px-5 py-4 border-b" style={border}>
              <AlertTriangle size={15} className="text-red-500" />
              <h3 className="text-sm font-semibold text-slate-900">Parcelas em atraso (maiores atrasos primeiro)</h3>
            </div>
            {data.delinquencyTable.data.length === 0 ? (
              <p className="text-sm text-center py-8 text-slate-400">Nenhuma parcela em atraso. 🎉</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>{['Cliente', 'Contrato', 'Parcela', 'Valor', 'Vencimento', 'Dias em atraso', 'Responsável'].map((h) => <th key={h} className="text-left px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.delinquencyTable.data.map((row) => (
                      <tr key={row.paymentId} className="border-t hover:bg-slate-50" style={border}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{row.clientName}</td>
                        <td className="px-4 py-2.5"><button onClick={() => navigate(`/contratos/${row.contractId}`)} className="text-xs font-mono font-semibold px-2 py-0.5 bg-slate-100 rounded hover:bg-slate-200">#{row.contractNumber}</button></td>
                        <td className="px-4 py-2.5 text-slate-500">{row.installment}</td>
                        <td className="px-4 py-2.5 tabular-nums">{BRL(row.value)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{new Date(row.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold text-red-600">{row.daysOverdue}</td>
                        <td className="px-4 py-2.5 text-slate-600">{row.responsibleName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.delinquencyTable.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t bg-slate-50" style={border}>
                <span className="text-xs text-slate-500">Página {data.delinquencyTable.pagination.page} de {data.delinquencyTable.pagination.totalPages}</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40" style={border}>Anterior</button>
                  <button disabled={page >= data.delinquencyTable.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 text-xs border rounded-lg disabled:opacity-40" style={border}>Próxima</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
