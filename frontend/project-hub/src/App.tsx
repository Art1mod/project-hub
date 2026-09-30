import { BrowserRouter, Routes, Route, Navigate} from 'react-router-dom';
import {AppLayout} from './layouts/AppLayout'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Projects } from './pages/Projects';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}> 
      <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/projects" element={<Projects/>} />
          <Route path="/projects/:projectId" element={<div>Project Details</div>} />
          <Route path="/members" element={<div>Members</div>} />
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
