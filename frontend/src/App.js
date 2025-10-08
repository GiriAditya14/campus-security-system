import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AlertProvider } from './contexts/AlertContext';

// Import accessibility styles
import './styles/accessibility.css';

// Components
import Navbar from './components/Layout/Navbar';
import Sidebar from './components/Layout/Sidebar';
import LoadingSpinner from './components/Common/LoadingSpinner';
import AlertNotifications from './components/Common/AlertNotifications';

// Pages
import Login from './pages/Auth/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import EntitySearch from './pages/Entities/EntitySearch';
import EntityDetails from './pages/Entities/EntityDetails';
import Timeline from './pages/Timeline/Timeline';
import CampusMap from './pages/Map/CampusMap';
import Analytics from './pages/Analytics/Analytics';
import Alerts from './pages/Alerts/Alerts';
import Users from './pages/Users/Users';
import Settings from './pages/Settings/Settings';
import AuditLogs from './pages/Audit/AuditLogs';
import Privacy from './pages/Privacy/Privacy';

// Protected Route Component
const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !requiredRole.includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return children;
};

// Main Layout Component
const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-900">
          <div className="container mx-auto px-6 py-8">
            {children}
          </div>
        </main>
      </div>
      
      <AlertNotifications />
    </div>
  );
};

// App Component
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AlertProvider>
          <Router>
            <div className="App">
              <Routes>
                {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                
                {/* Protected Routes */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/entities" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <EntitySearch />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/entities/:id" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <EntityDetails />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/timeline" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Timeline />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/map" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <CampusMap />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/analytics" element={
                  <ProtectedRoute requiredRole={['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']}>
                    <SocketProvider>
                      <Layout>
                        <Analytics />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/alerts" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Alerts />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/users" element={
                  <ProtectedRoute requiredRole={['ADMIN', 'SECURITY_OFFICER']}>
                    <SocketProvider>
                      <Layout>
                        <Users />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/audit" element={
                  <ProtectedRoute requiredRole={['ADMIN', 'SECURITY_OFFICER']}>
                    <SocketProvider>
                      <Layout>
                        <AuditLogs />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/privacy" element={
                  <ProtectedRoute requiredRole={['ADMIN']}>
                    <SocketProvider>
                      <Layout>
                        <Privacy />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Settings />
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                } />
                
                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </Router>
        </AlertProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;