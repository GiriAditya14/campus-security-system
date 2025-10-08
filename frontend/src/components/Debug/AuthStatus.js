import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const AuthStatus = () => {
  const { user, token, loading } = useAuth();

  if (loading) {
    return <div className="p-4 bg-yellow-100 border border-yellow-400 rounded">Loading auth status...</div>;
  }

  return (
    <div className="p-4 bg-gray-100 border border-gray-300 rounded mb-4">
      <h3 className="font-bold mb-2">Authentication Status</h3>
      <div className="space-y-2 text-sm">
        <div>
          <strong>Authenticated:</strong> {user ? 'Yes' : 'No'}
        </div>
        {user && (
          <>
            <div>
              <strong>User:</strong> {user.email}
            </div>
            <div>
              <strong>Role:</strong> {user.role}
            </div>
            <div>
              <strong>Token Present:</strong> {token ? 'Yes' : 'No'}
            </div>
            <div>
              <strong>Token Preview:</strong> {token ? `${token.substring(0, 20)}...` : 'None'}
            </div>
          </>
        )}
        {!user && (
          <div className="text-red-600">
            <strong>Status:</strong> Not logged in. Please log in to access protected resources.
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthStatus;