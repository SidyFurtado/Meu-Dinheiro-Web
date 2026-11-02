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
//   2. Restrição de domínio e API no Google Cloud Console:
//      → Acesse: console.cloud.google.com/apis/credentials
//      → Edite a chave "Browser key (auto created by Firebase)"
//      → Restrinja por HTTP Referrer para:
//          https://meu-dinheiro-6b1ab.web.app/*
//          https://meu-dinheiro-6b1ab.firebaseapp.com/*
//          https://meudinheiro.qd.je/*
//      → Restrinja por API apenas para:
//          Identity Toolkit API, Token Service API, Cloud Firestore API
//
//   3. Firebase App Check (Proteção contra abuso de cota/bots):
//      → Preencha RECAPTCHA_V3_SITE_KEY abaixo após ativar o
//        App Check no Console do Firebase.
//
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';

const firebaseConfig = {
  apiKey: "AIzaSyCUg8A4kXLfyd3uOs_DAMCL8FNmaeyxGTg",
  authDomain: "meu-dinheiro-6b1ab.firebaseapp.com",
  projectId: "meu-dinheiro-6b1ab",
  storageBucket: "meu-dinheiro-6b1ab.firebasestorage.app",
  messagingSenderId: "797217241544",
  appId: "1:797217241544:web:94a9e7f394c56b0e2b68fd",
  measurementId: "G-KYNEZ65CXE"
};

// Chave pública do reCAPTCHA v3 para o Firebase App Check (defina quando ativar no Console)
const RECAPTCHA_V3_SITE_KEY = "";

// Inicializa o Firebase — apenas uma instância por sessão
const app = initializeApp(firebaseConfig);

if (RECAPTCHA_V3_SITE_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_V3_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  } catch {
    // Falha silenciosa caso o App Check já esteja inicializado
  }
}

// Inicializa o Firestore e exporta
const db = getFirestore(app);

// Inicializa o Firebase Auth e exporta
const auth = getAuth(app);

// Configura o idioma do Auth para português (melhora UX dos popups)
auth.languageCode = 'pt-BR';

export { db, auth };
