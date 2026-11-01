import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import AnalystDashboard from './pages/AnalystDashboard';
import OtherAnalysis from './pages/OtherAnalysis';
import AIEngine from './pages/AIEngine';
import FinancialMap from './pages/FinancialMap';
import FinancialInclusion from './pages/FinancialInclusion';
import Nst2Indicators from './pages/Nst2Indicators';
import ProgrammeEvidence from './pages/ProgrammeEvidence';
import DatasetDocumentation from './pages/DatasetDocumentation';
import ProgrammeManagement from './pages/ProgrammeManagement';
import Cooperatives from './pages/Cooperatives';
import CooperativePanel from './pages/CooperativePanel';
import GovernmentPanel from './pages/GovernmentPanel';
import AgentDashboard from './pages/AgentDashboard';
import BeneficiaryAccess from './pages/BeneficiaryAccess';
import Settings from './pages/Settings';
import MemberPanel from './pages/MemberPanel';
import UssdSimulator from './pages/UssdSimulator';
import UssdControl from './pages/UssdControl';
import { ROLES } from '@/lib/roles';
import JobApplicant from './pages/JobApplicant';
import RoleGuard from './components/layout/RoleGuard';
import { DemoAuthProvider } from './lib/DemoAuthContext';
import DashboardShell from './components/layout/DashboardShell';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AccountRequests from './pages/AccountRequests';
import DataUpload from './pages/DataUpload';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/ussd-sim" element={<UssdSimulator />} />
      <Route element={<DashboardShell />}>
        <Route element={<RoleGuard roles={["platform_admin", "nisr_analyst"]} />}>
          <Route path="/" element={<AnalystDashboard />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin"]} />}>
          <Route path="/ussd-control" element={<UssdControl />} />
          <Route path="/account-requests" element={<AccountRequests />} />
        </Route>
        <Route element={<RoleGuard roles={Object.keys(ROLES)} />}>
          <Route path="/settings" element={<Settings />} />
          {/* Every signed-in panel can open the governed research workspace, not only the analysts. */}
          <Route path="/ai-engine" element={<AIEngine />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "nisr_analyst"]} />}>
          <Route path="/other-analysis" element={<OtherAnalysis />} />
          <Route path="/investigations" element={<LegacyInvestigationRedirect />} />
          <Route path="/nst2" element={<Nst2Indicators />} />
          <Route path="/financial-inclusion" element={<FinancialInclusion />} />
          <Route path="/data-upload" element={<DataUpload />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "programme_owner"]} />}>
          <Route path="/programmes" element={<ProgrammeManagement />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin"]} />}>
          <Route path="/evidence" element={<ProgrammeEvidence />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "cooperative"]} />}>
          <Route path="/cooperative" element={<CooperativePanel />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "beneficiary"]} />}>
          <Route path="/cooperatives" element={<Cooperatives />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "gov_district", "gov_sector", "gov_cell"]} />}>
          <Route path="/government" element={<GovernmentPanel />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "field_agent"]} />}>
          <Route path="/agent" element={<AgentDashboard />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "beneficiary"]} />}>
          <Route path="/beneficiary" element={<MemberPanel />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "job_applicant"]} />}>
          <Route path="/jobs" element={<JobApplicant />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "nisr_analyst", "programme_owner", "gov_district", "gov_sector", "gov_cell"]} />}>
          <Route path="/map" element={<FinancialMap />} />
        </Route>
        <Route element={<RoleGuard roles={["platform_admin", "nisr_analyst"]} />}>
          <Route path="/datasets" element={<DatasetDocumentation />} />
        </Route>
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function LegacyInvestigationRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/ai-engine", search: location.search, hash: location.hash }} replace />;
}

function App() {

  return (
    <AuthProvider>
      <DemoAuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router basename={import.meta.env.BASE_URL}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </DemoAuthProvider>
    </AuthProvider>
  )
}

export default App
