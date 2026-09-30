import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";

export function Login() {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const data = await login({email, password});
            localStorage.setItem('token', data.access_token);
            navigate('/dashboard');

        } catch (err) {
            console.error("Login failed", err);    
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
            {/* The Card */}
            <div className="bg-zinc-900 border border-white/10 p-8 rounded-xl w-full max-w-md">
                <h1 className="text-2xl font-bold text-white mb-6">Log in</h1>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-zinc-950 border border-white/10 rounded-md p-2 text-white"
                        placeholder="Email ..."
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-zinc-950 border border-white/10 rounded-md p-2 text-white"
                        placeholder="Password ..."
                    />
                    <button
                        type="submit"
                        className="bg-white text-black font-medium py-2 rounded-md hover:bg-zinc-200 transition-colors"
                    >
                        Sign In
                    </button>
                </form>   
            </div>    
        </div>
    );
}