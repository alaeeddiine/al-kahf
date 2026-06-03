// src/firebase/config.js
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "firebase/auth";

import { getStorage } from "firebase/storage";

/* ============================
   🔹 CONFIG FIREBASE
============================ */
const firebaseConfig = {
  apiKey: "AIzaSyCdjziU9drbeB1KEKeFOXwsv1tiWo2VnKA",
  authDomain: "alkahf-41600.firebaseapp.com",
  projectId: "alkahf-41600",
  storageBucket: "alkahf-41600.appspot.com",
  messagingSenderId: "826972253416",
  appId: "1:826972253416:web:cee52b5da70a46f7c46d5d"
};

/* ============================
   🔹 INIT
============================ */
const app = initializeApp(firebaseConfig);
export { app };
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

/* ============================
   🔐 AUTH PERSISTENCE
============================ */
setPersistence(auth, browserSessionPersistence);

/* ============================
   🔹 BOOKS COLLECTION
============================ */
export const booksCollection = collection(db, "books");

export async function getAllBooks() {
  const snapshot = await getDocs(booksCollection);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function getBooksByCategory(category) {
  const q = query(booksCollection, where("category", "==", category));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function searchBooks(keyword) {
  const snapshot = await getDocs(booksCollection);
  const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return all.filter(b =>
    b.title.toLowerCase().includes(keyword.toLowerCase())
  );
}

export async function getFeaturedBooks() {
  const q = query(booksCollection, where("featured", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/* ============================
   🔹 REVIEWS COLLECTION (HOME PAGE)
   🔹 ADDED WITHOUT TOUCHING ANYTHING ELSE
============================ */
export const reviewsCollection = collection(db, "reviews");

export async function addHomeReview(fullName, email, review, rating) {
  if (!fullName || !email || !review || !rating) {
    throw new Error("Tous les champs sont obligatoires");
  }

  if (rating < 1 || rating > 5) {
    throw new Error("La note doit être entre 1 et 5");
  }

  await addDoc(reviewsCollection, {
    fullName,
    email,
    review,
    rating,
    createdAt: serverTimestamp()
  });
}

export async function getHomeReviews() {
  const snapshot = await getDocs(reviewsCollection);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

/* ============================
   🔹 AUTH FUNCTIONS
============================ */
export const loginAdmin = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

export const logoutAdmin = () => signOut(auth);

export const onAuthState = (callback) =>
  onAuthStateChanged(auth, callback);
