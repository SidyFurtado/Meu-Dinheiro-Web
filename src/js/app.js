// =============================================
// CONTROLE FINANCEIRO DESCOMPLICADO — App JS
// =============================================
import { db, auth } from './firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, where, getDoc, setDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

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
let meuPerfil = { nome: 'Usuário', foto: null, telefone: '' };
let avatarBase64Temporario = null;
let idTransacaoEmEdicao = null;
let idInvestimentoEmEdicao = null;
let transacoesSelecionadas = new Set();
let investimentosSelecionados = new Set();
const idsEmExclusao = new Set();
let acaoExclusaoMassaPendente = null;

// --- CONFIGURAÇÃO: SOBRA AUTOMÁTICA ---
let sobraAutomaticaAtiva = true;
let modoEscuroAtivo = false;

const hoje = new Date();
let dataVisualizacao = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

// --- UTILITÁRIOS E VALIDADORES DE SEGURANÇA ---

/** Escapa HTML e atributos para prevenir XSS */
function escaparHTML(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Valida se um ID de documento contém apenas caracteres seguros */
function isIdSeguro(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/** Valida se a data segue estritamente YYYY-MM-DD */
function isDataSegura(dataStr) {
  return typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataStr);
}

/** Valida se a foto de perfil é um Data URI de imagem seguro */
function isFotoSegura(foto) {
  if (foto === null || foto === undefined || foto === '') return true;
  return (
    typeof foto === 'string' &&
    foto.length <= 140000 &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto)
  );
}

/** Formata valor como moeda BRL */
function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

/** Formata data YYYY-MM-DD para DD/MM/YYYY com validação contra XSS */
function formatarData(dataStr) {
  if (!isDataSegura(dataStr)) return 'Data inválida';
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
  'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
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
  'check': '<polyline points="20 6 9 17 4 12"></polyline>',
  'check-circle': '<circle cx="12" cy="12" r="10"></circle><path d="M9 12l2 2 4-4"></path>',
  'check-square': '<polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
  'chevron-down': '<path d="M6 9l6 6 6-6"></path>',
  'chevron-left': '<path d="M15 18l-6-6 6-6"></path>',
  'chevron-right': '<path d="M9 18l6-6-6-6"></path>',
  'clock': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  'download-cloud': '<path d="M12 13v8"></path><path d="M8 17l4 4 4-4"></path><path d="M20.4 15.5A5 5 0 0 0 18 6h-1.3A8 8 0 1 0 4 14.9"></path>',
  'folder': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2"></path><path d="M3 19l3-8h16l-3 8z"></path>',
  'folder-search': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v3"></path><path d="M3 19l3-8h9"></path><circle cx="17" cy="17" r="3"></circle><path d="M19.5 19.5L22 22"></path>',
  'folder-x': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M10 11l4 4"></path><path d="M14 11l-4 4"></path>',
  'info': '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
  'line-chart': '<path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path>',
  'list': '<path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path>',
  'list-todo': '<rect x="3" y="5" width="6" height="6" rx="1"></rect><path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path>',
  'loader-2': '<path d="M21 12a9 9 0 1 1-6.2-8.6"></path>',
  'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
  'moon': '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>',
  'pencil': '<path d="M18 2l4 4L8 20H4v-4z"></path><path d="M14 6l4 4"></path>',
  'pie-chart': '<path d="M21 12a9 9 0 1 1-9-9v9z"></path><path d="M12 3a9 9 0 0 1 9 9h-9z"></path>',
  'plus': '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  'refresh-cw': '<path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"></path><path d="M3 16h6"></path><path d="M3 16v6"></path><path d="M3 12A9 9 0 0 1 18.5 5.7L21 8"></path><path d="M21 8h-6"></path><path d="M21 8V2"></path>',
  'save': '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
  'settings': '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.3 7A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"></path>',
  'shield-check': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path>',
  'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>',
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
  const inputSenha = document.getElementById('auth-senha');
  if (inputSenha) {
    inputSenha.minLength = modoAuth === 'cadastro' ? 8 : 6;
    inputSenha.autocomplete = modoAuth === 'cadastro' ? 'new-password' : 'current-password';
  }
};

window.recuperarSenha = async () => {
  if (_authCooldown) {
    mostrarToast('Aguarde um momento antes de tentar novamente.', 'error');
    return;
  }
  const email = document.getElementById('auth-email').value.trim();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarToast('Digite seu e-mail no campo acima para recuperar a senha.', 'info');
    document.getElementById('auth-email').focus();
    return;
  }

  _authCooldown = true;
  setTimeout(() => { _authCooldown = false; }, 3000);

  try {
    await sendPasswordResetEmail(auth, email);
  } catch {
    // Silencioso para evitar enumeração de contas existentes
  }
  mostrarToast('Se o e-mail estiver cadastrado, enviaremos um link de redefinição.', 'info');
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
  const minSenha = modoAuth === 'cadastro' ? 8 : 6;
  if (!senha || senha.length < minSenha || senha.length > 128) {
    mostrarToast(`A senha deve ter entre ${minSenha} e 128 caracteres.`, 'error');
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
      await createUserWithEmailAndPassword(auth, email, senha);
    }
  } catch (error) {
    // Mensagens genéricas — evitam enumeração de contas e não vazam detalhes
    let msg = modoAuth === 'login'
      ? 'E-mail ou senha incorretos.'
      : 'Não foi possível criar a conta. Verifique os dados ou tente recuperar a senha.';
    if (error.code === 'auth/weak-password') msg = 'A senha escolhida é muito fraca (use pelo menos 8 caracteres).';
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

function limparEstadoSessaoLocal() {
  transacoes = [];
  investimentos = [];
  transacoesSelecionadas.clear();
  investimentosSelecionados.clear();
  idsEmExclusao.clear();
  acaoExclusaoMassaPendente = null;
  meuPerfil = { nome: 'Usuário', foto: null, telefone: '' };
  avatarBase64Temporario = null;
  idTransacaoEmEdicao = null;
  idInvestimentoEmEdicao = null;
  sobraAutomaticaAtiva = true;
  modoEscuroAtivo = false;
  localStorage.removeItem('meuPerfil');
  localStorage.removeItem('transacoes_app');
  localStorage.removeItem('investimentos_app');
  localStorage.removeItem('sobraAutomatica');
  localStorage.removeItem('modoEscuro');
}

window.fazerLogout = async () => {
  try {
    limparEstadoSessaoLocal();
    await signOut(auth);
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
        const fotoValida = isFotoSegura(dadosUser.foto) ? (dadosUser.foto || null) : null;
        meuPerfil = {
          nome: typeof dadosUser.nome === 'string' ? dadosUser.nome.slice(0, 100) : '',
          foto: fotoValida,
          telefone: typeof dadosUser.telefone === 'string' ? dadosUser.telefone.slice(0, 30) : ''
        };
        sobraAutomaticaAtiva = dadosUser.sobraAutomatica !== false;
        modoEscuroAtivo = dadosUser.modoEscuro === true;
      } else {
        // Criar perfil inicial
        meuPerfil = {
          nome: user.email ? user.email.split('@')[0].slice(0, 100) : 'Usuário',
          foto: null,
          telefone: ''
        };
        sobraAutomaticaAtiva = true;
        modoEscuroAtivo = false;
        await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva, modoEscuro: modoEscuroAtivo });
      }

      // Salvar em cache local da sessão ativa e atualizar a UI
      localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
      localStorage.setItem('sobraAutomatica', JSON.stringify(sobraAutomaticaAtiva));
      localStorage.setItem('modoEscuro', JSON.stringify(modoEscuroAtivo));
      atualizarDadosPerfilHeader();
      sincronizarToggleSobra();
      sincronizarToggleModoEscuro();
      aplicarTemaEscuro();
    } catch {
      meuPerfil = {
        nome: user.email ? user.email.split('@')[0].slice(0, 100) : 'Usuário',
        foto: null,
        telefone: ''
      };
      atualizarDadosPerfilHeader();
      sincronizarToggleSobra();
      sincronizarToggleModoEscuro();
      aplicarTemaEscuro();
    }

    carregarTransacoes();
  } else {
    limparEstadoSessaoLocal();
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    atualizarDadosPerfilHeader();
    aplicarTemaEscuro();
    sincronizarToggleSobra();
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
      const d = docSnap.data();
      if (isIdSeguro(docSnap.id) && isDataSegura(d.date)) {
        transacoes.push({ id: docSnap.id, ...d });
      }
    });

    const qI = query(collection(db, "investimentos_app"), where("uid", "==", auth.currentUser.uid));
    const querySnapshotI = await getDocs(qI);
    investimentos = [];
    querySnapshotI.forEach((docSnap) => {
      const d = docSnap.data();
      if (isIdSeguro(docSnap.id) && isDataSegura(d.date)) {
        investimentos.push({ id: docSnap.id, ...d });
      }
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
  transacoes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  investimentos.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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
    fecharProjecaoFluxo();
    fecharModalConfirmarExclusao();
  }
});

