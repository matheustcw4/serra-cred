import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, HandCoins, Receipt, Coins, CheckCircle2, Clock,
  AlertTriangle, Plus, X, Search, Store, Phone, MapPin, Edit2, Trash2,
  ChevronRight, ChevronLeft, Check, RotateCcw, Download, RefreshCw, LogOut, FileDown,
  Wallet, Calculator,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';

/* ---------- Identidade visual (extraída do panfleto Serra Cred) ---------- */
const C = {
  blue: '#1A63FF',
  blueMid: '#2B6FE0',
  blueDeep: '#16357A',
  blueDeeper: '#0E1F4D',
  gold: '#FFC72C',
  goldDeep: '#9C6B0B',
  bg: '#F3F6FC',
  white: '#FFFFFF',
  text: '#12204A',
  textSoft: '#5B6B8C',
  success: '#1E9E5A',
  successBg: '#E5F6ED',
  warnBg: '#FFF6E0',
  danger: '#E14B4B',
  dangerBg: '#FCE8E8',
  border: '#E3E9F5',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  border: `1.5px solid ${C.border}`,
  fontSize: 14,
  color: C.text,
  outline: 'none',
  background: C.bg,
  boxSizing: 'border-box',
};

/* ---------- Regra de juros da Serra Cred ---------- */
// Prazo (em dias úteis, seg-sáb) -> taxa de juros sobre o valor emprestado (empréstimo diário)
const PRAZOS = [
  { dias: 11, taxa: 0.10 },
  { dias: 15, taxa: 0.15 },
  { dias: 24, taxa: 0.20 },
  { dias: 30, taxa: 0.30 },
];
// Prazo em semanas -> taxa de juros (empréstimo semanal, tabela própria e diferente da diária)
const PRAZOS_SEMANAL = [
  { dias: 1, taxa: 0.10 },
  { dias: 2, taxa: 0.15 },
  { dias: 3, taxa: 0.20 },
  { dias: 4, taxa: 0.30 },
];
// Juros composto aplicado sobre o saldo em aberto quando o prazo vence sem quitação
const TAXA_ATRASO = 0.10;

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* ---------------------------- Funções auxiliares ---------------------------- */
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function toNumber(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function formatBRL(v) {
  return toNumber(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function toLocalDateStr(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}
function todayStr() {
  return toLocalDateStr(new Date());
}
function formatDateBR(isoStr) {
  if (!isoStr) return '-';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}
function addOneDay(isoStr) {
  const d = new Date(isoStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}
function addDays(isoStr, n) {
  const d = new Date(isoStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}
function diaDaSemanaLabel(isoStr) {
  const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const d = new Date(isoStr + 'T00:00:00');
  return dias[d.getDay()];
}
function nextNonSunday(isoStr) {
  let d = new Date(isoStr + 'T00:00:00');
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dia = d.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
}
function formatWeekLabel(mondayStr) {
  const monday = new Date(mondayStr + 'T00:00:00');
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)}-${fmt(saturday)}`;
}
function gerarDatasParcelas(dataInicioStr, quantidade) {
  const datas = [];
  let d = new Date(dataInicioStr + 'T00:00:00');
  let guard = 0;
  while (datas.length < quantidade && guard < quantidade * 3 + 10) {
    if (d.getDay() !== 0) datas.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return datas;
}
function gerarDatasParcelasSemanal(dataInicioStr, quantidade) {
  const d = new Date(dataInicioStr + 'T00:00:00');
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // salvaguarda: 1a data nunca cai domingo
  const datas = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 7);
  }
  return datas;
}
function gerarValoresParcelas(valorTotal, quantidade) {
  const total = toNumber(valorTotal);
  const q = Math.max(1, parseInt(quantidade, 10) || 1);
  const base = Math.floor((total / q) * 100) / 100;
  const valores = new Array(q).fill(base);
  const somaBase = Math.round(base * q * 100) / 100;
  const diff = Math.round((total - somaBase) * 100) / 100;
  valores[q - 1] = Math.round((valores[q - 1] + diff) * 100) / 100;
  return valores;
}
function getParcelaStatus(parcela, hoje) {
  if (parcela.dataPagamento) return 'pago';
  if (parcela.dataVencimento < hoje) return 'atrasado';
  return 'pendente';
}
function getEmprestimoStatus(emprestimo, parcelas, hoje) {
  const suas = parcelas.filter((p) => p.emprestimoId === emprestimo.id);
  if (suas.length === 0) return 'em_andamento';
  if (suas.every((p) => p.dataPagamento)) return 'quitado';
  const ultimaData = suas.reduce((max, p) => (p.dataVencimento > max ? p.dataVencimento : max), suas[0].dataVencimento);
  if (hoje > ultimaData) return 'vencido';
  if (suas.some((p) => !p.dataPagamento && p.dataVencimento < hoje)) return 'atrasado';
  return 'em_andamento';
}
function saldoDevedor(emprestimoId, parcelas) {
  return parcelas.filter((p) => p.emprestimoId === emprestimoId && !p.dataPagamento).reduce((s, p) => s + toNumber(p.valor), 0);
}
const STORAGE_PREFIX = 'serracred:';
async function loadKey(key) {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function saveKey(key, value) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------- Conversores Supabase (snake_case <-> camelCase) ------------------- */
function clienteFromDb(row) {
  return {
    id: row.id, nome: row.nome, telefone: row.telefone, documento: row.documento,
    comercio: row.comercio, endereco: row.endereco, cidade: row.cidade, uf: row.uf,
    rota: row.rota, observacoes: row.observacoes, criadoEm: row.criado_em,
  };
}
function clienteToDb(o) {
  return {
    id: o.id, nome: o.nome, telefone: o.telefone, documento: o.documento,
    comercio: o.comercio, endereco: o.endereco, cidade: o.cidade, uf: o.uf,
    rota: o.rota, observacoes: o.observacoes, criado_em: o.criadoEm,
  };
}
function emprestimoFromDb(row) {
  return {
    id: row.id, clienteId: row.cliente_id,
    valorEmprestado: toNumber(row.valor_emprestado), valorTotal: toNumber(row.valor_total),
    numParcelas: row.num_parcelas, prazoDias: row.prazo_dias,
    taxa: row.taxa != null ? toNumber(row.taxa) : null,
    modalidade: row.modalidade || 'diario',
    dataEmprestimo: row.data_emprestimo, dataPrimeiraParcela: row.data_primeira_parcela,
    observacoes: row.observacoes, renovacoes: row.renovacoes || [], criadoEm: row.criado_em,
  };
}
function emprestimoToDb(o) {
  return {
    id: o.id, cliente_id: o.clienteId,
    valor_emprestado: o.valorEmprestado, valor_total: o.valorTotal,
    num_parcelas: o.numParcelas, prazo_dias: o.prazoDias, taxa: o.taxa,
    modalidade: o.modalidade || 'diario',
    data_emprestimo: o.dataEmprestimo, data_primeira_parcela: o.dataPrimeiraParcela,
    observacoes: o.observacoes, renovacoes: o.renovacoes || [], criado_em: o.criadoEm,
  };
}
function parcelaFromDb(row) {
  return {
    id: row.id, emprestimoId: row.emprestimo_id, numero: row.numero,
    dataVencimento: row.data_vencimento, valor: toNumber(row.valor), dataPagamento: row.data_pagamento,
  };
}
function parcelaToDb(o) {
  return {
    id: o.id, emprestimo_id: o.emprestimoId, numero: o.numero,
    data_vencimento: o.dataVencimento, valor: o.valor, data_pagamento: o.dataPagamento,
  };
}
function despesaFromDb(row) {
  return { id: row.id, descricao: row.descricao, valor: toNumber(row.valor), data: row.data, pago: !!row.pago, criadoEm: row.criado_em };
}
function despesaToDb(o) {
  return { id: o.id, descricao: o.descricao, valor: o.valor, data: o.data, pago: !!o.pago, criado_em: o.criadoEm };
}

/* ------------------------------- Exportação em PDF ------------------------------- */
function gerarPdfCliente(cliente, emprestimosDoCliente, parcelasDoCliente) {
  const hoje = todayStr();
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(26, 99, 255);
  doc.text('Serra Cred', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Extrato de parcelas - gerado em ${formatDateBR(hoje)}`, 14, 25);

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  let y = 36;
  doc.text(`Cliente: ${cliente.nome}`, 14, y);
  if (cliente.telefone) { y += 6; doc.text(`Telefone: ${cliente.telefone}`, 14, y); }
  if (cliente.comercio) { y += 6; doc.text(`Comercio: ${cliente.comercio}`, 14, y); }
  if (cliente.cidade || cliente.uf) { y += 6; doc.text(`Cidade/UF: ${[cliente.cidade, cliente.uf].filter(Boolean).join('/')}`, 14, y); }

  const linhas = parcelasDoCliente.map((p) => {
    const status = getParcelaStatus(p, hoje);
    const label = status === 'pago' ? 'Pago' : status === 'atrasado' ? 'Atrasado' : 'Pendente';
    return [String(p.numero), formatDateBR(p.dataVencimento), formatBRL(p.valor), label, p.dataPagamento ? formatDateBR(p.dataPagamento) : '-'];
  });

  autoTable(doc, {
    startY: y + 8,
    head: [['Parcela', 'Vencimento', 'Valor', 'Status', 'Pago em']],
    body: linhas,
    headStyles: { fillColor: [26, 99, 255] },
    styles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [243, 246, 252] },
  });

  const totalPago = parcelasDoCliente.filter((p) => p.dataPagamento).reduce((s, p) => s + toNumber(p.valor), 0);
  const totalAberto = parcelasDoCliente.filter((p) => !p.dataPagamento).reduce((s, p) => s + toNumber(p.valor), 0);
  const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y + 8) + 10;
  doc.setFontSize(11);
  doc.setTextColor(30, 158, 90);
  doc.text(`Total pago: ${formatBRL(totalPago)}`, 14, finalY);
  doc.setTextColor(225, 75, 75);
  doc.text(`Total em aberto: ${formatBRL(totalAberto)}`, 14, finalY + 7);

  const nomeArquivo = `parcelas-${cliente.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;
  doc.save(nomeArquivo);
}

/* ------------------------------ Componentes base ------------------------------ */
function StatusBadge({ status }) {
  const map = {
    pago: { label: 'Pago', bg: C.successBg, fg: C.success },
    pendente: { label: 'Pendente', bg: C.warnBg, fg: C.goldDeep },
    atrasado: { label: 'Atrasado', bg: C.dangerBg, fg: C.danger },
    vencido: { label: 'Vencido', bg: C.dangerBg, fg: C.danger },
    quitado: { label: 'Quitado', bg: C.successBg, fg: C.success },
    em_andamento: { label: 'Em andamento', bg: C.warnBg, fg: C.goldDeep },
  };
  const s = map[status] || map.pendente;
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: C.textSoft }}>{label}</span>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: color + '1A' }}
        >
          <Icon size={16} color={color} />
        </div>
      </div>
      <span className="sc-font-display text-xl" style={{ color: C.text, fontWeight: 900 }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: C.textSoft }}>{sub}</span>}
    </div>
  );
}

function CoinProgress({ pagas, total }) {
  const cap = 15;
  const dotsTotal = Math.min(total, cap);
  const filled = total > 0 ? Math.round((pagas / total) * dotsTotal) : 0;
  const dots = Array.from({ length: dotsTotal }, (_, i) => i < filled);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-1 flex-wrap">
        {dots.map((on, i) => (
          <span
            key={i}
            className="rounded-full inline-block"
            style={{ width: 8, height: 8, background: on ? C.gold : C.border }}
          />
        ))}
      </div>
      <span className="text-xs font-semibold" style={{ color: C.textSoft }}>{pagas}/{total} parcelas</span>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'rgba(10,20,50,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl p-5 overflow-y-auto"
        style={{ background: C.white, maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg" style={{ color: C.text, fontWeight: 800 }}>{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: C.bg }}
          >
            <X size={16} color={C.textSoft} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm mb-5" style={{ color: C.textSoft }}>{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl font-semibold"
          style={{ background: C.bg, color: C.text }}
        >
          Cancelar
        </button>
        <button
          onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
          disabled={busy}
          className="flex-1 py-3 rounded-xl font-bold"
          style={{ background: C.danger, color: '#fff' }}
        >
          {busy ? 'Removendo...' : 'Remover'}
        </button>
      </div>
    </Modal>
  );
}

function Field({ label, children, required }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold block mb-1" style={{ color: C.textSoft }}>
        {label}{required && <span style={{ color: C.danger }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: C.white }}>
        <Icon size={26} color={C.textSoft} />
      </div>
      <p className="font-semibold mb-1" style={{ color: C.text }}>{title}</p>
      <p className="text-sm" style={{ color: C.textSoft }}>{subtitle}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 animate-spin" style={{ borderColor: C.border, borderTopColor: C.blue }} />
      <p className="text-xs mt-3" style={{ color: C.textSoft }}>Carregando...</p>
    </div>
  );
}

function Toast({ text }) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2"
      style={{ bottom: 92, background: C.blueDeeper, color: '#fff', boxShadow: '0 6px 20px rgba(0,0,0,0.25)' }}
    >
      <CheckCircle2 size={15} color={C.gold} />
      {text}
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const items = [
    { key: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    { key: 'clientes', label: 'Clientes', icon: Users },
    { key: 'emprestimos', label: 'Empréstimos', icon: HandCoins },
    { key: 'financeiro', label: 'Financeiro', icon: Receipt },
    { key: 'fechamento', label: 'Fechamento', icon: Calculator },
  ];
  return (
    <div
      className="flex border-t"
      style={{ background: C.white, borderColor: C.border, paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
    >
      {items.map(({ key, label, icon: Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5"
          >
            <Icon size={20} color={active ? C.blue : C.textSoft} strokeWidth={active ? 2.4 : 2} />
            <span className="text-xs" style={{ color: active ? C.blue : C.textSoft, fontWeight: active ? 700 : 500 }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------- Painel --------------------------------- */
function agruparPor(campo, clientes, emprestimos, parcelas) {
  const grupos = {};
  function garantir(chaveBruta) {
    const chave = (chaveBruta || '').trim() || 'Não informado';
    if (!grupos[chave]) grupos[chave] = { chave, clientesCount: 0, totalEmprestado: 0, totalAReceber: 0 };
    return grupos[chave];
  }
  clientes.forEach((c) => { garantir(c[campo]).clientesCount += 1; });
  emprestimos.forEach((e) => {
    const cliente = clientes.find((c) => c.id === e.clienteId);
    const g = garantir(cliente ? cliente[campo] : '');
    g.totalEmprestado += toNumber(e.valorEmprestado);
    g.totalAReceber += parcelas
      .filter((p) => p.emprestimoId === e.id && !p.dataPagamento)
      .reduce((s, p) => s + toNumber(p.valor), 0);
  });
  return Object.values(grupos).sort((a, b) => b.totalAReceber - a.totalAReceber);
}

function RelatorioPorGrupo({ clientes, emprestimos, parcelas }) {
  const [campo, setCampo] = useState('cidade');
  const opcoes = [
    { key: 'cidade', label: 'Cidade' },
    { key: 'uf', label: 'UF' },
    { key: 'rota', label: 'Rota' },
  ];
  const grupos = agruparPor(campo, clientes, emprestimos, parcelas);
  const labelAtual = opcoes.find((o) => o.key === campo).label;

  return (
    <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-sm font-bold" style={{ color: C.text }}>Relação por região</p>
        <div className="flex gap-1 flex-shrink-0">
          {opcoes.map((o) => (
            <button
              key={o.key}
              onClick={() => setCampo(o.key)}
              className="px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: campo === o.key ? C.blue : C.bg, color: campo === o.key ? '#fff' : C.textSoft }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {grupos.length === 0 ? (
        <p className="text-xs" style={{ color: C.textSoft }}>Preencha {labelAtual.toLowerCase()} nos clientes pra ver a relação aqui.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((g) => (
            <div key={g.chave} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: C.text }}>{g.chave}</p>
                <p className="text-xs" style={{ color: C.textSoft }}>{g.clientesCount} cliente(s) · emprestado {formatBRL(g.totalEmprestado)}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: C.text }}>{formatBRL(g.totalAReceber)}</p>
                <p className="text-xs" style={{ color: C.textSoft }}>a receber</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BackupSection({ clientes, emprestimos, parcelas, onRequestReset }) {
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [editandoUrl, setEditandoUrl] = useState(false);
  const [urlTemp, setUrlTemp] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimoSync, setUltimoSync] = useState('');

  useEffect(() => {
    (async () => {
      const url = await loadKey('config_sheets_url');
      if (typeof url === 'string') { setSheetsUrl(url); setUrlTemp(url); }
      const sync = await loadKey('config_ultimo_sync');
      if (typeof sync === 'string') setUltimoSync(sync);
    })();
  }, []);

  async function salvarUrl() {
    const limpa = urlTemp.trim();
    setSheetsUrl(limpa);
    await saveKey('config_sheets_url', limpa);
    setEditandoUrl(false);
  }

  async function sincronizar() {
    if (!sheetsUrl) { setEditandoUrl(true); return; }
    setEnviando(true);
    try {
      await fetch(sheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ clientes, emprestimos, parcelas, enviadoEm: new Date().toISOString() }),
      });
      const agora = new Date().toLocaleString('pt-BR');
      setUltimoSync(agora);
      await saveKey('config_ultimo_sync', agora);
    } catch (e) {
      // com modo no-cors não dá pra ler a resposta; falha aqui normalmente é problema de rede/URL errada
    }
    setEnviando(false);
  }

  function baixarJson() {
    const dados = { clientes, emprestimos, parcelas, exportadoEm: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serra-cred-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
      <p className="text-sm font-bold" style={{ color: C.text }}>Backup dos dados</p>

      <button
        onClick={baixarJson}
        className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
        style={{ background: C.bg, color: C.text }}
      >
        <Download size={15} /> Baixar backup (arquivo)
      </button>

      {editandoUrl ? (
        <div className="flex flex-col gap-2">
          <input
            style={inputStyle}
            value={urlTemp}
            onChange={(e) => setUrlTemp(e.target.value)}
            placeholder="Cole aqui a URL do Apps Script (termina em /exec)"
          />
          <div className="flex gap-2">
            <button onClick={() => { setUrlTemp(sheetsUrl); setEditandoUrl(false); }} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.bg, color: C.textSoft }}>
              Cancelar
            </button>
            <button onClick={salvarUrl} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: C.blue, color: '#fff' }}>
              Salvar link
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={sincronizar}
            disabled={enviando}
            className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: C.success, color: '#fff' }}
          >
            <RefreshCw size={15} /> {enviando ? 'Enviando...' : 'Sincronizar com Google Sheets'}
          </button>
          <button onClick={() => setEditandoUrl(true)} className="text-xs underline self-center" style={{ color: C.textSoft }}>
            {sheetsUrl ? 'Trocar planilha conectada' : 'Conectar uma planilha do Google'}
          </button>
          {ultimoSync && (
            <p className="text-xs text-center" style={{ color: C.textSoft }}>Último envio: {ultimoSync}</p>
          )}
        </>
      )}

      <button onClick={onRequestReset} className="text-xs underline self-center mt-1" style={{ color: C.textSoft }}>
        Apagar todos os dados
      </button>
    </div>
  );
}

function DashboardTab({ clientes, emprestimos, parcelas, onRequestReset }) {
  const [mostrarVencimentos, setMostrarVencimentos] = useState(false);
  const [modoRecebido, setModoRecebido] = useState('dia');
  const [modoAReceber, setModoAReceber] = useState('dia');
  const hoje = todayStr();
  const totalEmprestado = emprestimos.reduce((s, e) => s + toNumber(e.valorEmprestado), 0);
  const parcelasPagas = parcelas.filter((p) => p.dataPagamento);
  const parcelasAbertas = parcelas.filter((p) => !p.dataPagamento);
  const totalRecebido = parcelasPagas.reduce((s, p) => s + toNumber(p.valor), 0);
  const totalAReceber = parcelasAbertas.reduce((s, p) => s + toNumber(p.valor), 0);
  const atrasadas = parcelasAbertas.filter((p) => p.dataVencimento < hoje);
  const clientesAtivos = new Set(
    emprestimos.filter((e) => parcelas.some((p) => p.emprestimoId === e.id && !p.dataPagamento)).map((e) => e.clienteId)
  ).size;

  function nomeCliente(emprestimoId) {
    const emp = emprestimos.find((e) => e.id === emprestimoId);
    if (!emp) return '-';
    const cli = clientes.find((c) => c.id === emp.clienteId);
    return cli ? cli.nome : '-';
  }

  if (clientes.length === 0 && emprestimos.length === 0) {
    return (
      <EmptyState
        icon={Coins}
        title="Bem-vindo à Serra Cred"
        subtitle="Cadastre seu primeiro cliente para começar a controlar os empréstimos."
      />
    );
  }

  const pieData = [
    { name: 'Pago', value: parcelasPagas.length, color: C.success },
    { name: 'Pendente', value: parcelasAbertas.filter((p) => p.dataVencimento >= hoje).length, color: C.goldDeep },
    { name: 'Atrasado', value: atrasadas.length, color: C.danger },
  ].filter((d) => d.value > 0);

  const dias = [...Array(10)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (9 - i));
    return toLocalDateStr(d);
  });
  const barDataRecebidoDia = dias.map((dia) => ({
    dia: dia.slice(8, 10) + '/' + dia.slice(5, 7),
    valor: parcelas.filter((p) => p.dataPagamento === dia).reduce((s, p) => s + toNumber(p.valor), 0),
  }));

  const atrasadoTotal = atrasadas.reduce((s, p) => s + toNumber(p.valor), 0);
  const diasFuturos = [...Array(10)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });
  const barDataAReceberDia = [
    { dia: 'Atrasado', valor: atrasadoTotal, atrasado: true },
    ...diasFuturos.map((dia) => ({
      dia: dia.slice(8, 10) + '/' + dia.slice(5, 7),
      valor: parcelasAbertas.filter((p) => p.dataVencimento === dia).reduce((s, p) => s + toNumber(p.valor), 0),
      atrasado: false,
    })),
  ];

  const mondayAtual = getWeekStart(hoje);
  const semanasPassadas = [...Array(8)].map((_, i) => {
    const d = new Date(mondayAtual + 'T00:00:00');
    d.setDate(d.getDate() - (7 - i) * 7);
    return toLocalDateStr(d);
  });
  const barDataRecebidoSemana = semanasPassadas.map((mondayStr) => {
    const s = new Date(mondayStr + 'T00:00:00');
    s.setDate(s.getDate() + 6);
    const saturdayStr = toLocalDateStr(s);
    const valor = parcelas
      .filter((p) => p.dataPagamento && p.dataPagamento >= mondayStr && p.dataPagamento <= saturdayStr)
      .reduce((s2, p) => s2 + toNumber(p.valor), 0);
    return { dia: formatWeekLabel(mondayStr), valor };
  });

  const semanasFuturas = [...Array(8)].map((_, i) => {
    const d = new Date(mondayAtual + 'T00:00:00');
    d.setDate(d.getDate() + i * 7);
    return toLocalDateStr(d);
  });
  const barDataAReceberSemana = [
    { dia: 'Atrasado', valor: atrasadoTotal, atrasado: true },
    ...semanasFuturas.map((mondayStr, idx) => {
      const s = new Date(mondayStr + 'T00:00:00');
      s.setDate(s.getDate() + 6);
      const saturdayStr = toLocalDateStr(s);
      const inicio = idx === 0 ? hoje : mondayStr;
      const valor = parcelasAbertas
        .filter((p) => p.dataVencimento >= inicio && p.dataVencimento <= saturdayStr)
        .reduce((s2, p) => s2 + toNumber(p.valor), 0);
      return { dia: formatWeekLabel(mondayStr), valor, atrasado: false };
    }),
  ];

  const barDataRecebido = modoRecebido === 'dia' ? barDataRecebidoDia : barDataRecebidoSemana;
  const barDataAReceber = modoAReceber === 'dia' ? barDataAReceberDia : barDataAReceberSemana;

  const proximosVencimentos = parcelasAbertas
    .slice()
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Emprestado" value={formatBRL(totalEmprestado)} icon={HandCoins} color={C.blue} />
        <KpiCard label="Recebido" value={formatBRL(totalRecebido)} icon={CheckCircle2} color={C.success} />
        <KpiCard label="A receber" value={formatBRL(totalAReceber)} icon={Clock} color={C.goldDeep} />
        <KpiCard
          label="Atrasadas"
          value={String(atrasadas.length)}
          icon={AlertTriangle}
          color={C.danger}
          sub={`${clientesAtivos} cliente(s) ativo(s)`}
        />
      </div>

      {pieData.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
          <p className="text-sm font-bold mb-2" style={{ color: C.text }}>Situação das parcelas</p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-sm font-bold" style={{ color: C.text }}>
            {modoRecebido === 'dia' ? 'Recebido nos últimos 10 dias' : 'Recebido nas últimas 8 semanas'}
          </p>
          <div className="flex gap-1 flex-shrink-0">
            {[['dia', 'Dia'], ['semana', 'Semana']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setModoRecebido(m)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: modoRecebido === m ? C.blue : C.bg, color: modoRecebido === m ? '#fff' : C.textSoft }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barDataRecebido}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} width={30} />
              <Tooltip formatter={(v) => formatBRL(v)} />
              <Bar dataKey="valor" fill={C.blue} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
        <div className="flex items-center justify-between mb-2 gap-2">
          <p className="text-sm font-bold" style={{ color: C.text }}>
            {modoAReceber === 'dia' ? 'A receber (atrasado + próximos 10 dias)' : 'A receber (atrasado + próximas 8 semanas)'}
          </p>
          <div className="flex gap-1 flex-shrink-0">
            {[['dia', 'Dia'], ['semana', 'Semana']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setModoAReceber(m)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: modoAReceber === m ? C.blue : C.bg, color: modoAReceber === m ? '#fff' : C.textSoft }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barDataAReceber}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.textSoft }} axisLine={false} tickLine={false} width={30} />
              <Tooltip formatter={(v) => formatBRL(v)} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {barDataAReceber.map((entry, i) => <Cell key={i} fill={entry.atrasado ? C.danger : C.goldDeep} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <RelatorioPorGrupo clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} />

      {proximosVencimentos.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
          <button
            onClick={() => setMostrarVencimentos(!mostrarVencimentos)}
            className="w-full flex items-center justify-between"
          >
            <p className="text-sm font-bold" style={{ color: C.text }}>Próximos vencimentos ({proximosVencimentos.length})</p>
            <ChevronRight
              size={16}
              color={C.textSoft}
              style={{ transform: mostrarVencimentos ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
            />
          </button>
          {mostrarVencimentos && (
            <div className="flex flex-col gap-2.5 mt-3">
              {proximosVencimentos.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.text }}>{nomeCliente(p.emprestimoId)}</p>
                    <p className="text-xs" style={{ color: C.textSoft }}>Parcela {p.numero} · {formatDateBR(p.dataVencimento)}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: C.text }}>{formatBRL(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <BackupSection clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} onRequestReset={onRequestReset} />
    </div>
  );
}

/* -------------------------------- Clientes -------------------------------- */
function ClienteFormModal({ cliente, onClose, onSave }) {
  const [nome, setNome] = useState(cliente?.nome || '');
  const [telefone, setTelefone] = useState(cliente?.telefone || '');
  const [documento, setDocumento] = useState(cliente?.documento || '');
  const [comercio, setComercio] = useState(cliente?.comercio || '');
  const [endereco, setEndereco] = useState(cliente?.endereco || '');
  const [cidade, setCidade] = useState(cliente?.cidade || '');
  const [uf, setUf] = useState(cliente?.uf || '');
  const [rota, setRota] = useState(cliente?.rota || '');
  const [observacoes, setObservacoes] = useState(cliente?.observacoes || '');
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!nome.trim()) { setErro('Informe o nome do cliente.'); return; }
    setErro('');
    setSaving(true);
    await onSave({ nome: nome.trim(), telefone, documento, comercio, endereco, cidade, uf, rota, observacoes });
    setSaving(false);
  }

  return (
    <Modal title={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <Field label="Nome completo" required>
        <input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: João da Silva" />
      </Field>
      <Field label="Nome do comércio">
        <input style={inputStyle} value={comercio} onChange={(e) => setComercio(e.target.value)} placeholder="Ex: Mercadinho do João" />
      </Field>
      <Field label="Telefone / WhatsApp">
        <input style={inputStyle} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(65) 9 9999-9999" />
      </Field>
      <Field label="CPF ou CNPJ">
        <input style={inputStyle} value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="000.000.000-00" />
      </Field>
      <Field label="Endereço">
        <input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Cidade">
            <input style={inputStyle} value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Ex: Cuiabá" />
          </Field>
        </div>
        <Field label="UF">
          <select style={inputStyle} value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">-</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Rota">
        <input style={inputStyle} value={rota} onChange={(e) => setRota(e.target.value)} placeholder="Ex: Rota 1 - Centro" />
      </Field>
      <Field label="Observações">
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'none' }}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Referências, horário de atendimento..."
        />
      </Field>
      {erro && <p className="text-xs mb-2" style={{ color: C.danger }}>{erro}</p>}
      <button
        onClick={salvar}
        disabled={saving}
        className="w-full py-3 rounded-xl font-bold mt-1"
        style={{ background: C.gold, color: C.blueDeeper }}
      >
        {saving ? 'Salvando...' : 'Salvar cliente'}
      </button>
    </Modal>
  );
}

function ClienteDetalheModal({ cliente, emprestimos, parcelas, onClose }) {
  const hoje = todayStr();
  const emprestimosDoCliente = emprestimos.filter((e) => e.clienteId === cliente.id);
  const idsEmp = emprestimosDoCliente.map((e) => e.id);
  const parcelasDoCliente = parcelas
    .filter((p) => idsEmp.includes(p.emprestimoId))
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  const totalPago = parcelasDoCliente.filter((p) => p.dataPagamento).reduce((s, p) => s + toNumber(p.valor), 0);
  const totalAberto = parcelasDoCliente.filter((p) => !p.dataPagamento).reduce((s, p) => s + toNumber(p.valor), 0);

  return (
    <Modal title={cliente.nome} onClose={onClose}>
      <div className="flex flex-col gap-1 mb-4">
        {cliente.telefone && (
          <p className="text-xs flex items-center gap-1" style={{ color: C.textSoft }}><Phone size={12} /> {cliente.telefone}</p>
        )}
        {cliente.comercio && (
          <p className="text-xs flex items-center gap-1" style={{ color: C.textSoft }}><Store size={12} /> {cliente.comercio}</p>
        )}
        {(cliente.cidade || cliente.uf || cliente.rota) && (
          <p className="text-xs" style={{ color: C.textSoft }}>
            {[cliente.cidade, cliente.uf].filter(Boolean).join('/')}{cliente.rota ? ` · ${cliente.rota}` : ''}
          </p>
        )}
      </div>

      <button
        onClick={() => gerarPdfCliente(cliente, emprestimosDoCliente, parcelasDoCliente)}
        disabled={parcelasDoCliente.length === 0}
        className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 mb-4"
        style={{ background: parcelasDoCliente.length === 0 ? C.border : C.blue, color: '#fff' }}
      >
        <FileDown size={16} /> Exportar parcelas em PDF
      </button>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl p-3" style={{ background: C.bg }}>
          <p className="text-xs" style={{ color: C.textSoft }}>Pago</p>
          <p className="text-sm font-bold" style={{ color: C.success }}>{formatBRL(totalPago)}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: C.bg }}>
          <p className="text-xs" style={{ color: C.textSoft }}>Em aberto</p>
          <p className="text-sm font-bold" style={{ color: C.danger }}>{formatBRL(totalAberto)}</p>
        </div>
      </div>

      {parcelasDoCliente.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: C.textSoft }}>Nenhum empréstimo cadastrado ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {parcelasDoCliente.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs py-1.5" style={{ borderBottom: `1px solid ${C.border}` }}>
              <span style={{ color: C.textSoft }}>Parc. {p.numero} · {formatDateBR(p.dataVencimento)}</span>
              <span className="font-semibold" style={{ color: C.text }}>{formatBRL(p.valor)}</span>
              <StatusBadge status={getParcelaStatus(p, hoje)} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ClientesTab({ clientes, emprestimos, parcelas, onAdd, onUpdate, onDelete }) {
  const [busca, setBusca] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [verDetalhe, setVerDetalhe] = useState(null);

  const filtrados = clientes.filter(
    (c) => c.nome.toLowerCase().includes(busca.toLowerCase()) || (c.telefone || '').includes(busca)
  );

  function emprestimosDoCliente(clienteId) {
    return emprestimos.filter((e) => e.clienteId === clienteId).length;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl px-3" style={{ background: C.white, border: `1.5px solid ${C.border}` }}>
          <Search size={16} color={C.textSoft} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente..."
            className="flex-1 py-2.5 text-sm"
            style={{ outline: 'none', background: 'transparent', color: C.text, border: 'none', width: '100%' }}
          />
        </div>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: C.blue }}
        >
          <Plus size={20} color="#fff" />
        </button>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={Users}
          title={clientes.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum resultado'}
          subtitle={clientes.length === 0 ? 'Toque no + para cadastrar o primeiro cliente.' : 'Tente buscar por outro nome ou telefone.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtrados.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl p-4"
              style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)', cursor: 'pointer' }}
              onClick={() => setVerDetalhe(c)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ color: C.text }}>{c.nome}</p>
                  {c.comercio && (
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.textSoft }}>
                      <Store size={12} /> {c.comercio}
                    </p>
                  )}
                  {c.telefone && (
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.textSoft }}>
                      <Phone size={12} /> {c.telefone}
                    </p>
                  )}
                  {c.endereco && (
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.textSoft }}>
                      <MapPin size={12} /> {c.endereco}
                    </p>
                  )}
                  {(c.cidade || c.uf || c.rota) && (
                    <p className="text-xs mt-0.5" style={{ color: C.textSoft }}>
                      {[c.cidade, c.uf].filter(Boolean).join('/')}{c.rota ? ` · ${c.rota}` : ''}
                    </p>
                  )}
                  <p className="text-xs mt-2 font-semibold" style={{ color: C.blue }}>
                    {emprestimosDoCliente(c.id)} empréstimo(s)
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setEditando(c); setShowForm(true); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: C.bg }}
                  >
                    <Edit2 size={14} color={C.textSoft} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(c)}
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: C.bg }}
                  >
                    <Trash2 size={14} color={C.danger} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ClienteFormModal
          cliente={editando}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            if (editando) await onUpdate(editando.id, data);
            else await onAdd(data);
            setShowForm(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remover cliente?"
          message={`Isso também vai remover ${emprestimosDoCliente(confirmDelete.id)} empréstimo(s) e todas as parcelas vinculadas a ${confirmDelete.nome}.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}

      {verDetalhe && (
        <ClienteDetalheModal
          cliente={verDetalhe}
          emprestimos={emprestimos}
          parcelas={parcelas}
          onClose={() => setVerDetalhe(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------- Empréstimos ------------------------------- */
function SeletorCliente({ clientes, clienteId, onChange }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const clienteSelecionado = clientes.find((c) => c.id === clienteId);

  const filtrados = busca.trim()
    ? clientes.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : clientes;

  function selecionar(cliente) {
    onChange(cliente.id);
    setBusca('');
    setAberto(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex items-center gap-2 rounded-xl px-3" style={{ border: `1.5px solid ${C.border}`, background: C.bg }}>
        <Search size={15} color={C.textSoft} style={{ flexShrink: 0 }} />
        <input
          value={aberto ? busca : (clienteSelecionado ? clienteSelecionado.nome : '')}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => { setBusca(''); setAberto(true); }}
          placeholder="Digite pra buscar o cliente..."
          className="flex-1 py-2.5 text-sm"
          style={{ outline: 'none', background: 'transparent', color: C.text, border: 'none', width: '100%' }}
        />
      </div>

      {aberto && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 30 }} onClick={() => setAberto(false)} />
          <div
            className="absolute left-0 right-0 mt-1 rounded-xl overflow-y-auto"
            style={{ background: C.white, border: `1.5px solid ${C.border}`, maxHeight: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 31 }}
          >
            {filtrados.length === 0 ? (
              <p className="text-xs p-3" style={{ color: C.textSoft }}>Nenhum cliente encontrado.</p>
            ) : (
              filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionar(c)}
                  className="w-full text-left px-3 py-2.5"
                  style={{ background: c.id === clienteId ? C.bg : 'transparent', borderBottom: `1px solid ${C.border}` }}
                >
                  <p className="text-sm font-semibold" style={{ color: C.text }}>{c.nome}</p>
                  {(c.telefone || c.comercio) && (
                    <p className="text-xs" style={{ color: C.textSoft }}>{[c.comercio, c.telefone].filter(Boolean).join(' · ')}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmprestimoFormModal({ clientes, onClose, onSave }) {
  const [clienteId, setClienteId] = useState(clientes[0]?.id || '');
  const [modalidade, setModalidade] = useState('diario');
  const [valorEmprestado, setValorEmprestado] = useState('');
  const [prazoDias, setPrazoDias] = useState(11);
  const [valorTotal, setValorTotal] = useState('');
  const [totalManual, setTotalManual] = useState(false);
  const [dataEmprestimo, setDataEmprestimo] = useState(todayStr());
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(nextNonSunday(addOneDay(todayStr())));
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);

  const tabelaPrazos = modalidade === 'semanal' ? PRAZOS_SEMANAL : PRAZOS;
  const prazoInfo = tabelaPrazos.find((p) => p.dias === prazoDias) || tabelaPrazos[0];
  const numParcelas = prazoInfo.dias;
  const unidadePlural = modalidade === 'semanal' ? 'semanas' : 'dias úteis';

  useEffect(() => {
    setPrazoDias(tabelaPrazos[0].dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalidade]);

  useEffect(() => {
    setDataPrimeiraParcela(modalidade === 'semanal' ? addDays(dataEmprestimo, 7) : nextNonSunday(addOneDay(dataEmprestimo)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalidade, dataEmprestimo]);

  useEffect(() => {
    if (!totalManual) {
      const calc = toNumber(valorEmprestado) * (1 + prazoInfo.taxa);
      setValorTotal(calc > 0 ? calc.toFixed(2) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorEmprestado, prazoDias]);

  const previewValores = valorTotal ? gerarValoresParcelas(valorTotal, numParcelas) : [];

  async function salvar() {
    if (!clienteId) { setErro('Selecione um cliente.'); return; }
    if (toNumber(valorEmprestado) <= 0) { setErro('Informe o valor emprestado.'); return; }
    if (toNumber(valorTotal) <= 0) { setErro('Informe o valor total a receber.'); return; }
    setErro('');
    setSaving(true);
    await onSave({
      clienteId, valorEmprestado, valorTotal,
      numParcelas: String(numParcelas), prazoDias: numParcelas, taxa: prazoInfo.taxa, modalidade,
      dataEmprestimo, dataPrimeiraParcela, observacoes,
    });
    setSaving(false);
  }

  return (
    <Modal title="Novo empréstimo" onClose={onClose}>
      <Field label="Cliente" required>
        <SeletorCliente clientes={clientes} clienteId={clienteId} onChange={setClienteId} />
      </Field>
      <Field label="Tipo de cobrança" required>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModalidade('diario')}
            className="py-2.5 rounded-xl text-sm font-bold"
            style={{
              background: modalidade === 'diario' ? C.blue : C.bg,
              color: modalidade === 'diario' ? '#fff' : C.text,
              border: `1.5px solid ${modalidade === 'diario' ? C.blue : C.border}`,
            }}
          >
            Diário
          </button>
          <button
            type="button"
            onClick={() => setModalidade('semanal')}
            className="py-2.5 rounded-xl text-sm font-bold"
            style={{
              background: modalidade === 'semanal' ? C.blue : C.bg,
              color: modalidade === 'semanal' ? '#fff' : C.text,
              border: `1.5px solid ${modalidade === 'semanal' ? C.blue : C.border}`,
            }}
          >
            Semanal
          </button>
        </div>
      </Field>
      <Field label="Prazo" required>
        <div className="grid grid-cols-4 gap-2">
          {tabelaPrazos.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setPrazoDias(p.dias)}
              className="py-2.5 rounded-xl text-xs font-bold flex flex-col items-center"
              style={{
                background: prazoDias === p.dias ? C.blue : C.bg,
                color: prazoDias === p.dias ? '#fff' : C.text,
                border: `1.5px solid ${prazoDias === p.dias ? C.blue : C.border}`,
              }}
            >
              <span>{p.dias}{modalidade === 'semanal' ? 'sem' : 'd'}</span>
              <span style={{ fontWeight: 700, opacity: 0.85 }}>{Math.round(p.taxa * 100)}%</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Valor emprestado" required>
        <input style={inputStyle} type="number" step="0.01" inputMode="decimal" value={valorEmprestado} onChange={(e) => setValorEmprestado(e.target.value)} placeholder="0,00" />
      </Field>
      <Field label={`Total a receber (${Math.round(prazoInfo.taxa * 100)}% de juros — editável)`} required>
        <input
          style={inputStyle}
          type="number"
          step="0.01"
          inputMode="decimal"
          value={valorTotal}
          onChange={(e) => { setValorTotal(e.target.value); setTotalManual(true); }}
          placeholder="0,00"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Parcelas (${unidadePlural})`}>
          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>
            {numParcelas}x de {previewValores.length > 0 ? formatBRL(previewValores[0]) : '-'}
          </div>
        </Field>
        <Field label="Data do empréstimo">
          <input style={inputStyle} type="date" value={dataEmprestimo} onChange={(e) => setDataEmprestimo(e.target.value)} />
        </Field>
      </div>
      <Field label={modalidade === 'semanal' ? 'Data da 1ª parcela (mesmo dia, toda semana)' : 'Data da 1ª parcela'}>
        <input style={inputStyle} type="date" value={dataPrimeiraParcela} onChange={(e) => setDataPrimeiraParcela(e.target.value)} />
      </Field>
      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'none' }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </Field>
      <p className="text-xs mb-3" style={{ color: C.textSoft }}>
        {modalidade === 'semanal'
          ? 'As parcelas se repetem semanalmente, sempre no mesmo dia da semana da 1ª parcela. '
          : 'As parcelas são diárias pulando os domingos, a partir da data da 1ª parcela. '}
        Se não quitar até o fim do prazo, dá pra aplicar juros de atraso (+{Math.round(TAXA_ATRASO * 100)}%) depois, na aba Empréstimos.
      </p>
      {erro && <p className="text-xs mb-2" style={{ color: C.danger }}>{erro}</p>}
      <button
        onClick={salvar}
        disabled={saving}
        className="w-full py-3 rounded-xl font-bold"
        style={{ background: C.gold, color: C.blueDeeper }}
      >
        {saving ? 'Salvando...' : 'Salvar empréstimo'}
      </button>
    </Modal>
  );
}

function EmprestimosTab({ clientes, emprestimos, parcelas, onAdd, onDelete, onAplicarJuros }) {
  const [showForm, setShowForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmJuros, setConfirmJuros] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const hoje = todayStr();

  function nomeCliente(clienteId) {
    const c = clientes.find((c) => c.id === clienteId);
    return c ? c.nome : 'Cliente removido';
  }
  function parcelasDe(empId) {
    return parcelas.filter((p) => p.emprestimoId === empId).sort((a, b) => a.numero - b.numero);
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => setShowForm(true)}
        disabled={clientes.length === 0}
        className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
        style={{ background: clientes.length === 0 ? C.border : C.blue, color: '#fff' }}
      >
        <Plus size={18} /> Novo empréstimo
      </button>
      {clientes.length === 0 && (
        <p className="text-xs text-center" style={{ color: C.textSoft }}>Cadastre um cliente antes de criar um empréstimo.</p>
      )}

      {emprestimos.length === 0 ? (
        <EmptyState icon={HandCoins} title="Nenhum empréstimo cadastrado" subtitle="Os empréstimos vinculados aos clientes vão aparecer aqui." />
      ) : (
        <div className="flex flex-col gap-3">
          {emprestimos.map((emp) => {
            const suas = parcelasDe(emp.id);
            const pagas = suas.filter((p) => p.dataPagamento).length;
            const status = getEmprestimoStatus(emp, parcelas, hoje);
            const aberto = expandido === emp.id;
            return (
              <div key={emp.id} className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ color: C.text }}>{nomeCliente(emp.clienteId)}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.textSoft }}>
                      {formatBRL(emp.valorEmprestado)} emprestado · total {formatBRL(emp.valorTotal)}
                      {emp.prazoDias ? ` · ${emp.prazoDias}${emp.modalidade === 'semanal' ? ' sem' : 'd'} (${Math.round((emp.taxa || 0) * 100)}%)` : ''}
                    </p>
                    {emp.renovacoes && emp.renovacoes.length > 0 && (
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: C.danger }}>
                        Renovado {emp.renovacoes.length}x com juros de atraso · saldo atual {formatBRL(saldoDevedor(emp.id, parcelas))}
                      </p>
                    )}
                    <div className="mt-2"><CoinProgress pagas={pagas} total={suas.length} /></div>
                  </div>
                  <StatusBadge status={status} />
                </div>
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => setExpandido(aberto ? null : emp.id)}
                    className="text-xs font-semibold flex items-center gap-1"
                    style={{ color: C.blue }}
                  >
                    {aberto ? 'Ocultar parcelas' : 'Ver parcelas'}
                    <ChevronRight size={13} style={{ transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(emp)}
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: C.bg }}
                  >
                    <Trash2 size={13} color={C.danger} />
                  </button>
                </div>
                {status === 'vencido' && (
                  <button
                    onClick={() => setConfirmJuros(emp)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 mt-3"
                    style={{ background: C.dangerBg, color: C.danger }}
                  >
                    <AlertTriangle size={13} /> Aplicar juros de atraso (+{Math.round(TAXA_ATRASO * 100)}%)
                  </button>
                )}
                {aberto && (
                  <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    {suas.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                        <span style={{ color: C.textSoft }}>Parc. {p.numero} · {formatDateBR(p.dataVencimento)}</span>
                        <span className="font-semibold" style={{ color: C.text }}>{formatBRL(p.valor)}</span>
                        <StatusBadge status={getParcelaStatus(p, hoje)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <EmprestimoFormModal
          clientes={clientes}
          onClose={() => setShowForm(false)}
          onSave={async (data) => { await onAdd(data); setShowForm(false); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remover empréstimo?"
          message={`Isso vai remover todas as parcelas do empréstimo de ${nomeCliente(confirmDelete.clienteId)}.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}

      {confirmJuros && (
        <ConfirmModal
          title="Aplicar juros de atraso?"
          message={`O prazo de ${nomeCliente(confirmJuros.clienteId)} já venceu com saldo em aberto de ${formatBRL(saldoDevedor(confirmJuros.id, parcelas))}. Isso vai somar ${Math.round(TAXA_ATRASO * 100)}% sobre esse saldo e gerar novas parcelas diárias a partir de amanhã.`}
          onCancel={() => setConfirmJuros(null)}
          onConfirm={async () => { await onAplicarJuros(confirmJuros.id); setConfirmJuros(null); }}
        />
      )}
    </div>
  );
}

/* -------------------------------- Financeiro -------------------------------- */
function AReceberSection({ clientes, emprestimos, parcelas, onBaixar, onDesfazer }) {
  const [filtro, setFiltro] = useState('hoje');
  const [busca, setBusca] = useState('');
  const hoje = todayStr();

  function nomeCliente(emprestimoId) {
    const emp = emprestimos.find((e) => e.id === emprestimoId);
    if (!emp) return 'Cliente removido';
    const cli = clientes.find((c) => c.id === emp.clienteId);
    return cli ? cli.nome : 'Cliente removido';
  }

  const enriquecidas = parcelas.map((p) => ({ ...p, clienteNome: nomeCliente(p.emprestimoId), status: getParcelaStatus(p, hoje) }));

  let filtradas = enriquecidas;
  if (filtro === 'hoje') filtradas = enriquecidas.filter((p) => p.dataVencimento === hoje && p.status !== 'pago');
  else if (filtro === 'pendente') filtradas = enriquecidas.filter((p) => p.status === 'pendente');
  else if (filtro === 'atrasado') filtradas = enriquecidas.filter((p) => p.status === 'atrasado');
  else if (filtro === 'pago') filtradas = enriquecidas.filter((p) => p.status === 'pago');

  if (busca.trim()) {
    filtradas = filtradas.filter((p) => p.clienteNome.toLowerCase().includes(busca.toLowerCase()));
  }

  filtradas = filtradas
    .slice()
    .sort((a, b) => (filtro === 'pago' ? (b.dataPagamento || '').localeCompare(a.dataPagamento || '') : a.dataVencimento.localeCompare(b.dataVencimento)));

  const totalFiltrado = filtradas.reduce((s, p) => s + toNumber(p.valor), 0);

  const filtros = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'pendente', label: 'Pendentes' },
    { key: 'atrasado', label: 'Atrasadas' },
    { key: 'pago', label: 'Pagas' },
    { key: 'todas', label: 'Todas' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: C.white, border: `1.5px solid ${C.border}` }}>
        <Search size={16} color={C.textSoft} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente..."
          className="flex-1 py-2.5 text-sm"
          style={{ outline: 'none', background: 'transparent', color: C.text, border: 'none', width: '100%' }}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold flex-shrink-0"
            style={{
              background: filtro === f.key ? C.blue : C.white,
              color: filtro === f.key ? '#fff' : C.textSoft,
              border: `1px solid ${filtro === f.key ? C.blue : C.border}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtradas.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: C.textSoft }}>{filtradas.length} lançamento(s)</span>
          <span className="text-sm font-bold" style={{ color: C.text }}>{formatBRL(totalFiltrado)}</span>
        </div>
      )}

      {filtradas.length === 0 ? (
        <EmptyState icon={Receipt} title="Nada por aqui" subtitle="Não há lançamentos para este filtro." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtradas.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl p-3.5 flex items-center justify-between gap-3"
              style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: C.text }}>{p.clienteNome}</p>
                <p className="text-xs" style={{ color: C.textSoft }}>Parcela {p.numero} · vence {formatDateBR(p.dataVencimento)}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: C.text }}>{formatBRL(p.valor)}</p>
              </div>
              {p.status === 'pago' ? (
                <button
                  onClick={() => onDesfazer(p.id)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                  style={{ background: C.successBg, color: C.success }}
                >
                  <RotateCcw size={12} /> Desfazer
                </button>
              ) : (
                <button
                  onClick={() => onBaixar(p.id)}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0"
                  style={{ background: C.gold, color: C.blueDeeper }}
                >
                  <Check size={13} /> Baixar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Contas a Pagar -------------------------------- */
function DespesaFormModal({ despesa, onClose, onSave }) {
  const [descricao, setDescricao] = useState(despesa?.descricao || '');
  const [valor, setValor] = useState(despesa?.valor != null ? String(despesa.valor) : '');
  const [data, setData] = useState(despesa?.data || todayStr());
  const [pago, setPago] = useState(despesa?.pago || false);
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!descricao.trim()) { setErro('Informe a descrição da despesa.'); return; }
    if (toNumber(valor) <= 0) { setErro('Informe o valor.'); return; }
    setErro('');
    setSaving(true);
    await onSave({ descricao: descricao.trim(), valor: toNumber(valor), data, pago });
    setSaving(false);
  }

  return (
    <Modal title={despesa ? 'Editar despesa' : 'Nova despesa'} onClose={onClose}>
      <Field label="Descrição da despesa" required>
        <input style={inputStyle} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Combustível, aluguel, salário..." />
      </Field>
      <Field label="Valor" required>
        <input style={inputStyle} type="number" step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
      </Field>
      <Field label="Data">
        <input style={inputStyle} type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 mb-4 cursor-pointer">
        <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} style={{ width: 18, height: 18 }} />
        <span className="text-sm font-semibold" style={{ color: C.text }}>Já está paga</span>
      </label>
      {erro && <p className="text-xs mb-2" style={{ color: C.danger }}>{erro}</p>}
      <button
        onClick={salvar}
        disabled={saving}
        className="w-full py-3 rounded-xl font-bold"
        style={{ background: C.gold, color: C.blueDeeper }}
      >
        {saving ? 'Salvando...' : 'Salvar despesa'}
      </button>
    </Modal>
  );
}

function APagarSection({ despesas, onAdd, onUpdate, onToggle, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [filtro, setFiltro] = useState('todas');

  let filtradas = despesas;
  if (filtro === 'pendentes') filtradas = despesas.filter((d) => !d.pago);
  else if (filtro === 'pagas') filtradas = despesas.filter((d) => d.pago);
  filtradas = filtradas.slice().sort((a, b) => a.data.localeCompare(b.data));

  const totalPendente = despesas.filter((d) => !d.pago).reduce((s, d) => s + toNumber(d.valor), 0);
  const totalPago = despesas.filter((d) => d.pago).reduce((s, d) => s + toNumber(d.valor), 0);

  const filtros = [
    { key: 'todas', label: 'Todas' },
    { key: 'pendentes', label: 'Pendentes' },
    { key: 'pagas', label: 'Pagas' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="A pagar" value={formatBRL(totalPendente)} icon={AlertTriangle} color={C.danger} />
        <KpiCard label="Pago" value={formatBRL(totalPago)} icon={CheckCircle2} color={C.success} />
      </div>

      <button
        onClick={() => { setEditando(null); setShowForm(true); }}
        className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2"
        style={{ background: C.blue, color: '#fff' }}
      >
        <Plus size={18} /> Nova despesa
      </button>

      <div className="flex gap-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className="px-3.5 py-2 rounded-full text-xs font-semibold flex-shrink-0"
            style={{
              background: filtro === f.key ? C.blue : C.white,
              color: filtro === f.key ? '#fff' : C.textSoft,
              border: `1px solid ${filtro === f.key ? C.blue : C.border}`,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhuma despesa" subtitle="Toque em Nova despesa pra cadastrar a primeira." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtradas.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl p-3.5 flex items-center justify-between gap-3"
              style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}
            >
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setEditando(d); setShowForm(true); }}>
                <p className="text-sm font-bold truncate" style={{ color: C.text }}>{d.descricao}</p>
                <p className="text-xs" style={{ color: C.textSoft }}>{formatDateBR(d.data)}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: C.text }}>{formatBRL(d.valor)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onToggle(d.id, !d.pago)}
                  className="px-3 py-2 rounded-xl text-xs font-bold"
                  style={{ background: d.pago ? C.successBg : C.gold, color: d.pago ? C.success : C.blueDeeper }}
                >
                  {d.pago ? 'Pago' : 'Marcar paga'}
                </button>
                <button
                  onClick={() => setConfirmDelete(d)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: C.bg }}
                >
                  <Trash2 size={13} color={C.danger} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DespesaFormModal
          despesa={editando}
          onClose={() => setShowForm(false)}
          onSave={async (data) => {
            if (editando) await onUpdate(editando.id, data);
            else await onAdd(data);
            setShowForm(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remover despesa?"
          message={`Remover "${confirmDelete.descricao}" (${formatBRL(confirmDelete.valor)})?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { await onDelete(confirmDelete.id); setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}

function FinanceiroTab({ clientes, emprestimos, parcelas, despesas, onBaixar, onDesfazer, onAddDespesa, onUpdateDespesa, onToggleDespesa, onDeleteDespesa }) {
  const [secao, setSecao] = useState('receber');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 rounded-xl p-1" style={{ background: C.white, border: `1.5px solid ${C.border}` }}>
        <button
          onClick={() => setSecao('receber')}
          className="flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: secao === 'receber' ? C.blue : 'transparent', color: secao === 'receber' ? '#fff' : C.textSoft }}
        >
          <Receipt size={15} /> A Receber
        </button>
        <button
          onClick={() => setSecao('pagar')}
          className="flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5"
          style={{ background: secao === 'pagar' ? C.blue : 'transparent', color: secao === 'pagar' ? '#fff' : C.textSoft }}
        >
          <Wallet size={15} /> A Pagar
        </button>
      </div>

      {secao === 'receber' ? (
        <AReceberSection clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} onBaixar={onBaixar} onDesfazer={onDesfazer} />
      ) : (
        <APagarSection despesas={despesas} onAdd={onAddDespesa} onUpdate={onUpdateDespesa} onToggle={onToggleDespesa} onDelete={onDeleteDespesa} />
      )}
    </div>
  );
}

/* ------------------------------ Fechamento Diário ------------------------------ */
function LinhaFechamento({ nome, valor }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate" style={{ color: C.textSoft }}>{nome}</span>
      <span className="font-semibold flex-shrink-0" style={{ color: C.text }}>{formatBRL(valor)}</span>
    </div>
  );
}

function SecaoFechamento({ titulo, total, cor, icone: Icone, itens }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: cor + '1A' }}>
            <Icone size={14} color={cor} />
          </div>
          <p className="text-sm font-bold" style={{ color: C.text }}>{titulo}</p>
        </div>
        <p className="text-sm font-bold" style={{ color: cor }}>{formatBRL(total)}</p>
      </div>
      {itens.length > 0 ? (
        <div className="flex flex-col gap-1.5 mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          {itens.map((it, i) => <LinhaFechamento key={i} nome={it.nome} valor={it.valor} />)}
        </div>
      ) : (
        <p className="text-xs" style={{ color: C.textSoft }}>Nada neste dia.</p>
      )}
    </div>
  );
}

function FechamentoTab({ clientes, emprestimos, parcelas, despesas }) {
  const [dataSelecionada, setDataSelecionada] = useState(todayStr());
  const ehHoje = dataSelecionada === todayStr();

  function nomeCliente(emprestimoId) {
    const emp = emprestimos.find((e) => e.id === emprestimoId);
    if (!emp) return 'Cliente removido';
    const cli = clientes.find((c) => c.id === emp.clienteId);
    return cli ? cli.nome : 'Cliente removido';
  }

  const emprestadosHoje = emprestimos.filter((e) => e.dataEmprestimo === dataSelecionada);
  const totalEmprestado = emprestadosHoje.reduce((s, e) => s + toNumber(e.valorEmprestado), 0);

  const recebidosHoje = parcelas.filter((p) => p.dataPagamento === dataSelecionada);
  const totalRecebido = recebidosHoje.reduce((s, p) => s + toNumber(p.valor), 0);

  const saidasHoje = despesas.filter((d) => d.pago && d.data === dataSelecionada);
  const totalSaidas = saidasHoje.reduce((s, d) => s + toNumber(d.valor), 0);

  const saldoDia = totalRecebido - totalEmprestado - totalSaidas;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-3 flex items-center justify-between" style={{ background: C.white, boxShadow: '0 2px 10px rgba(18,32,74,0.06)' }}>
        <button
          onClick={() => setDataSelecionada(addDays(dataSelecionada, -1))}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: C.bg }}
        >
          <ChevronLeft size={16} color={C.textSoft} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold" style={{ color: C.text }}>{formatDateBR(dataSelecionada)}</p>
          <p className="text-xs" style={{ color: C.textSoft }}>{ehHoje ? 'Hoje' : diaDaSemanaLabel(dataSelecionada)}</p>
        </div>
        <button
          onClick={() => setDataSelecionada(addDays(dataSelecionada, 1))}
          disabled={ehHoje}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: C.bg, opacity: ehHoje ? 0.4 : 1 }}
        >
          <ChevronRight size={16} color={C.textSoft} />
        </button>
      </div>

      {!ehHoje && (
        <button onClick={() => setDataSelecionada(todayStr())} className="text-xs underline self-center" style={{ color: C.blue }}>
          Voltar pra hoje
        </button>
      )}

      <div className="rounded-2xl p-4" style={{ background: `linear-gradient(160deg, ${C.blue} 0%, ${C.blueMid} 45%, ${C.blueDeep} 100%)` }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.8)' }}>Saldo do dia</p>
        <p className="sc-font-display text-2xl" style={{ color: '#fff', fontWeight: 900 }}>{formatBRL(saldoDia)}</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Recebido − Emprestado − Saídas de caixa</p>
      </div>

      <SecaoFechamento
        titulo="Emprestado"
        total={totalEmprestado}
        cor={C.blue}
        icone={HandCoins}
        itens={emprestadosHoje.map((e) => ({ nome: (clientes.find((c) => c.id === e.clienteId) || {}).nome || 'Cliente removido', valor: e.valorEmprestado }))}
      />
      <SecaoFechamento
        titulo="Recebido"
        total={totalRecebido}
        cor={C.success}
        icone={CheckCircle2}
        itens={recebidosHoje.map((p) => ({ nome: `${nomeCliente(p.emprestimoId)} · parc. ${p.numero}`, valor: p.valor }))}
      />
      <SecaoFechamento
        titulo="Saídas de caixa"
        total={totalSaidas}
        cor={C.danger}
        icone={Wallet}
        itens={saidasHoje.map((d) => ({ nome: d.descricao, valor: d.valor }))}
      />
    </div>
  );
}

