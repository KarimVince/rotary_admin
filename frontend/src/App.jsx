import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import CurrencyManagement from "./pages/CurrencyManagement";
import Dashboard from "./pages/Dashboard";
import DonationsStatistics from "./pages/DonationsStatistics";
import FeeRunManagement from "./pages/FeeRunManagement";
import FeeSettingsManagement from "./pages/FeeSettingsManagement";
import FeeStatistics from "./pages/FeeStatistics";
import FeeTracking from "./pages/FeeTracking";
import Login from "./pages/Login";
import MemberTitleManagement from "./pages/MemberTitleManagement";
import MembersEmail from "./pages/MembersEmail";
import MembersList from "./pages/MembersList";
import MembersStatistics from "./pages/MembersStatistics";
import OrganisationDetail from "./pages/OrganisationDetail";
import OrganisationsList from "./pages/OrganisationsList";
import ResetPasswordConfirm from "./pages/ResetPasswordConfirm";
import RotaryFriendsEmail from "./pages/RotaryFriendsEmail";
import RotaryFriendsList from "./pages/RotaryFriendsList";
import RotaryFriendsStatistics from "./pages/RotaryFriendsStatistics";
import UserManagement from "./pages/UserManagement";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPasswordConfirm />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/members" element={<MembersList />} />
            <Route path="/members/statistics" element={<MembersStatistics />} />
            <Route path="/ngos" element={<OrganisationsList />} />
            <Route path="/ngos/statistics" element={<DonationsStatistics />} />
            <Route path="/ngos/:organisationId" element={<OrganisationDetail />} />
            <Route path="/admin/currencies" element={<CurrencyManagement />} />
            <Route path="/fees/settings" element={<FeeSettingsManagement />} />
            <Route path="/fees/run" element={<FeeRunManagement />} />
            <Route path="/fees/tracking" element={<FeeTracking />} />
            <Route path="/fees/statistics" element={<FeeStatistics />} />
            <Route path="/friends" element={<RotaryFriendsList />} />
            <Route path="/friends/statistics" element={<RotaryFriendsStatistics />} />
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/member-titles" element={<MemberTitleManagement />} />
              <Route path="/members/email" element={<MembersEmail />} />
              <Route path="/friends/email" element={<RotaryFriendsEmail />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
