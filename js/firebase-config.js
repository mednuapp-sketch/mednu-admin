// ============================================
//   MEDNU ADMIN — FIREBASE CONFIGURATION
//   Replace these values with your own Firebase
//   project credentials from Firebase Console
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyBh_sDZlUDbE-u-c_4-sWsT1gxvfTYqoco",
  authDomain: "mednu-healthcare-app.firebaseapp.com",
  projectId: "mednu-healthcare-app",
  storageBucket: "mednu-healthcare-app.firebasestorage.app",
  messagingSenderId: "1056867138858",
  appId: "1:1056867138858:web:2a2aa821fa4ab4f545b253"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const auth    = firebase.auth();
const storage = firebase.storage();

// ============================================
//  HOW TO GET THESE VALUES:
//  1. Go to https://console.firebase.google.com
//  2. Select your Mednu project
//  3. Click the gear icon → Project Settings
//  4. Scroll to "Your apps" → Web app
//  5. Copy the firebaseConfig object and paste above
// ============================================
