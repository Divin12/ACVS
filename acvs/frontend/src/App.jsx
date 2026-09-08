import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import PublicVerify from './pages/PublicVerify.jsx'
import Login from './pages/Login.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import SetNewPassword from './pages/SetNewPassword.jsx'
import SetPassword from './pages/SetPassword.jsx'
import AccessPending from './pages/AccessPending.jsx'
import OtpVerify from './pages/OtpVerify.jsx'
import Dashboard from './pages/Dashboard.jsx'
import BulkRegister from './pages/BulkRegister.jsx'
import CertificateList from './pages/CertificateList.jsx'
import CertificateDetail from './pages/CertificateDetail.jsx'
import AnchoringConfirmation from './pages/AnchoringConfirmation.jsx'
import { useAuth } from './useAuth.js'
import ActivityLog from './pages/ActivityLog.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import InstitutionManagement from './pages/InstitutionManagement.jsx'

function RequireAuth({ children, allowedRoles }) {
  const { accessToken, userStatus, mustChangePassword, user } = useAuth()
  const location = useLocation()

  if (!accessToken) {
    return <Navigate to="/institution/login" replace state={{ from: location }} />
  }

  if (userStatus !== 'authenticated') {
    return null
  }

  if (mustChangePassword && location.pathname !== '/institution/set-password') {
    return <Navigate to="/institution/set-password" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/institution/dashboard" replace />
  }

  return children
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/verify" element={<PublicVerify />} />
      <Route path="/verify/:certificateId" element={<PublicVerify />} />

      <Route path="/institution/login" element={<Login />} />
      <Route path="/institution/forgot-password" element={<ForgotPassword />} />
      <Route path="/institution/access-pending" element={<AccessPending />} />
      <Route path="/reset-password/confirm" element={<SetNewPassword />} />
      <Route path="/institution/otp" element={<OtpVerify />} />

      <Route
        path="/institution/set-password"
        element={
          <RequireAuth>
            <SetPassword />
          </RequireAuth>
        }
      />

      {/* Admin Panel Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <RequireAuth allowedRoles={['ADMIN']}>
            <AdminDashboard />
          </RequireAuth>
        }
      />

      <Route
        path="/admin/institutions"
        element={
          <RequireAuth allowedRoles={['ADMIN']}>
            <InstitutionManagement />
          </RequireAuth>
        }
      />

      {/* Institution Registrar Routes */}
      <Route
        path="/institution/dashboard"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />

      <Route
        path="/institution/certificates/new"
        element={
          <RequireAuth>
            <BulkRegister />
          </RequireAuth>
        }
      />
      <Route
        path="/institution/certificates"
        element={
          <RequireAuth>
            <CertificateList />
          </RequireAuth>
        }
      />
      <Route
        path="/institution/certificates/:id"
        element={
          <RequireAuth>
            <CertificateDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/institution/certificates/:id/anchor"
        element={
          <RequireAuth>
            <AnchoringConfirmation />
          </RequireAuth>
        }
      />

      <Route 
        path="/activity-log" 
        element={
          <RequireAuth>
            <ActivityLog /> 
          </RequireAuth> 
        } 
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App