// Fechar modais clicando no backdrop
document.addEventListener('DOMContentLoaded', () => {
  ['modal-cadastro', 'modal-perfil', 'modal-configuracoes', 'modal-historico', 'modal-investimento', 'modal-projecao-fluxo', 'modal-confirmar-exclusao'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        if (id === 'modal-cadastro') fecharModal();
        else if (id === 'modal-perfil') fecharModalPerfil();
        else if (id === 'modal-configuracoes') fecharModalConfiguracoes();
        else if (id === 'modal-investimento') fecharModalInvestimento();
        else if (id === 'modal-projecao-fluxo') fecharProjecaoFluxo();
        else if (id === 'modal-confirmar-exclusao') fecharModalConfirmarExclusao();
        else fecharHistorico();
      }
    });
  });
});

// --- DELETAR COM CONFIRMAÇÃO (INDIVIDUAL, MÚLTIPLA E EM MASSA) ---
window.pedirConfirmacaoDelete = (id) => {
  if (!isIdSeguro(id) || idsEmExclusao.has(id)) return;
  const container = document.getElementById(`acoes-${id}`);
  if (!container) return;
  const idEsc = escaparHTML(id);
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button type="button" data-action="confirmar-delete" data-id="${idEsc}" class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button type="button" data-action="cancelar-delete" data-id="${idEsc}" class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  renderIcons();
};

window.confirmarDelete = async (id) => {
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  if (!isIdSeguro(id)) {
    mostrarToast('Erro: ID inválido.', 'error');
    return;
  }
  if (idsEmExclusao.has(id)) return;

  const itemRemovido = transacoes.find(t => t.id === id);
  if (!itemRemovido) {
    atualizarTela();
    return;
  }

  // Atualização otimista imediata: remove da tela na hora (evita barra travada aguardando rede)
  idsEmExclusao.add(id);
  transacoes = transacoes.filter(t => t.id !== id);
  transacoesSelecionadas.delete(id);
  atualizarTela();
  mostrarToast('Lançamento apagado.', 'success');

  try {
    await deleteDoc(doc(db, 'transacoes_app', id));
  } catch {
    // Reverte automaticamente caso a exclusão no Firestore falhe
    transacoes.push(itemRemovido);
    ordenarTransacoes();
    atualizarTela();
    mostrarToast('Erro ao apagar na nuvem. O lançamento foi restaurado.', 'error');
  } finally {
    idsEmExclusao.delete(id);
  }
};

window.cancelarDelete = () => {
  // Re-renderiza a tela para restaurar os botões normais
  atualizarTela();
};

// --- SELEÇÃO MÚLTIPLA E EXCLUSÃO EM MASSA ---
window.toggleSelecaoTransacao = (id, forcarEstado) => {
  if (!isIdSeguro(id)) return;
  const selecionar = typeof forcarEstado === 'boolean' ? forcarEstado : !transacoesSelecionadas.has(id);
  if (selecionar) transacoesSelecionadas.add(id);
  else transacoesSelecionadas.delete(id);
  atualizarTela();
};

window.toggleSelecionarTodasTransacoes = (marcar) => {
  const listaMes = filtrarListaPorMes(transacoes, dataVisualizacao.getFullYear(), dataVisualizacao.getMonth());
  transacoesSelecionadas.clear();
  if (marcar) {
    listaMes.forEach(t => {
      if (isIdSeguro(t.id)) transacoesSelecionadas.add(t.id);
    });
  }
  atualizarTela();
};

window.toggleSelecaoInvestimento = (id, forcarEstado) => {
  if (!isIdSeguro(id)) return;
  const selecionar = typeof forcarEstado === 'boolean' ? forcarEstado : !investimentosSelecionados.has(id);
  if (selecionar) investimentosSelecionados.add(id);
  else investimentosSelecionados.delete(id);
  atualizarTela();
};

window.toggleSelecionarTodosInvestimentos = (marcar) => {
  const listaMes = filtrarListaPorMes(investimentos, dataVisualizacao.getFullYear(), dataVisualizacao.getMonth());
  investimentosSelecionados.clear();
  if (marcar) {
    listaMes.forEach(inv => {
      if (isIdSeguro(inv.id)) investimentosSelecionados.add(inv.id);
    });
  }
  atualizarTela();
};

window.fecharModalConfirmarExclusao = () => {
  acaoExclusaoMassaPendente = null;
  fecharModalGenerico('modal-confirmar-exclusao');
};

window.abrirConfirmacaoExclusaoMassa = (modo) => {
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }

  const ano = dataVisualizacao.getFullYear();
  const mes = dataVisualizacao.getMonth();
  const nomeMesAno = `${mesesNomes[mes]}/${ano}`;

  let transacoesAlvo = [];
  let investimentosAlvo = [];
  let titulo = 'Confirmar Exclusão';
  let mensagem = '';

  if (modo === 'transacoes-selecionadas') {
    const listaMes = filtrarListaPorMes(transacoes, ano, mes);
    transacoesAlvo = listaMes.filter(t => transacoesSelecionadas.has(t.id) && !idsEmExclusao.has(t.id));
    if (transacoesAlvo.length === 0) return;
    titulo = transacoesAlvo.length === 1 ? 'Apagar Lançamento' : `Apagar ${transacoesAlvo.length} Lançamentos`;
    mensagem = `Tem certeza que deseja apagar ${transacoesAlvo.length === 1 ? 'o lançamento selecionado' : `os ${transacoesAlvo.length} lançamentos selecionados`} de ${nomeMesAno}? Esta ação não pode ser desfeita.`;
  } else if (modo === 'transacoes-mes') {
    transacoesAlvo = filtrarListaPorMes(transacoes, ano, mes).filter(t => !idsEmExclusao.has(t.id));
    if (transacoesAlvo.length === 0) return;
    titulo = `Limpar Mês (${nomeMesAno})`;
    mensagem = `Tem certeza que deseja apagar todas as ${transacoesAlvo.length} contas registradas em ${nomeMesAno}? Esta ação não pode ser desfeita.`;
  } else if (modo === 'investimentos-selecionados') {
    const listaMes = filtrarListaPorMes(investimentos, ano, mes);
    investimentosAlvo = listaMes.filter(i => investimentosSelecionados.has(i.id) && !idsEmExclusao.has(i.id));
    if (investimentosAlvo.length === 0) return;
    titulo = investimentosAlvo.length === 1 ? 'Apagar Investimento' : `Apagar ${investimentosAlvo.length} Investimentos`;
    mensagem = `Tem certeza que deseja apagar ${investimentosAlvo.length === 1 ? 'o investimento selecionado' : `os ${investimentosAlvo.length} investimentos selecionados`} de ${nomeMesAno}? Esta ação não pode ser desfeita.`;
  } else if (modo === 'investimentos-mes') {
    investimentosAlvo = filtrarListaPorMes(investimentos, ano, mes).filter(i => !idsEmExclusao.has(i.id));
    if (investimentosAlvo.length === 0) return;
    titulo = `Limpar Investimentos (${nomeMesAno})`;
    mensagem = `Tem certeza que deseja apagar todos os ${investimentosAlvo.length} investimentos registrados em ${nomeMesAno}? Esta ação não pode ser desfeita.`;
  } else if (modo === 'tudo-conta') {
    transacoesAlvo = transacoes.filter(t => !idsEmExclusao.has(t.id));
    investimentosAlvo = investimentos.filter(i => !idsEmExclusao.has(i.id));
    const totalGeral = transacoesAlvo.length + investimentosAlvo.length;
    if (totalGeral === 0) {
      mostrarToast('Sua conta já está sem lançamentos.', 'info');
      return;
    }
    titulo = 'Apagar Todos os Lançamentos';
    mensagem = `Atenção: isso apagará permanentemente TODOS os ${totalGeral} registros da sua conta (${transacoesAlvo.length} contas e ${investimentosAlvo.length} investimentos em todos os meses e anos). Recomendamos exportar um backup antes. Deseja continuar?`;
  } else {
    return;
  }

  acaoExclusaoMassaPendente = { modo, transacoesAlvo, investimentosAlvo };
  document.getElementById('confirmar-exclusao-titulo').innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5"></i> ${escaparHTML(titulo)}`;
  document.getElementById('confirmar-exclusao-msg').textContent = mensagem;
  abrirModalGenerico('modal-confirmar-exclusao');
  renderIcons();
};

