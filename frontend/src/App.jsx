import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import { PermissionsProvider } from "./context/PermissionsContext";
import AdminPptTemplate from "./pages/AdminPptTemplate";
import AttendanceSheet from "./pages/AttendanceSheet";
import BoardMembers from "./pages/BoardMembers";
import BoardPositionManagement from "./pages/BoardPositionManagement";
import CurrencyManagement from "./pages/CurrencyManagement";
import Dashboard from "./pages/Dashboard";
import DinnerEvents from "./pages/DinnerEvents";
import DonationsStatistics from "./pages/DonationsStatistics";
import EventList from "./pages/EventList";
import EventManageProject from "./pages/EventManageProject";
import FinanceDonations from "./pages/FinanceDonations";
import FinanceFundraising from "./pages/FinanceFundraising";
import FinanceOperational from "./pages/FinanceOperational";
import FinanceSummary from "./pages/FinanceSummary";
import Login from "./pages/Login";
import MemberFees from "./pages/MemberFees";
import MembersEmail from "./pages/MembersEmail";
import MembersList from "./pages/MembersList";
import MembersStatistics from "./pages/MembersStatistics";
import OrganisationDetail from "./pages/OrganisationDetail";
import OrganisationsList from "./pages/OrganisationsList";
import PermissionMatrixManagement from "./pages/PermissionMatrixManagement";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ReferenceLists from "./pages/ReferenceLists";
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
                  NGO Classifications/Dinner Event Types (now merged into
                  this page) via the permission matrix, same as Currencies.
                  Member Titles/Honorifics lose the extra admin-role hard
                  gate they had as standalone routes; each card still
                  self-gates on its own matrix key via useAccess. */}
              <Route path="/admin/reference-lists" element={<ReferenceLists />} />
              {/* Story 8.23 — same reasoning: matrix-driven
                  (admin.ppt_template), not admin-role-only. */}
              <Route path="/admin/ppt-template" element={<AdminPptTemplate />} />
              <Route path="/finance" element={<FinanceSummary />} />
              <Route path="/finance/donations" element={<FinanceDonations />} />
              <Route path="/finance/fundraising" element={<FinanceFundraising />} />
              <Route path="/finance/operational" element={<FinanceOperational />} />
              <Route path="/fees" element={<MemberFees />} />
              <Route path="/friends" element={<RotaryFriendsList />} />
              <Route path="/friends/statistics" element={<RotaryFriendsStatistics />} />
              <Route path="/friends/email" element={<RotaryFriendsEmail />} />
              <Route path="/board/members" element={<BoardMembers />} />
              <Route path="/dinners" element={<DinnerEvents />} />
              <Route path="/dinners/:eventId" element={<AttendanceSheet />} />
              <Route path="/events" element={<EventList />} />
              <Route path="/events/manage" element={<EventManageProject />} />
              {/* Story 13.2/13.3 — static legal pages, no permission gating,
                  linked from the app-wide footer (Story 13.1). */}
              <Route path="/terms" element={<TermsOfUsage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route element={<ProtectedRoute requiredRole="admin" />}>
                <Route path="/admin/users" element={<UserManagement />} />
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
