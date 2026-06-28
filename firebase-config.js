// firebase-config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: SUBSTITUA ESTAS CONFIGURAÇÕES PELAS CREDENCIAIS DO SEU PROJETO FIREBASE
// Para conseguir isso:
// 1. Acesse console.firebase.google.com
// 2. Crie um novo projeto
// 3. Adicione um app "Web" (ícone de </>).
// 4. Copie o objeto firebaseConfig gerado e cole aqui embaixo.
const firebaseConfig = {
  apiKey: "AIzaSyCUg8A4kXLfyd3uOs_DAMCL8FNmaeyxGTg",
  authDomain: "meu-dinheiro-6b1ab.firebaseapp.com",
  projectId: "meu-dinheiro-6b1ab",
  storageBucket: "meu-dinheiro-6b1ab.firebasestorage.app",
  messagingSenderId: "797217241544",
  appId: "1:797217241544:web:94a9e7f394c56b0e2b68fd",
  measurementId: "G-KYNEZ65CXE"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Cloud Firestore e exporta para usarmos no app.js
const db = getFirestore(app);

// Inicializa o Firebase Auth e exporta para usarmos no app.js
import { getAuth } from "firebase/auth";
const auth = getAuth(app);

export { db, auth };
