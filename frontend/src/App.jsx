import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import AdminPptTemplate from "./pages/AdminPptTemplate";
import AttendanceHistory from "./pages/AttendanceHistory";
import AttendanceSheet from "./pages/AttendanceSheet";
import BoardMembers from "./pages/BoardMembers";
import BoardPositionManagement from "./pages/BoardPositionManagement";
import CurrencyManagement from "./pages/CurrencyManagement";
import Dashboard from "./pages/Dashboard";
import DinnerForecast from "./pages/DinnerForecast";
import DonationsStatistics from "./pages/DonationsStatistics";
import FeeRunManagement from "./pages/FeeRunManagement";
import FeeSettingsManagement from "./pages/FeeSettingsManagement";
import FeeStatistics from "./pages/FeeStatistics";
import FeeTracking from "./pages/FeeTracking";
import HonorificManagement from "./pages/HonorificManagement";
import Login from "./pages/Login";
import MemberTitleManagement from "./pages/MemberTitleManagement";
import MembersEmail from "./pages/MembersEmail";
import MembersList from "./pages/MembersList";
import MembersStatistics from "./pages/MembersStatistics";
import NgoClassificationManagement from "./pages/NgoClassificationManagement";
import OrganisationDetail from "./pages/OrganisationDetail";
import OrganisationsList from "./pages/OrganisationsList";
import PermissionMatrixManagement from "./pages/PermissionMatrixManagement";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ResetPasswordConfirm from "./pages/ResetPasswordConfirm";
import RotaryFriendsEmail from "./pages/RotaryFriendsEmail";
import RotaryFriendsList from "./pages/RotaryFriendsList";
import RotaryFriendsStatistics from "./pages/RotaryFriendsStatistics";
import TermsOfUsage from "./pages/TermsOfUsage";
import UserManagement from "./pages/UserManagement";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <PermissionsProvider>
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
              {/* Not inside the requiredRole="admin" block below — Story
                  11.2 needs Secretary/President/President Elect to reach
                  this via the permission matrix, same as Currencies. */}
              <Route
                path="/admin/ngo-classifications"
                element={<NgoClassificationManagement />}
              />
              {/* Story 8.23 — same reasoning as NGO Classifications above:
                  matrix-driven (admin.ppt_template), not admin-role-only. */}
              <Route path="/admin/ppt-template" element={<AdminPptTemplate />} />
              <Route path="/fees/settings" element={<FeeSettingsManagement />} />
              <Route path="/fees/run" element={<FeeRunManagement />} />
              <Route path="/fees/tracking" element={<FeeTracking />} />
              <Route path="/fees/statistics" element={<FeeStatistics />} />
              <Route path="/friends" element={<RotaryFriendsList />} />
              <Route path="/friends/statistics" element={<RotaryFriendsStatistics />} />
              <Route path="/friends/email" element={<RotaryFriendsEmail />} />
              <Route path="/board/members" element={<BoardMembers />} />
              <Route path="/dinners/attendance" element={<AttendanceHistory />} />
              <Route path="/dinners/attendance/:eventId" element={<AttendanceSheet />} />
              <Route path="/dinners/forecast" element={<DinnerForecast />} />
              {/* Story 13.2/13.3 — static legal pages, no permission gating,
                  linked from the app-wide footer (Story 13.1). */}
              <Route path="/terms" element={<TermsOfUsage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route element={<ProtectedRoute requiredRole="admin" />}>
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/member-titles" element={<MemberTitleManagement />} />
                {/* Story 8.3 — admin.honorifics is admin-role-only in the
                    matrix (same tier as Member Titles above), so it belongs
                    in this block too, not out with NGO Classifications/PPT
                    Template which grant wider board access. */}
                <Route path="/admin/honorifics" element={<HonorificManagement />} />
                <Route path="/board/positions" element={<BoardPositionManagement />} />
                <Route path="/admin/permissions" element={<PermissionMatrixManagement />} />
                <Route path="/members/email" element={<MembersEmail />} />
              </Route>
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </PermissionsProvider>
    </AuthProvider>
  );
}

export default App;
