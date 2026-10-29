// =============================================
// CONTROLE FINANCEIRO DESCOMPLICADO — App JS
// =============================================
import { db, auth } from './firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, where, getDoc, setDoc, writeBatch, deleteField } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, OAuthProvider, signInWithPopup, sendEmailVerification, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

// --- CONFIGURAÇÕES DE CATEGORIAS ---
const CATEGORIAS_ENTRADA = ['Salário', 'Renda Extra', 'Rendimentos', 'Outros'];
const CATEGORIAS_SAIDA = ['Alimentação', 'Contas da Casa', 'Saúde', 'Transporte', 'Lazer', 'Roupas/Beleza', 'Assinaturas', 'Educação', 'Investimentos', 'Outros'];
const CATEGORIAS_INVESTIMENTO = ['Ações', 'Tesouro Direto', 'Renda Fixa', 'Previdência Privada', 'Outros'];
const CATEGORY_COLORS = {
  'Alimentação': 'bg-orange-500', 'Contas da Casa': 'bg-blue-500', 'Saúde': 'bg-rose-500',
  'Transporte': 'bg-yellow-500', 'Lazer': 'bg-purple-500', 'Roupas/Beleza': 'bg-pink-400',
  'Assinaturas': 'bg-indigo-500', 'Educação': 'bg-cyan-500', 'Investimentos': 'bg-emerald-600', 'Outros': 'bg-gray-400',
};
const INVEST_COLORS = {
  'Ações': 'bg-violet-600', 'Tesouro Direto': 'bg-amber-500', 'Renda Fixa': 'bg-sky-500',
  'Previdência Privada': 'bg-teal-500', 'Outros': 'bg-slate-400',
};
const mesesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const mesesCurtos = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// --- VARIÁVEIS DE ESTADO ---
let transacoes = [];
let investimentos = [];
let meuPerfil = JSON.parse(localStorage.getItem('meuPerfil')) || { nome: 'Usuário', foto: null, telefone: '' };
let avatarBase64Temporario = null;
let idTransacaoEmEdicao = null;
let idInvestimentoEmEdicao = null;
// Guardados no perfil do usuário (usuarios_app): orçamento por categoria, cartões e metas
let orcamentos = {};
let cartoes = [];
let metas = [];

// --- CONFIGURAÇÃO: SOBRA AUTOMÁTICA ---
let sobraAutomaticaAtiva = JSON.parse(localStorage.getItem('sobraAutomatica') ?? 'true');
let modoEscuroAtivo = JSON.parse(localStorage.getItem('modoEscuro') ?? 'false');

const hoje = new Date();
let dataVisualizacao = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

// --- UTILITÁRIOS ---

/** Escapa HTML para prevenir XSS (seguro também dentro de atributos entre aspas) */
function escaparHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Monta o atributo data-args de um botão delegado (ver despacharAcao) */
function argsAttr(...args) {
  return `data-args="${escaparHTML(JSON.stringify(args))}"`;
}

// --- DELEGAÇÃO DE EVENTOS ---
// Substitui os onclick/onchange inline: assim a CSP pode bloquear todo script inline
// ('unsafe-inline'), que é a principal barreira contra XSS. Só funções desta lista
// podem ser acionadas por atributos data-click / data-change.
const ACOES_PERMITIDAS = new Set([
  'fazerLoginGoogle', 'alternarModoAuth', 'fazerLogout',
  'abrirModalPerfil', 'fecharModalPerfil', 'abrirModalConfiguracoes', 'fecharModalConfiguracoes',
  'abrirModalNotificacoes', 'fecharModalNotificacoes', 'abrirProjecaoDaNotificacao',
  'mudarMes', 'abrirHistorico', 'fecharHistorico', 'abrirProjecaoFluxo', 'fecharProjecaoFluxo',
  'abrirModal', 'fecharModal', 'mudarTipo', 'onchangeCategoria', 'abrirModalEdicao',
  'abrirModalInvestimento', 'fecharModalInvestimento', 'onchangeCategoriaInv',
  'toggleSobraAutomatica', 'toggleModoEscuro', 'fazerBackup', 'acionarImportacao',
  'processarImportacao', 'carregarFoto',
  'pedirConfirmacaoDelete', 'confirmarDelete', 'cancelarDelete',
  'pedirConfirmacaoDeleteInv', 'confirmarDeleteInv', 'cancelarDeleteInv',
  'toggleAnoHistorico', 'gerarRelatorio', 'irParaMesHistorico', 'voltarParaPastas',
  'confirmarPagamentoProjetado', 'mostrarExclusaoConta', 'cancelarExclusaoConta',
  'confirmarDeleteSerie', 'abrirBusca', 'fecharBusca', 'irParaMesDaBusca',
  'abrirCartoes', 'fecharCartoes', 'removerCartao', 'pagarFatura',
  'abrirMetas', 'fecharMetas', 'movimentarMeta', 'excluirMeta',
  'abrirOrcamento', 'fecharOrcamento', 'instalarApp',
]);

function despacharAcao(e, atributo) {
  const el = e.target.closest(`[data-${atributo}]`);
  if (!el) return;
  const nome = el.dataset[atributo];
  if (!ACOES_PERMITIDAS.has(nome) || typeof window[nome] !== 'function') return;
  if (atributo === 'change') return window[nome](e);
  let args = [];
  try { args = el.dataset.args ? JSON.parse(el.dataset.args) : []; } catch { return; }
  window[nome](...(Array.isArray(args) ? args : []));
}

document.addEventListener('click', (e) => despacharAcao(e, 'click'));
document.addEventListener('change', (e) => despacharAcao(e, 'change'));

/** Formata valor como moeda BRL */
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

/** Formata data YYYY-MM-DD para DD/MM/YYYY */
function formatarData(dataStr) {
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Calcula resumo financeiro de uma lista de transações (elimina duplicação) */
function calcularResumo(lista) {
  let entradas = 0, saidas = 0;
  const gastosPorCategoria = {};
  lista.forEach(t => {
    if (t.type === 'income') {
      entradas += t.amount;
    } else {
      saidas += t.amount;
      gastosPorCategoria[t.category] = (gastosPorCategoria[t.category] || 0) + t.amount;
    }
  });
  const arrayCategorias = Object.entries(gastosPorCategoria)
    .map(([nome, valor]) => ({ nome, valor, pct: saidas > 0 ? (valor / saidas) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  return { entradas, saidas, saldo: entradas - saidas, gastosPorCategoria, arrayCategorias };
}

const FALLBACK_ICON_PATHS = {
  'alert-circle': '<circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line>',
  'arrow-down-circle': '<circle cx="12" cy="12" r="10"></circle><path d="M8 12l4 4 4-4"></path><path d="M12 8v8"></path>',
  'arrow-left': '<path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>',
  'arrow-up-circle': '<circle cx="12" cy="12" r="10"></circle><path d="M8 12l4-4 4 4"></path><path d="M12 16V8"></path>',
  'bar-chart-2': '<path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path>',
  'bar-chart-3': '<path d="M3 3v18h18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path>',
  'bell': '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
  'bell-off': '<path d="M13.73 21a2 2 0 0 1-3.46 0"></path><path d="M18.63 13A17.9 17.9 0 0 1 18 8"></path><path d="M6.26 6.26A6 6 0 0 0 6 8c0 7-3 7-3 9h14"></path><path d="M2 2l20 20"></path>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path><path d="M2 13h20"></path>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path>',
  'camera': '<path d="M14.5 4l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1.5-2z"></path><circle cx="12" cy="13" r="4"></circle>',
  'check-circle': '<circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path>',
  'chevron-down': '<path d="M6 9l6 6 6-6"></path>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"></path>',
  'chevron-right': '<path d="M9 18l6-6-6-6"></path>',
  'download-cloud': '<path d="M12 13v8"></path><path d="M8 17l4 4 4-4"></path><path d="M20.4 15.5A5 5 0 0 0 18 6h-1.3A8 8 0 1 0 4 14.9"></path>',
  'folder': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2"></path><path d="M3 19l3-8h16l-3 8z"></path>',
  'folder-search': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v3"></path><path d="M3 19l3-8h9"></path><circle cx="17" cy="17" r="3"></circle><path d="M19.5 19.5L22 22"></path>',
  'folder-x': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M10 11l4 4"></path><path d="M14 11l-4 4"></path>',
  'info': '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
  'list': '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
  'loader-2': '<path d="M21 12a9 9 0 1 1-6.2-8.6"></path>',
  'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
  'pencil': '<path d="M18 2l4 4L8 20H4v-4z"></path><path d="M14 6l4 4"></path>',
  'pie-chart': '<path d="M21 12a9 9 0 1 1-9-9v9z"></path><path d="M12 3a9 9 0 0 1 9 9h-9z"></path>',
  'plus': '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  'refresh-cw': '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"></path><path d="M3 16h6"></path><path d="M3 16v6"></path><path d="M3 12A9 9 0 0 1 18.5 5.7L21 8"></path><path d="M21 8h-6"></path><path d="M21 8V2"></path>',
  'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
  'settings': '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"></path>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path>',
  'tag': '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"></path><path d="M7.5 7.5h.01"></path>',
  'trash-2': '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>',
  'trending-up': '<path d="M3 17l6-6 4 4 8-8"></path><path d="M14 7h7v7"></path>',
  'upload-cloud': '<path d="M12 21v-8"></path><path d="M8 17l4-4 4 4"></path><path d="M20.4 15.5A5 5 0 0 0 18 6h-1.3A8 8 0 1 0 4 14.9"></path>',
  'user-cog': '<circle cx="10" cy="7" r="4"></circle><path d="M2 21a8 8 0 0 1 12-7"></path><circle cx="18" cy="18" r="3"></circle><path d="M18 13v2"></path><path d="M18 21v2"></path><path d="M13 18h2"></path><path d="M21 18h2"></path>',
  'wallet': '<path d="M20 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"></path><path d="M16 12h6v5h-6a2.5 2.5 0 0 1 0-5z"></path>',
  'x': '<path d="M18 6L6 18"></path><path d="M6 6l12 12"></path>',
};

function renderFallbackIcons(root = document) {
  const scope = root && root.querySelectorAll ? root : document;
  const icons = [
    ...(scope.matches?.('i[data-lucide]') ? [scope] : []),
    ...scope.querySelectorAll('i[data-lucide]'),
  ];

  icons.forEach(icon => {
    const name = icon.getAttribute('data-lucide');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-fallback-lucide', name || '');
    svg.setAttribute('class', icon.getAttribute('class') || '');
    svg.innerHTML = FALLBACK_ICON_PATHS[name] || FALLBACK_ICON_PATHS.info;
    icon.replaceWith(svg);
  });
}

function renderIcons(root = document) {
  if (window.lucide?.createIcons) {
    if (root === document) window.lucide.createIcons();
    else window.lucide.createIcons({ nodes: [root] });
    return;
  }

  renderFallbackIcons(root);
}

/** Redimensiona imagem para max 200x200 antes de salvar */
function redimensionarImagem(base64, maxSize, callback) {
  const img = new Image();
  img.onload = function () {
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
    else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.8));
  };
  img.src = base64;
}

/** Renderiza barras de progresso para categorias */
function renderizarBarrasProgresso(arrayCategorias, tipo = 'gasto') {
  const isInv = tipo === 'investimento';
  const colors = isInv ? INVEST_COLORS : CATEGORY_COLORS;
  const corTexto = isInv ? 'text-violet-500' : 'text-emerald-600';
  const corPadrao = isInv ? 'bg-violet-400' : 'bg-slate-400';
  
  if (arrayCategorias.length === 0) return `<p class="text-sm text-slate-400">${isInv ? 'Nenhum investimento registrado.' : 'Nenhum gasto registrado.'}</p>`;
  
  return arrayCategorias.map(c => `
    <div class="space-y-1">
      <div class="flex justify-between text-sm">
        <span class="font-medium text-slate-700">${escaparHTML(c.nome)}</span>
        <span class="text-slate-500">${formatarMoeda(c.valor)} <span class="text-xs font-semibold ${c.nome === 'Investimentos' ? 'text-violet-500' : corTexto}">(${c.pct.toFixed(1)}%)</span></span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-2.5">
        <div class="h-2.5 rounded-full ${colors[c.nome] || corPadrao}" style="width: ${Math.max(c.pct, 2)}%"></div>
      </div>
    </div>
  `).join('');
}

/** Filtra uma lista de registros por ano e mês */
function filtrarListaPorMes(lista, ano, mes) {
  return lista.filter(item => {
    const [iAno, iMes] = item.date.split('-');
    return parseInt(iAno) === ano && parseInt(iMes) - 1 === mes;
  });
}

/** Calcula resumo de investimentos */
function calcularResumoInvestimentos(lista) {
  let total = 0;
  const porCategoria = {};
  lista.forEach(inv => {
    total += inv.amount;
    porCategoria[inv.category] = (porCategoria[inv.category] || 0) + inv.amount;
  });
  const arrayCategorias = Object.entries(porCategoria)
    .map(([nome, valor]) => ({ nome, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  return { total, porCategoria, arrayCategorias };
}



// --- SISTEMA DE NOTIFICAÇÕES (TOAST) ---
function mostrarToast(mensagem, tipo = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgClass = tipo === 'success' ? 'bg-emerald-600' : tipo === 'info' ? 'bg-blue-600' : 'bg-rose-600';
  const icone = tipo === 'success' ? 'check-circle' : tipo === 'info' ? 'info' : 'alert-circle';

  toast.className = `${bgClass} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 w-max max-w-[90vw] toast-enter pointer-events-auto`;
  toast.innerHTML = `<i data-lucide="${icone}" class="w-6 h-6 shrink-0"></i><span class="font-medium">${escaparHTML(mensagem)}</span>`;

  container.appendChild(toast);
  renderIcons();

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- AUTENTICAÇÃO ---
let modoAuth = 'login';
let _authCooldown = false; // Rate limiting simples entre tentativas de login

window.alternarModoAuth = () => {
  modoAuth = modoAuth === 'login' ? 'cadastro' : 'login';
  document.getElementById('btn-auth-text').innerText = modoAuth === 'login' ? 'Entrar' : 'Criar Conta';
  document.getElementById('auth-switch-text').innerText = modoAuth === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?';
  document.getElementById('btn-auth-switch').innerText = modoAuth === 'login' ? 'Criar conta' : 'Fazer login';
  // Aceite dos Termos/Privacidade só é exigido na criação de conta
  document.getElementById('auth-consentimento').classList.toggle('hidden', modoAuth === 'login');
  document.getElementById('auth-senha').autocomplete = modoAuth === 'login' ? 'current-password' : 'new-password';
};

document.getElementById('form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Rate limiting: bloqueia nova tentativa por 2 segundos
  if (_authCooldown) {
    mostrarToast('Aguarde um momento antes de tentar novamente.', 'error');
    return;
  }

  const email = document.getElementById('auth-email').value.trim();
  const senha = document.getElementById('auth-senha').value;
  const btn = document.getElementById('btn-auth-submit');
  const txtOriginal = btn.innerHTML;

  // Validação básica no cliente (defesa em profundidade)
  if (!email || email.length > 254) {
    mostrarToast('E-mail inválido.', 'error');
    return;
  }
  if (!senha || senha.length < 6 || senha.length > 128) {
    mostrarToast('A senha deve ter entre 6 e 128 caracteres.', 'error');
    return;
  }
  // Contas novas: mínimo de 8 caracteres (as antigas, de 6, continuam entrando)
  if (modoAuth === 'cadastro' && senha.length < 8) {
    mostrarToast('Crie uma senha com pelo menos 8 caracteres.', 'error');
    return;
  }
  if (modoAuth === 'cadastro' && !document.getElementById('auth-aceite').checked) {
    mostrarToast('Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.', 'error');
    document.getElementById('auth-aceite').focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Aguarde...';
  renderIcons();

  // Ativa cooldown de 2s
  _authCooldown = true;
  setTimeout(() => { _authCooldown = false; }, 2000);

  try {
    if (modoAuth === 'login') {
      await signInWithEmailAndPassword(auth, email, senha);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      // Confirmação de e-mail: prova que a conta pertence a quem é dono do endereço
      sendEmailVerification(cred.user).then(
        () => mostrarToast('Enviamos um link de confirmação para o seu e-mail.', 'info'),
        () => {}
      );
    }
  } catch (error) {
    // Mensagens genéricas — não vazam detalhes de implementação
    console.warn('[auth]', error.code);
    let msg = modoAuth === 'login'
      ? 'E-mail ou senha incorretos.'
      : `Não foi possível criar a conta (${error.code || 'erro desconhecido'}).`;
    if (error.code === 'auth/operation-not-allowed') msg = 'Cadastro por e-mail e senha está desativado no momento.';
    if (error.code === 'auth/email-already-in-use') msg = 'Este e-mail já possui uma conta.';
    if (error.code === 'auth/weak-password' || error.code === 'auth/password-does-not-meet-requirements') msg = 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
    if (error.code === 'auth/invalid-email') msg = 'Formato de e-mail inválido.';
    if (error.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Aguarde alguns minutos.';
    if (error.code === 'auth/network-request-failed') msg = 'Falha de rede. Verifique sua conexão.';
    mostrarToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
    renderIcons();
  }
});

// --- EXCLUSÃO DE CONTA (LGPD) ---
// Ordem: confirma a identidade de novo → apaga lançamentos, investimentos e perfil → apaga o login.
// O login fica por último: sem ele, as regras do Firestore não deixariam apagar os dados.
const usaSenha = () => auth.currentUser?.providerData.some(p => p.providerId === 'password');

window.mostrarExclusaoConta = () => {
  document.getElementById('btn-mostrar-exclusao').classList.add('hidden');
  document.getElementById('form-excluir-conta').classList.remove('hidden');
  document.getElementById('exclusao-senha-wrap').classList.toggle('hidden', !usaSenha());
  document.getElementById('exclusao-senha').value = '';
};

window.cancelarExclusaoConta = () => {
  document.getElementById('form-excluir-conta').classList.add('hidden');
  document.getElementById('btn-mostrar-exclusao').classList.remove('hidden');
  document.getElementById('exclusao-senha').value = '';
};

async function apagarColecaoDoUsuario(nome, uid) {
  const snap = await getDocs(query(collection(db, nome), where('uid', '==', uid)));
  // Lotes de até 500 operações (limite do Firestore)
  for (let i = 0; i < snap.docs.length; i += 500) {
    const lote = writeBatch(db);
    snap.docs.slice(i, i + 500).forEach(d => lote.delete(d.ref));
    await lote.commit();
  }
}

document.getElementById('form-excluir-conta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  const btn = document.getElementById('btn-confirmar-exclusao');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Excluindo...';
  renderIcons();

  try {
    if (usaSenha()) {
      const senha = document.getElementById('exclusao-senha').value;
      if (!senha) { mostrarToast('Digite sua senha para confirmar.', 'error'); return; }
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, senha));
    } else {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }

    await apagarColecaoDoUsuario('transacoes_app', user.uid);
    await apagarColecaoDoUsuario('investimentos_app', user.uid);
    await deleteDoc(doc(db, 'usuarios_app', user.uid));
    await deleteUser(user);

    fecharModalConfiguracoes();
    cancelarExclusaoConta();
    mostrarToast('Sua conta e todos os seus dados foram excluídos.', 'info');
  } catch (error) {
    console.warn('[excluir-conta]', error.code);
    let msg = 'Não foi possível excluir a conta. Tente novamente.';
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') msg = 'Senha incorreta.';
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') msg = 'Exclusão cancelada.';
    if (error.code === 'auth/user-mismatch') msg = 'Entre com a mesma conta Google que você quer excluir.';
    if (error.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Aguarde alguns minutos.';
    mostrarToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
    renderIcons();
  }
});

window.fazerLogout = async () => {
  try {
    await signOut(auth);
    // Remove do navegador as cópias de dados pessoais (importante em computadores compartilhados)
    ['meuPerfil', 'transacoes_app', 'investimentos_app', 'sobraAutomatica', 'modoEscuro'].forEach(k => localStorage.removeItem(k));
    meuPerfil = { nome: 'Usuário', foto: null, telefone: '' };
    fecharModalConfiguracoes();
  } catch (error) {
    mostrarToast("Erro ao sair da conta.", "error");
  }
};

window.fazerLoginGoogle = async () => {
  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') return;
    // Mensagem genérica — não expõe error.message do Firebase
    mostrarToast('Erro ao entrar com Google. Tente novamente.', 'error');
  }
};


onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    
    // Carregar perfil e configurações do Firestore
    try {
      const userDocRef = doc(db, "usuarios_app", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const dadosUser = userDocSnap.data();
        meuPerfil = {
          nome: dadosUser.nome || '',
          foto: dadosUser.foto || null,
          telefone: ''
        };
        // Telefone não é mais coletado: apaga valor antigo salvo na nuvem
        if (dadosUser.telefone) await setDoc(userDocRef, { telefone: '' }, { merge: true });
        sobraAutomaticaAtiva = dadosUser.sobraAutomatica !== false;
        modoEscuroAtivo = dadosUser.modoEscuro === true;
        orcamentos = sanitizarOrcamentos(dadosUser.orcamentos);
        cartoes = sanitizarCartoes(dadosUser.cartoes);
        metas = sanitizarMetas(dadosUser.metas);
      } else {
        // Criar perfil inicial
        meuPerfil = {
          nome: user.email ? user.email.split('@')[0] : 'Usuário',
          foto: null,
          telefone: ''
        };
        sobraAutomaticaAtiva = true;
        modoEscuroAtivo = false;
        await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva, modoEscuro: modoEscuroAtivo });
      }
      
      // Salvar em cache local e atualizar a UI
      localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
      localStorage.setItem('sobraAutomatica', JSON.stringify(sobraAutomaticaAtiva));
      localStorage.setItem('modoEscuro', JSON.stringify(modoEscuroAtivo));
      atualizarDadosPerfilHeader();
      sincronizarToggleSobra();
      sincronizarToggleModoEscuro();
      aplicarTemaEscuro();
    } catch {
      // Falha silenciosa no sync de perfil — dados em cache local ainda válidos
      sincronizarToggleSobra();
      sincronizarToggleModoEscuro();
      aplicarTemaEscuro();
    }
    
    carregarTransacoes();
  } else {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    transacoes = [];
    investimentos = [];
    orcamentos = {};
    cartoes = [];
    metas = [];
    // Sessão encerrada (logout, expiração ou conta excluída): nada pessoal fica no navegador
    ['meuPerfil', 'transacoes_app', 'investimentos_app'].forEach(k => localStorage.removeItem(k));
    meuPerfil = { nome: 'Usuário', foto: null, telefone: '' };
    atualizarDadosPerfilHeader();
    modoEscuroAtivo = false;
    aplicarTemaEscuro();
    sincronizarToggleModoEscuro();
  }
});

