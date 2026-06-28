// =============================================
// CONTROLE FINANCEIRO DESCOMPLICADO — App JS
// =============================================
import { db, auth } from './firebase-config.js';
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, where, getDoc, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';

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

// --- CONFIGURAÇÃO: SOBRA AUTOMÁTICA ---
let sobraAutomaticaAtiva = JSON.parse(localStorage.getItem('sobraAutomatica') ?? 'true');

const hoje = new Date();
let dataVisualizacao = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

// --- UTILITÁRIOS ---

/** Escapa HTML para prevenir XSS */
function escaparHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  lucide.createIcons({ nodes: [toast] });

  setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- AUTENTICAÇÃO ---
let modoAuth = 'login';

window.alternarModoAuth = () => {
  modoAuth = modoAuth === 'login' ? 'cadastro' : 'login';
  document.getElementById('btn-auth-text').innerText = modoAuth === 'login' ? 'Entrar' : 'Criar Conta';
  document.getElementById('auth-switch-text').innerText = modoAuth === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?';
  document.getElementById('btn-auth-switch').innerText = modoAuth === 'login' ? 'Criar conta' : 'Fazer login';
};

document.getElementById('form-auth').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const senha = document.getElementById('auth-senha').value;
  const btn = document.getElementById('btn-auth-submit');
  const txtOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Aguarde...';
  lucide.createIcons({ nodes: [btn] });

  try {
    if (modoAuth === 'login') {
      await signInWithEmailAndPassword(auth, email, senha);
    } else {
      await createUserWithEmailAndPassword(auth, email, senha);
    }
  } catch (error) {
    let msg = "Erro na autenticação.";
    if (error.code === 'auth/invalid-credential') msg = "E-mail ou senha incorretos.";
    if (error.code === 'auth/email-already-in-use') msg = "E-mail já está em uso.";
    if (error.code === 'auth/weak-password') msg = "A senha deve ter pelo menos 6 caracteres.";
    mostrarToast(msg, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = txtOriginal;
    lucide.createIcons({ nodes: [btn] });
  }
});

window.fazerLogout = async () => {
  try {
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
    if (error.code === 'auth/popup-closed-by-user') return;
    console.error("Erro no login com Google:", error);
    mostrarToast("Erro no Google: " + error.message, "error");
  }
};


onAuthStateChanged(auth, async (user) => {
  if (user) {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    
    // Carregar perfil e sobra do Firestore
    try {
      const userDocRef = doc(db, "usuarios_app", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const dadosUser = userDocSnap.data();
        meuPerfil = {
          nome: dadosUser.nome || '',
          foto: dadosUser.foto || null,
          telefone: dadosUser.telefone || ''
        };
        sobraAutomaticaAtiva = dadosUser.sobraAutomatica !== false;
      } else {
        // Criar perfil inicial
        meuPerfil = {
          nome: user.email ? user.email.split('@')[0] : 'Usuário',
          foto: null,
          telefone: ''
        };
        sobraAutomaticaAtiva = true;
        await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva });
      }
      
      // Salvar em cache local e atualizar a UI
      localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
      localStorage.setItem('sobraAutomatica', JSON.stringify(sobraAutomaticaAtiva));
      atualizarDadosPerfilHeader();
      sincronizarToggleSobra();
    } catch (error) {
      console.error("Erro ao sincronizar perfil do Firestore:", error);
    }
    
    carregarTransacoes();
  } else {
    document.getElementById('login-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    transacoes = [];
    investimentos = [];
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
  } catch (error) {
    console.error("Erro ao carregar dados do Firebase:", error);
    mostrarToast("Erro ao carregar dados da nuvem.", "error");
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
    fecharModalUpdate();
  }
});

// Fechar modais clicando no backdrop
document.addEventListener('DOMContentLoaded', () => {
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
});

