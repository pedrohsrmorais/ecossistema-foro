import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import HomeContent from './HomeContent'

/** Página inicial pública (a mesma usada como "Página inicial do aplicativo" na tela de consentimento do Google). Quem está logado vai ao Painel. */
export default function Home() {
  const { user, isLoading } = useAuth()
  useEffect(() => { document.title = 'Foro — gestão para escritórios de advocacia' }, [])
  if (!isLoading && user) return <Navigate to="/dashboard" replace />
  return <HomeContent />
}
