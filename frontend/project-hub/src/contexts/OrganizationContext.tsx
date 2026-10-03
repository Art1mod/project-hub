import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getOrganizations } from "../api/projects";
import { useQuery } from "@tanstack/react-query";

interface Organization {
    id: string;
    name: string;
}

interface OrganizationContextType {
    activeOrgId: string | null;
    setActiveOrgId: (id: string) => void;
    isLoading: boolean;
    organizations: Organization[];      
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({children}: {children: ReactNode}) {
    const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

    const {data: orgs, isLoading} = useQuery({
            queryKey: ['organizations'],
            queryFn: getOrganizations, 
    });
    
    useEffect(() => {
        if(orgs && orgs.length > 0 && !activeOrgId) {
            setActiveOrgId(orgs[0].id);    
        }
    }, [orgs, activeOrgId]
    );

    const valueToShare = {
        organizations: orgs || [],
        activeOrgId,
        setActiveOrgId,
        isLoading
    }

    return (
        <OrganizationContext.Provider 
            value={valueToShare}
        >
            {children}
        </OrganizationContext.Provider>
    );
}

export function useOrganization() {
    const context = useContext(OrganizationContext);
    if (context === undefined) {
        throw new Error("useOrganization must be used within an OrganizationProvider");
    }
    return context;
}