// --- DELETAR COM CONFIRMAÇÃO ---
window.pedirConfirmacaoDelete = (id) => {
  // Substitui os botões de ação por botões de confirmação
  const container = document.getElementById(`acoes-${id}`);
  if (!container) return;
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button onclick="confirmarDelete('${id}')" class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button onclick="cancelarDelete('${id}')" class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  lucide.createIcons({ nodes: [container] });
};

window.confirmarDelete = async (id) => {
  try {
    await deleteDoc(doc(db, "transacoes_app", id));
    transacoes = transacoes.filter(t => t.id !== id);
    mostrarToast("Conta apagada.", "success");
    atualizarTela();
  } catch (error) {
    console.error("Erro ao deletar transação:", error);
    mostrarToast("Erro ao apagar conta.", "error");
  }
};

window.cancelarDelete = (id) => {
  // Re-renderiza a tela para restaurar os botões normais
  atualizarTela();
};

// --- SISTEMA DE PERFIL DO USUÁRIO ---
function atualizarDadosPerfilHeader() {
  const nomeExibicao = meuPerfil.nome || 'Usuário';
  document.getElementById('nome-header').innerText = nomeExibicao;
  const avatarEl = document.getElementById('avatar-header');
  avatarEl.src = meuPerfil.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(nomeExibicao)}&background=10b981&color=fff`;
}

window.abrirModalPerfil = () => {
  document.getElementById('perfil-nome').value = meuPerfil.nome || '';
  document.getElementById('perfil-telefone').value = meuPerfil.telefone || '';
  const preview = document.getElementById('perfil-foto-preview');
  preview.src = meuPerfil.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(meuPerfil.nome || 'Usuário')}&background=cbd5e1&color=fff`;
  avatarBase64Temporario = null;
  abrirModalGenerico('modal-perfil');
};

window.fecharModalPerfil = () => { fecharModalGenerico('modal-perfil'); };

window.abrirModalConfiguracoes = () => {
  sincronizarToggleSobra();
  abrirModalGenerico('modal-configuracoes');
};

window.fecharModalConfiguracoes = () => { fecharModalGenerico('modal-configuracoes'); };

