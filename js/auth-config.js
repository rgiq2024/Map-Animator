// Login settings.
//  mode 'local'    — users and password hashes in auth/users.json (managed in the app: Users).
//  mode 'firebase' — Firebase Authentication. Paste your Firebase web config below and set mode to 'firebase'.
//                     Add users in the Firebase console (Authentication → Users → Add user).
//                     Optional: list the e-mails allowed in, and which of them are admins.
export const AUTH = {
  mode: 'firebase',
  firebase: {
    apiKey: 'AIzaSyBsABdjcxtvSvUppAeMvYUImdUgvKaaUFw',
    authDomain: 'map-animator-a8a03.firebaseapp.com',
    projectId: 'map-animator-a8a03',
    storageBucket: 'map-animator-a8a03.firebasestorage.app',
    messagingSenderId: '32943970941',
    appId: '1:32943970941:web:860ac6f2b2d266fce8af14',
  },
  allowedEmails: [], // empty = every account in your Firebase project may sign in
  adminEmails: [],
  sessionDays: 14,
};