/* ----------------------------------- App ----------------------------------- */
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setErro('');
    if (!email.trim() || !senha) { setErro('Preencha e-mail e senha.'); return; }
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) setErro('E-mail ou senha incorretos.');
    setEntrando(false);
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{ background: `linear-gradient(160deg, ${C.blue} 0%, ${C.blueMid} 45%, ${C.blueDeep} 100%)`, fontFamily: "'Lato','Calibri',sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Lato:wght@400;600;700;900&display=swap');
        .sc-font-display { font-family: 'Nunito', 'Calibri', sans-serif; }
      `}</style>
      <div className="w-full max-w-sm rounded-3xl p-6" style={{ background: C.white, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-3" style={{ background: C.gold }}>
            <Coins size={28} color={C.blueDeeper} />
          </div>
          <h1 className="sc-font-display text-2xl" style={{ color: C.text, fontWeight: 900 }}>Serra Cred</h1>
          <p className="text-xs mt-1" style={{ color: C.textSoft }}>Entre para continuar</p>
        </div>
        <Field label="E-mail">
          <input
            style={inputStyle} type="email" value={email} autoCapitalize="none"
            onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()}
            placeholder="seu@email.com"
          />
        </Field>
        <Field label="Senha">
          <input
            style={inputStyle} type="password" value={senha}
            onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && entrar()}
            placeholder="••••••••"
          />
        </Field>
        {erro && <p className="text-xs mb-3" style={{ color: C.danger }}>{erro}</p>}
        <button
          onClick={entrar} disabled={entrando}
          className="w-full py-3 rounded-xl font-bold"
          style={{ background: C.gold, color: C.blueDeeper }}
        >
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

export default function SerraCredApp() {
  const [tab, setTab] = useState('dashboard');
  const [clientes, setClientes] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [parcelas, setParcelas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoading(true);
      const [c, e, p, d] = await Promise.all([
        supabase.from('clientes').select('*').order('criado_em', { ascending: false }),
        supabase.from('emprestimos').select('*').order('criado_em', { ascending: false }),
        supabase.from('parcelas').select('*'),
        supabase.from('despesas').select('*').order('data', { ascending: false }),
      ]);
      setClientes((c.data || []).map(clienteFromDb));
      setEmprestimos((e.data || []).map(emprestimoFromDb));
      setParcelas((p.data || []).map(parcelaFromDb));
      setDespesas((d.data || []).map(despesaFromDb));
      if (c.error || e.error || p.error || d.error) showToast('Erro ao carregar dados. Confira a conexão.');
      setLoading(false);
    })();
  }, [session]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  async function addCliente(data) {
    const novo = { id: uid('cli'), ...data, criadoEm: todayStr() };
    const { error } = await supabase.from('clientes').insert(clienteToDb(novo));
    if (error) { showToast('Erro ao salvar: ' + error.message); return novo; }
    setClientes([novo, ...clientes]);
    showToast('Cliente cadastrado!');
    return novo;
  }
  async function updateCliente(id, data) {
    const { error } = await supabase.from('clientes').update(clienteToDb({ id, ...data })).eq('id', id);
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setClientes(clientes.map((c) => (c.id === id ? { ...c, ...data } : c)));
    showToast('Cliente atualizado!');
  }
  async function deleteCliente(id) {
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) { showToast('Erro ao remover: ' + error.message); return; }
    const idsEmprestimos = emprestimos.filter((e) => e.clienteId === id).map((e) => e.id);
    setClientes(clientes.filter((c) => c.id !== id));
    setEmprestimos(emprestimos.filter((e) => e.clienteId !== id));
    setParcelas(parcelas.filter((p) => !idsEmprestimos.includes(p.emprestimoId)));
    showToast('Cliente removido.');
  }
  async function addEmprestimo(data) {
    const novoId = uid('emp');
    const novoEmprestimo = {
      id: novoId,
      clienteId: data.clienteId,
      valorEmprestado: toNumber(data.valorEmprestado),
      valorTotal: toNumber(data.valorTotal),
      numParcelas: parseInt(data.numParcelas, 10) || 1,
      prazoDias: data.prazoDias || parseInt(data.numParcelas, 10) || 1,
      taxa: data.taxa != null ? data.taxa : null,
      modalidade: data.modalidade === 'semanal' ? 'semanal' : 'diario',
      dataEmprestimo: data.dataEmprestimo,
      dataPrimeiraParcela: data.dataPrimeiraParcela,
      observacoes: data.observacoes || '',
      renovacoes: [],
      criadoEm: todayStr(),
    };
    const datas = novoEmprestimo.modalidade === 'semanal'
      ? gerarDatasParcelasSemanal(data.dataPrimeiraParcela, novoEmprestimo.numParcelas)
      : gerarDatasParcelas(data.dataPrimeiraParcela, novoEmprestimo.numParcelas);
    const valores = gerarValoresParcelas(novoEmprestimo.valorTotal, novoEmprestimo.numParcelas);
    const novasParcelas = datas.map((d, i) => ({
      id: uid('parc'),
      emprestimoId: novoId,
      numero: i + 1,
      dataVencimento: d,
      valor: valores[i],
      dataPagamento: null,
    }));

    const { error: e1 } = await supabase.from('emprestimos').insert(emprestimoToDb(novoEmprestimo));
    if (e1) { showToast('Erro ao salvar: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('parcelas').insert(novasParcelas.map(parcelaToDb));
    if (e2) { showToast('Erro ao salvar parcelas: ' + e2.message); return; }

    setEmprestimos([novoEmprestimo, ...emprestimos]);
    setParcelas([...parcelas, ...novasParcelas]);
    showToast('Empréstimo cadastrado!');
  }
  async function deleteEmprestimo(id) {
    const { error } = await supabase.from('emprestimos').delete().eq('id', id);
    if (error) { showToast('Erro ao remover: ' + error.message); return; }
    setEmprestimos(emprestimos.filter((e) => e.id !== id));
    setParcelas(parcelas.filter((p) => p.emprestimoId !== id));
    showToast('Empréstimo removido.');
  }
  async function aplicarJurosAtraso(emprestimoId) {
    const suas = parcelas.filter((p) => p.emprestimoId === emprestimoId);
    const naoPagas = suas.filter((p) => !p.dataPagamento);
    if (naoPagas.length === 0) { showToast('Não há saldo em aberto nesse empréstimo.'); return; }

    const emprestimoAtual = emprestimos.find((e) => e.id === emprestimoId);
    const modalidade = emprestimoAtual?.modalidade === 'semanal' ? 'semanal' : 'diario';

    const saldoAtual = naoPagas.reduce((s, p) => s + toNumber(p.valor), 0);
    const novoSaldo = Math.round(saldoAtual * (1 + TAXA_ATRASO) * 100) / 100;
    const qtd = naoPagas.length;
    const jaPagas = suas.length - qtd;
    const novasDatas = modalidade === 'semanal'
      ? gerarDatasParcelasSemanal(addDays(todayStr(), 7), qtd)
      : gerarDatasParcelas(nextNonSunday(addOneDay(todayStr())), qtd);
    const novosValores = gerarValoresParcelas(novoSaldo, qtd);

    const idsNaoPagas = naoPagas.map((p) => p.id);
    const novasParcelas = novasDatas.map((d, i) => ({
      id: uid('parc'),
      emprestimoId,
      numero: jaPagas + i + 1,
      dataVencimento: d,
      valor: novosValores[i],
      dataPagamento: null,
    }));
    const novasRenovacoes = [...(emprestimoAtual?.renovacoes || []), { data: todayStr(), valorAnterior: saldoAtual, valorNovo: novoSaldo }];

    const { error: e1 } = await supabase.from('parcelas').delete().in('id', idsNaoPagas);
    if (e1) { showToast('Erro ao salvar: ' + e1.message); return; }
    const { error: e2 } = await supabase.from('parcelas').insert(novasParcelas.map(parcelaToDb));
    if (e2) { showToast('Erro ao salvar: ' + e2.message); return; }
    const { error: e3 } = await supabase.from('emprestimos').update({ renovacoes: novasRenovacoes }).eq('id', emprestimoId);
    if (e3) { showToast('Erro ao salvar: ' + e3.message); return; }

    const parcelasRestantes = parcelas.filter((p) => !idsNaoPagas.includes(p.id));
    setParcelas([...parcelasRestantes, ...novasParcelas]);
    setEmprestimos(emprestimos.map((e) => (e.id === emprestimoId ? { ...e, renovacoes: novasRenovacoes } : e)));
    showToast(`Juros de atraso aplicado! Novo saldo: ${formatBRL(novoSaldo)}`);
  }
  async function baixarParcela(id) {
    const dataPagamento = todayStr();
    const { error } = await supabase.from('parcelas').update({ data_pagamento: dataPagamento }).eq('id', id);
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setParcelas(parcelas.map((p) => (p.id === id ? { ...p, dataPagamento } : p)));
    showToast('Parcela baixada!');
  }
  async function desfazerParcela(id) {
    const { error } = await supabase.from('parcelas').update({ data_pagamento: null }).eq('id', id);
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setParcelas(parcelas.map((p) => (p.id === id ? { ...p, dataPagamento: null } : p)));
    showToast('Baixa desfeita.');
  }
  async function addDespesa(data) {
    const nova = { id: uid('desp'), ...data, criadoEm: todayStr() };
    const { error } = await supabase.from('despesas').insert(despesaToDb(nova));
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setDespesas([nova, ...despesas]);
    showToast('Despesa cadastrada!');
  }
  async function updateDespesa(id, data) {
    const { error } = await supabase.from('despesas').update(despesaToDb({ id, ...data })).eq('id', id);
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setDespesas(despesas.map((d) => (d.id === id ? { ...d, ...data } : d)));
    showToast('Despesa atualizada!');
  }
  async function toggleDespesa(id, pago) {
    const { error } = await supabase.from('despesas').update({ pago }).eq('id', id);
    if (error) { showToast('Erro ao salvar: ' + error.message); return; }
    setDespesas(despesas.map((d) => (d.id === id ? { ...d, pago } : d)));
    showToast(pago ? 'Despesa marcada como paga!' : 'Despesa marcada como pendente.');
  }
  async function deleteDespesa(id) {
    const { error } = await supabase.from('despesas').delete().eq('id', id);
    if (error) { showToast('Erro ao remover: ' + error.message); return; }
    setDespesas(despesas.filter((d) => d.id !== id));
    showToast('Despesa removida.');
  }
  async function resetarTudo() {
    const { error: e1 } = await supabase.from('clientes').delete().neq('id', '__nenhum__');
    const { error: e2 } = await supabase.from('despesas').delete().neq('id', '__nenhum__');
    if (e1 || e2) { showToast('Erro ao apagar: ' + (e1 || e2).message); return; }
    setClientes([]);
    setEmprestimos([]);
    setParcelas([]);
    setDespesas([]);
    showToast('Todos os dados foram apagados.');
  }

  if (authLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: C.bg }}>
        <LoadingState />
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ fontFamily: "'Lato','Calibri',sans-serif", background: C.bg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Lato:wght@400;600;700;900&display=swap');
        .sc-font-display { font-family: 'Nunito', 'Calibri', sans-serif; }
        input, select, textarea, button { font-family: 'Lato', 'Calibri', sans-serif; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 10px; }
      `}</style>

      <div className="w-full max-w-md min-h-screen" style={{ background: C.bg }}>
        <div
          className="px-5 pt-6 pb-5"
          style={{ background: `linear-gradient(160deg, ${C.blue} 0%, ${C.blueMid} 45%, ${C.blueDeep} 100%)` }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="sc-font-display text-2xl" style={{ color: C.gold, fontWeight: 900, letterSpacing: '0.01em' }}>
                Serra Cred
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.85)' }}>Controle de empréstimos</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <Coins size={22} color={C.gold} />
              </div>
              <button
                onClick={sair}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.14)' }}
                title="Sair"
              >
                <LogOut size={16} color="rgba(255,255,255,0.85)" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-4" style={{ paddingBottom: 112 }}>
          {loading ? (
            <LoadingState />
          ) : tab === 'dashboard' ? (
            <DashboardTab clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} onRequestReset={() => setShowResetConfirm(true)} />
          ) : tab === 'clientes' ? (
            <ClientesTab clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} onAdd={addCliente} onUpdate={updateCliente} onDelete={deleteCliente} />
          ) : tab === 'emprestimos' ? (
            <EmprestimosTab clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} onAdd={addEmprestimo} onDelete={deleteEmprestimo} onAplicarJuros={aplicarJurosAtraso} />
          ) : tab === 'financeiro' ? (
            <FinanceiroTab
              clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} despesas={despesas}
              onBaixar={baixarParcela} onDesfazer={desfazerParcela}
              onAddDespesa={addDespesa} onUpdateDespesa={updateDespesa} onToggleDespesa={toggleDespesa} onDeleteDespesa={deleteDespesa}
            />
          ) : (
            <FechamentoTab clientes={clientes} emprestimos={emprestimos} parcelas={parcelas} despesas={despesas} />
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20">
        <TabBar tab={tab} setTab={setTab} />
      </div>

      {toast && <Toast text={toast} />}

      {showResetConfirm && (
        <ConfirmModal
          title="Apagar todos os dados?"
          message="Isso vai apagar TODOS os clientes, empréstimos, parcelas e despesas do banco de dados de verdade. Não existe desfazer — só use isso se tiver certeza absoluta."
          onCancel={() => setShowResetConfirm(false)}
          onConfirm={async () => { await resetarTudo(); setShowResetConfirm(false); }}
        />
      )}
    </div>
  );
}