window.carregarFoto = (event) => {
  const file = event.target.files[0];
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
  meuPerfil.telefone = document.getElementById('perfil-telefone').value.trim();
  if (avatarBase64Temporario) meuPerfil.foto = avatarBase64Temporario;
  
  // Salvar em cache local e na UI
  localStorage.setItem('meuPerfil', JSON.stringify(meuPerfil));
  atualizarDadosPerfilHeader();
  
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "usuarios_app", auth.currentUser.uid);
      await setDoc(userDocRef, { ...meuPerfil, sobraAutomatica: sobraAutomaticaAtiva }, { merge: true });
    } catch (error) {
      console.error("Erro ao salvar perfil no Firestore:", error);
      mostrarToast("Erro ao sincronizar com nuvem, salvo apenas localmente.", "error");
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
    } catch (error) {
      console.error("Erro ao salvar configuração de sobra no Firestore:", error);
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

// --- LÓGICA DE SALVAR / EDITAR TRANSAÇÃO ---
document.getElementById('form-transacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tipo = document.getElementById('form-tipo').value;
  const descricao = document.getElementById('form-desc').value;
  const valor = parseFloat(document.getElementById('form-valor').value);
  const selectCat = document.getElementById('form-categoria');
  const inputOutros = document.getElementById('form-categoria-outros');
  const categoria = selectCat.value === 'Outros' && inputOutros.value.trim() ? inputOutros.value.trim() : selectCat.value;
  const data = document.getElementById('form-data').value;

  if (!descricao || isNaN(valor) || valor <= 0 || !categoria) return;

  const btnSalvar = document.getElementById('btn-salvar');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  lucide.createIcons({ nodes: [btnSalvar] });

  try {
    if (idTransacaoEmEdicao) {
      const index = transacoes.findIndex(t => t.id === idTransacaoEmEdicao);
      if (index !== -1) {
        const payload = { type: tipo, description: descricao, amount: valor, category: categoria, date: data, uid: auth.currentUser.uid };
        await updateDoc(doc(db, "transacoes_app", idTransacaoEmEdicao), payload);
        transacoes[index] = { id: idTransacaoEmEdicao, ...payload };
        mostrarToast("Conta atualizada com sucesso!");
      }
    } else {
      const payload = { type: tipo, description: descricao, amount: valor, category: categoria, date: data, uid: auth.currentUser.uid };
      const docRef = await addDoc(collection(db, "transacoes_app"), payload);
      transacoes.push({ id: docRef.id, ...payload });
      mostrarToast("Conta adicionada com sucesso!");
    }

    const [anoStr, mesStr] = data.split('-');
    dataVisualizacao.setFullYear(parseInt(anoStr));
    dataVisualizacao.setMonth(parseInt(mesStr) - 1);

    ordenarTransacoes();
    atualizarTela();
    fecharModal();
  } catch (error) {
    console.error("Erro ao salvar transação:", error);
    mostrarToast("Erro ao salvar na nuvem.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = btnContent;
    lucide.createIcons({ nodes: [btnSalvar] });
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

  const agora = new Date();
  if (dataVisualizacao.getFullYear() === agora.getFullYear() && dataVisualizacao.getMonth() === agora.getMonth()) {
    document.getElementById('form-data').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  } else {
    document.getElementById('form-data').value = `${dataVisualizacao.getFullYear()}-${String(dataVisualizacao.getMonth() + 1).padStart(2, '0')}-01`;
  }

  abrirModalGenerico('modal-cadastro');
  lucide.createIcons({ nodes: [document.getElementById('modal-cadastro')] });
};

window.abrirModalEdicao = (id) => {
  const transacao = transacoes.find(t => t.id === id);
  if (!transacao) return;
  idTransacaoEmEdicao = id;
  mudarTipo(transacao.type);
  document.getElementById('form-desc').value = transacao.description;
  document.getElementById('form-valor').value = transacao.amount;

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
  lucide.createIcons({ nodes: [document.getElementById('modal-cadastro')] });
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
  lucide.createIcons({ nodes: [document.getElementById('modal-investimento')] });
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

  if (!descricao || isNaN(valor) || valor <= 0 || !categoria || !data) return;

  const btnSalvar = document.getElementById('btn-salvar-inv');
  const btnContent = btnSalvar.innerHTML;
  btnSalvar.disabled = true;
  btnSalvar.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Salvando...';
  lucide.createIcons({ nodes: [btnSalvar] });

  try {
    if (idInvestimentoEmEdicao) {
      const index = investimentos.findIndex(i => i.id === idInvestimentoEmEdicao);
      if (index !== -1) {
        const payload = { description: descricao, amount: valor, category: categoria, date: data, uid: auth.currentUser.uid };
        await updateDoc(doc(db, "investimentos_app", idInvestimentoEmEdicao), payload);
        investimentos[index] = { id: idInvestimentoEmEdicao, ...payload };
        mostrarToast('Investimento atualizado com sucesso!');
      }
    } else {
      const payload = { description: descricao, amount: valor, category: categoria, date: data, uid: auth.currentUser.uid };
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
  } catch (error) {
    console.error("Erro ao salvar investimento:", error);
    mostrarToast("Erro ao salvar na nuvem.", "error");
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.innerHTML = btnContent;
    lucide.createIcons({ nodes: [btnSalvar] });
  }
});

window.pedirConfirmacaoDeleteInv = (id) => {
  const container = document.getElementById(`acoes-inv-${id}`);
  if (!container) return;
  container.innerHTML = `
    <div class="confirm-delete-bar flex items-center gap-2 text-sm">
      <span class="text-rose-600 font-medium">Apagar?</span>
      <button onclick="confirmarDeleteInv('${id}')" class="bg-rose-600 text-white px-3 py-1 rounded-lg font-bold hover:bg-rose-700 transition-colors text-xs">Sim</button>
      <button onclick="cancelarDeleteInv('${id}')" class="bg-slate-200 text-slate-700 px-3 py-1 rounded-lg font-bold hover:bg-slate-300 transition-colors text-xs">Não</button>
    </div>
  `;
  lucide.createIcons({ nodes: [container] });
};

window.confirmarDeleteInv = async (id) => {
  try {
    await deleteDoc(doc(db, "investimentos_app", id));
    investimentos = investimentos.filter(i => i.id !== id);
    mostrarToast('Investimento apagado.', 'success');
    atualizarTela();
  } catch (error) {
    console.error("Erro ao deletar investimento:", error);
    mostrarToast("Erro ao apagar investimento.", "error");
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

  const t = filtrarListaPorMes(transacoes, ano, mes);
  const inv = filtrarListaPorMes(investimentos, ano, mes);

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
  const resumo = calcularResumo(transacoesDoMes);
  const resumoInv = calcularResumoInvestimentos(investimentosDoMes);

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
    listaHTML.innerHTML = transacoesDoMes.map(t => `
      <div class="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
        <div class="flex items-center gap-4">
          <div class="p-3 rounded-full ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}">
            <i data-lucide="${t.type === 'income' ? 'arrow-up-circle' : 'arrow-down-circle'}" class="w-6 h-6"></i>
          </div>
          <div>
            <h3 class="font-semibold text-slate-800">${escaparHTML(t.description)}</h3>
            <div class="flex items-center gap-2 text-sm text-slate-500 mt-1">
              <span class="flex items-center gap-1"><i data-lucide="tag" class="w-3 h-3"></i> ${escaparHTML(t.category)}</span>
              <span>•</span>
              <span>${formatarData(t.date)}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1 sm:gap-2" id="acoes-${t.id}">
          <span class="font-bold text-lg mr-2 ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}">
            ${t.type === 'income' ? '+' : '-'}${formatarMoeda(t.amount)}
          </span>
          <button onclick="abrirModalEdicao('${t.id}')" class="text-slate-300 hover:text-blue-500 transition-colors p-2" title="Editar conta">
            <i data-lucide="pencil" class="w-5 h-5"></i>
          </button>
          <button onclick="pedirConfirmacaoDelete('${t.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar conta">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </button>
        </div>
      </div>
    `).join('');
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
              <span>${formatarData(inv.date)}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1 sm:gap-2" id="acoes-inv-${inv.id}">
          <span class="font-bold text-lg mr-2 text-violet-600">
            ${formatarMoeda(inv.amount)}
          </span>
          <button onclick="abrirModalInvestimento('${inv.id}')" class="text-slate-300 hover:text-violet-500 transition-colors p-2" title="Editar investimento">
            <i data-lucide="pencil" class="w-5 h-5"></i>
          </button>
          <button onclick="pedirConfirmacaoDeleteInv('${inv.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2" title="Apagar investimento">
            <i data-lucide="trash-2" class="w-5 h-5"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  lucide.createIcons({ nodes: [document.getElementById('app-container')] });
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
          <button onclick="toggleAnoHistorico('${ano}')" class="w-full p-4 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors">
            <div class="flex items-center gap-3">
              <div class="bg-emerald-100 p-2 rounded-xl text-emerald-600"><i data-lucide="folder" class="w-6 h-6"></i></div>
              <span class="text-lg font-bold text-slate-800">Ano ${ano}</span>
            </div>
            <i data-lucide="chevron-down" id="icone-ano-${ano}" class="w-5 h-5 text-slate-400 transition-transform"></i>
          </button>
          <div id="conteudo-ano-${ano}" class="hidden p-4 border-t border-slate-100 bg-slate-50">
            <button onclick="gerarRelatorio('${ano}')" class="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors">
              <i data-lucide="bar-chart-3" class="w-5 h-5 text-emerald-200"></i> Ver Relatório Anual de ${ano}
            </button>
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Meses registrados:</p>
            <div class="space-y-2">
              ${mesesDoAno.map(mesIndex => `
                <div class="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-emerald-200 transition-colors">
                  <span class="font-bold text-slate-700">${mesesNomes[mesIndex]}</span>
                  <div class="flex gap-2">
                    <button onclick="gerarRelatorio('${ano}', ${mesIndex})" class="p-2 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors" title="Ver Relatório Mensal">
                      <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
                    </button>
                    <button onclick="irParaMesHistorico(${ano}, ${mesIndex})" class="flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors">
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
  lucide.createIcons({ nodes: [document.getElementById('modal-historico')] });
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
    <button onclick="irParaMesHistorico(${ano}, ${mes})" class="w-full bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-colors mb-2">
      <i data-lucide="list" class="w-5 h-5 text-slate-300"></i> Ver todas as contas deste mês
    </button>` : '';

  const secaoInvestimentos = resumoInv.total > 0 ? `
      <div class="bg-violet-50 p-4 rounded-2xl border border-violet-100 shadow-sm">
        <p class="text-xs text-slate-500 mb-1 flex items-center gap-1"><i data-lucide="trending-up" class="w-3 h-3 text-violet-500"></i> ${isMensal ? 'Investimentos' : 'Investimentos do Ano'}</p>
        <p class="text-lg font-bold text-violet-600">${formatarMoeda(resumoInv.total)}</p>
      </div>` : '';

  viewRelatorio.innerHTML = `
    <div class="bg-white p-4 border-b border-slate-100 shrink-0 flex items-center justify-between">
      <button onclick="voltarParaPastas()" class="text-slate-500 hover:text-emerald-600 flex items-center gap-1 font-medium transition-colors">
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
  lucide.createIcons({ nodes: [viewRelatorio] });
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
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const dados = JSON.parse(e.target.result);
      if (!dados.transacoes_app || !Array.isArray(dados.transacoes_app)) throw new Error("Formato inválido.");

      // Valida que cada transação tem campos obrigatórios
      const camposObrigatorios = ['id', 'type', 'description', 'amount', 'date', 'category'];
      dados.transacoes_app.forEach((t, i) => {
        camposObrigatorios.forEach(campo => {
          if (t[campo] === undefined || t[campo] === null) throw new Error(`Transação ${i + 1} sem campo "${campo}".`);
        });
      });

      localStorage.setItem('transacoes_app', JSON.stringify(dados.transacoes_app));

      // Restaura investimentos se existirem no backup
      if (dados.investimentos_app && Array.isArray(dados.investimentos_app)) {
        localStorage.setItem('investimentos_app', JSON.stringify(dados.investimentos_app));
      }

      if (dados.meuPerfil) {
        localStorage.setItem('meuPerfil', JSON.stringify(dados.meuPerfil));
        meuPerfil = dados.meuPerfil;
      }
      fecharModalConfiguracoes();
      mostrarToast("Backup restaurado!");
      carregarTransacoes();
      atualizarDadosPerfilHeader();
    } catch (erro) {
      mostrarToast("Erro ao restaurar: " + erro.message, "error");
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};

// --- INICIALIZAÇÃO DA PÁGINA ---
atualizarDadosPerfilHeader();
lucide.createIcons();

// ==========================================
// SISTEMA DE NOTIFICAÇÕES (NATIVE IN-APP)
// ==========================================

window.abrirModalNotificacoes = () => {
  const modal = document.getElementById('modal-notificacoes');
  const panel = document.getElementById('notif-panel');
  modal.classList.remove('hidden');
  // Força refluxo para animação funcionar
  void modal.offsetWidth;
  panel.classList.remove('translate-x-full');
};

window.fecharModalNotificacoes = () => {
  const modal = document.getElementById('modal-notificacoes');
  const panel = document.getElementById('notif-panel');
  panel.classList.add('translate-x-full');
  setTimeout(() => modal.classList.add('hidden'), 300);
};

