// Bundled into /assets/auth.js for the owner and admin pages (window.KLAuth).
import {
  getUser, login, signup, logout, oauthLogin, handleAuthCallback, requestPasswordRecovery,
  updateUser, getSettings, refreshSession, hydrateSession, onAuthChange,
} from '@netlify/identity';
window.KLAuth = { getUser, login, signup, logout, oauthLogin, handleAuthCallback, requestPasswordRecovery, updateUser, getSettings, refreshSession, hydrateSession, onAuthChange };