window.executarExclusaoMassa = async () => {
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    fecharModalConfirmarExclusao();
    return;
  }
  if (!acaoExclusaoMassaPendente) return;

  const { modo, transacoesAlvo, investimentosAlvo } = acaoExclusaoMassaPendente;
  const tValidos = transacoesAlvo.filter(t => isIdSeguro(t.id) && !idsEmExclusao.has(t.id));
  const iValidos = investimentosAlvo.filter(i => isIdSeguro(i.id) && !idsEmExclusao.has(i.id));
  const totalApagar = tValidos.length + iValidos.length;

  fecharModalConfirmarExclusao();
  if (modo === 'tudo-conta') fecharModalConfiguracoes();

  if (totalApagar === 0) return;

  const idsT = new Set(tValidos.map(t => t.id));
  const idsI = new Set(iValidos.map(i => i.id));

  // Atualização otimista imediata na interface
  tValidos.forEach(t => idsEmExclusao.add(t.id));
  iValidos.forEach(i => idsEmExclusao.add(i.id));

  transacoes = transacoes.filter(t => !idsT.has(t.id));
  investimentos = investimentos.filter(i => !idsI.has(i.id));
  idsT.forEach(id => transacoesSelecionadas.delete(id));
  idsI.forEach(id => investimentosSelecionados.delete(id));
  atualizarTela();

  mostrarToast(
    totalApagar === 1 ? '1 lançamento apagado com sucesso!' : `${totalApagar} lançamentos apagados com sucesso!`,
    'success'
  );

  // Monta fila de deleções para envio em lotes de até 450 docs (limite Firestore = 500/batch)
  const operacoes = [
    ...tValidos.map(t => ({ tipo: 't', item: t, ref: doc(db, 'transacoes_app', t.id) })),
    ...iValidos.map(i => ({ tipo: 'i', item: i, ref: doc(db, 'investimentos_app', i.id) })),
  ];

  let indiceProcessado = 0;
  try {
    for (let i = 0; i < operacoes.length; i += 450) {
      const lote = operacoes.slice(i, i + 450);
      const batch = writeBatch(db);
      lote.forEach(op => batch.delete(op.ref));
      await batch.commit();
      indiceProcessado = i + lote.length;
    }
  } catch {
    // Reverte apenas os registros cujo lote não foi confirmado no Firestore
    const naoConfirmados = operacoes.slice(indiceProcessado);
    naoConfirmados.forEach(op => {
      if (op.tipo === 't') transacoes.push(op.item);
      else investimentos.push(op.item);
    });
    ordenarTransacoes();
    atualizarTela();
    mostrarToast('Erro ao sincronizar exclusão na nuvem. Os itens não apagados foram restaurados.', 'error');
  } finally {
    tValidos.forEach(t => idsEmExclusao.delete(t.id));
    iValidos.forEach(i => idsEmExclusao.delete(i.id));
  }
};

