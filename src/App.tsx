import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  has_pages: boolean;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  topics?: string[];
};

type GitHubUser = {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name?: string;
};

type ToastType = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const DAY_IN_MS = 86_400_000;

// Highlight matching text component
const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim()) return <>{text}</>;
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="text-emerald-400 font-bold bg-emerald-400/10 px-0.5 rounded">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

function getPagesUrl(repo: GitHubRepo, owner: string) {
  if (repo.homepage && /^https?:\/\//.test(repo.homepage)) {
    return repo.homepage;
  }
  if (!repo.has_pages) return null;
  if (repo.name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repo.name}/`;
}

function formatRelativeDate(timestamp: string) {
  const days = Math.round((new Date(timestamp).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
}

export function App() {
  // Connection inputs
  const [usernameInput, setUsernameInput] = useState(localStorage.getItem("repo-vault-user") ?? "");
  const [tokenInput, setTokenInput] = useState(localStorage.getItem("repo-vault-token") ?? "");
  
  // Active connection state
  const [username, setUsername] = useState(localStorage.getItem("repo-vault-user") ?? "");
  const [token, setToken] = useState(localStorage.getItem("repo-vault-token") ?? "");
  const [user, setUser] = useState<GitHubUser | null>(null);
  
  // Data state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [readme, setReadme] = useState("");
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(DAY_IN_MS);
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  
  const searchRef = useRef<HTMLInputElement>(null);

  // Show toast helper
  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Keyboard shortcut for search
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  // API Headers helper
  const getHeaders = useCallback((authToken: string): Record<string, string> => {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    return headers;
  }, []);

  // Fetch repositories
  const fetchRepos = useCallback(async (targetUser: string, authToken: string) => {
    if (!targetUser) return;
    
    setLoading(true);
    try {
      const headers = getHeaders(authToken);
      
      let endpoint: string;
      
      if (authToken) {
        endpoint = `https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner`;
      } else {
        endpoint = `https://api.github.com/users/${encodeURIComponent(targetUser)}/repos?sort=updated&per_page=100`;
      }
      
      const response = await fetch(endpoint, { headers });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Invalid token. Please check your Personal Access Token.");
        } else if (response.status === 403) {
          const rateLimitReset = response.headers.get("X-RateLimit-Reset");
          if (rateLimitReset) {
            const resetDate = new Date(parseInt(rateLimitReset) * 1000);
            throw new Error(`Rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}.`);
          }
          throw new Error("API rate limit exceeded or insufficient token permissions.");
        } else if (response.status === 404) {
          throw new Error(`User "${targetUser}" not found.`);
        } else {
          throw new Error(`GitHub API error (${response.status}). Please try again.`);
        }
      }
      
      const payload: GitHubRepo[] = await response.json();
      
      const filtered = authToken 
        ? payload.filter(r => r.full_name.toLowerCase().startsWith(targetUser.toLowerCase() + "/"))
        : payload;
        
      setRepos(filtered);
      setLastSyncedAt(Date.now());
      
      if (filtered.length === 0) {
        showToast("No repositories found for this account.", "info");
      } else {
        showToast(`Loaded ${filtered.length} repositories`, "success");
      }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch repositories";
      showToast(message, "error");
      console.error("Fetch error:", fetchError);
    } finally {
      setLoading(false);
    }
  }, [getHeaders, showToast]);

  // Validate token and get user info
  const validateToken = useCallback(async (authToken: string): Promise<GitHubUser | null> => {
    if (!authToken) return null;
    
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: getHeaders(authToken),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Token is invalid or expired.");
        } else if (response.status === 403) {
          throw new Error("Token lacks required permissions (needs 'read:user' and 'repo' scope).");
        }
        throw new Error("Failed to validate token.");
      }
      
      const userData: GitHubUser = await response.json();
      return userData;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token validation failed";
      showToast(message, "error");
      return null;
    }
  }, [getHeaders, showToast]);

  // Initial load effect
  useEffect(() => {
    if (username) {
      fetchRepos(username, token);
    }
  }, []);

  // Auto-refresh every 24 hours
  useEffect(() => {
    if (!username) return;
    
    const intervalId = setInterval(() => {
      fetchRepos(username, token);
    }, DAY_IN_MS);

    return () => clearInterval(intervalId);
  }, [username, token, fetchRepos]);

  // Countdown timer
  useEffect(() => {
    const countdownId = setInterval(() => {
      if (!lastSyncedAt) {
        setRemainingMs(DAY_IN_MS);
        return;
      }
      const ms = Math.max(DAY_IN_MS - (Date.now() - lastSyncedAt), 0);
      setRemainingMs(ms);
    }, 1_000);

    return () => clearInterval(countdownId);
  }, [lastSyncedAt]);

  // Optimized filter repos using useMemo - instant search
  const filteredRepos = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return repos;
    
    return repos.filter((repo) =>
      repo.name.toLowerCase().includes(normalized) ||
      (repo.description ?? "").toLowerCase().includes(normalized) ||
      (repo.language ?? "").toLowerCase().includes(normalized) ||
      (repo.topics || []).some(t => t.toLowerCase().includes(normalized))
    );
  }, [query, repos]);

  // Open repo detail panel and fetch README
  const openRepoDetail = useCallback(async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setReadmeLoading(true);
    setReadme("");

    try {
      const headers = getHeaders(token);
      const response = await fetch(`https://api.github.com/repos/${repo.full_name}/readme`, { headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          setReadme("This repository does not have a README file.");
        } else if (response.status === 403) {
          setReadme("Access denied. Your token may not have access to this repository's contents.");
        } else {
          setReadme("Unable to load README for this repository.");
        }
        return;
      }

      const data = await response.json();
      const content = atob(data.content.replace(/\n/g, ""));
      setReadme(content);
    } catch {
      setReadme("Failed to load README content.");
    } finally {
      setReadmeLoading(false);
    }
  }, [token, getHeaders]);

  // Handle connect form submission
  const onConnect = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    const inputUser = usernameInput.trim();
    const inputToken = tokenInput.trim();

    if (!inputUser && !inputToken) {
      showToast("Please enter a GitHub username or Personal Access Token", "error");
      return;
    }

    if (inputToken) {
      showToast("Validating token...", "info");
      const validatedUser = await validateToken(inputToken);
      
      if (validatedUser) {
        const confirmedUser = validatedUser.login;
        setUsername(confirmedUser);
        setUser(validatedUser);
        setToken(inputToken);
        setUsernameInput(confirmedUser);
        
        localStorage.setItem("repo-vault-user", confirmedUser);
        localStorage.setItem("repo-vault-token", inputToken);
        
        showToast(`Connected as ${confirmedUser}`, "success");
        await fetchRepos(confirmedUser, inputToken);
      } else {
        if (inputUser) {
          showToast("Token invalid. Trying public access...", "error");
          setUsername(inputUser);
          setToken("");
          setUser(null);
          localStorage.setItem("repo-vault-user", inputUser);
          localStorage.removeItem("repo-vault-token");
          await fetchRepos(inputUser, "");
        }
      }
    } else {
      setUsername(inputUser);
      setToken("");
      setUser(null);
      localStorage.setItem("repo-vault-user", inputUser);
      localStorage.removeItem("repo-vault-token");
      showToast(`Connecting to ${inputUser} (public repos only)...`, "info");
      await fetchRepos(inputUser, "");
    }
  }, [usernameInput, tokenInput, validateToken, fetchRepos, showToast]);

  const disconnect = useCallback(() => {
    setUsername("");
    setToken("");
    setUser(null);
    setRepos([]);
    setUsernameInput("");
    setTokenInput("");
    localStorage.removeItem("repo-vault-user");
    localStorage.removeItem("repo-vault-token");
    showToast("Disconnected successfully", "info");
  }, [showToast]);

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  const displayName = user?.login || username || "OCTOCAT";
  const isConnected = !!username && repos.length > 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20 }}
              className={`pointer-events-auto border bg-black/80 backdrop-blur-sm px-4 py-3 text-sm font-medium tracking-wide ${
                toast.type === "error" ? "border-red-500/50 text-red-200" :
                toast.type === "success" ? "border-emerald-500/50 text-emerald-200" :
                "border-neutral-600 text-neutral-200"
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <main>
        <section className="relative isolate min-h-screen overflow-hidden border-b border-neutral-800 px-6 pb-16 pt-10 md:px-12 lg:px-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.14),transparent_45%),linear-gradient(to_bottom,#000_0%,#090909_55%,#000_100%)]" />
          <div className="poster-grid pointer-events-none absolute inset-0 opacity-30" />

          <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12">
            <motion.header
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">Repo Vault Archive</p>
                {isConnected && user && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-3"
                  >
                    <img 
                      src={user.avatar_url} 
                      alt={user.login}
                      className="w-10 h-10 rounded-full border-2 border-emerald-500/50"
                    />
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">● Connected</div>
                      <div className="text-xs text-neutral-400">@{user.login}</div>
                    </div>
                  </motion.div>
                )}
              </div>
              <h1 className="max-w-4xl font-['Bebas_Neue',sans-serif] text-6xl uppercase leading-[0.9] tracking-tight text-neutral-100 md:text-8xl lg:text-9xl">
                The Source
                <br />
                <span className="text-gray-500">Of Your GitHub</span>
              </h1>
              
              {isConnected && user && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4"
                >
                  <div className="text-sm text-neutral-300">
                    Viewing <span className="text-emerald-400 font-bold">{repos.length}</span> repositories for 
                    <span className="text-emerald-400 font-bold"> @{user.login}</span>
                  </div>
                </motion.div>
              )}
              
              <p className="max-w-2xl text-sm uppercase tracking-[0.2em] text-neutral-300 md:text-base">
                A monochrome explorer for repositories, readmes, live pages, and action pipelines. Auto-synced every 24 hours.
              </p>
            </motion.header>

            <motion.form
              onSubmit={onConnect}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid gap-3 border-y border-neutral-700 py-4 md:grid-cols-[1fr_1fr_auto_auto]"
            >
              <div className="relative">
                <input
                  value={usernameInput}
                  onChange={(event) => !isConnected && setUsernameInput(event.target.value)}
                  className={`h-12 w-full border px-4 text-sm uppercase tracking-[0.12em] outline-none ring-white/70 transition focus:ring-2 placeholder:text-neutral-600 ${
                    isConnected 
                      ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-400 cursor-not-allowed" 
                      : "border-neutral-700 bg-black/50"
                  }`}
                  placeholder={displayName !== "OCTOCAT" ? displayName : "GitHub username"}
                  aria-label="GitHub username"
                  readOnly={isConnected}
                  disabled={isConnected}
                />
                {isConnected && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-emerald-500 text-xs">✓</span>
                  </div>
                )}
              </div>
              
              <div className="relative">
                <input
                  value={tokenInput}
                  onChange={(event) => !isConnected && setTokenInput(event.target.value)}
                  className={`h-12 w-full border px-4 text-sm uppercase tracking-[0.12em] outline-none ring-white/70 transition focus:ring-2 placeholder:text-neutral-600 ${
                    isConnected 
                      ? "border-emerald-500/50 bg-emerald-500/5 cursor-not-allowed" 
                      : "border-neutral-700 bg-black/50"
                  }`}
                  placeholder={isConnected ? "••••••••••••••••••••" : "Personal access token (optional)"}
                  aria-label="Optional GitHub personal access token"
                  type="password"
                  readOnly={isConnected}
                  disabled={isConnected}
                />
                {isConnected && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-emerald-500 text-xs">LOCKED</span>
                  </div>
                )}
              </div>
              
              <button
                type="submit"
                disabled={loading || isConnected}
                className={`h-12 px-6 text-xs font-medium uppercase tracking-[0.24em] transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  isConnected
                    ? "border border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border border-neutral-100 hover:bg-neutral-100 hover:text-black"
                }`}
              >
                {loading ? "Connecting..." : isConnected ? "Connected" : "Connect"}
              </button>
              
              {isConnected && (
                <button
                  type="button"
                  onClick={disconnect}
                  className="h-12 border border-neutral-600 px-4 text-xs uppercase tracking-[0.2em] text-neutral-400 hover:border-red-500/50 hover:text-red-400 transition"
                >
                  Disconnect
                </button>
              )}
            </motion.form>

            <div className="grid gap-5 border-b border-neutral-800 pb-8 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                  Search repositories (Ctrl+K)
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="h-12 w-full border border-neutral-700 bg-black/60 px-4 text-sm uppercase tracking-[0.14em] outline-none ring-emerald-500/30 transition focus:ring-2 focus:border-emerald-500/50 placeholder:text-neutral-600"
                  placeholder={repos.length > 0 ? "Find by name, description, or topic..." : "Connect to search repositories..."}
                  disabled={repos.length === 0 && !loading}
                />
                {query && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-emerald-400 tracking-wider"
                  >
                    {filteredRepos.length} matching result{filteredRepos.length !== 1 ? 's' : ''}
                    {filteredRepos.length > 0 && filteredRepos.length < repos.length && (
                      <span className="text-neutral-500 ml-2">(of {repos.length} total)</span>
                    )}
                  </motion.div>
                )}
              </label>

              <div className="text-right text-xs uppercase tracking-[0.2em] text-neutral-400">
                {lastSyncedAt ? (
                  <p>Next auto-sync in {hours}h {minutes}m</p>
                ) : (
                  <p>Auto-sync every 24h</p>
                )}
                <p className="mt-1 text-neutral-500">Token stays in this browser only</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-12 md:px-12 lg:px-20">
          {loading && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="py-12 text-center"
            >
              <div className="inline-block w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-sm uppercase tracking-[0.25em] text-neutral-400">Syncing repositories...</p>
            </motion.div>
          )}

          {!loading && repos.length === 0 && (
            <div className="py-16 text-center border border-neutral-800/50 border-dashed">
              <p className="text-sm uppercase tracking-[0.25em] text-neutral-500">
                {username ? "No repositories found. Check your username or token permissions." : "Enter your credentials above to view repositories."}
              </p>
            </div>
          )}

          {!loading && repos.length > 0 && (
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
              }}
              className="divide-y divide-neutral-800 border-y border-neutral-800"
            >
              {filteredRepos.map((repo) => {
                const pagesUrl = getPagesUrl(repo, username);
                const queryLower = query.toLowerCase().trim();

                return (
                  <motion.li
                    variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                    key={repo.id}
                    className="grid gap-4 py-4 md:grid-cols-[2fr_1fr_auto] md:items-center hover:bg-white/5 transition-colors px-2 -mx-2"
                  >
                    <div>
                      <button
                        onClick={() => openRepoDetail(repo)}
                        className="text-left font-['Bebas_Neue',sans-serif] text-3xl uppercase leading-none tracking-wide text-neutral-100 transition hover:text-emerald-400 hover:translate-x-1 transform duration-200"
                      >
                        <HighlightText text={repo.name} query={queryLower} />
                      </button>
                      <p className="mt-1 text-sm text-neutral-400 line-clamp-2">
                        {repo.description ? (
                          <HighlightText text={repo.description} query={queryLower} />
                        ) : (
                          "No description available."
                        )}
                      </p>
                    </div>

                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                      <p>{repo.language ?? "No primary language"}</p>
                      <p>{repo.stargazers_count.toLocaleString()} stars</p>
                      <p>Updated {formatRelativeDate(repo.updated_at)}</p>
                    </div>

                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      {pagesUrl && (
                        <a
                          href={pagesUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="border border-neutral-600 px-3 py-2 text-xs uppercase tracking-[0.18em] transition hover:border-emerald-500 hover:bg-emerald-500 hover:text-black"
                        >
                          Open site
                        </a>
                      )}
                      <a
                        href={`https://github.com/${repo.full_name}/actions`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="border border-neutral-600 px-3 py-2 text-xs uppercase tracking-[0.18em] transition hover:border-neutral-100 hover:bg-neutral-100 hover:text-black"
                      >
                        Actions
                      </a>
                      <a
                        href={repo.html_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="border border-neutral-600 px-3 py-2 text-xs uppercase tracking-[0.18em] transition hover:border-neutral-100 hover:bg-neutral-100 hover:text-black"
                      >
                        Repo
                      </a>
                    </div>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </section>
      </main>

      <AnimatePresence>
        {selectedRepo && (
          <motion.aside
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-hidden border-l border-neutral-700 bg-black"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between border-b border-neutral-800 p-6">
                <div className="pr-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Repository Detail</p>
                  <h2 className="font-['Bebas_Neue',sans-serif] text-5xl uppercase tracking-wide break-words">{selectedRepo.name}</h2>
                  <p className="text-sm text-neutral-400 mt-1">{selectedRepo.description ?? "No description available."}</p>
                  <div className="mt-2 flex gap-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
                    <span>{selectedRepo.language ?? "No language"}</span>
                    <span>•</span>
                    <span>{selectedRepo.stargazers_count.toLocaleString()} stars</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRepo(null)}
                  className="border border-neutral-700 px-4 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-neutral-100 shrink-0"
                >
                  Close
                </button>
              </div>

              <div className="overflow-y-auto p-6 flex-1">
                {readmeLoading ? (
                  <div className="space-y-3">
                    <div className="h-4 bg-neutral-800 rounded animate-pulse w-3/4" />
                    <div className="h-4 bg-neutral-800 rounded animate-pulse w-1/2" />
                    <div className="h-4 bg-neutral-800 rounded animate-pulse w-5/6" />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-300">{readme}</pre>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
