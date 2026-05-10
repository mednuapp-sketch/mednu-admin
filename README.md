# Mednu Admin Panel

A complete web admin dashboard for the Mednu app.
Connects directly to your existing Firebase (Firestore) backend.

---

## 📁 File Structure

```
mednu-admin/
├── index.html              ← Main app (open this in browser)
├── css/
│   └── style.css           ← All styles
├── js/
│   ├── firebase-config.js  ← ⚠️ PUT YOUR FIREBASE KEYS HERE
│   └── app.js              ← All logic & Firebase queries
└── README.md
```

---

## 🚀 Setup (3 steps)

### Step 1 — Add your Firebase credentials

Open `js/firebase-config.js` and replace the placeholder values:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",           // ← replace
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**How to get these:**
1. Go to https://console.firebase.google.com
2. Open your Mednu project
3. Click ⚙️ Settings → Project Settings
4. Scroll to "Your apps" → Web app → Copy config

---

### Step 2 — Create an Admin user in Firebase

1. Go to Firebase Console → Authentication → Users
2. Click "Add user"
3. Enter admin email + password
4. This is what you'll use to log in to the admin panel

---

### Step 3 — Set Firestore Security Rules

In Firebase Console → Firestore → Rules, add:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null 
        && request.auth.token.email == "YOUR_ADMIN_EMAIL@gmail.com";
    }
  }
}
```

Replace with your actual admin email.

---

## 🗃️ Expected Firestore Collections

The admin panel reads from these collections in your Firestore:

| Collection      | Fields expected |
|-----------------|-----------------|
| `doctors`       | name, email, phone, specialisation, status, rating, consultations, createdAt |
| `patients`      | name, email, phone, age, condition, totalConsultations, createdAt |
| `payments`      | amount, patientName, doctorName, type, status, paymentId, createdAt |
| `prescriptions` | medicines (array of {name}), doctorId, patientId, createdAt |
| `tickets`       | title, message, userName, priority, status, createdAt |
| `reports`       | title, type, range, status, downloadUrl, createdAt |

> If your Flutter app uses different field names, update `js/app.js` to match.

---

## 🌐 How to deploy (optional)

### Option A — Firebase Hosting (free)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select your project, public dir = .
firebase deploy
```

### Option B — Just open the file
For local use, simply open `index.html` in your browser. No server needed.

### Option C — Any web host
Upload the entire `mednu-admin/` folder to any web hosting (Hostinger, Netlify, etc.)

---

## 🔧 Customisation

- **Logo / Name:** Search for "Mednu" in `index.html` and replace
- **Colors:** Edit CSS variables at the top of `css/style.css`
- **Add a new section:** Copy a tab in `index.html`, add nav item, add JS loader in `app.js`

---

Built for Mednu · Firebase + Paytm Stack
