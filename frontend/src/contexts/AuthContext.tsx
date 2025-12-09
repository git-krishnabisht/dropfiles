import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";

const baseURL = import.meta.env.VITE_BASE_URL;

type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signup: (email: string, name: string, password: string) => Promise<void>;
  signin: (
    email: string,
    password: string,
    rememberMe: boolean
  ) => Promise<void>;
  signout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const authenticate = async () => {
      try {
        const res = await fetch(baseURL + "/auth/authenticate", {
          method: "GET",
          credentials: "include",
        });

        if (res.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    authenticate();
  }, []);

  const signup = async (email: string, name: string, password: string) => {
    try {
      console.log("Sign up has started");

      const res = await fetch(baseURL + "/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: { email, name, password },
        }),
      });

      if (!res.ok) throw new Error("Registration failed miserably");
      console.log("Sign up successfull");
      setIsAuthenticated(true);
    } catch (err) {
      console.log("Something is wrong", err);
    }
  };

  const signin = async (
    email: string,
    password: string,
    rememberMe: boolean
  ) => {
    try {
      const res = await fetch(import.meta.env.VITE_BASE_URL + "/auth/signin", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: { email, password },
          rememberMe,
        }),
      });

      if (!res.ok) throw new Error("Sign in failed miserably");
      console.log("Sign in successfull");
      setIsAuthenticated(true);
    } catch (err) {
      throw new Error("Something has gone wrong");
    }
  };

  const signout = async () => {
    try {
      await fetch(`${baseURL}/auth/signout`, {
        method: "GET",
        credentials: "include",
      });
      setIsAuthenticated(false);
    } catch (err) {
      throw new Error("Something has gone wrong");
    }
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, signup, signin, signout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
