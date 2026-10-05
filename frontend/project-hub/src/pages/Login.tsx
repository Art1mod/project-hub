import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";

export function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);
        
        try {
            const data = await login({ email, password });
            localStorage.setItem('token', data.access_token);
            navigate('/dashboard');
        } catch (err) {
            console.error("Login failed", err);
            setError("Invalid email or password.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
            <div className="bg-zinc-900 border border-white/10 p-8 rounded-xl w-full max-w-md shadow-2xl">
                <h1 className="text-2xl font-bold text-white mb-6">Log in to TaskFlow</h1>
                
                {error && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-zinc-950 border border-white/10 rounded-md p-2.5 text-white outline-none focus:border-violet-500 transition-colors"
                        placeholder="Email"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-zinc-950 border border-white/10 rounded-md p-2.5 text-white outline-none focus:border-violet-500 transition-colors"
                        placeholder="Password"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="mt-2 bg-white text-black font-medium py-2.5 rounded-md hover:bg-zinc-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-zinc-400">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
                        Sign up
                    </Link>
                </div>
            </div>    
        </div>
    );
}