import { api } from '../lib/api';

export interface CurrentUser {
    id: string;
    email: string;
}

export const login = async ({email, password}: {email: string, password: string}) => {
    const response = await api.post('/auth/login', {email, password});
    return response.data;
}

export const register = async ({email, password}: {email: string, password: string}) => {
    const response = await api.post('/auth/register', {email, password});
    return response.data;
}

export const getMe = async (): Promise<CurrentUser> => {
    const { data } = await api.get<CurrentUser>("/auth/me");
    return data;
};