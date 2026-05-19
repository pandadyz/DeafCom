"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, User } from "@/services/api";

interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      apiClient.setToken(token);
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const userData = await apiClient.getCurrentUser();
      setUser(userData);
    } catch (error) {
      console.error("Failed to fetch user:", error);
      const message = error instanceof Error ? error.message : "";
      const isUnauthorized = message.includes("401") || message.includes("invalid_token");
      const isNetworkError = message.includes("NETWORK_ERROR") || message.includes("Failed to fetch");

      if (isUnauthorized) {
        // Token is invalid/expired -> force fresh login.
        localStorage.removeItem("access_token");
        apiClient.setToken(null);
        setUser(null);
      } else if (isNetworkError) {
        // Keep current token for retry when backend comes back.
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const data = await apiClient.login(username, password);
      localStorage.setItem("access_token", data.access_token);
      apiClient.setToken(data.access_token);
      setUser(data.user);
      router.push("/messenger");
    } catch (error) {
      throw error;
    }
  };

  const register = async (username: string, password: string) => {
    try {
      const data = await apiClient.register(username, password);
      localStorage.setItem("access_token", data.access_token);
      apiClient.setToken(data.access_token);
      setUser(data.user);
      router.push("/messenger");
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    apiClient.setToken(null);
    setUser(null);
    router.push("/");
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
