import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Sun, Moon } from 'lucide-react'

type Theme = 'light' | 'dark'
const KEY = 'foro_theme'
const ThemeContext = createContext<{ theme: Theme; setTheme: (value: Theme) => void }>({ theme: 'light', setTheme: () => {} })

function initialTheme(): Theme {
  try { const saved = localStorage.getItem(KEY); if (saved === 'dark' || saved === 'light') return saved } catch { /* Private browsers may block storage. */ }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { localStorage.setItem(KEY, theme) } catch { /* The selected theme still applies for this session. */ }
  }, [theme])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return <button type="button" className="theme-toggle" aria-label={`Ativar modo ${dark ? 'claro' : 'escuro'}`} title={`Ativar modo ${dark ? 'claro' : 'escuro'}`} onClick={() => setTheme(dark ? 'light' : 'dark')}>
    {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}<span>{dark ? 'Claro' : 'Escuro'}</span>
  </button>
}
