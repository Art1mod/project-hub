import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:3000', 
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {

      const isAuthRequest = error.config?.url?.includes('login') || error.config?.url?.includes('register');
      
      if (error.response && error.response.status === 401 && !isAuthRequest) {
          console.warn('Token expired or unauthorized. Redirecting to login.');
          localStorage.removeItem('token');
          if (window.location.pathname !== '/login') window.location.href = '/login'; 
      }
        
      return Promise.reject(error);
    }
);