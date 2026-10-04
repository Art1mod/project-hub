import { BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {AppLayout} from './layouts/AppLayout'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from './pages/Projects';
import { Login } from './pages/Login';
import { ProjectDetails } from './pages/ProjectDetails';
import { OrganizationProvider } from './contexts/OrganizationContext';
import { Members } from './pages/Members';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}> 
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            element={
              <OrganizationProvider>
                <AppLayout />
              </OrganizationProvider>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:projectId" element={<ProjectDetails />} />
            <Route path="/members" element={<Members/>} />
            <Route path="/invitations" element={<div>Invitations</div>} />
            <Route path="/settings" element={<div>Settings</div>} />
            <Route path="/profile" element={<div>Profile</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  ); 
}

export default App
