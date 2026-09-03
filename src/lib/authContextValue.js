import { createContext, useContext } from 'react';

// The context object and its hook live outside AuthContext.jsx on purpose.
// React Fast Refresh can only hot-swap a module whose exports are all
// components; a module that also exports a context object gets fully
// re-executed instead, minting a brand-new context while already-mounted
// consumers still hold the old one. That mismatch surfaced as
// "useAuth must be used within an AuthProvider" and blanked the whole app
// (login page included) until a hard reload — which is why it only ever
// reproduced in a normal browser and never in incognito.
export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