// --- BANCO DE DADOS NUVEM (Firebase Cloud Firestore) ---
async function carregarTransacoes() {
  if (!auth.currentUser) return;
  try {
    const qT = query(collection(db, "transacoes_app"), where("uid", "==", auth.currentUser.uid));
    const querySnapshotT = await getDocs(qT);
    transacoes = [];
    querySnapshotT.forEach((docSnap) => {
      transacoes.push({ id: docSnap.id, ...docSnap.data() });
    });

    const qI = query(collection(db, "investimentos_app"), where("uid", "==", auth.currentUser.uid));
    const querySnapshotI = await getDocs(qI);
    investimentos = [];
    querySnapshotI.forEach((docSnap) => {
      investimentos.push({ id: docSnap.id, ...docSnap.data() });
    });

    ordenarTransacoes();
    atualizarTela();
  } catch {
    mostrarToast('Erro ao carregar dados da nuvem. Tente novamente.', 'error');
  }
}

// As funções salvarTransacoes() e salvarInvestimentos() antigas não são mais usadas
// pois salvamos documento a documento diretamente no Firestore.

function ordenarTransacoes() {
  transacoes.sort((a, b) => new Date(b.date) - new Date(a.date));
  investimentos.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// --- GERENCIAMENTO DE MODAIS ---
function abrirModalGenerico(id) {
  document.getElementById(id).classList.remove('hidden');
}

function fecharModalGenerico(id) {
  document.getElementById(id).classList.add('hidden');
}

// Fechar modais com ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    fecharModal();
    fecharModalPerfil();
    fecharModalConfiguracoes();
    fecharHistorico();
    fecharModalInvestimento();
    fecharModalNotificacoes();
    fecharBusca();
    fecharCartoes();
    fecharMetas();
    fecharOrcamento();
  }
});

// Fechar modais clicando no backdrop
document.addEventListener('DOMContentLoaded', () => {
  const fecharPorId = { 'modal-busca': fecharBusca, 'modal-cartoes': fecharCartoes, 'modal-metas': fecharMetas, 'modal-orcamento': fecharOrcamento };
  Object.entries(fecharPorId).forEach(([id, fechar]) => {
    document.getElementById(id).addEventListener('click', (e) => { if (e.target === e.currentTarget) fechar(); });
  });
  ['modal-cadastro', 'modal-perfil', 'modal-configuracoes', 'modal-historico', 'modal-investimento'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        if (id === 'modal-cadastro') fecharModal();
        else if (id === 'modal-perfil') fecharModalPerfil();
        else if (id === 'modal-configuracoes') fecharModalConfiguracoes();
        else if (id === 'modal-investimento') fecharModalInvestimento();
        else fecharHistorico();
      }
    });
  });
  document.getElementById('modal-notificacoes').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) fecharModalNotificacoes();
  });
  document.getElementById('proj-periodo').addEventListener('change', (e) => {
    selecionarPeriodoProjecao(e.target.value);
  });
});

