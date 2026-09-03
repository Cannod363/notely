import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import { useAuth } from '@/lib/authContextValue';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Result from '@/pages/Result';
import Editor from '@/pages/Editor';
import Library from '@/pages/Library';
import Settings from '@/pages/Settings';
import Sheet from '@/pages/Sheet';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SplashScreen from '@/components/SplashScreen';
import FirstRunNotice from '@/components/FirstRunNotice';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/sheet" element={<Sheet />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/result/:id" element={<Result />} />
        <Route path="/editor/:id" element={<Editor />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  const [showSplash, setShowSplash] = useState(true);

  // The splash normally clears itself once its exit animation finishes. That
  // animation needs frames, and a tab opened in the background doesn't get
  // any — so this is the backstop that keeps the app from sitting behind the
  // artwork forever in that case.
  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        {/* Waits for the splash to clear so the first thing anyone reads isn't
            competing with the artwork fading out. */}
        {!showSplash && <FirstRunNotice />}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App