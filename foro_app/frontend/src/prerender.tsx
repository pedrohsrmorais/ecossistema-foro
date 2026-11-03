import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import HomeContent from './pages/legal/HomeContent'
import Privacidade from './pages/legal/Privacidade'
import Termos from './pages/legal/Termos'

/** Pré-renderização das 3 páginas públicas: o HTML cru já traz texto e links (robôs e verificadores do Google não executam JS). */
const PAGES = {
  home: { path: '/', el: <HomeContent />, title: 'Foro — gestão para escritórios de advocacia', description: 'Foro: CRM comercial, processos, documentos, agenda, quadros e assistente de IA para escritórios de advocacia.' },
  privacidade: { path: '/privacidade', el: <Privacidade />, title: 'Política de Privacidade — Foro', description: 'Como o Foro trata os seus dados, inclusive os dados do Google Agenda, e quais são os seus direitos.' },
  termos: { path: '/termos', el: <Termos />, title: 'Termos de Serviço — Foro', description: 'Termos de uso do Foro, plataforma de gestão para escritórios de advocacia.' },
}

export function renderAll() {
  return Object.fromEntries(Object.entries(PAGES).map(([k, p]) => [k, {
    path: p.path, title: p.title, description: p.description,
    html: renderToString(<StaticRouter location={p.path}>{p.el}</StaticRouter>),
  }]))
}
