import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import MemberTitleManagement from "./pages/MemberTitleManagement";
import MembersEmail from "./pages/MembersEmail";
import MembersList from "./pages/MembersList";
import MembersStatistics from "./pages/MembersStatistics";
import UserManagement from "./pages/UserManagement";
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/members" element={<MembersList />} />
            <Route path="/members/statistics" element={<MembersStatistics />} />
            <Route element={<ProtectedRoute requiredRole="admin" />}>
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/member-titles" element={<MemberTitleManagement />} />
              <Route path="/members/email" element={<MembersEmail />} />
            </Route>
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
