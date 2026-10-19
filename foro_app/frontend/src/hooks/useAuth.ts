/**
 * Reexporta o hook de autenticação definido em context/AuthContext.tsx.
 * Mantido como um módulo próprio em hooks/ para quem espera encontrá-lo aqui;
 * a lógica (contexto, estado, login/register/logout) vive só em um lugar.
 */
export { useAuth } from '../context/AuthContext'
