// ============================================================
// firebase-config.js — Configuração e Inicialização Firebase
// ============================================================
//
// ⚠️  SEGURANÇA — LEIA ANTES DE MODIFICAR:
//
// A API Key abaixo NÃO é um segredo no sentido tradicional.
// Ela é pública por design do Firebase e DEVE estar no frontend.
// A segurança real é garantida por DUAS camadas:
//
//   1. Firestore Security Rules (firestore.rules) — valida
//      autenticação, propriedade dos dados, tipos e limites
//      em CADA operação no servidor.
//
//   2. Restrição de domínio no Google Cloud Console:
//      → Acesse: console.cloud.google.com/apis/credentials
//      → Edite a chave "Browser key (auto created by Firebase)"
//      → Restrinja para: meu-dinheiro-6b1ab.web.app
//                        meu-dinheiro-6b1ab.firebaseapp.com
//      (Sem essa restrição, a chave pode ser usada em outros domínios)
//
// ============================================================

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCUg8A4kXLfyd3uOs_DAMCL8FNmaeyxGTg",
  authDomain: "meu-dinheiro-6b1ab.firebaseapp.com",
  projectId: "meu-dinheiro-6b1ab",
  storageBucket: "meu-dinheiro-6b1ab.firebasestorage.app",
  messagingSenderId: "797217241544",
  appId: "1:797217241544:web:94a9e7f394c56b0e2b68fd",
  measurementId: "G-KYNEZ65CXE"
};

// Inicializa o Firebase — apenas uma instância por sessão
const app = initializeApp(firebaseConfig);

// Inicializa o Firestore e exporta
const db = getFirestore(app);

// Inicializa o Firebase Auth e exporta
const auth = getAuth(app);

// Configura o idioma do Auth para português (melhora UX dos popups)
auth.languageCode = 'pt-BR';

export { db, auth };