// --- DELETAR COM CONFIRMAÇÃO ---
window.pedirConfirmacaoDelete = (id) => {
  // Substitui os botões de ação por botões de confirmação
  const container = document.getElementById(`acoes-${id}`);
  if (!container) return;
  const t = transacoes.find(x => x.id === id);
  const temProximas = t?.serieId && transacoes.some(x => x.serieId === t.serieId && x.id !== id && x.date >= t.date);
  if (temProximas) {
    container.innerHTML = `
    <div class="confirm-delete-bar flex flex-wrap items-center justify-end gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button data-click="confirmarDelete" ${argsAttr(id)} class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Só esta</button>
      <button data-click="confirmarDeleteSerie" ${argsAttr(id)} class="bg-rose-700 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-800 transition-colors text-xs">Esta e as próximas</button>
      <button data-click="cancelarDelete" ${argsAttr(id)} class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
    renderIcons();
    return;
  }
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button data-click="confirmarDelete" ${argsAttr(id)} class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button data-click="cancelarDelete" ${argsAttr(id)} class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  renderIcons();
};

window.confirmarDelete = async (id) => {
  // Verificação de autenticação antes de qualquer operação destrutiva
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  // Valida que o ID é uma string simples (previne path traversal)
  if (typeof id !== 'string' || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    mostrarToast('Erro: ID inválido.', 'error');
    return;
  }
  try {
    await deleteDoc(doc(db, 'transacoes_app', id));
    transacoes = transacoes.filter(t => t.id !== id);
    mostrarToast('Conta apagada.', 'success');
    atualizarTela();
  } catch (error) {
    mostrarToast('Erro ao apagar conta. Tente novamente.', 'error');
  }
};

window.confirmarDeleteSerie = async (id) => {
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  const t = transacoes.find(x => x.id === id);
  if (!t?.serieId) return;
  const alvo = transacoes.filter(x => x.serieId === t.serieId && x.date >= t.date);
  try {
    for (let i = 0; i < alvo.length; i += 500) {
      const lote = writeBatch(db);
      alvo.slice(i, i + 500).forEach(x => lote.delete(doc(db, 'transacoes_app', x.id)));
      await lote.commit();
    }
    const ids = new Set(alvo.map(x => x.id));
    transacoes = transacoes.filter(x => !ids.has(x.id));
    mostrarToast(`${alvo.length} lançamentos apagados.`, 'success');
    atualizarTela();
  } catch {
    mostrarToast('Erro ao apagar. Tente novamente.', 'error');
  }
};

window.cancelarDelete = (id) => {
  // Re-renderiza a tela para restaurar os botões normais
  atualizarTela();
};

// --- SISTEMA DE PERFIL DO USUÁRIO ---
// Avatar com iniciais gerado localmente (o nome não é enviado a nenhum serviço externo)
function gerarAvatarIniciais(nome, cor) {
  const iniciais = (nome || 'U').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '') || 'U';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${cor}"/>` +
    `<text x="32" y="33" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${iniciais}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function atualizarDadosPerfilHeader() {
  const nomeExibicao = meuPerfil.nome || 'Usuário';
  document.getElementById('nome-header').innerText = nomeExibicao;
  const avatarEl = document.getElementById('avatar-header');
  avatarEl.src = meuPerfil.foto || gerarAvatarIniciais(nomeExibicao, '#047857');
}

window.abrirModalPerfil = () => {
  document.getElementById('perfil-nome').value = meuPerfil.nome || '';
  const preview = document.getElementById('perfil-foto-preview');
  preview.src = meuPerfil.foto || gerarAvatarIniciais(meuPerfil.nome || 'Usuário', '#64748b');
  avatarBase64Temporario = null;
  abrirModalGenerico('modal-perfil');
};

window.fecharModalPerfil = () => { fecharModalGenerico('modal-perfil'); };

window.abrirModalConfiguracoes = () => {
  sincronizarToggleSobra();
  sincronizarToggleModoEscuro();
  abrirModalGenerico('modal-configuracoes');
};

window.fecharModalConfiguracoes = () => { fecharModalGenerico('modal-configuracoes'); };

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// Foto salva: sempre JPEG/PNG/WebP em base64 (o mesmo formato exigido nas regras do Firestore)
const FOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

window.carregarFoto = (event) => {
  const file = event.target.files[0];
  if (file && (!TIPOS_FOTO.includes(file.type) || file.size > 10 * 1024 * 1024)) {
    mostrarToast('Use uma imagem JPG, PNG, WebP ou GIF de até 10MB.', 'error');
    event.target.value = '';
    return;
  }
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      // Redimensiona para max 200x200 antes de salvar
      redimensionarImagem(e.target.result, 200, (resized) => {
        avatarBase64Temporario = resized;
        document.getElementById('perfil-foto-preview').src = avatarBase64Temporario;
      });
    };
    reader.readAsDataURL(file);
  }
};

document.getElementById('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  meuPerfil.nome = document.getElementById('perfil-nome').value.trim();
  meuPerfil.telefone = ''; // Telefone deixou de ser coletado; salvar vazio apaga o valor antigo na nuvem
  if (avatarBase64Temporario) meuPerfil.foto = avatarBase64Temporario;
  
  // Salvar em cache local e na UI
  localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
  atualizarDadosPerfilHeader();
  
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "usuarios_app", auth.currentUser.uid);
      await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva }, { merge: true });
    } catch {
      mostrarToast('Erro ao sincronizar com nuvem, salvo apenas localmente.', 'error');
    }
  }
  
  mostrarToast("Perfil atualizado com sucesso!");
  fecharModalPerfil();
});

// --- TOGGLE SOBRA AUTOMÁTICA ---
window.toggleSobraAutomatica = async () => {
  sobraAutomaticaAtiva = !sobraAutomaticaAtiva;
  localStorage.setItem('sobraAutomatica', JSON.stringify(sobraAutomaticaAtiva));
  sincronizarToggleSobra();
  atualizarTela();
  
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "usuarios_app", auth.currentUser.uid);
      await setDoc(userDocRef, { sobraAutomatica: sobraAutomaticaAtiva }, { merge: true });
    } catch {
      // Falha silenciosa — configuração local já foi aplicada
    }
  }
  
  mostrarToast(
    sobraAutomaticaAtiva
      ? 'Sobra automática ativada! 🎉'
      : 'Sobra automática desativada.',
    sobraAutomaticaAtiva ? 'success' : 'info'
  );
};

function sincronizarToggleSobra() {
  const toggle = document.getElementById('toggle-sobra-auto');
  const label  = document.getElementById('toggle-sobra-label');
  if (!toggle) return;
  if (sobraAutomaticaAtiva) {
    toggle.classList.add('bg-emerald-500');
    toggle.classList.remove('bg-slate-300');
    toggle.querySelector('span').style.transform = 'translateX(20px)';
    if (label) label.textContent = 'Ativado';
  } else {
    toggle.classList.remove('bg-emerald-500');
    toggle.classList.add('bg-slate-300');
    toggle.querySelector('span').style.transform = 'translateX(0px)';
    if (label) label.textContent = 'Desativado';
  }
}

// --- CONFIGURAÇÃO: TEMA ESCURO (DARK MODE) ---
// Usamos injeção dinâmica de <style> para garantir máxima prioridade
// na cascata CSS, superando os estilos compilados do Tailwind.
const DARK_STYLES = `
  /* === BASE === */
  body { background-color: #0b0f19 !important; color: #e2e8f0 !important; }
  
  /* === CARTÕES E PAINÉIS === */
  .bg-white { background-color: #131b2e !important; color: #e2e8f0 !important; }
  .bg-slate-50 { background-color: #0b0f19 !important; }
  .bg-slate-800 { background-color: #060d1a !important; }
  .bg-slate-100 { background-color: #1e293b !important; }

  /* === BORDAS === */
  .border-slate-100, .border-slate-200, .border-slate-300 { border-color: #1e2d45 !important; }
  .divide-y > *, .divide-slate-100 > * { border-color: #1e2d45 !important; }

  /* === TEXTOS === */
  .text-slate-900, .text-slate-800 { color: #f1f5f9 !important; }
  .text-slate-700 { color: #cbd5e1 !important; }
  .text-slate-600, .text-slate-500 { color: #94a3b8 !important; }
  .text-slate-400 { color: #64748b !important; }
  .text-emerald-800 { color: #34d399 !important; }
  .text-emerald-700 { color: #34d399 !important; }
  .text-rose-700 { color: #f87171 !important; }
  .text-violet-700 { color: #c084fc !important; }

  /* === BOTÕES DE AÇÃO RÁPIDA (O PROBLEMA PRINCIPAL) === */
  .bg-emerald-100 {
    background-color: #052e16 !important;
    border-color: #166534 !important;
    color: #4ade80 !important;
  }
  .bg-emerald-100:hover { background-color: #14532d !important; }

  .bg-rose-100 {
    background-color: #1c0a0a !important;
    border-color: #7f1d1d !important;
    color: #f87171 !important;
  }
  .bg-rose-100:hover { background-color: #3b0d0d !important; }

  .bg-violet-100 {
    background-color: #130a2e !important;
    border-color: #4c1d95 !important;
    color: #c084fc !important;
  }
  .bg-violet-100:hover { background-color: #1e0a4a !important; }

  .bg-emerald-50 {
    background-color: #052e16 !important;
    border-color: #166534 !important;
    color: #4ade80 !important;
  }
  .bg-blue-50 {
    background-color: #0c1a3a !important;
    border-color: #1e40af !important;
    color: #60a5fa !important;
  }

  /* === ICONES CIRCULARES E BADGES === */
  .bg-emerald-100.text-emerald-600 {
    background-color: #052e16 !important;
    color: #4ade80 !important;
  }
  .bg-rose-100.text-rose-600 {
    background-color: #1c0a0a !important;
    color: #f87171 !important;
  }
  .bg-violet-100.text-violet-600 {
    background-color: #130a2e !important;
    color: #c084fc !important;
  }
  .text-emerald-600 { color: #34d399 !important; }
  .text-rose-600 { color: #f87171 !important; }
  .text-violet-600 { color: #c084fc !important; }
  .text-emerald-500 { color: #10b981 !important; }
  .text-emerald-400 { color: #34d399 !important; }
  .text-violet-500 { color: #a78bfa !important; }

  /* === GRADIENTES (Seção de Investimentos) === */
  .from-violet-50.to-indigo-50, .bg-gradient-to-r.from-violet-50 {
    background: linear-gradient(to right, #1a0535, #0f0c3a) !important;
    border-color: #4338ca !important;
  }
  #total-investido-badge {
    background-color: rgba(139, 92, 246, 0.2) !important;
    color: #c084fc !important;
    border: 1px solid rgba(139, 92, 246, 0.4) !important;
  }

  /* === HOVER NAS LISTAS === */
  .hover\\:bg-slate-50:hover, .group:hover { background-color: #1a2540 !important; }
  .hover\\:bg-slate-100:hover { background-color: #1e293b !important; }
  .hover\\:bg-emerald-50:hover { background-color: #052e16 !important; }
  .hover\\:bg-emerald-200:hover { background-color: #14532d !important; }
  .hover\\:bg-rose-200:hover { background-color: #3b0d0d !important; }
  .hover\\:bg-violet-200:hover { background-color: #1e0a4a !important; }

  /* === FORMULÁRIOS === */
  input, select, textarea {
    background-color: #0b1628 !important;
    color: #f1f5f9 !important;
    border-color: #1e2d45 !important;
  }
  input:focus, select:focus, textarea:focus {
    border-color: #10b981 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
    outline: none !important;
  }
  input::placeholder { color: #475569 !important; }

  /* === BOTÃO HISTÓRICO E RELATÓRIOS === */
  .bg-slate-800 { background-color: #0d1b30 !important; }

  /* === CABEÇALHO === */
  header, .bg-emerald-600 { background-color: #052e1c !important; }

  /* === BARRA DE PROGRESSO (categorias) === */
  .bg-slate-100.rounded-full { background-color: #1e293b !important; }

  /* === MODAIS === */
  .modal-overlay .bg-white { background-color: #0e1829 !important; border-color: #1e2d45 !important; }
  .modal-overlay .bg-slate-800 { background-color: #060d1a !important; border-bottom: 1px solid #1e2d45 !important; }

  /* === SCROLLBAR === */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0b0f19; }
  ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #334155; }

  /* === PROJEÇÃO DE FLUXO DE CAIXA === */
  .modal-overlay .bg-slate-50 { background-color: #0b1628 !important; border-color: #1e2d45 !important; }
  .modal-overlay .bg-slate-50\/50 { background-color: #131f37 !important; border-color: #1e2d45 !important; }
  #lista-agendamentos { background-color: #131b2e !important; }
  #proj-contador-pendentes { background-color: #1e2d45 !important; color: #cbd5e1 !important; }
`;

function aplicarTemaEscuro() {
  let styleTag = document.getElementById('dark-mode-overrides');
  if (modoEscuroAtivo) {
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'dark-mode-overrides';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = DARK_STYLES;
    document.body.classList.add('dark');
  } else {
    if (styleTag) {
      styleTag.textContent = '';
    }
    document.body.classList.remove('dark');
  }
}

window.toggleModoEscuro = async () => {
  modoEscuroAtivo = !modoEscuroAtivo;
  localStorage.setItem('modoEscuro', JSON.stringify(modoEscuroAtivo));
  sincronizarToggleModoEscuro();
  aplicarTemaEscuro();
  
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "usuarios_app", auth.currentUser.uid);
      await setDoc(userDocRef, { modoEscuro: modoEscuroAtivo }, { merge: true });
    } catch {
      // Falha silenciosa no Firestore
    }
  }
  
  mostrarToast(
    modoEscuroAtivo
      ? 'Modo escuro ativado! 🌙'
      : 'Modo clássico (claro) ativado! ☀️',
    modoEscuroAtivo ? 'success' : 'info'
  );
};

function sincronizarToggleModoEscuro() {
  const toggle = document.getElementById('toggle-modo-escuro');
  const label  = document.getElementById('toggle-modo-escuro-label');
  if (!toggle) return;
  if (modoEscuroAtivo) {
    toggle.classList.add('bg-emerald-500');
    toggle.classList.remove('bg-slate-300');
    toggle.querySelector('span').style.transform = 'translateX(20px)';
    if (label) label.textContent = 'Ativado';
  } else {
    toggle.classList.remove('bg-emerald-500');
    toggle.classList.add('bg-slate-300');
    toggle.querySelector('span').style.transform = 'translateX(0px)';
    if (label) label.textContent = 'Desativado';
  }
}

// --- LÓGICA DE SALVAR / EDITAR TRANSAÇÃO ---
// Um lançamento pode virar uma série: "Todo mês" (recorrente) ou "Parcelado" (o valor
// digitado é o total, dividido entre as parcelas). Gastos no cartão de crédito vão para
// a data de vencimento da fatura e ficam pendentes até a fatura ser paga.

/** Mesma data N meses depois (dia 31 vira o último dia de meses mais curtos) */
function somarMeses(dataStr, n) {
  const [a, m, d] = dataStr.split('-').map(Number);
  const ultimoDia = new Date(a, m - 1 + n + 1, 0).getDate();
  return obterDataFormatada(new Date(a, m - 1 + n, Math.min(d, ultimoDia)));
}

/** Data de vencimento da fatura em que cai uma compra feita em dataCompra */
function vencimentoDaFatura(cartao, dataCompra) {
  const [a, m, d] = dataCompra.split('-').map(Number);
  // Compra no dia do fechamento ou depois já vai para a fatura seguinte
  const mesFechamento = d < cartao.fechamento ? m - 1 : m;
  const mesVencimento = cartao.vencimento > cartao.fechamento ? mesFechamento : mesFechamento + 1;
  return obterDataFormatada(new Date(a, mesVencimento, cartao.vencimento));
}

function gerarIdCurto() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

/** Monta os lançamentos que serão gravados a partir do formulário */
function montarLancamentos({ tipo, descricao, valor, categoria, data, pago, cartao, repetir, vezes }) {
  const base = { type: tipo, description: descricao, category: categoria, uid: auth.currentUser.uid };
  const total = repetir === 'nao' ? 1 : vezes;
  const serieId = total > 1 ? gerarIdCurto() : null;
  const centavos = Math.round(valor * 100);
  const parteCentavos = Math.floor(centavos / total);

  return Array.from({ length: total }, (_, i) => {
    const item = { ...base, amount: valor };
    if (repetir === 'parcelado') {
      // A última parcela absorve os centavos que sobram da divisão
      item.amount = (i < total - 1 ? parteCentavos : centavos - parteCentavos * (total - 1)) / 100;
      item.parcela = i + 1;
      item.parcelas = total;
    }
    if (repetir === 'recorrente') item.recorrente = true;
    if (serieId) item.serieId = serieId;

    if (cartao) {
      // Parcelado: uma compra, parcelas em faturas seguidas. Recorrente: uma compra por mês.
      item.dataCompra = repetir === 'parcelado' ? data : somarMeses(data, i);
      item.date = repetir === 'parcelado'
        ? somarMeses(vencimentoDaFatura(cartao, data), i)
        : vencimentoDaFatura(cartao, item.dataCompra);
      item.cartaoId = cartao.id;
      item.pago = false;
    } else {
      item.date = somarMeses(data, i);
      item.pago = i === 0 ? pago : false;
    }
    return item;
  });
}

/** Atualiza os campos que dependem do tipo, da forma de pagamento e da repetição */
function atualizarCamposForm() {
  const tipo = document.getElementById('form-tipo').value;
  const emEdicao = !!idTransacaoEmEdicao;
  const pagamento = document.getElementById('form-pagamento');
  const cartao = tipo === 'expense' ? cartoes.find(c => c.id === pagamento.value) : null;
  const repetir = emEdicao ? 'nao' : document.getElementById('form-repetir').value;
  const vezes = parseInt(document.getElementById('form-vezes').value, 10);
  const valor = parseFloat(document.getElementById('form-valor').value);
  const data = document.getElementById('form-data').value;

  document.getElementById('form-pagamento-wrap').classList.toggle('hidden', tipo !== 'expense' || cartoes.length === 0);
  document.getElementById('form-repetir-wrap').classList.toggle('hidden', emEdicao);
  document.getElementById('form-vezes-wrap').classList.toggle('hidden', repetir === 'nao');
  document.getElementById('form-vezes-label').innerText = repetir === 'parcelado' ? 'Quantas parcelas?' : 'Por quantos meses?';
  // No cartão, "pago" é decidido ao pagar a fatura
  document.getElementById('form-pago-wrap').classList.toggle('hidden', !!cartao);
  document.querySelector('label[for="form-data"]').innerText = cartao ? 'Data da compra' : 'Data';

  const dicas = [];
  if (repetir === 'parcelado' && valor > 0 && vezes >= 2) {
    dicas.push(`${vezes}x de ${formatarMoeda(Math.floor(Math.round(valor * 100) / vezes) / 100)} (valor total ${formatarMoeda(valor)}).`);
  }
  if (repetir === 'recorrente' && vezes >= 2) {
    dicas.push(`Será lançado todo mês, por ${vezes} meses. Os meses seguintes ficam como pendentes.`);
  }
  if (cartao && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    dicas.push(`Entra na fatura do ${cartao.nome} que vence em ${formatarData(vencimentoDaFatura(cartao, data))}.`);
  }
  const dica = document.getElementById('form-dica');
  dica.textContent = dicas.join(' ');
  dica.classList.toggle('hidden', dicas.length === 0);
}

function preencherSelectPagamento(valorAtual = '') {
  const select = document.getElementById('form-pagamento');
  select.innerHTML = '<option value="">Dinheiro, Pix ou débito</option>' +
    cartoes.map(c => `<option value="${escaparHTML(c.id)}">Cartão ${escaparHTML(c.nome)}</option>`).join('');
  select.value = cartoes.some(c => c.id === valorAtual) ? valorAtual : '';
}

document.getElementById('form-transacao').addEventListener('input', atualizarCamposForm);
document.getElementById('form-transacao').addEventListener('change', atualizarCamposForm);

document.getElementById('form-transacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tipo = document.getElementById('form-tipo').value;
  const descricao = document.getElementById('form-desc').value.trim().slice(0, 300);
  const valor = parseFloat(document.getElementById('form-valor').value);
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  const categoria = (selectCat.value === 'Outros' && inputOutros.value.trim() ? inputOutros.value.trim() : selectCat.value).slice(0, 100);
  const data = document.getElementById('form-data').value;
  const pago = document.getElementById('form-pago').checked;
  const cartao = tipo === 'expense' ? cartoes.find(c => c.id === document.getElementById('form-pagamento').value) || null : null;
  const repetir = idTransacaoEmEdicao ? 'nao' : document.getElementById('form-repetir').value;
  const vezes = parseInt(document.getElementById('form-vezes').value, 10);

  if (!descricao) { mostrarToast('Descrição inválida.', 'error'); return; }
  if (isNaN(valor) || valor <= 0 || !categoria || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
  if (repetir !== 'nao' && (!Number.isInteger(vezes) || vezes < 2 || vezes > 60)) {
    mostrarToast('Escolha de 2 a 60 repetições.', 'error');
    return;
  }
  if (repetir === 'parcelado' && Math.round(valor * 100) < vezes) {
    mostrarToast('Valor pequeno demais para tantas parcelas.', 'error');
    return;
  }

  const btnSalvar = document.getElementById('btn-salvar');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  renderIcons();

  try {
    let dataVisivel;
    if (idTransacaoEmEdicao) {
      const index = transacoes.findIndex(t => t.id === idTransacaoEmEdicao);
      if (index !== -1) {
        const payload = { type: tipo, description: descricao, amount: valor, category: categoria, date: data, pago, uid: auth.currentUser.uid };
        if (cartao) {
          payload.cartaoId = cartao.id;
          payload.dataCompra = data;
          // Parcela N de uma compra parcelada continua N-1 faturas depois da primeira
          payload.date = somarMeses(vencimentoDaFatura(cartao, data), (transacoes[index].parcela || 1) - 1);
        } else if (transacoes[index].cartaoId) {
          payload.cartaoId = deleteField();
          payload.dataCompra = deleteField();
        }
        await updateDoc(doc(db, 'transacoes_app', idTransacaoEmEdicao), payload);
        const atualizado = { ...transacoes[index], ...payload };
        if (!cartao) { delete atualizado.cartaoId; delete atualizado.dataCompra; }
        transacoes[index] = atualizado;
        dataVisivel = payload.date;
        mostrarToast('Conta atualizada com sucesso!');
      }
    } else {
      const lancamentos = montarLancamentos({ tipo, descricao, valor, categoria, data, pago, cartao, repetir, vezes });
      const lote = writeBatch(db);
      const novos = lancamentos.map(item => {
        const ref = doc(collection(db, 'transacoes_app'));
        lote.set(ref, item);
        return { id: ref.id, ...item };
      });
      await lote.commit();
      transacoes.push(...novos);
      dataVisivel = novos[0].date;
      mostrarToast(novos.length > 1 ? `${novos.length} lançamentos criados!` : 'Conta adicionada com sucesso!');
    }

    if (dataVisivel) {
      const [anoStr, mesStr] = dataVisivel.split('-');
      dataVisualizacao = new Date(parseInt(anoStr), parseInt(mesStr) - 1, 1);
    }

    ordenarTransacoes();
    atualizarTela();
    fecharModal();
    if (tipo === 'expense' && dataVisivel) avisarOrcamento(categoria, dataVisivel);
  } catch (error) {
    mostrarToast('Erro ao salvar na nuvem. Tente novamente.', 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = btnContent;
    renderIcons();
  }
});

// --- FUNÇÕES DE INTERFACE DO MODAL DE CADASTRO ---
window.mudarTipo = (tipo) => {
  document.getElementById('form-tipo').value = tipo;
  document.getElementById('modal-cadastro').setAttribute('data-tipo', tipo);
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  const cats = tipo === 'income' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  selectCat.innerHTML = cats.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join('');
  inputOutros.classList.add('hidden');
  inputOutros.value = '';
  atualizarCamposForm();
};

window.onchangeCategoria = () => {
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  if (selectCat.value === 'Outros') {
    inputOutros.classList.remove('hidden');
    inputOutros.focus();
  } else {
    inputOutros.classList.add('hidden');
    inputOutros.value = '';
  }
};

window.abrirModal = (tipo) => {
  idTransacaoEmEdicao = null;
  preencherSelectPagamento();
  document.getElementById('form-repetir').value = 'nao';
  document.getElementById('form-vezes').value = 12;
  mudarTipo(tipo);
  document.getElementById('modal-title').innerText = tipo === 'income' ? 'Adicionar Entrada' : 'Adicionar Saída';
  document.getElementById('btn-salvar').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Confirmar e Salvar';
  document.getElementById('form-desc').value = '';
  document.getElementById('form-valor').value = '';
  document.getElementById('form-pago').checked = true; // Pago por padrão ao criar

  const agora = new Date();
  if (dataVisualizacao.getFullYear() === agora.getFullYear() && dataVisualizacao.getMonth() === agora.getMonth()) {
    document.getElementById('form-data').value = obterDataFormatada(agora);
  } else {
    document.getElementById('form-data').value = `${dataVisualizacao.getFullYear()}-${String(dataVisualizacao.getMonth() + 1).padStart(2, '0')}-01`;
  }

  atualizarCamposForm();
  abrirModalGenerico('modal-cadastro');
  renderIcons();
};

window.abrirModalEdicao = (id) => {
  const transacao = transacoes.find(t => t.id === id);
  if (!transacao) return;
  idTransacaoEmEdicao = id;
  preencherSelectPagamento(transacao.cartaoId || '');
  mudarTipo(transacao.type);
  document.getElementById('form-desc').value = transacao.description;
  document.getElementById('form-valor').value = transacao.amount;
  document.getElementById('form-pago').checked = transacao.pago !== false; // Carrega estado

  // Bug 1 fix: Restaurar categorias customizadas corretamente
  const cats = transacao.type === 'income' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  if (cats.includes(transacao.category)) {
    selectCat.value = transacao.category;
    inputOutros.classList.add('hidden');
    inputOutros.value = '';
  } else {
    selectCat.value = 'Outros';
    inputOutros.classList.remove('hidden');
    inputOutros.value = transacao.category;
  }

  // No cartão, o formulário mostra a data da compra (a data salva é o vencimento da fatura)
  document.getElementById('form-data').value = transacao.cartaoId && transacao.dataCompra ? transacao.dataCompra : transacao.date;
  document.getElementById('modal-title').innerText = 'Editar Conta';
  document.getElementById('btn-salvar').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Salvar Alterações';
  atualizarCamposForm();
  abrirModalGenerico('modal-cadastro');
  renderIcons();
};

window.fecharModal = () => { fecharModalGenerico('modal-cadastro'); idTransacaoEmEdicao = null; };

// --- SISTEMA DE INVESTIMENTOS ---
window.onchangeCategoriaInv = () => {
  const selectCat = document.getElementById('inv-categoria');
  const inputOutros = document.getElementById('inv-categoria-outros');
  if (selectCat.value === 'Outros') {
    inputOutros.classList.remove('hidden');
    inputOutros.focus();
  } else {
    inputOutros.classList.add('hidden');
    inputOutros.value = '';
  }
};

window.abrirModalInvestimento = (idEditar) => {
  idInvestimentoEmEdicao = idEditar || null;
  const selectCat = document.getElementById('inv-categoria');
  const inputOutros = document.getElementById('inv-categoria-outros');
  inputOutros.classList.add('hidden');
  inputOutros.value = '';

  if (idInvestimentoEmEdicao) {
    const inv = investimentos.find(i => i.id === idInvestimentoEmEdicao);
    if (!inv) return;
    document.getElementById('inv-desc').value = inv.description;
    document.getElementById('inv-valor').value = inv.amount;
    document.getElementById('inv-data').value = inv.date;
    document.getElementById('inv-pago').checked = inv.pago !== false; // Carrega estado
    document.getElementById('modal-inv-title').innerText = 'Editar Investimento';
    document.getElementById('btn-salvar-inv').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Salvar Alterações';
    // Set categoria
    if (CATEGORIAS_INVESTIMENTO.includes(inv.category)) {
      selectCat.value = inv.category;
    } else {
      selectCat.value = 'Outros';
      inputOutros.classList.remove('hidden');
      inputOutros.value = inv.category;
    }
  } else {
    document.getElementById('inv-desc').value = '';
    document.getElementById('inv-valor').value = '';
    document.getElementById('inv-pago').checked = true; // Pago por padrão
    selectCat.value = 'Ações';
    document.getElementById('modal-inv-title').innerText = 'Registrar Investimento';
    document.getElementById('btn-salvar-inv').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Confirmar Investimento';

    const agora = new Date();
    if (dataVisualizacao.getFullYear() === agora.getFullYear() && dataVisualizacao.getMonth() === agora.getMonth()) {
      document.getElementById('inv-data').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    } else {
      document.getElementById('inv-data').value = `${dataVisualizacao.getFullYear()}-${String(dataVisualizacao.getMonth() + 1).padStart(2, '0')}-01`;
    }
  }

  abrirModalGenerico('modal-investimento');
  renderIcons();
};

window.fecharModalInvestimento = () => { fecharModalGenerico('modal-investimento'); idInvestimentoEmEdicao = null; };

document.getElementById('form-investimento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const descricao = document.getElementById('inv-desc').value.trim();
  const valor = parseFloat(document.getElementById('inv-valor').value);
  const selectCat = document.getElementById('inv-categoria');
  const inputOutros = document.getElementById('inv-categoria-outros');
  const categoria = selectCat.value === 'Outros' && inputOutros.value.trim() ? inputOutros.value.trim() : selectCat.value;
  const data = document.getElementById('inv-data').value;
  const pago = document.getElementById('inv-pago').checked;

  if (!descricao || isNaN(valor) || valor <= 0 || !categoria || !data) return;

  const btnSalvar = document.getElementById('btn-salvar-inv');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  renderIcons();

  try {
    if (idInvestimentoEmEdicao) {
      const index = investimentos.findIndex(i => i.id === idInvestimentoEmEdicao);
      if (index !== -1) {
        const payload = { description: descricao, amount: valor, category: categoria, date: data, pago, uid: auth.currentUser.uid };
        await updateDoc(doc(db, "investimentos_app", idInvestimentoEmEdicao), payload);
        investimentos[index] = { id: idInvestimentoEmEdicao, ...payload };
        mostrarToast('Investimento atualizado com sucesso!');
      }
    } else {
      const payload = { description: descricao, amount: valor, category: categoria, date: data, pago, uid: auth.currentUser.uid };
      const docRef = await addDoc(collection(db, "investimentos_app"), payload);
      investimentos.push({ id: docRef.id, ...payload });
      mostrarToast('Investimento registrado com sucesso!');
    }

    const [anoStr, mesStr] = data.split('-');
    dataVisualizacao.setFullYear(parseInt(anoStr));
    dataVisualizacao.setMonth(parseInt(mesStr) - 1);

    ordenarTransacoes();
    atualizarTela();
    fecharModalInvestimento();
  } catch {
    mostrarToast('Erro ao salvar na nuvem. Tente novamente.', 'error');
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = btnContent;
    renderIcons();
  }
});

window.pedirConfirmacaoDeleteInv = (id) => {
  const container = document.getElementById(`acoes-inv-${id}`);
  if (!container) return;
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button data-click="confirmarDeleteInv" ${argsAttr(id)} class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button data-click="cancelarDeleteInv" ${argsAttr(id)} class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  renderIcons();
};

window.confirmarDeleteInv = async (id) => {
  // Verificação de autenticação antes de qualquer operação destrutiva
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  // Valida que o ID é uma string simples
  if (typeof id !== 'string' || id.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    mostrarToast('Erro: ID inválido.', 'error');
    return;
  }
  try {
    await deleteDoc(doc(db, 'investimentos_app', id));
    investimentos = investimentos.filter(i => i.id !== id);
    mostrarToast('Investimento apagado.', 'success');
    atualizarTela();
  } catch (error) {
    mostrarToast('Erro ao apagar investimento. Tente novamente.', 'error');
  }
};

window.cancelarDeleteInv = () => {
  atualizarTela();
};

// --- NAVEGAÇÃO DE MESES ---
window.mudarMes = (delta) => {
  dataVisualizacao = new Date(dataVisualizacao.getFullYear(), dataVisualizacao.getMonth() + delta, 1);
  atualizarTela();
};

// --- SOBRA AUTOMÁTICA: Calcula o saldo positivo de um mês anterior ---
function calcularSobraDoMes(ano, mes, _visitados = new Set()) {
  const chave = `${ano}-${mes}`;
  // Proteção contra recursão infinita
  if (_visitados.has(chave)) return 0;
  _visitados.add(chave);

  const t = filtrarListaPorMes(transacoes, ano, mes).filter(x => x.pago !== false);
  const inv = filtrarListaPorMes(investimentos, ano, mes).filter(x => x.pago !== false);

  // Se não há nenhum registro neste mês, interrompe a cadeia
  if (t.length === 0 && inv.length === 0) return 0;

  const r = calcularResumo(t);
  const rInv = calcularResumoInvestimentos(inv);

  // Incluir sobra encadeada do mês anterior
  const ant = mesAnterior(ano, mes);
  const sobraAnt = sobraAutomaticaAtiva ? calcularSobraDoMes(ant.ano, ant.mes, _visitados) : 0;
  const saldo = (r.entradas + sobraAnt) - (r.saidas + rInv.total);
  return saldo > 0 ? saldo : 0;
}

// Retorna a data do mês anterior em relação a (ano, mes)
function mesAnterior(ano, mes) {
  if (mes === 0) return { ano: ano - 1, mes: 11 };
  return { ano, mes: mes - 1 };
}

// --- ATUALIZAR TELA (Cálculos e Renderização HTML) ---
function atualizarTela() {
  const mesVisualizado = dataVisualizacao.getMonth();
  const anoVisualizado = dataVisualizacao.getFullYear();
  document.getElementById('mes-ano-display').innerText = `${mesesNomes[mesVisualizado]} ${anoVisualizado}`;

  const transacoesDoMes = filtrarListaPorMes(transacoes, anoVisualizado, mesVisualizado);
  const investimentosDoMes = filtrarListaPorMes(investimentos, anoVisualizado, mesVisualizado);
  const resumo = calcularResumo(transacoesDoMes.filter(x => x.pago !== false));
  const resumoInv = calcularResumoInvestimentos(investimentosDoMes.filter(x => x.pago !== false));

  // --- SOBRA AUTOMÁTICA ---
  let sobraAnterior = 0;
  if (sobraAutomaticaAtiva) {
    const ant = mesAnterior(anoVisualizado, mesVisualizado);
    sobraAnterior = calcularSobraDoMes(ant.ano, ant.mes);
  }

  // Investimentos saem da conta — somam nas saídas e subtraem do saldo
  const saidasTotal = resumo.saidas + resumoInv.total;
  const entradasComSobra = resumo.entradas + sobraAnterior;
  const saldoTotal = entradasComSobra - saidasTotal;

  document.getElementById('total-entradas').innerText = formatarMoeda(entradasComSobra);
  document.getElementById('total-saidas').innerText = formatarMoeda(saidasTotal);
  document.getElementById('total-saldo').innerText = formatarMoeda(saldoTotal);

  // Atualiza indicador de sobra no cartão de entradas
  const badgeSobra = document.getElementById('badge-sobra-anterior');
  if (badgeSobra) {
    if (sobraAutomaticaAtiva && sobraAnterior > 0) {
      badgeSobra.innerText = `+ ${formatarMoeda(sobraAnterior)} do mês anterior`;
      badgeSobra.classList.remove('hidden');
    } else {
      badgeSobra.classList.add('hidden');
    }
  }

  // Usa data-attribute para controlar cor do cartão de saldo via CSS
  document.getElementById('cartao-saldo').setAttribute('data-negativo', saldoTotal < 0 ? 'true' : 'false');

  const listaHTML = document.getElementById('lista-transacoes');
  if (transacoesDoMes.length === 0) {
    listaHTML.innerHTML = `<div class="p-8 text-center text-slate-400"><p>Nenhuma conta registrada neste mês.</p></div>`;
  } else {
    listaHTML.innerHTML = transacoesDoMes.map(t => {
      const isPendente = t.pago === false;
      const bgIconClass = isPendente ? 'bg-amber-100 text-amber-600' : (t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600');
      const iconName = isPendente ? 'clock' : (t.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle');
      const textStyleClass = isPendente ? 'text-slate-400 font-normal line-through opacity-75' : 'font-semibold text-slate-800';
      const textAmountColor = isPendente ? 'text-amber-500 font-medium' : (t.type === 'income' ? 'text-emerald-600' : 'text-rose-600');
      
      return `
        <div class="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group ${isPendente ? 'bg-amber-50/20' : ''}">
          <div class="flex items-center gap-4">
            <div class="p-3 rounded-full ${bgIconClass}">
              <i data-lucide="${iconName}" class="w-6 h-6"></i>
            </div>
            <div>
              <h3 class="${textStyleClass}">
                ${escaparHTML(t.description)}
                ${isPendente ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded ml-2 uppercase tracking-wide">Pendente</span>' : ''}
                ${t.parcelas > 1 ? `<span class="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded ml-1">${Number(t.parcela)}/${Number(t.parcelas)}</span>` : ''}
                ${t.recorrente ? '<span class="text-xs bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded ml-1">Mensal</span>' : ''}
              </h3>
              <div class="flex items-center gap-2 text-sm text-slate-500 mt-1">
                <span class="flex items-center gap-1"><i data-lucide="tag" class="w-3 h-3"></i> ${escaparHTML(t.category)}</span>
                <span>•</span>
                <span>${escaparHTML(formatarData(t.date))}</span>
                ${t.cartaoId ? `<span>•</span><span class="flex items-center gap-1"><i data-lucide="credit-card" class="w-3 h-3"></i> ${escaparHTML(nomeDoCartao(t.cartaoId))}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 sm:gap-2" id="acoes-${escaparHTML(t.id)}">
            <span class="font-bold text-lg mr-2 ${textAmountColor}">
              ${t.type === 'income' ? '+' : '-'}${formatarMoeda(t.amount)}
            </span>
            <button data-click="abrirModalEdicao" ${argsAttr(t.id)} class="text-slate-300 hover:text-blue-500 transition-colors p-2" title="Editar conta">
              <i data-lucide="pencil" class="w-5 h-5"></i>
            </button>
            <button data-click="pedirConfirmacaoDelete" ${argsAttr(t.id)} class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar conta">
              <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- GASTOS DO MÊS (com investimentos incluídos como categoria) ---
  // Monta array de categorias incluindo investimentos como uma barra
  const categoriasComInvestimento = { ...resumo.gastosPorCategoria };
  if (resumoInv.total > 0) {
    categoriasComInvestimento['Investimentos'] = (categoriasComInvestimento['Investimentos'] || 0) + resumoInv.total;
  }
  const totalSaidasComInv = saidasTotal;
  const arrayCategoriasComInv = Object.entries(categoriasComInvestimento)
    .map(([nome, valor]) => ({ nome, valor, pct: totalSaidasComInv > 0 ? (valor / totalSaidasComInv) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const listaCategorias = document.getElementById('lista-categorias');
  if (arrayCategoriasComInv.length === 0) {
    listaCategorias.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">Nenhum gasto registrado neste mês.</p>`;
  } else {
    listaCategorias.innerHTML = renderizarBarrasProgresso(arrayCategoriasComInv, 'gasto');
  }

  // --- ATUALIZAR SEÇÃO DE INVESTIMENTOS ---
  document.getElementById('total-investido-badge').innerText = formatarMoeda(resumoInv.total);

  const invCategoriasEl = document.getElementById('investimentos-categorias');
  if (resumoInv.arrayCategorias.length === 0) {
    invCategoriasEl.innerHTML = `<p class="text-center text-slate-400 text-sm py-4">Nenhum investimento registrado neste mês.</p>`;
  } else {
    invCategoriasEl.innerHTML = renderizarBarrasProgresso(resumoInv.arrayCategorias, 'investimento');
  }

  const listaInvHTML = document.getElementById('lista-investimentos');
  if (investimentosDoMes.length === 0) {
    listaInvHTML.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><p>Nenhum investimento registrado neste mês.</p></div>`;
  } else {
    listaInvHTML.innerHTML = investimentosDoMes.map(inv => `
      <div class="p-4 hover:bg-violet-50/50 transition-colors flex items-center justify-between group">
        <div class="flex items-center gap-4">
          <div class="p-3 rounded-full bg-violet-100 text-violet-600">
            <i data-lucide="trending-up" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="font-semibold text-slate-800">${escaparHTML(inv.description)}</h3>
            <div class="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <span class="flex items-center gap-1"><i data-lucide="briefcase" class="w-3 h-3"></i> ${escaparHTML(inv.category)}</span>
              <span>•</span>
              <span>${escaparHTML(formatarData(inv.date))}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1 sm:gap-2" id="acoes-inv-${escaparHTML(inv.id)}">
          <span class="font-bold text-lg mr-2 text-violet-600">
            ${formatarMoeda(inv.amount)}
          </span>
          <button data-click="abrirModalInvestimento" ${argsAttr(inv.id)} class="text-slate-300 hover:text-violet-500 transition-colors p-2" title="Editar investimento">
            <i data-lucide="pencil" class="w-5 h-5"></i>
          </button>
          <button data-click="pedirConfirmacaoDeleteInv" ${argsAttr(inv.id)} class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar investimento">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  renderizarOrcamentos(transacoesDoMes);
  renderizarAvisoVencimentos();
  renderIcons();
}

// --- SISTEMA DE HISTÓRICO E RELATÓRIOS ---
function agruparTransacoes() {
  const agrupado = {};
  // Bug 3 fix: Incluir investimentos no agrupamento do histórico
  const todos = [...transacoes, ...investimentos];
  todos.forEach(t => {
    const [ano, mes] = t.date.split('-');
    if (!agrupado[ano]) agrupado[ano] = new Set();
    agrupado[ano].add(parseInt(mes) - 1);
  });
  return agrupado;
}

window.abrirHistorico = () => {
  document.getElementById('view-pastas').classList.remove('hidden');
  document.getElementById('view-relatorio').classList.add('hidden');
  document.getElementById('view-relatorio').classList.remove('flex');

  const agrupado = agruparTransacoes();
  const anos = Object.keys(agrupado).sort((a, b) => b - a);
  const viewPastas = document.getElementById('view-pastas');

  if (anos.length === 0) {
    viewPastas.innerHTML = `
      <div class="text-center py-10 text-slate-400 flex flex-col items-center">
        <i data-lucide="folder-x" class="w-12 h-12 mb-3 opacity-50"></i>
        <p>Seu histórico está vazio.</p>
        <p class="text-sm mt-1">Registre suas contas para criar pastas anuais.</p>
      </div>`;
  } else {
    viewPastas.innerHTML = anos.map(ano => {
      const mesesDoAno = Array.from(agrupado[ano]).sort((a, b) => a - b);
      return `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <button data-click="toggleAnoHistorico" ${argsAttr(ano)} class="w-full p-4 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="bg-emerald-100 p-2 rounded-xl text-emerald-600"><i data-lucide="folder" class="w-6 h-6"></i></div>
              <span class="text-lg font-bold text-slate-800">Ano ${escaparHTML(ano)}</span>
            </div>
            <i data-lucide="chevron-down" id="icone-ano-${escaparHTML(ano)}" class="w-5 h-5 text-slate-400 transition-transform"></i>
          </button>
          <div id="conteudo-ano-${escaparHTML(ano)}" class="hidden p-4 border-t border-slate-100 bg-slate-50">
            <button data-click="gerarRelatorio" ${argsAttr(ano)} class="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors">
              <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-200"></i> Ver Relatório Anual de ${escaparHTML(ano)}
            </button>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Meses registrados:</p>
            <div class="space-y-2">
              ${mesesDoAno.map(mesIndex => `
                <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-emerald-200 transition-colors">
                  <span class="font-bold text-slate-700">${mesesNomes[mesIndex]}</span>
                  <div class="flex gap-2">
                    <button data-click="gerarRelatorio" ${argsAttr(ano, mesIndex)} class="p-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors" title="Ver Relatório Mensal">
                      <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
                    </button>
                    <button data-click="irParaMesHistorico" ${argsAttr(Number(ano), mesIndex)} class="flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors">
                      Ver Contas
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  abrirModalGenerico('modal-historico');
  renderIcons();
};

window.toggleAnoHistorico = (ano) => {
  const conteudo = document.getElementById(`conteudo-ano-${ano}`);
  const icone = document.getElementById(`icone-ano-${ano}`);
  conteudo.classList.toggle('hidden');
  icone.classList.toggle('rotate-180');
};

window.fecharHistorico = () => { fecharModalGenerico('modal-historico'); };

window.irParaMesHistorico = (ano, mes) => {
  dataVisualizacao.setFullYear(ano);
  dataVisualizacao.setMonth(mes);
  atualizarTela();
  fecharHistorico();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- RELATÓRIO GENÉRICO (Anual ou Mensal) ---
window.gerarRelatorio = (anoStr, mes) => {
  const ano = parseInt(anoStr);
  const isMensal = mes !== undefined;

  let transacoesFiltradas;
  let investimentosFiltrados;
  let titulo;

  if (isMensal) {
    transacoesFiltradas = filtrarListaPorMes(transacoes, ano, mes);
    investimentosFiltrados = filtrarListaPorMes(investimentos, ano, mes);
    titulo = `${mesesNomes[mes]}/${ano}`;
  } else {
    transacoesFiltradas = transacoes.filter(t => t.date.startsWith(anoStr));
    investimentosFiltrados = investimentos.filter(i => i.date.startsWith(anoStr));
    titulo = `${ano}`;
  }

  const resumo = calcularResumo(transacoesFiltradas);
  const resumoInv = calcularResumoInvestimentos(investimentosFiltrados);

  // Bug 4 fix: Incluir investimentos nos cálculos do relatório
  const saidasTotal = resumo.saidas + resumoInv.total;
  const saldoTotal = resumo.entradas - saidasTotal;

  // Montar categorias incluindo investimentos como na tela principal
  const categoriasComInvestimento = { ...resumo.gastosPorCategoria };
  if (resumoInv.total > 0) {
    categoriasComInvestimento['Investimentos'] = (categoriasComInvestimento['Investimentos'] || 0) + resumoInv.total;
  }
  const arrayCategoriasComInv = Object.entries(categoriasComInvestimento)
    .map(([nome, valor]) => ({ nome, valor, pct: saidasTotal > 0 ? (valor / saidasTotal) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const viewRelatorio = document.getElementById('view-relatorio');

  const btnVerContas = isMensal ? `
    <button data-click="irParaMesHistorico" ${argsAttr(ano, mes)} class="w-full bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors mb-2">
      <i data-lucide="list" class="w-5 h-5 text-slate-300"></i> Ver todas as contas deste mês
    </button>` : '';

  const secaoInvestimentos = resumoInv.total > 0 ? `
      <div class="bg-violet-50 p-4 rounded-2xl border border-violet-100 shadow-sm">
        <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="trending-up" class="w-3 h-3 text-violet-500"></i> ${isMensal ? 'Investimentos' : 'Investimentos do Ano'}</p>
        <p class="text-lg font-bold text-violet-600">${formatarMoeda(resumoInv.total)}</p>
      </div>` : '';

  viewRelatorio.innerHTML = `
    <div class="bg-white p-4 border-b border-slate-100 shrink-0 flex items-center justify-between">
      <button data-click="voltarParaPastas" class="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-medium transition-colors">
        <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
      </button>
      <h4 class="font-bold text-slate-800">Resumo de ${titulo}</h4>
      <div class="w-16"></div>
    </div>
    <div class="p-6 space-y-6 bg-slate-50">
      ${btnVerContas}
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="arrow-up-circle" class="w-3 h-3 text-emerald-500"></i> ${isMensal ? 'Entradas' : 'Ganhos do Ano'}</p>
          <p class="text-lg font-bold text-emerald-600">${formatarMoeda(resumo.entradas)}</p>
        </div>
        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="arrow-down-circle" class="w-3 h-3 text-rose-500"></i> ${isMensal ? 'Saídas' : 'Gastos do Ano'}</p>
          <p class="text-lg font-bold text-rose-600">${formatarMoeda(saidasTotal)}</p>
        </div>
      </div>
      ${secaoInvestimentos}
      <div class="bg-slate-800 p-5 rounded-2xl shadow-md text-white">
        <p class="text-sm text-slate-300 mb-1 flex items-center gap-1"><i data-lucide="wallet" class="w-4 h-4 text-emerald-400"></i> ${isMensal ? 'Saldo do Mês' : 'Saldo Final de ' + ano}</p>
        <p class="text-3xl font-bold ${saldoTotal >= 0 ? 'text-white' : 'text-rose-400'}">${formatarMoeda(saldoTotal)}</p>
      </div>
      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <h5 class="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <i data-lucide="pie-chart" class="w-4 h-4 text-slate-400"></i> ${isMensal ? 'Despesas do mês' : 'Maiores despesas do ano'}
        </h5>
        <div class="space-y-4">${renderizarBarrasProgresso(arrayCategoriasComInv, 'gasto')}</div>
      </div>
    </div>`;

  document.getElementById('view-pastas').classList.add('hidden');
  viewRelatorio.classList.remove('hidden');
  viewRelatorio.classList.add('flex');
  // Garante que o conteúdo do relatório sempre começa do topo
  if (viewRelatorio.parentElement) viewRelatorio.parentElement.scrollTop = 0;
  renderIcons();
};

window.voltarParaPastas = () => {
  document.getElementById('view-relatorio').classList.add('hidden');
  document.getElementById('view-relatorio').classList.remove('flex');
  document.getElementById('view-pastas').classList.remove('hidden');
};

// --- SISTEMA DE BACKUP E RESTAURAÇÃO ---
window.fazerBackup = () => {
  const dadosCompletos = {
    meuPerfil: { nome: meuPerfil.nome, foto: meuPerfil.foto },
    configuracoes: { orcamentos, cartoes, metas },
    transacoes_app: transacoes,
    investimentos_app: investimentos,
  };
  const blob = new Blob([JSON.stringify(dadosCompletos, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dataHoje = new Date().toISOString().split('T')[0];

  const link = document.createElement('a');
  link.href = url;
  link.download = `MeuDinheiro_Backup_${dataHoje}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  mostrarToast("Backup exportado com sucesso!");
};

// Restaura o backup na nuvem: cada lançamento é gravado com o mesmo ID do arquivo, então
// restaurar o mesmo backup duas vezes não duplica nada. Nada é apagado.
const ID_FIRESTORE = /^[A-Za-z0-9_-]{1,128}$/;

function limparTransacaoDoBackup(t, uid) {
  const item = { uid, type: t.type, description: t.description, amount: t.amount, category: t.category, date: t.date };
  if (typeof t.pago === 'boolean') item.pago = t.pago;
  if (typeof t.serieId === 'string' && ID_CURTO.test(t.serieId)) item.serieId = t.serieId;
  if (t.recorrente === true) item.recorrente = true;
  if (Number.isInteger(t.parcela) && Number.isInteger(t.parcelas) && t.parcela >= 1 && t.parcela <= t.parcelas && t.parcelas <= 120) {
    item.parcela = t.parcela;
    item.parcelas = t.parcelas;
  }
  if (typeof t.cartaoId === 'string' && ID_CURTO.test(t.cartaoId)) item.cartaoId = t.cartaoId;
  if (typeof t.dataCompra === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dataCompra)) item.dataCompra = t.dataCompra;
  return item;
}

async function gravarEmLotes(colecao, itens) {
  for (let i = 0; i < itens.length; i += 400) {
    const pedaco = itens.slice(i, i + 400);
    const montar = (comIdOriginal) => {
      const lote = writeBatch(db);
      pedaco.forEach(({ id, dados }) => {
        const ref = comIdOriginal && ID_FIRESTORE.test(id) ? doc(db, colecao, id) : doc(collection(db, colecao));
        lote.set(ref, dados);
      });
      return lote.commit();
    };
    try {
      await montar(true);
    } catch (erro) {
      // IDs que já pertencem a outra conta (backup de outra pessoa): grava com IDs novos
      if (erro.code !== 'permission-denied') throw erro;
      await montar(false);
    }
  }
}

async function restaurarBackup(dados) {
  if (!auth.currentUser) {
    mostrarToast('Entre na sua conta antes de restaurar.', 'error');
    return;
  }
  const uid = auth.currentUser.uid;
  const trans = dados.transacoes_app.map(t => ({ id: t.id, dados: limparTransacaoDoBackup(t, uid) }));
  const invs = (dados.investimentos_app || []).map(i => {
    const item = { uid, description: i.description, amount: i.amount, category: i.category, date: i.date };
    if (typeof i.pago === 'boolean') item.pago = i.pago;
    return { id: i.id, dados: item };
  });

  mostrarToast(`Restaurando ${trans.length + invs.length} lançamentos...`, 'info');
  try {
    await gravarEmLotes('transacoes_app', trans);
    await gravarEmLotes('investimentos_app', invs);

    const perfil = {};
    if (dados.meuPerfil) {
      perfil.nome = String(dados.meuPerfil.nome || '').slice(0, 100);
      const foto = dados.meuPerfil.foto;
      if (typeof foto === 'string' && foto.length <= 140000 && FOTO_DATA_URL.test(foto)) perfil.foto = foto;
    }
    if (dados.configuracoes && typeof dados.configuracoes === 'object') {
      perfil.orcamentos = sanitizarOrcamentos(dados.configuracoes.orcamentos);
      perfil.cartoes = sanitizarCartoes(dados.configuracoes.cartoes);
      perfil.metas = sanitizarMetas(dados.configuracoes.metas);
    }
    if (Object.keys(perfil).length) {
      await salvarNoPerfil(perfil);
      if ('nome' in perfil) meuPerfil.nome = perfil.nome;
      if (perfil.foto) meuPerfil.foto = perfil.foto;
      if (perfil.orcamentos) orcamentos = perfil.orcamentos;
      if (perfil.cartoes) cartoes = perfil.cartoes;
      if (perfil.metas) metas = perfil.metas;
      localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
      atualizarDadosPerfilHeader();
    }

    await carregarTransacoes();
    fecharModalConfiguracoes();
    mostrarToast('Backup restaurado com sucesso!');
  } catch {
    // Lotes já gravados ficam salvos; restaurar de novo completa sem duplicar
    mostrarToast('Não foi possível terminar a restauração. Tente novamente.', 'error');
  }
}

window.acionarImportacao = () => { document.getElementById('input-importar').click(); };

window.processarImportacao = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Limite de tamanho de arquivo: 5MB
  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('Arquivo muito grande. Limite: 5MB.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const dados = JSON.parse(e.target.result);

      // Valida estrutura mínima
      if (!dados.transacoes_app || !Array.isArray(dados.transacoes_app)) {
        throw new Error('Formato inválido: campo transacoes_app ausente.');
      }
      if (dados.transacoes_app.length > 10000) {
        throw new Error('Backup muito grande. Máximo de 10.000 transações.');
      }

      // Valida e sanitiza cada transação
      const TIPOS_VALIDOS = ['income', 'expense'];
      dados.transacoes_app.forEach((t, i) => {
        const n = i + 1;
        if (typeof t.id !== 'string' || t.id.length === 0 || t.id.length > 128)
          throw new Error(`Transação ${n}: campo "id" inválido.`);
        if (!TIPOS_VALIDOS.includes(t.type))
          throw new Error(`Transação ${n}: "type" deve ser "income" ou "expense".`);
        if (typeof t.description !== 'string' || t.description.length === 0 || t.description.length > 300)
          throw new Error(`Transação ${n}: "description" inválida (máx 300 chars).`);
        if (typeof t.amount !== 'number' || t.amount <= 0 || t.amount > 10000000)
          throw new Error(`Transação ${n}: "amount" deve ser um número positivo (máx 10.000.000).`);
        if (typeof t.category !== 'string' || t.category.length === 0 || t.category.length > 100)
          throw new Error(`Transação ${n}: "category" inválida (máx 100 chars).`);
        if (typeof t.date !== 'string' || t.date.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(t.date))
          throw new Error(`Transação ${n}: "date" inválida. Use formato YYYY-MM-DD.`);
        if (t.pago !== undefined && typeof t.pago !== 'boolean')
          throw new Error(`Transação ${n}: "pago" deve ser um valor booleano.`);
      });

      // Valida investimentos (se presentes)
      if (dados.investimentos_app !== undefined) {
        if (!Array.isArray(dados.investimentos_app)) {
          throw new Error('Campo investimentos_app inválido.');
        }
        if (dados.investimentos_app.length > 5000) {
          throw new Error('Backup muito grande. Máximo de 5.000 investimentos.');
        }
        dados.investimentos_app.forEach((inv, i) => {
          const n = i + 1;
          if (typeof inv.id !== 'string' || inv.id.length === 0 || inv.id.length > 128)
            throw new Error(`Investimento ${n}: campo "id" inválido.`);
          if (typeof inv.description !== 'string' || inv.description.length === 0 || inv.description.length > 300)
            throw new Error(`Investimento ${n}: "description" inválida (máx 300 chars).`);
          if (typeof inv.amount !== 'number' || inv.amount <= 0 || inv.amount > 10000000)
            throw new Error(`Investimento ${n}: "amount" deve ser número positivo (máx 10.000.000).`);
          if (typeof inv.category !== 'string' || inv.category.length === 0 || inv.category.length > 100)
            throw new Error(`Investimento ${n}: "category" inválida (máx 100 chars).`);
          if (typeof inv.date !== 'string' || inv.date.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(inv.date))
            throw new Error(`Investimento ${n}: "date" inválida. Use formato YYYY-MM-DD.`);
          if (inv.pago !== undefined && typeof inv.pago !== 'boolean')
            throw new Error(`Investimento ${n}: "pago" deve ser um valor booleano.`);
        });
      }

      // Valida perfil (se presente)
      if (dados.meuPerfil !== undefined) {
        const p = dados.meuPerfil;
        if (typeof p !== 'object' || p === null) throw new Error('Campo meuPerfil inválido.');
        if (p.nome !== undefined && (typeof p.nome !== 'string' || p.nome.length > 100))
          throw new Error('meuPerfil.nome inválido (máx 100 chars).');
        if (p.telefone !== undefined && (typeof p.telefone !== 'string' || p.telefone.length > 30))
          throw new Error('meuPerfil.telefone inválido (máx 30 chars).');
      }

      // Só chega aqui se todos os dados são válidos
      restaurarBackup(dados);
    } catch (erro) {
      // Mensagem de erro da validação interna é segura de exibir
      mostrarToast('Erro ao restaurar: ' + erro.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
};

// ==========================================
// PERFIL: ORÇAMENTO, CARTÕES E METAS
// ==========================================
// Ficam no documento do usuário em usuarios_app. Tudo que vem de lá é normalizado
// antes de usar e escapado ao exibir (as regras do Firestore validam só o formato geral).

const CATEGORIAS_ORCAMENTO = CATEGORIAS_SAIDA.filter(c => c !== 'Investimentos');
const ID_CURTO = /^[A-Za-z0-9_-]{1,40}$/;

function sanitizarOrcamentos(m) {
  const r = {};
  if (m && typeof m === 'object') {
    CATEGORIAS_ORCAMENTO.forEach(c => {
      if (typeof m[c] === 'number' && m[c] > 0 && m[c] <= 10000000) r[c] = m[c];
    });
  }
  return r;
}

function sanitizarCartoes(lista) {
  const diaValido = d => Number.isInteger(d) && d >= 1 && d <= 28;
  return (Array.isArray(lista) ? lista : [])
    .filter(c => c && typeof c.id === 'string' && ID_CURTO.test(c.id) && typeof c.nome === 'string'
      && c.nome.trim() && diaValido(c.fechamento) && diaValido(c.vencimento))
    .slice(0, 10)
    .map(c => ({ id: c.id, nome: c.nome.slice(0, 40), fechamento: c.fechamento, vencimento: c.vencimento }));
}

function sanitizarMetas(lista) {
  const valor = v => typeof v === 'number' && v >= 0 && v <= 10000000;
  return (Array.isArray(lista) ? lista : [])
    .filter(m => m && typeof m.id === 'string' && ID_CURTO.test(m.id) && typeof m.nome === 'string'
      && m.nome.trim() && valor(m.alvo) && m.alvo > 0 && valor(m.guardado))
    .slice(0, 30)
    .map(m => ({
      id: m.id, nome: m.nome.slice(0, 60), alvo: m.alvo, guardado: m.guardado,
      prazo: typeof m.prazo === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.prazo) ? m.prazo : ''
    }));
}

/** Grava campos no perfil. updateDoc substitui o campo inteiro (um orçamento apagado some de verdade). */
async function salvarNoPerfil(campos) {
  if (!auth.currentUser) throw new Error('sem sessão');
  await updateDoc(doc(db, 'usuarios_app', auth.currentUser.uid), campos);
}

function nomeDoCartao(id) {
  return cartoes.find(c => c.id === id)?.nome || 'Cartão removido';
}

// ==========================================
// ORÇAMENTO POR CATEGORIA
// ==========================================

/** Gastos do mês por categoria (pagos e pendentes); categorias próprias contam em "Outros" */
function gastosParaOrcamento(lista) {
  const gastos = {};
  lista.filter(t => t.type === 'expense').forEach(t => {
    const cat = CATEGORIAS_ORCAMENTO.includes(t.category) ? t.category : 'Outros';
    gastos[cat] = (gastos[cat] || 0) + t.amount;
  });
  return gastos;
}

function renderizarOrcamentos(transacoesDoMes) {
  const el = document.getElementById('lista-orcamentos');
  const cats = CATEGORIAS_ORCAMENTO.filter(c => orcamentos[c]);
  if (cats.length === 0) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const gastos = gastosParaOrcamento(transacoesDoMes);
  el.innerHTML = `<h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider pt-4 border-t border-slate-100">Orçamento do mês</h3>` +
    cats.map(c => {
      const gasto = gastos[c] || 0;
      const limite = orcamentos[c];
      const pct = (gasto / limite) * 100;
      const cor = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
      const texto = pct >= 100
        ? `<span class="text-rose-600 font-semibold">passou ${formatarMoeda(gasto - limite)}</span>`
        : `<span class="text-slate-500">resta ${formatarMoeda(limite - gasto)}</span>`;
      return `
        <div class="space-y-1">
          <div class="flex justify-between text-sm gap-2">
            <span class="font-medium text-slate-700">${escaparHTML(c)}</span>
            <span class="text-slate-500 text-xs text-right">${formatarMoeda(gasto)} de ${formatarMoeda(limite)} · ${texto}</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2">
            <div class="h-2 rounded-full ${cor}" style="width: ${Math.min(Math.max(pct, 2), 100)}%"></div>
          </div>
        </div>`;
    }).join('');
  el.classList.remove('hidden');
}

/** Aviso ao lançar um gasto que leva a categoria a 80% ou além do orçamento */
function avisarOrcamento(categoria, dataStr) {
  const cat = CATEGORIAS_ORCAMENTO.includes(categoria) ? categoria : 'Outros';
  const limite = orcamentos[cat];
  if (!limite) return;
  const [ano, mes] = dataStr.split('-').map(Number);
  const gasto = gastosParaOrcamento(filtrarListaPorMes(transacoes, ano, mes - 1))[cat] || 0;
  if (gasto > limite) {
    mostrarToast(`Você passou do orçamento de ${cat}: ${formatarMoeda(gasto)} de ${formatarMoeda(limite)}.`, 'error');
  } else if (gasto >= limite * 0.8) {
    mostrarToast(`Atenção: já usou ${Math.round((gasto / limite) * 100)}% do orçamento de ${cat}.`, 'info');
  }
}

window.abrirOrcamento = () => {
  document.getElementById('campos-orcamento').innerHTML = CATEGORIAS_ORCAMENTO.map((c, i) => `
    <div class="flex items-center gap-3">
      <label for="orc-${i}" class="flex-1 text-sm font-medium text-slate-700">${escaparHTML(c)}</label>
      <div class="relative w-40">
        <span class="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
        <input type="number" id="orc-${i}" data-categoria="${escaparHTML(c)}" min="0" max="10000000" step="0.01"
          value="${orcamentos[c] ?? ''}" placeholder="—"
          class="w-full border-slate-200 border rounded-xl pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800">
      </div>
    </div>`).join('');
  abrirModalGenerico('modal-orcamento');
};

window.fecharOrcamento = () => { fecharModalGenerico('modal-orcamento'); };

document.getElementById('form-orcamento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const novo = {};
  document.querySelectorAll('#campos-orcamento input[data-categoria]').forEach(input => {
    const v = parseFloat(input.value);
    if (CATEGORIAS_ORCAMENTO.includes(input.dataset.categoria) && v > 0 && v <= 10000000) {
      novo[input.dataset.categoria] = Math.round(v * 100) / 100;
    }
  });
  try {
    await salvarNoPerfil({ orcamentos: novo });
    orcamentos = novo;
    fecharOrcamento();
    atualizarTela();
    mostrarToast('Orçamento salvo!');
  } catch {
    mostrarToast('Erro ao salvar o orçamento. Tente novamente.', 'error');
  }
});

// ==========================================
// LEMBRETES DE CONTAS A VENCER
// ==========================================

function renderizarAvisoVencimentos() {
  const el = document.getElementById('aviso-vencimentos');
  const hojeStr = obterDataFormatada(new Date());
  const limite = new Date();
  limite.setDate(limite.getDate() + 3);
  const limiteStr = obterDataFormatada(limite);

  // Compras no cartão aparecem agrupadas como uma fatura
  const grupos = {};
  transacoes
    .filter(t => t.type === 'expense' && t.pago === false && t.date <= limiteStr)
    .forEach(t => {
      const chave = t.cartaoId ? `cartao:${t.cartaoId}:${t.date}` : `conta:${t.id}`;
      if (!grupos[chave]) grupos[chave] = { nome: t.cartaoId ? `Fatura ${nomeDoCartao(t.cartaoId)}` : t.description, date: t.date, amount: 0 };
      grupos[chave].amount += t.amount;
    });
  const itens = Object.values(grupos).sort((a, b) => a.date.localeCompare(b.date));
  if (itens.length === 0) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const vencidas = itens.filter(i => i.date < hojeStr).length;
  const total = itens.reduce((s, i) => s + i.amount, 0);
  const titulo = vencidas > 0
    ? `${vencidas} conta${vencidas > 1 ? 's' : ''} vencida${vencidas > 1 ? 's' : ''}${itens.length > vencidas ? ` e ${itens.length - vencidas} vencendo em breve` : ''}`
    : `${itens.length} conta${itens.length > 1 ? 's' : ''} vencendo nos próximos 3 dias`;
  const cores = vencidas > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-amber-50 border-amber-200 text-amber-800';

  el.className = `rounded-2xl border p-4 shadow-sm ${cores}`;
  el.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3">
        <i data-lucide="alarm-clock" class="w-5 h-5 shrink-0 mt-0.5"></i>
        <div>
          <p class="font-bold text-sm">${titulo} · ${formatarMoeda(total)}</p>
          <ul class="text-xs mt-1 space-y-0.5 opacity-90">
            ${itens.slice(0, 4).map(i => `<li>${i.date < hojeStr ? 'Venceu' : i.date === hojeStr ? 'Vence hoje' : 'Vence'} ${i.date === hojeStr ? '' : escaparHTML(formatarData(i.date))} — ${escaparHTML(i.nome)}: ${formatarMoeda(i.amount)}</li>`).join('')}
            ${itens.length > 4 ? `<li>e mais ${itens.length - 4}...</li>` : ''}
          </ul>
        </div>
      </div>
      <button data-click="abrirProjecaoFluxo" class="shrink-0 text-xs font-bold underline whitespace-nowrap">Ver tudo</button>
    </div>`;
}

// ==========================================
// BUSCA E FILTROS
// ==========================================

const semAcento = s => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

window.abrirBusca = () => {
  const select = document.getElementById('busca-categoria');
  const atual = select.value;
  const categorias = [...new Set([...transacoes, ...investimentos].map(t => t.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="">Todas</option>' + categorias.map(c => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join('');
  select.value = categorias.includes(atual) ? atual : '';
  executarBusca();
  abrirModalGenerico('modal-busca');
  renderIcons();
  document.getElementById('busca-texto').focus();
};

window.fecharBusca = () => { fecharModalGenerico('modal-busca'); };

window.irParaMesDaBusca = (ano, mes) => {
  fecharBusca();
  irParaMesHistorico(ano, mes);
};

function executarBusca() {
  const texto = semAcento(document.getElementById('busca-texto').value.trim());
  const tipo = document.getElementById('busca-tipo').value;
  const categoria = document.getElementById('busca-categoria').value;
  const status = document.getElementById('busca-status').value;
  const de = document.getElementById('busca-de').value;
  const ate = document.getElementById('busca-ate').value;
  const min = parseFloat(document.getElementById('busca-min').value);

  const todos = [
    ...transacoes.map(t => ({ ...t, isInvestimento: false })),
    ...investimentos.map(i => ({ ...i, isInvestimento: true })),
  ];
  const resultado = todos.filter(t =>
    (!texto || semAcento(t.description).includes(texto)) &&
    (!tipo || (tipo === 'investimento' ? t.isInvestimento : !t.isInvestimento && t.type === tipo)) &&
    (!categoria || t.category === categoria) &&
    (!status || (status === 'pendente' ? t.pago === false : t.pago !== false)) &&
    (!de || t.date >= de) &&
    (!ate || t.date <= ate) &&
    (isNaN(min) || t.amount >= min)
  ).sort((a, b) => b.date.localeCompare(a.date));

  const entradas = resultado.filter(t => !t.isInvestimento && t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const saidas = resultado.filter(t => t.isInvestimento || t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  document.getElementById('busca-resumo').innerHTML = resultado.length === 0
    ? 'Nenhum lançamento encontrado.'
    : `<strong>${resultado.length}</strong> lançamento${resultado.length > 1 ? 's' : ''} · entradas <strong class="text-emerald-600">${formatarMoeda(entradas)}</strong> · saídas <strong class="text-rose-600">${formatarMoeda(saidas)}</strong>`;

  const LIMITE = 200;
  document.getElementById('busca-resultados').innerHTML = resultado.slice(0, LIMITE).map(t => {
    const [ano, mes] = t.date.split('-').map(Number);
    const cor = t.isInvestimento ? 'text-violet-600' : t.type === 'income' ? 'text-emerald-600' : 'text-rose-600';
    const sinal = t.isInvestimento || t.type === 'expense' ? '-' : '+';
    return `
      <div class="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
        <div class="min-w-0">
          <p class="font-semibold text-slate-800 truncate">${escaparHTML(t.description)}
            ${t.pago === false ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded ml-1">Pendente</span>' : ''}</p>
          <p class="text-xs text-slate-500 mt-0.5">${escaparHTML(formatarData(t.date))} · ${escaparHTML(t.category)}${t.isInvestimento ? ' · Investimento' : ''}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="font-bold ${cor}">${sinal}${formatarMoeda(t.amount)}</span>
          <button data-click="irParaMesDaBusca" ${argsAttr(ano, mes - 1)} class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">Ver mês</button>
        </div>
      </div>`;
  }).join('') + (resultado.length > LIMITE ? `<p class="p-4 text-center text-xs text-slate-500">Mostrando os ${LIMITE} mais recentes. Use os filtros para refinar.</p>` : '');
}

// Só 'input' (selects e datas também disparam): um 'change' no blur redesenharia a lista
// entre o mousedown e o mouseup e engoliria o clique em "Ver mês"
document.getElementById('form-busca').addEventListener('input', executarBusca);
document.getElementById('form-busca').addEventListener('submit', (e) => e.preventDefault());

// ==========================================
// CARTÕES DE CRÉDITO E FATURAS
// ==========================================

let cartaoEmRemocao = null;

window.abrirCartoes = () => {
  cartaoEmRemocao = null;
  renderizarCartoes();
  abrirModalGenerico('modal-cartoes');
  renderIcons();
};

window.fecharCartoes = () => { fecharModalGenerico('modal-cartoes'); };

function renderizarCartoes() {
  const el = document.getElementById('lista-cartoes');
  if (cartoes.length === 0) {
    el.innerHTML = '<p class="text-center text-sm text-slate-400 py-2">Nenhum cartão cadastrado ainda.</p>';
    return;
  }
  const hojeStr = obterDataFormatada(new Date());
  el.innerHTML = cartoes.map(c => {
    // Faturas em aberto: compras pendentes agrupadas pela data de vencimento
    const faturas = {};
    transacoes.filter(t => t.cartaoId === c.id && t.pago === false).forEach(t => {
      faturas[t.date] = (faturas[t.date] || 0) + t.amount;
    });
    const datas = Object.keys(faturas).sort();
    const removendo = cartaoEmRemocao === c.id;
    return `
      <div class="rounded-2xl border border-slate-200 overflow-hidden">
        <div class="p-4 bg-slate-800 text-white flex items-center justify-between gap-2">
          <div>
            <p class="font-bold flex items-center gap-2"><i data-lucide="credit-card" class="w-4 h-4 text-emerald-400"></i> ${escaparHTML(c.nome)}</p>
            <p class="text-xs text-slate-300 mt-0.5">Fecha dia ${Number(c.fechamento)} · vence dia ${Number(c.vencimento)}</p>
          </div>
          <button data-click="removerCartao" ${argsAttr(c.id)} class="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors ${removendo ? 'bg-rose-600 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}">
            ${removendo ? 'Confirmar remoção' : 'Remover'}
          </button>
        </div>
        ${removendo ? '<p class="px-4 pt-3 text-xs text-rose-600">As compras já lançadas continuam no histórico.</p>' : ''}
        <div class="divide-y divide-slate-100">
          ${datas.length === 0 ? '<p class="p-4 text-sm text-slate-400">Nenhuma fatura em aberto.</p>' : datas.slice(0, 6).map(d => `
            <div class="p-4 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-slate-800">Fatura de ${mesesNomes[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}</p>
                <p class="text-xs ${d < hojeStr ? 'text-rose-600 font-semibold' : 'text-slate-500'}">${d < hojeStr ? 'Venceu' : 'Vence'} em ${escaparHTML(formatarData(d))}</p>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-bold text-rose-600">${formatarMoeda(faturas[d])}</span>
                <button data-click="pagarFatura" ${argsAttr(c.id, d)} class="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg transition-colors">Paguei</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

document.getElementById('form-cartao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('cartao-nome').value.trim().slice(0, 40);
  const fechamento = parseInt(document.getElementById('cartao-fechamento').value, 10);
  const vencimento = parseInt(document.getElementById('cartao-vencimento').value, 10);
  const diaValido = d => Number.isInteger(d) && d >= 1 && d <= 28;
  if (!nome || !diaValido(fechamento) || !diaValido(vencimento)) {
    mostrarToast('Preencha o nome e dias de 1 a 28.', 'error');
    return;
  }
  if (cartoes.length >= 10) { mostrarToast('Limite de 10 cartões.', 'error'); return; }
  const novos = [...cartoes, { id: gerarIdCurto(), nome, fechamento, vencimento }];
  try {
    await salvarNoPerfil({ cartoes: novos });
    cartoes = novos;
    e.target.reset();
    renderizarCartoes();
    renderIcons();
    mostrarToast('Cartão salvo! Escolha ele em "Como pagou?" ao lançar um gasto.');
  } catch {
    mostrarToast('Erro ao salvar o cartão. Tente novamente.', 'error');
  }
});

window.removerCartao = async (id) => {
  if (cartaoEmRemocao !== id) {
    cartaoEmRemocao = id;
    renderizarCartoes();
    renderIcons();
    return;
  }
  const novos = cartoes.filter(c => c.id !== id);
  try {
    await salvarNoPerfil({ cartoes: novos });
    cartoes = novos;
    cartaoEmRemocao = null;
    renderizarCartoes();
    renderIcons();
    atualizarTela();
    mostrarToast('Cartão removido.', 'info');
  } catch {
    mostrarToast('Erro ao remover o cartão. Tente novamente.', 'error');
  }
};

window.pagarFatura = async (cartaoId, data) => {
  const itens = transacoes.filter(t => t.cartaoId === cartaoId && t.date === data && t.pago === false);
  if (itens.length === 0) return;
  try {
    for (let i = 0; i < itens.length; i += 500) {
      const lote = writeBatch(db);
      itens.slice(i, i + 500).forEach(t => lote.update(doc(db, 'transacoes_app', t.id), { pago: true }));
      await lote.commit();
    }
    itens.forEach(t => { t.pago = true; });
    renderizarCartoes();
    renderIcons();
    atualizarTela();
    mostrarToast('Fatura marcada como paga!');
  } catch {
    mostrarToast('Erro ao pagar a fatura. Tente novamente.', 'error');
  }
};

// ==========================================
// METAS DE ECONOMIA
// ==========================================

let metaEmExclusao = null;

window.abrirMetas = () => {
  metaEmExclusao = null;
  renderizarMetas();
  abrirModalGenerico('modal-metas');
  renderIcons();
};

window.fecharMetas = () => { fecharModalGenerico('modal-metas'); };

function renderizarMetas() {
  const el = document.getElementById('lista-metas');
  if (metas.length === 0) {
    el.innerHTML = '<p class="text-center text-sm text-slate-400 py-2">Nenhuma meta ainda. Crie a primeira abaixo.</p>';
    return;
  }
  const agora = new Date();
  el.innerHTML = metas.map(m => {
    const pct = Math.min((m.guardado / m.alvo) * 100, 100);
    const falta = Math.max(m.alvo - m.guardado, 0);
    let plano = '';
    if (falta === 0) {
      plano = '<span class="text-emerald-600 font-semibold">Meta atingida! 🎉</span>';
    } else if (m.prazo) {
      const [pa, pm] = m.prazo.split('-').map(Number);
      const meses = (pa - agora.getFullYear()) * 12 + (pm - 1 - agora.getMonth()) + 1;
      plano = meses > 0
        ? `Guarde ${formatarMoeda(falta / meses)} por mês até ${String(pm).padStart(2, '0')}/${pa}`
        : '<span class="text-rose-600 font-semibold">O prazo acabou</span>';
    } else {
      plano = `Faltam ${formatarMoeda(falta)}`;
    }
    const excluindo = metaEmExclusao === m.id;
    return `
      <div class="rounded-2xl border border-slate-200 p-4 space-y-3">
        <div class="flex justify-between items-start gap-2">
          <div>
            <p class="font-bold text-slate-800">${escaparHTML(m.nome)}</p>
            <p class="text-xs text-slate-500 mt-0.5">${plano}</p>
          </div>
          <button data-click="excluirMeta" ${argsAttr(m.id)} class="text-xs font-bold px-2 py-1 rounded-lg transition-colors ${excluindo ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-rose-600'}">
            ${excluindo ? 'Confirmar exclusão' : 'Excluir'}
          </button>
        </div>
        <div>
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span>${formatarMoeda(m.guardado)} de ${formatarMoeda(m.alvo)}</span>
            <span class="font-semibold text-emerald-600">${pct.toFixed(0)}%</span>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-2.5">
            <div class="h-2.5 rounded-full bg-emerald-500" style="width: ${Math.max(pct, 2)}%"></div>
          </div>
        </div>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <span class="absolute left-3 top-2 text-slate-400 text-sm">R$</span>
            <input type="number" id="meta-valor-${escaparHTML(m.id)}" min="0.01" step="0.01" placeholder="Valor" aria-label="Valor para ${escaparHTML(m.nome)}"
              class="w-full border-slate-200 border rounded-xl pl-10 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800">
          </div>
          <button data-click="movimentarMeta" ${argsAttr(m.id, 1)} class="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 rounded-xl transition-colors">Guardar</button>
          <button data-click="movimentarMeta" ${argsAttr(m.id, -1)} class="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 rounded-xl transition-colors">Retirar</button>
        </div>
      </div>`;
  }).join('');
}

async function salvarMetas(novas, mensagem) {
  try {
    await salvarNoPerfil({ metas: novas });
    metas = novas;
    renderizarMetas();
    renderIcons();
    if (mensagem) mostrarToast(mensagem);
    return true;
  } catch {
    mostrarToast('Erro ao salvar a meta. Tente novamente.', 'error');
    return false;
  }
}

document.getElementById('form-meta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('meta-nome').value.trim().slice(0, 60);
  const alvo = Math.round(parseFloat(document.getElementById('meta-alvo').value) * 100) / 100;
  const prazo = document.getElementById('meta-prazo').value;
  if (!nome || !(alvo > 0) || alvo > 10000000) { mostrarToast('Preencha o nome e o valor da meta.', 'error'); return; }
  if (metas.length >= 30) { mostrarToast('Limite de 30 metas.', 'error'); return; }
  const nova = { id: gerarIdCurto(), nome, alvo, guardado: 0, prazo: /^\d{4}-(0[1-9]|1[0-2])$/.test(prazo) ? prazo : '' };
  if (await salvarMetas([...metas, nova], 'Meta criada!')) e.target.reset();
});

window.movimentarMeta = async (id, sinal) => {
  const meta = metas.find(m => m.id === id);
  const input = document.getElementById(`meta-valor-${id}`);
  const valor = Math.round(parseFloat(input?.value) * 100) / 100;
  if (!meta || !(valor > 0)) { mostrarToast('Digite um valor.', 'error'); return; }
  const guardado = Math.min(Math.max(Math.round((meta.guardado + sinal * valor) * 100) / 100, 0), 10000000);
  const novas = metas.map(m => m.id === id ? { ...m, guardado } : m);
  await salvarMetas(novas, sinal > 0 ? `${formatarMoeda(valor)} guardados em ${meta.nome}!` : `${formatarMoeda(valor)} retirados de ${meta.nome}.`);
};

window.excluirMeta = async (id) => {
  if (metaEmExclusao !== id) {
    metaEmExclusao = id;
    renderizarMetas();
    renderIcons();
    return;
  }
  metaEmExclusao = null;
  await salvarMetas(metas.filter(m => m.id !== id), 'Meta excluída.');
};

// ==========================================
// APP INSTALÁVEL (PWA)
// ==========================================

let eventoInstalacao = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacao = e;
  atualizarSecaoInstalar();
});

window.addEventListener('appinstalled', () => {
  eventoInstalacao = null;
  atualizarSecaoInstalar();
});

function atualizarSecaoInstalar() {
  const secao = document.getElementById('secao-instalar');
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (instalado || (!eventoInstalacao && !ios)) { secao.classList.add('hidden'); return; }
  document.getElementById('btn-instalar').classList.toggle('hidden', !eventoInstalacao);
  document.getElementById('instalar-texto').textContent = eventoInstalacao
    ? 'Coloque o Meu Dinheiro na tela inicial e abra como um aplicativo.'
    : 'No iPhone: abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".';
  secao.classList.remove('hidden');
}

window.instalarApp = async () => {
  if (!eventoInstalacao) return;
  eventoInstalacao.prompt();
  await eventoInstalacao.userChoice.catch(() => {});
  eventoInstalacao = null;
  atualizarSecaoInstalar();
};

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
  atualizarDadosPerfilHeader();
  aplicarTemaEscuro();
  atualizarSecaoInstalar();
  inicializarNotificacoes();
  renderIcons();
});


// ==========================================
// SISTEMA DE NOTIFICAÇÕES (NATIVE IN-APP)
// ==========================================

function inicializarNotificacoes() {
  const container = document.getElementById('lista-notificacoes');
  const badge = document.getElementById('badge-notificacao');
  if (!container) return;
  
  container.innerHTML = `
    <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col gap-3 transition-colors hover:shadow-md">
      <div class="flex items-center gap-3">
        <div class="p-3 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
          <i data-lucide="sparkles" class="w-6 h-6"></i>
        </div>
        <div>
          <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">Super Atualização! 🚀</h4>
          <span class="text-xs text-slate-400">28 de Junho de 2026</span>
        </div>
      </div>
      
      <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
        Preparamos novidades incríveis para levar sua gestão financeira a outro nível:
      </p>
      
      <ul class="text-xs text-slate-500 dark:text-slate-400 space-y-2 mt-1">
        <li class="flex items-start gap-2">
          <span class="text-emerald-500 font-bold mt-0.5">•</span>
          <div>
            <strong class="text-slate-700 dark:text-slate-300">📈 Fluxo de Caixa:</strong>
            Visualize a previsão do seu saldo até o fim do mês ou trimestre com gráfico de linha interativo!
          </div>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-emerald-500 font-bold mt-0.5">•</span>
          <div>
            <strong class="text-slate-700 dark:text-slate-300">⏳ Flag Pago/Pendente:</strong>
            Marque contas como pendentes ou pagas. Contas não-pagas não afetam o saldo real até serem consolidadas!
          </div>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-emerald-500 font-bold mt-0.5">•</span>
          <div>
            <strong class="text-slate-700 dark:text-slate-300">🌙 Modo Escuro Premium:</strong>
            Ative o tema noturno sofisticado nas Configurações para maior conforto visual.
          </div>
        </li>
      </ul>
      
      <button data-click="abrirProjecaoDaNotificacao" 
        class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mt-2">
        <i data-lucide="line-chart" class="w-3.5 h-3.5"></i> Testar Fluxo de Caixa
      </button>
    </div>
  `;
  
  // Re-renderizar ícones Lucide dentro do card injetado
  renderIcons();
  
  const jaLida = localStorage.getItem('notif_lida_v2') === 'true';
  if (!jaLida && badge) {
    badge.classList.remove('hidden');
  }
}

window.abrirModalNotificacoes = () => {
  const modal = document.getElementById('modal-notificacoes');
  const panel = document.getElementById('notif-panel');
  modal.classList.remove('hidden');
  void modal.offsetWidth;
  panel.classList.remove('translate-x-full');
  
  const badge = document.getElementById('badge-notificacao');
  if (badge) badge.classList.add('hidden');
  localStorage.setItem('notif_lida_v2', 'true');
};

window.fecharModalNotificacoes = () => {
  const modal = document.getElementById('modal-notificacoes');
  const panel = document.getElementById('notif-panel');
  panel.classList.add('translate-x-full');
  setTimeout(() => modal.classList.add('hidden'), 300);
};

window.abrirProjecaoDaNotificacao = () => {
  fecharModalNotificacoes();
  abrirProjecaoFluxo();
};

// ==========================================
// SISTEMA DE PROJEÇÃO DE FLUXO DE CAIXA
// ==========================================

let projecaoChartInstance = null;

// Helper: Formata data curta DD/MM
function formatarDataCurta(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

// Helper: Formata YYYY-MM-DD
function obterDataFormatada(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper: Calcula saldo consolidado até hoje (passado + hoje, apenas pagos)
function obterSaldoAteHoje() {
  const limiteHoje = new Date();
  limiteHoje.setHours(23, 59, 59, 999);
  
  const anoHoje = limiteHoje.getFullYear();
  const mesHoje = limiteHoje.getMonth();
  
  // Sobra acumulada dos meses anteriores
  let sobraAnterior = 0;
  if (sobraAutomaticaAtiva) {
    const ant = mesAnterior(anoHoje, mesHoje);
    sobraAnterior = calcularSobraDoMes(ant.ano, ant.mes);
  }
  
  // Filtrar pagos do próprio mês até o limite do dia de hoje (fim do dia)
  const transacoesHoje = filtrarListaPorMes(transacoes, anoHoje, mesHoje)
    .filter(t => t.pago !== false && new Date(t.date + 'T00:00:00') <= limiteHoje);
  const investimentosHoje = filtrarListaPorMes(investimentos, anoHoje, mesHoje)
    .filter(i => i.pago !== false && new Date(i.date + 'T00:00:00') <= limiteHoje);
    
  const r = calcularResumo(transacoesHoje);
  const rInv = calcularResumoInvestimentos(investimentosHoje);
  
  return (r.entradas + sobraAnterior) - (r.saidas + rInv.total);
}

window.abrirProjecaoFluxo = () => {
  document.getElementById('proj-periodo').value = 'mes';
  calcularProjecaoFluxo('mes');
  abrirModalGenerico('modal-projecao-fluxo');
};

window.fecharProjecaoFluxo = () => {
  fecharModalGenerico('modal-projecao-fluxo');
  if (projecaoChartInstance) {
    projecaoChartInstance.destroy();
    projecaoChartInstance = null;
  }
};

window.selecionarPeriodoProjecao = (periodo) => {
  calcularProjecaoFluxo(periodo);
};

window.calcularProjecaoFluxo = (periodo) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  
  const stringHoje = obterDataFormatada(hoje);
  const limiteHoje = new Date();
  limiteHoje.setHours(23, 59, 59, 999);
  
  // 1. Calcular Saldo Inicial (consolidado até hoje)
  const saldoAtual = obterSaldoAteHoje();
  document.getElementById('proj-saldo-atual').innerText = formatarMoeda(saldoAtual);
  
  // 2. Determinar fim do período de projeção
  let fimPeriodo = new Date(hoje);
  if (periodo === 'mes') {
    // Último dia do mês atual
    fimPeriodo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  } else {
    // 90 dias a partir de hoje
    fimPeriodo.setDate(hoje.getDate() + 90);
  }
  fimPeriodo.setHours(23, 59, 59, 999);
  
  // 3. Otimização: Hash Map de transações futuras/pendentes agrupadas por data O(1)
  const transacoesAgrupadas = {};
  let totalReceber = 0;
  let totalPagar = 0;
  const listaAgendamentos = [];
  
  transacoes.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    
    const isPendente = t.pago === false;
    const isFutura = d > limiteHoje;
    
    if (isPendente || isFutura) {
      if (t.type === 'income') totalReceber += t.amount;
      else totalPagar += t.amount;
      
      listaAgendamentos.push({ ...t, isInvestimento: false });
      
      // Overdue (pendentes no passado) são contabilizadas em "hoje" na projeção para impacto imediato
      const chave = d < limiteHoje ? stringHoje : t.date;
      if (!transacoesAgrupadas[chave]) {
        transacoesAgrupadas[chave] = [];
      }
      transacoesAgrupadas[chave].push({ ...t, isInvestimento: false });
    }
  });
  
  investimentos.forEach(inv => {
    const d = new Date(inv.date + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    
    const isPendente = inv.pago === false;
    const isFuturo = d > limiteHoje;
    
    if (isPendente || isFuturo) {
      totalPagar += inv.amount;
      listaAgendamentos.push({ ...inv, isInvestimento: true });
      
      const chave = d < limiteHoje ? stringHoje : inv.date;
      if (!transacoesAgrupadas[chave]) {
        transacoesAgrupadas[chave] = [];
      }
      transacoesAgrupadas[chave].push({ ...inv, isInvestimento: true });
    }
  });
  
  // Atualizar cards de resumo adicionais
  document.getElementById('proj-total-receber').innerText = formatarMoeda(totalReceber);
  document.getElementById('proj-total-pagar').innerText = formatarMoeda(totalPagar);
  const saldoFinalProjetado = saldoAtual + totalReceber - totalPagar;
  document.getElementById('proj-saldo-final').innerText = formatarMoeda(saldoFinalProjetado);
  
  // 4. Executar simulação diária com busca O(1) no dicionário
  const labels = [];
  const valoresProjetados = [];
  let saldoSimulado = saldoAtual;
  
  const dataCursor = new Date(hoje);
  dataCursor.setHours(0, 0, 0, 0);
  
  // Ponto inicial: Hoje
  labels.push(formatarDataCurta(dataCursor));
  
  // Aplicar transações do próprio dia de hoje (inclui as passadas pendentes reagrupadas)
  const chaveHoje = obterDataFormatada(dataCursor);
  if (transacoesAgrupadas[chaveHoje]) {
    transacoesAgrupadas[chaveHoje].forEach(item => {
      if (item.isInvestimento) {
        saldoSimulado -= item.amount;
      } else {
        if (item.type === 'income') saldoSimulado += item.amount;
        else saldoSimulado -= item.amount;
      }
    });
  }
  valoresProjetados.push(saldoSimulado);
  
  // Simular dia a dia
  while (dataCursor < fimPeriodo) {
    dataCursor.setDate(dataCursor.getDate() + 1);
    
    const chaveData = obterDataFormatada(dataCursor);
    if (transacoesAgrupadas[chaveData]) {
      transacoesAgrupadas[chaveData].forEach(item => {
        if (item.isInvestimento) {
          saldoSimulado -= item.amount;
        } else {
          if (item.type === 'income') saldoSimulado += item.amount;
          else saldoSimulado -= item.amount;
        }
      });
    }
    
    labels.push(formatarDataCurta(dataCursor));
    valoresProjetados.push(saldoSimulado);
  }
  
  // 5. Renderizar o gráfico com Chart.js
  renderizarGraficoProjecao(labels, valoresProjetados);
  
  // 6. Ordenar e renderizar lista detalhada de lançamentos
  listaAgendamentos.sort((a, b) => new Date(a.date + 'T00:00:00') - new Date(b.date + 'T00:00:00'));
  
  const containerList = document.getElementById('lista-agendamentos');
  document.getElementById('proj-contador-pendentes').innerText = `${listaAgendamentos.length} pendentes`;
  
  if (listaAgendamentos.length === 0) {
    containerList.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm">Nenhum lançamento futuro ou pendente encontrado.</div>`;
  } else {
    containerList.innerHTML = listaAgendamentos.map(item => {
      const d = new Date(item.date + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      const isVencido = d < hoje && item.pago === false;
      
      const badgeStatus = isVencido 
        ? `<span class="text-xs bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded uppercase tracking-wide">Vencido</span>`
        : `<span class="text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded uppercase tracking-wide">Agendado</span>`;
        
      const tipoText = item.isInvestimento 
        ? 'Investimento' 
        : (item.type === 'income' ? 'Receita' : 'Despesa');
        
      const valorColor = item.isInvestimento 
        ? 'text-violet-600' 
        : (item.type === 'income' ? 'text-emerald-600' : 'text-rose-600');
        
      const sinal = item.isInvestimento 
        ? '-' 
        : (item.type === 'income' ? '+' : '-');
        
      return `
        <div class="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
          <div>
            <div class="flex items-center gap-2">
              <h5 class="font-semibold text-slate-800">${escaparHTML(item.description)}</h5>
              ${badgeStatus}
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span>${tipoText}</span>
              <span>•</span>
              <span>${escaparHTML(formatarData(item.date))}</span>
              <span>•</span>
              <span>${escaparHTML(item.category)}</span>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="font-bold ${valorColor}">
              ${sinal}${formatarMoeda(item.amount)}
            </span>
            ${item.pago === false ? `
              <button data-click="confirmarPagamentoProjetado" ${argsAttr(item.id, item.isInvestimento)} 
                class="text-emerald-500 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-2 rounded-xl transition-colors flex items-center justify-center" 
                title="Marcar como Pago">
                <i data-lucide="check" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
    renderIcons();
  }
};

function renderizarGraficoProjecao(labels, valores) {
  const ctx = document.getElementById('chart-projecao').getContext('2d');
  
  if (projecaoChartInstance) {
    projecaoChartInstance.destroy();
  }
  
  const isDark = document.body.classList.contains('dark');
  const lineColor = '#10b981'; // emerald-500
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const pointBgColor = '#ffffff';
  
  projecaoChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Saldo Projetado (R$)',
        data: valores,
        borderColor: lineColor,
        borderWidth: 3,
        pointBackgroundColor: pointBgColor,
        pointBorderColor: lineColor,
        pointHoverRadius: 6,
        pointRadius: labels.length > 40 ? 0 : 4,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.12)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
          return gradient;
        },
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += formatarMoeda(context.parsed.y);
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: {
              family: 'sans-serif',
              size: 11
            },
            maxTicksLimit: 12
          }
        },
        y: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              family: 'sans-serif',
              size: 11
            },
            callback: function(value) {
              return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
          }
        }
      }
    }
  });
}

window.confirmarPagamentoProjetado = async (id, isInvestimento) => {
  try {
    if (isInvestimento) {
      const index = investimentos.findIndex(i => i.id === id);
      if (index !== -1) {
        investimentos[index].pago = true;
        await updateDoc(doc(db, "investimentos_app", id), { pago: true });
      }
    } else {
      const index = transacoes.findIndex(t => t.id === id);
      if (index !== -1) {
        transacoes[index].pago = true;
        await updateDoc(doc(db, "transacoes_app", id), { pago: true });
      }
    }
    mostrarToast('Lançamento consolidado com sucesso!');
    atualizarTela();
    
    // Recarregar a projeção atualizada no modal que está aberto
    const periodo = document.getElementById('proj-periodo').value;
    calcularProjecaoFluxo(periodo);
  } catch (error) {
    mostrarToast('Erro ao consolidar lançamento. Tente novamente.', 'error');
  }
};

