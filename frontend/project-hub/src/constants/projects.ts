import type { Project } from "../api/projects";

export const sortProjects = (projects: Project[]) => 
    [...projects].sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }),     
    ); 