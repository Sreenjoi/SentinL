const fs = require('fs');
let code = fs.readFileSync('src/components/Login.tsx', 'utf8');

const newReturn = `  return (
    <div className="min-h-screen bg-bg-base flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-on-surface relative">
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[40vw] h-[40vw] rounded-full bg-primary-container/20 blur-[100px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-secondary-container/20 blur-[120px] pointer-events-none"></div>
      </div>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center items-center gap-4 font-extrabold text-4xl tracking-tight mb-2 font-sans">
          <Logo className="w-12 h-12 text-primary drop-shadow-sm flex-shrink-0" />
          <span className="text-on-surface">
            SentinL
          </span>
        </div>
        <h2 className="mt-2 text-center text-sm font-medium text-text-secondary">
          {isLogin ? "Sign in to the Admin Dashboard" : "Create a new account"}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-surface/80 backdrop-blur-xl border border-outline-variant/50 p-8 sm:p-10 w-full max-w-md shadow-2xl shadow-primary/5 rounded-[2rem]">
          {/* Tabs */}
          <div className="flex mb-8 bg-surface-variant/40 p-1 rounded-xl border border-outline-variant/30">
            <button
              type="button"
              className={\`flex-1 py-2.5 text-xs font-bold tracking-wide rounded-lg transition-all duration-200 ease-out \${isLogin ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-on-surface hover:bg-surface/50"}\`}
              onClick={() => {
                setIsLogin(true);
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={\`flex-1 py-2.5 text-xs font-bold tracking-wide rounded-lg transition-all duration-200 ease-out \${!isLogin ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-on-surface hover:bg-surface/50"}\`}
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
            >
              Sign Up
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl text-xs font-medium text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 pl-1">
                Email Address
              </label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-surface-variant/30 border border-outline-variant/50 rounded-xl px-4 py-3 text-sm font-medium text-on-surface placeholder:text-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 w-full transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5 pl-1">
                Password
              </label>
              <div className="mt-1">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-surface-variant/30 border border-outline-variant/50 rounded-xl px-4 py-3 text-sm font-medium text-on-surface placeholder:text-text-muted/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 w-full transition-all duration-200"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold tracking-wide bg-primary text-white hover:bg-primary/90 transition-all duration-200 ease-out items-center shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin text-white" />
                ) : isLogin ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </button>
            </div>
          </form>

          <div className="mt-8">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-outline-variant/30" />
              </div>
              <div className="relative flex justify-center text-xs font-medium">
                <span className="px-3 bg-surface text-text-muted">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-8">
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                type="button"
                className="w-full flex justify-center py-3 px-4 rounded-xl text-sm font-semibold tracking-wide border border-outline-variant/80 text-on-surface bg-surface-container/50 hover:bg-surface-variant/80 transition-all duration-200 ease-out disabled:opacity-50 items-center active:scale-[0.98]"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Google
              </button>
            </div>
            
            <p className="mt-8 text-xs text-center text-text-muted leading-relaxed">
              By continuing you agree to SentinL's{" "}
              <Link to="/terms" className="text-primary hover:underline font-semibold">Terms of Service</Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:underline font-semibold">Privacy Policy</Link>.
            </p>
          </div>
        </div>
        
        {/* Footer Links */}
        <div className="mt-8 text-center text-xs font-medium text-text-muted flex items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          <span className="opacity-30">•</span>
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
`;

const startIndex = code.indexOf('  return (\n    <div className="min-h-screen bg-surface-container/30');
if (startIndex !== -1) {
  code = code.substring(0, startIndex) + newReturn;
  fs.writeFileSync('src/components/Login.tsx', code, 'utf8');
  console.log('done');
} else {
  console.error('Could not find start index');
}
