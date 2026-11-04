import { useQuery } from "@tanstack/react-query";
import { getMe } from "../api/auth";

export function useCurrentUser() {
    const token = localStorage.getItem("token");

    return useQuery({
        queryKey: ["me", token],
        queryFn: getMe,
        enabled: !!token,
        staleTime: Infinity,
    });
}