// --- SISTEMA DE PERFIL DO USUÁRIO ---
function obterAvatarSeguro(foto, nomePadrao, bgHex) {
  if (foto && isFotoSegura(foto)) {
    return foto;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(nomePadrao || 'Usuário')}&background=${bgHex}&color=fff`;
}

function atualizarDadosPerfilHeader() {
  const nomeExibicao = meuPerfil.nome || 'Usuário';
  document.getElementById('nome-header').innerText = nomeExibicao;
  const avatarEl = document.getElementById('avatar-header');
  avatarEl.src = obterAvatarSeguro(meuPerfil.foto, nomeExibicao, '10b981');
}

window.abrirModalPerfil = () => {
  document.getElementById('perfil-nome').value = meuPerfil.nome || '';
  document.getElementById('perfil-telefone').value = meuPerfil.telefone || '';
  const preview = document.getElementById('perfil-foto-preview');
  preview.src = obterAvatarSeguro(meuPerfil.foto, meuPerfil.nome || 'Usuário', 'cbd5e1');
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

window.carregarFoto = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposPermitidos.includes(file.type)) {
    mostrarToast('Formato inválido. Use imagens JPG, PNG ou WebP.', 'error');
    event.target.value = '';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('A imagem deve ter no máximo 5MB.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    // Redimensiona para max 200x200 antes de salvar
    redimensionarImagem(e.target.result, 200, (resized) => {
      if (isFotoSegura(resized)) {
        avatarBase64Temporario = resized;
        document.getElementById('perfil-foto-preview').src = avatarBase64Temporario;
      } else {
        mostrarToast('Não foi possível processar a imagem.', 'error');
      }
    });
  };
  reader.readAsDataURL(file);
};

document.getElementById('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  meuPerfil.nome = document.getElementById('perfil-nome').value.trim();
  meuPerfil.telefone = document.getElementById('perfil-telefone').value.trim();
  if (avatarBase64Temporario) meuPerfil.foto = avatarBase64Temporario;

  // Salvar em cache local e na UI
  localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
  atualizarDadosPerfilHeader();

  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "usuarios_app", auth.currentUser.uid);
      await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva, modoEscuro: modoEscuroAtivo }, { merge: true });
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
  const label = document.getElementById('toggle-sobra-label');
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
  .hover\\:bg-slate-50:hover, .divide-y > .group:hover { background-color: #1a2540 !important; }
  .hover\\:bg-slate-100:hover { background-color: #1e293b !important; }
  .hover\\:bg-emerald-50:hover { background-color: #052e16 !important; }
  .hover\\:bg-emerald-200:hover { background-color: #14532d !important; }
  .hover\\:bg-rose-200:hover { background-color: #3b0d0d !important; }
  .hover\\:bg-violet-200:hover { background-color: #1e0a4a !important; }
  .bg-rose-50 { background-color: rgba(244, 63, 94, 0.12) !important; border-color: rgba(244, 63, 94, 0.3) !important; color: #f87171 !important; }
  .bg-violet-50 { background-color: rgba(139, 92, 246, 0.12) !important; border-color: rgba(139, 92, 246, 0.3) !important; }
  .bg-amber-100 { background-color: rgba(245, 158, 11, 0.18) !important; color: #fbbf24 !important; }
  .text-amber-800 { color: #fbbf24 !important; }
  .bg-blue-100 { background-color: rgba(59, 130, 246, 0.18) !important; color: #60a5fa !important; }
  .text-blue-800 { color: #60a5fa !important; }
  .text-rose-800 { color: #fda4af !important; }
  .bg-emerald-50\\/50 { background-color: rgba(16, 185, 129, 0.12) !important; }
  .bg-violet-50\\/60 { background-color: rgba(139, 92, 246, 0.14) !important; }

  /* === FORMULÁRIOS === */
  input:not([type="checkbox"]):not([type="file"]), select, textarea {
    background-color: #0b1628 !important;
    color: #f1f5f9 !important;
    border-color: #1e2d45 !important;
  }
  input:not([type="checkbox"]):not([type="file"]):focus, select:focus, textarea:focus {
    border-color: #10b981 !important;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
    outline: none !important;
  }
  input::placeholder { color: #475569 !important; }

  /* === BOTÃO HISTÓRICO E RELATÓRIOS === */
  .bg-slate-800 { background-color: #0d1b30 !important; }

  /* === CABEÇALHO (mantém botões .bg-emerald-600 vibrantes) === */
  header { background-color: #052e1c !important; }

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
  const label = document.getElementById('toggle-modo-escuro-label');
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
document.getElementById('form-transacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  const tipo = document.getElementById('form-tipo').value;
  const descricao = document.getElementById('form-desc').value;
  const valor = parseFloat(document.getElementById('form-valor').value);
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  const categoria = selectCat.value === 'Outros' && inputOutros.value.trim() ? inputOutros.value.trim() : selectCat.value;
  const data = document.getElementById('form-data').value;
  const pago = document.getElementById('form-pago').checked;

  if (!['income', 'expense'].includes(tipo)) return;
  if (!descricao || isNaN(valor) || valor <= 0 || valor > 10000000 || !categoria || !isDataSegura(data)) {
    mostrarToast('Verifique os dados informados (valor máximo R$ 10.000.000).', 'error');
    return;
  }

  const descSanitizada = descricao.trim().slice(0, 300);
  const catSanitizada = categoria.trim().slice(0, 100);
  if (!descSanitizada || !catSanitizada) {
    mostrarToast('Descrição ou categoria inválida.', 'error');
    return;
  }

  const btnSalvar = document.getElementById('btn-salvar');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  renderIcons();

  try {
    const payload = { type: tipo, description: descSanitizada, amount: valor, category: catSanitizada, date: data, pago, uid: auth.currentUser.uid };
    if (idTransacaoEmEdicao && isIdSeguro(idTransacaoEmEdicao)) {
      const index = transacoes.findIndex(t => t.id === idTransacaoEmEdicao);
      if (index !== -1) {
        await updateDoc(doc(db, 'transacoes_app', idTransacaoEmEdicao), payload);
        transacoes[index] = { id: idTransacaoEmEdicao, ...payload };
        mostrarToast('Conta atualizada com sucesso!');
      }
    } else {
      const docRef = await addDoc(collection(db, 'transacoes_app'), payload);
      transacoes.push({ id: docRef.id, ...payload });
      mostrarToast('Conta adicionada com sucesso!');
    }

    const [anoStr, mesStr] = data.split('-');
    dataVisualizacao.setFullYear(parseInt(anoStr));
    dataVisualizacao.setMonth(parseInt(mesStr) - 1);

    ordenarTransacoes();
    atualizarTela();
    fecharModal();
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
  selectCat.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  inputOutros.classList.add('hidden');
  inputOutros.value = '';
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
  mudarTipo(tipo);
  document.getElementById('modal-title').innerText = tipo === 'income' ? 'Adicionar Entrada' : 'Adicionar Saída';
  document.getElementById('btn-salvar').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Confirmar e Salvar';
  document.getElementById('form-desc').value = '';
  document.getElementById('form-valor').value = '';
  document.getElementById('form-pago').checked = true; // Pago por padrão ao criar

  const agora = new Date();
  if (dataVisualizacao.getFullYear() === agora.getFullYear() && dataVisualizacao.getMonth() === agora.getMonth()) {
    document.getElementById('form-data').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  } else {
    document.getElementById('form-data').value = `${dataVisualizacao.getFullYear()}-${String(dataVisualizacao.getMonth() + 1).padStart(2, '0')}-01`;
  }

  abrirModalGenerico('modal-cadastro');
  renderIcons();
};

window.abrirModalEdicao = (id) => {
  const transacao = transacoes.find(t => t.id === id);
  if (!transacao) return;
  idTransacaoEmEdicao = id;
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

  document.getElementById('form-data').value = transacao.date;
  document.getElementById('modal-title').innerText = 'Editar Conta';
  document.getElementById('btn-salvar').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Salvar Alterações';
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
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  const descricao = document.getElementById('inv-desc').value.trim();
  const valor = parseFloat(document.getElementById('inv-valor').value);
  const selectCat = document.getElementById('inv-categoria');
  const inputOutros = document.getElementById('inv-categoria-outros');
  const categoria = selectCat.value === 'Outros' && inputOutros.value.trim() ? inputOutros.value.trim() : selectCat.value;
  const data = document.getElementById('inv-data').value;
  const pago = document.getElementById('inv-pago').checked;

  if (!descricao || isNaN(valor) || valor <= 0 || valor > 10000000 || !categoria || !isDataSegura(data)) {
    mostrarToast('Verifique os dados informados (valor máximo R$ 10.000.000).', 'error');
    return;
  }

  const descSanitizada = descricao.slice(0, 300);
  const catSanitizada = categoria.trim().slice(0, 100);
  if (!descSanitizada || !catSanitizada) {
    mostrarToast('Descrição ou categoria inválida.', 'error');
    return;
  }

  const btnSalvar = document.getElementById('btn-salvar-inv');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  renderIcons();

  try {
    const payload = { description: descSanitizada, amount: valor, category: catSanitizada, date: data, pago, uid: auth.currentUser.uid };
    if (idInvestimentoEmEdicao && isIdSeguro(idInvestimentoEmEdicao)) {
      const index = investimentos.findIndex(i => i.id === idInvestimentoEmEdicao);
      if (index !== -1) {
        await updateDoc(doc(db, "investimentos_app", idInvestimentoEmEdicao), payload);
        investimentos[index] = { id: idInvestimentoEmEdicao, ...payload };
        mostrarToast('Investimento atualizado com sucesso!');
      }
    } else {
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
  if (!isIdSeguro(id) || idsEmExclusao.has(id)) return;
  const container = document.getElementById(`acoes-inv-${id}`);
  if (!container) return;
  const idEsc = escaparHTML(id);
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button type="button" data-action="confirmar-delete-inv" data-id="${idEsc}" class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button type="button" data-action="cancelar-delete-inv" data-id="${idEsc}" class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  renderIcons();
};

window.confirmarDeleteInv = async (id) => {
  if (!auth.currentUser) {
    mostrarToast('Sessão expirada. Faça login novamente.', 'error');
    return;
  }
  if (!isIdSeguro(id)) {
    mostrarToast('Erro: ID inválido.', 'error');
    return;
  }
  if (idsEmExclusao.has(id)) return;

  const itemRemovido = investimentos.find(i => i.id === id);
  if (!itemRemovido) {
    atualizarTela();
    return;
  }

  // Atualização otimista imediata (0ms)
  idsEmExclusao.add(id);
  investimentos = investimentos.filter(i => i.id !== id);
  investimentosSelecionados.delete(id);
  atualizarTela();
  mostrarToast('Investimento apagado.', 'success');

  try {
    await deleteDoc(doc(db, 'investimentos_app', id));
  } catch {
    // Reverte automaticamente caso a exclusão no Firestore falhe
    investimentos.push(itemRemovido);
    ordenarTransacoes();
    atualizarTela();
    mostrarToast('Erro ao apagar investimento na nuvem. O registro foi restaurado.', 'error');
  } finally {
    idsEmExclusao.delete(id);
  }
};

window.cancelarDeleteInv = () => {
  atualizarTela();
};

// --- NAVEGAÇÃO DE MESES ---
window.mudarMes = (delta) => {
  transacoesSelecionadas.clear();
  investimentosSelecionados.clear();
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

  // Sincroniza seleção de transações apenas com os itens existentes no mês visualizado
  const idsTransacoesMes = new Set(transacoesDoMes.map(t => t.id));
  transacoesSelecionadas.forEach(id => {
    if (!idsTransacoesMes.has(id)) transacoesSelecionadas.delete(id);
  });

  const controlesSelTrans = document.getElementById('controles-selecao-transacoes');
  const checkAllTrans = document.getElementById('check-all-transacoes');
  const btnApagarMesTrans = document.getElementById('btn-apagar-mes-transacoes');
  const btnApagarTransSel = document.getElementById('btn-apagar-transacoes-sel');
  const txtApagarTransSel = document.getElementById('txt-apagar-transacoes-sel');

  if (controlesSelTrans) {
    if (transacoesDoMes.length === 0) {
      controlesSelTrans.classList.add('hidden');
      controlesSelTrans.classList.remove('flex');
    } else {
      controlesSelTrans.classList.remove('hidden');
      controlesSelTrans.classList.add('flex');
      const qtdSel = transacoesSelecionadas.size;
      const todasSel = qtdSel === transacoesDoMes.length && transacoesDoMes.length > 0;
      if (checkAllTrans) {
        checkAllTrans.checked = todasSel;
        checkAllTrans.indeterminate = qtdSel > 0 && !todasSel;
      }
      if (btnApagarMesTrans) {
        btnApagarMesTrans.classList.toggle('hidden', qtdSel > 0);
      }
      if (btnApagarTransSel && txtApagarTransSel) {
        if (qtdSel > 0) {
          btnApagarTransSel.classList.remove('hidden');
          txtApagarTransSel.innerText = todasSel ? `Apagar tudo (${qtdSel})` : `Apagar (${qtdSel})`;
        } else {
          btnApagarTransSel.classList.add('hidden');
        }
      }
    }
  }

  const listaHTML = document.getElementById('lista-transacoes');
  if (transacoesDoMes.length === 0) {
    listaHTML.innerHTML = `<div class="p-8 text-center text-slate-400"><p>Nenhuma conta registrada neste mês.</p></div>`;
  } else {
    listaHTML.innerHTML = transacoesDoMes.map(t => {
      const idEsc = escaparHTML(t.id);
      const isSelecionada = transacoesSelecionadas.has(t.id);
      const isPendente = t.pago === false;
      const bgIconClass = isPendente ? 'bg-amber-100 text-amber-600' : (t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600');
      const iconName = isPendente ? 'clock' : (t.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle');
      const textStyleClass = isPendente ? 'text-slate-400 font-normal line-through opacity-75' : 'font-semibold text-slate-800';
      const textAmountColor = isPendente ? 'text-amber-500 font-medium' : (t.type === 'income' ? 'text-emerald-600' : 'text-rose-600');
      const bgRowClass = isSelecionada ? 'bg-emerald-50/50' : (isPendente ? 'bg-amber-50/20' : '');

      return `
        <div class="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group ${bgRowClass}">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <input type="checkbox" data-action="toggle-sel-transacao" data-id="${idEsc}" ${isSelecionada ? 'checked' : ''}
              aria-label="Selecionar ${escaparHTML(t.description)}"
              class="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0">
            <div class="p-3 rounded-full shrink-0 ${bgIconClass}">
              <i data-lucide="${iconName}" class="w-6 h-6"></i>
            </div>
            <div class="min-w-0">
              <h3 class="${textStyleClass} flex items-center flex-wrap gap-1.5">
                <span class="truncate max-w-[180px] sm:max-w-[280px]">${escaparHTML(t.description)}</span>
                ${isPendente ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">Pendente</span>' : ''}
              </h3>
              <div class="flex items-center gap-2 text-sm text-slate-500 mt-1 flex-wrap">
                <span class="flex items-center gap-1"><i data-lucide="tag" class="w-3 h-3"></i> ${escaparHTML(t.category)}</span>
                <span>•</span>
                <span>${formatarData(t.date)}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0" id="acoes-${idEsc}">
            <span class="font-bold text-base sm:text-lg mr-1 sm:mr-2 ${textAmountColor}">
              ${t.type === 'income' ? '+' : '-'}${formatarMoeda(t.amount)}
            </span>
            <button type="button" data-action="editar-transacao" data-id="${idEsc}" class="text-slate-300 hover:text-blue-500 transition-colors p-2" title="Editar conta">
              <i data-lucide="pencil" class="w-5 h-5"></i>
            </button>
            <button type="button" data-action="pedir-delete-transacao" data-id="${idEsc}" class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar conta">
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

  // Sincroniza seleção de investimentos apenas com os itens existentes no mês visualizado
  const idsInvestimentosMes = new Set(investimentosDoMes.map(i => i.id));
  investimentosSelecionados.forEach(id => {
    if (!idsInvestimentosMes.has(id)) investimentosSelecionados.delete(id);
  });

  const controlesSelInv = document.getElementById('controles-selecao-investimentos');
  const checkAllInv = document.getElementById('check-all-investimentos');
  const btnApagarMesInv = document.getElementById('btn-apagar-mes-investimentos');
  const btnApagarInvSel = document.getElementById('btn-apagar-investimentos-sel');
  const txtApagarInvSel = document.getElementById('txt-apagar-investimentos-sel');

  if (controlesSelInv) {
    if (investimentosDoMes.length === 0) {
      controlesSelInv.classList.add('hidden');
      controlesSelInv.classList.remove('flex');
    } else {
      controlesSelInv.classList.remove('hidden');
      controlesSelInv.classList.add('flex');
      const qtdSelInv = investimentosSelecionados.size;
      const todosSelInv = qtdSelInv === investimentosDoMes.length && investimentosDoMes.length > 0;
      if (checkAllInv) {
        checkAllInv.checked = todosSelInv;
        checkAllInv.indeterminate = qtdSelInv > 0 && !todosSelInv;
      }
      if (btnApagarMesInv) {
        btnApagarMesInv.classList.toggle('hidden', qtdSelInv > 0);
      }
      if (btnApagarInvSel && txtApagarInvSel) {
        if (qtdSelInv > 0) {
          btnApagarInvSel.classList.remove('hidden');
          txtApagarInvSel.innerText = todosSelInv ? `Apagar tudo (${qtdSelInv})` : `Apagar (${qtdSelInv})`;
        } else {
          btnApagarInvSel.classList.add('hidden');
        }
      }
    }
  }

  const listaInvHTML = document.getElementById('lista-investimentos');
  if (investimentosDoMes.length === 0) {
    listaInvHTML.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm"><p>Nenhum investimento registrado neste mês.</p></div>`;
  } else {
    listaInvHTML.innerHTML = investimentosDoMes.map(inv => {
      const idEsc = escaparHTML(inv.id);
      const isSelecionado = investimentosSelecionados.has(inv.id);
      const isPendente = inv.pago === false;
      const bgIconClass = isPendente ? 'bg-amber-100 text-amber-600' : 'bg-violet-100 text-violet-600';
      const iconName = isPendente ? 'clock' : 'trending-up';
      const textStyleClass = isPendente ? 'text-slate-400 font-normal line-through opacity-75' : 'font-semibold text-slate-800';
      const textAmountColor = isPendente ? 'text-amber-500 font-medium' : 'text-violet-600';
      const bgRowClass = isSelecionado ? 'bg-violet-50/60' : (isPendente ? 'bg-amber-50/20' : '');

      return `
        <div class="p-4 hover:bg-violet-50/50 transition-colors flex items-center justify-between gap-3 group ${bgRowClass}">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <input type="checkbox" data-action="toggle-sel-investimento" data-id="${idEsc}" ${isSelecionado ? 'checked' : ''}
              aria-label="Selecionar ${escaparHTML(inv.description)}"
              class="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer shrink-0">
            <div class="p-3 rounded-full shrink-0 ${bgIconClass}">
              <i data-lucide="${iconName}" class="w-6 h-6"></i>
            </div>
            <div class="min-w-0">
              <h3 class="${textStyleClass} flex items-center flex-wrap gap-1.5">
                <span class="truncate max-w-[180px] sm:max-w-[280px]">${escaparHTML(inv.description)}</span>
                ${isPendente ? '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">Pendente</span>' : ''}
              </h3>
              <div class="flex items-center gap-2 text-sm text-slate-500 mt-1 flex-wrap">
                <span class="flex items-center gap-1"><i data-lucide="briefcase" class="w-3 h-3"></i> ${escaparHTML(inv.category)}</span>
                <span>•</span>
                <span>${formatarData(inv.date)}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1 sm:gap-2 shrink-0" id="acoes-inv-${idEsc}">
            <span class="font-bold text-base sm:text-lg mr-1 sm:mr-2 ${textAmountColor}">
              ${formatarMoeda(inv.amount)}
            </span>
            <button type="button" data-action="editar-investimento" data-id="${idEsc}" class="text-slate-300 hover:text-violet-500 transition-colors p-2" title="Editar investimento">
              <i data-lucide="pencil" class="w-5 h-5"></i>
            </button>
            <button type="button" data-action="pedir-delete-investimento" data-id="${idEsc}" class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar investimento">
              <i data-lucide="trash-2" class="w-5 h-5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderIcons();
}

// --- SISTEMA DE HISTÓRICO E RELATÓRIOS ---
function agruparTransacoes() {
  const agrupado = {};
  // Bug 3 fix: Incluir investimentos no agrupamento do histórico
  const todos = [...transacoes, ...investimentos];
  todos.forEach(t => {
    if (!isDataSegura(t.date)) return;
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
      const anoEsc = escaparHTML(ano);
      const mesesDoAno = Array.from(agrupado[ano]).sort((a, b) => a - b);
      return `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <button type="button" data-action="toggle-ano-historico" data-ano="${anoEsc}" class="w-full p-4 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="bg-emerald-100 p-2 rounded-xl text-emerald-600"><i data-lucide="folder" class="w-6 h-6"></i></div>
              <span class="text-lg font-bold text-slate-800">Ano ${anoEsc}</span>
            </div>
            <i data-lucide="chevron-down" id="icone-ano-${anoEsc}" class="w-5 h-5 text-slate-400 transition-transform"></i>
          </button>
          <div id="conteudo-ano-${anoEsc}" class="hidden p-4 border-t border-slate-100 bg-slate-50">
            <button type="button" data-action="gerar-relatorio-anual" data-ano="${anoEsc}" class="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors">
              <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-200"></i> Ver Relatório Anual de ${anoEsc}
            </button>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Meses registrados:</p>
            <div class="space-y-2">
              ${mesesDoAno.map(mesIndex => `
                <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-emerald-200 transition-colors">
                  <span class="font-bold text-slate-700">${mesesNomes[mesIndex]}</span>
                  <div class="flex gap-2">
                    <button type="button" data-action="gerar-relatorio-mensal" data-ano="${anoEsc}" data-mes="${Number(mesIndex)}" class="p-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors" title="Ver Relatório Mensal">
                      <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
                    </button>
                    <button type="button" data-action="ir-mes-historico" data-ano="${anoEsc}" data-mes="${Number(mesIndex)}" class="flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors">
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
  transacoesSelecionadas.clear();
  investimentosSelecionados.clear();
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

  const transacoesPagas = transacoesFiltradas.filter(x => x.pago !== false);
  const investimentosPagos = investimentosFiltrados.filter(x => x.pago !== false);
  const qtdPendentes = (transacoesFiltradas.length - transacoesPagas.length) + (investimentosFiltrados.length - investimentosPagos.length);

  const resumo = calcularResumo(transacoesPagas);
  const resumoInv = calcularResumoInvestimentos(investimentosPagos);

  // Alinha o relatório mensal com a Sobra Automática exibida no painel principal
  let sobraAnterior = 0;
  if (isMensal && sobraAutomaticaAtiva) {
    const ant = mesAnterior(ano, mes);
    sobraAnterior = calcularSobraDoMes(ant.ano, ant.mes);
  }

  const entradasTotal = resumo.entradas + sobraAnterior;
  const saidasTotal = resumo.saidas + resumoInv.total;
  const saldoTotal = entradasTotal - saidasTotal;

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
    <button type="button" data-action="ir-mes-historico" data-ano="${Number(ano)}" data-mes="${Number(mes)}" class="w-full bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors mb-2">
      <i data-lucide="list" class="w-5 h-5 text-slate-300"></i> Ver todas as contas deste mês
    </button>` : '';

  const secaoInvestimentos = resumoInv.total > 0 ? `
      <div class="bg-violet-50 p-4 rounded-2xl border border-violet-100 shadow-sm">
        <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="trending-up" class="w-3 h-3 text-violet-500"></i> ${isMensal ? 'Investimentos' : 'Investimentos do Ano'}</p>
        <p class="text-lg font-bold text-violet-600">${formatarMoeda(resumoInv.total)}</p>
      </div>` : '';

  const avisoPendentes = qtdPendentes > 0 ? `
      <div class="bg-amber-100 text-amber-800 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-2">
        <i data-lucide="clock" class="w-4 h-4 shrink-0"></i>
        <span>${qtdPendentes === 1 ? '1 lançamento pendente não foi somado' : `${qtdPendentes} lançamentos pendentes não foram somados`} ao saldo consolidado.</span>
      </div>` : '';

  viewRelatorio.innerHTML = `
    <div class="bg-white p-4 border-b border-slate-100 shrink-0 flex items-center justify-between">
      <button type="button" data-action="voltar-pastas" class="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-medium transition-colors">
        <i data-lucide="arrow-left" class="w-4 h-4"></i> Voltar
      </button>
      <h4 class="font-bold text-slate-800">Resumo de ${escaparHTML(titulo)}</h4>
      <div class="w-16"></div>
    </div>
    <div class="p-6 space-y-6 bg-slate-50">
      ${btnVerContas}
      ${avisoPendentes}
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="arrow-up-circle" class="w-3 h-3 text-emerald-500"></i> ${isMensal ? 'Entradas' : 'Ganhos do Ano'}</p>
          <p class="text-lg font-bold text-emerald-600">${formatarMoeda(entradasTotal)}</p>
          ${sobraAnterior > 0 ? `<p class="text-[11px] text-emerald-600 mt-1 font-medium">+ ${formatarMoeda(sobraAnterior)} do mês ant.</p>` : ''}
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
  const dadosCompletos = { meuPerfil, transacoes_app: transacoes, investimentos_app: investimentos };
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

window.acionarImportacao = () => { document.getElementById('input-importar').click(); };

window.processarImportacao = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (!auth.currentUser) {
    mostrarToast('Faça login antes de restaurar um backup.', 'error');
    event.target.value = '';
    return;
  }

  // Limite de tamanho de arquivo: 5MB
  if (file.size > 5 * 1024 * 1024) {
    mostrarToast('Arquivo muito grande. Limite: 5MB.', 'error');
    event.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const dados = JSON.parse(e.target.result);

      // Valida estrutura mínima
      if (!dados.transacoes_app || !Array.isArray(dados.transacoes_app)) {
        throw new Error('Formato inválido: campo transacoes_app ausente.');
      }
      if (dados.transacoes_app.length > 10000) {
        throw new Error('Backup muito grande. Máximo de 10.000 transações.');
      }

      // Valida e sanitiza cada transação (suporta IDs numéricos legados do app Desktop)
      const TIPOS_VALIDOS = ['income', 'expense'];
      dados.transacoes_app.forEach((t, i) => {
        const n = i + 1;
        const idNormalizado = (typeof t.id === 'number' || typeof t.id === 'string') ? String(t.id) : '';
        if (!isIdSeguro(idNormalizado))
          throw new Error(`Transação ${n}: campo "id" inválido.`);
        t.id = idNormalizado;
        if (!TIPOS_VALIDOS.includes(t.type))
          throw new Error(`Transação ${n}: "type" deve ser "income" ou "expense".`);
        if (typeof t.description !== 'string' || t.description.trim().length === 0 || t.description.length > 300)
          throw new Error(`Transação ${n}: "description" inválida (máx 300 chars).`);
        if (typeof t.amount !== 'number' || !Number.isFinite(t.amount) || t.amount <= 0 || t.amount > 10000000)
          throw new Error(`Transação ${n}: "amount" deve ser um número positivo (máx 10.000.000).`);
        if (typeof t.category !== 'string' || t.category.trim().length === 0 || t.category.length > 100)
          throw new Error(`Transação ${n}: "category" inválida (máx 100 chars).`);
        if (!isDataSegura(t.date))
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
          const idInvNormalizado = (typeof inv.id === 'number' || typeof inv.id === 'string') ? String(inv.id) : '';
          if (!isIdSeguro(idInvNormalizado))
            throw new Error(`Investimento ${n}: campo "id" inválido.`);
          inv.id = idInvNormalizado;
          if (typeof inv.description !== 'string' || inv.description.trim().length === 0 || inv.description.length > 300)
            throw new Error(`Investimento ${n}: "description" inválida (máx 300 chars).`);
          if (typeof inv.amount !== 'number' || !Number.isFinite(inv.amount) || inv.amount <= 0 || inv.amount > 10000000)
            throw new Error(`Investimento ${n}: "amount" deve ser número positivo (máx 10.000.000).`);
          if (typeof inv.category !== 'string' || inv.category.trim().length === 0 || inv.category.length > 100)
            throw new Error(`Investimento ${n}: "category" inválida (máx 100 chars).`);
          if (!isDataSegura(inv.date))
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
        if (p.foto !== undefined && !isFotoSegura(p.foto))
          throw new Error('meuPerfil.foto contém formato de imagem inválido.');
      }

      const uid = auth.currentUser.uid;
      const operacoes = [];

      dados.transacoes_app.forEach(t => {
        const payload = {
          uid,
          type: t.type,
          description: t.description.trim().slice(0, 300),
          amount: t.amount,
          category: t.category.trim().slice(0, 100),
          date: t.date,
          pago: t.pago !== false
        };
        operacoes.push({ ref: doc(db, 'transacoes_app', t.id), data: payload });
      });

      if (Array.isArray(dados.investimentos_app)) {
        dados.investimentos_app.forEach(inv => {
          const payload = {
            uid,
            description: inv.description.trim().slice(0, 300),
            amount: inv.amount,
            category: inv.category.trim().slice(0, 100),
            date: inv.date,
            pago: inv.pago !== false
          };
          operacoes.push({ ref: doc(db, 'investimentos_app', inv.id), data: payload });
        });
      }

      // Grava no Firestore em lotes de até 450 documentos (limite do Firestore é 500 por batch)
      for (let i = 0; i < operacoes.length; i += 450) {
        const batch = writeBatch(db);
        operacoes.slice(i, i + 450).forEach(op => batch.set(op.ref, op.data));
        await batch.commit();
      }

      if (dados.meuPerfil) {
        const perfilSanitizado = {
          nome: (dados.meuPerfil.nome || '').trim().slice(0, 100),
          telefone: (dados.meuPerfil.telefone || '').trim().slice(0, 30),
          foto: isFotoSegura(dados.meuPerfil.foto) ? (dados.meuPerfil.foto || null) : null
        };
        await setDoc(doc(db, 'usuarios_app', uid), {
          ...perfilSanitizado,
          sobraAutomatica: sobraAutomaticaAtiva,
          modoEscuro: modoEscuroAtivo
        }, { merge: true });
        localStorage.setItem('meuPerfil', JSON.stringify(perfilSanitizado));
        meuPerfil = perfilSanitizado;
      }

      fecharModalConfiguracoes();
      mostrarToast('Backup restaurado e sincronizado na nuvem com sucesso!');
      await carregarTransacoes();
      atualizarDadosPerfilHeader();
    } catch (erro) {
      // Mensagem de erro da validação interna é segura de exibir
      mostrarToast('Erro ao restaurar: ' + erro.message, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
};

// --- BINDING DE EVENTOS E DELEGAÇÃO SEGURA (SEM INLINE HANDLERS) ---
function configurarEventosInterface() {
  const bindClick = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  bindClick('btn-login-google', () => window.fazerLoginGoogle());
  bindClick('btn-auth-switch', () => window.alternarModoAuth());
  bindClick('btn-recuperar-senha', () => window.recuperarSenha());
  bindClick('btn-abrir-perfil', () => window.abrirModalPerfil());
  bindClick('btn-abrir-notificacoes', () => window.abrirModalNotificacoes());
  bindClick('btn-abrir-configuracoes', () => window.abrirModalConfiguracoes());
  bindClick('btn-mes-anterior', () => window.mudarMes(-1));
  bindClick('btn-mes-proximo', () => window.mudarMes(1));
  bindClick('btn-abrir-historico', () => window.abrirHistorico());
  bindClick('btn-abrir-projecao', () => window.abrirProjecaoFluxo());
  bindClick('btn-nova-entrada', () => window.abrirModal('income'));
  bindClick('btn-nova-saida', () => window.abrirModal('expense'));
  bindClick('btn-novo-investimento', () => window.abrirModalInvestimento());
  bindClick('btn-fechar-historico', () => window.fecharHistorico());
  bindClick('btn-fechar-cadastro', () => window.fecharModal());
  bindClick('btn-tipo-entrada', () => window.mudarTipo('income'));
  bindClick('btn-tipo-saida', () => window.mudarTipo('expense'));
  bindClick('btn-fechar-perfil', () => window.fecharModalPerfil());
  bindClick('btn-fechar-configuracoes', () => window.fecharModalConfiguracoes());
  bindClick('btn-toggle-sobra', () => window.toggleSobraAutomatica());
  bindClick('btn-toggle-modo-escuro', () => window.toggleModoEscuro());
  bindClick('btn-exportar-backup', () => window.fazerBackup());
  bindClick('btn-importar-backup', () => window.acionarImportacao());
  bindClick('btn-logout', () => window.fazerLogout());
  bindClick('btn-fechar-investimento', () => window.fecharModalInvestimento());
  bindClick('btn-fechar-notificacoes', () => window.fecharModalNotificacoes());
  bindClick('btn-fechar-projecao', () => window.fecharProjecaoFluxo());
  bindClick('btn-apagar-transacoes-sel', () => window.abrirConfirmacaoExclusaoMassa('transacoes-selecionadas'));
  bindClick('btn-apagar-mes-transacoes', () => window.abrirConfirmacaoExclusaoMassa('transacoes-mes'));
  bindClick('btn-apagar-investimentos-sel', () => window.abrirConfirmacaoExclusaoMassa('investimentos-selecionados'));
  bindClick('btn-apagar-mes-investimentos', () => window.abrirConfirmacaoExclusaoMassa('investimentos-mes'));
  bindClick('btn-apagar-tudo-conta', () => window.abrirConfirmacaoExclusaoMassa('tudo-conta'));
  bindClick('btn-fechar-confirmar-exclusao', () => window.fecharModalConfirmarExclusao());
  bindClick('btn-cancelar-exclusao-massa', () => window.fecharModalConfirmarExclusao());
  bindClick('btn-confirmar-exclusao-massa', () => window.executarExclusaoMassa());

  const checkAllTrans = document.getElementById('check-all-transacoes');
  if (checkAllTrans) checkAllTrans.addEventListener('change', (e) => window.toggleSelecionarTodasTransacoes(e.target.checked));

  const checkAllInv = document.getElementById('check-all-investimentos');
  if (checkAllInv) checkAllInv.addEventListener('change', (e) => window.toggleSelecionarTodosInvestimentos(e.target.checked));

  const modalNotif = document.getElementById('modal-notificacoes');
  if (modalNotif) {
    modalNotif.addEventListener('click', (e) => {
      if (e.target === modalNotif) window.fecharModalNotificacoes();
    });
  }

  const formCategoria = document.getElementById('form-categoria');
  if (formCategoria) formCategoria.addEventListener('change', () => window.onchangeCategoria());

  const invCategoria = document.getElementById('inv-categoria');
  if (invCategoria) invCategoria.addEventListener('change', () => window.onchangeCategoriaInv());

  const perfilFotoInput = document.getElementById('perfil-foto-input');
  if (perfilFotoInput) perfilFotoInput.addEventListener('change', (e) => window.carregarFoto(e));

  const inputImportar = document.getElementById('input-importar');
  if (inputImportar) inputImportar.addEventListener('change', (e) => window.processarImportacao(e));

  const projPeriodo = document.getElementById('proj-periodo');
  if (projPeriodo) projPeriodo.addEventListener('change', (e) => window.selecionarPeriodoProjecao(e.target.value));

  // Delegação global para botões gerados dinamicamente (data-action)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const ano = btn.getAttribute('data-ano');
    const mes = btn.getAttribute('data-mes');

    switch (action) {
      case 'editar-transacao':
        window.abrirModalEdicao(id);
        break;
      case 'pedir-delete-transacao':
        window.pedirConfirmacaoDelete(id);
        break;
      case 'confirmar-delete':
        window.confirmarDelete(id);
        break;
      case 'cancelar-delete':
        window.cancelarDelete(id);
        break;
      case 'editar-investimento':
        window.abrirModalInvestimento(id);
        break;
      case 'pedir-delete-investimento':
        window.pedirConfirmacaoDeleteInv(id);
        break;
      case 'confirmar-delete-inv':
        window.confirmarDeleteInv(id);
        break;
      case 'cancelar-delete-inv':
        window.cancelarDeleteInv();
        break;
      case 'toggle-ano-historico':
        window.toggleAnoHistorico(ano);
        break;
      case 'gerar-relatorio-anual':
        window.gerarRelatorio(ano);
        break;
      case 'gerar-relatorio-mensal':
        window.gerarRelatorio(ano, parseInt(mes, 10));
        break;
      case 'ir-mes-historico':
        window.irParaMesHistorico(parseInt(ano, 10), parseInt(mes, 10));
        break;
      case 'voltar-pastas':
        window.voltarParaPastas();
        break;
      case 'testar-fluxo-caixa':
        window.fecharModalNotificacoes();
        window.abrirProjecaoFluxo();
        break;
      case 'confirmar-pagamento-projetado':
        window.confirmarPagamentoProjetado(id, btn.getAttribute('data-inv') === 'true');
        break;
      case 'toggle-sel-transacao':
        window.toggleSelecaoTransacao(id, btn.checked);
        break;
      case 'toggle-sel-investimento':
        window.toggleSelecaoInvestimento(id, btn.checked);
        break;
    }
  });
}

// --- INICIALIZAÇÃO DA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
  configurarEventosInterface();
  atualizarDadosPerfilHeader();
  aplicarTemaEscuro();
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
    <div class="space-y-4">
      <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col gap-3 transition-colors hover:shadow-md">
        <div class="flex items-center gap-3">
          <div class="p-3 rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <i data-lucide="check-square" class="w-6 h-6"></i>
          </div>
          <div>
            <h4 class="font-bold text-slate-800 dark:text-slate-200 text-sm leading-tight">Atualização v3.1.0 ✨</h4>
            <span class="text-xs text-slate-400">Novidades disponíveis</span>
          </div>
        </div>

        <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
          Mais velocidade, praticidade e segurança na gestão das suas contas:
        </p>

        <ul class="text-xs text-slate-500 dark:text-slate-400 space-y-2 mt-1">
          <li class="flex items-start gap-2">
            <span class="text-emerald-500 font-bold mt-0.5">•</span>
            <div>
              <strong class="text-slate-700 dark:text-slate-300">☑️ Seleção Múltipla e Apagar Tudo:</strong>
              Marque vários lançamentos para excluir de uma vez, limpe o mês inteiro ou zere os registros nas Configurações.
            </div>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-emerald-500 font-bold mt-0.5">•</span>
            <div>
              <strong class="text-slate-700 dark:text-slate-300">⚡ Exclusão Instantânea:</strong>
              Remoção imediata na tela com sincronização automática em segundo plano.
            </div>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-emerald-500 font-bold mt-0.5">•</span>
            <div>
              <strong class="text-slate-700 dark:text-slate-300">🔐 Segurança e Precisão:</strong>
              Recuperação de senha no login, proteção reforçada na nuvem e cálculos consolidados nos relatórios.
            </div>
          </li>
        </ul>
      </div>

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
        
        <button type="button" data-action="testar-fluxo-caixa" 
          class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 mt-2">
          <i data-lucide="line-chart" class="w-3.5 h-3.5"></i> Testar Fluxo de Caixa
        </button>
      </div>
    </div>
  `;

  // Re-renderizar ícones Lucide dentro do card injetado
  renderIcons();

  const jaLida = localStorage.getItem('notif_lida_v3') === 'true';
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
  localStorage.setItem('notif_lida_v3', 'true');
};

window.fecharModalNotificacoes = () => {
  const modal = document.getElementById('modal-notificacoes');
  const panel = document.getElementById('notif-panel');
  panel.classList.add('translate-x-full');
  setTimeout(() => modal.classList.add('hidden'), 300);
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

    // Respeita o fim do período selecionado (Fim do Mês vs Trimestre) em todos os cards e lista
    if (d <= fimPeriodo && (isPendente || isFutura)) {
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

    if (d <= fimPeriodo && (isPendente || isFuturo)) {
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
  listaAgendamentos.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

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
              <span>${formatarData(item.date)}</span>
              <span>•</span>
              <span>${escaparHTML(item.category)}</span>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="font-bold ${valorColor}">
              ${sinal}${formatarMoeda(item.amount)}
            </span>
            ${item.pago === false ? `
              <button type="button" data-action="confirmar-pagamento-projetado" data-id="${escaparHTML(item.id)}" data-inv="${Boolean(item.isInvestimento)}" 
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
          const { ctx, chartArea } = chart;
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
            label: function (context) {
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
            callback: function (value) {
              return 'R$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            }
          }
        }
      }
    }
  });
}

window.confirmarPagamentoProjetado = async (id, isInvestimento) => {
  if (!auth.currentUser || !isIdSeguro(id)) return;
  const lista = isInvestimento ? investimentos : transacoes;
  const colecao = isInvestimento ? 'investimentos_app' : 'transacoes_app';
  const index = lista.findIndex(item => item.id === id);
  if (index === -1) return;

  const estadoAnterior = lista[index].pago;
  lista[index].pago = true;
  atualizarTela();
  const periodo = document.getElementById('proj-periodo').value;
  calcularProjecaoFluxo(periodo);

  try {
    await updateDoc(doc(db, colecao, id), { pago: true });
    mostrarToast('Lançamento consolidado com sucesso!');
  } catch {
    lista[index].pago = estadoAnterior;
    atualizarTela();
    calcularProjecaoFluxo(document.getElementById('proj-periodo').value);
    mostrarToast('Erro ao consolidar lançamento. Tente novamente.', 'error');
  }
};

