import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, allowedRoles }) => {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const token = localStorage.getItem('token') || localStorage.getItem('access_token');

    // 1. If not logged in, redirect to login page
    if (!user || !token) {
        return <Navigate to="/login" replace />;
    }

    // 2. If the user's role is NOT in the allowed list, redirect to home
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        console.warn(`Access denied. User role '${user.role}' is not in allowed roles:`, allowedRoles);
        return <Navigate to="/" replace />;
    }

    // 3. User is authorized, render the page
    return children;
};

export default ProtectedRoute;