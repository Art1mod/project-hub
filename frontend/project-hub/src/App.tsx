import { BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {AppLayout} from './layouts/AppLayout'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from './pages/Projects';
import { Login } from './pages/Login';
import { ProjectDetails } from './pages/ProjectDetails';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { Members } from './pages/Members';
import { Invitations } from './pages/Invitations';
import { Register } from './pages/Register';
import { AcceptInvitation } from './pages/AcceptInvitation';
import { Settings } from './pages/Settings';
import { RequirePermission } from './components/RequirePermission';
import { Dashboard } from './pages/Dashboard';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}> 
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route 
            element={
              <OrganizationProvider>
                <AppLayout />
              </OrganizationProvider>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetails />} />
            <Route path="/members" element={<Members/>} />
            <Route
                path="/invitations"
                element={
                    <RequirePermission permission="invitation:view">
                        <Invitations />
                    </RequirePermission>
                }
            />
            <Route path="/settings" element={<Settings/>} />
            <Route path="/profile" element={<AcceptInvitation/>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  ); 
}

export default App
