import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { useState } from 'react';
import { Modal } from '../components/Modal';

export function AppLayout() {
    const token = localStorage.getItem('token');
    const { organizations, activeOrgId, setActiveOrgId, isLoading } = useOrganization();
    const navigate = useNavigate();

    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

    if (!token) {
        return <Navigate replace to="/login" />
    }

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `block px-3 py-2 rounded-md transition-colors ${
            isActive
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
        }`;

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };
    
    return (
        <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
            {/* Sidebar */}
            <aside className="w-64 bg-zinc-950 p-4 border-r border-white/10 flex flex-col">
                <div className="mb-6 pb-6 border-b border-white/10">
                    <h2 className="px-3 text-2xl font-bold tracking-tight text-white mb-6">TaskFlow</h2>
                    
                    <div className="px-3 flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                            Organization
                        </label>
                        {isLoading ? (
                            <div className="text-sm text-zinc-400 animate-pulse py-2">Loading...</div>        
                        ) : (
                            <select 
                                value={activeOrgId || ""} 
                                onChange={(e) => setActiveOrgId(e.target.value)}
                                className="w-full bg-zinc-900 border border-white/10 rounded-md p-2 text-sm text-zinc-100 outline-none focus:border-violet-500 hover:border-white/20 transition-colors cursor-pointer appearance-none"
                            >
                                {organizations?.length === 0 && (
                                    <option value="" disabled>No organizations</option>
                                )}
                                {organizations?.map((org: any) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name} 
                                    </option>
                                ))}
                            </select>    
                        )}
                    </div>
                </div>

                <nav className="flex flex-col gap-1 flex-1">
                    <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                    <NavLink to="/projects" className={navLinkClass}>Projects</NavLink>
                    <NavLink to="/members" className={navLinkClass}>Members</NavLink>
                    <NavLink to="/invitations" className={navLinkClass}>Invitations</NavLink>
                    <NavLink to="/settings" className={navLinkClass}>Settings</NavLink>
                </nav>

                {/* Profile / Logout area at the bottom */}
                <div className="flex flex-col gap-1 mt-auto pt-4 border-t border-white/10">
                     <NavLink to="/profile" className={navLinkClass}>Profile</NavLink>
                     <button
                        onClick={() => setIsLogoutModalOpen(true)}
                        className="w-full text-left block px-3 py-2 rounded-md transition-colors text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                     >
                        Log Out
                     </button>
                </div>
            </aside>
            
            {/* Main content area */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                    <Outlet />
                </div>
            </main>

            {/* The Logout Confirmation Modal */}
            <Modal 
                isOpen={isLogoutModalOpen} 
                onClose={() => setIsLogoutModalOpen(false)} 
                title="Confirm Logout"
            >
                <div className="text-zinc-300 mb-6">
                    Are you sure you want to log out of TaskFlow? You will need to sign in again to access your projects.
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsLogoutModalOpen(false)}
                        className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleLogout}
                        className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] transition-all"
                    >
                        Log Out
                    </button>
                </div>
            </Modal>
        </div>
    );
}