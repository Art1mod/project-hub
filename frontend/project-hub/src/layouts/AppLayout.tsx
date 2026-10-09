import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { createOrganization, type Organization } from '../api/organizations';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function AppLayout() {
    const token = localStorage.getItem('token');
    const { organizations, activeOrgId, setActiveOrgId, isLoading } = useOrganization();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
    const [name, setName] = useState("");

    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isCreateOrgModalOpen) nameInputRef.current?.focus();
    }, [isCreateOrgModalOpen]);

    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `block px-3 py-2 rounded-md transition-colors ${
            isActive
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
        }`;
    
    const closeCreateOrgModal = () => {
        setIsCreateOrgModalOpen(false);
        setName('');
        createOrganizationMutation.reset(); 
    };

    const createOrganizationMutation = useMutation({
            mutationFn: (name:string) => createOrganization(name),
            onSuccess: async (newOrg) => {
                await queryClient.invalidateQueries({queryKey: ['organizations']});
                setActiveOrgId(newOrg.id);
                closeCreateOrgModal();
            },   
        });

    
    if (!token) {
        return <Navigate replace to="/login" />
    }

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const handleCreateOrganization = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        createOrganizationMutation.mutate(name.trim());
    }
    
    return (
        <div className="flex min-h-screen bg-zinc-950 text-zinc-50">
            {/* Sidebar */}
            <aside className="w-64 bg-zinc-950 p-4 border-r border-white/10 flex flex-col">
                <div className="mb-6 pb-6 border-b border-white/10">
                    <h2 className="px-3 text-2xl font-bold tracking-tight text-white mb-6">Project HUB</h2>
                    
                    <div className="px-3 flex flex-col gap-1.5">
                        <div className="px-3 flex items-center justify-between mb-2"> 
    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        Organization 
    </label>
    <button 
        type="button"
        title="Create new organization"
        className="flex items-center justify-center w-5 h-5 rounded-md text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors outline-none focus:ring-1 focus:ring-violet-500"
        aria-label="Create new organization"
        onClick={() => setIsCreateOrgModalOpen(true)}
    > +
    </button>
</div>
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
                                {organizations?.map((org: Organization) => (
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

{/* The Modal and Form */}
            <Modal 
                isOpen={isCreateOrgModalOpen} 
                onClose={closeCreateOrgModal} 
                title="Create New Organization"
            >
                <form onSubmit={handleCreateOrganization} className="flex flex-col gap-4 mt-2 text-zinc-50">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm text-zinc-400">Name</label>
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={name}
                            onChange={(e)=> setName(e.target.value)}
                            className="bg-zinc-950 border border-white/10 rounded-md p-2 outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            onClick={closeCreateOrgModal}
                            className="px-4 py-2 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={createOrganizationMutation.isPending}
                            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-md shadow-[0_0_15px_rgba(124,58,237,0.3)] hover:shadow-[0_0_25px_rgba(124,58,237,0.5)] transition-all disabled:opacity-50"
                        >
                            {createOrganizationMutation.isPending ? "Creating..." : "Create Organization"}
                        </button>
                    </div>

                    {createOrganizationMutation.isError && <p className="text-sm text-red-400">Could not create organization.</p>}
                </form>
            </Modal>            
        </div>
    );
}