// ==========================================================================
// Firebase initialization — project: asantereal-estates
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCu8Io222csh6wHDirTiwSL5zbv6jU0-E",
  authDomain: "asantereal-estates.firebaseapp.com",
  projectId: "asantereal-estates",
  storageBucket: "asantereal-estates.firebasestorage.app",
  messagingSenderId: "976239654869",
  appId: "1:976239654869:web:92ed0bd406508120236f5c"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Cloudinary — used client-side for unsigned image uploads (admin panel only)
// TODO: replace with your real Cloudinary cloud name + unsigned upload preset
export const CLOUDINARY_CLOUD_NAME = "dbgxllxdb";
export const CLOUDINARY_UPLOAD_PRESET = "efootball_screenshots";
