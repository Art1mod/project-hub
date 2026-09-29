import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar / Navigation */}
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<div>Dashboard</div>} />
          <Route path="/projects" element={<div>Projects</div>} />
          <Route path="/projects/:projectId" element={<div>Project Details</div>} />
          <Route path="/members" element={<div>Members</div>} />
          <Route path="/invitations" element={<div>Invitations</div>} />
          <Route path="/settings" element={<div>Settings</div>} />
          <Route path="/profile" element={<div>Profile</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  ); 
}

export default App
