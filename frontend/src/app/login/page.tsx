"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await login(username, password);
      if (rememberPassword) {
        localStorage.setItem("remembered_username", username);
      } else {
        localStorage.removeItem("remembered_username");
      }
    } catch (err: any) {
      setError(err.message || "Đăng nhập thất bại");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <meta charSet="utf-8" />
      <meta content="width=device-width, initial-scale=1.0" name="viewport" />
      <title>Commun - Đăng nhập</title>
      {/* Google Fonts & Material Symbols */}
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html:
            "\n        .material-symbols-outlined {\n            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;\n        }\n    ",
        }}
      />
      
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
        <main className="w-full max-w-[440px] bg-surface-container-lowest rounded-xl border border-surface-variant shadow-login p-xl flex flex-col gap-lg relative overflow-hidden">
          {/* Decorative Header Accent */}
          <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
          {/* Brand Header */}
          <div className="flex flex-col items-center justify-center text-center gap-xs mb-sm">
            <div className="w-12 h-12 bg-primary-fixed rounded-full flex items-center justify-center text-primary mb-sm">
              <span
                className="material-symbols-outlined"
                data-icon="forum"
                style={{ fontSize: 28 }}
              >
                forum
              </span>
            </div>
            <h1 className="font-h1-display text-h1-display text-on-surface tracking-tight">
              Commun
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Đăng nhập để tiếp tục trò chuyện
            </p>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          
          {/* Login Form */}
          <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
            {/* Email/Phone Field */}
            <div className="flex flex-col gap-xs">
              <label
                className="font-label-caps text-label-caps text-on-surface-variant uppercase"
                htmlFor="identifier"
              >
                TÊN ĐĂNG NHẬP
              </label>
              <div className="relative flex items-center">
                <span
                  className="material-symbols-outlined absolute left-md text-outline-variant pointer-events-none"
                  data-icon="person"
                >
                  person
                </span>
                <input
                  className="w-full h-12 pl-md-44px pr-md rounded bg-surface-bright border border-outline-variant text-on-surface placeholder:text-outline-variant focus-border-primary focus-ring-primary outline-none transition-all font-body-md text-body-md"
                  id="identifier"
                  placeholder="Nhập tên đăng nhập của bạn"
                  required
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
            {/* Password Field */}
            <div className="flex flex-col gap-xs">
              <div className="flex justify-between items-center">
                <label
                  className="font-label-caps text-label-caps text-on-surface-variant uppercase"
                  htmlFor="password"
                >
                  MẬT KHẨU
                </label>
                <a
                  className="font-label-caps text-label-caps text-primary hover-text-on-primary-fixed-variant transition-colors"
                  href="#"
                >
                  Quên mật khẩu?
                </a>
              </div>
              <div className="relative flex items-center">
                <span
                  className="material-symbols-outlined absolute left-md text-outline-variant pointer-events-none"
                  data-icon="lock"
                >
                  lock
                </span>
                <input
                  className="w-full h-12 pl-md-44px pr-md rounded bg-surface-bright border border-outline-variant text-on-surface placeholder:text-outline-variant focus-border-primary focus-ring-primary outline-none transition-all font-body-md text-body-md"
                  id="password"
                  placeholder="Nhập mật khẩu của bạn"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center gap-sm mt-xs">
                <input
                  className="w-4 h-4 rounded border-outline-variant text-primary focus-ring-primary focus-ring-offset-surface-container-lowest bg-surface-bright transition-all"
                  id="remember_password"
                  type="checkbox"
                  checked={rememberPassword}
                  onChange={(e) => setRememberPassword(e.target.checked)}
                  disabled={isLoading}
                />
                <label
                  className="font-body-md text-body-md text-on-surface-variant cursor-pointer select-none"
                  htmlFor="remember_password"
                >
                  Ghi nhớ mật khẩu
                </label>
              </div>
            </div>
            {/* Submit Button */}
            <button
              className="w-full h-12 mt-xs bg-primary text-on-primary font-body-md text-body-md font-semibold rounded hover-bg-on-primary-fixed-variant focus-ring-primary focus-ring-offset-surface-container-lowest outline-none transition-all flex items-center justify-center gap-sm disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Đang đăng nhập...
                </>
              ) : (
                <>
                  Đăng nhập
                  <span
                    className="material-symbols-outlined"
                    data-icon="arrow_forward"
                    style={{ fontSize: 18 }}
                  >
                    arrow_forward
                  </span>
                </>
              )}
            </button>
          </form>
          {/* Divider */}
          {/* Social Logins */}
          {/* Footer Link */}
          <div className="text-center mt-sm mt-md">
            <span className="font-body-md text-body-md text-on-surface-variant">
              Chưa có tài khoản?{" "}
            </span>
            <Link
              className="font-body-md text-body-md text-primary font-semibold hover-text-on-primary-fixed-variant transition-colors"
              href="/register"
            >
              Tạo tài khoản mới
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
