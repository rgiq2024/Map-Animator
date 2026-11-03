// Login settings.
//  mode 'local'    — users and password hashes in auth/users.json (managed in the app: Users).
//  mode 'firebase' — Firebase Authentication. Paste your Firebase web config below and set mode to 'firebase'.
//                     Add users in the Firebase console (Authentication → Users → Add user).
//                     Optional: list the e-mails allowed in, and which of them are admins.
export const AUTH = {
  mode: 'local',
  firebase: null, // e.g. { apiKey: '…', authDomain: '….firebaseapp.com', projectId: '…', appId: '…' }
  allowedEmails: [], // empty = every account in your Firebase project may sign in
  adminEmails: [],
  sessionDays: 14,
};
